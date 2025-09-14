import { Client, Databases } from 'node-appwrite';
import { fetchRacingData } from './api-client.js';
import { filterMeetings } from './data-processors.js';
import { processMeetings, processRaces } from './database-utils.js';
import { validateEnvironmentVariables, executeApiCallWithTimeout, monitorMemoryUsage, forceGarbageCollection } from './error-handlers.js';
import { fastLockCheck, updateHeartbeat, releaseLock, setupHeartbeatInterval, shouldTerminateForNzTime } from './lock-manager.js';

/**
 * Daily Meetings Import Function
 *
 * TIMEZONE CONTEXT:
 * - Scheduled: 19:00 UTC = 7:00 AM NZST (next day)
 * - Termination Window: 1:00-6:00 AM NZST (allows proper 7:00 AM execution)
 * - Execution Sequence: Runs before daily-races (8:00 AM NZST) and daily-initial-data (8:30 AM NZST)
 */
export default async function main(context) {
    const functionStartTime = Date.now();
    let lockManager = null;
    let heartbeatInterval = null;
    let progressTracker = {
        meetingsProcessed: 0,
        racesProcessed: 0,
        currentOperation: 'initializing'
    };

    try {
        // Validate environment variables before any processing
        validateEnvironmentVariables(['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'], context);

        const endpoint = process.env['APPWRITE_ENDPOINT'];
        const projectId = process.env['APPWRITE_PROJECT_ID'];
        const apiKey = process.env['APPWRITE_API_KEY'];
        const nztabBaseUrl = process.env['NZTAB_API_BASE_URL'] || 'https://api.tab.co.nz';
        const databaseId = 'raceday-db';

        context.log('Daily meetings function started - performing fast lock check', {
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

        // PHASE 1: Fast-fail lock check (target <30ms)
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
                message: 'Terminated - in NZ time termination window (1:00-6:00 AM NZST, function runs at 7:00 AM)',
                terminationReason: 'nz-time-limit'
            };
        }

        // Monitor initial memory usage
        const initialMemory = monitorMemoryUsage(context);
        progressTracker.currentOperation = 'fetching-meetings-data';
        await updateHeartbeat(lockManager, progressTracker);

        // PHASE 2: Fetch meetings data from NZ TAB API with enhanced retry logic
        context.log('Fetching meetings data from NZ TAB API with retry protection...');
        const meetings = await executeApiCallWithTimeout(
            fetchRacingData,
            [nztabBaseUrl, context],
            context,
            15000, // 15 second timeout
            3      // 3 retries with exponential backoff
        );

        if (!meetings) {
            await releaseLock(lockManager, { ...progressTracker, error: 'api-fetch-failed' }, 'failed');
            return {
                success: false,
                message: 'Failed to fetch meetings data from NZ TAB API after retries',
                error: 'api-fetch-failed'
            };
        }

        context.log(`Successfully fetched ${meetings.length} meetings from API`);
        progressTracker.totalMeetingsFetched = meetings.length;

        // Check NZ time termination after API call
        if (shouldTerminateForNzTime(context)) {
            await releaseLock(lockManager, progressTracker, 'nz-time-termination');
            return {
                success: false,
                message: 'Terminated due to NZ time limit after API fetch',
                terminationReason: 'nz-time-limit'
            };
        }

        // PHASE 3: Filter meetings for AU/NZ horse racing
        progressTracker.currentOperation = 'filtering-meetings';
        await updateHeartbeat(lockManager, progressTracker);

        const filteredMeetings = filterMeetings(meetings, context);
        context.log(`Filtered to ${filteredMeetings.length} meetings for processing`);
        progressTracker.filteredMeetings = filteredMeetings.length;

        // Monitor memory after data filtering
        const afterFilterMemory = monitorMemoryUsage(context);
        if (afterFilterMemory.warningLevel) {
            forceGarbageCollection(context);
        }

        // PHASE 4: Process meetings into database
        progressTracker.currentOperation = 'processing-meetings';
        await updateHeartbeat(lockManager, progressTracker);

        context.log('Processing meetings into database...');
        const { meetingsProcessed } = await processMeetings(databases, databaseId, filteredMeetings, context);

        progressTracker.meetingsProcessed = meetingsProcessed;
        context.log(`Successfully processed ${meetingsProcessed} meetings`);

        // Check NZ time termination after meetings processing
        if (shouldTerminateForNzTime(context)) {
            await releaseLock(lockManager, progressTracker, 'nz-time-termination');
            return {
                success: false,
                message: 'Terminated due to NZ time limit after meetings processing',
                terminationReason: 'nz-time-limit',
                partialResults: { meetingsProcessed }
            };
        }

        // PHASE 5: Process races from the meetings data
        progressTracker.currentOperation = 'processing-races';
        await updateHeartbeat(lockManager, progressTracker);

        context.log('Processing races from meetings data...');
        const { racesProcessed, raceIds } = await processRaces(databases, databaseId, filteredMeetings, context);

        progressTracker.racesProcessed = racesProcessed;
        progressTracker.totalRaceIds = raceIds.length;

        context.log(`Successfully processed ${racesProcessed} races from ${filteredMeetings.length} meetings`);

        // Monitor final memory usage
        const finalMemory = monitorMemoryUsage(context);

        // PHASE 6: Completion and cleanup
        progressTracker.currentOperation = 'completed';
        const executionDuration = Date.now() - functionStartTime;

        const completionStats = {
            meetingsProcessed,
            racesProcessed,
            totalMeetingsFetched: meetings.length,
            filteredMeetings: filteredMeetings.length,
            totalRaceIds: raceIds.length,
            executionDurationMs: executionDuration,
            memoryEfficiency: {
                initialMB: initialMemory.heapUsedMB,
                finalMB: finalMemory.heapUsedMB,
                peakWarning: finalMemory.warningLevel
            }
        };

        context.log('Daily meetings function completed successfully', {
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
            message: `Successfully imported ${meetingsProcessed} meetings and ${racesProcessed} races`,
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

        context.error('Daily meetings function failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            executionDurationMs: executionDuration,
            progressWhenFailed: progressTracker,
            timestamp: new Date().toISOString()
        });

        return {
            success: false,
            message: 'Daily meetings function failed with error',
            error: error instanceof Error ? error.message : 'Unknown error',
            progressAtFailure: progressTracker,
            executionDurationMs: executionDuration
        };
    } finally {
        // Final cleanup
        if (heartbeatInterval) clearInterval(heartbeatInterval);

        // Force garbage collection for memory cleanup
        if (progressTracker.meetingsProcessed > 0 || progressTracker.racesProcessed > 0) {
            forceGarbageCollection(context);
        }

        context.log('Daily meetings function cleanup completed', {
            finalExecutionTime: Date.now() - functionStartTime,
            cleanupCompleted: true
        });
    }
}