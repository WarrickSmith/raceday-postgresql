import { Client, Databases, Query, Functions } from 'node-appwrite';
import { validateEnvironmentVariables, handleError, rateLimit } from './error-handlers.js';

/**
 * Daily Initial Data Population - Scheduled function for racing day baseline data
 * 
 * Runs 30 minutes after daily-races (8:30 PM NZ time) to populate comprehensive
 * initial odds, money flow, and timeline data for all races.
 * 
 * This ensures:
 * - Story 4.9 timeline grids have baseline data from day start
 * - Faster user experience with pre-populated data
 * - Reduced load on real-time polling functions
 * 
 * Schedule: 30 20 * * * (8:30 PM NZ time daily)
 * Timeout: 840 seconds (14 minutes) to handle large racing days
 * Specification: s-2vcpu-2gb for intensive batch processing
 */
export default async function main(context) {
    const startTime = Date.now();
    
    try {
        // Validate environment variables
        validateEnvironmentVariables(['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'], context);
        
        const endpoint = process.env['APPWRITE_ENDPOINT'];
        const projectId = process.env['APPWRITE_PROJECT_ID'];
        const apiKey = process.env['APPWRITE_API_KEY'];
        
        context.log('🚀 Daily initial data population started', {
            timestamp: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        });
        
        // Initialize Appwrite clients
        const client = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId)
            .setKey(apiKey);
        const databases = new Databases(client);
        const functions = new Functions(client);
        const databaseId = 'raceday-db';
        
        // Get today's races that need initial data population
        const nzDate = new Date().toLocaleDateString('en-CA', {
            timeZone: 'Pacific/Auckland',
        });
        
        context.log('Fetching today\'s races for initial data population...', { nzDate });
        
        const racesResult = await databases.listDocuments(databaseId, 'races', [
            Query.greaterThanEqual('startTime', nzDate),
            Query.orderAsc('startTime'),
            Query.limit(999) // Get all races for the day
        ]);
        
        context.log(`Found ${racesResult.documents.length} races for initial data population`);
        
        if (racesResult.documents.length === 0) {
            context.log('No races found for today - initial data population not needed');
            return {
                success: true,
                message: 'No races found for initial data population',
                statistics: {
                    racesFound: 0,
                    batchesProcessed: 0,
                    totalExecutionTime: Date.now() - startTime
                }
            };
        }
        
        // Get race IDs for batch processing
        const raceIds = racesResult.documents.map(race => race.raceId);
        
        // Process in optimal batches for enhanced-race-poller (8 races per batch)
        const batchSize = 8;
        const batches = [];
        for (let i = 0; i < raceIds.length; i += batchSize) {
            batches.push(raceIds.slice(i, i + batchSize));
        }
        
        context.log(`Processing ${raceIds.length} races in ${batches.length} batch(es) for comprehensive initial data`, {
            batchSize,
            totalRaces: raceIds.length,
            estimatedTime: `${Math.ceil(batches.length * 1.5)} minutes`
        });
        
        let initialDataStats = {
            batchesProcessed: 0,
            successfulRaces: 0,
            failedRaces: 0,
            totalEntrantsProcessed: 0,
            totalMoneyFlowProcessed: 0,
            executionErrors: []
        };
        
        // Process each batch using enhanced-race-poller function
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const currentBatch = batches[batchIndex];
            
            context.log(`🎯 Processing initial data batch ${batchIndex + 1}/${batches.length}`, {
                raceIds: currentBatch,
                batchSize: currentBatch.length,
                progress: `${Math.round((batchIndex / batches.length) * 100)}%`
            });
            
            try {
                // Execute enhanced-race-poller function for comprehensive data
                const execution = await functions.createExecution(
                    'enhanced-race-poller',
                    JSON.stringify({ raceIds: currentBatch }),
                    false // synchronous execution
                );
                
                // Parse execution response
                let executionResult = {};
                try {
                    executionResult = JSON.parse(execution.responseBody || '{}');
                } catch (parseError) {
                    context.log('Could not parse batch execution response', {
                        batchIndex: batchIndex + 1,
                        executionId: execution.$id,
                        status: execution.status
                    });
                }
                
                // Extract statistics from execution result
                const batchSummary = executionResult.statistics || {};
                
                // Accumulate statistics
                initialDataStats.batchesProcessed++;
                initialDataStats.successfulRaces += batchSummary.successfulRaces || currentBatch.length;
                initialDataStats.totalEntrantsProcessed += batchSummary.totalEntrantsProcessed || 0;
                initialDataStats.totalMoneyFlowProcessed += batchSummary.totalMoneyFlowProcessed || 0;
                
                context.log(`✅ Completed initial data batch ${batchIndex + 1}/${batches.length}`, {
                    executionId: execution.$id,
                    executionStatus: execution.status,
                    executionTime: `${execution.duration}ms`,
                    batchSummary,
                    cumulativeStats: {
                        batchesCompleted: initialDataStats.batchesProcessed,
                        racesProcessed: initialDataStats.successfulRaces
                    }
                });
                
            } catch (batchError) {
                context.error(`❌ Failed to execute initial data batch ${batchIndex + 1}`, {
                    raceIds: currentBatch,
                    error: batchError instanceof Error ? batchError.message : 'Unknown error'
                });
                
                // Record error but continue processing
                initialDataStats.executionErrors.push({
                    batchIndex: batchIndex + 1,
                    raceIds: currentBatch,
                    error: batchError instanceof Error ? batchError.message : 'Unknown error'
                });
                
                // Count as failed races
                initialDataStats.failedRaces += currentBatch.length;
            }
            
            // Rate limit between batches to prevent API overwhelming
            if (batchIndex < batches.length - 1) {
                const delayMs = 3000; // 3 seconds between batches
                context.log(`Applying rate limit delay: ${delayMs}ms before next batch`);
                await rateLimit(delayMs, context, `Between initial data batches`);
            }
        }
        
        const totalExecutionTime = Date.now() - startTime;
        
        context.log('🎉 Daily initial data population completed', {
            timestamp: new Date().toISOString(),
            totalExecutionTime: `${Math.round(totalExecutionTime / 1000)}s`,
            ...initialDataStats
        });
        
        return {
            success: true,
            message: `Successfully populated initial data for ${initialDataStats.successfulRaces} races in ${initialDataStats.batchesProcessed} batches`,
            statistics: {
                racesFound: racesResult.documents.length,
                batchesProcessed: initialDataStats.batchesProcessed,
                successfulRaces: initialDataStats.successfulRaces,
                failedRaces: initialDataStats.failedRaces,
                totalEntrantsProcessed: initialDataStats.totalEntrantsProcessed,
                totalMoneyFlowProcessed: initialDataStats.totalMoneyFlowProcessed,
                executionErrors: initialDataStats.executionErrors.length,
                totalExecutionTime
            }
        };
        
    } catch (error) {
        const totalExecutionTime = Date.now() - startTime;
        
        handleError(error, 'Daily initial data population function', context, {
            totalExecutionTime,
            timestamp: new Date().toISOString()
        }, true);
        
        return {
            success: false,
            error: 'Daily initial data population failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            statistics: {
                totalExecutionTime
            }
        };
    }
}