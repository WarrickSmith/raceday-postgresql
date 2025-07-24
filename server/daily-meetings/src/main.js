import { Client, Databases } from 'node-appwrite';
import { ensureDatabaseSetup } from './database-setup.js';
import { fetchRacingData } from './api-client.js';
import { filterMeetings } from './data-processors.js';
import { processMeetings } from './database-utils.js';
import { validateEnvironmentVariables, executeWithDatabaseSetupTimeout, handleError } from './error-handlers.js';

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
        
        // Database setup (with timeout protection)
        context.log('Starting database setup verification...');
        await executeWithDatabaseSetupTimeout(ensureDatabaseSetup, {
            endpoint,
            projectId,
            apiKey,
            databaseId
        }, context, 60000);
        
        // Fetch meetings data from NZ TAB API
        context.log('Fetching meetings data from NZ TAB API...');
        const meetings = await fetchRacingData(nztabBaseUrl, context);
        context.log(`Fetched ${meetings.length} meetings from API`);
        
        // Filter meetings for AU/NZ horse racing
        const filteredMeetings = filterMeetings(meetings, context);
        context.log(`Filtered to ${filteredMeetings.length} meetings for processing`);
        
        // Process meetings into database
        const { meetingsProcessed } = await processMeetings(databases, databaseId, filteredMeetings, context);
        
        context.log('Daily meetings function completed successfully', {
            timestamp: new Date().toISOString(),
            meetingsProcessed,
            totalMeetingsFetched: meetings.length,
            filteredMeetings: filteredMeetings.length
        });
        
        return {
            success: true,
            message: `Successfully imported ${meetingsProcessed} meetings`,
            statistics: {
                meetingsProcessed,
                totalMeetingsFetched: meetings.length,
                filteredMeetings: filteredMeetings.length
            }
        };
    }
    catch (error) {
        handleError(error, 'Daily meetings function', context, {
            timestamp: new Date().toISOString()
        }, true);
    }
}