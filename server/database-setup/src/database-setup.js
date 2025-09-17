/**
 * Enhanced Database Setup for Raceday Application
 *
 * Features:
 * - Exponential backoff retry logic with circuit breaker protection
 * - Progress tracking and resumable operations
 * - Rollback capability for failed setups
 * - Comprehensive validation and health checks
 * - Rate limiting awareness and batch size optimization
 * - Schema version tracking and migration support
 *
 * Performance Optimization: Attribute creation operations use optimized parallel execution
 * with intelligent error isolation and adaptive batching based on Appwrite API limits.
 */
import { Client, Databases, Permission, Role, RelationshipType, IndexType, ID } from 'node-appwrite';
import { logDebug, logInfo, logWarn, logError } from './logging-utils.js';
import {
    retryWithExponentialBackoff,
    CircuitBreaker,
    processBatch,
    handleError,
    withTimeout,
    rateLimit
} from './error-handlers.js';
import {
    validatePreSetup,
    validatePostSetup,
    performHealthCheck,
    updateSchemaVersion,
    SCHEMA_VERSION
} from './validation.js';
const collections = {
    meetings: 'meetings',
    races: 'races',
    raceResults: 'race-results',
    entrants: 'entrants',
    oddsHistory: 'odds-history',
    moneyFlowHistory: 'money-flow-history',
    racePools: 'race-pools',
    userAlertConfigs: 'user-alert-configs',
    notifications: 'notifications',
    functionLocks: 'function-locks',
};

// Progress tracking collection for resumable operations
const PROGRESS_COLLECTION = 'database-setup-progress';
const ROLLBACK_COLLECTION = 'database-setup-rollback';

// Setup states for progress tracking
const SETUP_STATES = {
    NOT_STARTED: 'not_started',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    ROLLED_BACK: 'rolled_back'
};

// Circuit breakers for different operation types
const circuitBreakers = {
    database: new CircuitBreaker('database_operations', { failureThreshold: 3, resetTimeout: 30000 }),
    collection: new CircuitBreaker('collection_operations', { failureThreshold: 5, resetTimeout: 60000 }),
    attribute: new CircuitBreaker('attribute_operations', { failureThreshold: 10, resetTimeout: 30000 }),
    index: new CircuitBreaker('index_operations', { failureThreshold: 5, resetTimeout: 45000 })
};
const resourceExists = async (checkFn) => {
    try {
        await checkFn();
        return true;
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
            return false;
        }
        throw error;
    }
};
const attributeExists = async (databases, databaseId, collectionId, attributeKey) => {
    try {
        const collection = await databases.getCollection(databaseId, collectionId);
        const attribute = collection.attributes.find((attr) => attr.key === attributeKey);
        return !!attribute;
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
            return false;
        }
        throw error;
    }
};
const isAttributeAvailable = async (databases, databaseId, collectionId, attributeKey) => {
    try {
        const collection = await databases.getCollection(databaseId, collectionId);
        const attribute = collection.attributes.find((attr) => attr.key === attributeKey);
        return attribute?.status === 'available';
    }
    catch {
        return false;
    }
};
/**
 * Create multiple attributes with enhanced parallel processing and error isolation
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {string} collectionId - Collection ID
 * @param {Array} attributes - Array of attribute objects to create
 * @param {Object} context - Appwrite function context for logging
 * @param {Object} rollbackManager - Rollback manager for cleanup
 * @returns {Promise<Object>} Detailed creation results
 */
const createAttributesInParallel = async (databases, databaseId, collectionId, attributes, context, rollbackManager = null) => {
    // Filter out attributes that already exist
    const attributesToCreate = [];
    for (const attr of attributes) {
        if (!(await attributeExists(databases, databaseId, collectionId, attr.key))) {
            attributesToCreate.push(attr);
        }
    }

    if (attributesToCreate.length === 0) {
        logDebug(context, 'All attributes already exist, skipping creation');
        return {
            successful: 0,
            failed: 0,
            total: 0,
            results: [],
            duration: 0,
            successRate: 100.0
        };
    }

    logDebug(context, `Creating ${attributesToCreate.length} attributes with enhanced parallel processing for collection ${collectionId}`);

    // Determine optimal batch size based on attribute count and API limits
    const optimalBatchSize = Math.min(Math.max(Math.floor(attributesToCreate.length / 3), 5), 15);

    // Use batch processing with retry logic and error isolation
    const batchResults = await processBatch(
        attributesToCreate,
        async (attr, index) => {
            return await circuitBreakers.attribute.execute(async () => {
                return await retryWithExponentialBackoff(
                    () => createSingleAttribute(databases, databaseId, collectionId, attr, context),
                    {
                        maxRetries: 2,
                        baseDelay: 1000,
                        maxDelay: 5000,
                        timeoutMs: 30000
                    },
                    context
                );
            }, context);
        },
        {
            batchSize: optimalBatchSize,
            parallel: true,
            stopOnFirstError: false,
            retryOptions: {}
        },
        context
    );

    // Record successful attributes for rollback if needed
    if (rollbackManager) {
        try {
            const successfulAttributes = batchResults.results
                .filter(result => result.success)
                .map(result => result.item.key);

            if (successfulAttributes.length > 0) {
                await rollbackManager.addRollbackAction('delete_attributes', {
                    collectionId,
                    attributes: successfulAttributes
                });
            }
        } catch (rollbackError) {
            context.error('Failed to record rollback actions for attributes, continuing setup', {
                error: rollbackError.message,
                collectionId
            });
        }
    }

    // Safe logging for batch results
    const successful = batchResults?.successful || 0;
    const failed = batchResults?.failed || 0;
    const successRate = batchResults?.successRate != null ? batchResults.successRate : 100.0;
    const duration = batchResults?.duration || 0;

    logDebug(context, `Attribute creation completed for ${collectionId}`, {
        successful,
        failed,
        total: attributesToCreate.length,
        successRate: `${successRate.toFixed(1)}%`,
        duration
    });

    return {
        successful,
        failed,
        total: attributesToCreate.length,
        results: batchResults?.results || [],
        duration,
        successRate
    };
};

/**
 * Create a single attribute with proper error handling
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {string} collectionId - Collection ID
 * @param {Object} attr - Attribute definition
 * @param {Object} context - Appwrite function context
 * @returns {Promise<string>} Created attribute key
 */
async function createSingleAttribute(databases, databaseId, collectionId, attr, context) {
    logDebug(context, `Creating attribute: ${attr.key} (${attr.type}) in ${collectionId}`);

    try {
        switch (attr.type) {
            case 'string':
                await databases.createStringAttribute(
                    databaseId,
                    collectionId,
                    attr.key,
                    attr.size,
                    attr.required,
                    attr.default
                );
                break;

            case 'datetime':
                await databases.createDatetimeAttribute(
                    databaseId,
                    collectionId,
                    attr.key,
                    attr.required,
                    attr.default
                );
                break;

            case 'float':
                await databases.createFloatAttribute(
                    databaseId,
                    collectionId,
                    attr.key,
                    attr.required,
                    null,
                    null,
                    attr.default
                );
                break;

            case 'integer':
                await databases.createIntegerAttribute(
                    databaseId,
                    collectionId,
                    attr.key,
                    attr.required,
                    null,
                    null,
                    attr.default
                );
                break;

            case 'boolean':
                await databases.createBooleanAttribute(
                    databaseId,
                    collectionId,
                    attr.key,
                    attr.required,
                    attr.default
                );
                break;

            default:
                throw new Error(`Unsupported attribute type: ${attr.type}`);
        }

        logDebug(context, `✓ Successfully created attribute: ${attr.key}`);
        return attr.key;

    } catch (error) {
        context.error(`✗ Failed to create attribute ${attr.key}`, {
            error: error.message,
            attributeType: attr.type,
            collectionId
        });
        throw error;
    }
}

/**
 * Enhanced attribute availability checker with exponential backoff
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {string} collectionId - Collection ID
 * @param {string} attributeKey - Attribute key to check
 * @param {Object} context - Appwrite function context
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise<boolean>} Whether attribute is available
 */
