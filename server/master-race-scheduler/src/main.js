import { Client, Databases, Functions, Query } from 'node-appwrite'

/**
 * Master Race Scheduler - Autonomous polling coordination for horse race data
 * 
 * This function serves as the central coordinator for all race polling activities.
 * When triggered by cron (every minute), runs 3 cycles at 15-second intervals (0s, 15s, 30s).
 * The 45s execution comes from the next cron cycle, achieving true 15s polling.
 * When triggered manually, runs a single cycle for testing.
 * 
 * Architecture:
 * - Analyzes all active races for polling requirements every 15 seconds
 * - Calculates dynamic polling intervals based on race timing
 * - Intelligently selects batch vs individual polling functions
 * - Tracks last poll times to prevent redundant polling
 * - Dynamically active from 1 hour before first NZ/AUS race until all races finalized
 */
export default async function main(context) {
  const startTime = Date.now()
  
  context.log('Master race scheduler started', {
    timestamp: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  })

  // Check if this is a scheduled run (cron) vs manual run
  if (context.req.headers['x-appwrite-task']) {
    // Run the polling logic 3 times at 15s intervals for cron-triggered executions
    // This gives us executions at 0s, 15s, 30s, 45s (next cron cycle handles 60s)
    context.log('Scheduled execution: Running 3 cycles at 15s intervals within 1-minute window')
    
    for (let i = 0; i < 3; i++) {
      context.log(`Starting polling cycle ${i + 1}/3 at ${(i * 15)}s offset`)
      await runSchedulerLogic(context)
      
      if (i < 2) {
        context.log(`Waiting 15 seconds before cycle ${i + 2}/3`)
        await new Promise(res => setTimeout(res, 15000)) // wait 15s
      }
    }
    
    return context.res.json({ 
      success: true, 
      message: 'Scheduler completed 3 cycles at 15s intervals (0s, 15s, 30s, 45s via next cron)',
      totalExecutionTime: Date.now() - startTime
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
      'APPWRITE_API_KEY'
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
    // Active from 1 hour before first race until all NZ/AUS races are finalized
    const now = new Date()
    const nzTime = new Date(now.toLocaleString("en-US", {timeZone: "Pacific/Auckland"}))
    
    // Query today's races to determine active period
    // Generate today's date in NZ timezone for filtering
    const nzToday = nzTime.toISOString().split('T')[0] // YYYY-MM-DD format
    
    const todaysRaces = await databases.listDocuments(databaseId, 'races', [
      Query.equal('raceDateNz', nzToday),
      Query.limit(400) // Ensure we can handle large race days
    ])
    
    // Already filtered by database query, no need for additional filtering
    const racesToday = todaysRaces.documents
    
    context.log('Race date filtering', {
      nzToday,
      totalRaces: todaysRaces.documents.length,
      todaysRaces: racesToday.length,
      allRaceDates: [...new Set(todaysRaces.documents.map(r => r.raceDateNz))].sort(),
      sampleRaces: todaysRaces.documents.slice(0, 10).map(r => ({
        id: r.$id.slice(-4),
        raceDateNz: r.raceDateNz,
        startTimeNz: r.startTimeNz,
        status: r.status
      }))
    })
    
    if (racesToday.length === 0) {
      context.log('No races found for today, scheduler dormant', {
        nzTime: nzTime.toISOString()
      })
      
      return {
        success: true,
        message: 'No races scheduled today',
        nzTime: nzTime.toISOString()
      }
    }
    
    // Find earliest race start time
    const racesWithStartTime = racesToday.filter(race => race.startTime)
    if (racesWithStartTime.length === 0) {
      context.log('No races with start times found, scheduler dormant', {
        nzTime: nzTime.toISOString(),
        racesTodayCount: racesToday.length
      })
      
      return {
        success: true,
        message: 'No races with start times found',
        nzTime: nzTime.toISOString()
      }
    }
    
    const earliestStartTime = new Date(Math.min(...racesWithStartTime.map(r => new Date(r.startTime).getTime())))
    const activePeriodStart = new Date(earliestStartTime.getTime() - (60 * 60 * 1000)) // 1 hour before
    
    // Check if all races are finalized
    const allFinalized = racesToday.every(race => race.status === 'Final')
    
    const isCurrentlyActive = now >= activePeriodStart && !allFinalized
    
    context.log('Dynamic racing schedule check', {
      nzTime: nzTime.toISOString(),
      racesTodayCount: racesToday.length,
      earliestRace: earliestStartTime.toISOString(),
      activePeriodStart: activePeriodStart.toISOString(),
      allFinalized,
      isCurrentlyActive
    })
    
    if (!isCurrentlyActive) {
      const reason = now < activePeriodStart ? 'before active period' : 'all races finalized'
      
      context.log('Outside dynamic racing period, scheduler sleeping', {
        nzTime: nzTime.toISOString(),
        reason,
        activePeriodStart: activePeriodStart.toISOString(),
        allFinalized
      })
      
      return {
        success: true,
        message: `Scheduler dormant: ${reason}`,
        nzTime: nzTime.toISOString(),
        activePeriodStart: activePeriodStart.toISOString(),
        allRacesFinalized: allFinalized
      }
    }

    // Query all active races (not finalized)
    const activeRaces = await databases.listDocuments(databaseId, 'races', [
      Query.equal('raceDateNz', nzToday),
      Query.notEqual('status', 'Final'),
      Query.limit(400) // Ensure we can handle large race days
    ])

    context.log('Active races retrieved', {
      totalRaces: activeRaces.documents.length,
      racesToAnalyze: activeRaces.documents.filter(r => r.status !== 'Final').length
    })

    // Analyze each race for polling requirements
    const racesDueForPolling = []
    const analysisResults = {
      totalAnalyzed: 0,
      skippedFinalized: 0,
      skippedNoStartTime: 0,
      notDueYet: 0,
      dueForPolling: 0
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
          raceName: race.name || 'Unknown' 
        })
        continue
      }

      // Calculate time to start and determine polling interval
      const advertisedStart = new Date(race.startTime)
      const timeToStartMs = advertisedStart.getTime() - now.getTime()
      const timeToStartMinutes = timeToStartMs / (1000 * 60)

      // Get required polling interval based on race lifecycle
      const requiredInterval = getPollingInterval(timeToStartMinutes, race.status)
      
      // Skip races that are too far in the future (more than 1 hour away) 
      // or too far in the past (more than 1 hour ago)
      if (timeToStartMinutes > 60 || timeToStartMinutes < -60) {
        analysisResults.notDueYet++
        continue
      }
      
      // Check if race is due for polling based on last_poll_time
      const lastPollTime = race.last_poll_time ? new Date(race.last_poll_time) : new Date(0)
      const timeSinceLastPoll = now.getTime() - lastPollTime.getTime()
      const timeSinceLastPollMinutes = timeSinceLastPoll / (1000 * 60)

      // For races that have never been polled, use a more conservative approach
      const isFirstPoll = !race.last_poll_time
      const shouldPoll = isFirstPoll ? 
        (timeToStartMinutes >= -60 && timeToStartMinutes <= 60) : // Only poll first time if within ±1 hour window
        (timeSinceLastPollMinutes >= requiredInterval)

      if (shouldPoll) {
        racesDueForPolling.push({
          raceId: race.$id,
          raceName: race.name || 'Unknown',
          status: race.status,
          timeToStartMinutes: Math.round(timeToStartMinutes * 10) / 10, // Round to 1 decimal
          requiredInterval,
          timeSinceLastPollMinutes: Math.round(timeSinceLastPollMinutes * 10) / 10,
          advertisedStart: race.startTime,
          isFirstPoll
        })
        analysisResults.dueForPolling++
      } else {
        analysisResults.notDueYet++
      }
    }

    context.log('Race analysis completed', {
      ...analysisResults,
      racesToPoll: racesDueForPolling.length,
      sampleRacesDueForPolling: racesDueForPolling.slice(0, 5).map(r => ({
        id: r.raceId.slice(-4),
        name: r.raceName.substring(0, 30),
        timeToStart: r.timeToStartMinutes,
        interval: r.requiredInterval,
        timeSincePoll: r.timeSinceLastPollMinutes,
        isFirst: r.isFirstPoll
      })),
      executionTimeMs: Date.now() - startTime
    })

    // If no races due for polling, return early
    if (racesDueForPolling.length === 0) {
      return {
        success: true,
        message: 'No races due for polling',
        analysis: analysisResults,
        nextCheckIn: '15 seconds'
      }
    }

    // Determine polling strategy: batch vs individual
    let pollingStrategy
    let functionTriggered = false

    if (racesDueForPolling.length === 1) {
      // Single race - use individual poller
      pollingStrategy = 'individual'
      const race = racesDueForPolling[0]
      
      try {
        await functions.createExecution(
          'single-race-poller',
          JSON.stringify({ raceId: race.raceId }),
          false // async flag
        )
        
        functionTriggered = true
        context.log('Triggered single race poller', {
          raceId: race.raceId,
          raceName: race.raceName,
          status: race.status,
          timeToStart: race.timeToStartMinutes
        })
        
      } catch (error) {
        context.error('Failed to trigger single race poller', {
          raceId: race.raceId,
          error: error.message
        })
      }
      
    } else if (racesDueForPolling.length <= 10) {
      // Multiple races - use batch poller (max 10 for performance)
      pollingStrategy = 'batch'
      const raceIds = racesDueForPolling.map(r => r.raceId)
      
      try {
        await functions.createExecution(
          'batch-race-poller',
          JSON.stringify({ raceIds }),
          false // async flag
        )
        
        functionTriggered = true
        context.log('Triggered batch race poller', {
          raceCount: raceIds.length,
          raceIds: raceIds.slice(0, 3), // Log first 3 for reference
          totalRaces: raceIds.length
        })
        
      } catch (error) {
        context.error('Failed to trigger batch race poller', {
          raceIds,
          error: error.message
        })
      }
      
    } else {
      // Too many races - split into multiple batches
      pollingStrategy = 'multiple-batches'
      const batchSize = 10
      const batches = []
      
      for (let i = 0; i < racesDueForPolling.length; i += batchSize) {
        batches.push(racesDueForPolling.slice(i, i + batchSize))
      }
      
      let successfulBatches = 0
      
      for (const [index, batch] of batches.entries()) {
        const raceIds = batch.map(r => r.raceId)
        
        try {
          await functions.createExecution(
            'batch-race-poller',
            JSON.stringify({ raceIds }),
            false // async flag
          )
          
          successfulBatches++
          context.log(`Triggered batch ${index + 1}/${batches.length}`, {
            batchSize: raceIds.length,
            raceIds: raceIds.slice(0, 3) // Log first 3 for reference
          })
          
        } catch (error) {
          context.error(`Failed to trigger batch ${index + 1}/${batches.length}`, {
            raceIds,
            error: error.message
          })
        }
      }
      
      functionTriggered = successfulBatches > 0
      
      context.log('Multiple batch polling completed', {
        totalBatches: batches.length,
        successfulBatches,
        totalRaces: racesDueForPolling.length
      })
    }

    // Update last_poll_time for all races that were scheduled for polling
    if (functionTriggered) {
      const updatePromises = racesDueForPolling.map(async (race) => {
        try {
          await databases.updateDocument(databaseId, 'races', race.raceId, {
            last_poll_time: now.toISOString()
          })
        } catch (error) {
          context.error('Failed to update last_poll_time', {
            raceId: race.raceId,
            error: error.message
          })
        }
      })
      
      await Promise.allSettled(updatePromises)
      
      context.log('Updated last_poll_time for scheduled races', {
        racesUpdated: racesDueForPolling.length
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
      nzTime: nzTime.toISOString()
    }

    context.log('Master scheduler execution completed', executionSummary)
    
    return executionSummary

  } catch (error) {
    const executionTimeMs = Date.now() - startTime
    
    context.error('Master race scheduler failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      executionTimeMs,
      timestamp: new Date().toISOString()
    })
    
    return {
      success: false,
      error: 'Master scheduler execution failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      executionTimeMs
    }
  }
}

/**
 * Calculate required polling interval based on race timing and status
 * @param {number} timeToStartMinutes - Minutes until race start (negative if race has started)
 * @param {string} raceStatus - Current race status
 * @returns {number} Polling interval in minutes
 */
function getPollingInterval(timeToStartMinutes, raceStatus) {
  // Post-start polling based on status
  if (timeToStartMinutes <= 0) {
    if (raceStatus === 'Closed') {
      return 0.5 // 30 seconds - Closed to Interim
    } else if (raceStatus === 'Interim') {
      return 5 // 5 minutes - Interim to Final
    } else {
      return 5 // Default 5 minutes for other post-start statuses
    }
  }
  
  // Pre-start polling based on time to start
  if (timeToStartMinutes > 60) {
    return 5 // T-60m+: Poll every 5 minutes
  } else if (timeToStartMinutes > 20) {
    return 5 // T-60m to T-20m: Poll every 5 minutes
  } else if (timeToStartMinutes > 10) {
    return 2 // T-20m to T-10m: Poll every 2 minutes
  } else if (timeToStartMinutes > 5) {
    return 1 // T-10m to T-5m: Poll every 1 minute
  } else {
    return 0.25 // T-5m to Start: Poll every 15 seconds
  }
}