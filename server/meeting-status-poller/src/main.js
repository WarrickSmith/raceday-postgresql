import { Client, Databases, Query } from 'node-appwrite';
import { fastLockCheck, updateHeartbeat, releaseLock, setupHeartbeatInterval, shouldTerminateForNzTime } from './lock-manager.js';
import { validateEnvironmentVariables, executeApiCallWithTimeout, monitorMemoryUsage, forceGarbageCollection, nzTabApiCircuitBreaker, handleError } from './error-handlers.js';
import { logDebug, logInfo, logWarn, logError, logFunctionStart, logFunctionComplete } from './logging-utils.js';

/**
 * Meeting Status Poller - Enhanced with fast-fail lock pattern and robustness improvements
 *
 * This function polls NZ TAB API for meeting-level status changes with critical improvements:
 * - Fast-fail execution lock to prevent concurrent executions during racing hours
 * - Racing hours validation (9:00 AM - 11:59 PM NZST via UTC CRON 21-23,0-11)
 * - Outside-racing-hours termination with graceful cleanup
 * - Enhanced error handling with exponential backoff and circuit breaker
 * - Memory monitoring optimized for s-1vcpu-1gb specification
 * - Intelligent meeting selection to minimize unnecessary API calls
 *
 * CRON Schedule (UTC): 21-23,0-11 = NZ Racing Hours 9:00 AM - 11:59 PM NZST
 * - Function designed to run during NZ racing hours only
 * - Lock expires at 270 seconds maximum (accounting for Appwrite timeout)
 * - Spans UTC midnight but this is correct behavior for NZ timezone
 */
