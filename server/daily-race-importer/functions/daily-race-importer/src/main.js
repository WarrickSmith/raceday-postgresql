import { Client, Databases } from 'node-appwrite';
import { ensureDatabaseSetup } from './database-setup.js';
export default async function main(context) {
    try {
        const endpoint = process.env['APPWRITE_ENDPOINT'];
        const projectId = process.env['APPWRITE_PROJECT_ID'];
        const apiKey = process.env['APPWRITE_API_KEY'];
        const nztabBaseUrl = process.env['NZTAB_API_BASE_URL'] || 'https://api.tab.co.nz';
        if (!endpoint || !projectId || !apiKey) {
            throw new Error('Missing required environment variables: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, or APPWRITE_API_KEY');
        }
        context.log('Daily race import function started', {
            timestamp: new Date().toISOString(),
            nztabBaseUrl
        });
        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId)
            .setKey(apiKey);
        const databases = new Databases(client);
        const databaseId = 'raceday-db';
        await ensureDatabaseSetup({
            endpoint,
            projectId,
            apiKey,
            databaseId
        }, context);
        const meetings = await fetchRacingData(nztabBaseUrl, context);
        const filteredMeetings = filterMeetings(meetings, context);
        const { meetingsProcessed, racesProcessed } = await processMeetingsAndRaces(databases, databaseId, filteredMeetings, context);
        context.log('Daily race import completed successfully', {
            timestamp: new Date().toISOString(),
            meetingsProcessed,
            racesProcessed,
            totalMeetingsFetched: meetings.length,
            filteredMeetings: filteredMeetings.length
        });
        return {
            success: true,
            message: `Successfully imported ${meetingsProcessed} meetings and ${racesProcessed} races`,
            statistics: {
                meetingsProcessed,
                racesProcessed,
                totalMeetingsFetched: meetings.length,
                filteredMeetings: filteredMeetings.length
            }
        };
    }
    catch (error) {
        context.error('Daily race import failed', {
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
    }
}
async function fetchRacingData(baseUrl, context) {
    try {
        const apiUrl = `${baseUrl}/affiliates/v1/racing/meetings`;
        context.log('Fetching racing data from NZTAB API', { apiUrl });
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'RaceDay-Daily-Importer/1.0.0',
                'From': 'ws@baybox.co.nz',
                'X-Partner': 'Warrick Smith',
                'X-Partner-ID': 'Private Developer'
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
function filterMeetings(meetings, context) {
    const allowedCountries = ['AUS', 'NZ'];
    const allowedCategories = ['Thoroughbred Horse Racing', 'Harness Horse Racing'];
    const filtered = meetings.filter(meeting => {
        if (!allowedCountries.includes(meeting.country)) {
            return false;
        }
        if (!allowedCategories.includes(meeting.category_name)) {
            return false;
        }
        return true;
    });
    context.log('Filtered meetings for AU/NZ Horse/Harness racing only', {
        originalCount: meetings.length,
        filteredCount: filtered.length,
        allowedCountries,
        allowedCategories
    });
    return filtered;
}
async function processMeetingsAndRaces(databases, databaseId, meetings, context) {
    let meetingsProcessed = 0;
    let racesProcessed = 0;
    const performantUpsert = async (collectionId, documentId, data, context) => {
        try {
            await databases.updateDocument(databaseId, collectionId, documentId, data);
            return true;
        }
        catch (error) {
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
    };
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
            const success = await performantUpsert('meetings', meeting.meeting, meetingDoc, context);
            if (success) {
                context.log('Upserted meeting', { meetingId: meeting.meeting, name: meeting.name });
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
                    ...(race.distance !== undefined && { distance: race.distance }),
                    ...(race.track_condition !== undefined && { trackCondition: race.track_condition }),
                    ...(race.weather !== undefined && { weather: race.weather }),
                    status: race.status,
                    meeting: meeting
                };
                const success = await performantUpsert('races', race.id, raceDoc, context);
                if (success) {
                    context.log('Upserted race', { raceId: race.id, name: race.name });
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
        const successfulRaces = batchResults.filter(result => result.success).length;
        racesProcessed += successfulRaces;
        context.log('Processed race batch', {
            batchNumber: Math.floor(i / batchSize) + 1,
            batchSize: batch.length,
            successful: successfulRaces,
            failed: batch.length - successfulRaces,
            totalProcessed: racesProcessed
        });
    }
    return { meetingsProcessed, racesProcessed };
}
