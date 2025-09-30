import { Client, Databases, Functions, Query } from 'node-appwrite';
import { validateEnvironmentVariables, executeWithTimeout, monitorMemoryUsage, forceGarbageCollection, categorizeError, logPerformanceMetrics } from './error-handlers.js';
import { fastLockCheck, updateHeartbeat, releaseLock, setupHeartbeatInterval, shouldTerminateForNzTime } from './lock-manager.js';
import { logDebug, logInfo, logWarn, logError, logFunctionStart, logFunctionComplete } from './logging-utils.js';
import { sendCompressedJson } from '../../shared/http/compression.js';

/**
 * Master Race Scheduler - Autonomous polling coordination for horse race data
 *
 * ENHANCED VERSION 2.0 - Critical CRON Schedule Issue Resolution
 *
 * CRITICAL CRON SCHEDULE ISSUE: Function executes every minute with 120s timeout.
 * Risk of overlapping executions particularly at midnight when new day's schedule begins.
 *
 * TIMEZONE CONTEXT:
 * - Scheduled: Every minute in UTC
 * - Enhanced Termination: 1:00 AM NZST with midnight boundary awareness
 * - Execution Frequency: High (every 60 seconds)
 * - Overlap Prevention: Ultra-fast lock check (<15ms target)
 *
 * ENHANCED FEATURES:
 * - Ultra-fast-fail lock mechanism (target <15ms) to prevent overlapping executions
 * - Midnight boundary detection with explicit day-rollover validation
 * - Aggressive stale lock detection (>75 seconds) with automatic cleanup
 * - Micro-heartbeat updates every 30 seconds with scheduling progress
 * - Automatic backoff detection for multiple rapid terminations
 * - NZ time-aware termination at 1:00 AM with resource optimization
 *
 * This function serves as the central coordinator for all race polling activities.
 * When triggered by cron (every minute), runs 2 cycles at 30-second intervals (0s, 30s).
 * When triggered manually, runs a single cycle for testing.
 *
 * Updated polling strategy:
 * - Master scheduler runs every 1 minute (CRON minimum)
 * - High-frequency polling (30s) delegated to enhanced-race-poller internal loops
 * - -5m to -3m: 30 second polling (managed by enhanced-race-poller)
 * - -3m to Final: 30 second polling (managed by enhanced-race-poller)
 * - After Interim status: 30 second polling until Final, then stop
 *
 * Architecture:
 * - Analyzes all active races for polling requirements every 30 seconds
 * - Calculates dynamic polling intervals based on race timing and status
 * - Intelligently selects batch vs individual polling functions
 * - Tracks last poll times to prevent redundant polling
 * - Dynamically active from 65 minutes before first NZ/AUS race until all races finalized
 * - Stops polling when race status becomes 'Final'
 */
