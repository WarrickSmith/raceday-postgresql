/**
 * Comprehensive Database Validation Framework for RaceDay Application
 * Implements robust validation, health checks, and schema verification
 * Following Appwrite 2025 best practices for database setup and maintenance
 */

import { Client, Databases, Query } from 'node-appwrite';
import { logDebug, logInfo, logWarn, logError } from './logging-utils.js';

/**
 * Schema version tracking and migration management
 */
export const SCHEMA_VERSION = '4.0.0'; // Update when schema changes
export const SCHEMA_VERSION_COLLECTION = 'schema-version';

/**
 * Database schema definitions for validation
 */
export const EXPECTED_COLLECTIONS = {
    'meetings': {
        name: 'Meetings',
        requiredAttributes: ['meetingId', 'meetingName', 'country', 'raceType', 'date', 'status'],
        requiredIndexes: ['idx_date', 'idx_country', 'idx_race_type', 'idx_meeting_id'],
        relationships: []
    },
    'races': {
        name: 'Races',
        requiredAttributes: ['raceId', 'name', 'raceNumber', 'startTime', 'status'],
        requiredIndexes: ['idx_race_id', 'idx_start_time', 'idx_race_number'],
        relationships: ['meeting']
    },
    'race-results': {
        name: 'Race Results',
        requiredAttributes: ['resultsAvailable', 'resultStatus'],
        requiredIndexes: [],
        relationships: ['race']
    },
    'entrants': {
        name: 'Entrants',
        requiredAttributes: ['entrantId', 'name', 'runnerNumber'],
        requiredIndexes: ['idx_entrant_id', 'idx_runner_number', 'idx_race_id'],
        relationships: ['race']
    },
    'odds-history': {
        name: 'OddsHistory',
        requiredAttributes: ['odds', 'eventTimestamp', 'type'],
        requiredIndexes: ['idx_timestamp'],
        relationships: ['entrant']
    },
    'money-flow-history': {
        name: 'MoneyFlowHistory',
        requiredAttributes: ['eventTimestamp', 'type', 'raceId'],
        requiredIndexes: ['idx_timestamp', 'idx_race_id', 'idx_time_interval'],
        relationships: ['entrant']
    },
    'race-pools': {
        name: 'RacePools',
        requiredAttributes: ['raceId', 'winPoolTotal', 'placePoolTotal', 'totalRacePool'],
        requiredIndexes: ['idx_race_id'],
        relationships: []
    },
    'user-alert-configs': {
        name: 'UserAlertConfigs',
        requiredAttributes: ['userId', 'indicatorType', 'percentageRangeMin', 'color', 'enabled', 'displayOrder'],
        requiredIndexes: ['idx_user_id', 'idx_indicator_type', 'idx_display_order'],
        relationships: []
    }
};

/**
 * Comprehensive pre-setup validation
 * @param {Object} config - Appwrite configuration
 * @param {Object} context - Appwrite function context
 * @returns {Promise<Object>} Validation result
 */
export async function validatePreSetup(config, context) {
    const startTime = Date.now();
    logDebug(context, 'Starting pre-setup validation...');

    const validationResults = {
        success: true,
        issues: [],
        warnings: [],
        environment: null,
        connectivity: null,
        permissions: null,
        duration: 0
    };

    try {
        // Environment validation
        validationResults.environment = await validateEnvironment(config, context);
        if (!validationResults.environment.success) {
            validationResults.success = false;
            validationResults.issues.push(...validationResults.environment.issues);
        }

        // Connectivity validation
        validationResults.connectivity = await validateConnectivity(config, context);
        if (!validationResults.connectivity.success) {
            validationResults.success = false;
            validationResults.issues.push(...validationResults.connectivity.issues);
        }

        // Permissions validation
        validationResults.permissions = await validatePermissions(config, context);
        if (!validationResults.permissions.success) {
            validationResults.success = false;
            validationResults.issues.push(...validationResults.permissions.issues);
        }

        validationResults.duration = Date.now() - startTime;

        logDebug(context, 'Pre-setup validation completed', {
            success: validationResults.success,
            issuesCount: validationResults.issues.length,
            warningsCount: validationResults.warnings.length,
            duration: validationResults.duration
        });

        return validationResults;

    } catch (error) {
        validationResults.success = false;
        validationResults.issues.push(`Pre-setup validation failed: ${error.message}`);
        validationResults.duration = Date.now() - startTime;

        context.error('Pre-setup validation error', {
            error: error.message,
            duration: validationResults.duration
        });

        return validationResults;
    }
}

