/**
 * Database utilities for single-race-poller function
 * Self-contained copy for the single-race-poller function
 */

import { ID } from 'node-appwrite';

/**
 * Extract pool totals from NZTAB API tote_pools array structure
 * @param {Array} tote_pools - Array of pool objects from NZTAB API
 * @param {Object} context - Appwrite function context for logging
 * @returns {Object} Extracted pool totals with proper mapping
 */
function extractPoolTotals(tote_pools, context) {
    const pools = {
        winPoolTotal: 0,
        placePoolTotal: 0,
        quinellaPoolTotal: 0,
        trifectaPoolTotal: 0,
        exactaPoolTotal: 0,
        first4PoolTotal: 0,
        totalRacePool: 0
    };

    if (!tote_pools || !Array.isArray(tote_pools)) {
        context.log('No tote_pools array found or invalid format');
        return pools;
    }

    tote_pools.forEach(pool => {
        const total = pool.total || 0;
        pools.totalRacePool += total;

        switch(pool.product_type) {
            case "Win":
                pools.winPoolTotal = total;
                break;
            case "Place":
                pools.placePoolTotal = total;
                break;
            case "Quinella":
                pools.quinellaPoolTotal = total;
                break;
            case "Trifecta":
                pools.trifectaPoolTotal = total;
                break;
            case "Exacta":
                pools.exactaPoolTotal = total;
                break;
            case "First 4":
            case "First Four":
                pools.first4PoolTotal = total;
                break;
            default:
                context.log(`Unknown pool product_type: ${pool.product_type}`, {
                    productType: pool.product_type,
                    total: total
                });
        }
    });

    context.log('Extracted pool totals from tote_pools array', {
        poolCount: tote_pools.length,
        totalRacePool: pools.totalRacePool,
        winPoolTotal: pools.winPoolTotal,
        placePoolTotal: pools.placePoolTotal,
        productTypes: tote_pools.map(p => p.product_type)
    });

    return pools;
}

/**
 * Safely convert and truncate a field to string with max length
 * @param {any} value - The value to process
 * @param {number} maxLength - Maximum allowed length
 * @returns {string|undefined} Processed string or undefined if no value
 */
function safeStringField(value, maxLength) {
    if (value === null || value === undefined) {
        return undefined;
    }
    
    let stringValue;
    if (typeof value === 'string') {
        stringValue = value;
    } else if (typeof value === 'object') {
        stringValue = JSON.stringify(value);
    } else {
        stringValue = String(value);
    }
    
    return stringValue.length > maxLength ? stringValue.substring(0, maxLength) : stringValue;
}

/**
 * Get current entrant data before updating for historical comparison
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {string} entrantId - Entrant ID
 * @param {Object} context - Appwrite function context for logging
 * @returns {Object|null} Current entrant data or null if not found
 */
