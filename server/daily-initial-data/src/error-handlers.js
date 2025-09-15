/**
 * Common error handling patterns for Appwrite functions
 */

import { logDebug, logInfo, logWarn, logError } from './logging-utils.js';

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
 * Execute database setup with timeout protection
 * @param {Function} setupFunction - Database setup function
 * @param {Object} config - Configuration object
 * @param {Object} context - Appwrite function context
 * @param {number} timeoutMs - Timeout in milliseconds (default: 60000)
 * @returns {Promise<boolean>} Success status
 */
export async function executeWithDatabaseSetupTimeout(setupFunction, config, context, timeoutMs = 60000) {
    try {
        await withTimeout(setupFunction(config, context), timeoutMs, 'Database setup');
        logDebug(context, 'Database setup completed successfully');
        return true;
    } catch (error) {
        context.error('Database setup failed or timed out', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        logDebug(context, 'Continuing without database setup...');
        return false;
    }
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
                logDebug(context, `Retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
                context.error('API call failed after all retry attempts');
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
    
    logDebug(context, 'Environment variables validated successfully', {
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
    logDebug(context, `Applying rate limit delay: ${delayMs}ms`, { reason });
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * Monitor memory usage and return metrics with warning levels
 * @param {Object} context - Appwrite function context
 * @param {string} operation - Current operation description
 * @returns {Object} Memory metrics with warning indicators
 */
export function monitorMemoryUsage(context, operation = 'memory-check') {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const externalMB = Math.round(memUsage.external / 1024 / 1024);
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);

    // Warning thresholds (conservative for 2GB specification)
    const warningThresholdMB = 1400; // 70% of 2GB
    const criticalThresholdMB = 1600; // 80% of 2GB

    const metrics = {
        heapUsedMB,
        heapTotalMB,
        externalMB,
        rssMB,
        warningLevel: heapUsedMB > warningThresholdMB,
        criticalLevel: heapUsedMB > criticalThresholdMB,
        efficiencyRatio: Math.round((heapUsedMB / heapTotalMB) * 100) / 100
    };

    if (metrics.criticalLevel) {
        context.error(`Critical memory usage detected during ${operation}`, {
            memoryMetrics: metrics,
            recommendation: 'Consider forcing garbage collection'
        });
    } else if (metrics.warningLevel) {
        logWarn(context, `High memory usage warning during ${operation}`, {
            memoryMetrics: metrics,
            recommendation: 'Monitor for potential memory leaks'
        });
    } else {
        logDebug(context, `Memory usage within normal range for ${operation}`, {
            memoryMetrics: metrics
        });
    }

    return metrics;
}

/**
 * Force garbage collection and log memory cleanup results
 * @param {Object} context - Appwrite function context
 * @param {string} reason - Reason for forcing garbage collection
 */
export function forceGarbageCollection(context, reason = 'memory-optimization') {
    const beforeMemory = process.memoryUsage();
    const beforeMB = Math.round(beforeMemory.heapUsed / 1024 / 1024);

    try {
        if (global.gc) {
            global.gc();
            const afterMemory = process.memoryUsage();
            const afterMB = Math.round(afterMemory.heapUsed / 1024 / 1024);
            const freedMB = beforeMB - afterMB;

            logDebug(context, `Forced garbage collection completed for ${reason}`, {
                beforeMB,
                afterMB,
                freedMB,
                efficiencyGain: freedMB > 0 ? `${Math.round((freedMB / beforeMB) * 100)}%` : '0%'
            });
        } else {
            logDebug(context, `Garbage collection not available for ${reason}`, {
                beforeMB,
                note: 'Running without --expose-gc flag'
            });
        }
    } catch (error) {
        context.error(`Failed to force garbage collection for ${reason}`, {
            error: error.message,
            beforeMB
        });
    }
}