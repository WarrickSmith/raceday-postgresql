/**
 * API Client for NZ TAB API integration
 * Handles race meetings, race events, and entrant data fetching
 */

/**
 * Fetch racing data (meetings) from NZ TAB API
 * @param {string} baseUrl - Base URL for NZ TAB API
 * @param {Object} context - Appwrite function context for logging
 * @returns {Array} Array of meetings
 */
export async function fetchRacingData(baseUrl, context) {
    try {
        const nzDate = new Date().toLocaleDateString('en-CA', {
            timeZone: 'Pacific/Auckland',
        });
        const params = new URLSearchParams({
            date_from: nzDate,
            date_to: nzDate,
        });
        const apiUrl = `${baseUrl}/affiliates/v1/racing/meetings?${params.toString()}`;
        context.log('Fetching racing data from NZTAB API', {
            apiUrl,
            nzDate,
            timezone: 'Pacific/Auckland'
        });
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'RaceDay-Daily-Importer/2.0.0',
                'From': 'ws@baybox.co.nz',
                'X-Partner': 'Warrick Smith',
                'X-Partner-ID': 'Private-Developer'
            }
        });
        if (!response.ok) {
            throw new Error(`NZTAB API request failed: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (!data.data || !Array.isArray(data.data.meetings)) {
            throw new Error('Invalid API response format: missing meetings data');
        }
        context.log('Successfully fetched racing data from NZTAB API', {
            meetingsCount: data.data.meetings.length,
            generatedTime: data.header.generated_time
        });
        return data.data.meetings;
    }
    catch (error) {
        context.error('Failed to fetch racing data from NZTAB API', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
}

/**
 * Fetch detailed race event data for a specific race
 * @param {string} baseUrl - Base URL for NZ TAB API
 * @param {string} raceId - Race ID to fetch
 * @param {Object} context - Appwrite function context for logging
 * @returns {Object|null} Race event data or null on failure
 */
export async function fetchRaceEventData(baseUrl, raceId, context) {
    try {
        // Add parameters to get comprehensive race data including entrants, form, and betting data
        const params = new URLSearchParams({
            'with_tote_trends_data': 'true',
            'with_biggest_bet': 'true',
            'with_money_tracker': 'true',
            'will_pays': 'true'
        });
        const apiUrl = `${baseUrl}/affiliates/v1/racing/events/${raceId}?${params.toString()}`;
        
        context.log('Fetching detailed race event data from NZTAB API', {
            apiUrl,
            raceId,
            timestamp: new Date().toISOString()
        });

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'RaceDay-Daily-Races/2.1.0',
                'From': 'ws@baybox.co.nz',
                'X-Partner': 'Warrick Smith',
                'X-Partner-ID': 'Private-Developer'
            }
        });

        if (!response.ok) {
            context.error(`NZTAB API request failed for race ${raceId}`, {
                status: response.status,
                statusText: response.statusText,
                raceId
            });
            return null;
        }

        const data = await response.json();

        if (!data.data || !data.data.race) {
            context.log(`No detailed race data in API response for race ${raceId}`, {
                hasData: !!data.data,
                hasRace: !!(data.data && data.data.race),
                dataKeys: data.data ? Object.keys(data.data) : []
            });
            return null;
        }

        context.log('Successfully fetched detailed race event data from NZTAB API', {
            raceId,
            raceStatus: data.data.race.status,
            entrantCount: data.data.race.entrant_count || 0,
            fieldSize: data.data.race.field_size || 0,
            dataKeys: Object.keys(data.data)
        });

        return data.data;

    } catch (error) {
        context.error('Failed to fetch detailed race event data from NZTAB API', {
            raceId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return null;
    }
}