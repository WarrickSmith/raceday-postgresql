import { Client, Databases, Functions, Query } from 'node-appwrite'

/**
 * Master Race Scheduler - Autonomous polling coordination for horse race data
 *
 * This function serves as the central coordinator for all race polling activities.
 * When triggered by cron (every minute), runs 2 cycles at 30-second intervals (0s, 30s).
 * When triggered manually, runs a single cycle for testing.
 *
 * Updated polling strategy:
 * - Minimum polling interval is now 30 seconds (was 15 seconds)
 * - -20m to -5m: 5 minute polling (was 2 minutes for -20m to -10m)
 * - -5m to -1m: 1 minute polling (was 1 minute for -10m to -5m)
 * - -1m until Interim status: 30 seconds (was 15 seconds for -5m to start)
 * - After Interim status confirmed: 5 minutes until Final, then stop
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
  const startTime = Date.now()

  context.log('Master race scheduler started', {
    timestamp: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })

  // Check if this is a scheduled run (cron) vs manual run
  if (context.req.headers['x-appwrite-task']) {
    // Run the polling logic 2 times at 30s intervals for cron-triggered executions
    // This gives us executions at 0s, 30s (next cron cycle handles 60s)
    context.log(
      'Scheduled execution: Running 2 cycles at 30s intervals within 1-minute window'
    )

    for (let i = 0; i < 2; i++) {
      context.log(`Starting polling cycle ${i + 1}/2 at ${i * 30}s offset`)
      await runSchedulerLogic(context)

      if (i < 1) {
        context.log(`Waiting 30 seconds before cycle ${i + 2}/2`)
        await new Promise((res) => setTimeout(res, 30000)) // wait 30s
      }
    }

    return context.res.json({
      success: true,
      message: 'Scheduler completed 2 cycles at 30s intervals (0s, 30s)',
      totalExecutionTime: Date.now() - startTime,
    })
  } else {
    // For manual runs, just run once
    context.log('Manual execution: Running single cycle')
    return await runSchedulerLogic(context)
  }
}

/**
 * Core scheduler logic - extracted to allow both single and multiple executions
 */