const waitForAttributeAvailable = async (databases, databaseId, collectionId, attributeKey, context, maxRetries = 8, baseDelay = 3000) => {
    logDebug(context, `Waiting for attribute ${attributeKey} to become available...`);

    const result = await retryWithExponentialBackoff(
        async () => {
            const isAvailable = await isAttributeAvailable(databases, databaseId, collectionId, attributeKey);
            if (!isAvailable) {
                throw new Error(`Attribute ${attributeKey} not yet available`);
            }
            return true;
        },
        {
            maxRetries,
            baseDelay,
            maxDelay: 45000,
            timeoutMs: 15000 // Increased timeout to 15 seconds
        },
        context
    );

    if (result === null) {
        context.error(`Attribute ${attributeKey} failed to become available, but continuing setup`, {
            attributeKey,
            collectionId,
            maxRetries,
            timeoutMs: 15000
        });
        return false;
    }

    return true;
};
export async function ensureDatabaseSetup(config, context) {
    const setupStartTime = Date.now();
    const client = new Client()
        .setEndpoint(config.endpoint)
        .setProject(config.projectId)
        .setKey(config.apiKey);
    const databases = new Databases(client);

    let progressTracker = null;
    let rollbackManager = null;

    try {
        logDebug(context, 'Starting enhanced database setup with robustness features...');

        // Pre-setup validation
        logDebug(context, 'Performing pre-setup validation...');
        const preValidation = await validatePreSetup(config, context);
        if (!preValidation.success) {
            throw new Error(`Pre-setup validation failed: ${preValidation.issues.join(', ')}`);
        }
        logDebug(context, 'Pre-setup validation passed successfully');

        // Initialize progress tracking and rollback management
        progressTracker = new ProgressTracker(databases, config.databaseId, context);
        rollbackManager = new RollbackManager(databases, config.databaseId, context);

        // Initialize with proper error handling
        try {
            await progressTracker.initialize();
            await rollbackManager.initialize();
            logDebug(context, 'Progress tracking and rollback management initialized successfully');
        } catch (error) {
            context.error('Failed to initialize progress/rollback tracking, continuing without tracking', {
                error: error.message
            });
            // Continue without progress tracking if it fails
            progressTracker = null;
            rollbackManager = null;
        }

        // Check if we're resuming a previous setup
        let existingProgress = null;
        if (progressTracker) {
            existingProgress = await progressTracker.getProgress();
            if (existingProgress && existingProgress.state === SETUP_STATES.IN_PROGRESS) {
                logDebug(context, 'Resuming previous setup from checkpoint', {
                    previousState: existingProgress.state,
                    completedSteps: existingProgress.completedSteps?.length || 0,
                    lastUpdated: existingProgress.lastUpdated
                });
            }

            await progressTracker.updateProgress(SETUP_STATES.IN_PROGRESS, 'database_creation');
        }

        // Database creation with circuit breaker protection
        logDebug(context, 'Ensuring database exists...');
        const dbExists = await circuitBreakers.database.execute(async () => {
            return await resourceExists(() => databases.get(config.databaseId));
        }, context);

        if (!dbExists) {
            logDebug(context, 'Creating database...');
            await circuitBreakers.database.execute(async () => {
                await databases.create(config.databaseId, 'RaceDay Database');
            }, context);
            logDebug(context, 'Database created successfully');
            if (rollbackManager) {
                await rollbackManager.addRollbackAction('delete_database', { databaseId: config.databaseId });
            }
        }

        // Collections setup with enhanced error handling and progress tracking
        const collectionsStart = Date.now();
        const collectionSetupFunctions = [
            { name: 'meetings', func: ensureMeetingsCollection },
            { name: 'races', func: ensureRacesCollection },
            { name: 'race-results', func: ensureRaceResultsCollection },
            { name: 'entrants', func: ensureEntrantsCollection },
            { name: 'odds-history', func: ensureOddsHistoryCollection },
            { name: 'money-flow-history', func: ensureMoneyFlowHistoryCollection },
            { name: 'race-pools', func: ensureRacePoolsCollection },
            { name: 'user-alert-configs', func: ensureUserAlertConfigsCollection },
            { name: 'notifications', func: ensureNotificationsCollection },
            { name: 'function-locks', func: ensureFunctionLocksCollection }
        ];

        for (const [index, { name, func }] of collectionSetupFunctions.entries()) {
            const stepProgress = ((index / collectionSetupFunctions.length) * 80) + 10; // 10-90% range

            // Skip if already completed in previous run
            if (existingProgress?.completedSteps?.includes(name)) {
                logDebug(context, `Skipping already completed collection: ${name}`);
                continue;
            }

            logDebug(context, `Setting up collection: ${name} (${stepProgress.toFixed(1)}% complete)`);
            if (progressTracker) {
                await progressTracker.updateProgress(SETUP_STATES.IN_PROGRESS, name, stepProgress);
            }

            const collectionStart = Date.now();

            try {
                await retryWithExponentialBackoff(
                    () => func(databases, config, context, progressTracker, rollbackManager),
                    {
                        maxRetries: 3,
                        baseDelay: 2000,
                        maxDelay: 30000,
                        timeoutMs: 120000 // 2 minutes per collection
                    },
                    context
                );

                const collectionDuration = Date.now() - collectionStart;
                if (progressTracker) {
                    await progressTracker.markStepCompleted(name);
                }

                logDebug(context, `Collection ${name} setup completed`, {
                    durationMs: collectionDuration,
                    progress: `${stepProgress.toFixed(1)}%`
                });

            } catch (error) {
                const collectionDuration = Date.now() - collectionStart;

                handleError(
                    error,
                    `Collection ${name} setup`,
                    context,
                    {
                        collectionName: name,
                        durationMs: collectionDuration,
                        progress: stepProgress
                    },
                    false,
                    'high'
                );

                // Attempt rollback for this collection
                if (rollbackManager) {
                    await rollbackManager.rollbackCollection(name);
                }

                // Continue with other collections unless it's a critical error
                if (!isRetryableError(error)) {
                    throw error;
                }
            }
        }

        // Schema version tracking
        logDebug(context, 'Updating schema version...');
        if (progressTracker) {
            await progressTracker.updateProgress(SETUP_STATES.IN_PROGRESS, 'schema_version', 90);
        }
        await updateSchemaVersion(databases, config.databaseId, SCHEMA_VERSION, context);

        // Post-setup validation
        logDebug(context, 'Performing post-setup validation...');
        if (progressTracker) {
            await progressTracker.updateProgress(SETUP_STATES.IN_PROGRESS, 'post_validation', 95);
        }
        const postValidation = await validatePostSetup(config, context);

        if (!postValidation.success) {
            context.error('Post-setup validation failed', {
                issues: postValidation.issues,
                completeness: postValidation.completeness
            });

            // Don't throw here - allow partial setup with warnings
            if (postValidation.completeness < 50) {
                throw new Error(`Post-setup validation failed with low completeness: ${postValidation.completeness.toFixed(1)}%`);
            }
        }

        // Final health check
        logDebug(context, 'Performing final health check...');
        const healthCheck = await performHealthCheck(config, context);

        if (progressTracker) {
            await progressTracker.updateProgress(SETUP_STATES.COMPLETED, 'completed', 100);
        }

        const totalDuration = Date.now() - setupStartTime;
        const collectionsSetupDuration = Date.now() - collectionsStart;

        logDebug(context, 'Database setup completed successfully', {
            totalDurationMs: totalDuration,
            collectionsSetupDurationMs: collectionsSetupDuration,
            schemaVersion: SCHEMA_VERSION,
            postValidationCompleteness: `${postValidation.completeness.toFixed(1)}%`,
            healthCheckStatus: healthCheck.healthy ? 'healthy' : 'warning',
            circuitBreakerStats: Object.fromEntries(
                Object.entries(circuitBreakers).map(([key, cb]) => [key, cb.getStatus()])
            )
        });

        // Clean up progress tracking (but keep rollback info for audit)
        if (progressTracker) {
            await progressTracker.cleanup();
        }

        return {
            success: true,
            duration: totalDuration,
            schemaVersion: SCHEMA_VERSION,
            validation: postValidation,
            healthCheck: healthCheck
        };

    } catch (error) {
        const totalDuration = Date.now() - setupStartTime;

        // Update progress to failed state
        if (progressTracker) {
            try {
                await progressTracker.updateProgress(SETUP_STATES.FAILED, 'error', null, error.message);
            } catch (progressError) {
                context.error('Failed to update progress to failed state', { error: progressError.message });
            }
        }

        handleError(
            error,
            'Database setup',
            context,
            {
                totalDurationMs: totalDuration,
                schemaVersion: SCHEMA_VERSION,
                circuitBreakerStats: Object.fromEntries(
                    Object.entries(circuitBreakers).map(([key, cb]) => [key, cb.getStatus()])
                )
            },
            false,
            'critical'
        );

        // Attempt cleanup/rollback on failure
        if (rollbackManager) {
            logDebug(context, 'Attempting rollback due to setup failure...');
            try {
                await rollbackManager.executeRollback();
                logDebug(context, 'Rollback completed successfully');
            } catch (rollbackError) {
                // Don't fail the entire process if rollback fails
                context.error('Rollback failed but continuing', {
                    rollbackError: rollbackError.message,
                    originalError: error.message
                });
            }
        }

        throw error;
    }
}

