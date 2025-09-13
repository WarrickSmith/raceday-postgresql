import { Client, Databases } from 'node-appwrite';
import { fetchRacingData } from './api-client.js';
import { filterMeetings } from './data-processors.js';
import { processMeetings, processRaces } from './database-utils.js';
import { validateEnvironmentVariables, handleError } from './error-handlers.js';

export default async function main(context) {
    try {
        // Validate environment variables
        validateEnvironmentVariables(['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'], context);
        
        const endpoint = process.env['APPWRITE_ENDPOINT'];
        const projectId = process.env['APPWRITE_PROJECT_ID'];
        const apiKey = process.env['APPWRITE_API_KEY'];
        const nztabBaseUrl = process.env['NZTAB_API_BASE_URL'] || 'https://api.tab.co.nz';
        
        context.log('Daily meetings function started', {
            timestamp: new Date().toISOString(),
            nztabBaseUrl
        });
        
        // Initialize Appwrite client
        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId)
            .setKey(apiKey);
        const databases = new Databases(client);
        const databaseId = 'raceday-db';
        
        // Fetch meetings data from NZ TAB API
        context.log('Fetching meetings data from NZ TAB API...');
        const meetings = await fetchRacingData(nztabBaseUrl, context);
        context.log(`Fetched ${meetings.length} meetings from API`);
        
        // Filter meetings for AU/NZ horse racing
        const filteredMeetings = filterMeetings(meetings, context);
        context.log(`Filtered to ${filteredMeetings.length} meetings for processing`);
        
        // Process meetings into database
        const { meetingsProcessed } = await processMeetings(databases, databaseId, filteredMeetings, context);
        
        // Process races from the meetings data
        context.log('Processing races from meetings data...');
        const { racesProcessed, raceIds } = await processRaces(databases, databaseId, filteredMeetings, context);
        context.log(`Processed ${racesProcessed} races from ${filteredMeetings.length} meetings`);
        
        context.log('Daily meetings function completed successfully', {
            timestamp: new Date().toISOString(),
            meetingsProcessed,
            racesProcessed,
            totalMeetingsFetched: meetings.length,
            filteredMeetings: filteredMeetings.length,
            totalRaceIds: raceIds.length
        });
        
        return {
            success: true,
            message: `Successfully imported ${meetingsProcessed} meetings and ${racesProcessed} races`,
            statistics: {
                meetingsProcessed,
                racesProcessed,
                totalMeetingsFetched: meetings.length,
                filteredMeetings: filteredMeetings.length,
                raceIds: raceIds.length
            }
        };
    }
    catch (error) {
        handleError(error, 'Daily meetings function', context, {
            timestamp: new Date().toISOString()
        }, true);
    }
}