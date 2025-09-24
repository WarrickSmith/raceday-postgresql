/**
 * Data processing utilities for race data filtering and transformation
 */

import { logDebug, logInfo, logWarn, logError } from './logging-utils.js';

function setIfDefined(target, key, value, transform) {
    if (value === undefined || value === null) {
        return;
    }
    target[key] = transform ? transform(value) : value;
}

function tryParseInteger(value) {
    const parsed = typeof value === 'string' ? parseInt(value, 10) : value;
    return Number.isFinite(parsed) ? parsed : undefined;
}

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
        raceId: race.id || race.event_id,
        name: race.name || race.description,
        raceNumber: race.race_number,
        startTime: race.start_time || race.advertised_start_string,
        status: race.status,
        meeting: meetingId,
        lastUpdated: new Date().toISOString(),
        importedAt: new Date().toISOString()
    };

    setIfDefined(raceDoc, 'actualStart', race.actual_start_string);
    setIfDefined(raceDoc, 'toteStartTime', race.tote_start_time);
    setIfDefined(raceDoc, 'startTimeNz', race.start_time_nz);
    setIfDefined(raceDoc, 'raceDateNz', race.race_date_nz);
    setIfDefined(raceDoc, 'distance', race.distance);
    setIfDefined(raceDoc, 'trackCondition', race.track_condition);
    setIfDefined(raceDoc, 'trackSurface', race.track_surface);
    setIfDefined(raceDoc, 'weather', race.weather);
    setIfDefined(raceDoc, 'type', race.type);
    setIfDefined(raceDoc, 'totalPrizeMoney', race.prize_monies?.total_value);
    setIfDefined(raceDoc, 'entrantCount', race.entrant_count);
    setIfDefined(raceDoc, 'fieldSize', race.field_size);
    setIfDefined(raceDoc, 'positionsPaid', race.positions_paid);
    setIfDefined(raceDoc, 'silkUrl', race.silk_url);
    setIfDefined(raceDoc, 'silkBaseUrl', race.silk_base_url);
    if (Array.isArray(race.video_channels) && race.video_channels.length > 0) {
        raceDoc.videoChannels = JSON.stringify(race.video_channels);
    }

    return raceDoc;
}

/**
 * Transform entrant data for daily entrants collection (frequently updated data)
 * @param {Object} entrant - Raw entrant data from NZTAB API
 * @param {string} raceId - Race ID this entrant belongs to
 * @returns {Object} Transformed daily entrant document
 */
export function transformDailyEntrantData(entrant, raceId) {
    const timestamp = new Date().toISOString();
    const entrantDoc = {
        entrantId: entrant.entrant_id,
        name: entrant.name,
        runnerNumber: entrant.runner_number,
        isScratched: entrant.is_scratched || false,
        race: raceId,
        raceId,
        lastUpdated: timestamp,
        importedAt: timestamp
    };

    setIfDefined(entrantDoc, 'barrier', entrant.barrier);
    if (entrant.is_late_scratched !== undefined) {
        entrantDoc.isLateScratched = entrant.is_late_scratched;
    }
    const scratchTime = tryParseInteger(entrant.scratch_time);
    if (scratchTime !== undefined) {
        entrantDoc.scratchTime = scratchTime;
    }
    setIfDefined(entrantDoc, 'runnerChange', entrant.runner_change);
    if (entrant.favourite !== undefined) entrantDoc.favourite = entrant.favourite;
    if (entrant.mover !== undefined) entrantDoc.mover = entrant.mover;
    setIfDefined(entrantDoc, 'jockey', entrant.jockey);
    setIfDefined(entrantDoc, 'trainerName', entrant.trainer_name);

    if (entrant.odds) {
        setIfDefined(entrantDoc, 'fixedWinOdds', entrant.odds.fixed_win);
        setIfDefined(entrantDoc, 'fixedPlaceOdds', entrant.odds.fixed_place);
        setIfDefined(entrantDoc, 'poolWinOdds', entrant.odds.pool_win);
        setIfDefined(entrantDoc, 'poolPlaceOdds', entrant.odds.pool_place);
    }

    if (entrant.silk_colours) {
        entrantDoc.silkColours = entrant.silk_colours;
    }
    setIfDefined(entrantDoc, 'silkUrl64', entrant.silk_url_64x64);
    setIfDefined(entrantDoc, 'silkUrl128', entrant.silk_url_128x128);

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