/**
 * Check if an error is retryable (moved from error-handlers.js to avoid circular import)
 */
function isRetryableError(error) {
    if (!error) return false;

    const message = error.message?.toLowerCase() || '';
    const code = error.code?.toLowerCase() || '';

    // Retryable error types
    const retryableIndicators = [
        'timeout',
        'network',
        'connection',
        'rate limit',
        '429',
        '5' // 5xx server errors
    ];

    return retryableIndicators.some(indicator =>
        message.includes(indicator) || code.includes(indicator)
    );
}

/**
 * Helper function to safely log attribute results
 * @param {Object} attributeResults - Results from createAttributesInParallel
 * @param {string} collectionName - Name of the collection
 * @param {Object} context - Appwrite function context
 */
function logAttributeResults(attributeResults, collectionName, context) {
    const successful = attributeResults?.successful || 0;
    const failed = attributeResults?.failed || 0;
    const total = attributeResults?.total || 0;
    const successRate = attributeResults?.successRate != null ? attributeResults.successRate : 100.0;
    const duration = attributeResults?.duration || 0;

    if (failed > 0) {
        logDebug(context, `${collectionName} collection: ${failed} attributes failed to create`, {
            successRate: `${successRate.toFixed(1)}%`,
            successful,
            failed
        });
    }
}
async function ensureMeetingsCollection(databases, config, context, progressTracker = null, rollbackManager = null) {
    const collectionId = collections.meetings;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        logDebug(context, 'Creating meetings collection...');
        await databases.createCollection(config.databaseId, collectionId, 'Meetings', [
            Permission.read(Role.any()),
            Permission.create(Role.any()),
            Permission.update(Role.any()),
            Permission.delete(Role.users()),
        ]);
    }
    const requiredAttributes = [
        // Core identifiers
        { key: 'meetingId', type: 'string', size: 50, required: true },
        { key: 'meetingName', type: 'string', size: 255, required: true },
        
        // Location and categorization
        { key: 'country', type: 'string', size: 10, required: true },
        { key: 'state', type: 'string', size: 10, required: false },
        { key: 'raceType', type: 'string', size: 50, required: true },
        { key: 'category', type: 'string', size: 10, required: false }, // T, H, G
        { key: 'categoryName', type: 'string', size: 100, required: false }, // Full category name
        
        // Meeting details
        { key: 'date', type: 'datetime', required: true },
        { key: 'trackCondition', type: 'string', size: 50, required: false },
        { key: 'status', type: 'string', size: 50, required: true },
        
        // Additional meeting metadata for future functionality
        { key: 'trackDirection', type: 'string', size: 20, required: false }, // Left/Right
        { key: 'trackSurface', type: 'string', size: 50, required: false }, // All Weather, Turf, etc
        { key: 'railPosition', type: 'string', size: 100, required: false },
        { key: 'weather', type: 'string', size: 50, required: false },
        
        // Import metadata
        { key: 'lastUpdated', type: 'datetime', required: false },
        { key: 'dataSource', type: 'string', size: 50, required: false }, // 'NZTAB'
        { key: 'apiGeneratedTime', type: 'datetime', required: false },
    ];
    
    // Create attributes with enhanced parallel processing and error isolation
    const attributeResults = await createAttributesInParallel(databases, config.databaseId, collectionId, requiredAttributes, context, rollbackManager);

    logAttributeResults(attributeResults, collectionId, context);
    const collection = await databases.getCollection(config.databaseId, collectionId);
    if (!collection.indexes.some((idx) => idx.key === 'idx_date')) {
        logDebug(context, 'Creating idx_date index on date...');
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'date', context);
        if (!isAvailable) {
            logDebug(context, 'date attribute is not available for index creation, skipping idx_date index');
        }
        else {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_date', IndexType.Key, ['date']);
                logDebug(context, 'idx_date index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_date index: ${error}`);
            }
        }
    }
    if (!collection.indexes.some((idx) => idx.key === 'idx_country')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'country', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_country', IndexType.Key, ['country']);
                logDebug(context, 'idx_country index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_country index: ${error}`);
            }
        }
        else {
            logDebug(context, 'country attribute is not available for index creation, skipping idx_country index');
        }
    }
    if (!collection.indexes.some((idx) => idx.key === 'idx_race_type')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'raceType', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_race_type', IndexType.Key, ['raceType']);
                logDebug(context, 'idx_race_type index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_race_type index: ${error}`);
            }
        }
        else {
            logDebug(context, 'raceType attribute is not available for index creation, skipping idx_race_type index');
        }
    }
    if (!collection.indexes.some((idx) => idx.key === 'idx_meeting_id')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'meetingId', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_meeting_id', IndexType.Unique, ['meetingId']);
                logDebug(context, 'idx_meeting_id index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_meeting_id index: ${error}`);
            }
        }
        else {
            logDebug(context, 'meetingId attribute is not available for index creation, skipping idx_meeting_id index');
        }
    }
}
async function ensureRacesCollection(databases, config, context, progressTracker = null, rollbackManager = null) {
    const collectionId = collections.races;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        logDebug(context, 'Creating races collection...');
        await databases.createCollection(config.databaseId, collectionId, 'Races', [
            Permission.read(Role.any()),
            Permission.create(Role.any()),
            Permission.update(Role.any()),
            Permission.delete(Role.users()),
        ]);
    }
    const requiredAttributes = [
        // Core identifiers
        { key: 'raceId', type: 'string', size: 50, required: true },
        { key: 'name', type: 'string', size: 255, required: true },
        { key: 'raceNumber', type: 'integer', required: true },
        
        // Timing information
        { key: 'startTime', type: 'datetime', required: true }, // advertised_start
        { key: 'actualStart', type: 'datetime', required: false }, // actual_start
        { key: 'toteStartTime', type: 'string', size: 20, required: false }, // tote_start_time
        { key: 'startTimeNz', type: 'string', size: 30, required: false }, // start_time_nz
        { key: 'raceDateNz', type: 'string', size: 15, required: false }, // race_date_nz
        
        // Race details
        { key: 'distance', type: 'integer', required: false },
        { key: 'trackCondition', type: 'string', size: 100, required: false },
        { key: 'weather', type: 'string', size: 50, required: false },
        { key: 'status', type: 'string', size: 50, required: true },
        
        // Track information
        { key: 'trackDirection', type: 'string', size: 20, required: false }, // track_direction
        { key: 'trackSurface', type: 'string', size: 50, required: false }, // track_surface
        { key: 'railPosition', type: 'string', size: 100, required: false }, // rail_position
        { key: 'trackHomeStraight', type: 'integer', required: false }, // track_home_straight
        
        // Race classification
        { key: 'type', type: 'string', size: 10, required: false }, // race type (T, H, G)
        { key: 'startType', type: 'string', size: 50, required: false }, // start_type
        { key: 'group', type: 'string', size: 50, required: false }, // Grade, Listed, etc
        { key: 'class', type: 'string', size: 20, required: false }, // C1, C2, etc
        { key: 'gait', type: 'string', size: 20, required: false }, // for harness racing
        
        // Prize and field information
        { key: 'totalPrizeMoney', type: 'integer', required: false }, // prize_monies.total_value
        { key: 'entrantCount', type: 'integer', required: false }, // entrant_count
        { key: 'fieldSize', type: 'integer', required: false }, // field_size
        { key: 'positionsPaid', type: 'integer', required: false }, // positions_paid
        
        // Race conditions and restrictions
        { key: 'genderConditions', type: 'string', size: 100, required: false },
        { key: 'ageConditions', type: 'string', size: 100, required: false },
        { key: 'weightConditions', type: 'string', size: 200, required: false },
        { key: 'allowanceConditions', type: 'boolean', required: false },
        { key: 'specialConditions', type: 'string', size: 500, required: false },
        { key: 'jockeyConditions', type: 'string', size: 200, required: false },
        
        // Form and commentary
        { key: 'formGuide', type: 'string', size: 2000, required: false },
        { key: 'comment', type: 'string', size: 2000, required: false },
        { key: 'description', type: 'string', size: 255, required: false },
        
        // Visual and media
        { key: 'silkUrl', type: 'string', size: 500, required: false },
        { key: 'silkBaseUrl', type: 'string', size: 200, required: false },
        { key: 'videoChannels', type: 'string', size: 500, required: false }, // JSON array as string
        
        // Betting options
        { key: 'ffwinOptionNumber', type: 'integer', required: false },
        { key: 'fftop3OptionNumber', type: 'integer', required: false },
        
        // Rate information for harness/trots
        { key: 'mileRate400', type: 'string', size: 20, required: false },
        { key: 'mileRate800', type: 'string', size: 20, required: false },
        
        // Import metadata
        { key: 'lastUpdated', type: 'datetime', required: false },
        { key: 'dataSource', type: 'string', size: 50, required: false }, // 'NZTAB'
        { key: 'importedAt', type: 'datetime', required: false },
        
        // Polling coordination (for master race scheduler)
        { key: 'last_poll_time', type: 'datetime', required: false }, // Tracks when race was last polled by master scheduler
        
        // Race status change tracking (added for proper timeline finalization)
        { key: 'lastStatusChange', type: 'datetime', required: false }, // Timestamp of last status change
        { key: 'finalizedAt', type: 'datetime', required: false }, // Timestamp when race status became Final/Finalized
        { key: 'abandonedAt', type: 'datetime', required: false }, // Timestamp when race was abandoned
    ];
    // Create attributes with enhanced parallel processing and error isolation
    const attributeResults = await createAttributesInParallel(databases, config.databaseId, collectionId, requiredAttributes, context, rollbackManager);

    logAttributeResults(attributeResults, collectionId, context);
    if (!(await attributeExists(databases, config.databaseId, collectionId, 'meeting'))) {
        logDebug(context, 'Creating races->meetings relationship...');
        await databases.createRelationshipAttribute(config.databaseId, collectionId, collections.meetings, RelationshipType.ManyToOne, false, 'meeting', 'races');
    }
    const racesCollection = await databases.getCollection(config.databaseId, collectionId);
    if (!racesCollection.indexes.some((idx) => idx.key === 'idx_race_id')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'raceId', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_race_id', IndexType.Unique, ['raceId']);
                logDebug(context, 'idx_race_id index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_race_id index: ${error}`);
            }
        }
        else {
            logDebug(context, 'raceId attribute is not available for index creation, skipping idx_race_id index');
        }
    }
    if (!racesCollection.indexes.some((idx) => idx.key === 'idx_start_time')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'startTime', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_start_time', IndexType.Key, ['startTime']);
                logDebug(context, 'idx_start_time index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_start_time index: ${error}`);
            }
        }
        else {
            logDebug(context, 'startTime attribute is not available for index creation, skipping idx_start_time index');
        }
    }
    if (!racesCollection.indexes.some((idx) => idx.key === 'idx_race_number')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'raceNumber', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_race_number', IndexType.Key, ['raceNumber']);
                logDebug(context, 'idx_race_number index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_race_number index: ${error}`);
            }
        }
        else {
            logDebug(context, 'raceNumber attribute is not available for index creation, skipping idx_race_number index');
        }
    }
}