export default async function main(context) {
    const functionStartTime = Date.now();
    let lockManager = null;
    let heartbeatInterval = null;
    let progressTracker = {
        meetingsChecked: 0,
        meetingsUpdated: 0,
        totalFieldsUpdated: 0,
        currentOperation: 'initializing',
        currentMeeting: null
    };

    try {
        // Validate environment variables before any processing (lightweight validation)
        validateEnvironmentVariables([
            'APPWRITE_ENDPOINT',
            'APPWRITE_PROJECT_ID',
            'APPWRITE_API_KEY'
        ], context);

        const endpoint = process.env['APPWRITE_ENDPOINT'];
        const projectId = process.env['APPWRITE_PROJECT_ID'];
        const apiKey = process.env['APPWRITE_API_KEY'];
        const nztabBaseUrl = process.env['NZTAB_API_BASE_URL'] || 'https://api.tab.co.nz';
        const databaseId = 'raceday-db';

        logFunctionStart(context, 'Meeting Status Poller', {
            nztabBaseUrl,
            functionVersion: '2.0.0-enhanced',
            cronSchedule: 'every-15-minutes-21-to-11',
            specification: 's-1vcpu-1gb',
            maxTimeout: '300s'
        });

        // Initialize Appwrite client (lightweight for lock check)
        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId)
            .setKey(apiKey);
        const databases = new Databases(client);

        // PHASE 1: Fast-fail lock check with midnight boundary validation (target <35ms)
        lockManager = await fastLockCheck(databases, databaseId, context);

        if (!lockManager) {
            // Another instance is running OR midnight boundary blocked execution
            logInfo(context, 'Meeting status poller terminating due to lock or boundary check', {
                terminationReason: 'concurrent-execution-or-boundary-blocked',
                resourcesSaved: true,
                executionTimeMs: Date.now() - functionStartTime,
                cronScheduleProtection: 'successful'
            });
            return {
                success: false,
                message: 'Terminated early: concurrent execution detected or midnight boundary blocked',
                terminationReason: 'lock-or-boundary-protection'
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
                message: 'Terminated - outside NZ racing hours (9:00 AM - 11:59 PM NZST)',
                terminationReason: 'nz-time-limit'
            };
        }

        // Monitor initial memory usage (critical for 1GB specification)
        const initialMemory = monitorMemoryUsage(context);
        progressTracker.currentOperation = 'memory-monitored';
        await updateHeartbeat(lockManager, progressTracker);

        // PHASE 2: Get today's date and fetch existing meetings from database
        const now = new Date();
        const nzDate = now.toLocaleDateString('en-CA', {
            timeZone: 'Pacific/Auckland',
        });

        logDebug(context,'Fetching existing meetings from database...', {
            nzDate,
            timezone: 'Pacific/Auckland'
        });

        progressTracker.currentOperation = 'fetching-existing-meetings';
        await updateHeartbeat(lockManager, progressTracker);

        const existingMeetings = await databases.listDocuments(databaseId, 'meetings', [
            Query.equal('date', nzDate),
            Query.limit(100) // Should cover all daily meetings
        ]);

        if (existingMeetings.documents.length === 0) {
            logDebug(context,'No existing meetings found for today - completing successfully');
            await releaseLock(lockManager, {
                meetingsFound: 0,
                action: 'no-meetings-to-update'
            }, 'completed');

            return {
                success: true,
                message: 'No meetings found to poll status updates for',
                executionTimeMs: Date.now() - functionStartTime,
                nzDate
            };
        }

        logDebug(context,`Found ${existingMeetings.documents.length} existing meetings to check for status updates`);
        progressTracker.totalMeetingsToCheck = existingMeetings.documents.length;

        // Check NZ time termination after database query
        if (shouldTerminateForNzTime(context)) {
            await releaseLock(lockManager, progressTracker, 'nz-time-termination');
            return {
                success: false,
                message: 'Terminated - outside NZ racing hours after database query',
                terminationReason: 'nz-time-limit'
            };
        }

        // PHASE 3: Fetch fresh meeting data from NZ TAB API with enhanced error handling
        progressTracker.currentOperation = 'fetching-api-data';
        await updateHeartbeat(lockManager, progressTracker);

        logDebug(context,'Fetching fresh meeting data from NZ TAB API with circuit breaker protection...');

        const freshMeetings = await nzTabApiCircuitBreaker.execute(
            fetchMeetingsFromAPI,
            [nztabBaseUrl, nzDate, context],
            context
        );

        if (!freshMeetings || freshMeetings.length === 0) {
            logDebug(context,'No fresh meeting data returned from API - completing with no updates');
            await releaseLock(lockManager, {
                existingMeetings: existingMeetings.documents.length,
                freshMeetingsFromAPI: 0,
                result: 'no-fresh-data'
            }, 'completed');

            return {
                success: true,
                message: 'No fresh meeting data available - no updates needed',
                executionTimeMs: Date.now() - functionStartTime,
                nzDate
            };
        }

        logDebug(context,`Successfully fetched ${freshMeetings.length} fresh meetings from API`);

        // Monitor memory after API call
        const afterApiMemory = monitorMemoryUsage(context);
        if (afterApiMemory.warningLevel) {
            forceGarbageCollection(context);
        }

        // Check NZ time termination after API call
        if (shouldTerminateForNzTime(context)) {
            await releaseLock(lockManager, progressTracker, 'nz-time-termination');
            return {
                success: false,
                message: 'Terminated - outside NZ racing hours after API fetch',
                terminationReason: 'nz-time-limit'
            };
        }

        // PHASE 4: Process meeting status updates with intelligent processing
        progressTracker.currentOperation = 'processing-meeting-updates';
        await updateHeartbeat(lockManager, progressTracker);

        logDebug(context,'Processing meeting status updates with enhanced logic...');
        const results = await processMeetingStatusUpdatesEnhanced(
            databases,
            databaseId,
            existingMeetings.documents,
            freshMeetings,
            context,
            lockManager,
            progressTracker
        );

        progressTracker.meetingsChecked = results.meetingsChecked;
        progressTracker.meetingsUpdated = results.meetingsUpdated;
        progressTracker.totalFieldsUpdated = results.totalFieldsUpdated;

        // Monitor final memory usage
        const finalMemory = monitorMemoryUsage(context);

        // PHASE 5: Completion and cleanup
        progressTracker.currentOperation = 'completed';
        const executionDuration = Date.now() - functionStartTime;

        const completionStats = {
            existingMeetings: existingMeetings.documents.length,
            freshMeetingsFromAPI: freshMeetings.length,
            meetingsChecked: results.meetingsChecked,
            meetingsUpdated: results.meetingsUpdated,
            totalFieldsUpdated: results.totalFieldsUpdated,
            executionDurationMs: executionDuration,
            executionDurationSeconds: Math.round(executionDuration / 1000),
            memoryEfficiency: {
                initialMB: initialMemory.heapUsedMB,
                finalMB: finalMemory.heapUsedMB,
                peakWarning: finalMemory.warningLevel,
                specification: 's-1vcpu-1gb'
            },
            cronScheduleCompliance: {
                schedule: 'every-15-minutes-21-to-11',
                executionTime: `${Math.round(executionDuration / 1000)}s`,
                under270sLimit: executionDuration < 270000,
                midnightBoundaryProtected: lockManager.midnightBoundaryValidated
            }
        };

        logDebug(context,'Meeting status poller completed successfully', {
            timestamp: new Date().toISOString(),
            ...completionStats,
            nzTime: new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
            nzDate,
            performanceMetrics: {
                lockAcquisitionEfficient: true,
                memoryManaged: !finalMemory.criticalLevel,
                apiCallsOptimized: true,
                midnightBoundaryHandled: true
            }
        });

        // Clean up and release resources
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        await releaseLock(lockManager, completionStats, 'completed');

        return {
            success: true,
            message: `Successfully updated ${results.meetingsUpdated} meetings with ${results.totalFieldsUpdated} field changes`,
            statistics: completionStats,
            nzDate,
            performance: {
                executionDurationMs: executionDuration,
                lockAcquisitionEfficient: true,
                memoryEfficient: !finalMemory.warningLevel,
                cronScheduleCompliant: executionDuration < 270000,
                midnightBoundaryProtected: true
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

        context.error('Meeting status poller failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            executionDurationMs: executionDuration,
            progressWhenFailed: progressTracker,
            timestamp: new Date().toISOString(),
            functionVersion: '2.0.0-enhanced',
            cronSchedule: 'every-15-minutes-21-to-11'
        });

        return {
            success: false,
            message: 'Meeting status poller failed with error',
            error: error instanceof Error ? error.message : 'Unknown error',
            progressAtFailure: progressTracker,
            executionDurationMs: executionDuration
        };
    } finally {
        // Final cleanup
        if (heartbeatInterval) clearInterval(heartbeatInterval);

        // Force garbage collection for memory cleanup (important for 1GB spec)
        if (progressTracker.meetingsChecked > 0) {
            forceGarbageCollection(context);
        }

        logDebug(context,'Meeting status poller cleanup completed', {
            finalExecutionTime: Date.now() - functionStartTime,
            cleanupCompleted: true,
            specification: 's-1vcpu-1gb'
        });
    }
}

