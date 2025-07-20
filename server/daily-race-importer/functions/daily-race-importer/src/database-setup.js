import { Client, Databases, Permission, Role, RelationshipType } from 'node-appwrite';
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
export async function ensureDatabaseSetup(config, context) {
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
        await ensureMeetingsCollection(databases, config, context);
        await ensureRacesCollection(databases, config, context);
        await ensureEntrantsCollection(databases, config, context);
        await ensureOddsHistoryCollection(databases, config, context);
        await ensureMoneyFlowHistoryCollection(databases, config, context);
        await ensureUserAlertConfigsCollection(databases, config, context);
        await ensureNotificationsCollection(databases, config, context);
        context.log('Database setup verification completed');
    }
    catch (error) {
        context.error('Database setup failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
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
            Permission.create(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users()),
        ]);
    }
    const requiredAttributes = [
        { key: 'meetingId', type: 'string', size: 50, required: true },
        { key: 'meetingName', type: 'string', size: 255, required: true },
        { key: 'country', type: 'string', size: 10, required: true },
        { key: 'raceType', type: 'string', size: 50, required: true },
        { key: 'date', type: 'datetime', required: true },
        { key: 'trackCondition', type: 'string', size: 50, required: false },
        { key: 'status', type: 'string', size: 50, required: true },
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
}
async function ensureRacesCollection(databases, config, context) {
    const collectionId = collections.races;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        context.log('Creating races collection...');
        await databases.createCollection(config.databaseId, collectionId, 'Races', [
            Permission.read(Role.any()),
            Permission.create(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users()),
        ]);
    }
    const requiredAttributes = [
        { key: 'raceId', type: 'string', size: 50, required: true },
        { key: 'name', type: 'string', size: 255, required: true },
        { key: 'raceNumber', type: 'integer', required: true },
        { key: 'startTime', type: 'datetime', required: true },
        { key: 'distance', type: 'integer', required: false },
        { key: 'trackCondition', type: 'string', size: 100, required: false },
        { key: 'weather', type: 'string', size: 50, required: false },
        { key: 'status', type: 'string', size: 50, required: true },
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
        }
    }
    if (!(await attributeExists(databases, config.databaseId, collectionId, 'meeting'))) {
        context.log('Creating races->meetings relationship...');
        await databases.createRelationshipAttribute(config.databaseId, collectionId, collections.meetings, RelationshipType.ManyToOne, false, 'meeting', 'races');
    }
}
async function ensureEntrantsCollection(databases, config, context) {
    const collectionId = collections.entrants;
    const exists = await resourceExists(() => databases.getCollection(config.databaseId, collectionId));
    if (!exists) {
        context.log('Creating entrants collection...');
        await databases.createCollection(config.databaseId, collectionId, 'Entrants', [
            Permission.read(Role.any()),
            Permission.create(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users()),
        ]);
    }
    const requiredAttributes = [
        { key: 'entrantId', type: 'string', size: 50, required: true },
        { key: 'name', type: 'string', size: 255, required: true },
        { key: 'runnerNumber', type: 'integer', required: true },
        { key: 'jockey', type: 'string', size: 255, required: false },
        { key: 'trainerName', type: 'string', size: 255, required: false },
        { key: 'weight', type: 'string', size: 50, required: false },
        { key: 'winOdds', type: 'float', required: false },
        { key: 'placeOdds', type: 'float', required: false },
        { key: 'holdPercentage', type: 'float', required: false },
        { key: 'isScratched', type: 'boolean', required: false, default: false },
    ];
    for (const attr of requiredAttributes) {
        if (!(await attributeExists(databases, config.databaseId, collectionId, attr.key))) {
            context.log(`Creating entrants attribute: ${attr.key}`);
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
        }
    }
    if (!(await attributeExists(databases, config.databaseId, collectionId, 'race'))) {
        context.log('Creating entrants->races relationship...');
        await databases.createRelationshipAttribute(config.databaseId, collectionId, collections.races, RelationshipType.ManyToOne, false, 'race', 'entrants');
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
    ];
    for (const attr of requiredAttributes) {
        if (!(await attributeExists(databases, config.databaseId, collectionId, attr.key))) {
            context.log(`Creating money flow history attribute: ${attr.key}`);
            if (attr.type === 'datetime') {
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
}