async function ensureRaceResultsCollection(databases, config, context, progressTracker = null, rollbackManager = null) {
    const collectionId = collections.raceResults;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    
    if (!exists) {
        logDebug(context, 'Creating race-results collection...');
        await databases.createCollection(config.databaseId, collectionId, 'Race Results', [
            Permission.read(Role.any()),
            Permission.create(Role.any()),
            Permission.update(Role.any()),
            Permission.delete(Role.users()),
        ]);
    }
    
    // Race results collection - stores race results and dividends data
    const requiredAttributes = [
        // Core identifiers and status
        { key: 'resultsAvailable', type: 'boolean', required: false, default: false }, // Whether results data is available
        { key: 'resultStatus', type: 'string', size: 20, required: false }, // 'interim', 'final', 'protest'
        { key: 'resultTime', type: 'datetime', required: false }, // Time when results were declared
        
        // Results and dividends data (JSON strings) - sizes >16383 to store as pointers not in row
        { key: 'resultsData', type: 'string', size: 20000, required: false }, // JSON string of race results array
        { key: 'dividendsData', type: 'string', size: 30000, required: false }, // JSON string of dividends array
        { key: 'fixedOddsData', type: 'string', size: 20000, required: false }, // JSON string of fixed odds per runner at result time
        
        // Result flags and indicators
        { key: 'photoFinish', type: 'boolean', required: false, default: false }, // Photo finish flag
        { key: 'stewardsInquiry', type: 'boolean', required: false, default: false }, // Stewards inquiry flag
        { key: 'protestLodged', type: 'boolean', required: false, default: false }, // Protest lodged flag
    ];
    
    // Create attributes with enhanced parallel processing and error isolation
    const attributeResults = await createAttributesInParallel(databases, config.databaseId, collectionId, requiredAttributes, context, rollbackManager);

    logAttributeResults(attributeResults, collectionId, context);
    
    // Create relationship to races collection
    if (!(await attributeExists(databases, config.databaseId, collectionId, 'race'))) {
        logDebug(context, 'Creating race-results->races relationship...');
        await databases.createRelationshipAttribute(config.databaseId, collectionId, collections.races, RelationshipType.ManyToOne, true, 'race', 'raceResults');
    }
    
    // Note: Cannot create indexes on relationship attributes in Appwrite
    // The relationship itself provides efficient lookups via the relationship system
}

