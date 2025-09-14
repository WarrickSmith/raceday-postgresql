import { Client, Databases, Query } from 'node-appwrite';
import { fetchRaceEventData } from './api-client.js';
import { processDetailedRaces, processEntrants } from './database-utils.js';
import { validateEnvironmentVariables, executeApiCallWithTimeout, handleError, rateLimit, monitorMemoryUsage, forceGarbageCollection } from './error-handlers.js';
import { fastLockCheck, updateHeartbeat, releaseLock, setupHeartbeatInterval, shouldTerminateForNzTime } from './lock-manager.js';

export default async function main(context) {
    const functionStartTime = Date.now();
    let lockManager = null;
    let heartbeatInterval = null;
    let progressTracker = {
        racesProcessed: 0,
        entrantsProcessed: 0,
        currentOperation: 'initializing',
        currentRaceProcessing: 'none',
        chunkedProcessingState: 'not-started'
    };

    try {
        // Validate environment variables before any processing
        validateEnvironmentVariables(['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'], context);

        const endpoint = process.env['APPWRITE_ENDPOINT'];
        const projectId = process.env['APPWRITE_PROJECT_ID'];
        const apiKey = process.env['APPWRITE_API_KEY'];
        const nztabBaseUrl = process.env['NZTAB_API_BASE_URL'] || 'https://api.tab.co.nz';
        const databaseId = 'raceday-db';

        context.log('Daily races function started - performing fast lock check', {
            timestamp: new Date().toISOString(),
            nztabBaseUrl,
            functionVersion: '2.1.0-enhanced'
        });

        // Initialize Appwrite client (lightweight for lock check)
        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId)
            .setKey(apiKey);
        const databases = new Databases(client);

        // PHASE 1: Fast-fail lock check (target <40ms)
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
        const initialMemory = monitorMemoryUsage(context);
        progressTracker.currentOperation = 'querying-races-from-database';
        await updateHeartbeat(lockManager, progressTracker);
        
        // PHASE 2: Get today's date for filtering races (using NZ timezone)
        const nzDate = new Date().toLocaleDateString('en-CA', {
            timeZone: 'Pacific/Auckland',
        });

        // Get basic races from database (that were created by daily-meetings function)
        context.log('Fetching basic races from database for detailed enhancement...');
        const racesResult = await databases.listDocuments(databaseId, 'races', [
            Query.greaterThanEqual('startTime', nzDate),
            Query.orderAsc('startTime'),
            Query.limit(999) // Override default 25 limit to get all races
        ]);

        context.log(`Found ${racesResult.documents.length} races for detailed processing`);
        progressTracker.totalRacesFound = racesResult.documents.length;

        if (racesResult.documents.length === 0) {
            await releaseLock(lockManager, { ...progressTracker, racesFound: 0 }, 'completed');
            return {
                success: true,
                message: 'No races found to process for detailed enhancement',
                statistics: {
                    racesFound: 0,
                    racesProcessed: 0
                }
            };
        }

        // Check NZ time termination after database query
        if (shouldTerminateForNzTime(context)) {
            await releaseLock(lockManager, progressTracker, 'nz-time-termination');
            return {
                success: false,
                message: 'Terminated due to NZ time limit after race query',
                terminationReason: 'nz-time-limit'
            };
        }
        
        // PHASE 3: Process all races in chunks with enhanced monitoring
        const totalRaces = racesResult.documents.length;
        const chunkSize = 8; // Smaller chunks for better memory management
        const totalChunks = Math.ceil(totalRaces / chunkSize);

        context.log(`Processing ALL ${totalRaces} races in ${totalChunks} chunks of ${chunkSize} races each`);
        progressTracker.currentOperation = 'chunked-processing';
        progressTracker.chunkedProcessingState = 'started';
        progressTracker.totalChunks = totalChunks;
        progressTracker.currentChunk = 0;
        await updateHeartbeat(lockManager, progressTracker);

        let racesProcessed = 0;
        let entrantsProcessed = 0;
        const detailedRaces = [];

        // Process races in chunks sequentially to avoid overwhelming the API
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            // Check NZ time termination before each chunk
            if (shouldTerminateForNzTime(context)) {
                await releaseLock(lockManager, { ...progressTracker, chunksCompleted: chunkIndex }, 'nz-time-termination');
                return {
                    success: false,
                    message: `Terminated due to NZ time limit after ${chunkIndex} chunks`,
                    terminationReason: 'nz-time-limit',
                    partialResults: { racesProcessed, entrantsProcessed, chunksCompleted: chunkIndex }
                };
            }

            const startIndex = chunkIndex * chunkSize;
            const endIndex = Math.min(startIndex + chunkSize, totalRaces);
            const currentChunk = racesResult.documents.slice(startIndex, endIndex);

            context.log(`Processing chunk ${chunkIndex + 1}/${totalChunks} (races ${startIndex + 1}-${endIndex})`);
            progressTracker.currentChunk = chunkIndex + 1;
            progressTracker.chunkedProcessingState = `processing-chunk-${chunkIndex + 1}`;
            await updateHeartbeat(lockManager, progressTracker);

            // Monitor memory usage between chunks
            const chunkMemory = monitorMemoryUsage(context);
            if (chunkMemory.warningLevel && chunkIndex > 0) {
                forceGarbageCollection(context);
            }

            // Process each race in the current chunk
            for (let i = 0; i < currentChunk.length; i++) {
                const basicRace = currentChunk[i];

                try {
                    progressTracker.currentRaceProcessing = `${basicRace.raceId} (${startIndex + i + 1}/${totalRaces})`;
                    context.log(`Fetching detailed data for race ${basicRace.raceId} (${startIndex + i + 1}/${totalRaces})`);

                    // Fetch detailed race event data with enhanced retry logic
                    const raceEventData = await executeApiCallWithTimeout(
                        fetchRaceEventData,
                        [nztabBaseUrl, basicRace.raceId, context],
                        context,
                        15000, // 15-second timeout
                        2 // Enhanced retry attempts
                    );

                    if (!raceEventData || !raceEventData.race) {
                        context.log(`No detailed race data found for race ${basicRace.raceId}`);
                        continue; // Skip to next race
                    }

                    // Add the enhanced race data to processing list
                    detailedRaces.push({
                        basicRace,
                        detailedData: raceEventData.race,
                        entrantsData: raceEventData.runners // Include entrants data for consolidated processing
                    });

                    context.log(`Successfully fetched detailed data for race ${basicRace.raceId}`, {
                        runnersFound: raceEventData.runners ? raceEventData.runners.length : 0
                    });

                    // Rate limiting delay between races (within chunk)
                    if (i < currentChunk.length - 1) {
                        await rateLimit(800, context, 'Between race processing within chunk');
                    }

                } catch (error) {
                    handleError(error, `Fetching detailed data for race ${basicRace.raceId}`, context, {
                        raceId: basicRace.raceId,
                        raceIndex: startIndex + i + 1,
                        chunkIndex: chunkIndex + 1
                    });
                    // Continue with next race instead of failing completely
                }
            }

            // Rate limiting delay between chunks
            if (chunkIndex < totalChunks - 1) {
                await rateLimit(1500, context, 'Between chunk processing');
            }

            // Update progress after chunk completion
            progressTracker.chunksCompleted = chunkIndex + 1;
            await updateHeartbeat(lockManager, progressTracker);
        }
        
        // PHASE 4: Process the detailed race data and entrants (consolidated approach)
        if (detailedRaces.length > 0) {
            context.log('Processing consolidated race and entrant data...');
            progressTracker.currentOperation = 'database-processing';
            progressTracker.chunkedProcessingState = 'completed';
            await updateHeartbeat(lockManager, progressTracker);

            // Check NZ time termination before database processing
            if (shouldTerminateForNzTime(context)) {
                await releaseLock(lockManager, progressTracker, 'nz-time-termination');
                return {
                    success: false,
                    message: 'Terminated due to NZ time limit before database processing',
                    terminationReason: 'nz-time-limit',
                    partialResults: { detailedRacesFetched: detailedRaces.length }
                };
            }

            // Process detailed race data
            racesProcessed = await processDetailedRaces(databases, databaseId, detailedRaces, context);
            progressTracker.racesProcessed = racesProcessed;

            // Process entrants for each race with progress tracking
            progressTracker.currentOperation = 'processing-entrants';
            await updateHeartbeat(lockManager, progressTracker);

            for (const { basicRace, entrantsData } of detailedRaces) {
                if (entrantsData && entrantsData.length > 0) {
                    const raceEntrantsProcessed = await processEntrants(
                        databases,
                        databaseId,
                        basicRace.raceId,
                        entrantsData,
                        context
                    );
                    entrantsProcessed += raceEntrantsProcessed;
                }
            }
            progressTracker.entrantsProcessed = entrantsProcessed;
        }

        // Monitor final memory usage
        const finalMemory = monitorMemoryUsage(context);

        // PHASE 5: Completion and cleanup
        progressTracker.currentOperation = 'completed';
        const executionDuration = Date.now() - functionStartTime;

        const completionStats = {
            racesFound: racesResult.documents.length,
            racesProcessed,
            entrantsProcessed,
            detailedRacesFetched: detailedRaces.length,
            chunksProcessed: progressTracker.chunksCompleted || 0,
            totalChunks: progressTracker.totalChunks || 0,
            executionDurationMs: executionDuration,
            memoryEfficiency: {
                initialMB: initialMemory.heapUsedMB,
                finalMB: finalMemory.heapUsedMB,
                peakWarning: finalMemory.warningLevel
            }
        };

        context.log('Daily races function completed successfully', {
            timestamp: new Date().toISOString(),
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
            message: `Successfully enhanced ${racesProcessed} races and processed ${entrantsProcessed} entrants`,
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

        context.error('Daily races function failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            executionDurationMs: executionDuration,
            progressWhenFailed: progressTracker,
            timestamp: new Date().toISOString()
        });

        return {
            success: false,
            message: 'Daily races function failed with error',
            error: error instanceof Error ? error.message : 'Unknown error',
            progressAtFailure: progressTracker,
            executionDurationMs: executionDuration
        };
    } finally {
        // Final cleanup
        if (heartbeatInterval) clearInterval(heartbeatInterval);

        // Force garbage collection for memory cleanup
        if (progressTracker.racesProcessed > 0 || progressTracker.entrantsProcessed > 0) {
            forceGarbageCollection(context);
        }

        context.log('Daily races function cleanup completed', {
            finalExecutionTime: Date.now() - functionStartTime,
            cleanupCompleted: true
        });
    }
}