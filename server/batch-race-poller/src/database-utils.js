/**
 * Database utilities for batch-race-poller function
 * Optimized for batch processing multiple races with shared connection pooling
 */

import { ID } from 'node-appwrite';
import { collectBatchError } from './error-handlers.js';

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
 * Save money flow history data from money_tracker API response
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID  
 * @param {string} entrantId - Entrant ID
 * @param {Object} moneyData - Money tracker data from API (hold_percentage, bet_percentage)
 * @param {Object} context - Appwrite function context for logging
 * @returns {boolean} Success status
 */
async function saveMoneyFlowHistory(databases, databaseId, entrantId, moneyData, context) {
    if (!moneyData || (typeof moneyData.hold_percentage === 'undefined' && typeof moneyData.bet_percentage === 'undefined')) {
        return false;
    }

    try {
        const timestamp = new Date().toISOString();
        
        // Store both hold_percentage and bet_percentage as separate records for comprehensive tracking
        let recordsCreated = 0;
        
        // Save hold percentage (money held on this entrant)
        if (typeof moneyData.hold_percentage !== 'undefined') {
            await databases.createDocument(databaseId, 'money-flow-history', ID.unique(), {
                entrant: entrantId,
                holdPercentage: moneyData.hold_percentage,
                betPercentage: null, // Explicitly null for hold_percentage records
                type: 'hold_percentage',
                eventTimestamp: timestamp
            });
            recordsCreated++;
        }
        
        // Save bet percentage (percentage of total bets on this entrant) 
        if (typeof moneyData.bet_percentage !== 'undefined') {
            await databases.createDocument(databaseId, 'money-flow-history', ID.unique(), {
                entrant: entrantId,
                holdPercentage: null, // Explicitly null for bet_percentage records
                betPercentage: moneyData.bet_percentage,
                type: 'bet_percentage',
                eventTimestamp: timestamp
            });
            recordsCreated++;
        }

        return recordsCreated > 0;
    } catch (error) {
        context.error('Failed to save money flow history', {
            entrantId,
            holdPercentageValue: moneyData.hold_percentage,
            betPercentageValue: moneyData.bet_percentage,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return false;
    }
}

/**
 * Process money tracker data from API response
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {Object} moneyTrackerData - Money tracker data from API response
 * @param {Object} context - Appwrite function context for logging
 * @param {string} raceId - Race ID for batch processing context
 * @returns {number} Number of entrants processed for money flow
 */
export async function processMoneyTrackerData(databases, databaseId, moneyTrackerData, context, raceId = 'unknown') {
    if (!moneyTrackerData || !moneyTrackerData.entrants || !Array.isArray(moneyTrackerData.entrants)) {
        context.log('No money tracker entrants data available', { raceId });
        return 0;
    }

    let entrantsProcessed = 0;
    
    // Process and save money tracker entries in a single pass
    const processedEntrants = new Set();
    
    for (const entry of moneyTrackerData.entrants) {
        if (entry.entrant_id && !processedEntrants.has(entry.entrant_id)) {
            // Save the latest entry for each entrant (assuming they're in chronological order)
            const moneyData = {
                hold_percentage: entry.hold_percentage,
                bet_percentage: entry.bet_percentage
            };
            
            const success = await saveMoneyFlowHistory(databases, databaseId, entry.entrant_id, moneyData, context);
            if (success) {
                entrantsProcessed++;
                processedEntrants.add(entry.entrant_id);
            }
        }
    }
    
    context.log('Processed money tracker data', {
        raceId,
        totalEntries: moneyTrackerData.entrants.length,
        uniqueEntrants: processedEntrants.size,
        entrantsProcessed
    });
    
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
        return true;
    }
    catch (error) {
        try {
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
            if (entrant.gear) entrantDoc.gear = entrant.gear;
            
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
                        recordsCreated: historyRecords,
                        raceId
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

/**
 * Batch process multiple races efficiently with shared database connection
 * @param {Object} databases - Appwrite Databases instance (shared connection)
 * @param {string} databaseId - Database ID
 * @param {Array} raceResults - Array of race results from batchFetchRaceEventData
 * @param {Object} context - Appwrite function context for logging
 * @returns {Object} Batch processing summary
 */
export async function batchProcessRaces(databases, databaseId, raceResults, context) {
    const processingResults = [];
    const errors = [];
    
    context.log('Starting batch race processing', {
        totalRaces: raceResults.length,
        successfulFetches: raceResults.filter(r => r.success).length
    });

    for (const raceResult of raceResults) {
        if (!raceResult.success || !raceResult.data) {
            processingResults.push({
                raceId: raceResult.raceId,
                success: false,
                entrantsProcessed: 0,
                moneyFlowProcessed: 0,
                reason: 'Failed to fetch race data'
            });
            continue;
        }

        try {
            context.log(`Processing race data: ${raceResult.raceId}`);
            
            let entrantsProcessed = 0;
            let moneyFlowProcessed = 0;
            let raceStatusUpdated = false;
            
            // Update race status if available and different from current status
            if (raceResult.data.race && raceResult.data.race.status) {
                try {
                    // Get current race status to compare
                    const currentRace = await databases.getDocument(databaseId, 'races', raceResult.raceId);
                    
                    if (currentRace.status !== raceResult.data.race.status) {
                        await databases.updateDocument(databaseId, 'races', raceResult.raceId, {
                            status: raceResult.data.race.status
                        });
                        raceStatusUpdated = true;
                        context.log(`Updated race status`, { 
                            raceId: raceResult.raceId, 
                            oldStatus: currentRace.status, 
                            newStatus: raceResult.data.race.status 
                        });
                    }
                } catch (error) {
                    collectBatchError(errors, error, raceResult.raceId, 'updateRaceStatus', context);
                }
            }
            
            // Process both entrants and money flow in parallel
            const processingPromises = [];
            
            // Update entrant data if available
            if (raceResult.data.entrants && raceResult.data.entrants.length > 0) {
                processingPromises.push(
                    processEntrants(databases, databaseId, raceResult.raceId, raceResult.data.entrants, context)
                        .then(count => { entrantsProcessed = count; })
                        .catch(error => {
                            collectBatchError(errors, error, raceResult.raceId, 'processEntrants', context);
                            entrantsProcessed = 0;
                        })
                );
            }
            
            // Process money tracker data if available
            if (raceResult.data.money_tracker) {
                processingPromises.push(
                    processMoneyTrackerData(databases, databaseId, raceResult.data.money_tracker, context, raceResult.raceId)
                        .then(count => { moneyFlowProcessed = count; })
                        .catch(error => {
                            collectBatchError(errors, error, raceResult.raceId, 'processMoneyTrackerData', context);
                            moneyFlowProcessed = 0;
                        })
                );
            }
            
            // Wait for all processing to complete
            await Promise.all(processingPromises);
            
            processingResults.push({
                raceId: raceResult.raceId,
                success: true,
                entrantsProcessed,
                moneyFlowProcessed,
                raceStatusUpdated,
                processedAt: new Date().toISOString()
            });
            
            context.log('Successfully processed race', {
                raceId: raceResult.raceId,
                entrantsProcessed,
                moneyFlowProcessed,
                raceStatusUpdated
            });
            
        } catch (error) {
            collectBatchError(errors, error, raceResult.raceId, 'batchProcessRaces', context);
            
            processingResults.push({
                raceId: raceResult.raceId,
                success: false,
                entrantsProcessed: 0,
                moneyFlowProcessed: 0,
                reason: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    
    // Calculate summary statistics
    const successful = processingResults.filter(r => r.success);
    const totalEntrantsProcessed = processingResults.reduce((sum, r) => sum + r.entrantsProcessed, 0);
    const totalMoneyFlowProcessed = processingResults.reduce((sum, r) => sum + r.moneyFlowProcessed, 0);
    
    const summary = {
        totalRaces: raceResults.length,
        successfulRaces: successful.length,
        failedRaces: raceResults.length - successful.length,
        totalEntrantsProcessed,
        totalMoneyFlowProcessed,
        totalErrors: errors.length,
        processingResults,
        errors,
        timestamp: new Date().toISOString()
    };
    
    context.log('Batch race processing completed', {
        totalRaces: summary.totalRaces,
        successfulRaces: summary.successfulRaces,
        failedRaces: summary.failedRaces,
        totalEntrantsProcessed,
        totalMoneyFlowProcessed,
        totalErrors: summary.totalErrors
    });
    
    return summary;
}