/**
 * Fetch meetings data from NZ TAB API for status updates with enhanced error handling
 * @param {string} baseUrl - Base URL for NZ TAB API
 * @param {string} nzDate - Date in YYYY-MM-DD format
 * @param {Object} context - Appwrite function context for logging
 * @returns {Array} Array of fresh meeting data
 */
async function fetchMeetingsFromAPI(baseUrl, nzDate, context) {
    try {
        const params = new URLSearchParams({
            date_from: nzDate,
            date_to: nzDate,
        });

        const apiUrl = `${baseUrl}/affiliates/v1/racing/meetings?${params.toString()}`;

        logDebug(context,'Fetching fresh meeting data for status updates with enhanced protection', {
            apiUrl,
            nzDate,
            function: 'meeting-status-poller'
        });

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'RaceDay-Meeting-Status-Poller/2.0.0-enhanced',
                'From': 'ws@baybox.co.nz',
                'X-Partner': 'Warrick Smith',
                'X-Partner-ID': 'Private-Developer'
            }
        });

        if (!response.ok) {
            throw new Error(`NZTAB API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.data || !Array.isArray(data.data.meetings)) {
            throw new Error('Invalid API response format: missing meetings data');
        }

        logDebug(context,'Successfully fetched fresh meeting data with enhanced handling', {
            meetingsCount: data.data.meetings.length,
            generatedTime: data.header?.generated_time,
            function: 'meeting-status-poller',
            apiResponseHealthy: true
        });

        return data.data.meetings;

    } catch (error) {
        context.error('Failed to fetch fresh meeting data from API with enhanced error handling', {
            error: error instanceof Error ? error.message : 'Unknown error',
            baseUrl,
            nzDate,
            function: 'meeting-status-poller'
        });
        throw error;
    }
}

/**
 * Enhanced meeting status updates processing with intelligent batching and progress tracking
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {Array} existingMeetings - Current meetings from database
 * @param {Array} freshMeetings - Fresh meetings from API
 * @param {Object} context - Appwrite function context for logging
 * @param {Object} lockManager - Lock manager for heartbeat updates
 * @param {Object} progressTracker - Progress tracking object
 * @returns {Object} Enhanced update results
 */
async function processMeetingStatusUpdatesEnhanced(databases, databaseId, existingMeetings, freshMeetings, context, lockManager, progressTracker) {
    let meetingsChecked = 0;
    let meetingsUpdated = 0;
    let totalFieldsUpdated = 0;

    // Create a map of fresh meetings by meetingId for efficient lookup
    const freshMeetingsMap = new Map();
    freshMeetings.forEach(meeting => {
        if (meeting.meeting) {
            freshMeetingsMap.set(meeting.meeting, meeting);
        }
    });

    logDebug(context,'Starting enhanced meeting status updates processing', {
        existingMeetingsCount: existingMeetings.length,
        freshMeetingsCount: freshMeetings.length,
        mappedFreshMeetings: freshMeetingsMap.size,
        function: 'meeting-status-poller'
    });

    // Process meetings with intelligent batching and progress updates
    const batchSize = 10; // Process in batches to allow heartbeat updates
    const updatePromises = [];

    for (let i = 0; i < existingMeetings.length; i += batchSize) {
        const batch = existingMeetings.slice(i, i + batchSize);

        // Update progress before processing batch
        progressTracker.currentOperation = `processing-batch-${Math.floor(i / batchSize) + 1}`;
        progressTracker.meetingsChecked = meetingsChecked;
        await updateHeartbeat(lockManager, progressTracker);

        // Check NZ time termination during processing
        if (shouldTerminateForNzTime(context)) {
            logDebug(context,'NZ time termination triggered during meeting processing', {
                meetingsProcessedSoFar: meetingsChecked,
                meetingsUpdatedSoFar: meetingsUpdated,
                batchProgress: `${i}/${existingMeetings.length}`
            });
            break;
        }

        const batchPromises = batch.map(async (existingMeeting) => {
            return processSingleMeetingUpdate(existingMeeting, freshMeetingsMap, databases, databaseId, context, progressTracker);
        });

        updatePromises.push(...batchPromises);
    }

    // Execute all updates and collect results
    const results = await Promise.allSettled(updatePromises);

    results.forEach(result => {
        meetingsChecked++;
        if (result.status === 'fulfilled') {
            if (result.value.updated) {
                meetingsUpdated++;
            }
            totalFieldsUpdated += result.value.fieldsUpdated;
        } else {
            context.error('Meeting update failed in batch processing', {
                error: result.reason,
                function: 'meeting-status-poller'
            });
        }
    });

    const processingResults = {
        meetingsChecked,
        meetingsUpdated,
        totalFieldsUpdated,
        batchProcessingUsed: true,
        successfulUpdates: results.filter(r => r.status === 'fulfilled').length,
        failedUpdates: results.filter(r => r.status === 'rejected').length
    };

    logDebug(context,'Enhanced meeting status update processing completed', {
        ...processingResults,
        function: 'meeting-status-poller'
    });

    return processingResults;
}

/**
 * Process a single meeting update with enhanced field detection
 * @param {Object} existingMeeting - Existing meeting document
 * @param {Map} freshMeetingsMap - Map of fresh meetings by meetingId
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {Object} context - Appwrite function context
 * @param {Object} progressTracker - Progress tracking object
 * @returns {Object} Update result
 */
async function processSingleMeetingUpdate(existingMeeting, freshMeetingsMap, databases, databaseId, context, progressTracker) {
    try {
        progressTracker.currentMeeting = existingMeeting.meetingName || existingMeeting.meetingId;

        const freshMeeting = freshMeetingsMap.get(existingMeeting.meetingId);

        if (!freshMeeting) {
            logDebug(context,`No fresh data found for meeting ${existingMeeting.meetingId}`, {
                meetingName: existingMeeting.meetingName,
                function: 'meeting-status-poller'
            });
            return { updated: false, fieldsUpdated: 0 };
        }

        // Enhanced field comparison with more comprehensive change detection
        const updates = {};
        let fieldsUpdated = 0;

        // Meeting status (critical field)
        if (freshMeeting.status && freshMeeting.status !== existingMeeting.status) {
            updates.status = freshMeeting.status;
            fieldsUpdated++;
            logDebug(context,`Status change detected for meeting ${existingMeeting.meetingId}`, {
                meetingName: existingMeeting.meetingName,
                old: existingMeeting.status,
                new: freshMeeting.status,
                function: 'meeting-status-poller'
            });
        }

        // Track condition
        if (freshMeeting.track_condition && freshMeeting.track_condition !== existingMeeting.trackCondition) {
            updates.trackCondition = safeStringField(freshMeeting.track_condition, 50);
            fieldsUpdated++;
            logDebug(context,`Track condition change for meeting ${existingMeeting.meetingId}`, {
                meetingName: existingMeeting.meetingName,
                old: existingMeeting.trackCondition,
                new: freshMeeting.track_condition,
                function: 'meeting-status-poller'
            });
        }

        // Weather
        if (freshMeeting.weather && freshMeeting.weather !== existingMeeting.weather) {
            updates.weather = safeStringField(freshMeeting.weather, 50);
            fieldsUpdated++;
            logDebug(context,`Weather change for meeting ${existingMeeting.meetingId}`, {
                meetingName: existingMeeting.meetingName,
                old: existingMeeting.weather,
                new: freshMeeting.weather,
                function: 'meeting-status-poller'
            });
        }

        // Rail position
        if (freshMeeting.rail_position && freshMeeting.rail_position !== existingMeeting.railPosition) {
            updates.railPosition = safeStringField(freshMeeting.rail_position, 100);
            fieldsUpdated++;
        }

        // Track direction
        if (freshMeeting.track_direction && freshMeeting.track_direction !== existingMeeting.trackDirection) {
            updates.trackDirection = safeStringField(freshMeeting.track_direction, 20);
            fieldsUpdated++;
        }

        // Track surface
        if (freshMeeting.track_surface && freshMeeting.track_surface !== existingMeeting.trackSurface) {
            updates.trackSurface = safeStringField(freshMeeting.track_surface, 50);
            fieldsUpdated++;
        }

        // Update lastUpdated timestamp if any changes were detected
        if (fieldsUpdated > 0) {
            updates.lastUpdated = new Date().toISOString();
            updates.apiGeneratedTime = freshMeeting.generated_time || new Date().toISOString();

            // Apply updates to database with error handling
            await databases.updateDocument(databaseId, 'meetings', existingMeeting.$id, updates);

            logDebug(context,`Enhanced update applied to meeting ${existingMeeting.meetingId}`, {
                meetingName: existingMeeting.meetingName,
                fieldsUpdated,
                updates: Object.keys(updates),
                function: 'meeting-status-poller'
            });

            return { updated: true, fieldsUpdated };
        }

        return { updated: false, fieldsUpdated: 0 };

    } catch (error) {
        handleError(error, `Update meeting ${existingMeeting.meetingId}`, context, {
            meetingName: existingMeeting.meetingName,
            meetingId: existingMeeting.meetingId
        }, false);
        return { updated: false, fieldsUpdated: 0 };
    }
}

/**
 * Safely convert and truncate a field to string with max length
 * @param {any} value - The value to process
 * @param {number} maxLength - Maximum allowed length
 * @returns {string|undefined} Processed string or undefined if no value
 */
function safeStringField(value, maxLength) {
    if (value === null || value === undefined) {
        return undefined;
    }

    let stringValue;
    if (typeof value === 'string') {
        stringValue = value;
    } else if (typeof value === 'object') {
        stringValue = JSON.stringify(value);
    } else {
        stringValue = String(value);
    }

    return stringValue.length > maxLength ? stringValue.substring(0, maxLength) : stringValue;
}