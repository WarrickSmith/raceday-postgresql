/**
 * Enhanced error handling patterns for meeting-status-poller function with exponential backoff
 * Optimized for s-1vcpu-1gb specification and 300s timeout
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
 * Calculate exponential backoff delay with jitter for meeting-status-poller
 * @param {number} attempt - Current attempt number (1-based)
 * @param {number} baseDelayMs - Base delay in milliseconds (default: 500ms for lighter workload)
 * @param {number} maxDelayMs - Maximum delay in milliseconds (default: 15s for 300s timeout)
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoffDelay(attempt, baseDelayMs = 500, maxDelayMs = 15000) {
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

    // HTTP status codes that are retryable (including NZ TAB API specific codes)
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];

    const errorMessage = error.message || '';
    const isNetworkError = retryablePatterns.some(pattern => pattern.test(errorMessage));
    const isRetryableStatus = error.status && retryableStatusCodes.includes(error.status);

    return isNetworkError || isRetryableStatus;
}

/**
 * Execute NZ TAB API call with timeout and enhanced exponential backoff retry logic
 * Optimized for meeting-status-poller's lighter workload and 300s timeout
 * @param {Function} apiCall - API call function
 * @param {Array} args - Arguments for API call
 * @param {Object} context - Appwrite function context
 * @param {number} timeoutMs - Timeout in milliseconds (default: 10000ms)
 * @param {number} maxRetries - Maximum retry attempts (default: 2 for lighter function)
 * @returns {Promise} API call result or null on failure
 */