async function ensureEntrantsCollection(databases, config, context, progressTracker = null, rollbackManager = null) {
    const collectionId = collections.entrants;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        logDebug(context, 'Creating entrants collection...');
        await databases.createCollection(config.databaseId, collectionId, 'Entrants', [
            Permission.read(Role.any()),
            Permission.create(Role.any()),
            Permission.update(Role.any()),
            Permission.delete(Role.users()),
        ]);
    }
    // Daily Entrants collection - for frequently updated data (odds, status, betting)
    const requiredAttributes = [
        // Core identifiers
        { key: 'entrantId', type: 'string', size: 50, required: true },
        { key: 'name', type: 'string', size: 255, required: true },
        { key: 'runnerNumber', type: 'integer', required: true },
        { key: 'barrier', type: 'integer', required: false },
        
        // Current status information (updated frequently during race day)
        { key: 'isScratched', type: 'boolean', required: false, default: false },
        { key: 'isLateScratched', type: 'boolean', required: false, default: false },
        { key: 'isEmergency', type: 'boolean', required: false, default: false },
        { key: 'scratchTime', type: 'integer', required: false }, // Unix timestamp
        { key: 'emergencyPosition', type: 'string', size: 20, required: false },
        { key: 'runnerChange', type: 'string', size: 500, required: false },
        
        // Current odds (updated frequently during betting)
        { key: 'fixedWinOdds', type: 'float', required: false },
        { key: 'fixedPlaceOdds', type: 'float', required: false },
        { key: 'poolWinOdds', type: 'float', required: false },
        { key: 'poolPlaceOdds', type: 'float', required: false },
        
        // Betting status indicators (updated frequently)
        { key: 'favourite', type: 'boolean', required: false, default: false },
        { key: 'mover', type: 'boolean', required: false, default: false },
        
        // Current race connections (may change on race day)
        { key: 'jockey', type: 'string', size: 255, required: false },
        { key: 'trainerName', type: 'string', size: 255, required: false },
        { key: 'apprenticeIndicator', type: 'string', size: 50, required: false },
        { key: 'gear', type: 'string', size: 200, required: false },
        
        // Weight information (finalized on race day)
        { key: 'weight', type: 'string', size: 50, required: false },
        { key: 'allocatedWeight', type: 'string', size: 20, required: false },
        { key: 'totalWeight', type: 'string', size: 20, required: false },
        { key: 'allowanceWeight', type: 'string', size: 20, required: false },
        
        // Current market information
        { key: 'marketName', type: 'string', size: 100, required: false }, // Final Field, etc
        { key: 'primaryMarket', type: 'boolean', required: false, default: true },
        
        // Speedmap positioning for live race strategy
        { key: 'settlingLengths', type: 'integer', required: false },
        
        // Static entrant information (rarely changes)
        { key: 'age', type: 'integer', required: false },
        { key: 'sex', type: 'string', size: 10, required: false }, // M, F, G, etc
        { key: 'colour', type: 'string', size: 20, required: false }, // B, BR, CH, etc
        { key: 'foalingDate', type: 'string', size: 20, required: false }, // "Dec 23" format
        { key: 'sire', type: 'string', size: 100, required: false },
        { key: 'dam', type: 'string', size: 100, required: false },
        { key: 'breeding', type: 'string', size: 200, required: false },
        { key: 'owners', type: 'string', size: 255, required: false },
        { key: 'trainerLocation', type: 'string', size: 100, required: false },
        { key: 'country', type: 'string', size: 10, required: false }, // NZL, AUS
        
        // Performance and form data
        { key: 'prizeMoney', type: 'string', size: 20, required: false }, // "4800" format
        { key: 'bestTime', type: 'string', size: 20, required: false }, // "17.37" format
        { key: 'lastTwentyStarts', type: 'string', size: 30, required: false }, // "21331" format
        { key: 'winPercentage', type: 'string', size: 10, required: false }, // "40%" format
        { key: 'placePercentage', type: 'string', size: 10, required: false }, // "100%" format
        { key: 'rating', type: 'string', size: 20, required: false },
        { key: 'handicapRating', type: 'string', size: 20, required: false },
        { key: 'classLevel', type: 'string', size: 20, required: false },
        
        // Current race day specific information
        { key: 'firstStartIndicator', type: 'boolean', required: false, default: false },
        { key: 'formComment', type: 'string', size: 500, required: false },
        
        // Silk and visual information
        { key: 'silkColours', type: 'string', size: 100, required: false },
        { key: 'silkUrl64', type: 'string', size: 500, required: false },
        { key: 'silkUrl128', type: 'string', size: 500, required: false },
        
        // Import and update metadata
        { key: 'lastUpdated', type: 'datetime', required: false },
        { key: 'dataSource', type: 'string', size: 50, required: false }, // 'NZTAB'
        { key: 'importedAt', type: 'datetime', required: false },
    ];
    // Create attributes with enhanced parallel processing and error isolation
    const attributeResults = await createAttributesInParallel(databases, config.databaseId, collectionId, requiredAttributes, context, rollbackManager);

    // Safely handle attribute results logging
    const successful = attributeResults?.successful || 0;
    const failed = attributeResults?.failed || 0;
    const total = attributeResults?.total || 0;
    const successRate = attributeResults?.successRate != null ? attributeResults.successRate : 100.0;
    const duration = attributeResults?.duration || 0;

    logDebug(context, `Entrants collection attribute creation completed`, {
        successful,
        failed,
        total,
        successRate: `${successRate.toFixed(1)}%`,
        duration
    });

    if (failed > 0) {
        logDebug(context, `Entrants collection: ${failed} attributes failed to create`, {
            successRate: `${successRate.toFixed(1)}%`
        });
    }
    if (!(await attributeExists(databases, config.databaseId, collectionId, 'race'))) {
        logDebug(context, 'Creating entrants->races relationship...');
        await databases.createRelationshipAttribute(config.databaseId, collectionId, collections.races, RelationshipType.ManyToOne, false, 'race', 'entrants');
    }
    const entrantsCollection = await databases.getCollection(config.databaseId, collectionId);
    if (!entrantsCollection.indexes.some((idx) => idx.key === 'idx_entrant_id')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'entrantId', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_entrant_id', IndexType.Unique, ['entrantId']);
                logDebug(context, 'idx_entrant_id index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_entrant_id index: ${error}`);
            }
        }
        else {
            logDebug(context, 'entrantId attribute is not available for index creation, skipping idx_entrant_id index');
        }
    }
    if (!entrantsCollection.indexes.some((idx) => idx.key === 'idx_runner_number')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'runnerNumber', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_runner_number', IndexType.Key, ['runnerNumber']);
                logDebug(context, 'idx_runner_number index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_runner_number index: ${error}`);
            }
        }
        else {
            logDebug(context, 'runnerNumber attribute is not available for index creation, skipping idx_runner_number index');
        }
    }
}