export default async function main(context) {
  const functionStartTime = Date.now();
  let lockManager = null;
  let heartbeatInterval = null;
  let progressTracker = {
      racesAnalyzed: 0,
      racesScheduled: 0,
      functionsTriggered: 0,
      currentOperation: 'initializing',
      schedulingPhase: 'startup'
  };

  try {
    // Validate environment variables before any processing
    validateEnvironmentVariables(['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'], context);

    logDebug(context,'Enhanced Master race scheduler started - performing ultra-fast lock check', {
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      version: '2.0-enhanced-overlap-prevention',
      executionFrequency: 'every-minute'
    });

    const endpoint = process.env['APPWRITE_ENDPOINT'];
    const projectId = process.env['APPWRITE_PROJECT_ID'];
    const apiKey = process.env['APPWRITE_API_KEY'];
    const databaseId = 'raceday-db';

    // Initialize Appwrite client (lightweight for lock check)
    const client = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey);
    const databases = new Databases(client);

    // PHASE 1: Ultra-fast-fail lock check (target <15ms) - CRITICAL for every-minute execution
    const lockStartTime = Date.now();
    lockManager = await fastLockCheck(databases, databaseId, context);
    const lockAcquisitionTime = Date.now() - lockStartTime;

    if (!lockManager) {
        // Another instance is running - ultra-fast termination to save resources
        const ultraFastTermination = lockAcquisitionTime < 20;
        logDebug(context,'Terminating due to active concurrent execution - ultra-fast resource savings', {
            terminationReason: 'concurrent-execution-detected',
            ultraFastTermination,
            lockCheckTimeMs: lockAcquisitionTime,
            resourcesSaved: {
              noRaceAnalysis: true,
              noFunctionTriggers: true,
              totalExecutionTimeMs: Date.now() - functionStartTime
            },
            everyMinuteOptimization: 'prevented expensive operations'
        });
        return {
            success: false,
            message: 'Another instance already running - ultra-fast termination to save resources',
            terminationReason: 'concurrent-execution',
            ultraFastTermination,
            executionTimeMs: Date.now() - functionStartTime
        };
    }

    // Update progress and establish micro-heartbeat
    progressTracker.currentOperation = 'lock-acquired';
    progressTracker.lockAcquisitionTimeMs = lockAcquisitionTime;
    heartbeatInterval = setupHeartbeatInterval(lockManager, progressTracker);

    // Check NZ time termination before expensive operations
    if (shouldTerminateForNzTime(context)) {
        await releaseLock(lockManager, progressTracker, 'nz-time-termination');
        return {
            success: false,
            message: 'Terminated - outside racing hours (1:00-9:00 AM NZST for optimal resource usage)',
            terminationReason: 'nz-time-limit',
            executionTimeMs: Date.now() - functionStartTime
        };
    }

    // Monitor initial memory usage
    const initialMemory = monitorMemoryUsage(context);
    progressTracker.schedulingPhase = 'race-analysis';

  // Check if this is a scheduled run (cron) vs manual run
  if (context.req.headers['x-appwrite-task']) {
    // Run the enhanced polling logic once for cron-triggered executions (every 1 minute)
    // High-frequency polling is now delegated to enhanced-race-poller internal loops
    logDebug(context,
      'Scheduled execution: Running enhanced single cycle with overlap prevention'
    )

    const result = await runEnhancedSchedulerLogic(context, databases, databaseId, lockManager, progressTracker, functionStartTime)

    // Clean up and release resources
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    await releaseLock(lockManager, result.statistics || progressTracker, 'completed');

    return sendCompressedJson(context, {
      success: result.success,
      message: result.message || 'Enhanced scheduler completed single cycle',
      ...result,
      totalExecutionTime: Date.now() - functionStartTime,
      lockAcquisitionTimeMs: lockAcquisitionTime
    })
  } else {
    // For manual runs, just run once
    logDebug(context,'Manual execution: Running enhanced single cycle')
    const result = await runEnhancedSchedulerLogic(context, databases, databaseId, lockManager, progressTracker, functionStartTime)

    // Clean up and release resources
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    await releaseLock(lockManager, result.statistics || progressTracker, 'completed');

    return result
  }

  } catch (error) {
        // Ensure cleanup even on error
        if (heartbeatInterval) clearInterval(heartbeatInterval);

        if (lockManager) {
            progressTracker.currentOperation = 'error-cleanup';
            progressTracker.error = error.message;
            await releaseLock(lockManager, progressTracker, 'failed');
        }

        const executionDuration = Date.now() - functionStartTime;
        const errorAnalysis = categorizeError(error, context);

        context.error('Enhanced Master race scheduler failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            executionDurationMs: executionDuration,
            progressWhenFailed: progressTracker,
            errorAnalysis,
            timestamp: new Date().toISOString(),
            version: '2.0-enhanced-overlap-prevention'
        });

        return {
            success: false,
            message: 'Enhanced Master race scheduler failed with error',
            error: error instanceof Error ? error.message : 'Unknown error',
            progressAtFailure: progressTracker,
            executionDurationMs: executionDuration,
            errorAnalysis
        };

    } finally {
        // Final cleanup
        if (heartbeatInterval) clearInterval(heartbeatInterval);

        // Force garbage collection for memory cleanup if significant work was done
        if (progressTracker.racesAnalyzed > 0 || progressTracker.functionsTriggered > 0) {
            forceGarbageCollection(context);
        }

        // Log final performance metrics
        const finalExecutionTime = Date.now() - functionStartTime;
        const performanceMetrics = logPerformanceMetrics({
            executionTimeMs: finalExecutionTime,
            racesAnalyzed: progressTracker.racesAnalyzed,
            racesScheduled: progressTracker.racesScheduled,
            functionsTriggered: progressTracker.functionsTriggered,
            memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            lockAcquisitionMs: progressTracker.lockAcquisitionTimeMs,
            schedulingPhase: progressTracker.schedulingPhase
        }, context);

        logDebug(context,'Enhanced Master race scheduler cleanup completed', {
            finalExecutionTime,
            cleanupCompleted: true,
            performanceMetrics: performanceMetrics.performanceIndicators,
            version: '2.0-enhanced-overlap-prevention'
        });
    }
}

