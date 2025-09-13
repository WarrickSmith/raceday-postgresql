/**
 * Execution lock management for daily-meetings function
 * Implements fast-fail pattern to prevent concurrent executions
 */

import { ID } from 'node-appwrite';

const LOCK_DOCUMENT_ID = 'daily-meetings-lock';
const LOCK_COLLECTION_ID = 'function-locks';
const STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Fast lock check - must complete in <30ms to minimize CPU waste
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
        const processMetrics = JSON.stringify({
            meetingsProcessed: 0,
            racesProcessed: 0,
            currentOperation: 'initializing'
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
        context.log('Fast lock acquired successfully', {
            executionId,
            acquisitionTimeMs: acquisitionTime,
            targetTime: '<30ms',
            efficient: acquisitionTime < 30,
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
                    context.log('Detected stale lock, attempting cleanup', {
                        staleLockExecutionId: existingLock.executionId,
                        lockAgeMs: lockAge,
                        threshold: STALE_LOCK_THRESHOLD_MS,
                        lastHeartbeat: existingLock.lastHeartbeat
                    });

                    // Try to replace stale lock
                    await databases.deleteDocument(databaseId, LOCK_COLLECTION_ID, LOCK_DOCUMENT_ID);

                    // Retry lock acquisition after cleanup
                    const newLockDoc = {
                        executionId,
                        startTime: lockStartTime,
                        lastHeartbeat: lockStartTime,
                        status: 'running',
                        processMetrics: {
                            meetingsProcessed: 0,
                            racesProcessed: 0,
                            currentOperation: 'initializing-after-stale-cleanup'
                        },
                        nzTime: new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
                        resourceMetrics: {
                            memoryUsageStart: process.memoryUsage(),
                            cpuTimeStart: process.cpuUsage()
                        },
                        staleLockCleanup: {
                            previousExecutionId: existingLock.executionId,
                            cleanupTime: new Date().toISOString()
                        }
                    };

                    await databases.createDocument(databaseId, LOCK_COLLECTION_ID, LOCK_DOCUMENT_ID, newLockDoc);

                    const totalTime = Date.now() - startTime;
                    context.log('Lock acquired after stale cleanup', {
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
                    context.log('Lock held by active instance - terminating to save resources', {
                        activeExecutionId: existingLock.executionId,
                        activeLockAge: lockAge,
                        activeStatus: existingLock.status,
                        currentOperation: existingLock.processMetrics?.currentOperation,
                        lastHeartbeat: existingLock.lastHeartbeat,
                        fastTerminationTimeMs: acquisitionTime,
                        resourcesSaved: {
                            noApiInitialization: true,
                            noDataProcessing: true,
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
 * Update lock heartbeat during processing
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
            meetingsProcessed: progress.meetingsProcessed || 0,
            racesProcessed: progress.racesProcessed || 0,
            currentOperation: progress.currentOperation || 'processing',
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

        lockManager.context.log('Lock heartbeat updated', {
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
        lockManager.context.log('Execution completed - releasing lock', {
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

        lockManager.context.log('Lock released successfully', {
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

    lockManager.context.log('Heartbeat interval established', {
        executionId: lockManager.executionId,
        intervalMs: HEARTBEAT_INTERVAL_MS,
        intervalMinutes: HEARTBEAT_INTERVAL_MS / 1000 / 60
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
        const nzTime = new Date().toLocaleString('en-NZ', {
            timeZone: 'Pacific/Auckland',
            hour12: false
        });
        const nzTimeObj = new Date(nzTime);
        const nzHour = nzTimeObj.getHours();

        // Terminate if between 1:00 AM and 6:00 AM NZ time
        const shouldTerminate = nzHour >= 1 && nzHour < 6;

        if (shouldTerminate) {
            context.log('NZ time termination triggered', {
                nzTime,
                nzHour,
                terminationReason: 'Past 1:00 AM NZ time',
                timezone: 'Pacific/Auckland'
            });
        }

        return shouldTerminate;

    } catch (error) {
        context.error('Failed to check NZ termination time', {
            error: error.message
        });
        return false; // Don't terminate on error, let Appwrite timeout handle it
    }
}