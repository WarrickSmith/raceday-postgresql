import { Client, Databases, Query } from 'node-appwrite';
import { fetchRaceEventData } from './api-client.js';
import { processDetailedRaces, processEntrants } from './database-utils.js';
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
            Query.orderAsc('startTime'),
            Query.limit(999) // Override default 25 limit to get all races
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
        
        // Process all races in chunks to prevent timeout, rather than limiting total races
        const totalRaces = racesResult.documents.length;
        const chunkSize = 10; // Smaller chunks for better reliability
        const totalChunks = Math.ceil(totalRaces / chunkSize);
        
        context.log(`Processing ALL ${totalRaces} races in ${totalChunks} chunks of ${chunkSize} races each`);
        
        let racesProcessed = 0;
        let entrantsProcessed = 0;
        const detailedRaces = [];
        
        // Process races in chunks sequentially to avoid overwhelming the API
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const startIndex = chunkIndex * chunkSize;
            const endIndex = Math.min(startIndex + chunkSize, totalRaces);
            const currentChunk = racesResult.documents.slice(startIndex, endIndex);
            
            context.log(`Processing chunk ${chunkIndex + 1}/${totalChunks} (races ${startIndex + 1}-${endIndex})`);
            
            // Process each race in the current chunk
            for (let i = 0; i < currentChunk.length; i++) {
                const basicRace = currentChunk[i];
                
                try {
                    context.log(`Fetching detailed data for race ${basicRace.raceId} (${startIndex + i + 1}/${totalRaces})`);
                
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
                    detailedData: raceEventData.race,
                    entrantsData: raceEventData.runners // Include entrants data for consolidated processing
                });
                
                context.log(`Successfully fetched detailed data for race ${basicRace.raceId}`, {
                    runnersFound: raceEventData.runners ? raceEventData.runners.length : 0
                });
                
                    // Rate limiting delay between races (within chunk)
                    if (i < currentChunk.length - 1) {
                        await rateLimit(1000, context, 'Between race processing');
                    }
                    
                } catch (error) {
                    handleError(error, `Fetching detailed data for race ${basicRace.raceId}`, context, {
                        raceId: basicRace.raceId,
                        raceIndex: startIndex + i + 1
                    });
                    // Continue with next race instead of failing completely
                }
            }
            
            // Rate limiting delay between chunks
            if (chunkIndex < totalChunks - 1) {
                await rateLimit(2000, context, 'Between chunk processing');
            }
        }
        
        // Process the detailed race data and entrants (consolidated approach)
        if (detailedRaces.length > 0) {
            context.log('Processing consolidated race and entrant data...');
            
            // Process detailed race data
            racesProcessed = await processDetailedRaces(databases, databaseId, detailedRaces, context);
            
            // Process entrants for each race
            for (const { basicRace, entrantsData } of detailedRaces) {
                if (entrantsData && entrantsData.length > 0) {
                    const raceEntrantsProcessed = await processEntrants(
                        databases,
                        databaseId,
                        basicRace.raceId,
                        entrantsData,
                        context
                    );
                    entrantsProcessed += raceEntrantsProcessed;
                }
            }
        }
        
        context.log('Daily races function completed', {
            timestamp: new Date().toISOString(),
            racesFound: racesResult.documents.length,
            racesProcessed,
            entrantsProcessed,
            detailedRacesFetched: detailedRaces.length
        });
        
        return {
            success: true,
            message: `Successfully enhanced ${racesProcessed} races and processed ${entrantsProcessed} entrants`,
            statistics: {
                racesFound: racesResult.documents.length,
                racesProcessed,
                entrantsProcessed,
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