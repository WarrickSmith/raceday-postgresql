/**
 * Data processing utilities for race data filtering and transformation
 */

import { logDebug, logInfo, logWarn, logError } from './logging-utils.js';

/**
 * Filter meetings for AU/NZ Thoroughbred (T) and Harness (H) racing only
 * @param {Array} meetings - Array of meeting objects
 * @param {Object} context - Appwrite function context for logging
 * @returns {Array} Filtered meetings array
 */
export function filterMeetings(meetings, context) {
    const allowedCountries = ['AUS', 'NZ'];
    const allowedCategories = ['T', 'H']; // T = Thoroughbred, H = Harness
    const countriesFound = [...new Set(meetings.map(meeting => meeting.country))];
    const categoriesFound = [...new Set(meetings.map(meeting => meeting.category))];
    
    const filtered = meetings.filter(meeting => {
        if (!allowedCountries.includes(meeting.country)) {
            return false;
        }
        if (!allowedCategories.includes(meeting.category)) {
            return false;
        }
        return true;
    });
    
    logDebug(context, 'Filtered meetings for AU/NZ Horse/Harness racing', {
        originalCount: meetings.length,
        filteredCount: filtered.length,
        allowedCountries,
        allowedCategories,
        countriesFound,
        categoriesFound,
        filteredOut: meetings.length - filtered.length
    });
    
    return filtered;
}

/**
 * Validate meeting data structure
 * @param {Object} meeting - Meeting object to validate
 * @returns {boolean} True if valid
 */
export function validateMeeting(meeting) {
    return meeting &&
           typeof meeting.meeting === 'string' &&
           typeof meeting.name === 'string' &&
           typeof meeting.country === 'string' &&
           typeof meeting.category_name === 'string' &&
           Array.isArray(meeting.races);
}

/**
 * Validate race data structure
 * @param {Object} race - Race object to validate
 * @returns {boolean} True if valid
 */
export function validateRace(race) {
    return race &&
           typeof race.id === 'string' &&
           typeof race.name === 'string' &&
           typeof race.race_number === 'number' &&
           typeof race.start_time === 'string';
}

/**
 * Validate entrant data structure
 * @param {Object} entrant - Entrant object to validate
 * @returns {boolean} True if valid
 */
export function validateEntrant(entrant) {
    return entrant &&
           typeof entrant.entrant_id === 'string' &&
           typeof entrant.name === 'string' &&
           typeof entrant.runner_number === 'number';
}

/**
 * Transform meeting data for database storage with comprehensive fields
 * @param {Object} meeting - Raw meeting data from NZTAB API
 * @returns {Object} Transformed meeting document
 */
export function transformMeetingData(meeting) {
    const meetingDoc = {
        // Core identifiers
        meetingId: meeting.meeting,
        meetingName: meeting.name,
        
        // Location and categorization
        country: meeting.country,
        state: meeting.state || meeting.country, // Use country as fallback for state
        raceType: meeting.category_name || 'Unknown',
        category: meeting.category,
        categoryName: meeting.category_name,
        
        // Meeting details
        date: meeting.date,
        trackCondition: meeting.track_condition,
        status: 'Open', // Default status for daily import
        
        // Additional metadata
        lastUpdated: new Date().toISOString(),
        dataSource: 'NZTAB',
        apiGeneratedTime: new Date().toISOString() // Will be updated with actual API timestamp if available
    };
    
    // Add optional fields if present
    if (meeting.track_direction) meetingDoc.trackDirection = meeting.track_direction;
    if (meeting.track_surface) meetingDoc.trackSurface = meeting.track_surface;
    if (meeting.rail_position) meetingDoc.railPosition = meeting.rail_position;
    if (meeting.weather) meetingDoc.weather = meeting.weather;
    
    return meetingDoc;
}

/**
 * Transform race data for database storage with comprehensive fields
 * @param {Object} race - Raw race data from NZTAB API or detailed race event data
 * @param {string} meetingId - Meeting ID this race belongs to
 * @returns {Object} Transformed race document
 */
