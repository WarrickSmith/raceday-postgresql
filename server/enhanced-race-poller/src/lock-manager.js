/**
 * Execution lock management for enhanced-race-poller function
 * Implements fast-fail pattern with race-specific granularity to prevent concurrent executions
 *
 * CRITICAL: Enhanced-race-poller has frequent execution pattern requiring <25ms lock check
 */

import { ID } from 'node-appwrite';

const LOCK_DOCUMENT_ID = 'enhanced-race-poller-lock';
const LOCK_COLLECTION_ID = 'function-locks';
const STALE_LOCK_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes (shorter due to expected frequent polling)
const HEARTBEAT_INTERVAL_MS = 45 * 1000; // 45 seconds

/**
 * Ultra-fast lock check - MUST complete in <25ms to minimize CPU waste
 * Given frequent execution pattern of enhanced-race-poller
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
            racesProcessed: 0,
            successfulRaces: 0,
            failedRaces: 0,
            currentOperation: 'initializing',
            executionMode: 'unknown',
            // Race-specific granularity tracking within processMetrics
            ultraCriticalRaces: 0,
            criticalRaces: 0,
            normalRaces: 0,
            currentBatch: 'initialization'
        });

        const resourceMetrics = JSON.stringify({
            memoryUsageStart: process.memoryUsage(),
            cpuTimeStart: process.cpuUsage(),
            pollingTarget: 'race-selection-pending',
            // Enhanced race poller specific resource tracking
            pollingEfficiency: {
                redundancyPrevention: 0,
                apiCallsSaved: 0
            }
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
        context.log('Ultra-fast lock acquired successfully', {
            executionId,
            acquisitionTimeMs: acquisitionTime,
            targetTime: '<25ms',
            efficient: acquisitionTime < 25,
            frequentExecutionOptimized: true,
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
                acquisitionTimeMs: acquisitionTime,
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

                    // Retry lock acquisition after cleanup - optimized for ultra-speed
                    const retryProcessMetrics = JSON.stringify({
                        racesProcessed: 0,
                        successfulRaces: 0,
                        failedRaces: 0,
                        currentOperation: 'initializing-after-stale-cleanup',
                        executionMode: 'recovery-from-stale',
                        // Race-specific granularity tracking within processMetrics
                        ultraCriticalRaces: 0,
                        criticalRaces: 0,
                        normalRaces: 0,
                        currentBatch: 'initialization-after-cleanup'
                    });

                    const resourceMetrics = JSON.stringify({
                        memoryUsageStart: process.memoryUsage(),
                        cpuTimeStart: process.cpuUsage(),
                        staleLockCleanup: {
                            previousExecutionId: existingLock.executionId,
                            cleanupTime: new Date().toISOString()
                        },
                        pollingEfficiency: {
                            redundancyPrevention: 0,
                            apiCallsSaved: 0
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
                    context.log('Ultra-fast lock acquired after stale cleanup', {
                        executionId,
                        totalAcquisitionTimeMs: totalTime,
                        staleLockCleanedUp: true,
                        stillUnderTarget: totalTime < 25
                    });

                    return {
                        executionId,
                        startTime: lockStartTime,
                        databases,
                        databaseId,
                        context
                    };
                } else {
                    // Active lock held by another instance - terminate immediately for frequent execution efficiency
                    context.log('Lock held by active instance - terminating to save resources (frequent execution optimization)', {
                        activeExecutionId: existingLock.executionId,
                        activeLockAge: lockAge,
                        activeStatus: existingLock.status,
                        currentOperation: existingLock.processMetrics?.currentOperation,
                        lastHeartbeat: existingLock.lastHeartbeat,
                        ultraFastTerminationTimeMs: acquisitionTime,
                        resourcesSaved: {
                            noRaceQueryOverhead: true,
                            noPollingLogicInitialization: true,
                            cpuTimeSaved: 'prevented expensive race selection operations',
                            frequentExecutionOptimized: true
                        },
                        pollingEfficiencyGain: `Avoided duplicate polling, saved ${acquisitionTime}ms`
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
            context.error('Unexpected error during ultra-fast lock acquisition', {
                error: error.message,
                acquisitionTimeMs: acquisitionTime,
                executionId
            });
            return null;
        }
    }
}

/**
 * Update lock heartbeat during race processing with race-specific progress
 * @param {Object} lockManager - Lock manager object from fastLockCheck
 * @param {Object} progress - Current progress metrics with race-specific data
 */