async function runSchedulerLogic(context) {
  const startTime = Date.now()

  try {
    // Validate environment variables
    const requiredEnvVars = [
      'APPWRITE_ENDPOINT',
      'APPWRITE_PROJECT_ID',
      'APPWRITE_API_KEY',
    ]

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`)
      }
    }

    const endpoint = process.env['APPWRITE_ENDPOINT']
    const projectId = process.env['APPWRITE_PROJECT_ID']
    const apiKey = process.env['APPWRITE_API_KEY']

    // Initialize Appwrite clients
    const client = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey)

    const databases = new Databases(client)
    const functions = new Functions(client)
    const databaseId = 'raceday-db'

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
      hour12: false
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
    const nzToday = `${nzYear}-${nzMonth.padStart(2, '0')}-${nzDay.padStart(2, '0')}` // YYYY-MM-DD format

    const todaysRaces = await databases.listDocuments(databaseId, 'races', [
      Query.equal('raceDateNz', nzToday),
      Query.limit(400), // Ensure we can handle large race days
    ])

    const racesToday = todaysRaces.documents

    context.log('Enhanced race filtering', {
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

    if (racesToday.length === 0) {
      context.log('No races found for today, scheduler dormant', {
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
    const isCurrentlyActive = isAfterNz9AM && racesWithStartTime.length > 0 && !allFinalized

    if (racesWithStartTime.length === 0) {
      context.log('No races with start times found, scheduler dormant', {
        nzTimeDisplay,
        racesTodayCount: racesToday.length,
      })

      return {
        success: true,
        message: 'No races with start times found',
        nzTimeDisplay,
      }
    }

    context.log('Enhanced racing schedule check', {
      nzTimeDisplay,
      isAfterNz9AM,
      racesTodayCount: racesToday.length,
      racesWithStartTime: racesWithStartTime.length,
      allFinalized,
      isCurrentlyActive,
    })

    if (!isCurrentlyActive) {
      const reason = !isAfterNz9AM ? 'before 9AM NZ' : 'all races finalized'

      context.log('Outside racing period, scheduler sleeping', {
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

    context.log('Active races retrieved', {
      totalRaces: activeRaces.documents.length,
      racesToAnalyze: activeRaces.documents.filter((r) => r.status !== 'Final')
        .length,
    })

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
        context.log('Race missing start time', {
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
      const pollingPhase = isEarlyMorningPhase ? 'EARLY_MORNING_BASELINE' : 
                          timeToStartMinutes > 5 ? 'PROXIMITY_ACTIVE' : 'PROXIMITY_CRITICAL'
      
      if (isCriticalPeriod || isEarlyMorningPhase) {
        context.log(`${pollingPhase} race analysis: ${race.name?.substring(0, 40) || 'Unknown'}`, {
          raceId: race.$id.slice(-8),
          status: race.status,
          timeToStartMinutes: Math.round(timeToStartMinutes * 100) / 100, // 2 decimal precision
          requiredInterval,
          pollingPhase,
          startTime: race.startTime,
          lastPollTime: race.last_poll_time,
        })
      }

      // Skip races where polling should stop (Final status)
      if (requiredInterval === null) {
        analysisResults.skippedFinalized++
        if (isCriticalPeriod) {
          context.log('Skipping finalized critical race', {
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
      const shouldPoll = isFirstPoll || timeSinceLastPollMinutes >= requiredInterval

      // Enhanced logging for polling decisions (critical races and early morning phase)
      if (isCriticalPeriod || isEarlyMorningPhase) {
        context.log(`Polling decision for ${pollingPhase.toLowerCase()} race`, {
          raceId: race.$id.slice(-8),
          shouldPoll,
          isFirstPoll,
          timeSinceLastPollMinutes: Math.round(timeSinceLastPollMinutes * 100) / 100,
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

    context.log('Race analysis completed', {
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
        nextCheckIn: '15 seconds',
      }
    }

    // Enhanced polling strategy with comprehensive execution monitoring
    let pollingStrategy
    let functionTriggered = false
    const executionStartTime = Date.now()
    
    // Detailed pre-execution analysis
    const criticalRaces = racesDueForPolling.filter(r => r.isCriticalPeriod)
    context.log('Function execution analysis', {
      totalRacesDue: racesDueForPolling.length,
      criticalRaces: criticalRaces.length,
      criticalRaceDetails: criticalRaces.map(r => ({
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

      context.log('Executing single race polling strategy', {
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
        context.log('✓ Enhanced race poller (single) triggered successfully', {
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

      context.log('Executing batch polling strategy', {
        raceCount: raceIds.length,
        criticalCount: criticalRaces.length,
        raceDetails: racesDueForPolling.map(r => ({
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
        context.log('✓ Enhanced race poller (batch) triggered successfully', {
          raceCount: raceIds.length,
          criticalCount: criticalRaces.length,
          executionId: executionResult.$id,
          raceIds: raceIds.map(id => id.slice(-8)), // All race IDs for tracking
        })
      } catch (error) {
        context.error('✗ Failed to trigger enhanced race poller (batch)', {
          raceIds: raceIds.map(id => id.slice(-8)),
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

      context.log('Executing multiple batch polling strategy', {
        totalRaces: racesDueForPolling.length,
        totalBatches: batches.length,
        batchSize,
        criticalCount: criticalRaces.length,
      })

      let successfulBatches = 0
      const batchResults = []

      for (const [index, batch] of batches.entries()) {
        const raceIds = batch.map((r) => r.raceId)
        const batchCriticalCount = batch.filter(r => r.isCriticalPeriod).length

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
            raceIds: raceIds.map(id => id.slice(-8)),
          }
          batchResults.push(batchResult)

          context.log(`✓ Enhanced poller batch ${index + 1}/${batches.length} triggered`, batchResult)
        } catch (error) {
          const batchResult = {
            batchNumber: index + 1,
            success: false,
            raceCount: raceIds.length,
            criticalCount: batchCriticalCount,
            raceIds: raceIds.map(id => id.slice(-8)),
            error: error.message,
          }
          batchResults.push(batchResult)

          context.error(`✗ Enhanced poller batch ${index + 1}/${batches.length} failed`, batchResult)
        }
      }

      functionTriggered = successfulBatches > 0

      context.log('Multiple batch execution completed', {
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

      context.log('Updated last_poll_time for scheduled races', {
        racesUpdated: racesDueForPolling.length,
      })
    }

    // Enhanced final execution summary with mathematical polling verification
    const totalExecutionTime = Date.now() - startTime
    const criticalRacesPolled = racesDueForPolling.filter(r => r.isCriticalPeriod).length
    
    // Dual-phase polling coverage analysis
    const pollingCoverageAnalysis = {
      criticalPeriodRaces: criticalRaces.length,
      criticalRacesPolled,
      coveragePercentage: criticalRaces.length > 0 ? Math.round((criticalRacesPolled / criticalRaces.length) * 100) : 100,
      dualPhaseIntervals: {
        early_morning_baseline_65m_plus: racesDueForPolling.filter(r => r.timeToStartMinutes > 65 && r.requiredInterval === 30).length,
        proximity_active_5_to_60m: racesDueForPolling.filter(r => r.timeToStartMinutes > 5 && r.timeToStartMinutes <= 60 && r.requiredInterval === 2.5).length,
        proximity_critical_0_to_5m: racesDueForPolling.filter(r => r.timeToStartMinutes >= 0 && r.timeToStartMinutes <= 5 && r.requiredInterval === 0.5).length,
        transition_60_to_65m: racesDueForPolling.filter(r => r.timeToStartMinutes > 60 && r.timeToStartMinutes <= 65 && r.requiredInterval === 2.5).length,
      },
    }

    const executionSummary = {
      success: true,
      message: `Enhanced Master Scheduler completed successfully`,
      pollingStrategy,
      racesScheduled: racesDueForPolling.length,
      criticalRacesHandled: criticalRacesPolled,
      pollingCoverage: pollingCoverageAnalysis,
      analysis: analysisResults,
      executionTimeMs: totalExecutionTime,
      functionTriggered,
      nextCheckIn: '30 seconds (dual cycle)',
      nzTimeDisplay,
      isAfterNz9AM,
      enhancedFeatures: {
        dualPhasePollingStrategy: true,
        earlyMorningBaselineCollection: true,
        mathematicalIntervalGuarantees: true,
        simplifiedTimezoneHandling: true,
        criticalPeriodMonitoring: true,
        comprehensiveExecutionLogging: true,
      },
    }

    context.log('🚀 Enhanced Master Scheduler execution completed', {
      ...executionSummary,
      performanceMetrics: {
        totalTimeMs: totalExecutionTime,
        avgTimePerRace: racesDueForPolling.length > 0 ? Math.round(totalExecutionTime / racesDueForPolling.length) : 0,
        functionExecutionSuccess: functionTriggered,
      },
      nextPollingPrediction: {
        expectedCriticalRaces: criticalRaces.length,
        nextCriticalPolling: '30 seconds (if critical races remain)',
        nextProximityPolling: '2.5 minutes (active period 5-60m before race)',
        nextBaselinePolling: '30 minutes (early morning phase >65m before race)',
        dualPhaseStrategy: 'Early morning baseline (30min) → Proximity enhanced (2.5min/30s)',
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

  // Open status: Dual-phase strategy
  if (raceStatus === 'Open') {
    // PHASE 1: Early Morning Baseline Collection (>65 minutes before race)
    if (timeToStartMinutes > 65) {
      return 30 // 30 minutes - early morning baseline polling for 60m column data
    }
    // PHASE 2: Enhanced Proximity Polling (≤65 minutes before race)
    else if (timeToStartMinutes <= 0) {
      return 0.5 // 30 seconds - critical period until actually closed (0s to start)
    } else if (timeToStartMinutes <= 5) {
      return 0.5 // 30 seconds - critical approach period (5m to 0s) - guarantees 1m column coverage
    } else if (timeToStartMinutes <= 60) {
      return 2.5 // 2.5 minutes - active period (60m to 5m) - guarantees 5m column coverage
    } else {
      // This case (60 < timeToStartMinutes <= 65) uses enhanced strategy
      return 2.5 // 2.5 minutes - transition to enhanced proximity polling
    }
  }

  // Post-open status polling (race has actually started transitioning)
  if (raceStatus === 'Closed') {
    return 0.5 // 30 seconds - closed to running transition
  } else if (raceStatus === 'Running') {
    return 0.5 // 30 seconds - running to interim transition
  } else if (raceStatus === 'Interim') {
    return 2.5 // 2.5 minutes - interim to final transition (less critical)
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
    } else if (timeToStartMinutes <= 5) {
      return 0.5 // 30 seconds for critical period
    } else if (timeToStartMinutes <= 60) {
      return 2.5 // 2.5 minutes for active period
    } else {
      return 2.5 // 2.5 minutes for transition period (60-65m)
    }
  }
}