export function transformRaceData(race, meetingId) {
    const raceDoc = {
        // Core identifiers
        raceId: race.id || race.event_id,
        name: race.name || race.description,
        raceNumber: race.race_number,
        
        // Timing information
        startTime: race.start_time || race.advertised_start_string,
        status: race.status,
        meeting: meetingId
    };
    
    // Add comprehensive race details if available
    if (race.actual_start_string) raceDoc.actualStart = race.actual_start_string;
    if (race.tote_start_time) raceDoc.toteStartTime = race.tote_start_time;
    if (race.start_time_nz) raceDoc.startTimeNz = race.start_time_nz;
    if (race.race_date_nz) raceDoc.raceDateNz = race.race_date_nz;
    
    // Race details
    if (race.distance !== undefined) raceDoc.distance = race.distance;
    if (race.track_condition !== undefined) raceDoc.trackCondition = race.track_condition;
    if (race.weather !== undefined) raceDoc.weather = race.weather;
    
    // Track information
    if (race.track_direction) raceDoc.trackDirection = race.track_direction;
    if (race.track_surface) raceDoc.trackSurface = race.track_surface;
    if (race.rail_position) raceDoc.railPosition = race.rail_position;
    if (race.track_home_straight) raceDoc.trackHomeStraight = race.track_home_straight;
    
    // Race classification
    if (race.type) raceDoc.type = race.type;
    if (race.start_type) raceDoc.startType = race.start_type;
    if (race.group) raceDoc.group = race.group;
    if (race.class) raceDoc.class = race.class;
    if (race.gait) raceDoc.gait = race.gait;
    
    // Prize and field information
    if (race.prize_monies?.total_value) raceDoc.totalPrizeMoney = race.prize_monies.total_value;
    if (race.entrant_count) raceDoc.entrantCount = race.entrant_count;
    if (race.field_size) raceDoc.fieldSize = race.field_size;
    if (race.positions_paid) raceDoc.positionsPaid = race.positions_paid;
    
    // Race conditions and restrictions
    if (race.gender_conditions) raceDoc.genderConditions = race.gender_conditions;
    if (race.age_conditions) raceDoc.ageConditions = race.age_conditions;
    if (race.weight_and_handicap_conditions) raceDoc.weightConditions = race.weight_and_handicap_conditions;
    if (race.allowance_conditions !== undefined) raceDoc.allowanceConditions = Boolean(race.allowance_conditions);
    if (race.special_conditions) raceDoc.specialConditions = race.special_conditions;
    if (race.jockey_conditions) raceDoc.jockeyConditions = race.jockey_conditions;
    
    // Form and commentary
    if (race.form_guide) raceDoc.formGuide = race.form_guide;
    if (race.comment) raceDoc.comment = race.comment;
    if (race.description) raceDoc.description = race.description;
    
    // Visual and media
    if (race.silk_url) raceDoc.silkUrl = race.silk_url;
    if (race.silk_base_url) raceDoc.silkBaseUrl = race.silk_base_url;
    if (race.video_channels) raceDoc.videoChannels = JSON.stringify(race.video_channels);
    
    // Betting options
    if (race.ffwin_option_number) raceDoc.ffwinOptionNumber = race.ffwin_option_number;
    if (race.fftop3_option_number) raceDoc.fftop3OptionNumber = race.fftop3_option_number;
    
    // Rate information for harness/trots
    if (race.mile_rate_400) raceDoc.mileRate400 = race.mile_rate_400;
    if (race.mile_rate_800) raceDoc.mileRate800 = race.mile_rate_800;
    
    // Import metadata
    raceDoc.lastUpdated = new Date().toISOString();
    raceDoc.dataSource = 'NZTAB';
    raceDoc.importedAt = new Date().toISOString();
    
    return raceDoc;
}

/**
 * Transform entrant data for daily entrants collection (frequently updated data)
 * @param {Object} entrant - Raw entrant data from NZTAB API
 * @param {string} raceId - Race ID this entrant belongs to
 * @returns {Object} Transformed daily entrant document
 */