async function ensureOddsHistoryCollection(databases, config, context, progressTracker = null, rollbackManager = null) {
    const collectionId = collections.oddsHistory;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        logDebug(context, 'Creating odds history collection...');
        await databases.createCollection(config.databaseId, collectionId, 'OddsHistory', [
            Permission.read(Role.any()),
            Permission.create(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users()),
        ]);
    }
    const requiredAttributes = [
        { key: 'odds', type: 'float', required: true },
        { key: 'eventTimestamp', type: 'datetime', required: true },
        { key: 'type', type: 'string', size: 20, required: true },
    ];
    // Create attributes with enhanced parallel processing and error isolation
    const attributeResults = await createAttributesInParallel(databases, config.databaseId, collectionId, requiredAttributes, context, rollbackManager);

    logAttributeResults(attributeResults, collectionId, context);
    if (!(await attributeExists(databases, config.databaseId, collectionId, 'entrant'))) {
        logDebug(context, 'Creating odds history->entrants relationship...');
        await databases.createRelationshipAttribute(config.databaseId, collectionId, collections.entrants, RelationshipType.ManyToOne, false, 'entrant', 'oddsHistory');
    }
    const oddsCollection = await databases.getCollection(config.databaseId, collectionId);
    if (!oddsCollection.indexes.some((idx) => idx.key === 'idx_timestamp')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'eventTimestamp', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_timestamp', IndexType.Key, ['eventTimestamp']);
                logDebug(context, 'idx_timestamp index created successfully for odds history');
            }
            catch (error) {
                context.error(`Failed to create idx_timestamp index for odds history: ${error}`);
            }
        }
        else {
            logDebug(context, 'eventTimestamp attribute is not available for index creation, skipping idx_timestamp index');
        }
    }
    // Note: Appwrite does not support creating compound indexes that include relationship attributes.
    // This limitation means that queries requiring both eventTimestamp and entrant fields cannot leverage
    // a single compound index for optimized performance. Instead, such queries may require scanning
    // multiple records, which could impact performance for large datasets.
    // 
    // Workarounds:
    // 1. Use the existing idx_timestamp index on eventTimestamp for time-based queries.
    // 2. For cross-entrant queries, use the entrant relationship field directly and filter results in code.
    // 3. If performance becomes an issue, consider denormalizing data or creating additional collections
    //    to store pre-aggregated or indexed data for specific query patterns.
}
async function ensureMoneyFlowHistoryCollection(databases, config, context, progressTracker = null, rollbackManager = null) {
    const collectionId = collections.moneyFlowHistory;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        logDebug(context, 'Creating money flow history collection...');
        await databases.createCollection(config.databaseId, collectionId, 'MoneyFlowHistory', [
            Permission.read(Role.any()),
            Permission.create(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users()),
        ]);
    }
    const requiredAttributes = [
        { key: 'holdPercentage', type: 'float', required: false }, // Optional - used for hold_percentage data
        { key: 'betPercentage', type: 'float', required: false },  // Optional - used for bet_percentage data
        { key: 'eventTimestamp', type: 'datetime', required: true },
        { key: 'type', type: 'string', size: 30, required: true }, // Enum: 'hold_percentage', 'bet_percentage', or 'bucketed_aggregation'
        
        // CRITICAL MISSING FIELD - Required for proper race filtering
        { key: 'raceId', type: 'string', size: 50, required: false }, // Race identifier for filtering
        
        // Timeline display fields - Story 4.9 implementation
        { key: 'pollingTimestamp', type: 'datetime', required: false }, // When the polling occurred
        { key: 'timeToStart', type: 'integer', required: false }, // Minutes to race start at polling time
        { key: 'winPoolAmount', type: 'integer', required: false }, // Win pool amount for this entrant
        { key: 'placePoolAmount', type: 'integer', required: false }, // Place pool amount for this entrant
        { key: 'incrementalAmount', type: 'integer', required: false }, // Calculated incremental change
        { key: 'poolType', type: 'string', size: 10, required: false }, // 'win' or 'place' for timeline specificity
        
        // NEW ATTRIBUTES for bucketed storage - Story 4.9 enhanced implementation
        { key: 'timeInterval', type: 'integer', required: false }, // Minutes before race start (60, 55, 50, etc.)
        { key: 'intervalType', type: 'string', size: 10, required: false }, // '5m', '1m', '30s'
        { key: 'incrementalWinAmount', type: 'integer', required: false }, // Win pool increment
        { key: 'incrementalPlaceAmount', type: 'integer', required: false }, // Place pool increment
        { key: 'isConsolidated', type: 'boolean', required: false, default: false }, // Aggregated data flag
        { key: 'bucketDocumentId', type: 'string', size: 100, required: false }, // For upserts
        { key: 'rawPollingData', type: 'string', size: 2000, required: false }, // JSON debug data
        
        // MISSING POOL-SPECIFIC PERCENTAGE FIELDS - Required for proper timeline calculations
        { key: 'winPoolPercentage', type: 'float', required: false }, // Win-specific percentage (winPoolAmount / totalWinPool * 100)
        { key: 'placePoolPercentage', type: 'float', required: false }, // Place-specific percentage (placePoolAmount / totalPlacePool * 100)
        
        // PHASE 5 TASK A1 - Additional fields for enhanced data quality and monitoring
        { key: 'totalPoolAmount', type: 'integer', required: false }, // Total pool for calculations
        { key: 'dataQualityScore', type: 'integer', required: false }, // 0-100 data completeness
        { key: 'mathematicallyConsistent', type: 'boolean', required: false }, // Pool sum validation
        { key: 'pollingLatencyMs', type: 'integer', required: false }, // Performance monitoring
        { key: 'isStale', type: 'boolean', required: false }, // Data freshness indicator
        
        // STORY 4.9 - Consolidate odds data into MoneyFlowHistory collection for unified timeline
        { key: 'fixedWinOdds', type: 'float', required: false }, // Fixed Win odds at this time bucket
        { key: 'fixedPlaceOdds', type: 'float', required: false }, // Fixed Place odds at this time bucket
        { key: 'poolWinOdds', type: 'float', required: false }, // Pool Win odds (tote) at this time bucket  
        { key: 'poolPlaceOdds', type: 'float', required: false }, // Pool Place odds (tote) at this time bucket
    ];
    // Create attributes with enhanced parallel processing and error isolation
    const attributeResults = await createAttributesInParallel(databases, config.databaseId, collectionId, requiredAttributes, context, rollbackManager);

    logAttributeResults(attributeResults, collectionId, context);
    
    // CRITICAL: Wait for Story 4.9 odds fields to be available before proceeding
    logDebug(context, 'Waiting for Story 4.9 odds fields to become available...');
    const oddsFields = ['fixedWinOdds', 'fixedPlaceOdds', 'poolWinOdds', 'poolPlaceOdds'];
    for (const oddsField of oddsFields) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, oddsField, context);
        if (!isAvailable) {
            context.error(`Failed to wait for ${oddsField} attribute to become available`);
        } else {
            logDebug(context, `✅ ${oddsField} attribute is now available`);
        }
    }
    
    if (!(await attributeExists(databases, config.databaseId, collectionId, 'entrant'))) {
        logDebug(context, 'Creating money flow history->entrants relationship...');
        await databases.createRelationshipAttribute(config.databaseId, collectionId, collections.entrants, RelationshipType.ManyToOne, false, 'entrant', 'moneyFlowHistory');
    }
    const moneyFlowCollection = await databases.getCollection(config.databaseId, collectionId);
    if (!moneyFlowCollection.indexes.some((idx) => idx.key === 'idx_timestamp')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'eventTimestamp', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_timestamp', IndexType.Key, ['eventTimestamp']);
                logDebug(context, 'idx_timestamp index created successfully for money flow history');
            }
            catch (error) {
                context.error(`Failed to create idx_timestamp index for money flow history: ${error}`);
            }
        }
        else {
            logDebug(context, 'eventTimestamp attribute is not available for index creation, skipping idx_timestamp index');
        }
    }
    
    // Add performance indexes for bucketed storage - Story 4.9
    if (!moneyFlowCollection.indexes.some((idx) => idx.key === 'idx_time_interval')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'timeInterval', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_time_interval', IndexType.Key, ['timeInterval']);
                logDebug(context, 'idx_time_interval index created successfully for money flow history');
            }
            catch (error) {
                context.error(`Failed to create idx_time_interval index for money flow history: ${error}`);
            }
        }
    }
    
    if (!moneyFlowCollection.indexes.some((idx) => idx.key === 'idx_interval_type')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'intervalType', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_interval_type', IndexType.Key, ['intervalType']);
                logDebug(context, 'idx_interval_type index created successfully for money flow history');
            }
            catch (error) {
                context.error(`Failed to create idx_interval_type index for money flow history: ${error}`);
            }
        }
    }
    
    if (!moneyFlowCollection.indexes.some((idx) => idx.key === 'idx_polling_timestamp')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'pollingTimestamp', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_polling_timestamp', IndexType.Key, ['pollingTimestamp']);
                logDebug(context, 'idx_polling_timestamp index created successfully for money flow history');
            }
            catch (error) {
                context.error(`Failed to create idx_polling_timestamp index for money flow history: ${error}`);
            }
        }
    }
    
    // CRITICAL INDEX for race filtering - Previously missing
    if (!moneyFlowCollection.indexes.some((idx) => idx.key === 'idx_race_id')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'raceId', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_race_id', IndexType.Key, ['raceId']);
                logDebug(context, 'idx_race_id index created successfully for money flow history');
            }
            catch (error) {
                context.error(`Failed to create idx_race_id index for money flow history: ${error}`);
            }
        }
    }
    
    // PHASE 5 TASK A1 - Additional indexes for data quality and freshness filtering
    if (!moneyFlowCollection.indexes.some((idx) => idx.key === 'idx_data_quality_score')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'dataQualityScore', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_data_quality_score', IndexType.Key, ['dataQualityScore']);
                logDebug(context, 'idx_data_quality_score index created successfully for money flow history');
            }
            catch (error) {
                context.error(`Failed to create idx_data_quality_score index for money flow history: ${error}`);
            }
        }
    }
    
    if (!moneyFlowCollection.indexes.some((idx) => idx.key === 'idx_is_stale')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'isStale', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_is_stale', IndexType.Key, ['isStale']);
                logDebug(context, 'idx_is_stale index created successfully for money flow history');
            }
            catch (error) {
                context.error(`Failed to create idx_is_stale index for money flow history: ${error}`);
            }
        }
    }
    
    // STORY 4.9 - Indexes for odds data in MoneyFlowHistory collection
    if (!moneyFlowCollection.indexes.some((idx) => idx.key === 'idx_fixed_win_odds')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'fixedWinOdds', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_fixed_win_odds', IndexType.Key, ['fixedWinOdds']);
                logDebug(context, 'idx_fixed_win_odds index created successfully for money flow history');
            }
            catch (error) {
                context.error(`Failed to create idx_fixed_win_odds index for money flow history: ${error}`);
            }
        }
    }
    
    if (!moneyFlowCollection.indexes.some((idx) => idx.key === 'idx_fixed_place_odds')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'fixedPlaceOdds', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_fixed_place_odds', IndexType.Key, ['fixedPlaceOdds']);
                logDebug(context, 'idx_fixed_place_odds index created successfully for money flow history');
            }
            catch (error) {
                context.error(`Failed to create idx_fixed_place_odds index for money flow history: ${error}`);
            }
        }
    }
    // Note: Appwrite does not support creating compound indexes that include relationship attributes.
    // This limitation means that queries requiring both eventTimestamp and entrant fields cannot leverage
    // a single compound index for optimized performance. Instead, such queries may require scanning
    // multiple records, which could impact performance for large datasets.
    // 
    // Workarounds:
    // 1. Use the existing idx_timestamp index on eventTimestamp for time-based queries.
    // 2. For cross-entrant queries, use the entrant relationship field directly and filter results in code.
    // 3. If performance becomes an issue, consider denormalizing data or creating additional collections
    //    to store pre-aggregated or indexed data for specific query patterns.
}
async function ensureRacePoolsCollection(databases, config, context, progressTracker = null, rollbackManager = null) {
    const collectionId = collections.racePools;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        logDebug(context, 'Creating race pools collection...');
        await databases.createCollection(config.databaseId, collectionId, 'RacePools', [
            Permission.read(Role.any()),
            Permission.create(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users()),
        ]);
    }
    const requiredAttributes = [
        { key: 'raceId', type: 'string', size: 50, required: true },
        { key: 'winPoolTotal', type: 'integer', required: false, default: 0 },
        { key: 'placePoolTotal', type: 'integer', required: false, default: 0 },
        { key: 'quinellaPoolTotal', type: 'integer', required: false, default: 0 },
        { key: 'trifectaPoolTotal', type: 'integer', required: false, default: 0 },
        { key: 'exactaPoolTotal', type: 'integer', required: false, default: 0 },
        { key: 'first4PoolTotal', type: 'integer', required: false, default: 0 },
        { key: 'totalRacePool', type: 'integer', required: false, default: 0 },
        { key: 'currency', type: 'string', size: 10, required: false, default: '$' },
        { key: 'lastUpdated', type: 'datetime', required: false },
    ];
    // Create attributes with enhanced parallel processing and error isolation
    const attributeResults = await createAttributesInParallel(databases, config.databaseId, collectionId, requiredAttributes, context, rollbackManager);

    logAttributeResults(attributeResults, collectionId, context);
    const racePoolsCollection = await databases.getCollection(config.databaseId, collectionId);
    if (!racePoolsCollection.indexes.some((idx) => idx.key === 'idx_race_id')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'raceId', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_race_id', IndexType.Unique, ['raceId']);
                logDebug(context, 'idx_race_id index created successfully for race pools');
            }
            catch (error) {
                context.error(`Failed to create idx_race_id index for race pools: ${error}`);
            }
        }
        else {
            logDebug(context, 'raceId attribute is not available for index creation, skipping idx_race_id index');
        }
    }
}
async function ensureUserAlertConfigsCollection(databases, config, context, progressTracker = null, rollbackManager = null) {
    const collectionId = collections.userAlertConfigs;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        logDebug(context, 'Creating user alert configs collection...');
        await databases.createCollection(config.databaseId, collectionId, 'UserAlertConfigs', [
            Permission.read(Role.users()),
            Permission.create(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users()),
        ]);
    }

    // Story 5.1: Indicator configuration schema - clean implementation
    const requiredAttributes = [
        // Core identification
        { key: 'userId', type: 'string', size: 50, required: true },
        { key: 'indicatorType', type: 'string', size: 50, required: true }, // "percentage_range" for our indicators

        // Percentage range definition (5-10%, 10-15%, 15-20%, 20-25%, 25-50%, 50%+)
        { key: 'percentageRangeMin', type: 'float', required: true }, // 5, 10, 15, 20, 25, 50
        { key: 'percentageRangeMax', type: 'float', required: false }, // 10, 15, 20, 25, 50, null (for 50%+)

        // Visual configuration
        { key: 'color', type: 'string', size: 20, required: true }, // Hex color code (#888888, #3B82F6, etc.)
        { key: 'isDefault', type: 'boolean', required: false, default: true }, // Flag for default color configurations

        // UI behavior
        { key: 'enabled', type: 'boolean', required: true }, // Enable/disable indicator
        { key: 'displayOrder', type: 'integer', required: true }, // Order for UI display (1-6)

        // Metadata
        { key: 'lastUpdated', type: 'datetime', required: false },
        { key: 'createdAt', type: 'datetime', required: false },
    ];

    // Create attributes with enhanced parallel processing and error isolation
    const attributeResults = await createAttributesInParallel(databases, config.databaseId, collectionId, requiredAttributes, context, rollbackManager);

    logAttributeResults(attributeResults, collectionId, context);

    // Note: Removed entrant relationship as indicators are global user settings, not per-entrant

    const alertConfigsCollection = await databases.getCollection(config.databaseId, collectionId);

    // Create indexes for efficient querying
    if (!alertConfigsCollection.indexes.some((idx) => idx.key === 'idx_user_id')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'userId', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_user_id', IndexType.Key, ['userId']);
                logDebug(context, 'idx_user_id index created successfully for user alert configs');
            }
            catch (error) {
                context.error(`Failed to create idx_user_id index for user alert configs: ${error}`);
            }
        }
        else {
            logDebug(context, 'userId attribute is not available for index creation, skipping idx_user_id index');
        }
    }

    if (!alertConfigsCollection.indexes.some((idx) => idx.key === 'idx_indicator_type')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'indicatorType', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_indicator_type', IndexType.Key, ['indicatorType']);
                logDebug(context, 'idx_indicator_type index created successfully for user alert configs');
            }
            catch (error) {
                context.error(`Failed to create idx_indicator_type index for user alert configs: ${error}`);
            }
        }
        else {
            logDebug(context, 'indicatorType attribute is not available for index creation, skipping idx_indicator_type index');
        }
    }

    if (!alertConfigsCollection.indexes.some((idx) => idx.key === 'idx_display_order')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'displayOrder', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_display_order', IndexType.Key, ['displayOrder']);
                logDebug(context, 'idx_display_order index created successfully for user alert configs');
            }
            catch (error) {
                context.error(`Failed to create idx_display_order index for user alert configs: ${error}`);
            }
        }
        else {
            logDebug(context, 'displayOrder attribute is not available for index creation, skipping idx_display_order index');
        }
    }
}
async function ensureNotificationsCollection(databases, config, context, progressTracker = null, rollbackManager = null) {
    const collectionId = collections.notifications;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        logDebug(context, 'Creating notifications collection...');
        await databases.createCollection(config.databaseId, collectionId, 'Notifications', [
            Permission.read(Role.users()),
            Permission.create(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users()),
        ]);
    }
    const requiredAttributes = [
        { key: 'userId', type: 'string', size: 50, required: true },
        { key: 'title', type: 'string', size: 255, required: true },
        { key: 'message', type: 'string', size: 1000, required: true },
        { key: 'type', type: 'string', size: 50, required: true },
        { key: 'read', type: 'boolean', required: false, default: false },
        { key: 'raceId', type: 'string', size: 50, required: false },
        { key: 'entrantId', type: 'string', size: 50, required: false },
    ];
    // Create attributes with enhanced parallel processing and error isolation
    const attributeResults = await createAttributesInParallel(databases, config.databaseId, collectionId, requiredAttributes, context, rollbackManager);

    logAttributeResults(attributeResults, collectionId, context);
    const notificationsCollection = await databases.getCollection(config.databaseId, collectionId);
    if (!notificationsCollection.indexes.some((idx) => idx.key === 'idx_user_id')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'userId', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_user_id', IndexType.Key, ['userId']);
                logDebug(context, 'idx_user_id index created successfully for notifications');
            }
            catch (error) {
                context.error(`Failed to create idx_user_id index for notifications: ${error}`);
            }
        }
        else {
            logDebug(context, 'userId attribute is not available for index creation, skipping idx_user_id index');
        }
    }
}

