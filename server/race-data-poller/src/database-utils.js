/**
 * Database utilities for Appwrite operations
 * Provides performant upsert patterns and error handling
 */

import { ID } from 'node-appwrite';

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
        
        // Calculate timeline interval for all records (not just bucketed)
        let timeInterval = null;
        let intervalType = 'unknown';
        
        if (timeToStart !== null) {
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
        }

        // Save hold percentage (money held on this entrant) with pool amount calculations
        if (typeof moneyData.hold_percentage !== 'undefined') {
            const holdDoc = {
                entrant: entrantId, // Appwrite relationship expects the document ID directly
                raceId: raceId, // Include race ID for proper querying
                holdPercentage: moneyData.hold_percentage,
                betPercentage: null, // Explicitly null for hold_percentage records
                type: 'hold_percentage',
                eventTimestamp: timestamp,
                pollingTimestamp: pollingTimestamp,
                timeToStart: timeToStart,
                timeInterval: timeInterval,
                intervalType: intervalType,
                poolType: 'hold' // For legacy hold percentage data
            };
            
            // Calculate pool amounts if race pool data is available
            if (racePoolData) {
                const holdPercent = moneyData.hold_percentage / 100;
                holdDoc.winPoolAmount = Math.round((racePoolData.winPoolTotal || 0) * holdPercent);
                holdDoc.placePoolAmount = Math.round((racePoolData.placePoolTotal || 0) * holdPercent);
            }
            
            await databases.createDocument(databaseId, 'money-flow-history', ID.unique(), holdDoc);
            recordsCreated++;
        }
        
        // Save bet percentage (percentage of total bets on this entrant) 
        if (typeof moneyData.bet_percentage !== 'undefined') {
            const betDoc = {
                entrant: entrantId, // Appwrite relationship expects the document ID directly
                raceId: raceId, // Include race ID for proper querying
                holdPercentage: null, // Explicitly null for bet_percentage records
                betPercentage: moneyData.bet_percentage,
                type: 'bet_percentage',
                eventTimestamp: timestamp,
                pollingTimestamp: pollingTimestamp,
                timeToStart: timeToStart,
                timeInterval: timeInterval,
                intervalType: intervalType,
                poolType: 'bet' // For bet percentage data
            };
            
            // Calculate pool amounts if race pool data is available
            if (racePoolData) {
                const betPercent = moneyData.bet_percentage / 100;
                betDoc.winPoolAmount = Math.round((racePoolData.winPoolTotal || 0) * betPercent);
                betDoc.placePoolAmount = Math.round((racePoolData.placePoolTotal || 0) * betPercent);
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
 * Save money flow history with intelligent time bucketing for dynamic frequency display
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID  
 * @param {string} entrantId - Entrant ID
 * @param {Object} moneyData - Money tracker data from API (hold_percentage, bet_percentage)
 * @param {Object} context - Appwrite function context for logging
 * @param {string} raceId - Race ID for timeline calculation
 * @param {Object} racePoolData - Race pool totals for win/place calculations
 * @returns {boolean} Success status
 */
async function saveTimeBucketedMoneyFlowHistory(databases, databaseId, entrantId, moneyData, context, raceId = null, racePoolData = null) {
    if (!moneyData || (typeof moneyData.hold_percentage === 'undefined' && typeof moneyData.bet_percentage === 'undefined')) {
        return false;
    }

    try {
        const timestamp = new Date().toISOString();
        
        // Calculate time intervals and determine bucket type
        let timeToStart = null;
        let intervalType = '5m'; // default
        let timeInterval = null;
        
        if (raceId) {
            try {
                const race = await databases.getDocument(databaseId, 'races', raceId);
                if (race.startTime) {
                    const raceStartTime = new Date(race.startTime);
                    const currentTime = new Date();
                    timeToStart = Math.round((raceStartTime.getTime() - currentTime.getTime()) / (1000 * 60));
                    
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
                    context.error('Race document missing startTime field', { raceId, entrantId });
                    return false; // Cannot create bucketed data without race start time
                }
            } catch (error) {
                context.error('Could not fetch race document for bucketed storage', { 
                    raceId, 
                    entrantId: entrantId.slice(0, 8) + '...', 
                    error: error.message 
                });
                return false; // Cannot create bucketed data without race information
            }
        }
        
        // Validate required time calculation succeeded (skip bucketed storage without proper time data)
        if (timeInterval === null || intervalType === 'unknown') {
            context.warn('Skipping bucketed storage due to missing time interval data', { 
                raceId: raceId || 'unknown', 
                entrantId: entrantId.slice(0, 8) + '...',
                timeToStart,
                timeInterval,
                intervalType
            });
            return false; // Cannot create valid bucketed data without proper time intervals
        }
        
        // Create bucket-based document ID for upsert operations (max 36 chars, alphanumeric + underscore only)
        // Remove hyphens from entrantId and create a valid Appwrite document ID
        const bucketDocId = `bucket_${entrantId.replace(/-/g, '').slice(-24)}_${timeInterval}_${intervalType}`.slice(0, 36);
        
        // Check if bucket already exists for this interval
        let existingBucket = null;
        try {
            existingBucket = await databases.getDocument(databaseId, 'money-flow-history', bucketDocId);
        } catch (error) {
            if (error.code !== 404) throw error;
        }
        
        // Calculate pool amounts using correct formula (convert to cents)
        const holdPercent = (moneyData.hold_percentage || 0) / 100;
        const currentWinAmount = Math.round((racePoolData?.winPoolTotal || 0) * holdPercent * 100); // Convert to cents
        const currentPlaceAmount = Math.round((racePoolData?.placePoolTotal || 0) * holdPercent * 100); // Convert to cents
        
        let incrementalWinAmount = currentWinAmount;
        let incrementalPlaceAmount = currentPlaceAmount;
        
        // FIXED: Calculate incremental amounts using chronological previous bucket (not same bucket updates)
        try {
            // Query for the chronologically PREVIOUS interval (next higher timeInterval value)
            // Example: current = 45m bucket, need to find 50m bucket (not same bucket update)
            const allPreviousIntervals = await databases.listDocuments(databaseId, 'money-flow-history', [
                'equal("entrant", "' + entrantId + '")',
                'equal("raceId", "' + raceId + '")',
                'equal("type", "bucketed_aggregation")',
                'greaterThan("timeInterval", ' + timeInterval + ')', // Find intervals > current interval
                'orderBy("timeInterval", "asc")', // Order ascending to get the closest higher interval
                'limit(1)' // Get the immediately previous chronological interval
            ]);
            
            if (allPreviousIntervals.documents.length > 0) {
                const prevDoc = allPreviousIntervals.documents[0];
                // Calculate increment: current bucket total - previous bucket total
                incrementalWinAmount = currentWinAmount - (prevDoc.winPoolAmount || 0);
                incrementalPlaceAmount = currentPlaceAmount - (prevDoc.placePoolAmount || 0);
                
                // Allow negative increments (money can flow out of entrants)
                // but log unusual cases for debugging
                if (incrementalWinAmount < 0) {
                    context.log('Negative increment detected (money flowing OUT)', { 
                        entrantId: entrantId.slice(0, 8) + '...', 
                        timeInterval, 
                        previousInterval: prevDoc.timeInterval,
                        winDecrement: incrementalWinAmount
                    });
                }
                
                context.log('Calculated bucket increment', {
                    entrantId: entrantId.slice(0, 8) + '...',
                    currentInterval: timeInterval,
                    previousInterval: prevDoc.timeInterval,
                    currentTotal: currentWinAmount,
                    previousTotal: prevDoc.winPoolAmount,
                    increment: incrementalWinAmount
                });
            } else {
                // No previous interval found - this must be the baseline (60m) or first record
                if (timeInterval === 60) {
                    // 60m bucket: show absolute baseline amount
                    incrementalWinAmount = currentWinAmount;
                    incrementalPlaceAmount = currentPlaceAmount;
                    context.log('60m baseline bucket', { entrantId: entrantId.slice(0, 8) + '...', baselineAmount: currentWinAmount });
                } else {
                    // This should not happen in well-formed data - log as warning
                    incrementalWinAmount = currentWinAmount;
                    incrementalPlaceAmount = currentPlaceAmount;
                    context.warn('No previous interval found for non-baseline bucket', { 
                        entrantId: entrantId.slice(0, 8) + '...', 
                        timeInterval,
                        usingAbsoluteAmount: currentWinAmount
                    });
                }
            }
        } catch (queryError) {
            // If query fails, use absolute amounts  
            incrementalWinAmount = currentWinAmount;
            incrementalPlaceAmount = currentPlaceAmount;
            context.log('Could not query previous intervals, using absolute amounts', { 
                entrantId: entrantId.slice(0, 8) + '...', 
                error: queryError.message,
                currentWinAmount,
                currentPlaceAmount
            });
        }
        
        // Validate incremental amounts are never null/undefined
        if (incrementalWinAmount === null || incrementalWinAmount === undefined) {
            context.warn('Incremental win amount is null, using current amount as fallback', {
                entrantId: entrantId.slice(0, 8) + '...',
                incrementalWinAmount,
                currentWinAmount
            });
            incrementalWinAmount = currentWinAmount || 0;
        }
        
        if (incrementalPlaceAmount === null || incrementalPlaceAmount === undefined) {
            context.warn('Incremental place amount is null, using current amount as fallback', {
                entrantId: entrantId.slice(0, 8) + '...',
                incrementalPlaceAmount,
                currentPlaceAmount
            });
            incrementalPlaceAmount = currentPlaceAmount || 0;
        }
        
        const bucketDoc = {
            entrant: entrantId, // Appwrite relationship expects the document ID directly
            raceId: raceId, // Add raceId for consistency with other functions
            holdPercentage: moneyData.hold_percentage,
            betPercentage: moneyData.bet_percentage,
            type: 'bucketed_aggregation', // STANDARDIZED: Use same type as other functions
            eventTimestamp: timestamp,
            pollingTimestamp: timestamp,
            timeToStart: timeToStart,
            timeInterval: timeInterval,
            intervalType: intervalType,
            winPoolAmount: currentWinAmount, // Absolute amount in cents
            placePoolAmount: currentPlaceAmount, // Absolute amount in cents
            incrementalAmount: incrementalWinAmount, // Pre-calculated incremental for win pool (backwards compatibility)
            incrementalWinAmount: incrementalWinAmount, // Pre-calculated increment in cents
            incrementalPlaceAmount: incrementalPlaceAmount, // Pre-calculated increment in cents
            poolType: 'combined', // STANDARDIZED: Use same poolType as other functions
            isConsolidated: false,
            bucketDocumentId: bucketDocId,
            rawPollingData: JSON.stringify({
                originalTimeToStart: timeToStart,
                pollingTimestamp: timestamp,
                holdPercentage: moneyData.hold_percentage,
                betPercentage: moneyData.bet_percentage,
                calculationDetails: {
                    racePoolWinTotal: racePoolData?.winPoolTotal || 0,
                    racePoolPlaceTotal: racePoolData?.placePoolTotal || 0,
                    holdPercentDecimal: holdPercent
                }
            })
        };
        
        // Upsert the bucket document
        const upsertSuccess = await performantUpsert(databases, databaseId, 'money-flow-history', bucketDocId, bucketDoc, context);
        
        if (upsertSuccess) {
            context.log('Saved time-bucketed money flow data', {
                entrantId: entrantId.slice(-8),
                timeInterval,
                intervalType,
                holdPercentage: moneyData.hold_percentage,
                winAmount: currentWinAmount,
                incrementalWin: incrementalWinAmount,
                isUpdate: !!existingBucket
            });
            return true;
        } else {
            context.error('Failed to save time-bucketed money flow data', {
                entrantId,
                bucketDocId,
                error: 'performantUpsert returned false'
            });
            return false;
        }
    } catch (error) {
        context.error('Failed to save time-bucketed money flow history', {
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
                'equal("raceId", "' + raceId + '")',
                'limit(1)'
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
    
    // Save bucketed money flow history for each entrant
    for (const [entrantId, moneyData] of Object.entries(entrantMoneyData)) {
        const success = await saveTimeBucketedMoneyFlowHistory(databases, databaseId, entrantId, moneyData, context, raceId, racePoolData);
        if (success) {
            entrantsProcessed++;
        }
    }
    
    // Validate hold percentages sum to ~100%
    const totalHoldPercentage = Object.values(entrantMoneyData)
        .reduce((sum, data) => sum + (data.hold_percentage || 0), 0);
    const isValidPercentage = totalHoldPercentage >= 97 && totalHoldPercentage <= 103;
    
    context.log('Processed money tracker data with correct aggregation', {
        raceId,
        totalEntries: moneyTrackerData.entrants.length,
        uniqueEntrants: Object.keys(entrantMoneyData).length,
        entrantsProcessed,
        racePoolDataAvailable: !!racePoolData,
        holdPercentageValidation: {
            totalPercentage: totalHoldPercentage,
            expectedRange: '97-103%',
            isValid: isValidPercentage
        },
        sampleAggregation: Object.entries(entrantMoneyData).slice(0, 3).map(([id, data]) => ({
            entrantId: id.slice(-8),
            holdPercentage: data.hold_percentage,
            betPercentage: data.bet_percentage
        }))
    });
    
    if (!isValidPercentage) {
        context.log('⚠️ Hold percentages do not sum to ~100%', {
            raceId,
            totalHoldPercentage,
            deviation: Math.abs(100 - totalHoldPercentage),
            possibleCauses: [
                'API rounding errors',
                'Real-time data fluctuations',
                'Incorrect aggregation logic'
            ]
        });
    }
    
    return entrantsProcessed;
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
        context.log(`Successfully updated ${collectionId} document`, { documentId: documentId.slice(-8) });
        return true;
    }
    catch (updateError) {
        context.log(`Update failed, attempting create for ${collectionId}`, { 
            documentId: documentId.slice(-8),
            updateError: updateError instanceof Error ? updateError.message : 'Unknown error'
        });
        
        try {
            context.log(`Attempting to create ${collectionId} document`, { 
                documentId: documentId.slice(-8),
                dataKeys: Object.keys(data).join(', '),
                entrant: data.entrant ? data.entrant.slice(-8) : 'none'
            });
            
            // For money-flow-history documents, verify entrant exists before creating relationship
            if (collectionId === 'money-flow-history' && data.entrant) {
                try {
                    await databases.getDocument(databaseId, 'entrants', data.entrant);
                    context.log('Entrant document exists for relationship', { 
                        entrantId: data.entrant.slice(-8) 
                    });
                } catch (entrantError) {
                    context.error('Entrant document does not exist for relationship', {
                        entrantId: data.entrant,
                        entrantError: entrantError instanceof Error ? entrantError.message : 'Unknown error'
                    });
                    throw new Error(`Entrant ${data.entrant} does not exist - cannot create money flow relationship`);
                }
            }
            
            const createResult = await databases.createDocument(databaseId, collectionId, documentId, data);
            context.log(`Successfully created ${collectionId} document`, { 
                documentId: documentId.slice(-8),
                resultId: createResult.$id.slice(-8),
                entrantRelationship: data.entrant ? data.entrant.slice(-8) : 'none'
            });
            return true;
        }
        catch (createError) {
            context.error(`Failed to create ${collectionId} document`, {
                documentId,
                updateError: updateError instanceof Error ? updateError.message : 'Unknown error',
                createError: createError instanceof Error ? createError.message : 'Unknown error',
                createErrorCode: createError.code || 'no-code',
                createErrorType: createError.type || 'no-type',
                dataKeys: Object.keys(data),
                entrantId: data.entrant ? data.entrant.slice(-8) : 'unknown',
                dataPreview: {
                    entrant: data.entrant,
                    holdPercentage: data.holdPercentage,
                    timeInterval: data.timeInterval
                }
            });
            return false;
        }
    }
}

/**
 * Process meetings in parallel with error isolation
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {Array} meetings - Array of meeting objects
 * @param {Object} context - Appwrite function context for logging
 * @returns {Object} Processing results with counts
 */
export async function processMeetings(databases, databaseId, meetings, context) {
    let meetingsProcessed = 0;
    
    const meetingPromises = meetings.map(async (meeting) => {
        try {
            const meetingDoc = {
                meetingId: meeting.meeting,
                meetingName: meeting.name,
                country: meeting.country,
                raceType: meeting.category_name,
                date: meeting.date,
                status: 'active'
            };
            const success = await performantUpsert(databases, databaseId, 'meetings', meeting.meeting, meetingDoc, context);
            if (success) {
                context.log('Upserted meeting', { meetingId: meeting.meeting, name: meeting.name });
                return { success: true, meetingId: meeting.meeting };
            }
            else {
                return { success: false, meetingId: meeting.meeting };
            }
        }
        catch (error) {
            context.error('Failed to process meeting', {
                meetingId: meeting.meeting,
                meetingName: meeting.name,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return { success: false, meetingId: meeting.meeting, error };
        }
    });
    
    const meetingResults = await Promise.all(meetingPromises);
    meetingsProcessed = meetingResults.filter(result => result.success).length;
    
    return { meetingsProcessed };
}

/**
 * Process races in batches with error isolation
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {Array} meetings - Array of meeting objects containing races
 * @param {Object} context - Appwrite function context for logging
 * @returns {Object} Processing results with counts and race IDs
 */
export async function processRaces(databases, databaseId, meetings, context) {
    let racesProcessed = 0;
    const processedRaceIds = [];
    
    const allRaces = [];
    meetings.forEach(meeting => {
        meeting.races.forEach(race => {
            allRaces.push({ meeting: meeting.meeting, race });
        });
    });
    
    const batchSize = 15;
    for (let i = 0; i < allRaces.length; i += batchSize) {
        const batch = allRaces.slice(i, i + batchSize);
        const racePromises = batch.map(async ({ meeting, race }) => {
            try {
                const raceDoc = {
                    raceId: race.id,
                    name: race.name,
                    raceNumber: race.race_number,
                    startTime: race.start_time,
                    ...(race.distance !== undefined && { distance: race.distance }),
                    ...(race.track_condition !== undefined && { trackCondition: race.track_condition }),
                    ...(race.weather !== undefined && { weather: race.weather }),
                    status: race.status,
                    meeting: meeting
                };
                const success = await performantUpsert(databases, databaseId, 'races', race.id, raceDoc, context);
                if (success) {
                    context.log('Upserted race', { raceId: race.id, name: race.name });
                    return { success: true, raceId: race.id };
                }
                else {
                    return { success: false, raceId: race.id };
                }
            }
            catch (error) {
                context.error('Failed to process race', {
                    raceId: race.id,
                    raceName: race.name,
                    meetingId: meeting,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                return { success: false, raceId: race.id, error };
            }
        });
        
        const batchResults = await Promise.all(racePromises);
        const successfulRaces = batchResults.filter(result => result.success);
        const successfulRaceIds = successfulRaces.map(result => result.raceId);
        processedRaceIds.push(...successfulRaceIds);
        racesProcessed += successfulRaces.length;
        
        context.log('Processed race batch', {
            batchNumber: Math.floor(i / batchSize) + 1,
            batchSize: batch.length,
            successful: successfulRaces.length,
            failed: batch.length - successfulRaces.length,
            totalProcessed: racesProcessed
        });
    }
    
    return { racesProcessed, raceIds: processedRaceIds };
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