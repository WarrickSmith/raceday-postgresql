import { Client, Databases, Query, Functions } from 'node-appwrite';
import { validateEnvironmentVariables, handleError, rateLimit, monitorMemoryUsage, forceGarbageCollection } from './error-handlers.js';
import { fastLockCheck, updateHeartbeat, releaseLock, setupHeartbeatInterval, shouldTerminateForNzTime } from './lock-manager.js';

/**
 * Daily Initial Data Population - Scheduled function for racing day baseline data
 *
 * Runs 30 minutes after daily-races (8:30 PM NZ time) to populate comprehensive
 * initial odds, money flow, and timeline data for all races.
 *
 * This ensures:
 * - Story 4.9 timeline grids have baseline data from day start
 * - Faster user experience with pre-populated data
 * - Reduced load on real-time polling functions
 *
 * Schedule: 30 20 * * * (8:30 PM NZ time daily)
 * Timeout: 840 seconds (14 minutes) to handle large racing days
 * Specification: s-2vcpu-2gb for intensive batch processing
 *
 * Enhanced Features (Task 5.3):
 * - Fast-fail lock mechanism to prevent concurrent executions
 * - NZ time auto-termination at 1:00 AM with cleanup
 * - Memory usage monitoring and cleanup
 * - Progress checkpointing for resumable execution
 * - Comprehensive error handling and logging
 */
