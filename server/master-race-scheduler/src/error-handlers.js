/**
 * Error handling and monitoring utilities for master-race-scheduler
 * Optimized for high-frequency execution (every minute)
 */

import { logDebug, logInfo, logWarn, logError } from './logging-utils.js';

/**
 * Validate required environment variables
 * @param {string[]} requiredVars - Array of required environment variable names
 * @param {Object} context - Appwrite function context for logging
 * @throws {Error} If any required variables are missing
 */
export function validateEnvironmentVariables(requiredVars, context) {
    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        context.error('Missing required environment variables', {
            missingVariables: missingVars,
            totalRequired: requiredVars.length,
            functionName: 'master-race-scheduler'
        });
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    logDebug(context, 'Environment variables validated successfully', {
        validatedVariables: requiredVars.length,
        functionName: 'master-race-scheduler'
    });
}

/**
 * Execute async operation with timeout and exponential backoff retry
 * Optimized for scheduler function's need to complete quickly
 * @param {Function} operation - Async operation to execute
 * @param {Array} args - Arguments to pass to the operation
 * @param {Object} context - Appwrite function context for logging
 * @param {number} timeoutMs - Timeout in milliseconds (default: 10000)
 * @param {number} maxRetries - Maximum retry attempts (default: 2, reduced for scheduler)
 * @returns {Promise} Result of the operation or null on failure
 */
export async function executeWithTimeout(operation, args = [], context, timeoutMs = 10000, maxRetries = 2) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
            });

            const operationPromise = operation.apply(null, args);
            const result = await Promise.race([operationPromise, timeoutPromise]);

            if (attempt > 1) {
                logDebug(context, 'Operation succeeded after retry', {
                    attempt,
                    totalRetries: attempt - 1,
                    timeoutMs
                });
            }

            return result;

        } catch (error) {
            lastError = error;

            if (attempt <= maxRetries) {
                const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Max 5 seconds for scheduler
                logDebug(context, 'Operation failed, retrying with backoff', {
                    attempt,
                    maxRetries,
                    error: error.message,
                    backoffDelayMs: backoffDelay,
                    timeoutMs
                });

                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            } else {
                context.error('Operation failed after all retries', {
                    totalAttempts: attempt,
                    finalError: error.message,
                    timeoutMs,
                    operationName: operation.name || 'anonymous'
                });
            }
        }
    }

    return null; // All retries failed
}

/**
 * Monitor memory usage and return metrics with warning levels
 * Optimized for frequent monitoring in scheduler function
 * @param {Object} context - Appwrite function context for logging
 * @returns {Object} Memory usage metrics with warning indicators
 */
export function monitorMemoryUsage(context) {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
    const externalMB = Math.round(memoryUsage.external / 1024 / 1024);
    const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);

    // Scheduler-specific memory thresholds (lighter than data processing functions)
    const warningThreshold = 128; // 128MB warning for scheduler
    const criticalThreshold = 256; // 256MB critical for scheduler

    const warningLevel = heapUsedMB > warningThreshold;
    const criticalLevel = heapUsedMB > criticalThreshold;

    const metrics = {
        heapUsedMB,
        heapTotalMB,
        externalMB,
        rssMB,
        warningLevel,
        criticalLevel,
        timestamp: new Date().toISOString()
    };

    if (criticalLevel) {
        context.error('Critical memory usage detected in scheduler', metrics);
    } else if (warningLevel) {
        logWarn(context, 'High memory usage in scheduler', metrics);
    }

    return metrics;
}

/**
 * Force garbage collection if available (for memory optimization)
 * @param {Object} context - Appwrite function context for logging
 */
export function forceGarbageCollection(context) {
    if (global.gc) {
        try {
            global.gc();
            const afterGC = monitorMemoryUsage(context);
            logDebug(context, 'Forced garbage collection completed', {
                memoryAfterGC: afterGC.heapUsedMB + 'MB',
                gcAvailable: true
            });
        } catch (error) {
            context.error('Failed to force garbage collection', {
                error: error.message,
                gcAvailable: true
            });
        }
    } else {
        logDebug(context, 'Garbage collection not available', {
            gcAvailable: false,
            suggestion: 'Start Node.js with --expose-gc flag for manual GC control'
        });
    }
}