export async function executeApiCallWithTimeout(apiCall, args, context, timeoutMs = 10000, maxRetries = 2) {
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            const result = await withTimeout(apiCall(...args), timeoutMs, 'Meeting status API call');

            if (attempt > 1) {
                context.log('Meeting status API call succeeded after retry', {
                    attempt,
                    totalRetries: attempt - 1,
                    totalTimeMs: Date.now() - startTime,
                    success: true,
                    functionOptimization: 'retry-success'
                });
            }

            return result;
        } catch (error) {
            const isRetryable = isRetryableError(error);
            const isLastAttempt = attempt > maxRetries;

            context.error(`Meeting status API call failed (attempt ${attempt}/${maxRetries + 1})`, {
                error: error instanceof Error ? error.message : 'Unknown error',
                isRetryable,
                isLastAttempt,
                errorType: error.constructor.name,
                function: 'meeting-status-poller'
            });

            if (!isLastAttempt && isRetryable) {
                const delayMs = calculateBackoffDelay(attempt);
                context.log(`Retrying meeting status API call with exponential backoff in ${delayMs}ms...`, {
                    attempt,
                    delayMs,
                    nextAttempt: attempt + 1,
                    backoffStrategy: 'exponential-with-jitter',
                    lightweightFunction: 'optimized-for-status-polling'
                });
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } else if (!isLastAttempt && !isRetryable) {
                context.error('Non-retryable error encountered - stopping retry attempts', {
                    error: error.message,
                    totalAttempts: attempt,
                    totalTimeMs: Date.now() - startTime,
                    function: 'meeting-status-poller'
                });
                return null;
            } else {
                context.error('Meeting status API call failed after all retry attempts', {
                    totalAttempts: attempt,
                    maxRetries,
                    totalTimeMs: Date.now() - startTime,
                    finalError: error.message,
                    function: 'meeting-status-poller'
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
    context.error(`Meeting status poller: ${operation} failed`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        function: 'meeting-status-poller',
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
        context.error('Meeting status poller environment validation failed', {
            missingVars,
            requiredVars,
            function: 'meeting-status-poller'
        });
        throw error;
    }

    context.log('Meeting status poller environment variables validated successfully', {
        validatedVars: requiredVars,
        function: 'meeting-status-poller'
    });
}

/**
 * Rate limiting delay helper for NZ TAB API calls
 * @param {number} delayMs - Delay in milliseconds
 * @param {Object} context - Appwrite function context
 * @param {string} reason - Reason for delay
 * @returns {Promise} Promise that resolves after delay
 */
export function rateLimit(delayMs, context, reason = 'NZ TAB API rate limiting') {
    context.log(`Meeting status poller: Applying rate limit delay: ${delayMs}ms`, {
        reason,
        function: 'meeting-status-poller'
    });
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * Monitor memory usage optimized for s-1vcpu-1gb specification
 * @param {Object} context - Appwrite function context for logging
 * @param {number} warningThresholdMB - Warning threshold in MB (default: 200 for 1GB spec)
 * @param {number} criticalThresholdMB - Critical threshold in MB (default: 300 for 1GB spec)
 * @returns {Object} Memory usage information
 */
export function monitorMemoryUsage(context, warningThresholdMB = 200, criticalThresholdMB = 300) {
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
        criticalLevel: heapUsedMB >= criticalThresholdMB,
        specification: 's-1vcpu-1gb'
    };

    if (memoryInfo.criticalLevel) {
        context.error('Meeting status poller: Critical memory usage detected', {
            ...memoryInfo,
            action: 'Consider reducing batch size or triggering garbage collection',
            function: 'meeting-status-poller',
            thresholdExceeded: 'critical'
        });
    } else if (memoryInfo.warningLevel) {
        context.log('Meeting status poller: High memory usage warning', {
            ...memoryInfo,
            action: 'Monitor closely for potential memory issues',
            function: 'meeting-status-poller',
            thresholdExceeded: 'warning'
        });
    }

    return memoryInfo;
}

/**
 * Force garbage collection and log memory cleanup results
 * Optimized for s-1vcpu-1gb specification
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

        context.log('Meeting status poller: Forced garbage collection completed', {
            beforeHeapMB,
            afterHeapMB,
            freedMB,
            gcAvailable: true,
            function: 'meeting-status-poller',
            specification: 's-1vcpu-1gb'
        });

        return { beforeMemory, afterMemory, freedMB };
    } else {
        context.log('Meeting status poller: Garbage collection not available (--expose-gc not set)', {
            currentHeapMB: beforeHeapMB,
            gcAvailable: false,
            function: 'meeting-status-poller'
        });

        return { beforeMemory, afterMemory: beforeMemory, freedMB: 0 };
    }
}

/**
 * Circuit breaker pattern for NZ TAB API calls
 * Prevents repeated calls to failing endpoints
 */
class CircuitBreaker {
    constructor(threshold = 3, timeout = 30000) {
        this.threshold = threshold;
        this.timeout = timeout;
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    }

    /**
     * Execute function with circuit breaker protection
     * @param {Function} fn - Function to execute
     * @param {Array} args - Arguments for function
     * @param {Object} context - Appwrite function context
     * @returns {Promise} Function result or rejection
     */
    async execute(fn, args, context) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime >= this.timeout) {
                this.state = 'HALF_OPEN';
                context.log('Meeting status poller: Circuit breaker transitioning to HALF_OPEN', {
                    function: 'meeting-status-poller',
                    circuitState: this.state
                });
            } else {
                const error = new Error('Circuit breaker is OPEN - API calls temporarily blocked');
                context.error('Meeting status poller: Circuit breaker blocking API call', {
                    state: this.state,
                    failureCount: this.failureCount,
                    timeSinceLastFailure: Date.now() - this.lastFailureTime,
                    function: 'meeting-status-poller'
                });
                throw error;
            }
        }

        try {
            const result = await fn(...args);
            this.onSuccess(context);
            return result;
        } catch (error) {
            this.onFailure(context);
            throw error;
        }
    }

    onSuccess(context) {
        this.failureCount = 0;
        this.state = 'CLOSED';
        context.log('Meeting status poller: Circuit breaker reset to CLOSED', {
            function: 'meeting-status-poller',
            circuitState: this.state
        });
    }

    onFailure(context) {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
            context.error('Meeting status poller: Circuit breaker opened due to failures', {
                failureCount: this.failureCount,
                threshold: this.threshold,
                state: this.state,
                function: 'meeting-status-poller'
            });
        }
    }
}

// Export singleton circuit breaker instance for NZ TAB API
export const nzTabApiCircuitBreaker = new CircuitBreaker(3, 30000);