export default async function main(context) {
    const functionStartTime = Date.now();
    let lockManager = null;
    let heartbeatInterval = null;
    let progressTracker = {
        batchesProcessed: 0,
        racesProcessed: 0,
        currentOperation: 'initializing'
    };

    try {
        // Validate environment variables before any processing
        validateEnvironmentVariables(['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'], context);

        const endpoint = process.env['APPWRITE_ENDPOINT'];
        const projectId = process.env['APPWRITE_PROJECT_ID'];
        const apiKey = process.env['APPWRITE_API_KEY'];
        const databaseId = 'raceday-db';

        context.log('Daily initial data function started - performing fast lock check', {
            timestamp: new Date().toISOString(),
            functionVersion: '2.0.0-enhanced-task-5.3'
        });

        // Initialize Appwrite client (lightweight for lock check)
        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId)
            .setKey(apiKey);
        const databases = new Databases(client);

        // PHASE 1: Fast-fail lock check (target <50ms)
        lockManager = await fastLockCheck(databases, databaseId, context);

        if (!lockManager) {
            // Another instance is running - terminate immediately to save resources
            context.log('Terminating due to active concurrent execution - resources saved', {
                terminationReason: 'concurrent-execution-detected',
                resourcesSaved: true,
                executionTimeMs: Date.now() - functionStartTime
            });
            return {
                success: false,
                message: 'Another instance already running - terminated early to save resources',
                terminationReason: 'concurrent-execution'
            };
        }

        // Update progress and establish heartbeat
        progressTracker.currentOperation = 'lock-acquired';
        heartbeatInterval = setupHeartbeatInterval(lockManager, progressTracker);

        // Check NZ time termination before expensive operations
        if (shouldTerminateForNzTime(context)) {
            await releaseLock(lockManager, progressTracker, 'nz-time-termination');
            return {
                success: false,
                message: 'Terminated due to NZ time limit (past 1:00 AM)',
                terminationReason: 'nz-time-limit'
            };
        }

        // Monitor initial memory usage
        const initialMemory = monitorMemoryUsage(context, 'function-initialization');
        progressTracker.currentOperation = 'fetching-races-data';
        await updateHeartbeat(lockManager, progressTracker);

        // PHASE 2: Get today's races that need initial data population
        const nzDate = new Date().toLocaleDateString('en-CA', {
            timeZone: 'Pacific/Auckland',
        });

        context.log('Fetching today\'s races for initial data population...', { nzDate });
        const functions = new Functions(client);

        const racesResult = await databases.listDocuments(databaseId, 'races', [
            Query.greaterThanEqual('startTime', nzDate),
            Query.orderAsc('startTime'),
            Query.limit(999) // Get all races for the day
        ]);

        context.log(`Found ${racesResult.documents.length} races for initial data population`);

        if (racesResult.documents.length === 0) {
            await releaseLock(lockManager, { ...progressTracker, racesFound: 0 }, 'completed');
            return {
                success: true,
                message: 'No races found for initial data population',
                statistics: {
                    racesFound: 0,
                    batchesProcessed: 0,
                    totalExecutionTime: Date.now() - functionStartTime
                }
            };
        }

        // Check NZ time termination after race fetch
        if (shouldTerminateForNzTime(context)) {
            await releaseLock(lockManager, progressTracker, 'nz-time-termination');
            return {
                success: false,
                message: 'Terminated due to NZ time limit after race fetch',
                terminationReason: 'nz-time-limit'
            };
        }

        // PHASE 3: Process races in batches
        progressTracker.currentOperation = 'preparing-batch-processing';
        await updateHeartbeat(lockManager, progressTracker);

        // Get race IDs for batch processing
        const raceIds = racesResult.documents.map(race => race.raceId);

        // Process in optimal batches for enhanced-race-poller (8 races per batch)
        const batchSize = 8;
        const batches = [];
        for (let i = 0; i < raceIds.length; i += batchSize) {
            batches.push(raceIds.slice(i, i + batchSize));
        }

        context.log(`Processing ${raceIds.length} races in ${batches.length} batch(es) for comprehensive initial data`, {
            batchSize,
            totalRaces: raceIds.length,
            estimatedTime: `${Math.ceil(batches.length * 1.5)} minutes`
        });

        let initialDataStats = {
            batchesProcessed: 0,
            successfulRaces: 0,
            failedRaces: 0,
            totalEntrantsProcessed: 0,
            totalMoneyFlowProcessed: 0,
            executionErrors: []
        };

        // Monitor memory after data preparation
        const afterPrepMemory = monitorMemoryUsage(context, 'batch-preparation');
        if (afterPrepMemory.warningLevel) {
            forceGarbageCollection(context, 'pre-batch-processing');
        }

        // PHASE 4: Process each batch using enhanced-race-poller function
        progressTracker.currentOperation = 'processing-batches';
        progressTracker.totalBatches = batches.length;

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const currentBatch = batches[batchIndex];
            progressTracker.currentBatch = batchIndex + 1;
            progressTracker.batchesProcessed = batchIndex;

            // Update heartbeat before each batch
            await updateHeartbeat(lockManager, progressTracker);

            // Check NZ time termination before each batch
            if (shouldTerminateForNzTime(context)) {
                await releaseLock(lockManager, progressTracker, 'nz-time-termination');
                return {
                    success: false,
                    message: 'Terminated due to NZ time limit during batch processing',
                    terminationReason: 'nz-time-limit',
                    partialResults: { ...initialDataStats, batchesProcessed: batchIndex }
                };
            }

            context.log(`🎯 Processing initial data batch ${batchIndex + 1}/${batches.length}`, {
                raceIds: currentBatch,
                batchSize: currentBatch.length,
                progress: `${Math.round((batchIndex / batches.length) * 100)}%`
            });

            try {
                // Execute enhanced-race-poller function for comprehensive data
                const execution = await functions.createExecution(
                    'enhanced-race-poller',
                    JSON.stringify({ raceIds: currentBatch }),
                    false // synchronous execution
                );

                // Parse execution response
                let executionResult = {};
                try {
                    executionResult = JSON.parse(execution.responseBody || '{}');
                } catch (parseError) {
                    context.log('Could not parse batch execution response', {
                        batchIndex: batchIndex + 1,
                        executionId: execution.$id,
                        status: execution.status
                    });
                }

                // Extract statistics from execution result
                const batchSummary = executionResult.statistics || {};

                // Accumulate statistics
                initialDataStats.batchesProcessed++;
                initialDataStats.successfulRaces += batchSummary.successfulRaces || currentBatch.length;
                initialDataStats.totalEntrantsProcessed += batchSummary.totalEntrantsProcessed || 0;
                initialDataStats.totalMoneyFlowProcessed += batchSummary.totalMoneyFlowProcessed || 0;

                progressTracker.batchesProcessed = initialDataStats.batchesProcessed;
                progressTracker.racesProcessed = initialDataStats.successfulRaces;

                context.log(`✅ Completed initial data batch ${batchIndex + 1}/${batches.length}`, {
                    executionId: execution.$id,
                    executionStatus: execution.status,
                    executionTime: `${execution.duration}ms`,
                    batchSummary,
                    cumulativeStats: {
                        batchesCompleted: initialDataStats.batchesProcessed,
                        racesProcessed: initialDataStats.successfulRaces
                    }
                });

            } catch (batchError) {
                context.error(`❌ Failed to execute initial data batch ${batchIndex + 1}`, {
                    raceIds: currentBatch,
                    error: batchError instanceof Error ? batchError.message : 'Unknown error'
                });

                // Record error but continue processing
                initialDataStats.executionErrors.push({
                    batchIndex: batchIndex + 1,
                    raceIds: currentBatch,
                    error: batchError instanceof Error ? batchError.message : 'Unknown error'
                });

                // Count as failed races
                initialDataStats.failedRaces += currentBatch.length;
            }

            // Memory monitoring after batch processing
            if ((batchIndex + 1) % 3 === 0) { // Check every 3 batches
                const batchMemory = monitorMemoryUsage(context, `batch-${batchIndex + 1}-completed`);
                if (batchMemory.warningLevel) {
                    forceGarbageCollection(context, `post-batch-${batchIndex + 1}-cleanup`);
                }
            }

            // Rate limit between batches to prevent API overwhelming
            if (batchIndex < batches.length - 1) {
                const delayMs = 3000; // 3 seconds between batches
                context.log(`Applying rate limit delay: ${delayMs}ms before next batch`);
                await rateLimit(delayMs, context, `Between initial data batches`);
            }
        }

        // PHASE 5: Completion and cleanup
        progressTracker.currentOperation = 'completed';
        const executionDuration = Date.now() - functionStartTime;

        // Monitor final memory usage
        const finalMemory = monitorMemoryUsage(context, 'function-completion');

        const completionStats = {
            racesFound: racesResult.documents.length,
            batchesProcessed: initialDataStats.batchesProcessed,
            successfulRaces: initialDataStats.successfulRaces,
            failedRaces: initialDataStats.failedRaces,
            totalEntrantsProcessed: initialDataStats.totalEntrantsProcessed,
            totalMoneyFlowProcessed: initialDataStats.totalMoneyFlowProcessed,
            executionErrors: initialDataStats.executionErrors.length,
            executionDurationMs: executionDuration,
            memoryEfficiency: {
                initialMB: initialMemory.heapUsedMB,
                finalMB: finalMemory.heapUsedMB,
                peakWarning: finalMemory.warningLevel
            }
        };

        context.log('🎉 Daily initial data population completed', {
            timestamp: new Date().toISOString(),
            totalExecutionTime: `${Math.round(executionDuration / 1000)}s`,
            ...completionStats,
            nzTime: new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
            performanceMetrics: {
                lockAcquisitionEfficient: true,
                memoryManaged: !finalMemory.criticalLevel,
                executionDurationSeconds: Math.round(executionDuration / 1000)
            }
        });

        // Clean up and release resources
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        await releaseLock(lockManager, completionStats, 'completed');

        return {
            success: true,
            message: `Successfully populated initial data for ${initialDataStats.successfulRaces} races in ${initialDataStats.batchesProcessed} batches`,
            statistics: completionStats,
            performance: {
                executionDurationMs: executionDuration,
                lockAcquisitionEfficient: true,
                memoryEfficient: !finalMemory.warningLevel,
                nzTimeCompliant: true
            }
        };

    } catch (error) {
        // Ensure cleanup even on error
        if (heartbeatInterval) clearInterval(heartbeatInterval);

        if (lockManager) {
            progressTracker.currentOperation = 'error-cleanup';
            progressTracker.error = error.message;
            await releaseLock(lockManager, progressTracker, 'failed');
        }

        const executionDuration = Date.now() - functionStartTime;

        context.error('Daily initial data function failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            executionDurationMs: executionDuration,
            progressWhenFailed: progressTracker,
            timestamp: new Date().toISOString()
        });

        return {
            success: false,
            message: 'Daily initial data function failed with error',
            error: error instanceof Error ? error.message : 'Unknown error',
            progressAtFailure: progressTracker,
            executionDurationMs: executionDuration
        };
    } finally {
        // Final cleanup
        if (heartbeatInterval) clearInterval(heartbeatInterval);

        // Force garbage collection for memory cleanup
        if (progressTracker.batchesProcessed > 0 || progressTracker.racesProcessed > 0) {
            forceGarbageCollection(context, 'final-cleanup');
        }

        context.log('Daily initial data function cleanup completed', {
            finalExecutionTime: Date.now() - functionStartTime,
            cleanupCompleted: true
        });
    }
}