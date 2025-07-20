import { Client, Databases } from 'appwrite';
export default async function main(context) {
    try {
        // Validate environment variables
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
        // Initialize Appwrite client
        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId);
        const databases = new Databases(client);
        const databaseId = 'raceday-db';
        // Fetch racing data from NZTAB API
        const meetings = await fetchRacingData(nztabBaseUrl, context);
        // Filter for AU/NZ Horse/Harness racing only
        const filteredMeetings = filterMeetings(meetings, context);
        // Process and store the data
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
        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];
        // Construct API URL for today's meetings
        const apiUrl = `${baseUrl}/affiliates/v1/racing/list?date_from=${today}&date_to=${today}`;
        context.log('Fetching racing data from NZTAB API', { apiUrl, date: today });
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'RaceDay-Daily-Importer/1.0.0'
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
    const allowedCountries = ['AUS', 'NZL'];
    const allowedCategories = ['Thoroughbred Horse Racing', 'Harness'];
    const filtered = meetings.filter(meeting => {
        // Filter by country (Australia and New Zealand only)
        if (!allowedCountries.includes(meeting.country)) {
            return false;
        }
        // Filter by race type (Horse and Harness only, exclude Greyhounds)
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
    for (const meeting of meetings) {
        try {
            // Upsert meeting document
            const meetingDoc = {
                meetingId: meeting.meeting,
                meetingName: meeting.name,
                country: meeting.country,
                raceType: meeting.category_name,
                date: meeting.date,
                status: 'active'
            };
            await upsertMeeting(databases, databaseId, meetingDoc, context);
            meetingsProcessed++;
            // Process races for this meeting
            for (const race of meeting.races) {
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
                        meeting: meeting.meeting
                    };
                    await upsertRace(databases, databaseId, raceDoc, context);
                    racesProcessed++;
                }
                catch (error) {
                    context.error('Failed to process race', {
                        raceId: race.id,
                        raceName: race.name,
                        meetingId: meeting.meeting,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
        }
        catch (error) {
            context.error('Failed to process meeting', {
                meetingId: meeting.meeting,
                meetingName: meeting.name,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    return { meetingsProcessed, racesProcessed };
}
async function upsertMeeting(databases, databaseId, meeting, context) {
    try {
        // Try to update existing meeting first
        await databases.updateDocument(databaseId, 'meetings', meeting.meetingId, meeting);
        context.log('Updated existing meeting', { meetingId: meeting.meetingId, name: meeting.meetingName });
    }
    catch (error) {
        // If update fails (document doesn't exist), create new meeting
        try {
            await databases.createDocument(databaseId, 'meetings', meeting.meetingId, meeting);
            context.log('Created new meeting', { meetingId: meeting.meetingId, name: meeting.meetingName });
        }
        catch (createError) {
            context.error('Failed to create meeting', {
                meetingId: meeting.meetingId,
                error: createError instanceof Error ? createError.message : 'Unknown error'
            });
            throw createError;
        }
    }
}
async function upsertRace(databases, databaseId, race, context) {
    try {
        // Try to update existing race first
        await databases.updateDocument(databaseId, 'races', race.raceId, race);
        context.log('Updated existing race', { raceId: race.raceId, name: race.name });
    }
    catch (error) {
        // If update fails (document doesn't exist), create new race
        try {
            await databases.createDocument(databaseId, 'races', race.raceId, race);
            context.log('Created new race', { raceId: race.raceId, name: race.name });
        }
        catch (createError) {
            context.error('Failed to create race', {
                raceId: race.raceId,
                error: createError instanceof Error ? createError.message : 'Unknown error'
            });
            throw createError;
        }
    }
}
//# sourceMappingURL=main.js.map