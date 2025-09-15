/**
 * Execution lock management for meeting-status-poller function
 * Implements fast-fail pattern to prevent concurrent executions with midnight boundary protection
 * Addresses critical CRON schedule overlap issue: schedule spans midnight boundary
 */

import { ID } from 'node-appwrite';
import { logDebug, logInfo, logWarn, logError } from './logging-utils.js';

const LOCK_DOCUMENT_ID = 'meeting-status-poller-lock';
const LOCK_COLLECTION_ID = 'function-locks';
const STALE_LOCK_THRESHOLD_MS = 4 * 60 * 1000; // 4 minutes (accounting for midnight boundary)
const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Fast lock check with midnight boundary validation - must complete in <35ms
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {Object} context - Appwrite function context for logging
 * @returns {Object|null} Lock object if acquired, null if lock held by another instance
 */
export async function fastLockCheck(databases, databaseId, context) {
    const startTime = Date.now();
    const executionId = ID.unique();
    const lockStartTime = new Date().toISOString();

    try {
        // CRITICAL: Midnight boundary validation before any processing
        const midnightBoundaryCheck = validateMidnightBoundary(context);
        if (!midnightBoundaryCheck.safeToExecute) {
            logDebug(context,'Midnight boundary validation blocked execution', {
                reason: midnightBoundaryCheck.reason,
                nzTime: midnightBoundaryCheck.nzTime,
                nzHour: midnightBoundaryCheck.nzHour,
                preventingDayTransitionConflicts: true
            });
            return null;
        }

        // Try to create lock document atomically - this is our collision detection
        const processMetrics = JSON.stringify({
            meetingsChecked: 0,
            meetingsUpdated: 0,
            totalFieldsUpdated: 0,
            currentOperation: 'initializing',
            midnightBoundaryValidated: true
        });

        const resourceMetrics = JSON.stringify({
            memoryUsageStart: process.memoryUsage(),
            cpuTimeStart: process.cpuUsage(),
            midnightBoundary: midnightBoundaryCheck
        });

        const lockDoc = {
            executionId,
            startTime: lockStartTime,
            lastHeartbeat: lockStartTime,
            status: 'running',
            processMetrics: processMetrics.length > 1900 ? processMetrics.substring(0, 1900) : processMetrics,
            nzTime: new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
            resourceMetrics: resourceMetrics.length > 1900 ? resourceMetrics.substring(0, 1900) : resourceMetrics
        };

        await databases.createDocument(databaseId, LOCK_COLLECTION_ID, LOCK_DOCUMENT_ID, lockDoc);

        const acquisitionTime = Date.now() - startTime;
        logDebug(context,'Meeting status poller fast lock acquired successfully', {
            executionId,
            acquisitionTimeMs: acquisitionTime,
            targetTime: '<35ms',
            efficient: acquisitionTime < 35,
            lockStartTime,
            midnightBoundaryProtected: true,
            cronScheduleProtected: true
        });

        // Return lock management object
        return {
            executionId,
            startTime: lockStartTime,
            databases,
            databaseId,
            context,
            midnightBoundaryValidated: true
        };

    } catch (error) {
        const acquisitionTime = Date.now() - startTime;

        // Check if the collection doesn't exist - database should be set up by database-setup function
        if (error.message?.includes('Collection with the requested ID could not be found') ||
            error.code === 404) {
            context.error('Function locks collection not found - database setup required', {
                collectionId: LOCK_COLLECTION_ID,
                error: error.message,
                acquisitionTimeMs: acquisitionTime,
                solution: 'Run database-setup function first to create required collections'
            });
            return null;
        }

        // Check if this is a collision (another instance holds the lock)
        else if (error.code === 409 || error.message?.includes('Document with the requested ID already exists')) {
            // Try to check if existing lock is stale with midnight boundary awareness
            try {
                const existingLock = await databases.getDocument(databaseId, LOCK_COLLECTION_ID, LOCK_DOCUMENT_ID);
                const lockAge = Date.now() - new Date(existingLock.lastHeartbeat).getTime();

                // Enhanced stale lock detection with day-boundary check
                const midnightAwareStalenessCheck = isLockStaleWithBoundaryCheck(existingLock, lockAge, context);

                if (midnightAwareStalenessCheck.isStale) {
                    logDebug(context,'Detected stale lock with midnight boundary awareness, attempting cleanup', {
                        staleLockExecutionId: existingLock.executionId,
                        lockAgeMs: lockAge,
                        threshold: STALE_LOCK_THRESHOLD_MS,
                        lastHeartbeat: existingLock.lastHeartbeat,
                        boundaryAwareness: midnightAwareStalenessCheck.reason,
                        midnightTransitionProtection: true
                    });

                    // Try to replace stale lock with boundary validation
                    await databases.deleteDocument(databaseId, LOCK_COLLECTION_ID, LOCK_DOCUMENT_ID);

                    // Re-validate midnight boundary before retry
                    const retryBoundaryCheck = validateMidnightBoundary(context);
                    if (!retryBoundaryCheck.safeToExecute) {
                        logDebug(context,'Midnight boundary blocked retry after stale cleanup', retryBoundaryCheck);
                        return null;
                    }

                    // Retry lock acquisition after cleanup - optimized for speed
                    const retryProcessMetrics = JSON.stringify({
                        meetingsChecked: 0,
                        meetingsUpdated: 0,
                        totalFieldsUpdated: 0,
                        currentOperation: 'initializing-after-stale-cleanup',
                        midnightBoundaryRevalidated: true
                    });

                    const retryResourceMetrics = JSON.stringify({
                        memoryUsageStart: process.memoryUsage(),
                        cpuTimeStart: process.cpuUsage(),
                        staleLockCleanup: {
                            previousExecutionId: existingLock.executionId,
                            cleanupTime: new Date().toISOString()
                        },
                        midnightBoundary: retryBoundaryCheck
                    });

                    const newLockDoc = {
                        executionId,
                        startTime: lockStartTime,
                        lastHeartbeat: lockStartTime,
                        status: 'running',
                        processMetrics: retryProcessMetrics.length > 1900 ? retryProcessMetrics.substring(0, 1900) : retryProcessMetrics,
                        nzTime: new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
                        resourceMetrics: retryResourceMetrics.length > 1900 ? retryResourceMetrics.substring(0, 1900) : retryResourceMetrics
                    };

                    await databases.createDocument(databaseId, LOCK_COLLECTION_ID, LOCK_DOCUMENT_ID, newLockDoc);

                    const totalTime = Date.now() - startTime;
                    logDebug(context,'Meeting status poller lock acquired after stale cleanup', {
                        executionId,
                        totalAcquisitionTimeMs: totalTime,
                        staleLockCleanedUp: true,
                        midnightBoundaryProtected: true
                    });

                    return {
                        executionId,
                        startTime: lockStartTime,
                        databases,
                        databaseId,
                        context,
                        midnightBoundaryValidated: true
                    };
                } else {
                    // Active lock held by another instance
                    logDebug(context,'Lock held by active instance - terminating to save resources', {
                        activeExecutionId: existingLock.executionId,
                        activeLockAge: lockAge,
                        activeStatus: existingLock.status,
                        currentOperation: JSON.parse(existingLock.processMetrics || '{}').currentOperation,
                        lastHeartbeat: existingLock.lastHeartbeat,
                        fastTerminationTimeMs: acquisitionTime,
                        cronScheduleProtection: 'preventing-overlap',
                        resourcesSaved: {
                            noApiInitialization: true,
                            noMeetingQueries: true,
                            noDatabaseScanning: true,
                            cpuTimeSaved: 'prevented expensive operations'
                        }
                    });
                    return null;
                }
            } catch (getLockError) {
                context.error('Failed to check existing lock status', {
                    error: getLockError.message,
                    acquisitionTimeMs: acquisitionTime
                });
                return null;
            }
        } else {
            // Unexpected error during lock acquisition
            context.error('Unexpected error during meeting status poller lock acquisition', {
                error: error.message,
                acquisitionTimeMs: acquisitionTime,
                executionId,
                cronScheduleImpacted: 'every-15-minutes-21-to-11'
            });
            return null;
        }
    }
}