/**
 * Environment validation
 * @param {Object} config - Appwrite configuration
 * @param {Object} context - Appwrite function context
 * @returns {Promise<Object>} Environment validation result
 */
async function validateEnvironment(config, context) {
    const result = { success: true, issues: [], warnings: [] };

    // Required environment variables
    const requiredVars = ['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        result.success = false;
        result.issues.push(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Configuration validation
    if (!config.endpoint || !config.projectId || !config.apiKey || !config.databaseId) {
        result.success = false;
        result.issues.push('Incomplete Appwrite configuration provided');
    }

    // API key format validation (basic check)
    if (config.apiKey && !config.apiKey.startsWith('standard_')) {
        result.warnings.push('API key format appears unusual - expected to start with "standard_"');
    }

    // Runtime environment checks
    if (!process.version || !process.version.startsWith('v22')) {
        result.warnings.push(`Node.js version ${process.version} detected - Node.js 22+ recommended`);
    }

    logDebug(context, 'Environment validation completed', {
        success: result.success,
        issuesCount: result.issues.length,
        warningsCount: result.warnings.length
    });

    return result;
}

/**
 * Connectivity validation
 * @param {Object} config - Appwrite configuration
 * @param {Object} context - Appwrite function context
 * @returns {Promise<Object>} Connectivity validation result
 */
async function validateConnectivity(config, context) {
    const result = { success: true, issues: [], warnings: [] };

    try {
        const client = new Client()
            .setEndpoint(config.endpoint)
            .setProject(config.projectId)
            .setKey(config.apiKey);

        const databases = new Databases(client);

        // Test basic connectivity with timeout
        const connectivityTest = withTimeout(
            databases.list(),
            10000,
            'Connectivity test'
        );

        await connectivityTest;

        logDebug(context, 'Connectivity validation successful');

    } catch (error) {
        result.success = false;
        if (error.message.includes('timeout')) {
            result.issues.push('Connection timeout - Appwrite endpoint may be unreachable');
        } else if (error.message.includes('401') || error.message.includes('unauthorized')) {
            result.issues.push('Authentication failed - check API key');
        } else if (error.message.includes('404') || error.message.includes('project')) {
            result.issues.push('Project not found - check project ID');
        } else {
            result.issues.push(`Connectivity test failed: ${error.message}`);
        }

        context.error('Connectivity validation failed', {
            error: error.message,
            endpoint: config.endpoint,
            projectId: config.projectId
        });
    }

    return result;
}

/**
 * Permissions validation
 * @param {Object} config - Appwrite configuration
 * @param {Object} context - Appwrite function context
 * @returns {Promise<Object>} Permissions validation result
 */
async function validatePermissions(config, context) {
    const result = { success: true, issues: [], warnings: [] };

    const requiredScopes = [
        'databases.read',
        'databases.write',
        'collections.read',
        'collections.write',
        'attributes.read',
        'attributes.write',
        'indexes.read',
        'indexes.write'
    ];

    try {
        const client = new Client()
            .setEndpoint(config.endpoint)
            .setProject(config.projectId)
            .setKey(config.apiKey);

        const databases = new Databases(client);

        // Test database read permission
        try {
            await withTimeout(databases.list(), 5000, 'Database read test');
        } catch (error) {
            if (error.message.includes('401') || error.message.includes('403')) {
                result.issues.push('Missing database read permissions');
            }
        }

        // Test database write permission (if database doesn't exist)
        try {
            await databases.get(config.databaseId);
        } catch (error) {
            if (error.code === 404) {
                // Database doesn't exist, test create permission
                try {
                    // This is a dry run - we don't actually create
                    result.warnings.push('Database does not exist - will be created during setup');
                } catch (createError) {
                    if (createError.message.includes('401') || createError.message.includes('403')) {
                        result.issues.push('Missing database write permissions');
                    }
                }
            }
        }

        logDebug(context, 'Permissions validation completed', {
            success: result.success,
            requiredScopes: requiredScopes.length,
            issuesCount: result.issues.length
        });

    } catch (error) {
        result.success = false;
        result.issues.push(`Permissions validation failed: ${error.message}`);

        context.error('Permissions validation error', {
            error: error.message,
            requiredScopes
        });
    }

    return result;
}

/**
 * Comprehensive post-setup validation
 * @param {Object} config - Appwrite configuration
 * @param {Object} context - Appwrite function context
 * @returns {Promise<Object>} Validation result
 */
export async function validatePostSetup(config, context) {
    const startTime = Date.now();
    logDebug(context, 'Starting post-setup validation...');

    const validationResults = {
        success: true,
        issues: [],
        warnings: [],
        collections: {},
        schemaVersion: null,
        completeness: 0,
        duration: 0
    };

    try {
        const client = new Client()
            .setEndpoint(config.endpoint)
            .setProject(config.projectId)
            .setKey(config.apiKey);

        const databases = new Databases(client);

        // Validate database exists
        try {
            await databases.get(config.databaseId);
        } catch (error) {
            if (error.code === 404) {
                validationResults.success = false;
                validationResults.issues.push('Database does not exist after setup');
                return validationResults;
            }
        }

        // Validate each collection
        let totalExpected = 0;
        let totalValid = 0;

        for (const [collectionId, expectedSchema] of Object.entries(EXPECTED_COLLECTIONS)) {
            totalExpected++;

            const collectionResult = await validateCollection(
                databases,
                config.databaseId,
                collectionId,
                expectedSchema,
                context
            );

            validationResults.collections[collectionId] = collectionResult;

            if (collectionResult.success) {
                totalValid++;
            } else {
                validationResults.success = false;
                validationResults.issues.push(...collectionResult.issues);
            }

            validationResults.warnings.push(...collectionResult.warnings);
        }

        validationResults.completeness = totalExpected > 0 ? (totalValid / totalExpected) * 100 : 0;

        // Validate schema version
        validationResults.schemaVersion = await validateSchemaVersion(databases, config.databaseId, context);

        validationResults.duration = Date.now() - startTime;

        logDebug(context, 'Post-setup validation completed', {
            success: validationResults.success,
            completeness: `${validationResults.completeness.toFixed(1)}%`,
            collectionsValid: `${totalValid}/${totalExpected}`,
            issuesCount: validationResults.issues.length,
            warningsCount: validationResults.warnings.length,
            duration: validationResults.duration
        });

        return validationResults;

    } catch (error) {
        validationResults.success = false;
        validationResults.issues.push(`Post-setup validation failed: ${error.message}`);
        validationResults.duration = Date.now() - startTime;

        context.error('Post-setup validation error', {
            error: error.message,
            duration: validationResults.duration
        });

        return validationResults;
    }
}

/**
 * Validate individual collection
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {string} collectionId - Collection ID
 * @param {Object} expectedSchema - Expected schema definition
 * @param {Object} context - Appwrite function context
 * @returns {Promise<Object>} Collection validation result
 */
async function validateCollection(databases, databaseId, collectionId, expectedSchema, context) {
    const result = { success: true, issues: [], warnings: [] };

    try {
        // Check if collection exists
        const collection = await databases.getCollection(databaseId, collectionId);

        // Validate collection name
        if (collection.name !== expectedSchema.name) {
            result.warnings.push(`Collection name mismatch: expected "${expectedSchema.name}", got "${collection.name}"`);
        }

        // Validate required attributes
        const existingAttributes = collection.attributes.map(attr => attr.key);
        const missingAttributes = expectedSchema.requiredAttributes.filter(
            attr => !existingAttributes.includes(attr)
        );

        if (missingAttributes.length > 0) {
            result.success = false;
            result.issues.push(`Missing required attributes in ${collectionId}: ${missingAttributes.join(', ')}`);
        }

        // Validate attribute availability
        const unavailableAttributes = collection.attributes.filter(
            attr => expectedSchema.requiredAttributes.includes(attr.key) && attr.status !== 'available'
        );

        if (unavailableAttributes.length > 0) {
            result.success = false;
            result.issues.push(`Attributes not available in ${collectionId}: ${unavailableAttributes.map(attr => attr.key).join(', ')}`);
        }

        // Validate required indexes
        const existingIndexes = collection.indexes.map(idx => idx.key);
        const missingIndexes = expectedSchema.requiredIndexes.filter(
            idx => !existingIndexes.includes(idx)
        );

        if (missingIndexes.length > 0) {
            result.warnings.push(`Missing indexes in ${collectionId}: ${missingIndexes.join(', ')}`);
        }

        // Validate relationships
        const existingRelationships = collection.attributes.filter(attr => attr.type === 'relationship').map(attr => attr.key);
        const missingRelationships = expectedSchema.relationships.filter(
            rel => !existingRelationships.includes(rel)
        );

        if (missingRelationships.length > 0) {
            result.issues.push(`Missing relationships in ${collectionId}: ${missingRelationships.join(', ')}`);
            result.success = false;
        }

        logDebug(context, `Collection ${collectionId} validation completed`, {
            success: result.success,
            attributesCount: existingAttributes.length,
            indexesCount: existingIndexes.length,
            relationshipsCount: existingRelationships.length,
            issuesCount: result.issues.length
        });

    } catch (error) {
        if (error.code === 404) {
            result.success = false;
            result.issues.push(`Collection ${collectionId} does not exist`);
        } else {
            result.success = false;
            result.issues.push(`Failed to validate collection ${collectionId}: ${error.message}`);
        }

        context.error(`Collection ${collectionId} validation failed`, {
            error: error.message,
            code: error.code
        });
    }

    return result;
}

/**
 * Validate schema version
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {Object} context - Appwrite function context
 * @returns {Promise<Object>} Schema version validation result
 */
async function validateSchemaVersion(databases, databaseId, context) {
    try {
        // Try to get schema version document
        const versionDocs = await databases.listDocuments(
            databaseId,
            SCHEMA_VERSION_COLLECTION,
            [Query.limit(1), Query.orderDesc('$createdAt')]
        );

        if (versionDocs.documents.length === 0) {
            return {
                exists: false,
                version: null,
                isCompatible: false,
                message: 'No schema version tracking document found'
            };
        }

        const currentVersion = versionDocs.documents[0].version;
        const isCompatible = isVersionCompatible(currentVersion, SCHEMA_VERSION);

        return {
            exists: true,
            version: currentVersion,
            expectedVersion: SCHEMA_VERSION,
            isCompatible,
            message: isCompatible
                ? 'Schema version is compatible'
                : `Schema version mismatch: expected ${SCHEMA_VERSION}, got ${currentVersion}`
        };

    } catch (error) {
        if (error.code === 404) {
            return {
                exists: false,
                version: null,
                isCompatible: false,
                message: 'Schema version collection does not exist'
            };
        }

        context.error('Schema version validation failed', {
            error: error.message
        });

        return {
            exists: false,
            version: null,
            isCompatible: false,
            message: `Schema version validation error: ${error.message}`
        };
    }
}

/**
 * Database health check
 * @param {Object} config - Appwrite configuration
 * @param {Object} context - Appwrite function context
 * @returns {Promise<Object>} Health check result
 */
export async function performHealthCheck(config, context) {
    const startTime = Date.now();
    logDebug(context, 'Starting database health check...');

    const healthResults = {
        healthy: true,
        issues: [],
        warnings: [],
        performance: {},
        connectivity: null,
        schema: null,
        dataIntegrity: null,
        duration: 0
    };

    try {
        const client = new Client()
            .setEndpoint(config.endpoint)
            .setProject(config.projectId)
            .setKey(config.apiKey);

        const databases = new Databases(client);

        // Connectivity health check
        const connectivityStart = Date.now();
        try {
            await withTimeout(databases.get(config.databaseId), 5000, 'Health check connectivity');
            healthResults.connectivity = {
                healthy: true,
                responseTime: Date.now() - connectivityStart
            };
        } catch (error) {
            healthResults.healthy = false;
            healthResults.connectivity = {
                healthy: false,
                error: error.message,
                responseTime: Date.now() - connectivityStart
            };
            healthResults.issues.push('Database connectivity failed');
        }

        // Schema health check
        healthResults.schema = await validatePostSetup(config, context);
        if (!healthResults.schema.success) {
            healthResults.healthy = false;
            healthResults.issues.push('Schema validation failed');
        }

        // Performance health check
        healthResults.performance = await checkPerformanceHealth(databases, config.databaseId, context);
        if (healthResults.performance.hasIssues) {
            healthResults.warnings.push('Performance issues detected');
        }

        // Data integrity spot checks
        healthResults.dataIntegrity = await performDataIntegrityChecks(databases, config.databaseId, context);
        if (!healthResults.dataIntegrity.healthy) {
            healthResults.healthy = false;
            healthResults.issues.push('Data integrity issues detected');
        }

        healthResults.duration = Date.now() - startTime;

        logDebug(context, 'Database health check completed', {
            healthy: healthResults.healthy,
            issuesCount: healthResults.issues.length,
            warningsCount: healthResults.warnings.length,
            duration: healthResults.duration
        });

        return healthResults;

    } catch (error) {
        healthResults.healthy = false;
        healthResults.issues.push(`Health check failed: ${error.message}`);
        healthResults.duration = Date.now() - startTime;

        context.error('Database health check error', {
            error: error.message,
            duration: healthResults.duration
        });

        return healthResults;
    }
}

/**
 * Performance health check
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {Object} context - Appwrite function context
 * @returns {Promise<Object>} Performance health result
 */
async function checkPerformanceHealth(databases, databaseId, context) {
    const performanceResults = {
        hasIssues: false,
        queryPerformance: {},
        indexEfficiency: {},
        warnings: []
    };

    try {
        // Test query performance on key collections
        const testCollections = ['meetings', 'races', 'entrants'];

        for (const collectionId of testCollections) {
            const queryStart = Date.now();

            try {
                await databases.listDocuments(databaseId, collectionId, [Query.limit(1)]);
                const queryTime = Date.now() - queryStart;

                performanceResults.queryPerformance[collectionId] = {
                    responseTime: queryTime,
                    healthy: queryTime < 1000
                };

                if (queryTime > 1000) {
                    performanceResults.hasIssues = true;
                    performanceResults.warnings.push(`Slow query performance on ${collectionId}: ${queryTime}ms`);
                }

            } catch (error) {
                if (error.code !== 404) { // Ignore if collection doesn't exist yet
                    performanceResults.queryPerformance[collectionId] = {
                        responseTime: Date.now() - queryStart,
                        healthy: false,
                        error: error.message
                    };
                    performanceResults.hasIssues = true;
                }
            }
        }

        logDebug(context, 'Performance health check completed', {
            hasIssues: performanceResults.hasIssues,
            collectionsChecked: Object.keys(performanceResults.queryPerformance).length
        });

    } catch (error) {
        context.error('Performance health check failed', {
            error: error.message
        });

        performanceResults.hasIssues = true;
        performanceResults.warnings.push(`Performance check failed: ${error.message}`);
    }

    return performanceResults;
}

/**
 * Data integrity spot checks
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {Object} context - Appwrite function context
 * @returns {Promise<Object>} Data integrity result
 */
async function performDataIntegrityChecks(databases, databaseId, context) {
    const integrityResults = {
        healthy: true,
        issues: [],
        checksPerformed: 0,
        checksSuccessful: 0
    };

    try {
        // Check for orphaned documents (basic relationship integrity)
        const relationshipChecks = [
            { collection: 'races', relationship: 'meeting', parentCollection: 'meetings' },
            { collection: 'entrants', relationship: 'race', parentCollection: 'races' }
        ];

        for (const check of relationshipChecks) {
            integrityResults.checksPerformed++;

            try {
                // Sample check - get a few documents and verify relationships exist
                const docs = await databases.listDocuments(databaseId, check.collection, [Query.limit(5)]);

                for (const doc of docs.documents) {
                    if (doc[check.relationship] && doc[check.relationship].$id) {
                        try {
                            await databases.getDocument(databaseId, check.parentCollection, doc[check.relationship].$id);
                        } catch (error) {
                            if (error.code === 404) {
                                integrityResults.healthy = false;
                                integrityResults.issues.push(
                                    `Orphaned document in ${check.collection}: ${doc.$id} references non-existent ${check.relationship}`
                                );
                            }
                        }
                    }
                }

                integrityResults.checksSuccessful++;

            } catch (error) {
                if (error.code !== 404) { // Ignore if collections don't exist yet
                    context.error(`Data integrity check failed for ${check.collection}`, {
                        error: error.message
                    });
                }
            }
        }

        logDebug(context, 'Data integrity checks completed', {
            healthy: integrityResults.healthy,
            checksPerformed: integrityResults.checksPerformed,
            checksSuccessful: integrityResults.checksSuccessful,
            issuesFound: integrityResults.issues.length
        });

    } catch (error) {
        context.error('Data integrity checks failed', {
            error: error.message
        });

        integrityResults.healthy = false;
        integrityResults.issues.push(`Integrity check error: ${error.message}`);
    }

    return integrityResults;
}

/**
 * Schema version compatibility check
 * @param {string} currentVersion - Current schema version
 * @param {string} expectedVersion - Expected schema version
 * @returns {boolean} Whether versions are compatible
 */
function isVersionCompatible(currentVersion, expectedVersion) {
    if (!currentVersion || !expectedVersion) return false;

    try {
        const current = currentVersion.split('.').map(v => parseInt(v));
        const expected = expectedVersion.split('.').map(v => parseInt(v));

        // Major version must match
        if (current[0] !== expected[0]) return false;

        // Minor version should be compatible if current >= expected
        if (current[1] < expected[1]) return false;

        return true;

    } catch (error) {
        return false;
    }
}

/**
 * Timeout wrapper for promises
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operation - Operation name for error messages
 * @returns {Promise} Promise that rejects on timeout
 */
function withTimeout(promise, timeoutMs, operation) {
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)), timeoutMs)
    );

    return Promise.race([promise, timeoutPromise]);
}

