/**
 * Database utilities for Appwrite operations
 * Provides performant upsert patterns and error handling
 */

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
        // Log the update error for debugging
        if (error && typeof error === 'object' && 'code' in error && error.code !== 404) {
            context.error(`Update failed for ${collectionId} document (non-404 error)`, {
                documentId,
                updateError: error instanceof Error ? error.message : 'Unknown error',
                errorCode: error.code
            });
        }
        
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
    
    context.log(`Processing ${entrants.length} entrants for race ${raceId} with comprehensive data`);
    
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
            const runnerChange = safeStringField(entrant.runner_change, 500);
            if (runnerChange) entrantDoc.runnerChange = runnerChange;
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
            const owners = safeStringField(entrant.owners, 255);
            if (owners) entrantDoc.owners = owners;
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
            const silkColours = safeStringField(entrant.silk_colours, 100);
            if (silkColours) entrantDoc.silkColours = silkColours;
            if (entrant.silk_url_64x64) entrantDoc.silkUrl64 = entrant.silk_url_64x64;
            if (entrant.silk_url_128x128) entrantDoc.silkUrl128 = entrant.silk_url_128x128;
            
            // Import metadata
            entrantDoc.lastUpdated = new Date().toISOString();
            entrantDoc.dataSource = 'NZTAB';
            entrantDoc.importedAt = new Date().toISOString();

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
    
    context.log(`Finished processing entrants for race ${raceId}: ${entrantsProcessed}/${entrants.length} successful`);
    return entrantsProcessed;
}

/**
 * Process races with detailed data from events API
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {Array} detailedRaces - Array of objects with basicRace and detailedData
 * @param {Object} context - Appwrite function context for logging
 * @returns {number} Number of races processed
 */
export async function processDetailedRaces(databases, databaseId, detailedRaces, context) {
    let racesProcessed = 0;
    
    // Process each race with detailed data
    for (const { basicRace, detailedData } of detailedRaces) {
        try {
            const enhancedRaceDoc = {
                // Core identifiers (keep existing)
                raceId: basicRace.raceId,
                name: detailedData.description || basicRace.name,
                raceNumber: basicRace.raceNumber,
                
                // Enhanced timing information
                startTime: basicRace.startTime,
                ...(detailedData.actual_start && { actualStart: new Date(detailedData.actual_start * 1000).toISOString() }),
                ...(detailedData.start_time_nz && { startTimeNz: detailedData.start_time_nz }),
                ...(detailedData.race_date_nz && { raceDateNz: detailedData.race_date_nz }),
                
                // Race details (merge basic with detailed)
                ...(detailedData.distance && { distance: detailedData.distance }),
                ...(detailedData.track_condition && { trackCondition: detailedData.track_condition }),
                ...(detailedData.weather && { weather: detailedData.weather }),
                status: detailedData.status || basicRace.status,
                
                // Track information
                ...(detailedData.track_direction && { trackDirection: detailedData.track_direction }),
                ...(detailedData.track_surface && { trackSurface: detailedData.track_surface }),
                ...(detailedData.rail_position && { railPosition: detailedData.rail_position }),
                ...(detailedData.track_home_straight && { trackHomeStraight: detailedData.track_home_straight }),
                
                // Race classification
                ...(detailedData.type && { type: detailedData.type }),
                ...(detailedData.start_type && { startType: detailedData.start_type }),
                ...(detailedData.group && { group: detailedData.group }),
                ...(detailedData.class && { class: detailedData.class }),
                ...(detailedData.gait && { gait: detailedData.gait }),
                
                // Prize and field information
                ...(detailedData.prize_monies?.total_value && { totalPrizeMoney: detailedData.prize_monies.total_value }),
                ...(detailedData.entrant_count && { entrantCount: detailedData.entrant_count }),
                ...(detailedData.field_size && { fieldSize: detailedData.field_size }),
                ...(detailedData.positions_paid && { positionsPaid: detailedData.positions_paid }),
                
                // Race conditions
                ...(detailedData.gender_conditions && { genderConditions: detailedData.gender_conditions }),
                ...(detailedData.age_conditions && { ageConditions: detailedData.age_conditions }),
                ...(detailedData.weight_and_handicap_conditions && { weightConditions: detailedData.weight_and_handicap_conditions }),
                ...(detailedData.allowance_conditions !== undefined && { allowanceConditions: detailedData.allowance_conditions }),
                ...(detailedData.special_conditions && { specialConditions: detailedData.special_conditions }),
                ...(detailedData.jockey_conditions && { jockeyConditions: detailedData.jockey_conditions }),
                
                // Form and commentary
                ...(detailedData.form_guide && { formGuide: detailedData.form_guide }),
                ...(detailedData.comment && { comment: detailedData.comment }),
                ...(detailedData.description && { description: detailedData.description }),
                
                // Visual and media
                ...(detailedData.silk_url && { silkUrl: detailedData.silk_url }),
                ...(detailedData.silk_base_url && { silkBaseUrl: detailedData.silk_base_url }),
                ...(detailedData.video_channels && { videoChannels: JSON.stringify(detailedData.video_channels) }),
                
                // Betting options
                ...(detailedData.ffwin_option_number && { ffwinOptionNumber: detailedData.ffwin_option_number }),
                ...(detailedData.fftop3_option_number && { fftop3OptionNumber: detailedData.fftop3_option_number }),
                
                // Rate information
                ...(detailedData.mile_rate_400 && { mileRate400: detailedData.mile_rate_400 }),
                ...(detailedData.mile_rate_800 && { mileRate800: detailedData.mile_rate_800 }),
                
                // Import metadata
                lastUpdated: new Date().toISOString(),
                dataSource: 'NZTAB',
                importedAt: new Date().toISOString(),
                meeting: basicRace.meeting
            };

            const success = await performantUpsert(databases, databaseId, 'races', basicRace.raceId, enhancedRaceDoc, context);
            if (success) {
                racesProcessed++;
                context.log('Enhanced race with detailed data', { 
                    raceId: basicRace.raceId, 
                    name: enhancedRaceDoc.name,
                    entrantCount: enhancedRaceDoc.entrantCount,
                    fieldSize: enhancedRaceDoc.fieldSize
                });
            }
        } catch (error) {
            context.error('Failed to process detailed race data', {
                raceId: basicRace.raceId,
                raceName: basicRace.name,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    
    return racesProcessed;
}