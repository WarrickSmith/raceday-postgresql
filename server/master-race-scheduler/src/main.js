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

    // Dynamic racing hours based on actual race schedule
    // Active from 65 minutes before first race until all NZ/AUS races are finalized
    const now = new Date()
    
    // Proper NZ timezone calculation
    // Get current time in Pacific/Auckland and extract the timezone offset
    const nzTimeString = now.toLocaleString('en-US', { 
      timeZone: 'Pacific/Auckland',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    
    // Parse the NZ time string properly  
    const [nzDatePart, nzTimePart] = nzTimeString.split(', ')
    const [nzMonth, nzDay, nzYear] = nzDatePart.split('/')
    const [nzHour, nzMinute, nzSecond] = nzTimePart.split(':')
    
    // Create proper NZ time representation (this is what NZ time looks like)
    const nzTimeDisplay = new Date(nzYear, nzMonth - 1, nzDay, nzHour, nzMinute, nzSecond)
    
    // For UTC calculations, we need to work backwards from NZ time to get UTC equivalents
    // Create a UTC timestamp that represents 9:00 AM in NZ today
    const nzTodayUTC = new Date(nzYear, nzMonth - 1, nzDay) // NZ date at midnight
    const nz9AmLocal = new Date(nzYear, nzMonth - 1, nzDay, 9, 0, 0) // 9 AM NZ time
    
    // Calculate the offset between what JavaScript thinks the NZ time is vs actual UTC
    const nzOffsetTest = new Date().toLocaleString('en-US', { timeZone: 'Pacific/Auckland' })
    const utcTest = new Date().toLocaleString('en-US', { timeZone: 'UTC' })  
    
    // More reliable approach: Create UTC timestamp for 9 AM NZ by using known conversions
    // Pacific/Auckland is typically UTC+12 (NZST) or UTC+13 (NZDT)
    // Instead of guessing, we'll calculate it directly
    const tempNzDate = new Date()
    tempNzDate.setUTCFullYear(nzYear)
    tempNzDate.setUTCMonth(nzMonth - 1) 
    tempNzDate.setUTCDate(nzDay)
    tempNzDate.setUTCHours(9, 0, 0, 0) // 9 AM UTC temporarily
    
    // Get what this time looks like in NZ timezone
    const testNzTime = tempNzDate.toLocaleString('en-US', { 
      timeZone: 'Pacific/Auckland',
      hour: '2-digit',
      minute: '2-digit', 
      hour12: false
    })
    
    // Calculate offset needed to make it 9:00 AM NZ time
    const [testHour] = testNzTime.split(':')
    const hourDiff = 9 - parseInt(testHour)
    
    // Create proper UTC timestamp for 9 AM NZ time
    const nzNineAM = new Date(tempNzDate.getTime() + (hourDiff * 60 * 60 * 1000))

    // meeting-status-poller trigger logic moved below (after active-period check)

    // Query today's races to determine active period
    // Generate today's date in NZ timezone for filtering
    const nzToday = `${nzYear}-${nzMonth.padStart(2, '0')}-${nzDay.padStart(2, '0')}` // YYYY-MM-DD format

    const todaysRaces = await databases.listDocuments(databaseId, 'races', [
      Query.equal('raceDateNz', nzToday),
      Query.limit(400), // Ensure we can handle large race days
    ])

    // Already filtered by database query, no need for additional filtering
    const racesToday = todaysRaces.documents

    context.log('Race date filtering', {
      nzToday,
      totalRaces: todaysRaces.documents.length,
      todaysRaces: racesToday.length,
      allRaceDates: [
        ...new Set(todaysRaces.documents.map((r) => r.raceDateNz)),
      ].sort(),
      sampleRaces: todaysRaces.documents.slice(0, 10).map((r) => ({
        id: r.$id.slice(-4),
        raceDateNz: r.raceDateNz,
        startTimeNz: r.startTimeNz,
        status: r.status,
      })),
    })

    if (racesToday.length === 0) {
      context.log('No races found for today, scheduler dormant', {
        nowUTC: now.toISOString(),
        nzTimeDisplay: nzTimeDisplay.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
        nzToday: nzToday,
      })

      return {
        success: true,
        message: 'No races scheduled today',
        nowUTC: now.toISOString(),
        nzTimeDisplay: nzTimeDisplay.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
        nzToday: nzToday,
      }
    }

    // Find earliest race start time
    const racesWithStartTime = racesToday.filter((race) => race.startTime)
    if (racesWithStartTime.length === 0) {
      context.log('No races with start times found, scheduler dormant', {
        nowUTC: now.toISOString(),
        nzTimeDisplay: nzTimeDisplay.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
        racesTodayCount: racesToday.length,
      })

      return {
        success: true,
        message: 'No races with start times found',
        nowUTC: now.toISOString(),
        nzTimeDisplay: nzTimeDisplay.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
      }
    }

    const earliestStartTime = new Date(
      Math.min(
        ...racesWithStartTime.map((r) => new Date(r.startTime).getTime())
      )
    )
    const activePeriodStartByEarliest = new Date(
      earliestStartTime.getTime() - 65 * 60 * 1000
    ) // 65 minutes before
    // Ensure the scheduler does not start earlier than NZ 09:00 — use the later of the two timestamps
    const activePeriodStart = new Date(
      Math.max(activePeriodStartByEarliest.getTime(), nzNineAM.getTime())
    )

    // Check if all races are finalized
    const allFinalized = racesToday.every((race) => race.status === 'Final')

    const isCurrentlyActive = now >= activePeriodStart && !allFinalized

    context.log('Dynamic racing schedule check', {
      nowUTC: now.toISOString(),
      nzTimeDisplay: nzTimeDisplay.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
      nzToday: nzToday,
      racesTodayCount: racesToday.length,
      earliestRace: earliestStartTime.toISOString(),
      activePeriodStart: activePeriodStart.toISOString(),
      nzNineAM: nzNineAM.toISOString(),
      allFinalized,
      isCurrentlyActive,
      timezoneDebug: {
        nzTimeString,
        testNzTime,
        hourDiff,
        nowVsActivePeriod: `${now.toISOString()} >= ${activePeriodStart.toISOString()} = ${now >= activePeriodStart}`
      }
    })

    if (!isCurrentlyActive) {
      const reason =
        now < activePeriodStart ? 'before active period' : 'all races finalized'

      context.log('Outside dynamic racing period, scheduler sleeping', {
        nowUTC: now.toISOString(),
        nzTimeDisplay: nzTimeDisplay.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
        reason,
        activePeriodStart: activePeriodStart.toISOString(),
        allFinalized,
      })

      return {
        success: true,
        message: `Scheduler dormant: ${reason}`,
        nowUTC: now.toISOString(),
        nzTimeDisplay: nzTimeDisplay.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
        activePeriodStart: activePeriodStart.toISOString(),
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

      // Calculate time to start and determine polling interval
      const advertisedStart = new Date(race.startTime)
      const timeToStartMs = advertisedStart.getTime() - now.getTime()
      const timeToStartMinutes = timeToStartMs / (1000 * 60)

      // Get required polling interval based on race lifecycle
      const requiredInterval = getPollingInterval(
        timeToStartMinutes,
        race.status
      )

      // Skip races where polling should stop (Final status)
      if (requiredInterval === null) {
        analysisResults.skippedFinalized++
        continue
      }

      // Skip races that are too far in the future (more than 65 minutes away)
      // or too far in the past (more than 1 hour ago)
      if (timeToStartMinutes > 65 || timeToStartMinutes < -60) {
        analysisResults.notDueYet++
        continue
      }

      // Check if race is due for polling based on last_poll_time
      const lastPollTime = race.last_poll_time
        ? new Date(race.last_poll_time)
        : new Date(0)
      const timeSinceLastPoll = now.getTime() - lastPollTime.getTime()
      const timeSinceLastPollMinutes = timeSinceLastPoll / (1000 * 60)

      // For races that have never been polled, use a more conservative approach
      const isFirstPoll = !race.last_poll_time
      const shouldPoll = isFirstPoll
        ? timeToStartMinutes >= -60 && timeToStartMinutes <= 65 // Only poll first time if within extended window for baseline capture
        : timeSinceLastPollMinutes >= requiredInterval

      if (shouldPoll) {
        racesDueForPolling.push({
          raceId: race.$id,
          raceName: race.name || 'Unknown',
          status: race.status,
          timeToStartMinutes: Math.round(timeToStartMinutes * 10) / 10, // Round to 1 decimal
          requiredInterval,
          timeSinceLastPollMinutes:
            Math.round(timeSinceLastPollMinutes * 10) / 10,
          advertisedStart: race.startTime,
          isFirstPoll,
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

    // Enhanced polling strategy using unified enhanced-race-poller
    let pollingStrategy
    let functionTriggered = false

    if (racesDueForPolling.length === 1) {
      // Single race - use enhanced poller in single mode
      pollingStrategy = 'enhanced_single'
      const race = racesDueForPolling[0]

      try {
        await functions.createExecution(
          'enhanced-race-poller',
          JSON.stringify({ raceId: race.raceId }),
          false // async flag
        )

        functionTriggered = true
        context.log('Triggered enhanced race poller (single)', {
          raceId: race.raceId,
          raceName: race.raceName,
          status: race.status,
          timeToStart: race.timeToStartMinutes,
        })
      } catch (error) {
        context.error('Failed to trigger enhanced race poller (single)', {
          raceId: race.raceId,
          error: error.message,
        })
      }
    } else if (racesDueForPolling.length <= 10) {
      // Multiple races - use enhanced poller in batch mode (max 10 for performance)
      pollingStrategy = 'enhanced_batch'
      const raceIds = racesDueForPolling.map((r) => r.raceId)

      try {
        await functions.createExecution(
          'enhanced-race-poller',
          JSON.stringify({ raceIds }),
          false // async flag
        )

        functionTriggered = true
        context.log('Triggered enhanced race poller (batch)', {
          raceCount: raceIds.length,
          raceIds: raceIds.slice(0, 3), // Log first 3 for reference
          totalRaces: raceIds.length,
        })
      } catch (error) {
        context.error('Failed to trigger enhanced race poller (batch)', {
          raceIds,
          error: error.message,
        })
      }
    } else {
      // Too many races - split into multiple batches using enhanced poller
      pollingStrategy = 'enhanced_multiple_batches'
      const batchSize = 10
      const batches = []

      for (let i = 0; i < racesDueForPolling.length; i += batchSize) {
        batches.push(racesDueForPolling.slice(i, i + batchSize))
      }

      let successfulBatches = 0

      for (const [index, batch] of batches.entries()) {
        const raceIds = batch.map((r) => r.raceId)

        try {
          await functions.createExecution(
            'enhanced-race-poller',
            JSON.stringify({ raceIds }),
            false // async flag
          )

          successfulBatches++
          context.log(`Triggered enhanced poller batch ${index + 1}/${batches.length}`, {
            batchSize: raceIds.length,
            raceIds: raceIds.slice(0, 3), // Log first 3 for reference
          })
        } catch (error) {
          context.error(
            `Failed to trigger enhanced poller batch ${index + 1}/${batches.length}`,
            {
              raceIds,
              error: error.message,
            }
          )
        }
      }

      functionTriggered = successfulBatches > 0

      context.log('Enhanced multiple batch polling completed', {
        totalBatches: batches.length,
        successfulBatches,
        totalRaces: racesDueForPolling.length,
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

    // Final execution summary
    const executionSummary = {
      success: true,
      message: `Master scheduler completed successfully`,
      pollingStrategy,
      racesScheduled: racesDueForPolling.length,
      analysis: analysisResults,
      executionTimeMs: Date.now() - startTime,
      nextCheckIn: '15 seconds',
      nowUTC: now.toISOString(),
      nzTimeDisplay: nzTimeDisplay.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
    }

    context.log('Master scheduler execution completed', executionSummary)

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
 * Calculate required polling interval using STATUS-DRIVEN logic
 *
 * Updated polling strategy:
 * - Minimum polling interval is now 30 seconds (was 15 seconds)
 * - -20m to -5m: 5 minute polling (was 2 minutes for -20m to -10m)
 * - -5m to -1m: 1 minute polling (was 1 minute for -10m to -5m)
 * - -1m until Interim status: 30 seconds (was 15 seconds for -5m to start)
 * - After Interim status confirmed: 5 minutes until Final, then stop
 *
 * @param {number} timeToStartMinutes - Minutes until race start (negative if race has started)
 * @param {string} raceStatus - Current race status (primary determinant)
 * @returns {number} Polling interval in minutes
 */
function getPollingInterval(timeToStartMinutes, raceStatus) {
  // STATUS-DRIVEN POLLING: Primary logic based on race status, not time

  // Open status: Keep polling until race actually closes
  if (raceStatus === 'Open') {
    if (timeToStartMinutes <= 1) {
      return 0.5 // 30 seconds - aggressive polling until actually closed (-1m to start)
    } else if (timeToStartMinutes <= 5) {
      return 1 // 1 minute - frequent polling as race approaches (-5m to -1m)
    } else if (timeToStartMinutes <= 20) {
      return 5 // 5 minutes - moderate polling (-20m to -5m)
    } else if (timeToStartMinutes >= 65) {
      return 5 // 5 minutes - baseline capture polling for very early races (65m+ before start)
    } else {
      return 5 // 5 minutes - standard polling for distant races
    }
  }

  // Post-open status polling (race has actually started transitioning)
  if (raceStatus === 'Closed') {
    return 0.5 // 30 seconds - closed to running transition
  } else if (raceStatus === 'Running') {
    return 0.5 // 30 seconds - running to interim transition
  } else if (raceStatus === 'Interim') {
    return 5 // 5 minutes - interim to final transition
  } else if (
    raceStatus === 'Final' ||
    raceStatus === 'Finalized' ||
    raceStatus === 'Abandoned'
  ) {
    return null // Stop polling - race is final
  } else {
    // Fallback for unknown statuses - treat as active
    return timeToStartMinutes <= 1 ? 0.5 : 5
  }
}
