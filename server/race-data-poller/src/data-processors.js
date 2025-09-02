/**
 * Data processing utilities for race data filtering and transformation
 */

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
    
    context.log('Filtered meetings for AU/NZ Horse/Harness racing', {
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
        meeting: meetingId
    };
    
    // Add optional fields if present
    if (race.distance !== undefined) raceDoc.distance = race.distance;
    if (race.track_condition !== undefined) raceDoc.trackCondition = race.track_condition;
    if (race.weather !== undefined) raceDoc.weather = race.weather;
    
    // Add results data if present (for Interim or Final status races)
    if (race.results && Array.isArray(race.results) && race.results.length > 0) {
        raceDoc.resultsAvailable = true;
        raceDoc.resultsData = JSON.stringify(race.results);
        raceDoc.resultTime = new Date().toISOString();
        
        // Determine result status based on race status
        if (race.status === 'Final') {
            raceDoc.resultStatus = 'final';
        } else if (race.status === 'Interim') {
            raceDoc.resultStatus = 'interim';
        } else {
            raceDoc.resultStatus = 'interim'; // Default for races with results
        }
    }
    
    // Add dividends data if present
    if (race.dividends && Array.isArray(race.dividends) && race.dividends.length > 0) {
        raceDoc.dividendsData = JSON.stringify(race.dividends);
        
        // Extract flags from dividend data
        const dividendStatuses = race.dividends.map(d => d.status?.toLowerCase());
        raceDoc.photoFinish = dividendStatuses.includes('photo');
        raceDoc.stewardsInquiry = dividendStatuses.includes('inquiry');
        raceDoc.protestLodged = dividendStatuses.includes('protest');
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
    
    return entrantDoc;
}