/**
 * Enhanced core scheduler logic with lock management and NZ time termination
 * Optimized for every-minute execution frequency
 */
async function runEnhancedSchedulerLogic(context, databases, databaseId, lockManager, progressTracker, functionStartTime) {
  const startTime = Date.now();

  try {
    // Initialize Functions client for triggering race polling
    const client = new Client()
      .setEndpoint(process.env['APPWRITE_ENDPOINT'])
      .setProject(process.env['APPWRITE_PROJECT_ID'])
      .setKey(process.env['APPWRITE_API_KEY']);

    const functions = new Functions(client);

    // PHASE 2: Race Analysis with Heartbeat Updates
    progressTracker.currentOperation = 'analyzing-races';
    progressTracker.schedulingPhase = 'race-analysis';
    await updateHeartbeat(lockManager, progressTracker);

    // Check NZ time termination after lock acquisition
    if (shouldTerminateForNzTime(context)) {
        return {
            success: false,
            message: 'Terminated due to NZ time limit during race analysis',
            terminationReason: 'nz-time-limit',
            statistics: progressTracker
        };
    }

    // Simplified timezone handling using native NZ API fields
    // NZTAB API provides raceDateNz and startTimeNz fields that eliminate complex UTC conversions
    const now = new Date()

    // Get current NZ date for race filtering - use simple timezone conversion
    const nzTimeString = now.toLocaleString('en-US', {
      timeZone: 'Pacific/Auckland',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    // Parse NZ date components
    const [nzDatePart, nzTimePart] = nzTimeString.split(', ')
    const [nzMonth, nzDay, nzYear] = nzDatePart.split('/')
    const [nzHour, nzMinute] = nzTimePart.split(':')

    // Create NZ time for logging and comparison
    const nzTimeDisplay = `${nzYear}-${nzMonth}-${nzDay} ${nzHour}:${nzMinute} NZST/NZDT`

    // Simple 9AM NZ check using current NZ hour (no complex UTC conversion needed)
    const currentNzHour = parseInt(nzHour)
    const isAfterNz9AM = currentNzHour >= 9

    // meeting-status-poller trigger logic moved below (after active-period check)

    // Query today's races using simplified NZ date
    const nzToday = `${nzYear}-${nzMonth.padStart(2, '0')}-${nzDay.padStart(
      2,
      '0'
    )}` // YYYY-MM-DD format

    const todaysRaces = await databases.listDocuments(databaseId, 'races', [
      Query.equal('raceDateNz', nzToday),
      Query.limit(400), // Ensure we can handle large race days
    ])

    const racesToday = todaysRaces.documents
    progressTracker.racesAnalyzed = racesToday.length;

    logDebug(context,'Enhanced race filtering', {
      nzToday,
      nzTimeDisplay,
      isAfterNz9AM,
      totalRaces: racesToday.length,
      sampleRaces: racesToday.slice(0, 5).map((r) => ({
        id: r.$id.slice(-4),
        name: (r.name || 'Unknown').substring(0, 30),
        raceDateNz: r.raceDateNz,
        startTimeNz: r.startTimeNz,
        status: r.status,
      })),
    })

    // Update heartbeat after race query
    progressTracker.currentOperation = 'race-filtering-completed';
    await updateHeartbeat(lockManager, progressTracker);

    if (racesToday.length === 0) {
      logDebug(context,'No races found for today, scheduler dormant', {
        nzToday,
        nzTimeDisplay,
        isAfterNz9AM,
      })

      return {
        success: true,
        message: 'No races scheduled today',
        nzToday,
        nzTimeDisplay,
      }
    }

    // Simplified active period logic using NZ time check and race availability
    const racesWithStartTime = racesToday.filter((race) => race.startTime)
    const allFinalized = racesToday.every((race) => race.status === 'Final')

    // Active if: after 9AM NZ AND races exist AND not all finalized
    const isCurrentlyActive =
      isAfterNz9AM && racesWithStartTime.length > 0 && !allFinalized

    if (racesWithStartTime.length === 0) {
      logDebug(context,'No races with start times found, scheduler dormant', {
        nzTimeDisplay,
        racesTodayCount: racesToday.length,
      })

      return {
        success: true,
        message: 'No races with start times found',
        nzTimeDisplay,
      }
    }

    logDebug(context,'Enhanced racing schedule check', {
      nzTimeDisplay,
      isAfterNz9AM,
      racesTodayCount: racesToday.length,
      racesWithStartTime: racesWithStartTime.length,
      allFinalized,
      isCurrentlyActive,
    })

    if (!isCurrentlyActive) {
      const reason = !isAfterNz9AM ? 'before 9AM NZ' : 'all races finalized'

      logDebug(context,'Outside racing period, scheduler sleeping', {
        nzTimeDisplay,
        reason,
        allFinalized,
      })

      return {
        success: true,
        message: `Scheduler dormant: ${reason}`,
        nzTimeDisplay,
        allRacesFinalized: allFinalized,
      }
    }

    // meeting-status-poller scheduling removed from master scheduler.
    // Meeting-status-poller will be executed directly by Appwrite cron (see server/appwrite.json).

    // Query all active races (not finalized)
    const activeRaces = await databases.listDocuments(databaseId, 'races', [
      Query.equal('raceDateNz', nzToday),
      Query.notEqual('status', 'Final'),
      Query.limit(400), // Ensure we can handle large race days
    ])

    logDebug(context,'Active races retrieved', {
      totalRaces: activeRaces.documents.length,
      racesToAnalyze: activeRaces.documents.filter((r) => r.status !== 'Final')
        .length,
    })

    // Update heartbeat and check NZ time before race analysis
    progressTracker.currentOperation = 'active-race-analysis';
    progressTracker.schedulingPhase = 'polling-analysis';
    await updateHeartbeat(lockManager, progressTracker);

    // Check NZ time termination before intensive race analysis
    if (shouldTerminateForNzTime(context)) {
        return {
            success: false,
            message: 'Terminated due to NZ time limit before race analysis',
            terminationReason: 'nz-time-limit',
            statistics: progressTracker
        };
    }

    // Analyze each race for polling requirements
    const racesDueForPolling = []
    const analysisResults = {
      totalAnalyzed: 0,
      skippedFinalized: 0,
      skippedNoStartTime: 0,
      notDueYet: 0,
      dueForPolling: 0,
    }

    for (const race of activeRaces.documents) {
      analysisResults.totalAnalyzed++

      // Skip finalized races
      if (race.status === 'Final') {
        analysisResults.skippedFinalized++
        continue
      }

      // Skip races without start time
      if (!race.startTime) {
        analysisResults.skippedNoStartTime++
        logDebug(context,'Race missing start time', {
          raceId: race.$id,
          raceName: race.name || 'Unknown',
        })
        continue
      }

      // Enhanced race timing analysis with detailed logging
      const advertisedStart = new Date(race.startTime)
      const timeToStartMs = advertisedStart.getTime() - now.getTime()
      const timeToStartMinutes = timeToStartMs / (1000 * 60)

      // Get required polling interval based on enhanced mathematical strategy
      const requiredInterval = getPollingInterval(
        timeToStartMinutes,
        race.status
      )

      // Enhanced logging for different polling phases
      const isCriticalPeriod = Math.abs(timeToStartMinutes) <= 10
      const isEarlyMorningPhase = timeToStartMinutes > 65
      const pollingPhase = isEarlyMorningPhase
        ? 'EARLY_MORNING_BASELINE'
        : timeToStartMinutes > 5
        ? 'PROXIMITY_ACTIVE'
        : 'PROXIMITY_CRITICAL'

      if (isCriticalPeriod || isEarlyMorningPhase) {
        logDebug(context,
          `${pollingPhase} race analysis: ${
            race.name?.substring(0, 40) || 'Unknown'
          }`,
          {
            raceId: race.$id.slice(-8),
            status: race.status,
            timeToStartMinutes: Math.round(timeToStartMinutes * 100) / 100, // 2 decimal precision
            requiredInterval,
            pollingPhase,
            startTime: race.startTime,
            lastPollTime: race.last_poll_time,
          }
        )
      }

      // Skip races where polling should stop (Final status)
      if (requiredInterval === null) {
        analysisResults.skippedFinalized++
        if (isCriticalPeriod) {
          logDebug(context,'Skipping finalized critical race', {
            raceId: race.$id.slice(-8),
            status: race.status,
          })
        }
        continue
      }

      // Enhanced window check - support early morning baseline + proximity polling
      // Early morning: Poll all Open races from 9 AM NZ regardless of start time
      // Proximity: Enhanced strategy within 65 minutes of start time
      // Post-race: Continue until 60 minutes after start for final data
      const isWithinPollingWindow = timeToStartMinutes >= -60 // Only exclude races >60min after start
      if (!isWithinPollingWindow) {
        analysisResults.notDueYet++
        continue
      }

      // Enhanced polling due check with detailed logging
      const lastPollTime = race.last_poll_time
        ? new Date(race.last_poll_time)
        : new Date(0)
      const timeSinceLastPoll = now.getTime() - lastPollTime.getTime()
      const timeSinceLastPollMinutes = timeSinceLastPoll / (1000 * 60)

      const isFirstPoll = !race.last_poll_time
      const shouldPoll =
        isFirstPoll || timeSinceLastPollMinutes >= requiredInterval

      // Enhanced logging for polling decisions (critical races and early morning phase)
      if (isCriticalPeriod || isEarlyMorningPhase) {
        logDebug(context,`Polling decision for ${pollingPhase.toLowerCase()} race`, {
          raceId: race.$id.slice(-8),
          shouldPoll,
          isFirstPoll,
          timeSinceLastPollMinutes:
            Math.round(timeSinceLastPollMinutes * 100) / 100,
          requiredInterval,
          pollingPhase,
          reason: shouldPoll
            ? isFirstPoll
              ? 'first_poll'
              : 'interval_exceeded'
            : 'too_recent',
        })
      }

      if (shouldPoll) {
        racesDueForPolling.push({
          raceId: race.$id,
          raceName: race.name || 'Unknown',
          status: race.status,
          timeToStartMinutes: Math.round(timeToStartMinutes * 100) / 100, // 2 decimal precision
          requiredInterval,
          timeSinceLastPollMinutes:
            Math.round(timeSinceLastPollMinutes * 100) / 100,
          advertisedStart: race.startTime,
          isFirstPoll,
          isCriticalPeriod,
        })
        analysisResults.dueForPolling++
      } else {
        analysisResults.notDueYet++
      }
    }

    logDebug(context,'Race analysis completed', {
      ...analysisResults,
      racesToPoll: racesDueForPolling.length,
      sampleRacesDueForPolling: racesDueForPolling.slice(0, 5).map((r) => ({
        id: r.raceId.slice(-4),
        name: r.raceName.substring(0, 30),
        timeToStart: r.timeToStartMinutes,
        interval: r.requiredInterval,
        timeSincePoll: r.timeSinceLastPollMinutes,
        isFirst: r.isFirstPoll,
      })),
      executionTimeMs: Date.now() - startTime,
    })

    // If no races due for polling, return early
    if (racesDueForPolling.length === 0) {
      return {
        success: true,
        message: 'No races due for polling',
        analysis: analysisResults,
        nextCheckIn: '30 seconds',
      }
    }

    // PHASE 3: Function Execution with Enhanced Monitoring
    progressTracker.currentOperation = 'scheduling-functions';
    progressTracker.schedulingPhase = 'function-execution';
    progressTracker.racesScheduled = racesDueForPolling.length;
    await updateHeartbeat(lockManager, progressTracker);

    // Check NZ time termination before function execution
    if (shouldTerminateForNzTime(context)) {
        return {
            success: false,
            message: 'Terminated due to NZ time limit before function execution',
            terminationReason: 'nz-time-limit',
            statistics: progressTracker
        };
    }

    // Enhanced polling strategy with comprehensive execution monitoring
    let pollingStrategy
    let functionTriggered = false
    const executionStartTime = Date.now()

    // Detailed pre-execution analysis
    const criticalRaces = racesDueForPolling.filter((r) => r.isCriticalPeriod)
    logDebug(context,'Function execution analysis', {
      totalRacesDue: racesDueForPolling.length,
      criticalRaces: criticalRaces.length,
      criticalRaceDetails: criticalRaces.map((r) => ({
        id: r.raceId.slice(-8),
        name: r.raceName.substring(0, 30),
        timeToStart: r.timeToStartMinutes,
        status: r.status,
        interval: r.requiredInterval,
      })),
    })

    if (racesDueForPolling.length === 1) {
      // Single race - use enhanced poller in single mode
      pollingStrategy = 'enhanced_single'
      const race = racesDueForPolling[0]

      logDebug(context,'Executing single race polling strategy', {
        raceId: race.raceId.slice(-8),
        raceName: race.raceName.substring(0, 40),
        status: race.status,
        timeToStart: race.timeToStartMinutes,
        requiredInterval: race.requiredInterval,
        isCritical: race.isCriticalPeriod,
      })

      try {
        const executionResult = await functions.createExecution(
          'enhanced-race-poller',
          JSON.stringify({ raceId: race.raceId }),
          false // async flag
        )

        functionTriggered = true
        progressTracker.functionsTriggered = 1
        logDebug(context,'✓ Enhanced race poller (single) triggered successfully', {
          raceId: race.raceId.slice(-8),
          raceName: race.raceName.substring(0, 40),
          executionId: executionResult.$id,
          timeToStart: race.timeToStartMinutes,
          status: race.status,
        })
      } catch (error) {
        context.error('✗ Failed to trigger enhanced race poller (single)', {
          raceId: race.raceId.slice(-8),
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join(' | '),
        })
      }
    } else if (racesDueForPolling.length <= 10) {
      // Multiple races - use enhanced poller in batch mode
      pollingStrategy = 'enhanced_batch'
      const raceIds = racesDueForPolling.map((r) => r.raceId)

      logDebug(context,'Executing batch polling strategy', {
        raceCount: raceIds.length,
        criticalCount: criticalRaces.length,
        raceDetails: racesDueForPolling.map((r) => ({
          id: r.raceId.slice(-8),
          name: r.raceName.substring(0, 20),
          timeToStart: r.timeToStartMinutes,
          status: r.status,
          interval: r.requiredInterval,
        })),
      })

      try {
        const executionResult = await functions.createExecution(
          'enhanced-race-poller',
          JSON.stringify({ raceIds }),
          false // async flag
        )

        functionTriggered = true
        progressTracker.functionsTriggered = 1
        logDebug(context,'✓ Enhanced race poller (batch) triggered successfully', {
          raceCount: raceIds.length,
          criticalCount: criticalRaces.length,
          executionId: executionResult.$id,
          raceIds: raceIds.map((id) => id.slice(-8)), // All race IDs for tracking
        })
      } catch (error) {
        context.error('✗ Failed to trigger enhanced race poller (batch)', {
          raceIds: raceIds.map((id) => id.slice(-8)),
          raceCount: raceIds.length,
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join(' | '),
        })
      }
    } else {
      // Too many races - split into multiple batches
      pollingStrategy = 'enhanced_multiple_batches'
      const batchSize = 10
      const batches = []

      for (let i = 0; i < racesDueForPolling.length; i += batchSize) {
        batches.push(racesDueForPolling.slice(i, i + batchSize))
      }

      logDebug(context,'Executing multiple batch polling strategy', {
        totalRaces: racesDueForPolling.length,
        totalBatches: batches.length,
        batchSize,
        criticalCount: criticalRaces.length,
      })

      let successfulBatches = 0
      const batchResults = []

      for (const [index, batch] of batches.entries()) {
        const raceIds = batch.map((r) => r.raceId)
        const batchCriticalCount = batch.filter(
          (r) => r.isCriticalPeriod
        ).length

        try {
          const executionResult = await functions.createExecution(
            'enhanced-race-poller',
            JSON.stringify({ raceIds }),
            false // async flag
          )

          successfulBatches++
          const batchResult = {
            batchNumber: index + 1,
            success: true,
            executionId: executionResult.$id,
            raceCount: raceIds.length,
            criticalCount: batchCriticalCount,
            raceIds: raceIds.map((id) => id.slice(-8)),
          }
          batchResults.push(batchResult)

          logDebug(context,
            `✓ Enhanced poller batch ${index + 1}/${batches.length} triggered`,
            batchResult
          )
        } catch (error) {
          const batchResult = {
            batchNumber: index + 1,
            success: false,
            raceCount: raceIds.length,
            criticalCount: batchCriticalCount,
            raceIds: raceIds.map((id) => id.slice(-8)),
            error: error.message,
          }
          batchResults.push(batchResult)

          context.error(
            `✗ Enhanced poller batch ${index + 1}/${batches.length} failed`,
            batchResult
          )
        }
      }

      functionTriggered = successfulBatches > 0
      progressTracker.functionsTriggered = successfulBatches

      logDebug(context,'Multiple batch execution completed', {
        totalBatches: batches.length,
        successfulBatches,
        totalRaces: racesDueForPolling.length,
        criticalRaces: criticalRaces.length,
        executionTimeMs: Date.now() - executionStartTime,
        batchResults,
      })
    }

    // Update last_poll_time for all races that were scheduled for polling
    if (functionTriggered) {
      const updatePromises = racesDueForPolling.map(async (race) => {
        try {
          await databases.updateDocument(databaseId, 'races', race.raceId, {
            last_poll_time: now.toISOString(),
          })
        } catch (error) {
          context.error('Failed to update last_poll_time', {
            raceId: race.raceId,
            error: error.message,
          })
        }
      })

      await Promise.allSettled(updatePromises)

      logDebug(context,'Updated last_poll_time for scheduled races', {
        racesUpdated: racesDueForPolling.length,
      })
    }

    // Enhanced final execution summary with mathematical polling verification
    const totalExecutionTime = Date.now() - startTime
    const criticalRacesPolled = racesDueForPolling.filter(
      (r) => r.isCriticalPeriod
    ).length

    // Dual-phase polling coverage analysis
    const pollingCoverageAnalysis = {
      criticalPeriodRaces: criticalRaces.length,
      criticalRacesPolled,
      coveragePercentage:
        criticalRaces.length > 0
          ? Math.round((criticalRacesPolled / criticalRaces.length) * 100)
          : 100,
      dualPhaseIntervals: {
        early_morning_baseline_65m_plus: racesDueForPolling.filter(
          (r) => r.timeToStartMinutes > 65 && r.requiredInterval === 30
        ).length,
        proximity_active_5_to_60m: racesDueForPolling.filter(
          (r) =>
            r.timeToStartMinutes > 5 &&
            r.timeToStartMinutes <= 60 &&
            r.requiredInterval === 2.5
        ).length,
        proximity_critical_0_to_5m: racesDueForPolling.filter(
          (r) =>
            r.timeToStartMinutes >= 0 &&
            r.timeToStartMinutes <= 5 &&
            r.requiredInterval === 0.5
        ).length,
        transition_60_to_65m: racesDueForPolling.filter(
          (r) =>
            r.timeToStartMinutes > 60 &&
            r.timeToStartMinutes <= 65 &&
            r.requiredInterval === 2.5
        ).length,
      },
    }

    // Final heartbeat update and completion
    progressTracker.currentOperation = 'execution-completed';
    progressTracker.schedulingPhase = 'completion';
    await updateHeartbeat(lockManager, progressTracker);

    const executionSummary = {
      success: true,
      message: `Enhanced Master Scheduler v2.0 completed successfully`,
      pollingStrategy,
      racesScheduled: racesDueForPolling.length,
      criticalRacesHandled: criticalRacesPolled,
      pollingCoverage: pollingCoverageAnalysis,
      analysis: analysisResults,
      executionTimeMs: totalExecutionTime,
      functionTriggered,
      functionsTriggered: progressTracker.functionsTriggered,
      nextCheckIn: '1 minute (CRON minimum)',
      nzTimeDisplay,
      isAfterNz9AM,
      statistics: progressTracker, // Include full progress for cleanup
      enhancedFeatures: {
        dualPhasePollingStrategy: true,
        earlyMorningBaselineCollection: true,
        mathematicalIntervalGuarantees: true,
        simplifiedTimezoneHandling: true,
        criticalPeriodMonitoring: true,
        comprehensiveExecutionLogging: true,
        ultraFastLockMechanism: true,
        midnightBoundaryProtection: true,
        nzTimeAwareTermination: true,
        microHeartbeatMonitoring: true
      },
    }

    logDebug(context,'🚀 Enhanced Master Scheduler execution completed', {
      ...executionSummary,
      performanceMetrics: {
        totalTimeMs: totalExecutionTime,
        avgTimePerRace:
          racesDueForPolling.length > 0
            ? Math.round(totalExecutionTime / racesDueForPolling.length)
            : 0,
        functionExecutionSuccess: functionTriggered,
      },
      nextPollingPrediction: {
        expectedCriticalRaces: criticalRaces.length,
        nextCriticalPolling: '30 seconds (managed by enhanced-race-poller)',
        nextProximityPolling:
          '2.5 minutes (active period 5-60m before race, 30s for <3m)',
        nextBaselinePolling:
          '30 minutes (early morning phase >65m before race)',
        dualPhaseStrategy:
          'Early morning baseline (30min) → Proximity enhanced (2.5min/30s)',
      },
    })

    return executionSummary
  } catch (error) {
    const executionTimeMs = Date.now() - startTime

    context.error('Master race scheduler failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      executionTimeMs,
      timestamp: new Date().toISOString(),
    })

    return {
      success: false,
      error: 'Master scheduler execution failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      executionTimeMs,
    }
  }
}

/**
 * Calculate required polling interval with DUAL-PHASE STRATEGY
 *
 * PHASE 1 - Early Morning Baseline (9 AM NZ - 65min before race):
 * - All Open races: 30 minutes (ensures 60m baseline data from early morning)
 *
 * PHASE 2 - Enhanced Proximity Polling (65min before - race end):
 * - 5-60m: 2.5 minutes (guarantees every 5m column gets ≥1 data point)
 * - 0-5m: 30 seconds (guarantees every 1m column gets ≥1 data point)
 * - Post-start: Continue until Final status
 *
 * Mathematical proof:
 * - 30min early polling ensures 60m baseline available from 9:30 AM onward
 * - 2.5min interval + 5min column = worst case: poll at 0s, 2.5m, 5m → covers all 5m boundaries
 * - 30s interval + 1min column = worst case: poll at 0s, 30s, 60s → covers all 1m boundaries
 *
 * @param {number} timeToStartMinutes - Minutes until race start (negative if race has started)
 * @param {string} raceStatus - Current race status (primary determinant)
 * @returns {number|null} Polling interval in minutes, or null to stop polling
 */
function getPollingInterval(timeToStartMinutes, raceStatus) {
  // STATUS-DRIVEN POLLING: Primary logic based on race status, not time

  // Open status: Enhanced strategy with delegated high-frequency polling
  if (raceStatus === 'Open') {
    // PHASE 1: Early Morning Baseline Collection (>65 minutes before race)
    if (timeToStartMinutes > 65) {
      return 30 // 30 minutes - early morning baseline polling for 60m column data
    }
    // PHASE 2: Enhanced Proximity Polling (≤65 minutes before race)
    else if (timeToStartMinutes <= 0) {
      return 0.5 // 30 seconds - critical period (race start time passed) - delegated to enhanced-race-poller
    } else if (timeToStartMinutes <= 3) {
      return 0.5 // 30 seconds - critical approach period (3m to 0s) - delegated to enhanced-race-poller
    } else if (timeToStartMinutes <= 5) {
      return 0.5 // 30 seconds - pre-critical period (5m to 3m) - delegated to enhanced-race-poller
    } else if (timeToStartMinutes <= 60) {
      return 2.5 // 2.5 minutes - active period (60m to 5m) - guarantees 5m column coverage
    } else {
      // This case (60 < timeToStartMinutes <= 65) uses enhanced strategy
      return 2.5 // 2.5 minutes - transition to enhanced proximity polling
    }
  }

  // Post-open status polling (race has actually started transitioning)
  if (raceStatus === 'Closed') {
    return 0.5 // 30 seconds - closed to running transition - delegated to enhanced-race-poller
  } else if (raceStatus === 'Running') {
    return 0.5 // 30 seconds - running to interim transition - delegated to enhanced-race-poller
  } else if (raceStatus === 'Interim') {
    return 0.5 // 30 seconds - interim to final transition - delegated to enhanced-race-poller
  } else if (
    raceStatus === 'Final' ||
    raceStatus === 'Finalized' ||
    raceStatus === 'Abandoned'
  ) {
    return null // Stop polling - race is final
  } else {
    // Fallback for unknown statuses - treat as active based on time and phase
    if (timeToStartMinutes > 65) {
      return 30 // 30 minutes - early morning baseline phase
    } else if (timeToStartMinutes <= 3) {
      return 0.5 // 30 seconds for critical period - delegated to enhanced-race-poller
    } else if (timeToStartMinutes <= 5) {
      return 0.5 // 30 seconds for pre-critical period - delegated to enhanced-race-poller
    } else if (timeToStartMinutes <= 60) {
      return 2.5 // 2.5 minutes for active period
    } else {
      return 2.5 // 2.5 minutes for transition period (60-65m)
    }
  }
}
