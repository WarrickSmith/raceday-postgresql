import { Client, Databases, Query } from 'node-appwrite'
import { fetchRaceEventData } from './api-client.js'
import { processEntrants, processMoneyTrackerData, processToteTrendsData } from './database-utils.js'
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
                const statusChangeTimestamp = new Date().toISOString();
                const updateData = {
                  status: raceEventData.race.status,
                  lastStatusChange: statusChangeTimestamp
                };
                
                // Add specific finalization timestamp for Final status
                if (raceEventData.race.status === 'Final' || raceEventData.race.status === 'Finalized') {
                  updateData.finalizedAt = statusChangeTimestamp;
                }
                
                // Add specific abandonment timestamp for Abandoned status
                if (raceEventData.race.status === 'Abandoned') {
                  updateData.abandonedAt = statusChangeTimestamp;
                }
                
                // Update race status (without results data)
                await databases.updateDocument(databaseId, 'races', raceId, updateData);
                
                // Handle results data separately in race-results collection
                if ((raceEventData.results && Array.isArray(raceEventData.results) && raceEventData.results.length > 0) || 
                    (raceEventData.dividends && Array.isArray(raceEventData.dividends) && raceEventData.dividends.length > 0)) {
                  
                  const resultsData = {
                    race: currentRace.$id, // Relationship to races collection
                    resultTime: statusChangeTimestamp
                  };
                  
                  // Add results data if present
                  if (raceEventData.results && Array.isArray(raceEventData.results) && raceEventData.results.length > 0) {
                    resultsData.resultsAvailable = true;
                    resultsData.resultsData = JSON.stringify(raceEventData.results);
                    
                    // Determine result status based on race status
                    if (raceEventData.race.status === 'Final') {
                      resultsData.resultStatus = 'final';
                    } else if (raceEventData.race.status === 'Interim') {
                      resultsData.resultStatus = 'interim';
                    } else {
                      resultsData.resultStatus = 'interim'; // Default for races with results
                    }
                  }
                  
                  // Add dividends data if present
                  if (raceEventData.dividends && Array.isArray(raceEventData.dividends) && raceEventData.dividends.length > 0) {
                    resultsData.dividendsData = JSON.stringify(raceEventData.dividends);
                    
                    // Extract flags from dividend data
                    const dividendStatuses = raceEventData.dividends.map(d => d.status?.toLowerCase());
                    resultsData.photoFinish = dividendStatuses.includes('photo');
                    resultsData.stewardsInquiry = dividendStatuses.includes('inquiry');
                    resultsData.protestLodged = dividendStatuses.includes('protest');
                  }
                  
                  // Capture fixed odds data from entrants/runners at the time results become available
                  if (raceEventData.runners && Array.isArray(raceEventData.runners) && raceEventData.runners.length > 0) {
                    try {
                      const fixedOddsData = {};
                      
                      raceEventData.runners.forEach(runner => {
                        if (runner.runner_number && runner.odds) {
                          fixedOddsData[runner.runner_number] = {
                            fixed_win: runner.odds.fixed_win || null,
                            fixed_place: runner.odds.fixed_place || null,
                            runner_name: runner.name || null,
                            entrant_id: runner.entrant_id || null
                          };
                        }
                      });
                      
                      if (Object.keys(fixedOddsData).length > 0) {
                        resultsData.fixedOddsData = JSON.stringify(fixedOddsData);
                        context.log(`Captured fixed odds for ${Object.keys(fixedOddsData).length} runners`, { raceId });
                      }
                    } catch (oddsError) {
                      context.error('Failed to capture fixed odds data', {
                        raceId,
                        error: oddsError instanceof Error ? oddsError.message : 'Unknown error'
                      });
                    }
                  } else if (raceEventData.entrants && Array.isArray(raceEventData.entrants) && raceEventData.entrants.length > 0) {
                    // Fallback to entrants array if runners not available
                    try {
                      const fixedOddsData = {};
                      
                      raceEventData.entrants.forEach(entrant => {
                        if (entrant.runner_number && entrant.odds) {
                          fixedOddsData[entrant.runner_number] = {
                            fixed_win: entrant.odds.fixed_win || null,
                            fixed_place: entrant.odds.fixed_place || null,
                            runner_name: entrant.name || null,
                            entrant_id: entrant.entrant_id || null
                          };
                        }
                      });
                      
                      if (Object.keys(fixedOddsData).length > 0) {
                        resultsData.fixedOddsData = JSON.stringify(fixedOddsData);
                        context.log(`Captured fixed odds from entrants for ${Object.keys(fixedOddsData).length} runners`, { raceId });
                      }
                    } catch (oddsError) {
                      context.error('Failed to capture fixed odds data from entrants', {
                        raceId,
                        error: oddsError instanceof Error ? oddsError.message : 'Unknown error'
                      });
                    }
                  }
                  
                  // Try to update existing race-results document first, create if doesn't exist
                  try {
                    // Query for existing race-results document for this race
                    const existingResultsQuery = await databases.listDocuments(databaseId, 'race-results', [
                      Query.equal('race', currentRace.$id),
                      Query.limit(1)
                    ]);
                    
                    if (existingResultsQuery.documents.length > 0) {
                      // Update existing race-results document
                      await databases.updateDocument(databaseId, 'race-results', existingResultsQuery.documents[0].$id, resultsData);
                      context.log(`Updated race-results document`, { raceId });
                    } else {
                      // Create new race-results document
                      await databases.createDocument(databaseId, 'race-results', 'unique()', resultsData);
                      context.log(`Created race-results document`, { raceId });
                    }
                  } catch (resultsError) {
                    context.error('Failed to save race results data', {
                      raceId,
                      error: resultsError instanceof Error ? resultsError.message : 'Unknown error'
                    });
                  }
                }
                raceStatusUpdated = true;
                context.log(`Updated race status`, { 
                  raceId, 
                  oldStatus: currentRace.status, 
                  newStatus: raceEventData.race.status,
                  statusChangeTimestamp,
                  finalizedAt: updateData.finalizedAt,
                  abandonedAt: updateData.abandonedAt,
                  hasResults: !!(raceEventData.results && raceEventData.results.length > 0),
                  hasDividends: !!(raceEventData.dividends && raceEventData.dividends.length > 0)
                });
              }
            } catch (error) {
              context.error('Failed to update race status', {
                raceId,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }
          
          // Process tote pools data FIRST to get pool totals for money flow calculations
          let racePoolData = null;
          if (raceEventData.tote_pools && Array.isArray(raceEventData.tote_pools)) {
            try {
              // Process the tote_pools array from NZTAB API
              await processToteTrendsData(databases, databaseId, raceId, raceEventData.tote_pools, context);
              
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
              
              context.log(`Processed tote pools data for race ${raceId}`, {
                poolsCount: raceEventData.tote_pools.length,
                racePoolData,
              });
            } catch (error) {
              context.error('Failed to process tote trends data', {
                raceId,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }
          
          // Process entrants and money flow with pool data in parallel
          const processingPromises = []
          
          // Update entrant data if available
          if (raceEventData.entrants && raceEventData.entrants.length > 0) {
            processingPromises.push(
              processEntrants(databases, databaseId, raceId, raceEventData.entrants, context)
                .then(count => { updatesProcessed = count })
            )
          }
          
          // Process money tracker data with pool data if available (with race status filtering)
          if (raceEventData.money_tracker) {
            context.log('Found money_tracker data in API response', {
              raceId,
              hasEntrants: !!(raceEventData.money_tracker.entrants),
              entrantCount: raceEventData.money_tracker.entrants ? raceEventData.money_tracker.entrants.length : 0
            });
            const raceStatus = raceEventData.race && raceEventData.race.status ? raceEventData.race.status : null;
            processingPromises.push(
              processMoneyTrackerData(databases, databaseId, raceEventData.money_tracker, context, raceId, racePoolData, raceStatus)
                .then(count => { 
                  moneyFlowProcessed = count;
                  context.log('Money tracker processing completed', { raceId, moneyFlowProcessed });
                })
                .catch(error => {
                  context.error('Money tracker processing failed', {
                    raceId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                  });
                })
            )
          } else {
            context.log('No money_tracker data found in API response', { raceId });
          }
          
          // Wait for all processing to complete
          await Promise.all(processingPromises)
          
          // Update last_poll_time for master scheduler coordination
          try {
            await databases.updateDocument(databaseId, 'races', raceId, {
              last_poll_time: new Date().toISOString()
            });
            context.log(`Updated last_poll_time for race ${raceId}`);
          } catch (error) {
            context.error('Failed to update last_poll_time', {
              raceId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
          
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