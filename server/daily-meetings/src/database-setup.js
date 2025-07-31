import { Client, Databases, Permission, Role, RelationshipType, IndexType } from 'node-appwrite';
const collections = {
    meetings: 'meetings',
    races: 'races',
    entrants: 'entrants',
    oddsHistory: 'odds-history',
    moneyFlowHistory: 'money-flow-history',
    userAlertConfigs: 'user-alert-configs',
    notifications: 'notifications',
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
const waitForAttributeAvailable = async (databases, databaseId, collectionId, attributeKey, context, maxRetries = 3, delayMs = 1000) => {
    context.log(`Starting to wait for attribute ${attributeKey} to become available...`);
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            const isAvailable = await isAttributeAvailable(databases, databaseId, collectionId, attributeKey);
            if (isAvailable) {
                context.log(`Attribute ${attributeKey} is now available after ${i + 1} attempts`);
                return true;
            }
            context.log(`Waiting for attribute ${attributeKey} to become available... (${i + 1}/${maxRetries})`);
            
            if (i < maxRetries - 1) { // Don't wait after the last attempt
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        } catch (error) {
            context.error(`Error checking attribute ${attributeKey} availability`, {
                error: error instanceof Error ? error.message : 'Unknown error',
                attempt: i + 1
            });
            // Continue to next attempt instead of breaking
        }
    }
    
    context.log(`Attribute ${attributeKey} did not become available after ${maxRetries} attempts, continuing anyway...`);
    return false;
};
export async function ensureDatabaseSetup(config, context) {
    const setupStartTime = Date.now();
    const client = new Client()
        .setEndpoint(config.endpoint)
        .setProject(config.projectId)
        .setKey(config.apiKey);
    const databases = new Databases(client);
    try {
        context.log('Checking database setup...');
        const dbExists = await resourceExists(() => databases.get(config.databaseId));
        if (!dbExists) {
            context.log('Creating database...');
            await databases.create(config.databaseId, 'RaceDay Database');
            context.log('Database created successfully');
        }
        
        const collectionsStart = Date.now();
        await ensureMeetingsCollection(databases, config, context);
        await ensureRacesCollection(databases, config, context);
        
        // Entrants collection is the most complex - track it separately
        const entrantsStart = Date.now();
        await ensureEntrantsCollection(databases, config, context);
        const entrantsDuration = Date.now() - entrantsStart;
        context.log(`Entrants collection setup completed in ${entrantsDuration}ms`);
        
        await ensureOddsHistoryCollection(databases, config, context);
        await ensureMoneyFlowHistoryCollection(databases, config, context);
        await ensureUserAlertConfigsCollection(databases, config, context);
        await ensureNotificationsCollection(databases, config, context);
        
        const totalDuration = Date.now() - setupStartTime;
        context.log(`Database setup verification completed in ${totalDuration}ms`);
    }
    catch (error) {
        const totalDuration = Date.now() - setupStartTime;
        context.error('Database setup failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            duration: totalDuration
        });
        throw error;
    }
}
async function ensureMeetingsCollection(databases, config, context) {
    const collectionId = collections.meetings;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        context.log('Creating meetings collection...');
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
    for (const attr of requiredAttributes) {
        if (!(await attributeExists(databases, config.databaseId, collectionId, attr.key))) {
            context.log(`Creating meetings attribute: ${attr.key}`);
            if (attr.type === 'string') {
                await databases.createStringAttribute(config.databaseId, collectionId, attr.key, attr.size, attr.required);
            }
            else if (attr.type === 'datetime') {
                await databases.createDatetimeAttribute(config.databaseId, collectionId, attr.key, attr.required);
            }
        }
    }
    const collection = await databases.getCollection(config.databaseId, collectionId);
    if (!collection.indexes.some((idx) => idx.key === 'idx_date')) {
        context.log('Creating idx_date index on date...');
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'date', context);
        if (!isAvailable) {
            context.log('date attribute is not available for index creation, skipping idx_date index');
        }
        else {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_date', IndexType.Key, ['date']);
                context.log('idx_date index created successfully');
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
                context.log('idx_country index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_country index: ${error}`);
            }
        }
        else {
            context.log('country attribute is not available for index creation, skipping idx_country index');
        }
    }
    if (!collection.indexes.some((idx) => idx.key === 'idx_race_type')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'raceType', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_race_type', IndexType.Key, ['raceType']);
                context.log('idx_race_type index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_race_type index: ${error}`);
            }
        }
        else {
            context.log('raceType attribute is not available for index creation, skipping idx_race_type index');
        }
    }
    if (!collection.indexes.some((idx) => idx.key === 'idx_meeting_id')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'meetingId', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_meeting_id', IndexType.Unique, ['meetingId']);
                context.log('idx_meeting_id index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_meeting_id index: ${error}`);
            }
        }
        else {
            context.log('meetingId attribute is not available for index creation, skipping idx_meeting_id index');
        }
    }
}
async function ensureRacesCollection(databases, config, context) {
    const collectionId = collections.races;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        context.log('Creating races collection...');
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
    ];
    for (const attr of requiredAttributes) {
        if (!(await attributeExists(databases, config.databaseId, collectionId, attr.key))) {
            context.log(`Creating races attribute: ${attr.key}`);
            if (attr.type === 'string') {
                await databases.createStringAttribute(config.databaseId, collectionId, attr.key, attr.size, attr.required);
            }
            else if (attr.type === 'datetime') {
                await databases.createDatetimeAttribute(config.databaseId, collectionId, attr.key, attr.required);
            }
            else if (attr.type === 'integer') {
                await databases.createIntegerAttribute(config.databaseId, collectionId, attr.key, attr.required);
            }
            else if (attr.type === 'boolean') {
                await databases.createBooleanAttribute(config.databaseId, collectionId, attr.key, attr.required);
            }
        }
    }
    if (!(await attributeExists(databases, config.databaseId, collectionId, 'meeting'))) {
        context.log('Creating races->meetings relationship...');
        await databases.createRelationshipAttribute(config.databaseId, collectionId, collections.meetings, RelationshipType.ManyToOne, false, 'meeting', 'races');
    }
    const racesCollection = await databases.getCollection(config.databaseId, collectionId);
    if (!racesCollection.indexes.some((idx) => idx.key === 'idx_race_id')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'raceId', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_race_id', IndexType.Unique, ['raceId']);
                context.log('idx_race_id index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_race_id index: ${error}`);
            }
        }
        else {
            context.log('raceId attribute is not available for index creation, skipping idx_race_id index');
        }
    }
    if (!racesCollection.indexes.some((idx) => idx.key === 'idx_start_time')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'startTime', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_start_time', IndexType.Key, ['startTime']);
                context.log('idx_start_time index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_start_time index: ${error}`);
            }
        }
        else {
            context.log('startTime attribute is not available for index creation, skipping idx_start_time index');
        }
    }
    if (!racesCollection.indexes.some((idx) => idx.key === 'idx_race_number')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'raceNumber', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_race_number', IndexType.Key, ['raceNumber']);
                context.log('idx_race_number index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_race_number index: ${error}`);
            }
        }
        else {
            context.log('raceNumber attribute is not available for index creation, skipping idx_race_number index');
        }
    }
}
async function ensureEntrantsCollection(databases, config, context) {
    const collectionId = collections.entrants;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        context.log('Creating entrants collection...');
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
    // Create attributes with progress tracking
    let attributesCreated = 0;
    const totalNewAttributes = requiredAttributes.length;
    
    for (const attr of requiredAttributes) {
        if (!(await attributeExists(databases, config.databaseId, collectionId, attr.key))) {
            context.log(`Creating entrants attribute (${attributesCreated + 1}/${totalNewAttributes}): ${attr.key}`);
            const startTime = Date.now();
            
            try {
                if (attr.type === 'string') {
                    await databases.createStringAttribute(config.databaseId, collectionId, attr.key, attr.size, attr.required);
                }
                else if (attr.type === 'integer') {
                    await databases.createIntegerAttribute(config.databaseId, collectionId, attr.key, attr.required);
                }
                else if (attr.type === 'float') {
                    await databases.createFloatAttribute(config.databaseId, collectionId, attr.key, attr.required);
                }
                else if (attr.type === 'boolean') {
                    await databases.createBooleanAttribute(config.databaseId, collectionId, attr.key, attr.required, attr.default);
                }
                else if (attr.type === 'datetime') {
                    await databases.createDatetimeAttribute(config.databaseId, collectionId, attr.key, attr.required);
                }
                
                const duration = Date.now() - startTime;
                context.log(`Created attribute ${attr.key} in ${duration}ms`);
                attributesCreated++;
            } catch (error) {
                context.error(`Failed to create attribute ${attr.key}`, {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    type: attr.type,
                    duration: Date.now() - startTime
                });
            }
        }
    }
    
    if (attributesCreated > 0) {
        context.log(`Created ${attributesCreated} new entrant attributes`);
    }
    if (!(await attributeExists(databases, config.databaseId, collectionId, 'race'))) {
        context.log('Creating entrants->races relationship...');
        await databases.createRelationshipAttribute(config.databaseId, collectionId, collections.races, RelationshipType.ManyToOne, false, 'race', 'entrants');
    }
    const entrantsCollection = await databases.getCollection(config.databaseId, collectionId);
    if (!entrantsCollection.indexes.some((idx) => idx.key === 'idx_entrant_id')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'entrantId', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_entrant_id', IndexType.Unique, ['entrantId']);
                context.log('idx_entrant_id index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_entrant_id index: ${error}`);
            }
        }
        else {
            context.log('entrantId attribute is not available for index creation, skipping idx_entrant_id index');
        }
    }
    if (!entrantsCollection.indexes.some((idx) => idx.key === 'idx_runner_number')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'runnerNumber', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_runner_number', IndexType.Key, ['runnerNumber']);
                context.log('idx_runner_number index created successfully');
            }
            catch (error) {
                context.error(`Failed to create idx_runner_number index: ${error}`);
            }
        }
        else {
            context.log('runnerNumber attribute is not available for index creation, skipping idx_runner_number index');
        }
    }
}

