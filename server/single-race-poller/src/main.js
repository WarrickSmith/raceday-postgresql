import { Client, Databases } from 'node-appwrite'
import { fetchRaceEventData } from './api-client.js'
import { processEntrants, processMoneyTrackerData } from './database-utils.js'
import {
  validateEnvironmentVariables,
  executeApiCallWithTimeout,
  handleError,
} from './error-handlers.js'

/**
 * Single Race Poller - HTTP-triggered function for high-frequency polling of specific races
 * 
 * RECOMMENDED INTEGRATION: Use Appwrite Node.js SDK with Next.js Server Actions rather than
 * direct HTTP calls. Server Actions provide better security, error handling, and timeout management.
 * See README.md for implementation examples.
 * 
 * Expected payload: { raceId: "race-uuid" }
 * HTTP endpoint maintained for compatibility and testing purposes.
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
    // NOTE: This HTTP endpoint supports direct calls for compatibility, but the RECOMMENDED 
    // approach is using Appwrite SDK with Next.js Server Actions for better reliability,
    // security, and timeout handling. See README.md for implementation details.
    
    let payload = {}
    
    try {
      // Standard approach: Parse JSON body (works with SDK calls)
      if (typeof context.req.body === 'string') {
        payload = JSON.parse(context.req.body)
      } else if (typeof context.req.body === 'object' && context.req.body !== null) {
        payload = context.req.body
      } else if (context.req.query?.raceId) {
        // Fallback for testing via query parameters
        payload = { raceId: context.req.query.raceId }
      }
    } catch (error) {
      context.error('Invalid JSON payload', { 
        error: error.message,
        bodyType: typeof context.req.body 
      })
    }
    
    const { raceId } = payload

    if (!raceId) {
      const response = {
        success: false,
        error: 'Missing required parameter: raceId',
        hint: 'Use Server Actions (recommended) or send JSON: {"raceId": "race-uuid"}'
      }
      return context.res.json(response, 400)
    }

    context.log('Single race polling request', {
      raceId,
      timestamp: new Date().toISOString(),
      requestMethod: context.req.method
    })

    // Initialize Appwrite client
    const client = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey)
    const databases = new Databases(client)
    const databaseId = 'raceday-db'

    // Quick race validation and immediate response for client
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

      context.log(`Starting single race polling: ${race.name} (${race.status})`)
      
      // Return immediate response to prevent 30s timeout
      // Processing will continue in background
      const immediateResponse = {
        success: true,
        message: 'Race polling initiated successfully',
        raceId,
        raceName: race.name,
        status: race.status,
        note: 'Data processing in progress, check database for updates'
      }
      
      // Defer background processing
      setImmediate(async () => {
        try {
          // Fetch latest race data
          const raceEventData = await executeApiCallWithTimeout(
            fetchRaceEventData,
            [nztabBaseUrl, raceId, context],
            context,
            12000, // 12-second timeout - no client waiting
            0 // No retries for client-requested polls
          )
          
          if (!raceEventData) {
            context.error('NZTAB API fetch failed', { raceId })
            return // Background processing failed
          }
          
          let updatesProcessed = 0
          let moneyFlowProcessed = 0
          let raceStatusUpdated = false
          
          // Update race status if available and different from current status
          if (raceEventData.race && raceEventData.race.status) {
            try {
              // Get current race status to compare
              const currentRace = await databases.getDocument(databaseId, 'races', raceId);
              
              if (currentRace.status !== raceEventData.race.status) {
                await databases.updateDocument(databaseId, 'races', raceId, {
                  status: raceEventData.race.status
                });
                raceStatusUpdated = true;
                context.log(`Updated race status`, { 
                  raceId, 
                  oldStatus: currentRace.status, 
                  newStatus: raceEventData.race.status 
                });
              }
            } catch (error) {
              context.error('Failed to update race status', {
                raceId,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }
          
          // Process both entrants and money flow in parallel
          const processingPromises = []
          
          // Update entrant data if available
          if (raceEventData.entrants && raceEventData.entrants.length > 0) {
            processingPromises.push(
              processEntrants(databases, databaseId, raceId, raceEventData.entrants, context)
                .then(count => { updatesProcessed = count })
            )
          }
          
          // Process money tracker data if available
          if (raceEventData.money_tracker) {
            processingPromises.push(
              processMoneyTrackerData(databases, databaseId, raceEventData.money_tracker, context)
                .then(count => { moneyFlowProcessed = count })
            )
          }
          
          // Wait for all processing to complete
          await Promise.all(processingPromises)
          
          context.log('Background race polling completed successfully', {
            raceId,
            entrantsUpdated: updatesProcessed,
            moneyFlowProcessed,
            raceStatusUpdated,
            timestamp: new Date().toISOString()
          })
          
        } catch (error) {
          context.error('Background processing failed', {
            raceId,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          })
        }
      })

      // Send response immediately and terminate request handler
      return context.res.json(immediateResponse, 202) // 202 Accepted
      
    } catch (error) {
      const response = {
        success: false,
        error: `Race not found: ${raceId}`
      }
      context.error('Race lookup failed', { raceId, error: error.message })
      return context.res.json(response, 404)
    }

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