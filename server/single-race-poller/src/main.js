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

    // Parse request payload - Handle Appwrite's inconsistent body parsing
    let payload = {}
    
    try {
      // Primary: Try parsing context.req.body as string (most reliable)
      if (context.req.body && typeof context.req.body === 'string' && context.req.body.trim()) {
        payload = JSON.parse(context.req.body)
        context.log('Parsed JSON from body string', { payload })
      }
      // Fallback: Try parsing manually from raw bodyText
      else if (context.req.bodyText && context.req.bodyText.trim()) {
        payload = JSON.parse(context.req.bodyText)
        context.log('Parsed JSON from bodyText', { payload })
      }
      // Fallback: Use automatically parsed JSON if supported
      else if (context.req.body && typeof context.req.body === 'object') {
        payload = context.req.body
        context.log('Using automatically parsed JSON body', { payload })
      }
      // Final fallback: Query parameters (for testing)
      else if (context.req.query?.raceId) {
        payload.raceId = context.req.query.raceId
        context.log('Using raceId from query parameters', { raceId: payload.raceId })
      }
      else {
        context.log('No valid request payload found', {
          bodyType: typeof context.req.body,
          bodyValue: context.req.body,
          bodyTextLength: context.req.bodyText?.length || 0,
          method: context.req.method,
          contentType: context.req.headers?.['content-type']
        })
      }
    } catch (error) {
      context.log('Failed to parse request payload', {
        error: error.message,
        bodyText: context.req.bodyText,
        body: context.req.body,
        bodyType: typeof context.req.body
      })
    }
    
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
      payload,
      bodyType: typeof context.req.body,
      bodyValue: context.req.body,
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
      
      // Send response immediately
      context.res.json(immediateResponse, 202) // 202 Accepted
      
    } catch (error) {
      const response = {
        success: false,
        error: `Race not found: ${raceId}`
      }
      context.error('Race lookup failed', { raceId, error: error.message })
      return context.res.json(response, 404)
    }

    // Continue processing in background after response sent
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
        return // Background processing failed, but client already got response
      }

      let updatesProcessed = 0
      let moneyFlowProcessed = 0

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
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      context.error('Background processing failed', {
        raceId,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      })
    }

    // Function continues running in background, client already has response

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