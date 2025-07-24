import { Client, Databases, Query } from 'node-appwrite';
import { processRaces } from './database-utils.js';
import { validateEnvironmentVariables, handleError } from './error-handlers.js';

export default async function main(context) {
    try {
        // Validate environment variables
        validateEnvironmentVariables(['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'], context);
        
        const endpoint = process.env['APPWRITE_ENDPOINT'];
        const projectId = process.env['APPWRITE_PROJECT_ID'];
        const apiKey = process.env['APPWRITE_API_KEY'];
        
        context.log('Daily races function started', {
            timestamp: new Date().toISOString()
        });
        
        // Initialize Appwrite client
        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId)
            .setKey(apiKey);
        const databases = new Databases(client);
        const databaseId = 'raceday-db';
        
        // Get today's date for filtering meetings
        const todayISO = new Date().toISOString().split('T')[0];
        
        // Get meetings stored by daily-meetings function
        context.log('Fetching meetings from database...');
        const meetingsResult = await databases.listDocuments(databaseId, 'meetings', [
            Query.greaterThanEqual('date', todayISO),
            Query.equal('status', 'active')
        ]);
        
        context.log(`Found ${meetingsResult.documents.length} active meetings for today`);
        
        if (meetingsResult.documents.length === 0) {
            context.log('No meetings found for today');
            return {
                success: true,
                message: 'No meetings found to process races for',
                statistics: {
                    meetingsFound: 0,
                    racesProcessed: 0
                }
            };
        }
        
        // Transform meetings data to match the format expected by processRaces
        const meetings = meetingsResult.documents.map(meeting => ({
            meeting: meeting.meetingId,
            races: [] // Will be populated when we fetch meeting details
        }));
        
        // Note: In a real implementation, we would need to fetch race details 
        // from the NZ TAB API for each meeting. For now, we'll return a placeholder
        // since the full race details fetching logic needs to be implemented.
        
        context.log('Daily races function completed', {
            timestamp: new Date().toISOString(),
            meetingsFound: meetingsResult.documents.length,
            racesProcessed: 0 // Placeholder until full implementation
        });
        
        return {
            success: true,
            message: `Found ${meetingsResult.documents.length} meetings for race processing`,
            statistics: {
                meetingsFound: meetingsResult.documents.length,
                racesProcessed: 0 // Placeholder until full implementation
            }
        };
    }
    catch (error) {
        handleError(error, 'Daily races function', context, {
            timestamp: new Date().toISOString()
        }, true);
    }
}