/**
 * Comprehensive error categorization for scheduler operations
 * @param {Error} error - Error to categorize
 * @param {Object} context - Appwrite function context
 * @returns {Object} Error analysis with retry recommendations
 */
export function categorizeError(error, context) {
    const errorMessage = error.message || '';
    const errorStack = error.stack || '';

    let category = 'unknown';
    let retryable = false;
    let severity = 'medium';
    let recommendedAction = 'log and continue';

    // Database/Appwrite errors
    if (errorMessage.includes('Collection with the requested ID could not be found') || error.code === 404) {
        category = 'database_setup';
        retryable = false;
        severity = 'high';
        recommendedAction = 'run database-setup function';
    } else if (errorMessage.includes('Document with the requested ID already exists') || error.code === 409) {
        category = 'concurrent_execution';
        retryable = false;
        severity = 'low';
        recommendedAction = 'terminate gracefully (normal for frequent execution)';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')) {
        category = 'timeout';
        retryable = true;
        severity = 'medium';
        recommendedAction = 'retry with exponential backoff';
    } else if (errorMessage.includes('Network') || errorMessage.includes('ECONNRESET') || errorMessage.includes('ENOTFOUND')) {
        category = 'network';
        retryable = true;
        severity = 'medium';
        recommendedAction = 'retry with exponential backoff';
    }
    // Function execution errors
    else if (errorMessage.includes('Function execution failed') || error.code >= 500) {
        category = 'function_execution';
        retryable = true;
        severity = 'high';
        recommendedAction = 'retry once, then skip this cycle';
    } else if (errorMessage.includes('Rate limit') || error.code === 429) {
        category = 'rate_limit';
        retryable = true;
        severity = 'medium';
        recommendedAction = 'implement exponential backoff';
    } else if (errorMessage.includes('out of memory') || errorMessage.includes('heap')) {
        category = 'memory';
        retryable = false;
        severity = 'critical';
        recommendedAction = 'force garbage collection and terminate';
    }

    const analysis = {
        category,
        retryable,
        severity,
        recommendedAction,
        errorMessage: errorMessage.substring(0, 500), // Truncate for logging
        timestamp: new Date().toISOString()
    };

    logDebug(context, 'Error categorized for scheduler', {
        ...analysis,
        functionName: 'master-race-scheduler',
        highFrequencyContext: 'every-minute execution'
    });

    return analysis;
}

/**
 * Log performance metrics for scheduler optimization
 * @param {Object} metrics - Performance metrics to log
 * @param {Object} context - Appwrite function context
 */
export function logPerformanceMetrics(metrics, context) {
    const {
        executionTimeMs,
        racesAnalyzed,
        racesScheduled,
        functionsTriggered,
        memoryUsageMB,
        lockAcquisitionMs,
        schedulingPhase
    } = metrics;

    const optimizationMetrics = {
        executionTimeMs,
        executionTimeSeconds: Math.round(executionTimeMs / 1000),
        racesAnalyzed: racesAnalyzed || 0,
        racesScheduled: racesScheduled || 0,
        functionsTriggered: functionsTriggered || 0,
        memoryUsageMB: memoryUsageMB || 0,
        lockAcquisitionMs: lockAcquisitionMs || 0,
        schedulingPhase: schedulingPhase || 'unknown',

        // Performance indicators for every-minute execution
        performanceIndicators: {
            ultraFastExecution: executionTimeMs < 15000, // Under 15 seconds
            fastLockAcquisition: lockAcquisitionMs < 15, // Under 15ms
            memoryEfficient: memoryUsageMB < 128, // Under 128MB
            highThroughput: racesAnalyzed > 10, // More than 10 races
            schedulingEfficiency: racesScheduled / Math.max(racesAnalyzed, 1) // Ratio of scheduled to analyzed
        },

        // Optimization opportunities
        optimizationOpportunities: {
            shouldOptimizeLockSpeed: lockAcquisitionMs > 20,
            shouldOptimizeMemory: memoryUsageMB > 150,
            shouldOptimizeScheduling: executionTimeMs > 30000,
            shouldImplementCaching: racesAnalyzed > 50
        },

        timestamp: new Date().toISOString(),
        functionName: 'master-race-scheduler',
        executionFrequency: 'every-minute'
    };

    logDebug(context, 'Scheduler performance metrics', optimizationMetrics);

    return optimizationMetrics;
}