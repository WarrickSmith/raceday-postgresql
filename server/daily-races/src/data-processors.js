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
 * Filter meetings for AU/NZ Horse/Harness racing only
 * @param {Array} meetings - Array of meeting objects
 * @param {Object} context - Appwrite function context for logging
 * @returns {Array} Filtered meetings array
 */
export function filterMeetings(meetings, context) {
    const allowedCountries = ['AUS', 'NZ'];
    const allowedCategories = ['Thoroughbred Horse Racing', 'Harness Horse Racing'];
    const countriesFound = [...new Set(meetings.map(meeting => meeting.country))];
    const categoriesFound = [...new Set(meetings.map(meeting => meeting.category_name))];
    
    const filtered = meetings.filter(meeting => {
        if (!allowedCountries.includes(meeting.country)) {
            return false;
        }
        if (!allowedCategories.includes(meeting.category_name)) {
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
        countriesFiltered: meetings.length - filtered.length > 0 ?
            `Filtered out: ${meetings.length - filtered.length} meetings` :
            'No filtering needed'
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
 * Transform race data for database storage
 * @param {Object} race - Raw race data
 * @param {string} meetingId - Meeting ID this race belongs to
 * @returns {Object} Transformed race document
 */
export function transformRaceData(race, meetingId) {
    const raceDoc = {
        raceId: race.id,
        name: race.name,
        raceNumber: race.race_number,
        startTime: race.start_time,
        status: race.status,
        meeting: meetingId,
        lastUpdated: new Date().toISOString(),
        importedAt: new Date().toISOString()
    };

    setIfDefined(raceDoc, 'actualStart', race.actual_start);
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
 * Transform entrant data for database storage
 * @param {Object} entrant - Raw entrant data
 * @param {string} raceId - Race ID this entrant belongs to
 * @returns {Object} Transformed entrant document
 */
export function transformEntrantData(entrant, raceId) {
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
        setIfDefined(entrantDoc, 'winOdds', entrant.odds.fixed_win);
        setIfDefined(entrantDoc, 'placeOdds', entrant.odds.fixed_place);
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