import { ensureDatabaseSetup } from './database-setup.js';
import { validateEnvironmentVariables, handleError } from './error-handlers.js';
import { logDebug, logInfo, logWarn, logError, logFunctionStart, logFunctionComplete } from './logging-utils.js';

export default async function main(context) {
    try {
        // Validate environment variables
        validateEnvironmentVariables(['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'], context);

        const endpoint = process.env['APPWRITE_ENDPOINT'];
        const projectId = process.env['APPWRITE_PROJECT_ID'];
        const apiKey = process.env['APPWRITE_API_KEY'];
        const databaseId = 'raceday-db';

        logDebug(context,'Database setup function started', {
            timestamp: new Date().toISOString(),
            databaseId
        });

        // Execute database setup with comprehensive schema validation
        logDebug(context,'Starting comprehensive database setup...');
        await ensureDatabaseSetup({
            endpoint,
            projectId,
            apiKey,
            databaseId
        }, context);

        logDebug(context,'Database setup function completed successfully', {
            timestamp: new Date().toISOString(),
            databaseId
        });

        return {
            success: true,
            message: 'Database setup completed successfully',
            databaseId,
            timestamp: new Date().toISOString()
        };
    }
    catch (error) {
        handleError(error, 'Database setup function', context, {
            timestamp: new Date().toISOString()
        }, true);
    }
}