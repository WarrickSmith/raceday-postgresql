import { Client, Databases } from 'node-appwrite'
import { fetchRaceEventData } from '../../race-data-poller/src/api-client.js'
import { processEntrants, processMoneyTrackerData } from '../../race-data-poller/src/database-utils.js'
import {
  validateEnvironmentVariables,
  executeApiCallWithTimeout,
  handleError,
} from '../../race-data-poller/src/error-handlers.js'

/**
 * Single Race Poller - HTTP-triggered function for high-frequency polling of specific races
 * Called by client applications for dynamic polling (15s, 30s, 1m, 2m intervals)
 * 
 * Expected payload: { raceId: "race-uuid" }
 */
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
    const nztabBaseUrl = process.env['NZTAB_API_BASE_URL'] || 'https://api.tab.co.nz'

    // Parse request payload
    const payload = context.req.body ? JSON.parse(context.req.body) : context.req.bodyJson || {}
    const { raceId } = payload

    if (!raceId) {
      const response = {
        success: false,
        error: 'Missing required parameter: raceId'
      }
      return context.res.json(response, 400)
    }

    context.log('Single race polling request', {
      raceId,
      timestamp: new Date().toISOString(),
      requestSource: 'client-app'
    })

    // Initialize Appwrite client
    const client = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey)
    const databases = new Databases(client)
    const databaseId = 'raceday-db'

    // Verify race exists in database
    try {
      const race = await databases.getDocument(databaseId, 'races', raceId)
      
      if (race.status === 'Final') {
        const response = {
          success: false,
          message: 'Race is finalized, polling not required',
          raceId,
          status: race.status
        }
        context.log('Race already finalized, no polling needed', { raceId, status: race.status })
        return context.res.json(response, 200)
      }

      context.log(`Polling single race: ${race.name} (${race.status})`)
    } catch (error) {
      const response = {
        success: false,
        error: `Race not found: ${raceId}`
      }
      context.error('Race lookup failed', { raceId, error: error.message })
      return context.res.json(response, 404)
    }

    // Fetch latest race data
    const raceEventData = await executeApiCallWithTimeout(
      fetchRaceEventData,
      [nztabBaseUrl, raceId, context],
      context,
      10000, // 10-second timeout for single race
      0 // No retries for client-requested polls
    )

    if (!raceEventData) {
      const response = {
        success: false,
        error: 'Failed to fetch race data from NZTAB API',
        raceId
      }
      context.error('NZTAB API fetch failed', { raceId })
      return context.res.json(response, 503)
    }

    let updatesProcessed = 0

    // Update entrant data if available
    if (raceEventData.entrants && raceEventData.entrants.length > 0) {
      const entrantsUpdated = await processEntrants(
        databases,
        databaseId,
        raceId,
        raceEventData.entrants,
        context
      )
      updatesProcessed += entrantsUpdated
    }

    // Process money tracker data if available
    let moneyFlowProcessed = 0
    if (raceEventData.money_tracker) {
      moneyFlowProcessed = await processMoneyTrackerData(
        databases,
        databaseId,
        raceEventData.money_tracker,
        context
      )
    }

    context.log('Single race polling completed successfully', {
      raceId,
      entrantsUpdated: updatesProcessed,
      moneyFlowProcessed,
      timestamp: new Date().toISOString()
    })

    const response = {
      success: true,
      message: 'Race data updated successfully',
      raceId,
      statistics: {
        entrantsUpdated: updatesProcessed,
        moneyFlowProcessed
      }
    }

    return context.res.json(response, 200)

  } catch (error) {
    handleError(error, 'Single race poller function', context, {
      timestamp: new Date().toISOString()
    }, false) // Don't throw, handle gracefully
    
    const response = {
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
    
    context.error('Single race poller function failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    })
    
    return context.res.json(response, 500)
  }
}