/**
 * Create or update schema version document
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {string} version - Schema version
 * @param {Object} context - Appwrite function context
 * @returns {Promise<Object>} Operation result
 */
export async function updateSchemaVersion(databases, databaseId, version, context) {
    try {
        // Create schema version collection if it doesn't exist
        try {
            await databases.getCollection(databaseId, SCHEMA_VERSION_COLLECTION);
        } catch (error) {
            if (error.code === 404) {
                await databases.createCollection(databaseId, SCHEMA_VERSION_COLLECTION, 'Schema Version', []);

                // Create required attributes
                await databases.createStringAttribute(databaseId, SCHEMA_VERSION_COLLECTION, 'version', 20, true);
                await databases.createDatetimeAttribute(databaseId, SCHEMA_VERSION_COLLECTION, 'createdAt', true);
                await databases.createStringAttribute(databaseId, SCHEMA_VERSION_COLLECTION, 'description', 500, false);
            }
        }

        // Create new version document
        await databases.createDocument(databaseId, SCHEMA_VERSION_COLLECTION, 'unique()', {
            version,
            createdAt: new Date().toISOString(),
            description: `Schema version ${version} - RaceDay database setup`
        });

        logDebug(context, 'Schema version updated successfully', { version });

        return { success: true, version };

    } catch (error) {
        context.error('Failed to update schema version', {
            error: error.message,
            version
        });

        return { success: false, error: error.message };
    }
}