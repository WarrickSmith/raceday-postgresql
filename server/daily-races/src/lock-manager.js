/**
 * Execution lock management for daily-races function
 * Implements fast-fail pattern to prevent concurrent executions
 * Target: <40ms lock acquisition time for optimal resource efficiency
 */

import { ID } from 'node-appwrite';
import { logDebug, logInfo, logWarn, logError } from './logging-utils.js';
import { shouldTerminateForNzTime as shouldTerminateForNzTimeUtil } from './timezone-utils.js';

const LOCK_DOCUMENT_ID = 'daily-races-lock';
const LOCK_COLLECTION_ID = 'function-locks';
const STALE_LOCK_THRESHOLD_MS = 6 * 60 * 1000; // 6 minutes (longer runtime potential)
const HEARTBEAT_INTERVAL_MS = 90 * 1000; // 90 seconds (progress-aware updates)

/**
 * Fast lock check - must complete in <40ms to minimize CPU waste
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
        // Try to create lock document atomically - this is our collision detection
        // Optimized for <40ms: minimal document creation, defer complex metrics to heartbeat
        const processMetrics = JSON.stringify({
            racesProcessed: 0,
            entrantsProcessed: 0,
            currentOperation: 'initializing'
        });

        const lockDoc = {
            executionId,
            startTime: lockStartTime,
            lastHeartbeat: lockStartTime,
            status: 'running',
            processMetrics: processMetrics.length > 1900 ? processMetrics.substring(0, 1900) : processMetrics,
            nzTime: new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })
        };

        await databases.createDocument(databaseId, LOCK_COLLECTION_ID, LOCK_DOCUMENT_ID, lockDoc);

        const acquisitionTime = Date.now() - startTime;
        logDebug(context, 'Fast lock acquired successfully', {
            executionId,
            acquisitionTimeMs: acquisitionTime,
            targetTime: '<40ms',
            efficient: acquisitionTime < 40,
            lockStartTime
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

        // Check if the collection doesn't exist - database should be set up by database-setup function
        if (error.message?.includes('Collection with the requested ID could not be found') ||
            error.code === 404) {
            context.error('Function locks collection not found - database setup required', {
                collectionId: LOCK_COLLECTION_ID,
                error: error.message,
                acquisitionTimeMs: Date.now() - startTime,
                solution: 'Run database-setup function first to create required collections'
            });
            return null;
        }

        // Check if this is a collision (another instance holds the lock)
        else if (error.code === 409 || error.message?.includes('Document with the requested ID already exists')) {
            // Try to check if existing lock is stale
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

                    // Try to replace stale lock
                    await databases.deleteDocument(databaseId, LOCK_COLLECTION_ID, LOCK_DOCUMENT_ID);

                    // Retry lock acquisition after cleanup - optimized for speed
                    const retryProcessMetrics = JSON.stringify({
                        racesProcessed: 0,
                        entrantsProcessed: 0,
                        currentOperation: 'initializing-after-stale-cleanup'
                    });

                    const newLockDoc = {
                        executionId,
                        startTime: lockStartTime,
                        lastHeartbeat: lockStartTime,
                        status: 'running',
                        processMetrics: retryProcessMetrics.length > 1900 ? retryProcessMetrics.substring(0, 1900) : retryProcessMetrics,
                        nzTime: new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })
                    };

                    await databases.createDocument(databaseId, LOCK_COLLECTION_ID, LOCK_DOCUMENT_ID, newLockDoc);

                    const totalTime = Date.now() - startTime;
                    logDebug(context, 'Lock acquired after stale cleanup', {
                        executionId,
                        totalAcquisitionTimeMs: totalTime,
                        staleLockCleanedUp: true
                    });

                    return {
                        executionId,
                        startTime: lockStartTime,
                        databases,
                        databaseId,
                        context
                    };
                } else {
                    // Active lock held by another instance
                    logDebug(context, 'Lock held by active instance - terminating to save resources', {
                        activeExecutionId: existingLock.executionId,
                        activeLockAge: lockAge,
                        activeStatus: existingLock.status,
                        currentOperation: existingLock.processMetrics?.currentOperation,
                        lastHeartbeat: existingLock.lastHeartbeat,
                        fastTerminationTimeMs: acquisitionTime,
                        resourcesSaved: {
                            noRaceQueryingInitialization: true,
                            noEntrantDataProcessing: true,
                            cpuTimeSaved: 'prevented expensive race operations'
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
            context.error('Unexpected error during fast lock acquisition', {
                error: error.message,
                acquisitionTimeMs: acquisitionTime,
                executionId
            });
            return null;
        }
    }
}

/**
 * Update lock heartbeat during processing with race-specific progress
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
            racesProcessed: progress.racesProcessed || 0,
            entrantsProcessed: progress.entrantsProcessed || 0,
            currentOperation: progress.currentOperation || 'processing',
            currentRaceProcessing: progress.currentRaceProcessing || 'none',
            chunkedProcessingState: progress.chunkedProcessingState || 'unknown',
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

        logDebug(lockManager.context, 'Lock heartbeat updated', {
            executionId: lockManager.executionId,
            heartbeatTime: now,
            progress: progress,
            memoryUsageMB: Math.round(currentMemory.heapUsed / 1024 / 1024)
        });

    } catch (error) {
        lockManager.context.error('Failed to update lock heartbeat', {
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
        logDebug(lockManager.context, 'Execution completed - releasing lock', {
            executionId: lockManager.executionId,
            status,
            executionDurationMs: executionDuration,
            executionDurationMinutes: Math.round(executionDuration / 1000 / 60 * 10) / 10,
            completionStats,
            finalMemoryUsageMB: Math.round(finalMemory.heapUsed / 1024 / 1024),
            resourceEfficiency: {
                peakMemoryMB: Math.round(finalMemory.heapUsed / 1024 / 1024),
                totalExecutionTime: `${Math.round(executionDuration / 1000)}s`,
                cpuUserTime: finalCpu.user,
                cpuSystemTime: finalCpu.system,
                status: status
            }
        });

        await lockManager.databases.deleteDocument(
            lockManager.databaseId,
            LOCK_COLLECTION_ID,
            LOCK_DOCUMENT_ID
        );

        logDebug(lockManager.context, 'Lock released successfully', {
            executionId: lockManager.executionId,
            endTime,
            finalStatus: status
        });

    } catch (error) {
        lockManager.context.error('Failed to release execution lock', {
            executionId: lockManager.executionId,
            error: error.message,
            status
        });
    }
}

/**
 * Set up automatic heartbeat interval for race processing
 * @param {Object} lockManager - Lock manager object
 * @param {Object} progressTracker - Object that will be updated with progress
 * @returns {NodeJS.Timeout} Interval ID for cleanup
 */
