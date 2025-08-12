/**
 * Common error handling patterns for batch-race-poller function
 * Optimized for batch processing with enhanced error isolation
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
 * Execute API call with timeout and retry logic
 * @param {Function} apiCall - API call function
 * @param {Array} args - Arguments for API call
 * @param {Object} context - Appwrite function context
 * @param {number} timeoutMs - Timeout in milliseconds (default: 15000)
 * @param {number} maxRetries - Maximum retry attempts (default: 1)
 * @returns {Promise} API call result or null on failure
 */
export async function executeApiCallWithTimeout(apiCall, args, context, timeoutMs = 15000, maxRetries = 1) {
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            return await withTimeout(apiCall(...args), timeoutMs, 'API call');
        } catch (error) {
            context.error(`API call failed (attempt ${attempt}/${maxRetries + 1})`, {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            
            if (attempt <= maxRetries) {
                const delayMs = attempt * 1000; // Progressive delay
                context.log(`Retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
                context.error('API call failed after all retry attempts');
                return null;
            }
        }
    }
}

/**
 * Handle errors with proper logging and continuation - enhanced for batch processing
 * @param {Error} error - Error object
 * @param {string} operation - Operation that failed
 * @param {Object} context - Appwrite function context
 * @param {Object} metadata - Additional metadata to log
 * @param {boolean} shouldThrow - Whether to re-throw the error (default: false)
 * @param {string} raceId - Optional race ID for batch processing context
 */
export function handleError(error, operation, context, metadata = {}, shouldThrow = false, raceId = null) {
    const errorLog = {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        ...metadata
    };

    if (raceId) {
        errorLog.raceId = raceId;
        errorLog.batchProcessing = true;
    }

    context.error(`${operation} failed`, errorLog);
    
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
 * Rate limiting delay helper - enhanced for batch coordination
 * @param {number} delayMs - Delay in milliseconds
 * @param {Object} context - Appwrite function context
 * @param {string} reason - Reason for delay
 * @returns {Promise} Promise that resolves after delay
 */
export function rateLimit(delayMs, context, reason = 'API rate limiting') {
    if (delayMs <= 0) {
        return Promise.resolve();
    }
    
    context.log(`Applying rate limit delay: ${delayMs}ms`, { reason });
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * Batch error collector - collects errors without stopping batch processing
 * @param {Array} errors - Array to collect errors
 * @param {Error} error - Error to add
 * @param {string} raceId - Race ID context
 * @param {string} operation - Operation that failed
 * @param {Object} context - Appwrite function context
 */
export function collectBatchError(errors, error, raceId, operation, context) {
    const errorInfo = {
        raceId,
        operation,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
    };
    
    errors.push(errorInfo);
    handleError(error, operation, context, { raceId }, false, raceId);
}

/**
 * Process batch results with error summary
 * @param {Array} results - Batch processing results
 * @param {Array} errors - Collected errors
 * @param {Object} context - Appwrite function context
 * @returns {Object} Summary statistics
 */
export function summarizeBatchResults(results, errors, context) {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    const summary = {
        totalProcessed: results.length,
        successful: successful.length,
        failed: failed.length,
        successRate: results.length > 0 ? Math.round((successful.length / results.length) * 100) : 0,
        errors: errors.length,
        timestamp: new Date().toISOString()
    };
    
    context.log('Batch processing summary', summary);
    
    if (errors.length > 0) {
        context.log('Batch errors summary', {
            errorCount: errors.length,
            errorsByOperation: errors.reduce((acc, err) => {
                acc[err.operation] = (acc[err.operation] || 0) + 1;
                return acc;
            }, {}),
            raceIds: errors.map(err => err.raceId)
        });
    }
    
    return summary;
}