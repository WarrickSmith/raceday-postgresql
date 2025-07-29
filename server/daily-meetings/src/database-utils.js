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
                // Core identifiers
                meetingId: meeting.meeting,
                meetingName: meeting.name,
                
                // Location and categorization
                country: meeting.country,
                ...(meeting.state && { state: meeting.state }),
                raceType: meeting.category_name,
                ...(meeting.category && { category: meeting.category }),
                ...(meeting.category_name && { categoryName: meeting.category_name }),
                
                // Meeting details
                date: meeting.date,
                ...(meeting.track_condition && { trackCondition: meeting.track_condition }),
                status: 'active',
                
                // Import metadata
                lastUpdated: new Date().toISOString(),
                dataSource: 'NZTAB',
                ...(meeting.generated_time && { apiGeneratedTime: meeting.generated_time })
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
                    // Core identifiers
                    raceId: race.id,
                    name: race.name,
                    raceNumber: race.race_number,
                    
                    // Timing information
                    startTime: race.start_time,
                    ...(race.actual_start && { actualStart: race.actual_start }),
                    ...(race.tote_start_time && { toteStartTime: race.tote_start_time }),
                    ...(race.start_time_nz && { startTimeNz: race.start_time_nz }),
                    ...(race.race_date_nz && { raceDateNz: race.race_date_nz }),
                    
                    // Race details
                    ...(race.distance !== undefined && { distance: race.distance }),
                    ...(race.track_condition && { trackCondition: race.track_condition }),
                    ...(race.weather && { weather: race.weather }),
                    status: race.status,
                    
                    // Track information
                    ...(race.track_direction && { trackDirection: race.track_direction }),
                    ...(race.track_surface && { trackSurface: race.track_surface }),
                    ...(race.rail_position && { railPosition: race.rail_position }),
                    ...(race.track_home_straight && { trackHomeStraight: race.track_home_straight }),
                    
                    // Race classification
                    ...(race.type && { type: race.type }),
                    ...(race.start_type && { startType: race.start_type }),
                    ...(race.group && { group: race.group }),
                    ...(race.class && { class: race.class }),
                    ...(race.gait && { gait: race.gait }),
                    
                    // Prize and field information
                    ...(race.prize_monies?.total_value && { totalPrizeMoney: race.prize_monies.total_value }),
                    ...(race.entrant_count && { entrantCount: race.entrant_count }),
                    ...(race.field_size && { fieldSize: race.field_size }),
                    ...(race.positions_paid && { positionsPaid: race.positions_paid }),
                    
                    // Race conditions
                    ...(race.gender_conditions && { genderConditions: race.gender_conditions }),
                    ...(race.age_conditions && { ageConditions: race.age_conditions }),
                    ...(race.weight_and_handicap_conditions && { weightConditions: race.weight_and_handicap_conditions }),
                    ...(race.allowance_conditions !== undefined && { allowanceConditions: race.allowance_conditions }),
                    ...(race.special_conditions && { specialConditions: race.special_conditions }),
                    ...(race.jockey_conditions && { jockeyConditions: race.jockey_conditions }),
                    
                    // Form and commentary
                    ...(race.form_guide && { formGuide: race.form_guide }),
                    ...(race.comment && { comment: race.comment }),
                    ...(race.description && { description: race.description }),
                    
                    // Visual and media
                    ...(race.silk_url && { silkUrl: race.silk_url }),
                    ...(race.silk_base_url && { silkBaseUrl: race.silk_base_url }),
                    ...(race.video_channels && { videoChannels: JSON.stringify(race.video_channels) }),
                    
                    // Betting options
                    ...(race.ffwin_option_number && { ffwinOptionNumber: race.ffwin_option_number }),
                    ...(race.fftop3_option_number && { fftop3OptionNumber: race.fftop3_option_number }),
                    
                    // Rate information
                    ...(race.mile_rate_400 && { mileRate400: race.mile_rate_400 }),
                    ...(race.mile_rate_800 && { mileRate800: race.mile_rate_800 }),
                    
                    // Import metadata
                    lastUpdated: new Date().toISOString(),
                    dataSource: 'NZTAB',
                    importedAt: new Date().toISOString(),
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
 * Process entrants using the new dual-collection approach to avoid MariaDB limitations
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {string} raceId - Race ID
 * @param {Array} entrants - Array of entrant objects
 * @param {Object} context - Appwrite function context for logging
 * @returns {number} Number of entrants processed
 */
