/**
 * Enhanced error handling patterns for Appwrite functions with exponential backoff
 */

/**
 * Create a timeout protection wrapper for promises
 * @param {Promise} promise - Promise to wrap with timeout
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operation - Operation description for error messages
 * @returns {Promise} Promise that rejects on timeout
 */
export function withTimeout(promise, timeoutMs, operation) {
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)), timeoutMs)
    );

    return Promise.race([promise, timeoutPromise]);
}

/**
 * Calculate exponential backoff delay with jitter
 * @param {number} attempt - Current attempt number (1-based)
 * @param {number} baseDelayMs - Base delay in milliseconds (default: 1000)
 * @param {number} maxDelayMs - Maximum delay in milliseconds (default: 30000)
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoffDelay(attempt, baseDelayMs = 1000, maxDelayMs = 30000) {
    const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    const delayWithJitter = exponentialDelay + jitter;

    return Math.min(delayWithJitter, maxDelayMs);
}

/**
 * Determine if an error is retryable
 * @param {Error} error - Error to check
 * @returns {boolean} True if error is retryable
 */
export function isRetryableError(error) {
    if (!error) return false;

    // Network errors that are typically transient
    const retryablePatterns = [
        /ECONNRESET/i,
        /ECONNREFUSED/i,
        /ETIMEDOUT/i,
        /ENOTFOUND/i,
        /socket hang up/i,
        /network timeout/i,
        /fetch failed/i,
        /request timeout/i
    ];

    // HTTP status codes that are retryable
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];

    const errorMessage = error.message || '';
    const isNetworkError = retryablePatterns.some(pattern => pattern.test(errorMessage));
    const isRetryableStatus = error.status && retryableStatusCodes.includes(error.status);

    return isNetworkError || isRetryableStatus;
}


/**
 * Execute API call with timeout and enhanced exponential backoff retry logic
 * @param {Function} apiCall - API call function
 * @param {Array} args - Arguments for API call
 * @param {Object} context - Appwrite function context
 * @param {number} timeoutMs - Timeout in milliseconds (default: 15000)
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise} API call result or null on failure
 */
export async function executeApiCallWithTimeout(apiCall, args, context, timeoutMs = 15000, maxRetries = 3) {
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            const result = await withTimeout(apiCall(...args), timeoutMs, 'API call');

            if (attempt > 1) {
                context.log('API call succeeded after retry', {
                    attempt,
                    totalRetries: attempt - 1,
                    totalTimeMs: Date.now() - startTime,
                    success: true
                });
            }

            return result;
        } catch (error) {
            const isRetryable = isRetryableError(error);
            const isLastAttempt = attempt > maxRetries;

            context.error(`API call failed (attempt ${attempt}/${maxRetries + 1})`, {
                error: error instanceof Error ? error.message : 'Unknown error',
                isRetryable,
                isLastAttempt,
                errorType: error.constructor.name
            });

            if (!isLastAttempt && isRetryable) {
                const delayMs = calculateBackoffDelay(attempt);
                context.log(`Retrying with exponential backoff in ${delayMs}ms...`, {
                    attempt,
                    delayMs,
                    nextAttempt: attempt + 1,
                    backoffStrategy: 'exponential-with-jitter'
                });
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } else if (!isLastAttempt && !isRetryable) {
                context.error('Non-retryable error encountered - stopping retry attempts', {
                    error: error.message,
                    totalAttempts: attempt,
                    totalTimeMs: Date.now() - startTime
                });
                return null;
            } else {
                context.error('API call failed after all retry attempts', {
                    totalAttempts: attempt,
                    maxRetries,
                    totalTimeMs: Date.now() - startTime,
                    finalError: error.message
                });
                return null;
            }
        }
    }
}

/**
 * Handle errors with proper logging and continuation
 * @param {Error} error - Error object
 * @param {string} operation - Operation that failed
 * @param {Object} context - Appwrite function context
 * @param {Object} metadata - Additional metadata to log
 * @param {boolean} shouldThrow - Whether to re-throw the error (default: false)
 */
export function handleError(error, operation, context, metadata = {}, shouldThrow = false) {
    context.error(`${operation} failed`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        ...metadata
    });
    
    if (shouldThrow) {
        throw error;
    }
}

/**
 * Environment variable validation helper
 * @param {Array} requiredVars - Array of required environment variable names
 * @param {Object} context - Appwrite function context
 * @throws {Error} If required variables are missing
 */
export function validateEnvironmentVariables(requiredVars, context) {
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        const error = new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        context.error('Environment validation failed', {
            missingVars,
            requiredVars
        });
        throw error;
    }
    
    context.log('Environment variables validated successfully', {
        validatedVars: requiredVars
    });
}

/**
 * Rate limiting delay helper
 * @param {number} delayMs - Delay in milliseconds
 * @param {Object} context - Appwrite function context
 * @param {string} reason - Reason for delay
 * @returns {Promise} Promise that resolves after delay
 */
export function rateLimit(delayMs, context, reason = 'API rate limiting') {
    context.log(`Applying rate limit delay: ${delayMs}ms`, { reason });
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * Monitor memory usage and trigger cleanup if needed
 * @param {Object} context - Appwrite function context for logging
 * @param {number} warningThresholdMB - Warning threshold in MB (default: 400)
 * @param {number} criticalThresholdMB - Critical threshold in MB (default: 600)
 * @returns {Object} Memory usage information
 */
export function monitorMemoryUsage(context, warningThresholdMB = 400, criticalThresholdMB = 600) {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
    const externalMB = Math.round(memoryUsage.external / 1024 / 1024);
    const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);

    const memoryInfo = {
        heapUsedMB,
        heapTotalMB,
        externalMB,
        rssMB,
        warningLevel: heapUsedMB >= warningThresholdMB,
        criticalLevel: heapUsedMB >= criticalThresholdMB
    };

    if (memoryInfo.criticalLevel) {
        context.error('Critical memory usage detected', {
            ...memoryInfo,
            action: 'Consider triggering garbage collection or reducing data processing batch size'
        });
    } else if (memoryInfo.warningLevel) {
        context.log('High memory usage warning', {
            ...memoryInfo,
            action: 'Monitor closely for potential memory issues'
        });
    }

    return memoryInfo;
}

/**
 * Force garbage collection and log memory cleanup results
 * @param {Object} context - Appwrite function context for logging
 * @returns {Object} Memory usage before and after cleanup
 */
export function forceGarbageCollection(context) {
    const beforeMemory = process.memoryUsage();
    const beforeHeapMB = Math.round(beforeMemory.heapUsed / 1024 / 1024);

    if (global.gc) {
        global.gc();
        const afterMemory = process.memoryUsage();
        const afterHeapMB = Math.round(afterMemory.heapUsed / 1024 / 1024);
        const freedMB = beforeHeapMB - afterHeapMB;

        context.log('Forced garbage collection completed', {
            beforeHeapMB,
            afterHeapMB,
            freedMB,
            gcAvailable: true
        });

        return { beforeMemory, afterMemory, freedMB };
    } else {
        context.log('Garbage collection not available (--expose-gc not set)', {
            currentHeapMB: beforeHeapMB,
            gcAvailable: false
        });

        return { beforeMemory, afterMemory: beforeMemory, freedMB: 0 };
    }
}