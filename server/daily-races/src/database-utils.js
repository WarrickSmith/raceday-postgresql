/**
 * Database utilities for Appwrite operations
 * Provides performant upsert patterns and error handling
 */

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
 * Process entrants for a specific race
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {string} raceId - Race ID
 * @param {Array} entrants - Array of entrant objects
 * @param {Object} context - Appwrite function context for logging
 * @returns {number} Number of entrants processed
 */
export async function processEntrants(databases, databaseId, raceId, entrants, context) {
    let entrantsProcessed = 0;
    
    // Process each entrant
    for (const entrant of entrants) {
        const entrantDoc = {
            entrantId: entrant.entrant_id,
            name: entrant.name,
            runnerNumber: entrant.runner_number,
            isScratched: entrant.is_scratched || false,
            race: raceId
        };

        // Add optional fields if present
        if (entrant.jockey) entrantDoc.jockey = entrant.jockey;
        if (entrant.trainer_name) entrantDoc.trainerName = entrant.trainer_name;
        if (entrant.weight) entrantDoc.weight = entrant.weight;
        if (entrant.silk_url) entrantDoc.silkUrl = entrant.silk_url;

        // Handle odds data if present
        if (entrant.odds) {
            if (entrant.odds.fixed_win !== undefined) entrantDoc.winOdds = entrant.odds.fixed_win;
            if (entrant.odds.fixed_place !== undefined) entrantDoc.placeOdds = entrant.odds.fixed_place;
        }

        const success = await performantUpsert(databases, databaseId, 'entrants', entrant.entrant_id, entrantDoc, context);
        if (success) {
            entrantsProcessed++;
            context.log('Upserted entrant', { 
                entrantId: entrant.entrant_id, 
                name: entrant.name,
                raceId: raceId
            });
        }
    }
    
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