/**
 * Validate execution time window for meeting-status-poller
 * CRON Schedule: every-15-minutes-21-to-11 (UTC) = 9:00AM-11:59PM NZST
 * This means the function SHOULD run during NZ racing hours, not block them!
 * @param {Object} context - Appwrite function context for logging
 * @returns {Object} Boundary validation result
 */
function validateMidnightBoundary(context) {
    try {
        const nzTime = new Date().toLocaleString('en-NZ', {
            timeZone: 'Pacific/Auckland',
            hour12: false
        });
        const nzTimeObj = new Date(nzTime);
        const nzHour = nzTimeObj.getHours();
        const nzMinute = nzTimeObj.getMinutes();

        // Function should run from 9:00 AM to 11:59 PM NZST (scheduled by UTC CRON)
        // Only block execution if we're outside the intended racing hours
        const isOutsideRacingHours = nzHour >= 0 && nzHour < 9; // 12:00 AM - 8:59 AM NZST

        // The real concern is preventing overlap at boundaries, not blocking racing hours
        // Allow execution during normal racing hours (9:00 AM - 11:59 PM NZST)
        const isPastTerminationTime = nzHour >= 0 && nzHour < 8; // More conservative: 12:00 AM - 7:59 AM

        const validationResult = {
            nzTime,
            nzHour,
            nzMinute,
            isOutsideRacingHours,
            isPastTerminationTime,
            safeToExecute: !isPastTerminationTime, // Allow execution during racing hours
            reason: isPastTerminationTime ? 'outside-racing-hours-nz-time' : 'within-racing-hours-safe',
            racingHours: '9:00 AM - 11:59 PM NZST',
            cronScheduleUTC: '21-23,0-11 UTC'
        };

        if (isPastTerminationTime) {
            logDebug(context,'Execution blocked - outside NZ racing hours', {
                nzTime,
                nzHour,
                racingHours: '9:00 AM - 11:59 PM NZST',
                currentlyBlocked: 'outside-racing-hours'
            });
        }

        return validationResult;

    } catch (error) {
        context.error('Failed to validate racing hours boundary', {
            error: error.message
        });
        // Default to safe execution if timezone validation fails
        return {
            safeToExecute: true,
            reason: 'timezone-validation-failed-defaulting-to-safe',
            racingHours: '9:00 AM - 11:59 PM NZST (intended)'
        };
    }
}

