/**
 * Enhanced API Client for NZ TAB API integration
 * Consolidated from race-data-poller, single-race-poller, and batch-race-poller
 * Provides unified race data fetching with enhanced timeout handling and batch optimization
 */

import { logDebug, logInfo, logWarn, logError } from './logging-utils.js';

/**
 * Fetch detailed race event data for a specific race with enhanced error handling
 * @param {string} baseUrl - Base URL for NZ TAB API
 * @param {string} raceId - Race ID to fetch
 * @param {Object} context - Appwrite function context for logging
 * @param {number} timeoutMs - Timeout in milliseconds (default: 15000)
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
        params.set('with_live_bets', 'true');
    }

    if (includeWillPays) {
        params.set('with_will_pays', 'true');
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
    const { timeoutMs = 15000, raceStatus } = options;

    try {
        // Add comprehensive parameters to get all betting and market data
        const { params, flags } = buildRaceEventSearchParams(raceStatus);
        const apiUrl = `${baseUrl}/affiliates/v1/racing/events/${raceId}?${params.toString()}`;

        logDebug(context, 'Fetching race event data from NZTAB API', {
            apiUrl,
            raceId,
            timeoutMs,
            timestamp: new Date().toISOString(),
            raceStatus: flags.normalizedStatus,
            parameterFlags: flags
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'RaceDay-Enhanced-Poller/1.0.0',
                    'From': 'ws@baybox.co.nz',
                    'X-Partner': 'Warrick Smith',
                    'X-Partner-ID': 'Private-Developer'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

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
                logDebug(context, `No data in API response for race ${raceId}`);
                return null;
            }

            // Enhanced response validation and logging
            const entrantsCount = data.data.entrants ? data.data.entrants.length : 0;
            const runnersCount = data.data.runners ? data.data.runners.length : 0;
            const hasTotePools = data.data.tote_pools && Array.isArray(data.data.tote_pools);
            const hasMoneyTracker = data.data.money_tracker && data.data.money_tracker.entrants;
            
            logDebug(context, 'Successfully fetched race event data from NZTAB API', {
                raceId,
                entrantsCount,
                runnersCount,
                hasTotePools,
                hasMoneyTracker,
                totePoolsCount: hasTotePools ? data.data.tote_pools.length : 0,
                moneyTrackerEntrants: hasMoneyTracker ? data.data.money_tracker.entrants.length : 0,
                raceStatus: data.data.race ? data.data.race.status : 'unknown',
                dataKeys: Object.keys(data.data),
                responseSize: JSON.stringify(data.data).length
            });

            // Ensure entrants data is available - convert runners if needed
            if (!data.data.entrants && data.data.runners && data.data.runners.length > 0) {
                logDebug(context, `Converting ${runnersCount} runners to entrants format`, { raceId });
                data.data.entrants = data.data.runners;
            } else if (!data.data.entrants || data.data.entrants.length === 0) {
                logDebug(context, `No entrants or runners data available for race ${raceId}`, {
                    hasEntrants: !!data.data.entrants,
                    hasRunners: !!data.data.runners,
                    entrantsCount,
                    runnersCount
                });
                return null;
            }

            return data.data;

        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                context.error(`NZTAB API request timeout for race ${raceId}`, {
                    timeoutMs,
                    raceId
                });
            } else {
                throw fetchError;
            }
            return null;
        }

    } catch (error) {
        context.error('Failed to fetch race event data from NZTAB API', {
            raceId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
        return null;
    }
}

/**
 * Enhanced batch fetch for multiple race events with coordinated rate limiting
 * @param {string} baseUrl - Base URL for NZ TAB API
 * @param {Array<string|{raceId: string, raceStatus?: string, status?: string}>} raceIds - Array of race identifiers or descriptors
 * @param {Object} context - Appwrite function context for logging
 * @param {number} delayBetweenCalls - Delay between API calls in milliseconds (default: 1000)
 * @param {number} timeoutPerCall - Timeout per individual call in milliseconds (default: 12000)
 * @returns {Map} Map of raceId -> race data (or null for failures)
 */
export async function batchFetchRaceEventData(baseUrl, raceIds, context, delayBetweenCalls = 1000, timeoutPerCall = 12000) {
    const normalizedRequests = Array.isArray(raceIds)
        ? raceIds.map(request => {
            if (typeof request === 'string') {
                return { raceId: request, raceStatus: null };
            }

            if (request && typeof request === 'object') {
                return {
                    raceId: request.raceId,
                    raceStatus: request.raceStatus ?? request.status ?? null
                };
            }

            return { raceId: String(request), raceStatus: null };
        })
        : [];

    const results = new Map();
    const startTime = Date.now();

    logDebug(context, 'Starting batch race data fetch', {
        raceCount: normalizedRequests.length,
        delayBetweenCalls,
        timeoutPerCall,
        estimatedDurationMs: normalizedRequests.length * (timeoutPerCall + delayBetweenCalls)
    });

    for (let i = 0; i < normalizedRequests.length; i++) {
        const { raceId, raceStatus } = normalizedRequests[i];
        const callStartTime = Date.now();

        try {
            logDebug(context, `Fetching race ${i + 1}/${normalizedRequests.length}: ${raceId}`, {
                raceStatus: normalizeRaceStatus(raceStatus) || 'unknown'
            });

            const raceData = await fetchRaceEventData(baseUrl, raceId, context, {
                timeoutMs: timeoutPerCall,
                raceStatus
            });
            results.set(raceId, raceData);

            const callDuration = Date.now() - callStartTime;
            logDebug(context, `Completed race ${i + 1}/${normalizedRequests.length}`, {
                raceId,
                success: !!raceData,
                callDurationMs: callDuration
            });

            // Rate limiting between calls (except for the last call)
            if (i < normalizedRequests.length - 1) {
                logDebug(context, `Rate limiting: waiting ${delayBetweenCalls}ms before next call`);
                await new Promise(resolve => setTimeout(resolve, delayBetweenCalls));
            }

        } catch (error) {
            context.error(`Failed to fetch race ${i + 1}/${normalizedRequests.length}`, {
                raceId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            results.set(raceId, null);

            // Continue with rate limiting even on failure
            if (i < normalizedRequests.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenCalls));
            }
        }
    }

    const totalDuration = Date.now() - startTime;
    const successCount = Array.from(results.values()).filter(data => data !== null).length;

    logDebug(context, 'Batch race data fetch completed', {
        totalRaces: normalizedRequests.length,
        successfulRaces: successCount,
        failedRaces: normalizedRequests.length - successCount,
        totalDurationMs: totalDuration,
        averageCallDurationMs: normalizedRequests.length > 0
            ? Math.round(totalDuration / normalizedRequests.length)
            : 0
    });

    return results;
}

/**
 * Fetch racing data (meetings) from NZ TAB API for a specific date
 * @param {string} baseUrl - Base URL for NZ TAB API
 * @param {Object} context - Appwrite function context for logging
 * @param {string} targetDate - Target date in YYYY-MM-DD format (optional, defaults to today NZ time)
 * @returns {Array} Array of meetings
 */
export async function fetchRacingData(baseUrl, context, targetDate = null) {
    try {
        const nzDate = targetDate || new Date().toLocaleDateString('en-CA', {
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
                'User-Agent': 'RaceDay-Enhanced-Poller/1.0.0',
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
        
    } catch (error) {
        context.error('Failed to fetch racing data from NZTAB API', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
}