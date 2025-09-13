/**
 * Common error handling patterns for Appwrite functions
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