export async function updateHeartbeat(lockManager, progress = {}) {
    if (!lockManager) return;

    try {
        const now = new Date().toISOString();
        const currentMemory = process.memoryUsage();
        const currentCpu = process.cpuUsage();

        const processMetrics = JSON.stringify({
            racesProcessed: progress.racesProcessed || 0,
            successfulRaces: progress.successfulRaces || 0,
            failedRaces: progress.failedRaces || 0,
            currentOperation: progress.currentOperation || 'processing',
            executionMode: progress.executionMode || 'unknown',
            totalUpdatesProcessed: progress.totalUpdatesProcessed || 0,
            totalMoneyFlowProcessed: progress.totalMoneyFlowProcessed || 0,
            // Enhanced race-specific tracking embedded within processMetrics
            ultraCriticalRaces: progress.ultraCriticalRaces || 0,
            criticalRaces: progress.criticalRaces || 0,
            normalRaces: progress.normalRaces || 0,
            currentBatch: progress.currentBatch || 'unknown',
            internalLoopsActive: progress.internalLoopsActive || false,
            ...progress
        });

        const resourceMetrics = JSON.stringify({
            memoryUsageCurrent: currentMemory,
            cpuTimeCurrent: currentCpu,
            heartbeatTime: now,
            pollingEfficiency: {
                avgTimePerRace: progress.averageTimePerRace || 0,
                batchProcessingActive: !!progress.currentBatch,
                redundancyPrevention: progress.redundancyPrevention || 0,
                apiCallsSaved: progress.apiCallsSaved || 0
            },
            pollingIntervalsActive: progress.pollingIntervalsActive || []
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

        lockManager.context.log('Enhanced race poller heartbeat updated', {
            executionId: lockManager.executionId,
            heartbeatTime: now,
            progress: {
                racesProcessed: progress.racesProcessed || 0,
                currentOperation: progress.currentOperation || 'processing',
                executionMode: progress.executionMode || 'unknown'
            },
            memoryUsageMB: Math.round(currentMemory.heapUsed / 1024 / 1024),
            raceSpecificProgress: {
                ultraCritical: progress.ultraCriticalRaces || 0,
                critical: progress.criticalRaces || 0,
                normal: progress.normalRaces || 0
            }
        });

    } catch (error) {
        lockManager.context.error('Failed to update enhanced race poller heartbeat', {
            executionId: lockManager.executionId,
            error: error.message
        });
    }
}

/**
 * Release execution lock with completion metrics and race-specific stats
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

        // Log completion summary before releasing lock with enhanced race poller specific metrics
        lockManager.context.log('Enhanced race poller execution completed - releasing lock', {
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
            },
            pollingEfficiency: {
                racesProcessed: completionStats.racesProcessed || 0,
                successfulRaces: completionStats.successfulRaces || 0,
                failedRaces: completionStats.failedRaces || 0,
                averageTimePerRace: completionStats.averageTimePerRace || 0,
                totalUpdatesProcessed: completionStats.totalUpdatesProcessed || 0,
                totalMoneyFlowProcessed: completionStats.totalMoneyFlowProcessed || 0
            },
            raceSpecificStats: {
                ultraCriticalProcessed: completionStats.ultraCriticalProcessed || 0,
                criticalProcessed: completionStats.criticalProcessed || 0,
                standardProcessed: completionStats.standardProcessed || 0,
                internalLoopsExecuted: completionStats.internalLoopsExecuted || 0
            }
        });

        await lockManager.databases.deleteDocument(
            lockManager.databaseId,
            LOCK_COLLECTION_ID,
            LOCK_DOCUMENT_ID
        );

        lockManager.context.log('Enhanced race poller lock released successfully', {
            executionId: lockManager.executionId,
            endTime,
            finalStatus: status,
            totalPollingEfficiencyGained: true
        });

    } catch (error) {
        lockManager.context.error('Failed to release enhanced race poller execution lock', {
            executionId: lockManager.executionId,
            error: error.message,
            status
        });
    }
}

/**
 * Set up automatic heartbeat interval optimized for enhanced race poller frequent updates
 * @param {Object} lockManager - Lock manager object
 * @param {Object} progressTracker - Object that will be updated with progress
 * @returns {NodeJS.Timeout} Interval ID for cleanup
 */
export function setupHeartbeatInterval(lockManager, progressTracker) {
    if (!lockManager) return null;

    const intervalId = setInterval(async () => {
        await updateHeartbeat(lockManager, progressTracker);
    }, HEARTBEAT_INTERVAL_MS);

    lockManager.context.log('Enhanced race poller heartbeat interval established', {
        executionId: lockManager.executionId,
        intervalMs: HEARTBEAT_INTERVAL_MS,
        intervalSeconds: HEARTBEAT_INTERVAL_MS / 1000,
        optimizedForFrequentExecution: true
    });

    return intervalId;
}

/**
 * Check if current NZ time is in termination window (1:00 AM NZST)
 * Enhanced race poller runs continuously so needs 1:00 AM termination
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

        // Terminate at 1:00 AM NZ time for enhanced race poller (continuous polling function)
        const shouldTerminate = nzHour >= 1 && nzHour < 6;

        if (shouldTerminate) {
            context.log('Enhanced race poller NZ time termination triggered', {
                nzTime,
                nzHour,
                terminationReason: 'Past 1:00 AM NZ time - continuous polling termination',
                timezone: 'Pacific/Auckland',
                continuousPollingOptimization: true
            });
        }

        return shouldTerminate;

    } catch (error) {
        context.error('Failed to check enhanced race poller NZ termination time', {
            error: error.message
        });
        return false; // Don't terminate on error, let Appwrite timeout handle it
    }
}

/**
 * Implement intelligent backoff mechanism if multiple startup attempts detected
 * Enhanced race poller specific optimization for frequent execution scenarios
 * @param {Object} context - Appwrite function context for logging
 * @param {number} attemptCount - Number of rapid termination attempts detected
 */
export function applyIntelligentBackoff(context, attemptCount = 1) {
    if (attemptCount <= 1) return 0;

    // Progressive backoff for enhanced race poller: 100ms, 250ms, 500ms, 1000ms max
    const backoffDelays = [100, 250, 500, 1000];
    const delayIndex = Math.min(attemptCount - 2, backoffDelays.length - 1);
    const backoffDelay = backoffDelays[delayIndex];

    context.log('Enhanced race poller applying intelligent backoff', {
        attemptCount,
        backoffDelayMs: backoffDelay,
        reason: 'Multiple rapid startup attempts detected',
        optimizationNote: 'Preventing resource waste from concurrent execution attempts'
    });

    return backoffDelay;
}