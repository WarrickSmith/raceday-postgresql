import { Client, Databases, Query } from 'node-appwrite'
import { fetchRaceEventData } from './api-client.js'
import { processEntrants, processMoneyTrackerData, processToteTrendsData } from './database-utils.js'
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

        // Process tote pools data FIRST to get pool totals for money flow calculations
        let racePoolData = null;
        if (raceEventData.tote_pools && Array.isArray(raceEventData.tote_pools)) {
          try {
            // Process the tote_pools array from NZTAB API
            await processToteTrendsData(
              databases,
              databaseId,
              race.raceId,
              raceEventData.tote_pools,
              context
            );
            
            // Extract pool data for money flow processing using new structure
            racePoolData = { winPoolTotal: 0, placePoolTotal: 0, totalRacePool: 0 };
            
            raceEventData.tote_pools.forEach(pool => {
              const total = pool.total || 0;
              racePoolData.totalRacePool += total;
              
              switch(pool.product_type) {
                case "Win":
                  racePoolData.winPoolTotal = total;
                  break;
                case "Place":
                  racePoolData.placePoolTotal = total;
                  break;
              }
            });
            
            context.log(`Processed tote pools data for race ${race.raceId}`, {
              poolsCount: raceEventData.tote_pools.length,
              racePoolData,
            });
          } catch (error) {
            context.error('Failed to process tote trends data', {
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

        // Process money tracker data with pool data if available (with race status filtering)
        if (raceEventData.money_tracker) {
          const raceStatus = raceEventData.race && raceEventData.race.status ? raceEventData.race.status : race.status;
          const moneyFlowProcessed = await processMoneyTrackerData(
            databases,
            databaseId,
            raceEventData.money_tracker,
            context,
            race.raceId,
            racePoolData,
            raceStatus
          )
          context.log(`Processed money tracker data for race ${race.raceId}`, {
            entrantsProcessed: moneyFlowProcessed,
            racePoolDataAvailable: !!racePoolData,
            raceStatus: raceStatus
          })
        }

        // Update last_poll_time to coordinate with master scheduler
        try {
          await databases.updateDocument(databaseId, 'races', race.raceId, {
            last_poll_time: now.toISOString()
          });
          context.log(`Updated last_poll_time for race ${race.raceId}`);
        } catch (error) {
          context.error('Failed to update last_poll_time', {
            raceId: race.raceId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
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
