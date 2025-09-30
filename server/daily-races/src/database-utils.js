/**
 * Database utilities for Appwrite operations
 * Provides performant upsert patterns and error handling
 */

import { logDebug, logInfo, logWarn, logError } from './logging-utils.js';

function safeStringField(value, maxLength) {
    if (value === null || value === undefined) {
        return undefined;
    }

    let stringValue;
    if (typeof value === 'string') {
        stringValue = value;
    }
    else if (typeof value === 'object') {
        stringValue = JSON.stringify(value);
    }
    else {
        stringValue = String(value);
    }

    return stringValue.length > maxLength
        ? stringValue.substring(0, maxLength)
        : stringValue;
}

function tryParseInteger(value) {
    const parsed = typeof value === 'string' ? parseInt(value, 10) : value;
    return Number.isFinite(parsed) ? parsed : undefined;
}

function setIfDefined(target, key, value, transform) {
    if (value === undefined || value === null) {
        return;
    }
    target[key] = transform ? transform(value) : value;
}

function resolveValue(...candidates) {
    for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null) {
            return candidate;
        }
    }
    return undefined;
}

function hasScalarValue(value) {
    if (value === null || value === undefined) {
        return false;
    }

    if (typeof value === 'string') {
        return value.trim().length > 0;
    }

    return true;
}

function normalizeActualStart(actualStart) {
    if (actualStart === undefined || actualStart === null) {
        return undefined;
    }
    if (typeof actualStart === 'number') {
        return new Date(actualStart * 1000).toISOString();
    }
    return actualStart;
}

function buildMeetingDocument(meeting, timestamp = new Date().toISOString()) {
    const meetingDoc = {
        meetingId: meeting.meeting ?? meeting.meetingId ?? meeting.$id,
        meetingName: meeting.name ?? meeting.meetingName,
        country: meeting.country,
        status: 'active',
        lastUpdated: timestamp,
        dataSource: 'NZTAB'
    };

    setIfDefined(meetingDoc, 'state', meeting.state);
    setIfDefined(meetingDoc, 'raceType', resolveValue(meeting.category_name, meeting.raceType));
    setIfDefined(meetingDoc, 'category', meeting.category);
    setIfDefined(meetingDoc, 'categoryName', meeting.category_name ?? meeting.categoryName);
    setIfDefined(meetingDoc, 'date', meeting.date);
    setIfDefined(meetingDoc, 'trackCondition', meeting.track_condition ?? meeting.trackCondition);
    setIfDefined(meetingDoc, 'apiGeneratedTime', meeting.generated_time ?? meeting.apiGeneratedTime);

    return meetingDoc;
}

