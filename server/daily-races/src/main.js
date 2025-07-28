import { Client, Databases, Query } from 'node-appwrite';
import { fetchRaceEventData } from './api-client.js';
import { processDetailedRaces } from './database-utils.js';
import { validateEnvironmentVariables, executeApiCallWithTimeout, handleError, rateLimit } from './error-handlers.js';

export default async function main(context) {
    try {
        // Validate environment variables
        validateEnvironmentVariables(['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'], context);
        
        const endpoint = process.env['APPWRITE_ENDPOINT'];
        const projectId = process.env['APPWRITE_PROJECT_ID'];
        const apiKey = process.env['APPWRITE_API_KEY'];
        const nztabBaseUrl = process.env['NZTAB_API_BASE_URL'] || 'https://api.tab.co.nz';
        
        context.log('Daily races function started', {
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
        
        // Get today's date for filtering races (using NZ timezone)
        const nzDate = new Date().toLocaleDateString('en-CA', {
            timeZone: 'Pacific/Auckland',
        });
        
        // Get basic races from database (that were created by daily-meetings function)
        context.log('Fetching basic races from database for detailed enhancement...');
        const racesResult = await databases.listDocuments(databaseId, 'races', [
            Query.greaterThanEqual('startTime', nzDate),
            Query.orderAsc('startTime')
        ]);
        
        context.log(`Found ${racesResult.documents.length} races for detailed processing`);
        
        if (racesResult.documents.length === 0) {
            context.log('No races found for today');
            return {
                success: true,
                message: 'No races found to process for detailed enhancement',
                statistics: {
                    racesFound: 0,
                    racesProcessed: 0
                }
            };
        }
        
        // Limit processing to prevent timeout - process in chunks
        const maxRaces = Math.min(racesResult.documents.length, 25);
        const racesToProcess = racesResult.documents.slice(0, maxRaces);
        
        context.log(`Processing ${maxRaces} of ${racesResult.documents.length} races for detailed enhancement`);
        
        let racesProcessed = 0;
        const detailedRaces = [];
        
        // Process races sequentially to avoid overwhelming the API
        for (let i = 0; i < racesToProcess.length; i++) {
            const basicRace = racesToProcess[i];
            
            try {
                context.log(`Fetching detailed data for race ${basicRace.raceId} (${i + 1}/${maxRaces})`);
                
                // Fetch detailed race event data with timeout protection
                const raceEventData = await executeApiCallWithTimeout(
                    fetchRaceEventData,
                    [nztabBaseUrl, basicRace.raceId, context],
                    context,
                    15000, // 15-second timeout
                    0 // No retries for now
                );
                
                if (!raceEventData || !raceEventData.race) {
                    context.log(`No detailed race data found for race ${basicRace.raceId}`);
                    continue; // Skip to next race
                }
                
                // Add the enhanced race data to processing list
                detailedRaces.push({
                    basicRace,
                    detailedData: raceEventData.race
                });
                
                context.log(`Successfully fetched detailed data for race ${basicRace.raceId}`);
                
                // Rate limiting delay between races
                if (i < racesToProcess.length - 1) {
                    await rateLimit(1000, context, 'Between race processing');
                }
                
            } catch (error) {
                handleError(error, `Fetching detailed data for race ${basicRace.raceId}`, context, {
                    raceId: basicRace.raceId,
                    raceIndex: i + 1
                });
                // Continue with next race instead of failing completely
            }
        }
        
        // Process the detailed race data
        if (detailedRaces.length > 0) {
            racesProcessed = await processDetailedRaces(databases, databaseId, detailedRaces, context);
        }
        
        context.log('Daily races function completed', {
            timestamp: new Date().toISOString(),
            racesFound: racesResult.documents.length,
            racesProcessed,
            detailedRacesFetched: detailedRaces.length
        });
        
        return {
            success: true,
            message: `Successfully enhanced ${racesProcessed} races with detailed data`,
            statistics: {
                racesFound: racesResult.documents.length,
                racesProcessed,
                detailedRacesFetched: detailedRaces.length
            }
        };
    }
    catch (error) {
        handleError(error, 'Daily races function', context, {
            timestamp: new Date().toISOString()
        }, true);
    }
}