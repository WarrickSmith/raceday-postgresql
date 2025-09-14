/**
 * Enhanced error handling patterns for Appwrite database setup
 * Implements exponential backoff, circuit breaker, and comprehensive retry logic
 * Following Appwrite 2025 best practices for robust function execution
 */

/**
 * Enhanced timeout protection wrapper for promises with cleanup
 * @param {Promise} promise - Promise to wrap with timeout
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operation - Operation description for error messages
 * @param {Object} context - Appwrite function context for logging
 * @returns {Promise} Promise that rejects on timeout
 */
export function withTimeout(promise, timeoutMs, operation, context = null) {
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            if (context) {
                context.error(`Operation timeout: ${operation}`, {
                    timeoutMs,
                    operation,
                    timestamp: new Date().toISOString()
                });
            }
            reject(new Error(`${operation} timeout after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    // Ensure timeout is cleared when original promise resolves/rejects
    const wrappedPromise = promise.finally(() => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    });

    return Promise.race([wrappedPromise, timeoutPromise]);
}

/**
 * Enhanced error handling with categorization and severity levels
 * @param {Error} error - Error object
 * @param {string} operation - Operation that failed
 * @param {Object} context - Appwrite function context
 * @param {Object} metadata - Additional metadata to log
 * @param {boolean} shouldThrow - Whether to re-throw the error (default: false)
 * @param {string} severity - Error severity level ('low', 'medium', 'high', 'critical')
 */
export function handleError(error, operation, context, metadata = {}, shouldThrow = false, severity = 'medium') {
    const errorDetails = {
        operation,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        severity,
        timestamp: new Date().toISOString(),
        errorType: categorizeError(error),
        retryable: isRetryableError(error),
        ...metadata
    };

    // Log based on severity
    if (severity === 'critical' || severity === 'high') {
        context.error(`[${severity.toUpperCase()}] ${operation} failed`, errorDetails);
    } else {
        context.log(`[${severity.toUpperCase()}] ${operation} failed`, errorDetails);
    }

    if (shouldThrow) {
        throw error;
    }

    return errorDetails;
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
 * Enhanced rate limiting with adaptive delays and jitter
 * @param {number} delayMs - Base delay in milliseconds
 * @param {Object} context - Appwrite function context
 * @param {string} reason - Reason for delay
 * @param {Object} options - Additional options for adaptive behavior
 * @returns {Promise} Promise that resolves after delay
 */
export function rateLimit(delayMs, context, reason = 'API rate limiting', options = {}) {
    const {
        adaptive = false,
        lastCallDuration = 0,
        adaptiveMultiplier = 0.1,
        jitter = true,
        maxDelay = delayMs * 3
    } = options;

    let actualDelay = delayMs;

    // Adaptive delay based on last call duration
    if (adaptive && lastCallDuration > 0) {
        const adaptiveComponent = Math.round(lastCallDuration * adaptiveMultiplier);
        actualDelay = Math.min(delayMs + adaptiveComponent, maxDelay);
    }

    // Add jitter to prevent thundering herd
    if (jitter) {
        const jitterAmount = Math.round(actualDelay * 0.1 * Math.random());
        actualDelay += jitterAmount;
    }

    context.log(`Applying rate limit delay: ${actualDelay}ms`, {
        reason,
        baseDelay: delayMs,
        adaptive,
        jitter,
        lastCallDuration
    });

    return new Promise(resolve => setTimeout(resolve, actualDelay));
}

/**
 * Exponential backoff retry mechanism with intelligent error handling
 * @param {Function} operation - Function to retry
 * @param {Object} options - Retry configuration options
 * @param {Object} context - Appwrite function context
 * @returns {Promise} Result of the operation or null if all retries failed
 */
export async function retryWithExponentialBackoff(operation, options = {}, context) {
    const {
        maxRetries = 3,
        baseDelay = 1000,
        maxDelay = 30000,
        backoffMultiplier = 2,
        jitter = true,
        timeoutMs = 15000,
        retryCondition = isRetryableError
    } = options;

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        const startTime = Date.now();

        try {
            context.log(`Attempt ${attempt}/${maxRetries + 1} starting`, {
                operation: operation.name || 'unknown',
                timeoutMs
            });

            const result = await withTimeout(
                operation(),
                timeoutMs,
                `Operation attempt ${attempt}`,
                context
            );

            const duration = Date.now() - startTime;
            context.log(`Operation succeeded on attempt ${attempt}`, {
                durationMs: duration,
                attempt,
                totalAttempts: maxRetries + 1
            });

            return result;

        } catch (error) {
            lastError = error;
            const duration = Date.now() - startTime;
            const shouldRetry = attempt <= maxRetries && retryCondition(error);

            const errorInfo = handleError(
                error,
                `Operation attempt ${attempt}`,
                context,
                {
                    attempt,
                    maxRetries,
                    durationMs: duration,
                    shouldRetry,
                    errorCode: error.code,
                    timeoutMs
                },
                false,
                shouldRetry ? 'medium' : 'high'
            );

            if (!shouldRetry) {
                break;
            }

            // Calculate delay for next attempt
            const delay = Math.min(
                baseDelay * Math.pow(backoffMultiplier, attempt - 1),
                maxDelay
            );

            // Add jitter to prevent thundering herd
            const jitterAmount = jitter ? Math.round(delay * 0.1 * Math.random()) : 0;
            const actualDelay = delay + jitterAmount;

            context.log(`Retrying in ${actualDelay}ms...`, {
                attempt,
                baseDelay,
                calculatedDelay: delay,
                jitterAmount,
                actualDelay,
                reason: errorInfo.errorType
            });

            await new Promise(resolve => setTimeout(resolve, actualDelay));
        }
    }

    context.error('Operation failed after all retry attempts', {
        totalAttempts: maxRetries + 1,
        finalError: lastError?.message || 'Unknown error',
        errorType: categorizeError(lastError),
        operation: operation.name || 'unknown'
    });

    return null;
}

/**
 * Categorize errors for better handling and monitoring
 * @param {Error} error - Error object to categorize
 * @returns {string} Error category
 */
function categorizeError(error) {
    if (!error) return 'unknown';

    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';

    // Network/API errors
    if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
    if (message.includes('network') || message.includes('fetch failed')) return 'network';
    if (message.includes('connection') || code.includes('conn')) return 'connection';
    if (message.includes('429') || message.includes('rate limit')) return 'rate_limit';
    if (message.includes('50') && message.includes('server')) return 'server_error';

    // Authentication/Authorization
    if (message.includes('401') || message.includes('unauthorized')) return 'unauthorized';
    if (message.includes('403') || message.includes('forbidden')) return 'forbidden';

    // Resource errors
    if (message.includes('404') || code === '404') return 'not_found';
    if (message.includes('409') || message.includes('conflict')) return 'conflict';

    // Database errors
    if (message.includes('database') || message.includes('appwrite')) return 'database';
    if (message.includes('duplicate') || message.includes('unique')) return 'duplicate_data';
    if (message.includes('validation') || message.includes('invalid')) return 'validation';

    // Data processing errors
    if (message.includes('json') || message.includes('parse')) return 'parsing';
    if (message.includes('undefined') || message.includes('null')) return 'null_reference';

    // Generic categories
    if (error.name === 'TypeError') return 'type_error';
    if (error.name === 'ReferenceError') return 'reference_error';
    if (error.name === 'SyntaxError') return 'syntax_error';

    return 'generic';
}

/**
 * Determine if an error is retryable
 * @param {Error} error - Error object to evaluate
 * @returns {boolean} Whether the error should be retried
 */
function isRetryableError(error) {
    if (!error) return false;

    const errorType = categorizeError(error);

    // Retryable error types
    const retryableTypes = [
        'timeout',
        'network',
        'connection',
        'rate_limit',
        'server_error'
    ];

    return retryableTypes.includes(errorType);
}

/**
 * Circuit breaker pattern for database operations
 */
export class CircuitBreaker {
    constructor(name, options = {}) {
        this.name = name;
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000; // 1 minute
        this.monitoringPeriod = options.monitoringPeriod || 300000; // 5 minutes

        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failures = 0;
        this.lastFailureTime = null;
        this.successCount = 0;
        this.requestCount = 0;
        this.lastResetTime = Date.now();
    }

    async execute(operation, context) {
        this.requestCount++;

        // Reset stats periodically
        if (Date.now() - this.lastResetTime > this.monitoringPeriod) {
            this.resetStats();
        }

        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
                this.state = 'HALF_OPEN';
                this.successCount = 0;
                context.log(`Circuit breaker ${this.name}: Moving to HALF_OPEN state`);
            } else {
                const error = new Error(`Circuit breaker ${this.name} is OPEN - operation blocked`);
                error.circuitBreakerBlocked = true;
                throw error;
            }
        }

        try {
            const result = await operation();

            // Operation succeeded
            this.onSuccess(context);
            return result;

        } catch (error) {
            this.onFailure(error, context);
            throw error;
        }
    }

    onSuccess(context) {
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= 2) { // Require 2 successful calls to close
                this.state = 'CLOSED';
                this.failures = 0;
                this.lastFailureTime = null;
                context.log(`Circuit breaker ${this.name}: Closed after successful recovery`);
            }
        } else {
            // Gradually reduce failure count on success
            this.failures = Math.max(0, this.failures - 1);
        }
    }

    onFailure(error, context) {
        // Only count retryable errors towards circuit breaker
        if (isRetryableError(error)) {
            this.failures++;
            this.lastFailureTime = Date.now();

            if (this.failures >= this.failureThreshold) {
                this.state = 'OPEN';
                context.error(`Circuit breaker ${this.name}: Opening due to ${this.failures} failures`, {
                    failureThreshold: this.failureThreshold,
                    errorType: categorizeError(error)
                });
            }
        }
    }

    resetStats() {
        this.requestCount = 0;
        this.lastResetTime = Date.now();

        // Only reset failure count if we're in CLOSED state
        if (this.state === 'CLOSED') {
            this.failures = Math.max(0, this.failures - 1);
        }
    }

    getStatus() {
        return {
            name: this.name,
            state: this.state,
            failures: this.failures,
            requestCount: this.requestCount,
            lastFailureTime: this.lastFailureTime,
            successCount: this.successCount,
            failureRate: this.requestCount > 0 ? (this.failures / this.requestCount) * 100 : 0
        };
    }
}

/**
 * Batch operation helper with error isolation
 * @param {Array} items - Items to process
 * @param {Function} operation - Function to execute for each item
 * @param {Object} options - Batch processing options
 * @param {Object} context - Appwrite function context
 * @returns {Promise<Object>} Batch processing results
 */
export async function processBatch(items, operation, options = {}, context) {
    const {
        batchSize = 10,
        parallel = true,
        stopOnFirstError = false,
        retryOptions = {}
    } = options;

    const results = {
        successful: 0,
        failed: 0,
        results: [],
        errors: [],
        totalProcessed: 0,
        duration: 0
    };

    const startTime = Date.now();

    context.log(`Starting batch processing`, {
        totalItems: items.length,
        batchSize,
        parallel,
        stopOnFirstError
    });

    // Process items in batches
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(items.length / batchSize);

        context.log(`Processing batch ${batchNumber}/${totalBatches}`, {
            batchSize: batch.length,
            startIndex: i
        });

        const batchPromises = batch.map(async (item, index) => {
            const itemIndex = i + index;

            try {
                let result;

                if (Object.keys(retryOptions).length > 0) {
                    result = await retryWithExponentialBackoff(
                        () => operation(item, itemIndex),
                        retryOptions,
                        context
                    );
                } else {
                    result = await operation(item, itemIndex);
                }

                results.successful++;
                results.results[itemIndex] = { success: true, result, item };

                return { success: true, result, itemIndex };

            } catch (error) {
                results.failed++;
                results.errors.push({
                    itemIndex,
                    item,
                    error: error.message,
                    errorType: categorizeError(error)
                });
                results.results[itemIndex] = { success: false, error: error.message, item };

                if (stopOnFirstError) {
                    throw error;
                }

                return { success: false, error, itemIndex };
            }
        });

        try {
            if (parallel) {
                await Promise.all(batchPromises);
            } else {
                for (const promise of batchPromises) {
                    await promise;
                }
            }

            results.totalProcessed += batch.length;

        } catch (error) {
            if (stopOnFirstError) {
                context.error('Batch processing stopped on first error', {
                    error: error.message,
                    processedSoFar: results.totalProcessed,
                    batchNumber
                });
                break;
            }
        }

        // Progress update
        const progress = ((results.totalProcessed / items.length) * 100).toFixed(1);
        context.log(`Batch ${batchNumber} completed`, {
            progress: `${progress}%`,
            successful: results.successful,
            failed: results.failed
        });
    }

    results.duration = Date.now() - startTime;
    results.successRate = results.totalProcessed > 0 ? (results.successful / results.totalProcessed) * 100 : 0;

    context.log('Batch processing completed', {
        totalItems: items.length,
        successful: results.successful,
        failed: results.failed,
        successRate: `${results.successRate.toFixed(1)}%`,
        duration: results.duration
    });

    return results;
}