function buildRaceDocument(race, meetingData, timestamp = new Date().toISOString()) {
    // Extract meetingId - races collection uses relationship to meetings, not expanded objects
    const meetingId = meetingData?.meetingId || meetingData?.meeting || meetingData?.id || meetingData;

    const raceDoc = {
        raceId: resolveValue(race.id, race.raceId, race.$id),
        name: resolveValue(race.name, race.description),
        raceNumber: resolveValue(race.race_number, race.raceNumber),
        startTime: resolveValue(race.start_time, race.startTime),
        status: resolveValue(race.status, race.raceStatus),
        meeting: meetingId, // Store as relationship ID, not expanded object
        lastUpdated: timestamp,
        importedAt: timestamp
    };

    setIfDefined(raceDoc, 'actualStart', normalizeActualStart(resolveValue(race.actual_start, race.actualStart)));
    setIfDefined(raceDoc, 'toteStartTime', resolveValue(race.tote_start_time, race.toteStartTime));
    setIfDefined(raceDoc, 'startTimeNz', resolveValue(race.start_time_nz, race.startTimeNz));
    setIfDefined(raceDoc, 'raceDateNz', resolveValue(race.race_date_nz, race.raceDateNz));
    setIfDefined(raceDoc, 'distance', resolveValue(race.distance, race.raceDistance));
    setIfDefined(raceDoc, 'trackCondition', resolveValue(race.track_condition, race.trackCondition));
    setIfDefined(raceDoc, 'trackSurface', resolveValue(race.track_surface, race.trackSurface));
    setIfDefined(raceDoc, 'weather', resolveValue(race.weather, race.raceWeather));
    setIfDefined(raceDoc, 'type', resolveValue(race.type, race.raceType));

    const prizeMoneySource = resolveValue(race.prize_monies, race.prizeMonies);
    if (prizeMoneySource && typeof prizeMoneySource === 'object') {
        setIfDefined(raceDoc, 'totalPrizeMoney', prizeMoneySource.total_value ?? prizeMoneySource.totalPrizeMoney);
    }
    else {
        setIfDefined(raceDoc, 'totalPrizeMoney', resolveValue(race.total_prize_money, race.totalPrizeMoney));
    }

    setIfDefined(raceDoc, 'entrantCount', resolveValue(race.entrant_count, race.entrantCount));
    setIfDefined(raceDoc, 'fieldSize', resolveValue(race.field_size, race.fieldSize));
    setIfDefined(raceDoc, 'positionsPaid', resolveValue(race.positions_paid, race.positionsPaid));
    setIfDefined(raceDoc, 'silkUrl', resolveValue(race.silk_url, race.silkUrl));
    setIfDefined(raceDoc, 'silkBaseUrl', resolveValue(race.silk_base_url, race.silkBaseUrl));

    const videoChannels = resolveValue(race.video_channels, race.videoChannels);
    if (Array.isArray(videoChannels) && videoChannels.length > 0) {
        raceDoc.videoChannels = JSON.stringify(videoChannels);
    }

    return raceDoc;
}