export function transformDailyEntrantData(entrant, raceId) {
    const entrantDoc = {
        // Core identifiers
        entrantId: entrant.entrant_id,
        name: entrant.name,
        runnerNumber: entrant.runner_number,
        barrier: entrant.barrier,
        
        // Current status information (updated frequently during race day)
        isScratched: entrant.is_scratched || false,
        isLateScratched: entrant.is_late_scratched || false,
        isEmergency: entrant.is_emergency || false,
        race: raceId
    };

    // Add frequently updated status fields
    if (entrant.scratch_time) entrantDoc.scratchTime = entrant.scratch_time;
    if (entrant.emergency_position) entrantDoc.emergencyPosition = entrant.emergency_position;
    if (entrant.runner_change) entrantDoc.runnerChange = entrant.runner_change;
    
    // Current odds (updated frequently during betting)
    if (entrant.odds) {
        if (entrant.odds.fixed_win !== undefined) entrantDoc.fixedWinOdds = entrant.odds.fixed_win;
        if (entrant.odds.fixed_place !== undefined) entrantDoc.fixedPlaceOdds = entrant.odds.fixed_place;
        if (entrant.odds.pool_win !== undefined) entrantDoc.poolWinOdds = entrant.odds.pool_win;
        if (entrant.odds.pool_place !== undefined) entrantDoc.poolPlaceOdds = entrant.odds.pool_place;
    }
    
    // Betting status indicators (updated frequently)
    if (entrant.favourite !== undefined) entrantDoc.favourite = entrant.favourite;
    if (entrant.mover !== undefined) entrantDoc.mover = entrant.mover;
    
    // Current race connections (may change on race day)
    if (entrant.jockey) entrantDoc.jockey = entrant.jockey;
    if (entrant.apprentice_indicator) entrantDoc.apprenticeIndicator = entrant.apprentice_indicator;
    if (entrant.gear) entrantDoc.gear = entrant.gear;
    
    // Weight information (finalized on race day)
    if (entrant.weight) {
        if (typeof entrant.weight === 'object') {
            if (entrant.weight.allocated) entrantDoc.allocatedWeight = entrant.weight.allocated;
            if (entrant.weight.total) entrantDoc.totalWeight = entrant.weight.total;
        } else if (typeof entrant.weight === 'string') {
            entrantDoc.weight = entrant.weight;
        }
    }
    if (entrant.allowance_weight) entrantDoc.allowanceWeight = entrant.allowance_weight;
    
    // Current market information
    if (entrant.market_name) entrantDoc.marketName = entrant.market_name;
    if (entrant.primary_market !== undefined) entrantDoc.primaryMarket = entrant.primary_market;
    
    // Speedmap positioning for live race strategy
    if (entrant.speedmap?.settling_lengths) entrantDoc.settlingLengths = entrant.speedmap.settling_lengths;
    
    // Import and update metadata
    entrantDoc.lastUpdated = new Date().toISOString();
    entrantDoc.dataSource = 'NZTAB';
    entrantDoc.importedAt = new Date().toISOString();
    
    return entrantDoc;
}

/**
 * Transform entrant data for entrants history collection (static/historical data)
 * @param {Object} entrant - Raw entrant data from NZTAB API
 * @returns {Object} Transformed entrant history document
 */
