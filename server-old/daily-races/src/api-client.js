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
function normalizeRaceStatus(raceStatus) {
    if (!raceStatus || typeof raceStatus !== 'string') {
        return null;
    }

    return raceStatus.trim().toLowerCase();
}

function buildRaceEventSearchParams(raceStatus) {
    const normalizedStatus = normalizeRaceStatus(raceStatus);
    const params = new URLSearchParams({
        'with_tote_trends_data': 'true',
        'with_money_tracker': 'true'
    });

    const includeLiveBetData = !normalizedStatus || ['open', 'interim'].includes(normalizedStatus);
    const includeWillPays = !normalizedStatus || !['final', 'finalized', 'abandoned'].includes(normalizedStatus);

    if (includeLiveBetData) {
        params.set('with_big_bets', 'true');
        params.set('with_biggest_bet', 'true');
        params.set('with_live_bets', 'true');
    }

    if (includeWillPays) {
        params.set('will_pays', 'true');
    }

    return {
        params,
        flags: {
            includeLiveBetData,
            includeWillPays,
            normalizedStatus: normalizedStatus || 'unknown'
        }
    };
}

export async function fetchRaceEventData(baseUrl, raceId, context, options = {}) {
    const { raceStatus } = options;

    try {
        // Add parameters to get comprehensive race data including entrants, form, and betting data
        const { params, flags } = buildRaceEventSearchParams(raceStatus);
        const apiUrl = `${baseUrl}/affiliates/v1/racing/events/${raceId}?${params.toString()}`;

        logDebug(context, 'Fetching detailed race event data from NZTAB API', {
            apiUrl,
            raceId,
            timestamp: new Date().toISOString(),
            raceStatus: flags.normalizedStatus,
            parameterFlags: flags
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
            logDebug(context, `No detailed race data in API response for race ${raceId}`, {
                hasData: !!data.data,
                hasRace: !!(data.data && data.data.race),
                dataKeys: data.data ? Object.keys(data.data) : []
            });
            return null;
        }

        logDebug(context, 'Successfully fetched detailed race event data from NZTAB API', {
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