/**
 * Set up function-locks collection for execution lock management
 * Used by daily-meetings and other functions for preventing concurrent execution
 * @param {Object} databases - Appwrite Databases instance
 * @param {Object} config - Database configuration
 * @param {Object} context - Appwrite function context
 * @param {Object} progressTracker - Progress tracking object
 * @param {Object} rollbackManager - Rollback manager for cleanup
 * @returns {Object} Setup result
 */
async function ensureFunctionLocksCollection(databases, config, context, progressTracker = null, rollbackManager = null) {
    const collectionId = collections.functionLocks;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        logDebug(context, 'Creating function-locks collection...');
        await databases.createCollection(config.databaseId, collectionId, 'Function Execution Locks', [
            Permission.read(Role.any()),
            Permission.create(Role.any()),
            Permission.update(Role.any()),
            Permission.delete(Role.any()),
        ]);
    }

    const requiredAttributes = [
        // Core execution tracking
        { key: 'executionId', type: 'string', size: 255, required: true },
        { key: 'startTime', type: 'string', size: 50, required: true },
        { key: 'lastHeartbeat', type: 'string', size: 50, required: true },
        { key: 'status', type: 'string', size: 50, required: true },

        // Progress and debugging information
        { key: 'nzTime', type: 'string', size: 100, required: false },
        { key: 'processMetrics', type: 'string', size: 2000, required: false },
        { key: 'resourceMetrics', type: 'string', size: 2000, required: false },
    ];

    // Create attributes with enhanced parallel processing and error isolation
    const attributeResults = await createAttributesInParallel(databases, config.databaseId, collectionId, requiredAttributes, context, rollbackManager);
    logAttributeResults(attributeResults, collectionId, context);

    // Note: function-locks collection doesn't require indexes since it's used for simple document existence checks

    return { success: true, collection: collectionId };
}

/**
 * Progress Tracker for resumable database setup operations
 */
class ProgressTracker {
    constructor(databases, databaseId, context) {
        this.databases = databases;
        this.databaseId = databaseId;
        this.context = context;
        this.progressId = `setup-${Date.now()}`;
    }