export async function processEntrants(databases, databaseId, raceId, entrants, context) {
    let entrantsProcessed = 0;
    
    // Process each entrant with dual-collection approach
    for (const entrant of entrants) {
        try {
            // Daily entrants document (frequently updated data)
            const dailyEntrantDoc = {
                // Core identifiers
                entrantId: entrant.entrant_id,
                name: entrant.name,
                runnerNumber: entrant.runner_number,
                ...(entrant.barrier && { barrier: entrant.barrier }),
                
                // Current status information (updated frequently during race day)
                isScratched: entrant.is_scratched || false,
                ...(entrant.is_late_scratched !== undefined && { isLateScratched: entrant.is_late_scratched }),
                ...(entrant.is_emergency !== undefined && { isEmergency: entrant.is_emergency }),
                ...(entrant.scratch_time && { scratchTime: entrant.scratch_time }),
                ...(entrant.emergency_position && { emergencyPosition: entrant.emergency_position }),
                ...(entrant.runner_change && { runnerChange: entrant.runner_change }),
                
                // Betting status indicators (updated frequently)
                ...(entrant.favourite !== undefined && { favourite: entrant.favourite }),
                ...(entrant.mover !== undefined && { mover: entrant.mover }),
                
                // Current race connections (may change on race day)
                ...(entrant.jockey && { jockey: entrant.jockey }),
                ...(entrant.apprentice_indicator && { apprenticeIndicator: entrant.apprentice_indicator }),
                ...(entrant.gear && { gear: entrant.gear }),
                
                // Weight information (finalized on race day)
                ...(entrant.weight?.total && { weight: entrant.weight.total }),
                ...(entrant.weight?.allocated && { allocatedWeight: entrant.weight.allocated }),
                ...(entrant.allowance_weight && { allowanceWeight: entrant.allowance_weight }),
                
                // Current market information
                ...(entrant.market_name && { marketName: entrant.market_name }),
                ...(entrant.primary_market !== undefined && { primaryMarket: entrant.primary_market }),
                
                // Speedmap positioning for live race strategy
                ...(entrant.speedmap?.settling_lengths && { settlingLengths: entrant.speedmap.settling_lengths }),
                
                // Import and update metadata
                lastUpdated: new Date().toISOString(),
                dataSource: 'NZTAB',
                importedAt: new Date().toISOString(),
                race: raceId
            };

            // Handle odds data
            if (entrant.odds) {
                if (entrant.odds.fixed_win !== undefined) dailyEntrantDoc.fixedWinOdds = entrant.odds.fixed_win;
                if (entrant.odds.fixed_place !== undefined) dailyEntrantDoc.fixedPlaceOdds = entrant.odds.fixed_place;
                if (entrant.odds.pool_win !== undefined) dailyEntrantDoc.poolWinOdds = entrant.odds.pool_win;
                if (entrant.odds.pool_place !== undefined) dailyEntrantDoc.poolPlaceOdds = entrant.odds.pool_place;
            }

            // Entrants history document (static/historical data)
            const entrantHistoryDoc = {
                // Core identifier to link with daily entrants
                entrantId: entrant.entrant_id,
                ...(entrant.horse_id && { horseId: entrant.horse_id }),
                
                // Animal details (relatively static)
                ...(entrant.age && { age: entrant.age }),
                ...(entrant.sex && { sex: entrant.sex }),
                ...(entrant.colour && { colour: entrant.colour }),
                ...(entrant.country && { country: entrant.country }),
                ...(entrant.foaling_date && { foalingDate: entrant.foaling_date }),
                ...(entrant.first_start_indicator !== undefined && { firstStartIndicator: entrant.first_start_indicator }),
                
                // Breeding information (static)
                ...(entrant.sire && { sire: entrant.sire }),
                ...(entrant.dam && { dam: entrant.dam }),
                ...(entrant.breeding && { breeding: entrant.breeding }),
                
                // Stable connections (relatively static)
                ...(entrant.trainer_name && { trainerName: entrant.trainer_name }),
                ...(entrant.trainer_location && { trainerLocation: entrant.trainer_location }),
                ...(entrant.owners && { owners: entrant.owners }),
                
                // Rating and classification (updated periodically, not daily)
                ...(entrant.rating && { rating: entrant.rating }),
                ...(entrant.handicap_rating && { handicapRating: entrant.handicap_rating }),
                ...(entrant.class_level && { classLevel: entrant.class_level }),
                ...(entrant.prize_money && { prizeMoney: entrant.prize_money }),
                
                // Form and performance summary
                ...(entrant.last_twenty_starts && { lastTwentyStarts: entrant.last_twenty_starts }),
                ...(entrant.best_time && { bestTime: entrant.best_time }),
                ...(entrant.form_comment && { formComment: entrant.form_comment }),
                
                // Overall performance statistics
                ...(entrant.overall?.number_of_starts && { overallStarts: entrant.overall.number_of_starts }),
                ...(entrant.overall?.number_of_wins && { overallWins: entrant.overall.number_of_wins }),
                ...(entrant.overall?.number_of_seconds && { overallSeconds: entrant.overall.number_of_seconds }),
                ...(entrant.overall?.number_of_thirds && { overallThirds: entrant.overall.number_of_thirds }),
                ...(entrant.overall?.number_of_placings && { overallPlacings: entrant.overall.number_of_placings }),
                ...(entrant.win_p && { winPercentage: entrant.win_p }),
                ...(entrant.place_p && { placePercentage: entrant.place_p }),
                
                // Track/distance/condition specific stats
                ...(entrant.track?.number_of_starts && { trackStarts: entrant.track.number_of_starts }),
                ...(entrant.track?.number_of_wins && { trackWins: entrant.track.number_of_wins }),
                ...(entrant.track?.number_of_seconds && { trackSeconds: entrant.track.number_of_seconds }),
                ...(entrant.track?.number_of_thirds && { trackThirds: entrant.track.number_of_thirds }),
                
                ...(entrant.distance?.number_of_starts && { distanceStarts: entrant.distance.number_of_starts }),
                ...(entrant.distance?.number_of_wins && { distanceWins: entrant.distance.number_of_wins }),
                ...(entrant.distance?.number_of_seconds && { distanceSeconds: entrant.distance.number_of_seconds }),
                ...(entrant.distance?.number_of_thirds && { distanceThirds: entrant.distance.number_of_thirds }),
                
                // Barrier/box statistics
                ...(entrant.box_history?.number_of_starts && { barrierStarts: entrant.box_history.number_of_starts }),
                ...(entrant.box_history?.number_of_wins && { barrierWins: entrant.box_history.number_of_wins }),
                ...(entrant.box_history?.number_of_seconds && { barrierSeconds: entrant.box_history.number_of_seconds }),
                ...(entrant.box_history?.number_of_thirds && { barrierThirds: entrant.box_history.number_of_thirds }),
                
                // Recent form (last 12 months)
                ...(entrant.last_12_months?.number_of_starts && { last12Starts: entrant.last_12_months.number_of_starts }),
                ...(entrant.last_12_months?.number_of_wins && { last12Wins: entrant.last_12_months.number_of_wins }),
                ...(entrant.last_12_months?.number_of_seconds && { last12Seconds: entrant.last_12_months.number_of_seconds }),
                ...(entrant.last_12_months?.number_of_thirds && { last12Thirds: entrant.last_12_months.number_of_thirds }),
                ...(entrant.last_12_w && { last12WinPercentage: entrant.last_12_w }),
                ...(entrant.last_12_p && { last12PlacePercentage: entrant.last_12_p }),
                
                // Speed and prediction data
                ...(entrant.spr && { spr: entrant.spr }),
                ...(entrant.predictors?.[0]?.average_time && { averageTime: entrant.predictors[0].average_time }),
                ...(entrant.predictors?.[0]?.average_kms && { averageKms: entrant.predictors[0].average_kms }),
                ...(entrant.predictors?.[0]?.best_time && { bestTimeFloat: entrant.predictors[0].best_time }),
                ...(entrant.predictors?.[0]?.best_kms && { bestKms: entrant.predictors[0].best_kms }),
                ...(entrant.predictors?.[0]?.best_date && { bestDate: entrant.predictors[0].best_date }),
                ...(entrant.predictors?.[0]?.win && { winPrediction: entrant.predictors[0].win }),
                ...(entrant.predictors?.[0]?.place && { placePrediction: entrant.predictors[0].place }),
                
                // Visual and display (relatively static)
                ...(entrant.silk_colours && { silkColours: entrant.silk_colours }),
                ...(entrant.silk_url && { silkUrl: entrant.silk_url }),
                ...(entrant.silk_url_64x64 && { silkUrl64x64: entrant.silk_url_64x64 }),
                ...(entrant.silk_url_128x128 && { silkUrl128x128: entrant.silk_url_128x128 }),
                
                // Complex historical data stored as JSON strings
                ...(entrant.form_indicators && { formIndicators: JSON.stringify(entrant.form_indicators) }),
                ...(entrant.last_starts && { lastStarts: JSON.stringify(entrant.last_starts) }),
                ...(entrant.all_box_history && { allBoxHistory: JSON.stringify(entrant.all_box_history) }),
                ...(entrant.past_performances && { pastPerformances: JSON.stringify(entrant.past_performances) }),
                ...(entrant.runner_win_history && { runnerWinHistory: JSON.stringify(entrant.runner_win_history) }),
                ...(entrant.video_channels_meta && { videoChannelsMeta: JSON.stringify(entrant.video_channels_meta) }),
                
                // Import and update metadata
                lastUpdated: new Date().toISOString(),
                dataSource: 'NZTAB',
                importedAt: new Date().toISOString()
            };

            // Upsert both documents
            const dailySuccess = await performantUpsert(databases, databaseId, 'entrants', entrant.entrant_id, dailyEntrantDoc, context);
            const historySuccess = await performantUpsert(databases, databaseId, 'entrants-history', entrant.entrant_id, entrantHistoryDoc, context);

            if (dailySuccess && historySuccess) {
                entrantsProcessed++;
                context.log('Upserted entrant (daily + history)', { 
                    entrantId: entrant.entrant_id, 
                    name: entrant.name,
                    raceId: raceId
                });
            } else if (dailySuccess) {
                entrantsProcessed++;
                context.log('Upserted entrant (daily only)', { 
                    entrantId: entrant.entrant_id, 
                    name: entrant.name,
                    raceId: raceId,
                    warning: 'History upsert failed'
                });
            }
        } catch (error) {
            context.error('Failed to process entrant', {
                entrantId: entrant.entrant_id,
                entrantName: entrant.name,
                raceId: raceId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    
    return entrantsProcessed;
}