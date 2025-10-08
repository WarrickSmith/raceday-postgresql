/**
 * Logging Utilities for Daily Meetings Function
 * Provides environment-based conditional logging to optimize production performance
 *
 * Environment Variable: LOG_LEVEL
 * - DEBUG: All logging (development)
 * - INFO: Info, warnings, and errors (staging)
 * - WARN: Warnings and errors only
 * - ERROR: Critical errors only (production)
 * - SILENT: No logging
 */

const LOG_LEVELS = {
    SILENT: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4
};

/**
 * Get current log level from environment variable
 * Defaults to INFO if not set or invalid
 */
function getCurrentLogLevel() {
    const envLevel = process.env['LOG_LEVEL']?.toUpperCase() || 'INFO';
    return LOG_LEVELS[envLevel] !== undefined ? LOG_LEVELS[envLevel] : LOG_LEVELS.INFO;
}

/**
 * Check if logging is enabled for a specific level
 * @param {string} level - Log level to check
 * @returns {boolean} True if logging is enabled for this level
 */
function isLogLevelEnabled(level) {
    const currentLevel = getCurrentLogLevel();
    const checkLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
    return currentLevel >= checkLevel;
}

/**
 * Conditional logging function for debug messages
 * @param {Object} context - Appwrite function context
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 */
export function logDebug(context, message, data = {}) {
    if (isLogLevelEnabled('DEBUG')) {
        context.log(`[DEBUG] ${message}`, data);
    }
}

/**
 * Conditional logging function for info messages
 * @param {Object} context - Appwrite function context
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 */
export function logInfo(context, message, data = {}) {
    if (isLogLevelEnabled('INFO')) {
        context.log(`[INFO] ${message}`, data);
    }
}

/**
 * Conditional logging function for warning messages
 * @param {Object} context - Appwrite function context
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 */
export function logWarn(context, message, data = {}) {
    if (isLogLevelEnabled('WARN')) {
        context.log(`[WARN] ${message}`, data);
    }
}

/**
 * Conditional logging function for error messages
 * Always logs unless SILENT level is set
 * @param {Object} context - Appwrite function context
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 */
export function logError(context, message, data = {}) {
    if (isLogLevelEnabled('ERROR')) {
        context.error(`[ERROR] ${message}`, data);
    }
}

/**
 * Log function start with minimal overhead
 * @param {Object} context - Appwrite function context
 * @param {string} functionName - Name of the function
 * @param {Object} config - Function configuration
 */
export function logFunctionStart(context, functionName, config = {}) {
    if (isLogLevelEnabled('INFO')) {
        context.log(`[START] ${functionName}`, {
            timestamp: new Date().toISOString(),
            ...config
        });
    }
}

/**
 * Log function completion with essential metrics
 * @param {Object} context - Appwrite function context
 * @param {string} functionName - Name of the function
 * @param {number} startTime - Function start time
 * @param {Object} results - Function results
 */
export function logFunctionComplete(context, functionName, startTime, results = {}) {
    if (isLogLevelEnabled('ERROR')) {
        const duration = Date.now() - startTime;
        context.log(`[COMPLETE] ${functionName}`, {
            durationMs: duration,
            timestamp: new Date().toISOString(),
            ...results
        });
    }
}