import { Client, Databases, Query } from 'node-appwrite'
import { fetchRaceEventData } from './api-client.js'
import { processEntrants, processMoneyTrackerData } from './database-utils.js'
import {
  validateEnvironmentVariables,
  executeApiCallWithTimeout,
  handleError,
  rateLimit,
} from './error-handlers.js'

const HOUR_IN_MS = 60 * 60 * 1000 // 1 hour in milliseconds


export default async function main(context) {
  try {
    // Validate environment variables
    validateEnvironmentVariables(
      ['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'],
      context
    )

    const endpoint = process.env['APPWRITE_ENDPOINT']
    const projectId = process.env['APPWRITE_PROJECT_ID']
    const apiKey = process.env['APPWRITE_API_KEY']
    const nztabBaseUrl =
      process.env['NZTAB_API_BASE_URL'] || 'https://api.tab.co.nz'

    context.log('Race data poller function started', {
      timestamp: new Date().toISOString(),
      nztabBaseUrl,
    })

    // Initialize Appwrite client
    const client = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey)
    const databases = new Databases(client)
    const databaseId = 'raceday-db'

    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - HOUR_IN_MS)
    const oneHourFromNow = new Date(now.getTime() + HOUR_IN_MS)

    // Query races within 1-hour window for baseline polling
    context.log('Fetching races for baseline polling (1-hour window)...')
    const racesResult = await databases.listDocuments(databaseId, 'races', [
      Query.greaterThanEqual('startTime', oneHourAgo.toISOString()),
      Query.lessThanEqual('startTime', oneHourFromNow.toISOString()),
      Query.notEqual('status', 'Final'),
      Query.orderAsc('startTime'),
    ])

    context.log(`Found ${racesResult.documents.length} races for baseline polling`)

    if (racesResult.documents.length === 0) {
      context.log('No races found within 1-hour window')
      return {
        success: true,
        message: 'No races found for baseline polling',
        statistics: {
          racesFound: 0,
          racesPolled: 0,
          updatesProcessed: 0,
        },
      }
    }

    let racesPolled = 0
    let updatesProcessed = 0

    // Process each race for baseline data updates
    for (const race of racesResult.documents) {
      try {
        context.log(`Baseline polling race ${race.raceId}`)

        // Fetch latest race data with timeout protection
        const raceEventData = await executeApiCallWithTimeout(
          fetchRaceEventData,
          [nztabBaseUrl, race.raceId, context],
          context,
          15000, // 15-second timeout
          0 // No retries for now
        )

        if (!raceEventData) {
          context.log(`No data returned for race ${race.raceId}`)
          continue
        }

        // Update race status if available and different
        if (raceEventData.race && raceEventData.race.status && raceEventData.race.status !== race.status) {
          try {
            await databases.updateDocument(databaseId, 'races', race.raceId, {
              status: raceEventData.race.status
            });
            context.log(`Updated race status`, { 
              raceId: race.raceId, 
              oldStatus: race.status, 
              newStatus: raceEventData.race.status 
            });
          } catch (error) {
            context.error('Failed to update race status', {
              raceId: race.raceId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        // Update entrant data if available
        if (raceEventData.entrants && raceEventData.entrants.length > 0) {
          const entrantsUpdated = await processEntrants(
            databases,
            databaseId,
            race.raceId,
            raceEventData.entrants,
            context
          )
          updatesProcessed += entrantsUpdated
        }

        // Process money tracker data if available
        if (raceEventData.money_tracker) {
          const moneyFlowProcessed = await processMoneyTrackerData(
            databases,
            databaseId,
            raceEventData.money_tracker,
            context
          )
          context.log(`Processed money tracker data for race ${race.raceId}`, {
            entrantsProcessed: moneyFlowProcessed,
          })
        }

        racesPolled++
        context.log(`Completed polling race ${race.raceId}`)

        // Rate limiting between races
        await rateLimit(500, context, 'Between race polling')
      } catch (error) {
        handleError(error, `Polling race ${race.raceId}`, context, {
          raceId: race.raceId,
        })
        // Continue with next race
      }
    }

    context.log('Baseline race data polling completed', {
      timestamp: new Date().toISOString(),
      racesFound: racesResult.documents.length,
      racesPolled,
      updatesProcessed,
    })

    return {
      success: true,
      message: `Baseline polling completed: ${racesPolled}/${racesResult.documents.length} races processed with ${updatesProcessed} updates`,
      statistics: {
        racesFound: racesResult.documents.length,
        racesPolled,
        updatesProcessed,
      },
    }
  } catch (error) {
    handleError(
      error,
      'Race data poller function',
      context,
      {
        timestamp: new Date().toISOString(),
      },
      true
    )
  }
}
