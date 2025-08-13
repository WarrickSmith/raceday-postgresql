/**
 * API Client for NZ TAB API integration - Batch Race Poller
 * Optimized for processing multiple races efficiently with coordinated rate limiting
 */

import { rateLimit } from './error-handlers.js';

/**
 * Fetch detailed race event data for a specific race with coordinated rate limiting
 * @param {string} baseUrl - Base URL for NZ TAB API
 * @param {string} raceId - Race ID to fetch
 * @param {Object} context - Appwrite function context for logging
 * @param {number} delayMs - Optional delay for rate limiting coordination (default: 0)
 * @returns {Object|null} Race event data or null on failure
 */
export async function fetchRaceEventData(baseUrl, raceId, context, delayMs = 0) {
    try {
        // Apply coordinated rate limiting if specified
        if (delayMs > 0) {
            await rateLimit(delayMs, context, `Batch processing delay for race ${raceId}`);
        }

        // Add parameters to get comprehensive betting and market data
        const params = new URLSearchParams({
            'with_tote_trends_data': 'true',
            'with_big_bets': 'true',
            'with_live_bets': 'true',
            'with_money_tracker': 'true',
            'with_will_pays': 'true'
        });
        const apiUrl = `${baseUrl}/affiliates/v1/racing/events/${raceId}?${params.toString()}`;
        
        context.log('Fetching race event data from NZTAB API', {
            apiUrl,
            raceId,
            delayApplied: delayMs,
            timestamp: new Date().toISOString()
        });

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'RaceDay-Batch-Poller/1.0.0',
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

        if (!data.data) {
            context.log(`No data in API response for race ${raceId}`);
            return null;
        }

        // Log response structure for debugging entrants issue
        const entrantsCount = data.data.entrants ? data.data.entrants.length : 0;
        const runnersCount = data.data.runners ? data.data.runners.length : 0;
        
        context.log('Successfully fetched race event data from NZTAB API', {
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

        // Always ensure we have entrants data - convert runners if needed
        if (!data.data.entrants && data.data.runners && data.data.runners.length > 0) {
            context.log(`Converting ${runnersCount} runners to entrants format`, { raceId });
            data.data.entrants = data.data.runners;
        } else if (!data.data.entrants || data.data.entrants.length === 0) {
            context.log(`No entrants or runners data available for race ${raceId}`, {
                hasEntrants: !!data.data.entrants,
                hasRunners: !!data.data.runners,
                entrantsCount,
                runnersCount
            });
            return null;
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

/**
 * Batch fetch race event data for multiple races with optimized rate limiting
 * @param {string} baseUrl - Base URL for NZ TAB API
 * @param {Array} raceIds - Array of race IDs to fetch
 * @param {Object} context - Appwrite function context for logging
 * @param {number} batchDelayMs - Delay between API calls (default: 1000ms)
 * @returns {Array} Array of objects with {raceId, data, success}
 */
export async function batchFetchRaceEventData(baseUrl, raceIds, context, batchDelayMs = 1000) {
    const results = [];
    
    context.log('Starting batch race event data fetch', {
        raceCount: raceIds.length,
        batchDelayMs,
        raceIds: raceIds.slice(0, 5) // Log first 5 race IDs for reference
    });

    for (let i = 0; i < raceIds.length; i++) {
        const raceId = raceIds[i];
        const isFirst = i === 0;
        const delayMs = isFirst ? 0 : batchDelayMs; // No delay for first request
        
        context.log(`Processing race ${i + 1}/${raceIds.length}`, { 
            raceId, 
            delayMs,
            position: `${i + 1}/${raceIds.length}`
        });

        const data = await fetchRaceEventData(baseUrl, raceId, context, delayMs);
        
        results.push({
            raceId,
            data,
            success: data !== null,
            processedAt: new Date().toISOString()
        });

        // Log progress
        context.log(`Completed race ${i + 1}/${raceIds.length}`, {
            raceId,
            success: data !== null,
            remainingRaces: raceIds.length - i - 1
        });
    }

    const successCount = results.filter(r => r.success).length;
    context.log('Batch race event data fetch completed', {
        totalRaces: raceIds.length,
        successfulFetches: successCount,
        failedFetches: raceIds.length - successCount,
        successRate: `${Math.round((successCount / raceIds.length) * 100)}%`
    });

    return results;
}