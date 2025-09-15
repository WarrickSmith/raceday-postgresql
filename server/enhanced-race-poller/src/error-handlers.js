/**
 * Enhanced error handling patterns for enhanced-race-poller function
 * Consolidates and improves error handling from all existing polling functions
 * Adds mathematical validation, timeout protection, and data quality monitoring
 */

import { logDebug, logInfo, logWarn, logError } from './logging-utils.js';

/**
 * Enhanced timeout protection wrapper for promises
 * @param {Promise} promise - Promise to wrap with timeout
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operation - Operation description for error messages
 * @param {Object} context - Appwrite function context for logging
 * @returns {Promise} Promise that rejects on timeout
 */
export function withTimeout(promise, timeoutMs, operation, context) {
    const timeoutPromise = new Promise((_, reject) => {
        const timeoutId = setTimeout(() => {
            context.error(`Operation timeout: ${operation}`, {
                timeoutMs,
                operation,
                timestamp: new Date().toISOString()
            });
            reject(new Error(`${operation} timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        
        // Clear timeout if original promise resolves/rejects first
        promise.finally(() => clearTimeout(timeoutId));
    });
    
    return Promise.race([promise, timeoutPromise]);
}

/**
 * Enhanced API call execution with timeout and intelligent retry logic
 * @param {Function} apiCall - API call function
 * @param {Array} args - Arguments for API call
 * @param {Object} context - Appwrite function context
 * @param {number} timeoutMs - Timeout in milliseconds (default: 15000)
 * @param {number} maxRetries - Maximum retry attempts (default: 2)
 * @param {number} baseDelayMs - Base delay for exponential backoff (default: 1000)
 * @returns {Promise} API call result or null on failure
 */
export async function executeApiCallWithTimeout(apiCall, args, context, timeoutMs = 15000, maxRetries = 2, baseDelayMs = 1000) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        const startTime = Date.now();
        
        try {
            logDebug(context, `API call attempt ${attempt}/${maxRetries + 1}`, {
                operation: apiCall.name || 'unknown',
                timeoutMs,
                args: args.length > 0 ? typeof args[0] === 'string' ? args[0] : '[object]' : 'none'
            });
            
            const result = await withTimeout(apiCall(...args), timeoutMs, `API call (attempt ${attempt})`, context);
            const duration = Date.now() - startTime;
            
            logDebug(context, `API call succeeded on attempt ${attempt}`, {
                durationMs: duration,
                success: true
            });
            
            return result;
            
        } catch (error) {
            lastError = error;
            const duration = Date.now() - startTime;
            const isTimeout = error.message.includes('timeout');
            const isNetworkError = error.message.toLowerCase().includes('network') || 
                                 error.message.toLowerCase().includes('fetch') ||
                                 error.code === 'ECONNRESET' || 
                                 error.code === 'ETIMEDOUT';
            
            context.error(`API call failed (attempt ${attempt}/${maxRetries + 1})`, {
                error: error.message,
                durationMs: duration,
                isTimeout,
                isNetworkError,
                errorCode: error.code,
                shouldRetry: attempt <= maxRetries && (isTimeout || isNetworkError)
            });
            
            // Only retry on timeout or network errors
            if (attempt <= maxRetries && (isTimeout || isNetworkError)) {
                const delayMs = baseDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
                logDebug(context, `Retrying API call in ${delayMs}ms...`, {
                    attempt,
                    maxRetries,
                    delayMs,
                    reason: isTimeout ? 'timeout' : 'network_error'
                });
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
                break;
            }
        }
    }
    
    context.error('API call failed after all retry attempts', {
        totalAttempts: maxRetries + 1,
        finalError: lastError?.message || 'Unknown error',
        timeoutMs
    });
    
    return null;
}

/**
 * Enhanced error handling with categorization and metrics
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
        ...metadata
    };
    
    // Log based on severity
    if (severity === 'critical' || severity === 'high') {
        context.error(`[${severity.toUpperCase()}] ${operation} failed`, errorDetails);
    } else {
        logInfo(context, `[${severity.toUpperCase()}] ${operation} failed`, errorDetails);
    }
    
    // Track error metrics (could be extended for monitoring)
    if (context.metrics) {
        context.metrics.incrementCounter(`errors.${errorDetails.errorType}`, 1, {
            operation,
            severity
        });
    }
    
    if (shouldThrow) {
        throw error;
    }
}

/**
 * Categorize errors for better monitoring and handling
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
    if (message.includes('404') || code === '404') return 'not_found';
    if (message.includes('429') || message.includes('rate limit')) return 'rate_limit';
    if (message.includes('50') && message.includes('server')) return 'server_error';
    
    // Database errors
    if (message.includes('database') || message.includes('appwrite')) return 'database';
    if (message.includes('document') && (message.includes('not found') || message.includes('404'))) return 'document_not_found';
    if (message.includes('duplicate') || message.includes('unique')) return 'duplicate_data';
    if (message.includes('validation') || message.includes('invalid')) return 'validation';
    
    // Data processing errors
    if (message.includes('json') || message.includes('parse')) return 'parsing';
    if (message.includes('undefined') || message.includes('null')) return 'null_reference';
    if (message.includes('math') || message.includes('calculation')) return 'calculation';
    
    // Generic categories
    if (error.name === 'TypeError') return 'type_error';
    if (error.name === 'ReferenceError') return 'reference_error';
    if (error.name === 'SyntaxError') return 'syntax_error';
    
    return 'generic';
}

/**
 * Environment variable validation with enhanced feedback
 * @param {Array} requiredVars - Array of required environment variable names
 * @param {Object} context - Appwrite function context
 * @throws {Error} If required variables are missing
 */
export function validateEnvironmentVariables(requiredVars, context) {
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    const presentVars = requiredVars.filter(varName => process.env[varName]);
    
    if (missingVars.length > 0) {
        const error = new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        
        handleError(error, 'Environment validation', context, {
            missingVars,
            presentVars,
            totalRequired: requiredVars.length
        }, true, 'critical');
    }
    
    logDebug(context, 'Environment variables validated successfully', {
        validatedVars: presentVars,
        totalValidated: presentVars.length
    });
}

/**
 * Enhanced rate limiting with adaptive delays
 * @param {number} delayMs - Base delay in milliseconds
 * @param {Object} context - Appwrite function context
 * @param {string} reason - Reason for delay
 * @param {Object} options - Additional options
 * @returns {Promise} Promise that resolves after delay
 */
export function rateLimit(delayMs, context, reason = 'API rate limiting', options = {}) {
    const { 
        adaptive = false, 
        lastCallDuration = 0, 
        adaptiveMultiplier = 0.1 
    } = options;
    
    let actualDelay = delayMs;
    
    // Adaptive delay based on last call duration
    if (adaptive && lastCallDuration > 0) {
        const adaptiveComponent = Math.round(lastCallDuration * adaptiveMultiplier);
        actualDelay = Math.min(delayMs + adaptiveComponent, delayMs * 3); // Cap at 3x base delay
        
        logDebug(context, `Applying adaptive rate limit`, {
            baseDelay: delayMs,
            lastCallDuration,
            adaptiveComponent,
            actualDelay,
            reason
        });
    } else {
        logDebug(context, `Applying rate limit delay: ${actualDelay}ms`, { reason });
    }
    
    return new Promise(resolve => setTimeout(resolve, actualDelay));
}

/**
 * Enhanced batch operation result summarizer
 * @param {Map|Array} results - Results from batch operation
 * @param {Object} context - Appwrite function context
 * @param {string} operation - Operation name for logging
 * @returns {Object} Summary statistics
 */
export function summarizeBatchResults(results, context, operation = 'batch operation') {
    let successful = 0;
    let failed = 0;
    let totalProcessed = 0;
    let errors = [];
    
    const isMap = results instanceof Map;
    const entries = isMap ? Array.from(results.entries()) : results;
    
    for (const entry of entries) {
        totalProcessed++;
        
        if (isMap) {
            const [id, result] = entry;
            if (result && result !== null) {
                successful++;
            } else {
                failed++;
                errors.push(`Failed: ${id}`);
            }
        } else {
            // Assume array of {success: boolean, error?: string} objects
            if (entry && entry.success) {
                successful++;
            } else {
                failed++;
                if (entry?.error) {
                    errors.push(entry.error);
                }
            }
        }
    }
    
    const successRate = totalProcessed > 0 ? ((successful / totalProcessed) * 100).toFixed(1) : '0.0';
    
    const summary = {
        operation,
        totalProcessed,
        successful,
        failed,
        successRate: `${successRate}%`,
        errors: errors.slice(0, 5), // Limit error details to first 5
        totalErrors: errors.length
    };
    
    // Log appropriate level based on success rate
    if (parseFloat(successRate) < 50) {
        context.error(`${operation} batch results - LOW SUCCESS RATE`, summary);
    } else if (parseFloat(successRate) < 90) {
        logInfo(context, `${operation} batch results - PARTIAL SUCCESS`, summary);
    } else {
        logInfo(context, `${operation} batch results - SUCCESS`, summary);
    }
    
    return summary;
}

/**
 * Mathematical validation helper for pool data consistency
 * @param {Array} entrantIncrements - Array of entrant increment values
 * @param {number} totalPoolGrowth - Total pool growth amount
 * @param {Object} context - Appwrite function context
 * @param {number} tolerancePercent - Tolerance percentage (default: 1%)
 * @returns {Object} Validation result
 */
export function validateMathematicalConsistency(entrantIncrements, totalPoolGrowth, context, tolerancePercent = 1) {
    const sumOfIncrements = entrantIncrements.reduce((sum, inc) => sum + (inc || 0), 0);
    const difference = Math.abs(sumOfIncrements - totalPoolGrowth);
    const percentageDifference = totalPoolGrowth !== 0 ? (difference / Math.abs(totalPoolGrowth)) * 100 : 0;
    const isConsistent = percentageDifference <= tolerancePercent;
    
    const result = {
        isConsistent,
        sumOfIncrements,
        totalPoolGrowth,
        difference,
        percentageDifference,
        tolerancePercent,
        consistencyScore: Math.max(0, 100 - percentageDifference)
    };
    
    if (!isConsistent) {
        context.error('Mathematical inconsistency detected', {
            ...result,
            severity: percentageDifference > 10 ? 'high' : 'medium'
        });
    } else {
        logDebug(context, 'Mathematical consistency validated', {
            consistencyScore: result.consistencyScore,
            percentageDifference: result.percentageDifference.toFixed(2)
        });
    }
    
    return result;
}

/**
 * Performance monitoring helper
 * @param {string} operation - Operation name
 * @param {number} startTime - Start time in milliseconds
 * @param {Object} context - Appwrite function context
 * @param {Object} metadata - Additional metadata
 * @returns {number} Duration in milliseconds
 */
export function logPerformance(operation, startTime, context, metadata = {}) {
    const duration = Date.now() - startTime;
    const performanceLevel = getPerformanceLevel(duration);
    
    const performanceData = {
        operation,
        durationMs: duration,
        performanceLevel,
        ...metadata
    };
    
    // Log based on performance level
    if (performanceLevel === 'slow' || performanceLevel === 'very_slow') {
        context.error(`PERFORMANCE ISSUE: ${operation}`, performanceData);
    } else if (performanceLevel === 'moderate') {
        logWarn(context, `PERFORMANCE WARNING: ${operation}`, performanceData);
    } else {
        logDebug(context, `Performance: ${operation}`, performanceData);
    }
    
    return duration;
}

/**
 * Determine performance level based on duration
 * @param {number} durationMs - Duration in milliseconds
 * @returns {string} Performance level
 */
function getPerformanceLevel(durationMs) {
    if (durationMs < 1000) return 'fast';
    if (durationMs < 3000) return 'normal';
    if (durationMs < 10000) return 'moderate';
    if (durationMs < 30000) return 'slow';
    return 'very_slow';
}

/**
 * Data quality assessment helper
 * @param {Object} data - Data object to assess
 * @param {Object} requiredFields - Required fields with their types
 * @param {Object} context - Appwrite function context
 * @returns {Object} Quality assessment result
 */
export function assessDataQuality(data, requiredFields, context) {
    let score = 100;
    let issues = [];
    let totalFields = Object.keys(requiredFields).length;
    let presentFields = 0;
    
    for (const [fieldName, expectedType] of Object.entries(requiredFields)) {
        const value = data[fieldName];
        
        if (value === undefined || value === null) {
            issues.push(`Missing required field: ${fieldName}`);
            score -= Math.floor(100 / totalFields);
        } else {
            presentFields++;
            
            // Type validation
            const actualType = typeof value;
            if (expectedType !== 'any' && actualType !== expectedType) {
                issues.push(`Type mismatch for ${fieldName}: expected ${expectedType}, got ${actualType}`);
                score -= 5;
            }
            
            // Value validation
            if (expectedType === 'number' && (isNaN(value) || !isFinite(value))) {
                issues.push(`Invalid number value for ${fieldName}: ${value}`);
                score -= 10;
            }
            
            if (expectedType === 'string' && value.length === 0) {
                issues.push(`Empty string value for ${fieldName}`);
                score -= 5;
            }
        }
    }
    
    score = Math.max(0, score);
    const completeness = totalFields > 0 ? (presentFields / totalFields) * 100 : 0;
    
    const assessment = {
        score,
        completeness,
        totalFields,
        presentFields,
        issues: issues.slice(0, 10), // Limit to first 10 issues
        totalIssues: issues.length,
        quality: getQualityLevel(score)
    };
    
    logDebug(context, 'Data quality assessment completed', {
        score,
        quality: assessment.quality,
        completeness: `${completeness.toFixed(1)}%`,
        issuesCount: issues.length
    });
    
    return assessment;
}

/**
 * Determine quality level based on score
 * @param {number} score - Quality score (0-100)
 * @returns {string} Quality level
 */
function getQualityLevel(score) {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    if (score >= 40) return 'poor';
    return 'unacceptable';
}

/**
 * Circuit breaker pattern for failing operations
 */
export class CircuitBreaker {
    constructor(name, options = {}) {
        this.name = name;
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
        this.monitoringPeriod = options.monitoringPeriod || 60000; // 1 minute
        
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failures = 0;
        this.lastFailureTime = null;
        this.successCount = 0;
    }
    
    async execute(operation, context) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
                this.state = 'HALF_OPEN';
                this.successCount = 0;
                logInfo(context, `Circuit breaker ${this.name}: Moving to HALF_OPEN state`);
            } else {
                throw new Error(`Circuit breaker ${this.name} is OPEN - operation blocked`);
            }
        }
        
        try {
            const result = await operation();
            
            // Operation succeeded
            if (this.state === 'HALF_OPEN') {
                this.successCount++;
                if (this.successCount >= 2) { // Require 2 successful calls to close
                    this.state = 'CLOSED';
                    this.failures = 0;
                    this.lastFailureTime = null;
                    logInfo(context, `Circuit breaker ${this.name}: Closed after successful recovery`);
                }
            } else {
                this.failures = Math.max(0, this.failures - 1); // Gradually reduce failure count
            }
            
            return result;
            
        } catch (error) {
            this.failures++;
            this.lastFailureTime = Date.now();
            
            if (this.failures >= this.failureThreshold) {
                this.state = 'OPEN';
                context.error(`Circuit breaker ${this.name}: Opening due to ${this.failures} failures`);
            }
            
            throw error;
        }
    }
    
    getStatus() {
        return {
            name: this.name,
            state: this.state,
            failures: this.failures,
            lastFailureTime: this.lastFailureTime,
            successCount: this.successCount
        };
    }
}