async function getCurrentEntrantData(databases, databaseId, entrantId, context) {
    try {
        const document = await databases.getDocument(databaseId, 'entrants', entrantId);
        return document;
    } catch (error) {
        // Document doesn't exist yet - this is normal for new entrants
        if (error.code === 404) {
            return null;
        }
        context.error('Failed to get current entrant data', {
            entrantId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return null;
    }
}

/**
 * Save odds history when odds change
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {string} entrantId - Entrant ID
 * @param {Object} newOdds - New odds data from API
 * @param {Object} currentData - Current entrant data (if exists)
 * @param {Object} context - Appwrite function context for logging
 * @returns {number} Number of history records created
 */
async function saveOddsHistory(databases, databaseId, entrantId, newOdds, currentData, context) {
    const timestamp = new Date().toISOString();
    let recordsCreated = 0;

    try {
        // Save fixed win odds history if changed
        if (newOdds.fixed_win !== undefined && 
            (!currentData || currentData.fixedWinOdds !== newOdds.fixed_win)) {
            
            await databases.createDocument(databaseId, 'odds-history', ID.unique(), {
                entrant: entrantId,
                odds: newOdds.fixed_win,
                type: 'fixed_win',
                eventTimestamp: timestamp
            });
            recordsCreated++;
            context.log('Saved fixed win odds history', { 
                entrantId, 
                newOdds: newOdds.fixed_win,
                previousOdds: currentData?.fixedWinOdds || 'none'
            });
        }

        // Save fixed place odds history if changed
        if (newOdds.fixed_place !== undefined && 
            (!currentData || currentData.fixedPlaceOdds !== newOdds.fixed_place)) {
            
            await databases.createDocument(databaseId, 'odds-history', ID.unique(), {
                entrant: entrantId,
                odds: newOdds.fixed_place,
                type: 'fixed_place',
                eventTimestamp: timestamp
            });
            recordsCreated++;
            context.log('Saved fixed place odds history', { 
                entrantId, 
                newOdds: newOdds.fixed_place,
                previousOdds: currentData?.fixedPlaceOdds || 'none'
            });
        }

        // Save pool win odds history if changed
        if (newOdds.pool_win !== undefined && 
            (!currentData || currentData.poolWinOdds !== newOdds.pool_win)) {
            
            await databases.createDocument(databaseId, 'odds-history', ID.unique(), {
                entrant: entrantId,
                odds: newOdds.pool_win,
                type: 'pool_win',
                eventTimestamp: timestamp
            });
            recordsCreated++;
            context.log('Saved pool win odds history', { 
                entrantId, 
                newOdds: newOdds.pool_win,
                previousOdds: currentData?.poolWinOdds || 'none'
            });
        }

        // Save pool place odds history if changed  
        if (newOdds.pool_place !== undefined && 
            (!currentData || currentData.poolPlaceOdds !== newOdds.pool_place)) {
            
            await databases.createDocument(databaseId, 'odds-history', ID.unique(), {
                entrant: entrantId,
                odds: newOdds.pool_place,
                type: 'pool_place',
                eventTimestamp: timestamp
            });
            recordsCreated++;
            context.log('Saved pool place odds history', { 
                entrantId, 
                newOdds: newOdds.pool_place,
                previousOdds: currentData?.poolPlaceOdds || 'none'
            });
        }

    } catch (error) {
        context.error('Failed to save odds history', {
            entrantId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }

    return recordsCreated;
}

/**
 * Save money flow history data from money_tracker API response with timeline support
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID  
 * @param {string} entrantId - Entrant ID
 * @param {Object} moneyData - Money tracker data from API (hold_percentage, bet_percentage)
 * @param {Object} context - Appwrite function context for logging
 * @param {string} raceId - Race ID for timeline calculation
 * @param {Object} racePoolData - Race pool totals for win/place calculations
 * @returns {boolean} Success status
 */
async function saveMoneyFlowHistory(databases, databaseId, entrantId, moneyData, context, raceId = null, racePoolData = null) {
    if (!moneyData || (typeof moneyData.hold_percentage === 'undefined' && typeof moneyData.bet_percentage === 'undefined')) {
        return false;
    }

    try {
        const timestamp = new Date().toISOString();
        
        // Calculate timeline fields if race info is available
        let timeToStart = null;
        let pollingTimestamp = timestamp;
        
        if (raceId) {
            try {
                const race = await databases.getDocument(databaseId, 'races', raceId);
                if (race.startTime) {
                    const raceStartTime = new Date(race.startTime);
                    const currentTime = new Date();
                    timeToStart = Math.round((raceStartTime.getTime() - currentTime.getTime()) / (1000 * 60)); // Minutes to start
                }
            } catch (error) {
                context.log('Could not calculate timeToStart for money flow history', { raceId, entrantId });
            }
        }
        
        // Store both hold_percentage and bet_percentage as separate records for comprehensive tracking
        let recordsCreated = 0;
        
        // Save hold percentage (money held on this entrant) with pool amount calculations
        if (typeof moneyData.hold_percentage !== 'undefined') {
            const holdDoc = {
                entrant: entrantId,
                raceId: raceId, // CRITICAL FIX: Add raceId field that was missing
                holdPercentage: moneyData.hold_percentage,
                betPercentage: null, // Explicitly null for hold_percentage records
                type: 'hold_percentage',
                eventTimestamp: timestamp,
                pollingTimestamp: pollingTimestamp,
                timeToStart: timeToStart,
                poolType: 'hold' // For legacy hold percentage data
            };
            
            // Calculate pool amounts and pool-specific percentages if race pool data is available
            if (racePoolData) {
                const holdPercent = moneyData.hold_percentage / 100;
                holdDoc.winPoolAmount = Math.round((racePoolData.winPoolTotal || 0) * holdPercent);
                holdDoc.placePoolAmount = Math.round((racePoolData.placePoolTotal || 0) * holdPercent);
                
                // CRITICAL FIX: Calculate pool-specific percentages
                if (racePoolData.winPoolTotal > 0) {
                    holdDoc.winPoolPercentage = (holdDoc.winPoolAmount / (racePoolData.winPoolTotal * 100)) * 100; // Convert from cents
                }
                if (racePoolData.placePoolTotal > 0) {
                    holdDoc.placePoolPercentage = (holdDoc.placePoolAmount / (racePoolData.placePoolTotal * 100)) * 100; // Convert from cents
                }
            }
            
            await databases.createDocument(databaseId, 'money-flow-history', ID.unique(), holdDoc);
            recordsCreated++;
        }
        
        // Save bet percentage (percentage of total bets on this entrant) 
        if (typeof moneyData.bet_percentage !== 'undefined') {
            const betDoc = {
                entrant: entrantId,
                raceId: raceId, // CRITICAL FIX: Add raceId field that was missing
                holdPercentage: null, // Explicitly null for bet_percentage records
                betPercentage: moneyData.bet_percentage,
                type: 'bet_percentage',
                eventTimestamp: timestamp,
                pollingTimestamp: pollingTimestamp,
                timeToStart: timeToStart,
                poolType: 'bet' // For bet percentage data
            };
            
            // Calculate pool amounts and pool-specific percentages if race pool data is available
            if (racePoolData) {
                const betPercent = moneyData.bet_percentage / 100;
                betDoc.winPoolAmount = Math.round((racePoolData.winPoolTotal || 0) * betPercent);
                betDoc.placePoolAmount = Math.round((racePoolData.placePoolTotal || 0) * betPercent);
                
                // CRITICAL FIX: Calculate pool-specific percentages
                if (racePoolData.winPoolTotal > 0) {
                    betDoc.winPoolPercentage = (betDoc.winPoolAmount / (racePoolData.winPoolTotal * 100)) * 100; // Convert from cents
                }
                if (racePoolData.placePoolTotal > 0) {
                    betDoc.placePoolPercentage = (betDoc.placePoolAmount / (racePoolData.placePoolTotal * 100)) * 100; // Convert from cents
                }
            }
            
            await databases.createDocument(databaseId, 'money-flow-history', ID.unique(), betDoc);
            recordsCreated++;
        }

        return recordsCreated > 0;
    } catch (error) {
        context.error('Failed to save money flow history', {
            entrantId,
            raceId,
            holdPercentageValue: moneyData.hold_percentage,
            betPercentageValue: moneyData.bet_percentage,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return false;
    }
}

/**
 * Process money tracker data from API response with timeline support (Updated with race status filtering)
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {Object} moneyTrackerData - Money tracker data from API response
 * @param {Object} context - Appwrite function context for logging
 * @param {string} raceId - Race ID for timeline calculation
 * @param {Object} racePoolData - Optional race pool data for amount calculations
 * @param {string} raceStatus - Race status for filtering (Optional)
 * @returns {number} Number of entrants processed for money flow
 */
export async function processMoneyTrackerData(databases, databaseId, moneyTrackerData, context, raceId = 'unknown', racePoolData = null, raceStatus = null) {
    if (!moneyTrackerData || !moneyTrackerData.entrants || !Array.isArray(moneyTrackerData.entrants)) {
        context.log('No money tracker entrants data available', { raceId });
        return 0;
    }

    // Only skip processing money tracker data for races abandoned from start (never had betting activity)
    // Continue processing through Open → Closed → Interim → Final to preserve timeline data
    if (raceStatus === 'Abandoned') {
        // Check if we have any existing money flow data for this race
        try {
            const existingData = await databases.listDocuments(databaseId, 'money-flow-history', [
                Query.equal('raceId', raceId),
                Query.limit(1)
            ]);
            
            if (existingData.documents.length === 0) {
                context.log('Skipping money tracker processing for abandoned race with no prior data', { 
                    raceId, 
                    raceStatus,
                    reason: 'Abandoned race never had betting activity'
                });
                return 0;
            } else {
                context.log('Processing final data for abandoned race with existing timeline', { 
                    raceId, 
                    raceStatus,
                    reason: 'Preserving timeline data for race that was abandoned mid-process'
                });
            }
        } catch (error) {
            context.log('Could not check existing data, skipping abandoned race', { raceId, raceStatus });
            return 0;
        }
    }
    
    // Continue processing for all other race statuses (Open, Closed, Interim, Final)
    // This ensures complete timeline data is preserved for historical viewing

    let entrantsProcessed = 0;
    
    // CORRECT AGGREGATION: Sum all entries per entrant_id (multiple bet transactions)
    const entrantMoneyData = {};
    for (const entry of moneyTrackerData.entrants) {
        if (entry.entrant_id) {
            if (!entrantMoneyData[entry.entrant_id]) {
                entrantMoneyData[entry.entrant_id] = { 
                    hold_percentage: 0, 
                    bet_percentage: 0 
                };
            }
            // SUM all percentages for the entrant (multiple bet transactions)
            entrantMoneyData[entry.entrant_id].hold_percentage += (entry.hold_percentage || 0);
            entrantMoneyData[entry.entrant_id].bet_percentage += (entry.bet_percentage || 0);
        }
    }

    // Validation: Check that total hold percentages sum to approximately 100%
    const totalHoldPercentage = Object.values(entrantMoneyData).reduce((sum, data) => sum + data.hold_percentage, 0);
    if (Math.abs(totalHoldPercentage - 100) > 5) {
        context.log('⚠️ Hold percentages do not sum to ~100%', {
            raceId,
            totalHoldPercentage,
            entrantCount: Object.keys(entrantMoneyData).length
        });
    }

    // Save aggregated money flow data for each entrant
    for (const [entrantId, moneyData] of Object.entries(entrantMoneyData)) {
        const success = await saveMoneyFlowHistory(databases, databaseId, entrantId, moneyData, context, raceId, racePoolData);
        if (success) {
            entrantsProcessed++;
        }
    }
    
    // Also save time-bucketed version for dynamic column generation
    if (entrantsProcessed > 0 && racePoolData) {
        try {
            await saveTimeBucketedMoneyFlowHistory(databases, databaseId, raceId, entrantMoneyData, racePoolData, context);
        } catch (error) {
            context.log('⚠️ Failed to save time-bucketed money flow history', {
                raceId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    
    context.log('Processed money tracker data with CORRECTED aggregation logic', {
        raceId,
        totalEntries: moneyTrackerData.entrants.length,
        uniqueEntrants: Object.keys(entrantMoneyData).size,
        entrantsProcessed,
        totalHoldPercentage: totalHoldPercentage.toFixed(2) + '%',
        racePoolDataAvailable: !!racePoolData
    });
    
    return entrantsProcessed;
}

/**
 * Get timeline interval bucket for given time to start
 * @param {number} timeToStartMinutes - Minutes until race start (positive = before, negative = after)
 * @returns {number} Timeline interval bucket
 */
function getTimelineInterval(timeToStartMinutes) {
    // Pre-start intervals (standard 5-minute buckets, then 1-minute as race approaches)
    if (timeToStartMinutes >= 60) return 60;
    if (timeToStartMinutes >= 55) return 55;
    if (timeToStartMinutes >= 50) return 50;
    if (timeToStartMinutes >= 45) return 45;
    if (timeToStartMinutes >= 40) return 40;
    if (timeToStartMinutes >= 35) return 35;
    if (timeToStartMinutes >= 30) return 30;
    if (timeToStartMinutes >= 25) return 25;
    if (timeToStartMinutes >= 20) return 20;
    if (timeToStartMinutes >= 15) return 15;
    if (timeToStartMinutes >= 10) return 10;
    if (timeToStartMinutes >= 5) return 5;
    if (timeToStartMinutes >= 4) return 4;
    if (timeToStartMinutes >= 3) return 3;
    if (timeToStartMinutes >= 2) return 2;
    if (timeToStartMinutes >= 1) return 1;
    if (timeToStartMinutes >= 0) return 0; // Race scheduled start
    
    // Post-start intervals (standard progression: -30s, -1m, -1:30s, -2m, -2:30s, etc.)
    if (timeToStartMinutes >= -0.5) return -0.5;   // -30s
    if (timeToStartMinutes >= -1) return -1;       // -1m  
    if (timeToStartMinutes >= -1.5) return -1.5;   // -1:30s
    if (timeToStartMinutes >= -2) return -2;       // -2m
    if (timeToStartMinutes >= -2.5) return -2.5;   // -2:30s
    if (timeToStartMinutes >= -3) return -3;       // -3m
    if (timeToStartMinutes >= -3.5) return -3.5;   // -3:30s
    if (timeToStartMinutes >= -4) return -4;       // -4m
    if (timeToStartMinutes >= -4.5) return -4.5;   // -4:30s
    
    // For longer delays, continue at 1-minute intervals
    return Math.ceil(timeToStartMinutes); // -5, -6, -7, etc.
}

/**
 * Save time-bucketed money flow history for dynamic column generation with FIXED timeline intervals
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {string} raceId - Race ID
 * @param {Object} entrantMoneyData - Aggregated money data per entrant
 * @param {Object} racePoolData - Race pool totals
 * @param {Object} context - Appwrite function context for logging
 * @returns {number} Number of bucketed records created
 */
async function saveTimeBucketedMoneyFlowHistory(databases, databaseId, raceId, entrantMoneyData, racePoolData, context) {
    let recordsCreated = 0;
    const timestamp = new Date().toISOString();
    
    // Calculate time interval from race start with FIXED bucketing logic
    let timeToStart = null;
    let timeInterval = null;
    let intervalType = 'unknown';
    
    try {
        const race = await databases.getDocument(databaseId, 'races', raceId);
        if (race.startTime) {
            const raceStartTime = new Date(race.startTime);
            const currentTime = new Date();
            timeToStart = Math.round((raceStartTime.getTime() - currentTime.getTime()) / (1000 * 60)); // Minutes to start
            
            // Use FIXED timeline interval mapping
            timeInterval = getTimelineInterval(timeToStart);
            
            // Determine interval type based on proximity to race for polling frequency
            if (timeToStart > 30) {
                intervalType = '5m'; // 5-minute intervals when far from race
            } else if (timeToStart > 5) {
                intervalType = '1m'; // 1-minute intervals close to race  
            } else if (timeToStart > 0) {
                intervalType = '30s'; // 30-second intervals very close to race
            } else {
                intervalType = 'live'; // Live updates during/after race
            }
        } else {
            context.error('Race document missing startTime field', { raceId });
            return 0; // Cannot create bucketed data without race start time
        }
    } catch (error) {
        context.error('Could not fetch race document for bucketed storage', { 
            raceId, 
            error: error.message 
        });
        return 0; // Cannot create bucketed data without race information
    }
    
    // Validate required time calculation succeeded
    if (timeToStart === null || timeInterval === null) {
        context.error('Failed to calculate time intervals for bucketed storage', { 
            raceId, 
            timeToStart, 
            timeInterval 
        });
        return 0; // Cannot create bucketed data without proper time intervals
    }

    // Save bucketed data for each entrant with proper incremental calculation
    for (const [entrantId, moneyData] of Object.entries(entrantMoneyData)) {
        try {
            // Calculate pool amounts from aggregated percentages (convert to cents)
            const holdPercent = moneyData.hold_percentage / 100;
            const winPoolAmount = Math.round((racePoolData?.winPoolTotal || 0) * holdPercent * 100); // Convert to cents
            const placePoolAmount = Math.round((racePoolData?.placePoolTotal || 0) * holdPercent * 100); // Convert to cents
            
            // Get previous interval data for incremental calculation
            let incrementalWinAmount = 0;
            let incrementalPlaceAmount = 0;
            
            try {
                // ROBUST PREVIOUS BUCKET SEARCH: Find the most recent previous bucket with pool data
                // Step 1: Try immediate previous interval (next higher timeInterval value)
                context.log('DEBUG: About to query for previous bucket', {
                    entrantId: entrantId.slice(0, 8) + '...',
                    currentTimeInterval: timeInterval,
                    searchingForIntervalsGreaterThan: timeInterval,
                    queryFilters: ['entrant=' + entrantId.slice(0, 8) + '...', 'raceId=' + raceId.slice(0, 8) + '...', 'type=bucketed_aggregation', 'timeInterval>' + timeInterval]
                });
                
                let previousIntervalQuery = await databases.listDocuments(databaseId, 'money-flow-history', [
                    Query.equal('entrant', entrantId),
                    Query.equal('raceId', raceId),
                    Query.equal('type', 'bucketed_aggregation'),
                    Query.greaterThan('timeInterval', timeInterval), // Find intervals > current interval
                    Query.orderAsc('timeInterval'), // Order ascending to get the closest higher interval
                    Query.limit(1) // Get the immediately previous chronological interval
                ]);
                
                let prevDoc = null;
                
                context.log('DEBUG: Previous bucket query result', {
                    entrantId: entrantId.slice(0, 8) + '...',
                    currentInterval: timeInterval,
                    queryResultCount: previousIntervalQuery.documents.length,
                    foundDocuments: previousIntervalQuery.documents.map(d => ({
                        interval: d.timeInterval,
                        winAmount: d.winPoolAmount,
                        placeAmount: d.placePoolAmount
                    }))
                });
                
                if (previousIntervalQuery.documents.length > 0) {
                    prevDoc = previousIntervalQuery.documents[0];
                } else {
                    // Step 2: No immediate previous found - search for ANY previous bucket with data
                    const allPreviousBuckets = await databases.listDocuments(databaseId, 'money-flow-history', [
                        Query.equal('entrant', entrantId),
                        Query.equal('raceId', raceId),
                        Query.equal('type', 'bucketed_aggregation'),
                        Query.greaterThan('timeInterval', timeInterval), // Any interval > current
                        Query.notEqual('winPoolAmount', 0), // Must have actual pool data
                        Query.orderAsc('timeInterval'), // Get chronologically closest
                        Query.limit(1)
                    ]);
                    
                    if (allPreviousBuckets.documents.length > 0) {
                        prevDoc = allPreviousBuckets.documents[0];
                        context.log('Found gap-spanning previous bucket', {
                            entrantId: entrantId.slice(0, 8) + '...',
                            currentInterval: timeInterval,
                            foundPreviousInterval: prevDoc.timeInterval,
                            gap: prevDoc.timeInterval - timeInterval
                        });
                    }
                }
                
                if (prevDoc) {
                    // Calculate increment: current pool total - previous pool total
                    const previousWinAmount = prevDoc.winPoolAmount || 0;
                    const previousPlaceAmount = prevDoc.placePoolAmount || 0;
                    
                    incrementalWinAmount = winPoolAmount - previousWinAmount;
                    incrementalPlaceAmount = placePoolAmount - previousPlaceAmount;
                    
                    // Handle same totals (no change)
                    if (incrementalWinAmount === 0 && incrementalPlaceAmount === 0) {
                        context.log('No change in pool amounts since previous bucket', {
                            entrantId: entrantId.slice(0, 8) + '...',
                            currentInterval: timeInterval,
                            previousInterval: prevDoc.timeInterval,
                            poolAmount: winPoolAmount
                        });
                    }
                    
                    // Log negative increments (money flowing out)
                    if (incrementalWinAmount < 0 || incrementalPlaceAmount < 0) {
                        context.log('Negative increment detected (money flowing OUT)', { 
                            entrantId: entrantId.slice(0, 8) + '...', 
                            timeInterval, 
                            previousInterval: prevDoc.timeInterval,
                            winChange: incrementalWinAmount,
                            placeChange: incrementalPlaceAmount
                        });
                    }
                    
                    context.log('Calculated bucket increment from previous total', {
                        entrantId: entrantId.slice(0, 8) + '...',
                        currentInterval: timeInterval,
                        previousInterval: prevDoc.timeInterval,
                        currentTotal: winPoolAmount,
                        previousTotal: previousWinAmount,
                        increment: incrementalWinAmount
                    });
                } else {
                    // No previous bucket found - this is the first/baseline record
                    incrementalWinAmount = winPoolAmount;
                    incrementalPlaceAmount = placePoolAmount;
                    context.log('First bucket record - using pool total as baseline', { 
                        entrantId: entrantId.slice(0, 8) + '...', 
                        timeInterval,
                        baselineAmount: winPoolAmount
                    });
                }
            } catch (queryError) {
                // Query failed - use pool total as increment (first record behavior)
                incrementalWinAmount = winPoolAmount;
                incrementalPlaceAmount = placePoolAmount;
                context.log('Query failed, treating as first record', { 
                    entrantId: entrantId.slice(0, 8) + '...', 
                    timeInterval,
                    error: queryError.message,
                    usingPoolTotal: winPoolAmount
                });
            }
            
            const bucketedDoc = {
                entrant: entrantId,
                raceId: raceId, // CRITICAL FIX: Ensure raceId is included in bucketed documents
                timeToStart: timeToStart,
                timeInterval: timeInterval,
                intervalType: intervalType,
                holdPercentage: moneyData.hold_percentage,
                betPercentage: moneyData.bet_percentage,
                winPoolAmount: winPoolAmount, // Absolute amount in cents
                placePoolAmount: placePoolAmount, // Absolute amount in cents
                incrementalAmount: incrementalWinAmount, // Pre-calculated incremental for win pool (backwards compatibility)
                incrementalWinAmount: incrementalWinAmount, // Pre-calculated increment in cents
                incrementalPlaceAmount: incrementalPlaceAmount, // Pre-calculated increment in cents
                pollingTimestamp: timestamp,
                eventTimestamp: timestamp,
                type: 'bucketed_aggregation',
                poolType: 'combined',
                // CRITICAL FIX: Add pool-specific percentages to bucketed documents
                winPoolPercentage: racePoolData && racePoolData.winPoolTotal > 0 ? 
                    (winPoolAmount / (racePoolData.winPoolTotal * 100)) * 100 : null,
                placePoolPercentage: racePoolData && racePoolData.placePoolTotal > 0 ? 
                    (placePoolAmount / (racePoolData.placePoolTotal * 100)) * 100 : null
            };
            
            await databases.createDocument(databaseId, 'money-flow-history', ID.unique(), bucketedDoc);
            recordsCreated++;
            
            context.log('Saved bucketed money flow with increments', {
                entrantId: entrantId.slice(0, 8) + '...',
                timeInterval,
                winIncrement: incrementalWinAmount,
                placeIncrement: incrementalPlaceAmount
            });
            
        } catch (error) {
            context.error('Failed to save bucketed money flow history', {
                entrantId,
                raceId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    
    context.log('Saved time-bucketed money flow history', {
        raceId,
        recordsCreated,
        timeInterval,
        intervalType
    });
    
    return recordsCreated;
}

/**
 * Process tote pools data and save race pool totals (Updated for NZTAB API structure)
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {string} raceId - Race ID (document ID)
 * @param {Array} tote_pools - Array of tote pool objects from NZTAB API
 * @param {Object} context - Appwrite function context for logging
 * @returns {boolean} Success status
 */
export async function processToteTrendsData(databases, databaseId, raceId, tote_pools, context) {
    if (!tote_pools) {
        context.log('No tote pools data available for race:', raceId);
        return false;
    }

    try {
        const timestamp = new Date().toISOString();
        
        // Extract pool totals from tote_pools array using new utility function
        const extractedPools = extractPoolTotals(tote_pools, context);
        
        // Create race pool document with extracted data (convert to cents for integer storage)
        const poolData = {
            raceId: raceId,
            winPoolTotal: Math.round(extractedPools.winPoolTotal * 100), // Convert to cents
            placePoolTotal: Math.round(extractedPools.placePoolTotal * 100),
            quinellaPoolTotal: Math.round(extractedPools.quinellaPoolTotal * 100),
            trifectaPoolTotal: Math.round(extractedPools.trifectaPoolTotal * 100),
            exactaPoolTotal: Math.round(extractedPools.exactaPoolTotal * 100),
            first4PoolTotal: Math.round(extractedPools.first4PoolTotal * 100),
            totalRacePool: Math.round(extractedPools.totalRacePool * 100),
            currency: '$',
            lastUpdated: timestamp
        };

        // Use race ID as document ID for the race-pools collection
        const success = await performantUpsert(databases, databaseId, 'race-pools', raceId, poolData, context);
        
        if (success) {
            context.log('Saved race pool data from tote_pools array', {
                raceId,
                totalPool: poolData.totalRacePool,
                winPool: poolData.winPoolTotal,
                placePool: poolData.placePoolTotal,
                poolsProcessed: Array.isArray(tote_pools) ? tote_pools.length : 0
            });
        }
        
        return success;
    } catch (error) {
        context.error('Failed to process tote pools data', {
            raceId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return false;
    }
}

/**
 * Performant upsert operation: try update first, create on 404
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {string} collectionId - Collection ID
 * @param {string} documentId - Document ID
 * @param {Object} data - Document data
 * @param {Object} context - Appwrite function context for logging
 * @returns {boolean} Success status
 */
export async function performantUpsert(databases, databaseId, collectionId, documentId, data, context) {
    try {
        await databases.updateDocument(databaseId, collectionId, documentId, data);
        return true;
    }
    catch (error) {
        try {
            // For money-flow-history documents, verify entrant exists before creating relationship
            if (collectionId === 'money-flow-history' && data.entrant) {
                try {
                    await databases.getDocument(databaseId, 'entrants', data.entrant);
                } catch (entrantError) {
                    context.error('Entrant document does not exist for relationship', {
                        entrantId: data.entrant,
                        entrantError: entrantError instanceof Error ? entrantError.message : 'Unknown error'
                    });
                    throw new Error(`Entrant ${data.entrant} does not exist - cannot create money flow relationship`);
                }
            }
            
            await databases.createDocument(databaseId, collectionId, documentId, data);
            return true;
        }
        catch (createError) {
            context.error(`Failed to create ${collectionId} document`, {
                documentId,
                error: createError instanceof Error ? createError.message : 'Unknown error'
            });
            return false;
        }
    }
}

/**
 * Process entrants for a specific race with comprehensive runner data
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {string} raceId - Race ID
 * @param {Array} entrants - Array of entrant objects from NZTAB API
 * @param {Object} context - Appwrite function context for logging
 * @returns {number} Number of entrants processed
 */
export async function processEntrants(databases, databaseId, raceId, entrants, context) {
    let entrantsProcessed = 0;
    
    // Process each entrant (runner) with comprehensive data
    for (const entrant of entrants) {
        try {
            const entrantDoc = {
                entrantId: entrant.entrant_id,
                name: entrant.name,
                runnerNumber: entrant.runner_number,
                barrier: entrant.barrier,
                isScratched: entrant.is_scratched || false,
                isLateScratched: entrant.is_late_scratched || false,
                isEmergency: entrant.is_emergency || false,
                race: raceId
            };

            // Current race day status
            if (entrant.scratch_time) entrantDoc.scratchTime = entrant.scratch_time;
            if (entrant.emergency_position) entrantDoc.emergencyPosition = entrant.emergency_position;
            if (entrant.runner_change) entrantDoc.runnerChange = safeStringField(entrant.runner_change, 500);
            if (entrant.first_start_indicator) entrantDoc.firstStartIndicator = entrant.first_start_indicator;
            
            // Current race connections
            if (entrant.jockey) entrantDoc.jockey = entrant.jockey;
            if (entrant.trainer_name) entrantDoc.trainerName = entrant.trainer_name;
            if (entrant.trainer_location) entrantDoc.trainerLocation = entrant.trainer_location;
            if (entrant.apprentice_indicator) entrantDoc.apprenticeIndicator = entrant.apprentice_indicator;
            if (entrant.gear) entrantDoc.gear = safeStringField(entrant.gear, 200);
            
            // Weight information
            if (entrant.weight?.allocated) entrantDoc.allocatedWeight = entrant.weight.allocated;
            if (entrant.weight?.total) entrantDoc.totalWeight = entrant.weight.total;
            if (entrant.allowance_weight) entrantDoc.allowanceWeight = entrant.allowance_weight;
            
            // Market information
            if (entrant.market_name) entrantDoc.marketName = entrant.market_name;
            if (entrant.primary_market !== undefined) entrantDoc.primaryMarket = entrant.primary_market;
            if (entrant.favourite !== undefined) entrantDoc.favourite = entrant.favourite;
            if (entrant.mover !== undefined) entrantDoc.mover = entrant.mover;
            
            // Current odds (frequently updated)
            if (entrant.odds) {
                if (entrant.odds.fixed_win !== undefined) entrantDoc.fixedWinOdds = entrant.odds.fixed_win;
                if (entrant.odds.fixed_place !== undefined) entrantDoc.fixedPlaceOdds = entrant.odds.fixed_place;
                if (entrant.odds.pool_win !== undefined) entrantDoc.poolWinOdds = entrant.odds.pool_win;
                if (entrant.odds.pool_place !== undefined) entrantDoc.poolPlaceOdds = entrant.odds.pool_place;
            }
            
            // Speedmap positioning
            if (entrant.speedmap?.settling_lengths !== undefined) entrantDoc.settlingLengths = entrant.speedmap.settling_lengths;
            
            // Static entrant information (rarely changes)
            if (entrant.age) entrantDoc.age = entrant.age;
            if (entrant.sex) entrantDoc.sex = entrant.sex;
            if (entrant.colour) entrantDoc.colour = entrant.colour;
            if (entrant.foaling_date) entrantDoc.foalingDate = entrant.foaling_date;
            if (entrant.sire) entrantDoc.sire = entrant.sire;
            if (entrant.dam) entrantDoc.dam = entrant.dam;
            if (entrant.breeding) entrantDoc.breeding = entrant.breeding;
            if (entrant.owners) entrantDoc.owners = safeStringField(entrant.owners, 255);
            if (entrant.country) entrantDoc.country = entrant.country;
            
            // Performance and form data (summarized for storage)
            if (entrant.prize_money) entrantDoc.prizeMoney = entrant.prize_money;
            if (entrant.best_time) entrantDoc.bestTime = entrant.best_time;
            if (entrant.last_twenty_starts) entrantDoc.lastTwentyStarts = entrant.last_twenty_starts;
            if (entrant.win_p) entrantDoc.winPercentage = entrant.win_p;
            if (entrant.place_p) entrantDoc.placePercentage = entrant.place_p;
            if (entrant.rating) entrantDoc.rating = entrant.rating;
            if (entrant.handicap_rating) entrantDoc.handicapRating = entrant.handicap_rating;
            if (entrant.class_level) entrantDoc.classLevel = entrant.class_level;
            if (entrant.form_comment) entrantDoc.formComment = entrant.form_comment;
            
            // Silk and visual information
            if (entrant.silk_colours) entrantDoc.silkColours = entrant.silk_colours;
            if (entrant.silk_url_64x64) entrantDoc.silkUrl64 = entrant.silk_url_64x64;
            if (entrant.silk_url_128x128) entrantDoc.silkUrl128 = entrant.silk_url_128x128;
            
            // Import metadata
            entrantDoc.lastUpdated = new Date().toISOString();
            entrantDoc.dataSource = 'NZTAB';
            
            // 🔥 HISTORICAL DATA STORAGE - Get current data before updating
            const currentData = await getCurrentEntrantData(databases, databaseId, entrant.entrant_id, context);
            
            // 🔥 Save odds history if odds changed
            if (entrant.odds) {
                const historyRecords = await saveOddsHistory(databases, databaseId, entrant.entrant_id, entrant.odds, currentData, context);
                if (historyRecords > 0) {
                    context.log('Created odds history records', { 
                        entrantId: entrant.entrant_id, 
                        recordsCreated: historyRecords 
                    });
                }
            }
            
            // Money flow data is processed separately via processMoneyTrackerData() in main.js
            
            const success = await performantUpsert(databases, databaseId, 'entrants', entrant.entrant_id, entrantDoc, context);
            if (success) {
                entrantsProcessed++;
                context.log('Upserted comprehensive entrant data', { 
                    entrantId: entrant.entrant_id, 
                    name: entrant.name,
                    raceId: raceId,
                    fixedWinOdds: entrantDoc.fixedWinOdds,
                    isScratched: entrantDoc.isScratched
                });
            }
        } catch (error) {
            context.error('Failed to process entrant', {
                entrantId: entrant.entrant_id,
                entrantName: entrant.name || 'Unknown',
                raceId: raceId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            // Continue with next entrant
        }
    }
    
    return entrantsProcessed;
}