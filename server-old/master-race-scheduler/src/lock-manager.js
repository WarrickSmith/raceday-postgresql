/**
 * Execution lock management for master-race-scheduler function
 * Implements ultra-fast-fail pattern optimized for every-minute execution
 *
 * Critical Performance Requirements:
 * - Lock check must complete in <15ms for high-frequency execution
 * - 90-second lock expiration (well under 120s timeout)
 * - Aggressive stale lock detection (>75 seconds)
 * - Midnight boundary detection for day-transition conflicts
 */

import { ID } from 'node-appwrite';
import { logDebug, logInfo, logWarn, logError } from './logging-utils.js';

const LOCK_DOCUMENT_ID = 'master-race-scheduler-lock';
const LOCK_COLLECTION_ID = 'function-locks';
const STALE_LOCK_THRESHOLD_MS = 75 * 1000; // 75 seconds (aggressive for frequent execution)
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds (frequent updates)

/**
 * Ultra-fast lock check - must complete in <15ms for high-frequency execution
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
        // Calculate midnight boundary info (store in processMetrics, not root level)
        const nzTime = new Date().toLocaleString('en-NZ', {
            timeZone: 'Pacific/Auckland',
            hour12: false
        });
        const nzHour = parseInt(nzTime.split(' ')[1].split(':')[0]);
        const isMidnightBoundary = nzHour >= 23 || nzHour <= 1;

        // Lock document structure matching daily-meetings exactly
        const processMetrics = JSON.stringify({
            racesAnalyzed: 0,
            racesScheduled: 0,
            currentOperation: 'initializing',
            // Store midnight boundary info inside JSON, not as root fields
            midnightBoundaryInfo: {
                nzHour,
                isMidnightBoundary,
                schedulerOptimized: true
            }
        });

        const resourceMetrics = JSON.stringify({
            memoryUsageStart: process.memoryUsage(),
            cpuTimeStart: process.cpuUsage()
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
        logDebug(context, 'Ultra-fast lock acquired successfully', {
            executionId,
            acquisitionTimeMs: acquisitionTime,
            targetTime: '<15ms',
            ultraFastSuccess: acquisitionTime < 15,
            lockStartTime,
            midnightBoundaryDetected: isMidnightBoundary,
            nzHour
        });

        // Return lock management object
        return {
            executionId,
            startTime: lockStartTime,
            databases,
            databaseId,
            context
        };

    } catch (error) {
        const acquisitionTime = Date.now() - startTime;

        // Check if the collection doesn't exist
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
            // Try to check if existing lock is stale - optimized for speed
            try {
                const existingLock = await databases.getDocument(databaseId, LOCK_COLLECTION_ID, LOCK_DOCUMENT_ID);
                const lockAge = Date.now() - new Date(existingLock.lastHeartbeat).getTime();

                if (lockAge > STALE_LOCK_THRESHOLD_MS) {
                    logDebug(context, 'Detected stale lock, attempting cleanup', {
                        staleLockExecutionId: existingLock.executionId,
                        lockAgeMs: lockAge,
                        threshold: STALE_LOCK_THRESHOLD_MS,
                        lastHeartbeat: existingLock.lastHeartbeat
                    });

                    // Try to replace stale lock atomically
                    await databases.deleteDocument(databaseId, LOCK_COLLECTION_ID, LOCK_DOCUMENT_ID);

                    // Retry lock acquisition after cleanup - optimized for speed
                    const retryProcessMetrics = JSON.stringify({
                        racesAnalyzed: 0,
                        racesScheduled: 0,
                        currentOperation: 'initializing-after-stale-cleanup',
                        midnightBoundaryInfo: {
                            nzHour,
                            isMidnightBoundary,
                            schedulerOptimized: true
                        }
                    });

                    const resourceMetrics = JSON.stringify({
                        memoryUsageStart: process.memoryUsage(),
                        cpuTimeStart: process.cpuUsage(),
                        staleLockCleanup: {
                            previousExecutionId: existingLock.executionId,
                            cleanupTime: new Date().toISOString()
                        }
                    });

                    const newLockDoc = {
                        executionId,
                        startTime: lockStartTime,
                        lastHeartbeat: lockStartTime,
                        status: 'running',
                        processMetrics: retryProcessMetrics.length > 1900 ? retryProcessMetrics.substring(0, 1900) : retryProcessMetrics,
                        nzTime: new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
                        resourceMetrics: resourceMetrics.length > 1900 ? resourceMetrics.substring(0, 1900) : resourceMetrics
                    };

                    await databases.createDocument(databaseId, LOCK_COLLECTION_ID, LOCK_DOCUMENT_ID, newLockDoc);

                    const totalTime = Date.now() - startTime;
                    logDebug(context, 'Lock acquired after stale cleanup', {
                        executionId,
                        totalAcquisitionTimeMs: totalTime,
                        staleLockCleanedUp: true,
                        ultraFastRecovery: totalTime < 25
                    });

                    return {
                        executionId,
                        startTime: lockStartTime,
                        databases,
                        databaseId,
                        context
                    };
                } else {
                    // Active lock held by another instance - check for rapid termination detection
                    const rapidTermination = acquisitionTime < 20; // Ultra-fast termination achieved

                    logDebug(context, 'Lock held by active instance - ultra-fast termination', {
                        activeExecutionId: existingLock.executionId,
                        activeLockAge: lockAge,
                        activeStatus: existingLock.status,
                        currentOperation: existingLock.processMetrics?.currentOperation,
                        lastHeartbeat: existingLock.lastHeartbeat,
                        ultraFastTerminationTimeMs: acquisitionTime,
                        rapidTerminationSuccess: rapidTermination,
                        isMidnightBoundary,
                        resourcesSaved: {
                            noRaceQueries: true,
                            noSchedulingLogic: true,
                            noFunctionTriggering: true,
                            cpuTimeSaved: 'prevented all expensive operations'
                        }
                    });
                    return null;
                }
            } catch (getLockError) {
                context.error('Failed to check existing lock status', {
                    error: getLockError.message,
                    acquisitionTimeMs: acquisitionTime,
                    highFrequencyImpact: 'lock validation failed'
                });
                return null;
            }
        } else {
            // Unexpected error during lock acquisition
            context.error('Unexpected error during ultra-fast lock acquisition', {
                error: error.message,
                acquisitionTimeMs: acquisitionTime,
                executionId,
                highFrequencyExecution: true
            });
            return null;
        }
    }
}

/**
 * Update lock heartbeat with micro-progress tracking
 * @param {Object} lockManager - Lock manager object from fastLockCheck
 * @param {Object} progress - Current progress metrics
 */