export function transformEntrantHistoryData(entrant) {
    const historyDoc = {
        // Core identifier to link with daily entrants
        entrantId: entrant.entrant_id,
        horseId: entrant.horse_id,
        
        // Animal details (relatively static)
        age: entrant.age,
        sex: entrant.sex,
        colour: entrant.colour,
        country: entrant.country,
        foalingDate: entrant.foaling_date,
        firstStartIndicator: entrant.first_start_indicator || false,
        
        // Breeding information (static)
        sire: entrant.sire,
        dam: entrant.dam,
        breeding: entrant.breeding,
        
        // Stable connections (relatively static)
        trainerName: entrant.trainer_name,
        trainerLocation: entrant.trainer_location,
        owners: entrant.owners,
        
        // Rating and classification (updated periodically, not daily)
        rating: entrant.rating,
        handicapRating: entrant.handicap_rating,
        classLevel: entrant.class_level,
        prizeMoney: entrant.prize_money,
        
        // Form and performance summary
        lastTwentyStarts: entrant.last_twenty_starts,
        bestTime: entrant.best_time,
        formComment: entrant.form_comment
    };
    
    // Overall performance statistics
    if (entrant.overall) {
        historyDoc.overallStarts = entrant.overall.number_of_starts;
        historyDoc.overallWins = entrant.overall.number_of_wins;
        historyDoc.overallSeconds = entrant.overall.number_of_seconds;
        historyDoc.overallThirds = entrant.overall.number_of_thirds;
        historyDoc.overallPlacings = entrant.overall.number_of_placings;
    }
    
    if (entrant.win_p) historyDoc.winPercentage = entrant.win_p;
    if (entrant.place_p) historyDoc.placePercentage = entrant.place_p;
    
    // Track/distance/condition specific stats
    if (entrant.track) {
        historyDoc.trackStarts = entrant.track.number_of_starts;
        historyDoc.trackWins = entrant.track.number_of_wins;
        historyDoc.trackSeconds = entrant.track.number_of_seconds;
        historyDoc.trackThirds = entrant.track.number_of_thirds;
    }
    
    if (entrant.distance) {
        historyDoc.distanceStarts = entrant.distance.number_of_starts;
        historyDoc.distanceWins = entrant.distance.number_of_wins;
        historyDoc.distanceSeconds = entrant.distance.number_of_seconds;
        historyDoc.distanceThirds = entrant.distance.number_of_thirds;
    }
    
    // Barrier/box statistics
    if (entrant.box_history) {
        historyDoc.barrierStarts = entrant.box_history.number_of_starts;
        historyDoc.barrierWins = entrant.box_history.number_of_wins;
        historyDoc.barrierSeconds = entrant.box_history.number_of_seconds;
        historyDoc.barrierThirds = entrant.box_history.number_of_thirds;
    }
    
    // Recent form (last 12 months)
    if (entrant.last_12_months) {
        historyDoc.last12Starts = entrant.last_12_months.number_of_starts;
        historyDoc.last12Wins = entrant.last_12_months.number_of_wins;
        historyDoc.last12Seconds = entrant.last_12_months.number_of_seconds;
        historyDoc.last12Thirds = entrant.last_12_months.number_of_thirds;
    }
    
    if (entrant.last_12_w) historyDoc.last12WinPercentage = entrant.last_12_w;
    if (entrant.last_12_p) historyDoc.last12PlacePercentage = entrant.last_12_p;
    
    // Speed and prediction data
    if (entrant.spr) historyDoc.spr = entrant.spr;
    
    if (entrant.predictors && entrant.predictors.length > 0) {
        const predictor = entrant.predictors[0]; // Use first predictor
        historyDoc.averageTime = predictor.average_time;
        historyDoc.averageKms = predictor.average_kms;
        historyDoc.bestTimeFloat = predictor.best_time;
        historyDoc.bestKms = predictor.best_kms;
        historyDoc.bestDate = predictor.best_date;
        historyDoc.winPrediction = predictor.win;
        historyDoc.placePrediction = predictor.place;
    }
    
    // Visual and display (relatively static)
    if (entrant.silk_colours) historyDoc.silkColours = entrant.silk_colours;
    if (entrant.silk_url) historyDoc.silkUrl = entrant.silk_url;
    if (entrant.silk_url_64x64) historyDoc.silkUrl64x64 = entrant.silk_url_64x64;
    if (entrant.silk_url_128x128) historyDoc.silkUrl128x128 = entrant.silk_url_128x128;
    
    // Complex historical data stored as JSON strings
    if (entrant.form_indicators) historyDoc.formIndicators = JSON.stringify(entrant.form_indicators);
    if (entrant.last_starts) historyDoc.lastStarts = JSON.stringify(entrant.last_starts);
    if (entrant.all_box_history) historyDoc.allBoxHistory = JSON.stringify(entrant.all_box_history);
    if (entrant.past_performances) historyDoc.pastPerformances = JSON.stringify(entrant.past_performances);
    if (entrant.runner_win_history) historyDoc.runnerWinHistory = JSON.stringify(entrant.runner_win_history);
    if (entrant.video_channels_meta) historyDoc.videoChannelsMeta = JSON.stringify(entrant.video_channels_meta);
    
    // Import and update metadata
    historyDoc.lastUpdated = new Date().toISOString();
    historyDoc.dataSource = 'NZTAB';
    historyDoc.importedAt = new Date().toISOString();
    
    return historyDoc;
}