function buildEntrantDocument(entrant, raceId, timestamp = new Date().toISOString()) {
    const entrantDoc = {
        entrantId: resolveValue(entrant.entrant_id, entrant.entrantId, entrant.$id),
        name: entrant.name,
        runnerNumber: resolveValue(entrant.runner_number, entrant.runnerNumber),
        isScratched: resolveValue(entrant.is_scratched, entrant.isScratched, false) || false,
        race: raceId,
        raceId,
        lastUpdated: timestamp,
        importedAt: timestamp
    };

    setIfDefined(entrantDoc, 'barrier', resolveValue(entrant.barrier, entrant.barrierNumber));

    const isLateScratched = resolveValue(entrant.is_late_scratched, entrant.isLateScratched);
    if (isLateScratched !== undefined) {
        entrantDoc.isLateScratched = isLateScratched;
    }

    const scratchTimeValue = tryParseInteger(resolveValue(entrant.scratch_time, entrant.scratchTime));
    if (scratchTimeValue !== undefined) {
        entrantDoc.scratchTime = scratchTimeValue;
    }

    const runnerChange = safeStringField(resolveValue(entrant.runner_change, entrant.runnerChange), 500);
    if (runnerChange !== undefined) {
        entrantDoc.runnerChange = runnerChange;
    }

    const favourite = resolveValue(entrant.favourite, entrant.isFavourite);
    if (favourite !== undefined) {
        entrantDoc.favourite = favourite;
    }

    const mover = resolveValue(entrant.mover, entrant.isMover);
    if (mover !== undefined) {
        entrantDoc.mover = mover;
    }

    const jockey = safeStringField(resolveValue(entrant.jockey, entrant.jockeyName), 255);
    if (jockey !== undefined) {
        entrantDoc.jockey = jockey;
    }

    const trainerName = safeStringField(resolveValue(entrant.trainer_name, entrant.trainerName), 255);
    if (trainerName !== undefined) {
        entrantDoc.trainerName = trainerName;
    }

    const odds = resolveValue(entrant.odds, entrant.fixedOdds);
    setIfDefined(entrantDoc, 'fixedWinOdds', resolveValue(entrant.fixedWinOdds, odds?.fixed_win));
    setIfDefined(entrantDoc, 'fixedPlaceOdds', resolveValue(entrant.fixedPlaceOdds, odds?.fixed_place));
    setIfDefined(entrantDoc, 'poolWinOdds', resolveValue(entrant.poolWinOdds, odds?.pool_win));
    setIfDefined(entrantDoc, 'poolPlaceOdds', resolveValue(entrant.poolPlaceOdds, odds?.pool_place));

    const silkColours = safeStringField(resolveValue(entrant.silk_colours, entrant.silkColours), 100);
    if (silkColours !== undefined) {
        entrantDoc.silkColours = silkColours;
    }

    setIfDefined(entrantDoc, 'silkUrl64', resolveValue(entrant.silk_url_64x64, entrant.silkUrl64));
    setIfDefined(entrantDoc, 'silkUrl128', resolveValue(entrant.silk_url_128x128, entrant.silkUrl128));

    return entrantDoc;
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
    if (collectionId === 'entrants') {
        if (!hasScalarValue(data?.entrantId) || !hasScalarValue(data?.raceId)) {
            context.error('Refusing to write entrant without scalar identifiers', {
                documentId,
                hasEntrantId: hasScalarValue(data?.entrantId),
                hasRaceId: hasScalarValue(data?.raceId)
            });
            return false;
        }
    }

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
            const meetingDoc = buildMeetingDocument(meeting);
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
            allRaces.push({ meeting: meeting, race }); // Pass full meeting object instead of just meeting.meeting ID
        });
    });
    
    const batchSize = 15;
    for (let i = 0; i < allRaces.length; i += batchSize) {
        const batch = allRaces.slice(i, i + batchSize);
        const racePromises = batch.map(async ({ meeting, race }) => {
            try {
                const raceDoc = buildRaceDocument(race, meeting);
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
            const entrantDoc = buildEntrantDocument(entrant, raceId);

            if (!hasScalarValue(entrantDoc.entrantId) || !hasScalarValue(entrantDoc.raceId)) {
                logWarn(context, 'Skipping entrant without scalar identifiers', {
                    entrantId: entrant.entrant_id,
                    derivedEntrantId: entrantDoc.entrantId,
                    derivedRaceId: entrantDoc.raceId,
                    raceId
                });
                continue;
            }

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
            const timestamp = new Date().toISOString();
            const combinedRaceData = {
                id: basicRace.raceId,
                name: detailedData.description || basicRace.name,
                race_number: basicRace.raceNumber,
                start_time: basicRace.startTime,
                status: detailedData.status || basicRace.status,
                actual_start: detailedData.actual_start ?? basicRace.actualStart,
                tote_start_time: detailedData.tote_start_time ?? basicRace.toteStartTime,
                start_time_nz: detailedData.start_time_nz ?? basicRace.startTimeNz,
                race_date_nz: detailedData.race_date_nz ?? basicRace.raceDateNz,
                distance: detailedData.distance ?? basicRace.distance,
                track_condition: detailedData.track_condition ?? basicRace.trackCondition,
                track_surface: detailedData.track_surface ?? basicRace.trackSurface,
                weather: detailedData.weather ?? basicRace.weather,
                type: detailedData.type ?? basicRace.type,
                prize_monies: detailedData.prize_monies ?? basicRace.prizeMonies,
                entrant_count: detailedData.entrant_count ?? basicRace.entrantCount,
                field_size: detailedData.field_size ?? basicRace.fieldSize,
                positions_paid: detailedData.positions_paid ?? basicRace.positionsPaid,
                silk_url: detailedData.silk_url ?? basicRace.silkUrl,
                silk_base_url: detailedData.silk_base_url ?? basicRace.silkBaseUrl,
                video_channels: detailedData.video_channels ?? basicRace.videoChannels
            };

            const enhancedRaceDoc = buildRaceDocument(combinedRaceData, basicRace.meeting, timestamp);

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