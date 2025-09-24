/**
 * Database utilities for Appwrite operations
 * Provides performant upsert patterns and error handling
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
 * Safely convert and truncate a field to string with max length
 * @param {any} value - The value to process
 * @param {number} maxLength - Maximum allowed length
 * @returns {string|undefined} Processed string or undefined if no value
 */
function safeStringField(value, maxLength) {
    if (value === null || value === undefined) {
        return undefined;
    }
    
    let stringValue;
    if (typeof value === 'string') {
        stringValue = value;
    } else if (typeof value === 'object') {
        stringValue = JSON.stringify(value);
    } else {
        stringValue = String(value);
    }
    
    return stringValue.length > maxLength ? stringValue.substring(0, maxLength) : stringValue;
}

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
        // Log the update error for debugging
        if (error && typeof error === 'object' && 'code' in error && error.code !== 404) {
            context.error(`Update failed for ${collectionId} document (non-404 error)`, {
                documentId,
                updateError: error instanceof Error ? error.message : 'Unknown error',
                errorCode: error.code
            });
        }
        
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
                meetingId: meeting.meeting,
                meetingName: meeting.name,
                country: meeting.country,
                raceType: meeting.category_name,
                date: meeting.date,
                status: 'active'
            };
            const success = await performantUpsert(databases, databaseId, 'meetings', meeting.meeting, meetingDoc, context);
            if (success) {
                logDebug(context, 'Upserted meeting', { meetingId: meeting.meeting, name: meeting.name });
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
                    raceId: race.id,
                    name: race.name,
                    raceNumber: race.race_number,
                    startTime: race.start_time,
                    status: race.status,
                    meeting: meeting,
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
                const success = await performantUpsert(databases, databaseId, 'races', race.id, raceDoc, context);
                if (success) {
                    logDebug(context, 'Upserted race', { raceId: race.id, name: race.name });
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
        
        logDebug(context, 'Processed race batch', {
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
 * Process entrants for a specific race with comprehensive runner data
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {string} raceId - Race ID
 * @param {Array} entrants - Array of entrant objects from NZTAB API
 * @param {Object} context - Appwrite function context for logging
 * @returns {number} Number of entrants processed
 */
export async function processEntrants(databases, databaseId, raceId, entrants, context) {
    let entrantsProcessed = 0;
    
    logDebug(context, `Processing ${entrants.length} entrants for race ${raceId} with comprehensive data`);
    
    // Process each entrant (runner) with comprehensive data
    for (const entrant of entrants) {
        try {
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
            setIfDefined(entrantDoc, 'runnerChange', safeStringField(entrant.runner_change, 500));
            if (entrant.favourite !== undefined) entrantDoc.favourite = entrant.favourite;
            if (entrant.mover !== undefined) entrantDoc.mover = entrant.mover;
            const jockey = safeStringField(entrant.jockey, 255);
            if (jockey) entrantDoc.jockey = jockey;
            const trainerName = safeStringField(entrant.trainer_name, 255);
            if (trainerName) entrantDoc.trainerName = trainerName;

            if (entrant.odds) {
                setIfDefined(entrantDoc, 'fixedWinOdds', entrant.odds.fixed_win);
                setIfDefined(entrantDoc, 'fixedPlaceOdds', entrant.odds.fixed_place);
                setIfDefined(entrantDoc, 'poolWinOdds', entrant.odds.pool_win);
                setIfDefined(entrantDoc, 'poolPlaceOdds', entrant.odds.pool_place);
            }

            if (entrant.silk_colours) {
                entrantDoc.silkColours = safeStringField(entrant.silk_colours, 100);
            }
            setIfDefined(entrantDoc, 'silkUrl64', entrant.silk_url_64x64);
            setIfDefined(entrantDoc, 'silkUrl128', entrant.silk_url_128x128);

            const success = await performantUpsert(databases, databaseId, 'entrants', entrant.entrant_id, entrantDoc, context);
            if (success) {
                entrantsProcessed++;
                logDebug(context, 'Upserted entrant data', {
                    entrantId: entrant.entrant_id,
                    name: entrant.name,
                    raceId: raceId,
                    fixedWinOdds: entrantDoc.fixedWinOdds,
                    isScratched: entrantDoc.isScratched
                });
            }
        } catch (error) {
            context.error('Failed to process entrant', {
                entrantId: entrant.entrant_id,
                entrantName: entrant.name || 'Unknown',
                raceId: raceId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            // Continue with next entrant
        }
    }
    
    logDebug(context, `Finished processing entrants for race ${raceId}: ${entrantsProcessed}/${entrants.length} successful`);
    return entrantsProcessed;
}

/**
 * Process races with detailed data from events API
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {Array} detailedRaces - Array of objects with basicRace and detailedData
 * @param {Object} context - Appwrite function context for logging
 * @returns {number} Number of races processed
 */
export async function processDetailedRaces(databases, databaseId, detailedRaces, context) {
    let racesProcessed = 0;
    
    // Process each race with detailed data
    for (const { basicRace, detailedData } of detailedRaces) {
        try {
            const enhancedRaceDoc = {
                raceId: basicRace.raceId,
                name: detailedData.description || basicRace.name,
                raceNumber: basicRace.raceNumber,
                startTime: basicRace.startTime,
                status: detailedData.status || basicRace.status,
                meeting: basicRace.meeting,
                lastUpdated: new Date().toISOString(),
                importedAt: new Date().toISOString()
            };

            if (detailedData.actual_start) {
                enhancedRaceDoc.actualStart = new Date(detailedData.actual_start * 1000).toISOString();
            }
            setIfDefined(enhancedRaceDoc, 'toteStartTime', detailedData.tote_start_time);
            setIfDefined(enhancedRaceDoc, 'startTimeNz', detailedData.start_time_nz);
            setIfDefined(enhancedRaceDoc, 'raceDateNz', detailedData.race_date_nz);
            setIfDefined(enhancedRaceDoc, 'distance', detailedData.distance);
            setIfDefined(enhancedRaceDoc, 'trackCondition', detailedData.track_condition);
            setIfDefined(enhancedRaceDoc, 'trackSurface', detailedData.track_surface);
            setIfDefined(enhancedRaceDoc, 'weather', detailedData.weather);
            setIfDefined(enhancedRaceDoc, 'type', detailedData.type);
            setIfDefined(enhancedRaceDoc, 'totalPrizeMoney', detailedData.prize_monies?.total_value);
            setIfDefined(enhancedRaceDoc, 'entrantCount', detailedData.entrant_count);
            setIfDefined(enhancedRaceDoc, 'fieldSize', detailedData.field_size);
            setIfDefined(enhancedRaceDoc, 'positionsPaid', detailedData.positions_paid);
            setIfDefined(enhancedRaceDoc, 'silkUrl', detailedData.silk_url);
            setIfDefined(enhancedRaceDoc, 'silkBaseUrl', detailedData.silk_base_url);
            if (Array.isArray(detailedData.video_channels) && detailedData.video_channels.length > 0) {
                enhancedRaceDoc.videoChannels = JSON.stringify(detailedData.video_channels);
            }

            const success = await performantUpsert(databases, databaseId, 'races', basicRace.raceId, enhancedRaceDoc, context);
            if (success) {
                racesProcessed++;
                logDebug(context, 'Enhanced race with detailed data', { 
                    raceId: basicRace.raceId, 
                    name: enhancedRaceDoc.name,
                    entrantCount: enhancedRaceDoc.entrantCount,
                    fieldSize: enhancedRaceDoc.fieldSize
                });
            }
        } catch (error) {
            context.error('Failed to process detailed race data', {
                raceId: basicRace.raceId,
                raceName: basicRace.name,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    
    return racesProcessed;
}