async function ensureOddsHistoryCollection(databases, config, context) {
    const collectionId = collections.oddsHistory;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        context.log('Creating odds history collection...');
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
    for (const attr of requiredAttributes) {
        if (!(await attributeExists(databases, config.databaseId, collectionId, attr.key))) {
            context.log(`Creating odds history attribute: ${attr.key}`);
            if (attr.type === 'string') {
                await databases.createStringAttribute(config.databaseId, collectionId, attr.key, attr.size, attr.required);
            }
            else if (attr.type === 'datetime') {
                await databases.createDatetimeAttribute(config.databaseId, collectionId, attr.key, attr.required);
            }
            else if (attr.type === 'float') {
                await databases.createFloatAttribute(config.databaseId, collectionId, attr.key, attr.required);
            }
        }
    }
    if (!(await attributeExists(databases, config.databaseId, collectionId, 'entrant'))) {
        context.log('Creating odds history->entrants relationship...');
        await databases.createRelationshipAttribute(config.databaseId, collectionId, collections.entrants, RelationshipType.ManyToOne, false, 'entrant', 'oddsHistory');
    }
    const oddsCollection = await databases.getCollection(config.databaseId, collectionId);
    if (!oddsCollection.indexes.some((idx) => idx.key === 'idx_timestamp')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'eventTimestamp', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_timestamp', IndexType.Key, ['eventTimestamp']);
                context.log('idx_timestamp index created successfully for odds history');
            }
            catch (error) {
                context.error(`Failed to create idx_timestamp index for odds history: ${error}`);
            }
        }
        else {
            context.log('eventTimestamp attribute is not available for index creation, skipping idx_timestamp index');
        }
    }
    // Note: Cannot create compound indexes with relationship attributes in Appwrite
    // The existing idx_timestamp index on eventTimestamp is sufficient for time-based queries
    // Cross-entrant queries can use the entrant relationship field directly
}
async function ensureMoneyFlowHistoryCollection(databases, config, context) {
    const collectionId = collections.moneyFlowHistory;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        context.log('Creating money flow history collection...');
        await databases.createCollection(config.databaseId, collectionId, 'MoneyFlowHistory', [
            Permission.read(Role.any()),
            Permission.create(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users()),
        ]);
    }
    const requiredAttributes = [
        { key: 'holdPercentage', type: 'float', required: true },
        { key: 'eventTimestamp', type: 'datetime', required: true },
        { key: 'type', type: 'string', size: 20, required: true },
    ];
    for (const attr of requiredAttributes) {
        if (!(await attributeExists(databases, config.databaseId, collectionId, attr.key))) {
            context.log(`Creating money flow history attribute: ${attr.key}`);
            if (attr.type === 'string') {
                await databases.createStringAttribute(config.databaseId, collectionId, attr.key, attr.size, attr.required);
            }
            else if (attr.type === 'datetime') {
                await databases.createDatetimeAttribute(config.databaseId, collectionId, attr.key, attr.required);
            }
            else if (attr.type === 'float') {
                await databases.createFloatAttribute(config.databaseId, collectionId, attr.key, attr.required);
            }
        }
    }
    if (!(await attributeExists(databases, config.databaseId, collectionId, 'entrant'))) {
        context.log('Creating money flow history->entrants relationship...');
        await databases.createRelationshipAttribute(config.databaseId, collectionId, collections.entrants, RelationshipType.ManyToOne, false, 'entrant', 'moneyFlowHistory');
    }
    const moneyFlowCollection = await databases.getCollection(config.databaseId, collectionId);
    if (!moneyFlowCollection.indexes.some((idx) => idx.key === 'idx_timestamp')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'eventTimestamp', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_timestamp', IndexType.Key, ['eventTimestamp']);
                context.log('idx_timestamp index created successfully for money flow history');
            }
            catch (error) {
                context.error(`Failed to create idx_timestamp index for money flow history: ${error}`);
            }
        }
        else {
            context.log('eventTimestamp attribute is not available for index creation, skipping idx_timestamp index');
        }
    }
    // Note: Cannot create compound indexes with relationship attributes in Appwrite
    // The existing idx_timestamp index on eventTimestamp is sufficient for time-based queries
    // Cross-entrant queries can use the entrant relationship field directly
}
async function ensureUserAlertConfigsCollection(databases, config, context) {
    const collectionId = collections.userAlertConfigs;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        context.log('Creating user alert configs collection...');
        await databases.createCollection(config.databaseId, collectionId, 'UserAlertConfigs', [
            Permission.read(Role.users()),
            Permission.create(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users()),
        ]);
    }
    const requiredAttributes = [
        { key: 'userId', type: 'string', size: 50, required: true },
        { key: 'alertType', type: 'string', size: 50, required: true },
        { key: 'threshold', type: 'float', required: true },
        { key: 'timeWindowSeconds', type: 'integer', required: false },
        { key: 'enabled', type: 'boolean', required: true },
    ];
    for (const attr of requiredAttributes) {
        if (!(await attributeExists(databases, config.databaseId, collectionId, attr.key))) {
            context.log(`Creating user alert configs attribute: ${attr.key}`);
            if (attr.type === 'string') {
                await databases.createStringAttribute(config.databaseId, collectionId, attr.key, attr.size, attr.required);
            }
            else if (attr.type === 'integer') {
                await databases.createIntegerAttribute(config.databaseId, collectionId, attr.key, attr.required);
            }
            else if (attr.type === 'float') {
                await databases.createFloatAttribute(config.databaseId, collectionId, attr.key, attr.required);
            }
            else if (attr.type === 'boolean') {
                await databases.createBooleanAttribute(config.databaseId, collectionId, attr.key, attr.required);
            }
        }
    }
    if (!(await attributeExists(databases, config.databaseId, collectionId, 'entrant'))) {
        context.log('Creating user alert configs->entrants relationship...');
        await databases.createRelationshipAttribute(config.databaseId, collectionId, collections.entrants, RelationshipType.ManyToOne, false, 'entrant', 'alertConfigs');
    }
    const alertConfigsCollection = await databases.getCollection(config.databaseId, collectionId);
    if (!alertConfigsCollection.indexes.some((idx) => idx.key === 'idx_user_id')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'userId', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_user_id', IndexType.Key, ['userId']);
                context.log('idx_user_id index created successfully for user alert configs');
            }
            catch (error) {
                context.error(`Failed to create idx_user_id index for user alert configs: ${error}`);
            }
        }
        else {
            context.log('userId attribute is not available for index creation, skipping idx_user_id index');
        }
    }
    if (!alertConfigsCollection.indexes.some((idx) => idx.key === 'idx_alert_type')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'alertType', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_alert_type', IndexType.Key, ['alertType']);
                context.log('idx_alert_type index created successfully for user alert configs');
            }
            catch (error) {
                context.error(`Failed to create idx_alert_type index for user alert configs: ${error}`);
            }
        }
        else {
            context.log('alertType attribute is not available for index creation, skipping idx_alert_type index');
        }
    }
}
async function ensureNotificationsCollection(databases, config, context) {
    const collectionId = collections.notifications;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        context.log('Creating notifications collection...');
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
    for (const attr of requiredAttributes) {
        if (!(await attributeExists(databases, config.databaseId, collectionId, attr.key))) {
            context.log(`Creating notifications attribute: ${attr.key}`);
            if (attr.type === 'string') {
                await databases.createStringAttribute(config.databaseId, collectionId, attr.key, attr.size, attr.required);
            }
            else if (attr.type === 'boolean') {
                await databases.createBooleanAttribute(config.databaseId, collectionId, attr.key, attr.required, attr.default);
            }
        }
    }
    const notificationsCollection = await databases.getCollection(config.databaseId, collectionId);
    if (!notificationsCollection.indexes.some((idx) => idx.key === 'idx_user_id')) {
        const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'userId', context);
        if (isAvailable) {
            try {
                await databases.createIndex(config.databaseId, collectionId, 'idx_user_id', IndexType.Key, ['userId']);
                context.log('idx_user_id index created successfully for notifications');
            }
            catch (error) {
                context.error(`Failed to create idx_user_id index for notifications: ${error}`);
            }
        }
        else {
            context.log('userId attribute is not available for index creation, skipping idx_user_id index');
        }
    }
}