export function setupHeartbeatInterval(lockManager, progressTracker) {
    if (!lockManager) return null;

    const intervalId = setInterval(async () => {
        await updateHeartbeat(lockManager, progressTracker);
    }, HEARTBEAT_INTERVAL_MS);

    logDebug(lockManager.context, 'Heartbeat interval established', {
        executionId: lockManager.executionId,
        intervalMs: HEARTBEAT_INTERVAL_MS,
        intervalSeconds: HEARTBEAT_INTERVAL_MS / 1000,
        purpose: 'progress-aware race processing updates'
    });

    return intervalId;
}

/**
 * Check if current NZ time is past 1:00 AM (termination time)
 * @param {Object} context - Appwrite function context for logging
 * @returns {boolean} True if should terminate
 */
export function shouldTerminateForNzTime(context) {
    try {
        // Use DST-aware timezone utility for consistent timezone handling
        const shouldTerminate = shouldTerminateForNzTimeUtil();

        if (shouldTerminate) {
            logDebug(context, 'Daily races NZ time termination triggered (DST-aware)', {
                terminationReason: 'Past 1:00 AM NZ time',
                timezone: 'Pacific/Auckland',
                dstAware: true
            });
        }

        return shouldTerminate;

    } catch (error) {
        context.error('Failed to check daily races NZ termination time', {
            error: error.message
        });
        return false; // Don't terminate on error, let Appwrite timeout handle it
    }
}