/**
 * Enhanced stale lock detection with midnight boundary awareness
 * @param {Object} existingLock - Existing lock document
 * @param {number} lockAge - Age of lock in milliseconds
 * @param {Object} context - Appwrite function context for logging
 * @returns {Object} Staleness determination with boundary awareness
 */
function isLockStaleWithBoundaryCheck(existingLock, lockAge, context) {
    const standardStaleCheck = lockAge > STALE_LOCK_THRESHOLD_MS;

    try {
        // Parse existing lock's NZ time for day boundary analysis
        const lockNzTime = existingLock.nzTime;
        const currentNzTime = new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });

        // Check if lock spans a day boundary (different dates)
        const lockDate = new Date(lockNzTime).toDateString();
        const currentDate = new Date(currentNzTime).toDateString();
        const spansDateBoundary = lockDate !== currentDate;

        // If lock spans day boundary and is older than 2 minutes, consider stale
        const boundaryAwareStale = spansDateBoundary && lockAge > (2 * 60 * 1000);

        const isStale = standardStaleCheck || boundaryAwareStale;
        const reason = boundaryAwareStale ? 'spans-day-boundary' :
                      standardStaleCheck ? 'exceeded-age-threshold' : 'active-lock';

        return {
            isStale,
            reason,
            lockAge,
            spansDateBoundary,
            lockNzTime,
            currentNzTime
        };

    } catch (error) {
        context.error('Failed boundary-aware stale lock detection', {
            error: error.message,
            lockAge,
            fallbackToStandardCheck: standardStaleCheck
        });

        return {
            isStale: standardStaleCheck,
            reason: 'boundary-check-failed-standard-fallback',
            lockAge
        };
    }
}

/**
 * Update lock heartbeat during processing with meeting-specific progress
 * @param {Object} lockManager - Lock manager object from fastLockCheck
 * @param {Object} progress - Current progress metrics
 */
export async function updateHeartbeat(lockManager, progress = {}) {
    if (!lockManager) return;

    try {
        const now = new Date().toISOString();
        const currentMemory = process.memoryUsage();
        const currentCpu = process.cpuUsage();

        const processMetrics = JSON.stringify({
            meetingsChecked: progress.meetingsChecked || 0,
            meetingsUpdated: progress.meetingsUpdated || 0,
            totalFieldsUpdated: progress.totalFieldsUpdated || 0,
            currentOperation: progress.currentOperation || 'processing',
            currentMeeting: progress.currentMeeting || 'unknown',
            ...progress
        });

        const resourceMetrics = JSON.stringify({
            memoryUsageCurrent: currentMemory,
            cpuTimeCurrent: currentCpu,
            heartbeatTime: now,
            memoryUsageMB: Math.round(currentMemory.heapUsed / 1024 / 1024)
        });

        const updateData = {
            lastHeartbeat: now,
            nzTime: new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
            processMetrics: processMetrics.length > 1900 ? processMetrics.substring(0, 1900) : processMetrics,
            resourceMetrics: resourceMetrics.length > 1900 ? resourceMetrics.substring(0, 1900) : resourceMetrics
        };

        await lockManager.databases.updateDocument(
            lockManager.databaseId,
            LOCK_COLLECTION_ID,
            LOCK_DOCUMENT_ID,
            updateData
        );

        logDebug(lockManager.context, 'Meeting status poller lock heartbeat updated', {
            executionId: lockManager.executionId,
            heartbeatTime: now,
            progress: progress,
            memoryUsageMB: Math.round(currentMemory.heapUsed / 1024 / 1024),
            cronScheduleProtection: 'active'
        });

    } catch (error) {
        lockManager.context.error('Failed to update meeting status poller lock heartbeat', {
            executionId: lockManager.executionId,
            error: error.message
        });
    }
}

