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
            Query.orderAsc('startTime'),
            Query.limit(999) // Override default 25 limit to get all races
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
        
        // Process all races in chunks to prevent timeout, rather than limiting total races
        const totalRaces = racesResult.documents.length;
        const chunkSize = 8; // Smaller chunks for entrants processing (more API intensive)
        const totalChunks = Math.ceil(totalRaces / chunkSize);
        
        context.log(`Processing ALL ${totalRaces} races in ${totalChunks} chunks of ${chunkSize} races each`);
        
        let entrantsProcessed = 0;
        
        // Process races in chunks sequentially to avoid overwhelming the API
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const startIndex = chunkIndex * chunkSize;
            const endIndex = Math.min(startIndex + chunkSize, totalRaces);
            const currentChunk = racesResult.documents.slice(startIndex, endIndex);
            
            context.log(`Processing chunk ${chunkIndex + 1}/${totalChunks} (races ${startIndex + 1}-${endIndex})`);
            
            // Process each race in the current chunk
            for (let i = 0; i < currentChunk.length; i++) {
                const race = currentChunk[i];
                
                try {
                    context.log(`Processing entrants for race ${race.raceId} (${startIndex + i + 1}/${totalRaces})`);
                
                // Fetch race event data with timeout protection
                const raceEventData = await executeApiCallWithTimeout(
                    fetchRaceEventData,
                    [nztabBaseUrl, race.raceId, context],
                    context,
                    15000, // 15-second timeout
                    0 // No retries for now
                );
                
                if (!raceEventData || !raceEventData.runners || raceEventData.runners.length === 0) {
                    context.log(`No runners data found for race ${race.raceId}`);
                    continue; // Skip to next race
                }
                
                // Process entrants for this race (runners array contains the entrant data)
                const raceEntrantsProcessed = await processEntrants(
                    databases,
                    databaseId,
                    race.raceId,
                    raceEventData.runners,
                    context
                );
                
                entrantsProcessed += raceEntrantsProcessed;
                context.log(`Completed race ${race.raceId}: ${raceEntrantsProcessed} entrants processed`);
                
                    // Rate limiting delay between races (within chunk)
                    if (i < currentChunk.length - 1) {
                        await rateLimit(1000, context, 'Between race processing');
                    }
                    
                } catch (error) {
                    handleError(error, `Processing entrants for race ${race.raceId}`, context, {
                        raceId: race.raceId,
                        raceIndex: startIndex + i + 1
                    });
                    // Continue with next race instead of failing completely
                }
            }
            
            // Rate limiting delay between chunks
            if (chunkIndex < totalChunks - 1) {
                await rateLimit(3000, context, 'Between chunk processing');
            }
        }
        
        context.log('Daily entrants function completed', {
            timestamp: new Date().toISOString(),
            racesFound: racesResult.documents.length,
            racesProcessed: totalRaces,
            entrantsProcessed
        });
        
        return {
            success: true,
            message: `Successfully processed ${entrantsProcessed} entrants from ${totalRaces} races`,
            statistics: {
                racesFound: racesResult.documents.length,
                racesProcessed: totalRaces,
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