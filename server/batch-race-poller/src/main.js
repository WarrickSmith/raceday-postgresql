import { Client, Databases } from 'node-appwrite'
import { batchFetchRaceEventData } from './api-client.js'
import { batchProcessRaces } from './database-utils.js'
import {
  validateEnvironmentVariables,
  handleError,
  summarizeBatchResults
} from './error-handlers.js'

/**
 * Batch Race Poller - HTTP-triggered function for efficient multi-race polling
 * 
 * RECOMMENDED INTEGRATION: Use Appwrite Node.js SDK with Next.js Server Actions for
 * optimal performance, security, and timeout management.
 * 
 * Expected payload: { raceIds: ["race-uuid-1", "race-uuid-2", ...] }
 * Optimized for processing 3-5 races efficiently with shared resources.
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
    let payload = {}
    
    try {
      // Standard approach: Parse JSON body (works with SDK calls)
      if (typeof context.req.body === 'string') {
        payload = JSON.parse(context.req.body)
      } else if (typeof context.req.body === 'object' && context.req.body !== null) {
        payload = context.req.body
      } else if (context.req.query?.raceIds) {
        // Fallback for testing via query parameters - support comma-separated list
        const raceIdsParam = context.req.query.raceIds
        payload = { raceIds: raceIdsParam.split(',').map(id => id.trim()) }
      }
    } catch (error) {
      context.error('Invalid JSON payload', { 
        error: error.message,
        bodyType: typeof context.req.body 
      })
    }
    
    const { raceIds } = payload

    if (!raceIds || !Array.isArray(raceIds) || raceIds.length === 0) {
      const response = {
        success: false,
        error: 'Missing required parameter: raceIds (array)',
        hint: 'Use Server Actions (recommended) or send JSON: {"raceIds": ["race-uuid-1", "race-uuid-2"]}'
      }
      return context.res.json(response, 400)
    }

    // Validate batch size (optimal range: 3-5 races)
    if (raceIds.length > 10) {
      const response = {
        success: false,
        error: `Batch size too large: ${raceIds.length} races. Maximum recommended: 10 races`,
        hint: 'For better performance, use multiple smaller batches or single-race-poller for individual races'
      }
      return context.res.json(response, 400)
    }

    context.log('Batch race polling request', {
      raceCount: raceIds.length,
      raceIds: raceIds.slice(0, 3), // Log first 3 for reference
      timestamp: new Date().toISOString(),
      requestMethod: context.req.method
    })

    // Initialize Appwrite client with optimized connection pooling
    const client = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey)
    const databases = new Databases(client)
    const databaseId = 'raceday-db'

    // Quick race validation and filter out finalized races
    const validRaceIds = []
    const skippedRaces = []

    try {
      context.log('Validating races before batch processing...')
      
      for (const raceId of raceIds) {
        try {
          const race = await databases.getDocument(databaseId, 'races', raceId)
          
          if (race.status === 'Final') {
            skippedRaces.push({
              raceId,
              reason: 'Race already finalized',
              status: race.status
            })
            context.log(`Skipping finalized race: ${race.name}`, { raceId, status: race.status })
          } else {
            validRaceIds.push(raceId)
            context.log(`Race validated for processing: ${race.name}`, { raceId, status: race.status })
          }
        } catch (error) {
          skippedRaces.push({
            raceId,
            reason: 'Race not found',
            error: error.message
          })
          context.error('Race lookup failed during validation', { raceId, error: error.message })
        }
      }

      if (validRaceIds.length === 0) {
        const response = {
          success: false,
          message: 'No valid races to process',
          skippedRaces,
          totalRequested: raceIds.length,
          validRaces: 0
        }
        context.log('No valid races found for batch processing', { 
          totalRequested: raceIds.length,
          skippedRaces: skippedRaces.length 
        })
        return context.res.json(response, 200)
      }

      context.log(`Starting batch processing for ${validRaceIds.length} valid races`)
      
      // Return immediate response to prevent timeout
      const immediateResponse = {
        success: true,
        message: `Batch race polling initiated for ${validRaceIds.length} races`,
        validRaces: validRaceIds.length,
        skippedRaces: skippedRaces.length,
        totalRequested: raceIds.length,
        note: 'Data processing in progress, check database for updates'
      }
      
      // Defer background batch processing
      setImmediate(async () => {
        try {
          // Phase 1: Batch fetch race data with coordinated rate limiting
          context.log('Phase 1: Fetching race data from NZTAB API...')
          const raceResults = await batchFetchRaceEventData(nztabBaseUrl, validRaceIds, context, 1200) // 1.2s delay between API calls
          
          // Phase 2: Batch process all race data with shared database connection
          context.log('Phase 2: Processing race data with shared database connection...')
          const processingSummary = await batchProcessRaces(databases, databaseId, raceResults, context)
          
          // Phase 3: Final summary and logging
          context.log('Batch processing completed successfully', {
            totalRequested: raceIds.length,
            validRaces: validRaceIds.length,
            skippedRaces: skippedRaces.length,
            successfulRaces: processingSummary.successfulRaces,
            failedRaces: processingSummary.failedRaces,
            totalEntrantsProcessed: processingSummary.totalEntrantsProcessed,
            totalMoneyFlowProcessed: processingSummary.totalMoneyFlowProcessed,
            totalErrors: processingSummary.totalErrors,
            timestamp: new Date().toISOString()
          })
          
        } catch (error) {
          context.error('Background batch processing failed', {
            validRaceIds,
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
        error: 'Race validation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
      context.error('Batch race validation failed', { 
        raceIds, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
      return context.res.json(response, 500)
    }

  } catch (error) {
    handleError(error, 'Batch race poller function', context, {
      timestamp: new Date().toISOString()
    }, false) // Don't throw, handle gracefully
    
    const response = {
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
    
    context.error('Batch race poller function failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    })
    
    return context.res.json(response, 500)
  }
}