    async initialize() {
        try {
            // Create progress tracking collection if it doesn't exist
            try {
                await this.databases.getCollection(this.databaseId, PROGRESS_COLLECTION);
            } catch (error) {
                if (error.code === 404) {
                    await this.databases.createCollection(this.databaseId, PROGRESS_COLLECTION, 'Database Setup Progress', []);

                    // Create required attributes with proper waiting
                    await this.databases.createStringAttribute(this.databaseId, PROGRESS_COLLECTION, 'state', 20, true);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for attribute

                    await this.databases.createStringAttribute(this.databaseId, PROGRESS_COLLECTION, 'currentStep', 100, false);
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    await this.databases.createFloatAttribute(this.databaseId, PROGRESS_COLLECTION, 'progress', false);
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    await this.databases.createDatetimeAttribute(this.databaseId, PROGRESS_COLLECTION, 'lastUpdated', true);
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    await this.databases.createStringAttribute(this.databaseId, PROGRESS_COLLECTION, 'completedSteps', 1000, false);
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    await this.databases.createStringAttribute(this.databaseId, PROGRESS_COLLECTION, 'errorMessage', 500, false);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Final wait

                    logDebug(this.context, 'Progress tracking collection created and attributes initialized');
                }
            }
        } catch (error) {
            this.context.error('Failed to initialize progress tracker', {
                error: error.message
            });
            throw error; // Re-throw to disable progress tracking
        }
    }

    async updateProgress(state, currentStep = null, progress = null, errorMessage = null) {
        try {
            const updateData = {
                state,
                lastUpdated: new Date().toISOString()
            };

            if (currentStep) updateData.currentStep = currentStep;
            if (progress !== null) updateData.progress = progress;
            if (errorMessage) updateData.errorMessage = errorMessage;

            // Try to update existing progress document
            try {
                const existingDocs = await this.databases.listDocuments(this.databaseId, PROGRESS_COLLECTION);
                if (existingDocs.documents.length > 0) {
                    await this.databases.updateDocument(this.databaseId, PROGRESS_COLLECTION, existingDocs.documents[0].$id, updateData);
                } else {
                    await this.databases.createDocument(this.databaseId, PROGRESS_COLLECTION, this.progressId, updateData);
                }
            } catch (error) {
                if (error.code === 404) {
                    await this.databases.createDocument(this.databaseId, PROGRESS_COLLECTION, this.progressId, updateData);
                } else {
                    throw error;
                }
            }
        } catch (error) {
            this.context.error('Failed to update progress', {
                error: error.message,
                state,
                currentStep,
                progress
            });
        }
    }

    async markStepCompleted(stepName) {
        try {
            const existingDocs = await this.databases.listDocuments(this.databaseId, PROGRESS_COLLECTION);
            if (existingDocs.documents.length > 0) {
                const doc = existingDocs.documents[0];
                const completedSteps = doc.completedSteps ? JSON.parse(doc.completedSteps) : [];
                if (!completedSteps.includes(stepName)) {
                    completedSteps.push(stepName);
                    await this.databases.updateDocument(this.databaseId, PROGRESS_COLLECTION, doc.$id, {
                        completedSteps: JSON.stringify(completedSteps)
                    });
                }
            }
        } catch (error) {
            this.context.error('Failed to mark step completed', {
                error: error.message,
                stepName
            });
        }
    }

    async getProgress() {
        try {
            const docs = await this.databases.listDocuments(this.databaseId, PROGRESS_COLLECTION);
            if (docs.documents.length > 0) {
                const doc = docs.documents[0];
                return {
                    state: doc.state,
                    currentStep: doc.currentStep,
                    progress: doc.progress,
                    lastUpdated: doc.lastUpdated,
                    completedSteps: doc.completedSteps ? JSON.parse(doc.completedSteps) : [],
                    errorMessage: doc.errorMessage
                };
            }
            return null;
        } catch (error) {
            this.context.error('Failed to get progress', {
                error: error.message
            });
            return null;
        }
    }

    async cleanup() {
        try {
            const docs = await this.databases.listDocuments(this.databaseId, PROGRESS_COLLECTION);
            for (const doc of docs.documents) {
                await this.databases.deleteDocument(this.databaseId, PROGRESS_COLLECTION, doc.$id);
            }
            logDebug(this.context, 'Progress tracking cleaned up');
        } catch (error) {
            this.context.error('Failed to cleanup progress tracking', {
                error: error.message
            });
        }
    }
}

/**
 * Rollback Manager for database setup cleanup
 */
class RollbackManager {
    constructor(databases, databaseId, context) {
        this.databases = databases;
        this.databaseId = databaseId;
        this.context = context;
        this.rollbackId = `rollback-${Date.now()}`;
        this.rollbackActions = [];
    }

    async initialize() {
        try {
            // Create rollback tracking collection if it doesn't exist
            try {
                await this.databases.getCollection(this.databaseId, ROLLBACK_COLLECTION);
            } catch (error) {
                if (error.code === 404) {
                    await this.databases.createCollection(this.databaseId, ROLLBACK_COLLECTION, 'Database Setup Rollback', []);

                    // Create required attributes with proper waiting
                    await this.databases.createStringAttribute(this.databaseId, ROLLBACK_COLLECTION, 'action', 50, true);
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    await this.databases.createStringAttribute(this.databaseId, ROLLBACK_COLLECTION, 'data', 1000, true);
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    await this.databases.createDatetimeAttribute(this.databaseId, ROLLBACK_COLLECTION, 'createdAt', true);
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    await this.databases.createBooleanAttribute(this.databaseId, ROLLBACK_COLLECTION, 'executed', false, false);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Final wait

                    logDebug(this.context, 'Rollback tracking collection created and attributes initialized');
                }
            }
        } catch (error) {
            this.context.error('Failed to initialize rollback manager', {
                error: error.message
            });
            throw error; // Re-throw to disable rollback tracking
        }
    }

    async addRollbackAction(action, data) {
        try {
            const rollbackAction = {
                action,
                data: JSON.stringify(data),
                createdAt: new Date().toISOString(),
                executed: false
            };

            await this.databases.createDocument(this.databaseId, ROLLBACK_COLLECTION, ID.unique(), rollbackAction);
            this.rollbackActions.push(rollbackAction);

            logDebug(this.context, 'Rollback action recorded', {
                action,
                data: JSON.stringify(data)
            });
        } catch (error) {
            this.context.error('Failed to record rollback action', {
                error: error.message,
                action
            });
        }
    }

    async executeRollback() {
        try {
            logDebug(this.context, 'Starting rollback execution...');

            const docs = await this.databases.listDocuments(this.databaseId, ROLLBACK_COLLECTION);
            const pendingActions = docs.documents.filter(doc => !doc.executed);

            for (const actionDoc of pendingActions.reverse()) { // Execute in reverse order
                try {
                    await this.executeRollbackAction(actionDoc.action, JSON.parse(actionDoc.data));

                    // Mark as executed
                    await this.databases.updateDocument(this.databaseId, ROLLBACK_COLLECTION, actionDoc.$id, {
                        executed: true
                    });

                    logDebug(this.context, `Rollback action executed: ${actionDoc.action}`);
                } catch (error) {
                    this.context.error(`Failed to execute rollback action: ${actionDoc.action}`, {
                        error: error.message,
                        data: actionDoc.data
                    });
                }
            }

            logDebug(this.context, 'Rollback execution completed');
        } catch (error) {
            this.context.error('Failed to execute rollback', {
                error: error.message
            });
        }
    }

    async executeRollbackAction(action, data) {
        switch (action) {
            case 'delete_database':
                try {
                    await this.databases.delete(data.databaseId);
                    logDebug(this.context, `Rolled back database: ${data.databaseId}`);
                } catch (error) {
                    if (error.code !== 404) throw error;
                }
                break;

            case 'delete_collection':
                try {
                    await this.databases.deleteCollection(this.databaseId, data.collectionId);
                    logDebug(this.context, `Rolled back collection: ${data.collectionId}`);
                } catch (error) {
                    if (error.code !== 404) throw error;
                }
                break;

            case 'delete_attributes':
                for (const attributeKey of data.attributes) {
                    try {
                        await this.databases.deleteAttribute(this.databaseId, data.collectionId, attributeKey);
                        logDebug(this.context, `Rolled back attribute: ${data.collectionId}.${attributeKey}`);
                    } catch (error) {
                        if (error.code !== 404) {
                            this.context.error(`Failed to rollback attribute: ${attributeKey}`, {
                                error: error.message
                            });
                        }
                    }
                }
                break;

            default:
                logDebug(this.context, `Unknown rollback action: ${action}`);
        }
    }

    async rollbackCollection(collectionId) {
        try {
            await this.databases.deleteCollection(this.databaseId, collectionId);
            logDebug(this.context, `Rolled back collection: ${collectionId}`);
        } catch (error) {
            if (error.code !== 404) {
                this.context.error(`Failed to rollback collection: ${collectionId}`, {
                    error: error.message
                });
            }
        }
    }
}
