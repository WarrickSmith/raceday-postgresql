import { Client, Databases, Query } from 'node-appwrite';
import { fetchRaceEventData } from './api-client.js';
import { processEntrants } from './database-utils.js';
import { validateEnvironmentVariables, executeApiCallWithTimeout, handleError, rateLimit } from './error-handlers.js';

export default async function main(context) {
    try {
        // Validate environment variables
        validateEnvironmentVariables(['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'], context);
        
        const endpoint = process.env['APPWRITE_ENDPOINT'];
        const projectId = process.env['APPWRITE_PROJECT_ID'];
        const apiKey = process.env['APPWRITE_API_KEY'];
        const nztabBaseUrl = process.env['NZTAB_API_BASE_URL'] || 'https://api.tab.co.nz';
        
        context.log('Daily entrants function started', {
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
        
        // Get today's date for filtering races
        const todayISO = new Date().toISOString().split('T')[0];
        
        // Get races stored by daily-races function
        context.log('Fetching races from database...');
        const racesResult = await databases.listDocuments(databaseId, 'races', [
            Query.greaterThanEqual('startTime', todayISO),
            Query.orderAsc('startTime')
        ]);
        
        context.log(`Found ${racesResult.documents.length} races for today`);
        
        if (racesResult.documents.length === 0) {
            context.log('No races found for today');
            return {
                success: true,
                message: 'No races found to process entrants for',
                statistics: {
                    racesFound: 0,
                    entrantsProcessed: 0
                }
            };
        }
        
        // Limit to 20 races to prevent timeout
        const maxRaces = Math.min(racesResult.documents.length, 20);
        const racesToProcess = racesResult.documents.slice(0, maxRaces);
        
        context.log(`Processing ${maxRaces} of ${racesResult.documents.length} races to avoid timeout`);
        
        let entrantsProcessed = 0;
        
        // Process races sequentially (not in parallel) to avoid overwhelming the API
        for (let i = 0; i < racesToProcess.length; i++) {
            const race = racesToProcess[i];
            
            try {
                context.log(`Processing entrants for race ${race.raceId} (${i + 1}/${maxRaces})`);
                
                // Fetch race event data with timeout protection
                const raceEventData = await executeApiCallWithTimeout(
                    fetchRaceEventData,
                    [nztabBaseUrl, race.raceId, context],
                    context,
                    15000, // 15-second timeout
                    0 // No retries for now
                );
                
                if (!raceEventData || !raceEventData.entrants || raceEventData.entrants.length === 0) {
                    context.log(`No entrants data found for race ${race.raceId}`);
                    continue; // Skip to next race
                }
                
                // Process entrants for this race
                const raceEntrantsProcessed = await processEntrants(
                    databases,
                    databaseId,
                    race.raceId,
                    raceEventData.entrants,
                    context
                );
                
                entrantsProcessed += raceEntrantsProcessed;
                context.log(`Completed race ${race.raceId}: ${raceEntrantsProcessed} entrants processed`);
                
                // Rate limiting delay between races
                if (i < racesToProcess.length - 1) {
                    await rateLimit(1000, context, 'Between race processing');
                }
                
            } catch (error) {
                handleError(error, `Processing entrants for race ${race.raceId}`, context, {
                    raceId: race.raceId,
                    raceIndex: i + 1
                });
                // Continue with next race instead of failing completely
            }
        }
        
        context.log('Daily entrants function completed', {
            timestamp: new Date().toISOString(),
            racesFound: racesResult.documents.length,
            racesProcessed: racesToProcess.length,
            entrantsProcessed
        });
        
        return {
            success: true,
            message: `Successfully processed ${entrantsProcessed} entrants from ${racesToProcess.length} races`,
            statistics: {
                racesFound: racesResult.documents.length,
                racesProcessed: racesToProcess.length,
                entrantsProcessed
            }
        };
    }
    catch (error) {
        handleError(error, 'Daily entrants function', context, {
            timestamp: new Date().toISOString()
        }, true);
    }
}