export async function updateHeartbeat(lockManager, progress = {}) {
    if (!lockManager) return;

    try {
        const now = new Date().toISOString();
        const currentMemory = process.memoryUsage();
        const currentCpu = process.cpuUsage();

        // Calculate midnight boundary info (store in processMetrics JSON)
        const nzTime = new Date().toLocaleString('en-NZ', {
            timeZone: 'Pacific/Auckland',
            hour12: false
        });
        const nzHour = parseInt(nzTime.split(' ')[1].split(':')[0]);
        const isMidnightBoundary = nzHour >= 23 || nzHour <= 1;

        const processMetrics = JSON.stringify({
            racesAnalyzed: progress.racesAnalyzed || 0,
            racesScheduled: progress.racesScheduled || 0,
            currentOperation: progress.currentOperation || 'scheduling',
            midnightBoundaryInfo: {
                nzHour,
                isMidnightBoundary,
                schedulerOptimized: true
            },
            ...progress
        });

        const resourceMetrics = JSON.stringify({
            memoryUsageCurrent: currentMemory,
            cpuTimeCurrent: currentCpu,
            heartbeatTime: now
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

        logDebug(lockManager.context, 'Micro-heartbeat updated', {
            executionId: lockManager.executionId,
            heartbeatTime: now,
            progress: {
                racesAnalyzed: progress.racesAnalyzed || 0,
                racesScheduled: progress.racesScheduled || 0,
                currentOperation: progress.currentOperation
            },
            memoryUsageMB: Math.round(currentMemory.heapUsed / 1024 / 1024),
            midnightBoundaryDetected: isMidnightBoundary
        });

    } catch (error) {
        lockManager.context.error('Failed to update micro-heartbeat', {
            executionId: lockManager.executionId,
            error: error.message
        });
    }
}

/**
 * Release execution lock with scheduling efficiency metrics
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

        // Calculate scheduling efficiency metrics
        const schedulingEfficiency = {
            racesPerSecond: completionStats.racesScheduled ?
                (completionStats.racesScheduled / (executionDuration / 1000)).toFixed(2) : 0,
            avgTimePerRace: completionStats.racesScheduled ?
                Math.round(executionDuration / completionStats.racesScheduled) : 0,
            totalExecutionTimeMs: executionDuration,
            highFrequencyOptimization: executionDuration < 30000 // Under 30 seconds for every-minute execution
        };

        // Log completion summary before releasing lock
        logDebug(lockManager.context, 'Master scheduler execution completed - releasing lock', {
            executionId: lockManager.executionId,
            status,
            executionDurationMs: executionDuration,
            executionDurationSeconds: Math.round(executionDuration / 1000),
            completionStats,
            schedulingEfficiency,
            finalMemoryUsageMB: Math.round(finalMemory.heapUsed / 1024 / 1024),
            resourceEfficiency: {
                peakMemoryMB: Math.round(finalMemory.heapUsed / 1024 / 1024),
                totalExecutionTime: `${Math.round(executionDuration / 1000)}s`,
                cpuUserTime: finalCpu.user,
                cpuSystemTime: finalCpu.system,
                status: status,
                everyMinuteOptimized: executionDuration < 45000 // Well under 120s timeout
            }
        });

        await lockManager.databases.deleteDocument(
            lockManager.databaseId,
            LOCK_COLLECTION_ID,
            LOCK_DOCUMENT_ID
        );

        logDebug(lockManager.context, 'Master scheduler lock released successfully', {
            executionId: lockManager.executionId,
            endTime,
            finalStatus: status,
            nextExecutionIn: '60 seconds (CRON)'
        });

    } catch (error) {
        lockManager.context.error('Failed to release master scheduler lock', {
            executionId: lockManager.executionId,
            error: error.message,
            status
        });
    }
}

/**
 * Set up automatic micro-heartbeat interval optimized for frequent execution
 * @param {Object} lockManager - Lock manager object
 * @param {Object} progressTracker - Object that will be updated with progress
 * @returns {NodeJS.Timeout} Interval ID for cleanup
 */
export function setupHeartbeatInterval(lockManager, progressTracker) {
    if (!lockManager) return null;

    const intervalId = setInterval(async () => {
        await updateHeartbeat(lockManager, progressTracker);
    }, HEARTBEAT_INTERVAL_MS);

    logDebug(lockManager.context, 'Micro-heartbeat interval established', {
        executionId: lockManager.executionId,
        intervalMs: HEARTBEAT_INTERVAL_MS,
        intervalSeconds: HEARTBEAT_INTERVAL_MS / 1000,
        optimizedForHighFrequency: true
    });

    return intervalId;
}

/**
 * Check if current NZ time requires termination (1:00 AM NZST)
 * Master scheduler runs every minute, so early termination prevents resource waste
 * @param {Object} context - Appwrite function context for logging
 * @returns {boolean} True if should terminate
 */
export function shouldTerminateForNzTime(context) {
    try {
        const nzTime = new Date().toLocaleString('en-NZ', {
            timeZone: 'Pacific/Auckland',
            hour12: false
        });
        const nzHour = parseInt(nzTime.split(' ')[1].split(':')[0]);

        // Terminate at 1:00 AM NZ time (more aggressive than other functions due to frequent execution)
        const shouldTerminate = nzHour >= 1 && nzHour < 9; // Terminate until 9 AM when racing starts

        if (shouldTerminate) {
            logDebug(context, 'NZ time termination triggered for master scheduler', {
                nzTime,
                nzHour,
                terminationReason: 'Outside racing hours (1:00-9:00 AM NZST)',
                timezone: 'Pacific/Auckland',
                highFrequencyOptimization: 'preventing unnecessary every-minute executions'
            });
        }

        return shouldTerminate;

    } catch (error) {
        context.error('Failed to check NZ termination time for master scheduler', {
            error: error.message
        });
        return false; // Don't terminate on error, let Appwrite timeout handle it
    }
}

/**
 * Check for automatic backoff if multiple rapid terminations detected
 * @param {Object} context - Appwrite function context
 * @returns {boolean} True if should implement backoff
 */
export function shouldImplementBackoff(context) {
    // In a production system, this could check for repeated rapid terminations
    // and implement exponential backoff to reduce system load
    // For now, rely on the natural CRON scheduling
    return false;
}