/**
 * Release execution lock with completion metrics
 * @param {Object} lockManager - Lock manager object from fastLockCheck
 * @param {Object} completionStats - Final execution statistics
 * @param {string} status - Completion status ('completed', 'failed', 'terminated')
 */
export async function releaseLock(lockManager, completionStats = {}, status = 'completed') {
    if (!lockManager) return;

    try {
        const endTime = new Date().toISOString();
        const executionDuration = Date.now() - new Date(lockManager.startTime).getTime();
        const finalMemory = process.memoryUsage();
        const finalCpu = process.cpuUsage();

        // Log completion summary before releasing lock
        logDebug(lockManager.context, 'Meeting status poller execution completed - releasing lock', {
            executionId: lockManager.executionId,
            status,
            executionDurationMs: executionDuration,
            executionDurationSeconds: Math.round(executionDuration / 1000),
            completionStats,
            finalMemoryUsageMB: Math.round(finalMemory.heapUsed / 1024 / 1024),
            cronScheduleCompliance: 'every-15-minutes-21-to-11',
            midnightBoundaryProtected: lockManager.midnightBoundaryValidated,
            resourceEfficiency: {
                peakMemoryMB: Math.round(finalMemory.heapUsed / 1024 / 1024),
                totalExecutionTime: `${Math.round(executionDuration / 1000)}s`,
                cpuUserTime: finalCpu.user,
                cpuSystemTime: finalCpu.system,
                status: status,
                under270sLimit: executionDuration < 270000
            }
        });

        await lockManager.databases.deleteDocument(
            lockManager.databaseId,
            LOCK_COLLECTION_ID,
            LOCK_DOCUMENT_ID
        );

        logDebug(lockManager.context, 'Meeting status poller lock released successfully', {
            executionId: lockManager.executionId,
            endTime,
            finalStatus: status,
            overlapPrevention: 'successful'
        });

    } catch (error) {
        lockManager.context.error('Failed to release meeting status poller execution lock', {
            executionId: lockManager.executionId,
            error: error.message,
            status
        });
    }
}

/**
 * Set up automatic heartbeat interval
 * @param {Object} lockManager - Lock manager object
 * @param {Object} progressTracker - Object that will be updated with progress
 * @returns {NodeJS.Timeout} Interval ID for cleanup
 */
export function setupHeartbeatInterval(lockManager, progressTracker) {
    if (!lockManager) return null;

    const intervalId = setInterval(async () => {
        await updateHeartbeat(lockManager, progressTracker);
    }, HEARTBEAT_INTERVAL_MS);

    logDebug(lockManager.context, 'Meeting status poller heartbeat interval established', {
        executionId: lockManager.executionId,
        intervalMs: HEARTBEAT_INTERVAL_MS,
        intervalMinutes: HEARTBEAT_INTERVAL_MS / 1000 / 60,
        cronScheduleProtection: 'every-15-minutes-21-to-11'
    });

    return intervalId;
}

/**
 * Check if current NZ time is outside racing hours (should terminate)
 * Racing Hours: 9:00 AM - 11:59 PM NZST (via UTC CRON 21-23,0-11)
 * @param {Object} context - Appwrite function context for logging
 * @returns {boolean} True if should terminate (outside racing hours)
 */
export function shouldTerminateForNzTime(context) {
    try {
        const nzTime = new Date().toLocaleString('en-NZ', {
            timeZone: 'Pacific/Auckland',
            hour12: false
        });
        const nzTimeObj = new Date(nzTime);
        const nzHour = nzTimeObj.getHours();

        // Terminate if outside NZ racing hours (12:00 AM - 8:59 AM NZST)
        // Racing hours are 9:00 AM - 11:59 PM NZST
        const shouldTerminate = nzHour >= 0 && nzHour < 8;

        if (shouldTerminate) {
            logDebug(context,'Meeting status poller NZ time termination triggered - outside racing hours', {
                nzTime,
                nzHour,
                terminationReason: 'Outside NZ racing hours',
                racingHours: '9:00 AM - 11:59 PM NZST',
                timezone: 'Pacific/Auckland',
                cronScheduleUTC: '21-23,0-11 UTC'
            });
        }

        return shouldTerminate;

    } catch (error) {
        context.error('Failed to check NZ racing hours for meeting status poller', {
            error: error.message
        });
        return false; // Don't terminate on error, let Appwrite timeout handle it
    }
}