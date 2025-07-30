import { Client, Databases, Query } from 'node-appwrite'
import { fetchRaceEventData } from './api-client.js'
import { processEntrants } from './database-utils.js'
import {
  validateEnvironmentVariables,
  executeApiCallWithTimeout,
  handleError,
  rateLimit,
} from './error-handlers.js'

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
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const oneHourFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000)

    // Query races needing polling (within time window, not Final)
    context.log('Fetching active races for polling...')
    const racesResult = await databases.listDocuments(databaseId, 'races', [
      Query.greaterThanEqual('startTime', twoHoursAgo.toISOString()),
      Query.lessThanEqual('startTime', oneHourFromNow.toISOString()),
      Query.notEqual('status', 'Final'),
      Query.orderAsc('startTime'),
    ])

    context.log(
      `Found ${racesResult.documents.length} active races for polling`
    )

    if (racesResult.documents.length === 0) {
      context.log('No active races found for polling')
      return {
        success: true,
        message: 'No active races found for polling',
        statistics: {
          racesFound: 0,
          racesPolled: 0,
          updatesProcessed: 0,
        },
      }
    }

    let racesPolled = 0
    let updatesProcessed = 0

    // Process each race (simplified polling logic for refactor)
    for (const race of racesResult.documents) {
      try {
        context.log(`Polling race ${race.raceId}`)

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

    context.log('Race data poller function completed', {
      timestamp: new Date().toISOString(),
      racesFound: racesResult.documents.length,
      racesPolled,
      updatesProcessed,
    })

    return {
      success: true,
      message: `Successfully polled ${racesPolled} races with ${updatesProcessed} updates`,
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
