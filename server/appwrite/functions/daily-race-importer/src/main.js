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
        
        context.log('Re-enabling database setup to test...');
        
        // Add timeout protection to database setup
        const databaseSetupPromise = ensureDatabaseSetup({
            endpoint,
            projectId,
            apiKey,
            databaseId
        }, context);
        
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Database setup timeout after 60 seconds')), 60000)
        );
        
        try {
            await Promise.race([databaseSetupPromise, timeoutPromise]);
            context.log('Database setup completed, fetching racing data...');
        } catch (error) {
            context.error('Database setup failed or timed out', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            // Continue with the rest of the function even if database setup fails
            context.log('Continuing without database setup...');
        }
        
        const meetings = await fetchRacingData(nztabBaseUrl, context);
        context.log(`Fetched ${meetings.length} meetings, filtering...`);
        
        const filteredMeetings = filterMeetings(meetings, context);
        context.log(`Filtered to ${filteredMeetings.length} meetings, processing...`);
        
        const { meetingsProcessed, racesProcessed, raceIds } = await processMeetingsAndRaces(databases, databaseId, filteredMeetings, context);
        context.log(`Processed ${meetingsProcessed} meetings and ${racesProcessed} races`);
        
        // Process entrants for each race
        context.log('Starting entrant processing with race IDs', { 
            raceIds, 
            raceIdCount: raceIds.length 
        });
        
        // Re-enable entrant processing with fixed timeout logic
        const entrantsProcessed = await processRaceEntrants(databases, databaseId, nztabBaseUrl, raceIds, context);
        
        context.log('Daily race import completed successfully', {
            timestamp: new Date().toISOString(),
            meetingsProcessed,
            racesProcessed,
            entrantsProcessed,
            totalMeetingsFetched: meetings.length,
            filteredMeetings: filteredMeetings.length
        });
        return {
            success: true,
            message: `Successfully imported ${meetingsProcessed} meetings, ${racesProcessed} races, and ${entrantsProcessed} entrants`,
            statistics: {
                meetingsProcessed,
                racesProcessed,
                entrantsProcessed,
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
async function processMeetingsAndRaces(databases, databaseId, meetings, context) {
    let meetingsProcessed = 0;
    let racesProcessed = 0;
    const processedRaceIds = [];
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
        const successfulRaces = batchResults.filter(result => result.success);
        const successfulRaceIds = successfulRaces.map(result => result.raceId);
        processedRaceIds.push(...successfulRaceIds);
        racesProcessed += successfulRaces.length;
        context.log('Processed race batch', {
            batchNumber: Math.floor(i / batchSize) + 1,
            batchSize: batch.length,
            successful: successfulRaces.length,
            failed: batch.length - successfulRaces.length,
            totalProcessed: racesProcessed
        });
    }
    return { meetingsProcessed, racesProcessed, raceIds: processedRaceIds };
}

async function processRaceEntrants(databases, databaseId, nztabBaseUrl, raceIds, context) {
    let entrantsProcessed = 0;
    
    if (!raceIds || raceIds.length === 0) {
        context.log('No race IDs provided for entrant processing');
        return 0;
    }

    context.log('Starting entrant processing', { 
        totalRaces: raceIds.length 
    });

    const performantUpsert = async (collectionId, documentId, data, context) => {
        try {
            await databases.updateDocument(databaseId, collectionId, documentId, data);
            return true;
        } catch (error) {
            try {
                await databases.createDocument(databaseId, collectionId, documentId, data);
                return true;
            } catch (createError) {
                context.error(`Failed to create ${collectionId} document`, {
                    documentId,
                    error: createError instanceof Error ? createError.message : 'Unknown error'
                });
                return false;
            }
        }
    };

    // Process races one by one to match race-data-poller's approach
    const batchSize = 1; // Process one race at a time like race-data-poller
    
    // Limit total races to avoid timeout (71 races might exceed 5-minute limit)
    const maxRaces = Math.min(raceIds.length, 20); // Process max 20 races initially
    const racesToProcess = raceIds.slice(0, maxRaces);
    
    context.log(`Processing ${maxRaces} of ${raceIds.length} races to avoid timeout`);
    
    for (let i = 0; i < racesToProcess.length; i += batchSize) {
        const batch = racesToProcess.slice(i, i + batchSize);
        
        // Process each race in the batch sequentially 
        for (const raceId of batch) {
            try {
                context.log(`Processing entrants for race ${raceId} (${i + 1}/${maxRaces})`);
                
                // Fetch race event data with timeout
                const raceEventData = await Promise.race([
                    fetchRaceEventData(nztabBaseUrl, raceId, context),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error(`API timeout for race ${raceId}`)), 15000)
                    )
                ]);
                
                if (!raceEventData || !raceEventData.entrants || raceEventData.entrants.length === 0) {
                    context.log(`No entrants data found for race ${raceId}`, {
                        hasRaceEventData: !!raceEventData,
                        entrantsCount: raceEventData?.entrants?.length || 0,
                        runnersCount: raceEventData?.runners?.length || 0
                    });
                    continue; // Skip to next race
                }

                let raceEntrantsProcessed = 0;
                
                // Process each entrant
                for (const entrant of raceEventData.entrants) {
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

                    const success = await performantUpsert('entrants', entrant.entrant_id, entrantDoc, context);
                    if (success) {
                        raceEntrantsProcessed++;
                        context.log('Upserted entrant', { 
                            entrantId: entrant.entrant_id, 
                            name: entrant.name,
                            raceId: raceId
                        });
                    }
                }

                entrantsProcessed += raceEntrantsProcessed;
                context.log(`Completed race ${raceId}: ${raceEntrantsProcessed} entrants processed`);

            } catch (error) {
                context.error('Failed to process entrants for race', {
                    raceId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                // Continue with next race instead of failing completely
            }
        }

        context.log('Processed entrants batch', {
            batchNumber: Math.floor(i / batchSize) + 1,
            batchSize: batch.length,
            totalEntrantsProcessed: entrantsProcessed
        });

        // Add a delay between batches to be respectful to the API
        if (i + batchSize < raceIds.length) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    context.log('Entrant processing completed', {
        totalRaces: raceIds.length,
        entrantsProcessed
    });

    return entrantsProcessed;
}

async function fetchRaceEventData(baseUrl, raceId, context) {
    try {
        // Add parameters to get more complete race data including entrants
        const params = new URLSearchParams({
            'with_tote_trends_data': 'true'
        });
        const apiUrl = `${baseUrl}/affiliates/v1/racing/events/${raceId}?${params.toString()}`;
        
        context.log('Fetching race event data from NZTAB API', {
            apiUrl,
            raceId,
            timestamp: new Date().toISOString()
        });

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
            context.error(`NZTAB API request failed for race ${raceId}`, {
                status: response.status,
                statusText: response.statusText,
                raceId
            });
            return null;
        }

        const data = await response.json();

        if (!data.data || !data.data.entrants) {
            context.log(`No entrants data in API response for race ${raceId}`, {
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

        // If no entrants but has runners, use runners as entrants
        if (entrantsCount === 0 && runnersCount > 0) {
            context.log(`Converting ${runnersCount} runners to entrants format`, { raceId });
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
