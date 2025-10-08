/**
 * API Client for NZ TAB API integration
 * Handles race meetings, race events, and entrant data fetching
 */

import { logDebug, logInfo, logWarn, logError } from './logging-utils.js';

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
        logDebug(context, 'Fetching racing data from NZTAB API', {
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
        logDebug(context, 'Successfully fetched racing data from NZTAB API', {
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
        
        logDebug(context, 'Fetching race event data from NZTAB API', {
            apiUrl,
            raceId,
            timestamp: new Date().toISOString()
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
            context.error(`NZTAB API request failed for race ${raceId}`, {
                status: response.status,
                statusText: response.statusText,
                raceId
            });
            return null;
        }

        const data = await response.json();

        if (!data.data || !data.data.entrants) {
            logDebug(context, `No entrants data in API response for race ${raceId}`, {
                hasData: !!data.data,
                hasEntrants: !!(data.data && data.data.entrants),
                dataKeys: data.data ? Object.keys(data.data) : [],
                fullResponse: JSON.stringify(data, null, 2)
            });
            return null;
        }

        // Log response structure for debugging entrants issue
        const entrantsCount = data.data.entrants ? data.data.entrants.length : 0;
        const runnersCount = data.data.runners ? data.data.runners.length : 0;
        
        logDebug(context, 'Successfully fetched race event data from NZTAB API', {
            raceId,
            entrantsCount,
            runnersCount,
            raceStatus: data.data.race ? data.data.race.status : 'unknown',
            dataKeys: Object.keys(data.data),
            // Log response structure if no entrants
            responseStructure: entrantsCount === 0 ? {
                hasEntrants: !!data.data.entrants,
                hasRunners: !!data.data.runners,
                hasRace: !!data.data.race,
                entrantsType: typeof data.data.entrants,
                runnersType: typeof data.data.runners
            } : null
        });

        // If no entrants but has runners, use runners as entrants
        if (entrantsCount === 0 && runnersCount > 0) {
            logDebug(context, `Converting ${runnersCount} runners to entrants format`, { raceId });
            data.data.entrants = data.data.runners;
        }

        return data.data;

    } catch (error) {
        context.error('Failed to fetch race event data from NZTAB API', {
            raceId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return null;
    }
}