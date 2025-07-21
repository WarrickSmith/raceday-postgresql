import { Client, Databases, Permission, Role, RelationshipType, IndexType } from 'node-appwrite';

interface SetupConfig {
  endpoint: string;
  projectId: string;
  apiKey: string;
  databaseId: string;
}

const collections = {
  meetings: 'meetings',
  races: 'races',
  entrants: 'entrants',
  oddsHistory: 'odds-history',
  moneyFlowHistory: 'money-flow-history',
  userAlertConfigs: 'user-alert-configs',
  notifications: 'notifications',
};

// Utility function for checking if resource exists
const resourceExists = async (checkFn: () => Promise<unknown>): Promise<boolean> => {
  try {
    await checkFn();
    return true;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
      return false;
    }
    throw error;
  }
};

// Check if attribute exists
const attributeExists = async (
  databases: Databases,
  databaseId: string,
  collectionId: string,
  attributeKey: string
): Promise<boolean> => {
  try {
    const collection = await databases.getCollection(databaseId, collectionId);
    const attribute = collection.attributes.find(
      (attr: { key: string }) => attr.key === attributeKey
    );
    return !!attribute;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
      return false;
    }
    throw error;
  }
};

// Check if attribute is available for index creation
const isAttributeAvailable = async (
  databases: Databases,
  databaseId: string,
  collectionId: string,
  attributeKey: string
): Promise<boolean> => {
  try {
    const collection = await databases.getCollection(databaseId, collectionId);
    const attribute = collection.attributes.find(
      (attr: { key: string; status?: string }) => attr.key === attributeKey
    );
    return attribute?.status === 'available';
  } catch {
    return false;
  }
};

// Wait for attribute to become available
const waitForAttributeAvailable = async (
  databases: Databases,
  databaseId: string,
  collectionId: string,
  attributeKey: string,
  context: any,
  maxRetries: number = 10,
  delayMs: number = 1000
): Promise<boolean> => {
  for (let i = 0; i < maxRetries; i++) {
    if (await isAttributeAvailable(databases, databaseId, collectionId, attributeKey)) {
      return true;
    }
    context.log(`Waiting for attribute ${attributeKey} to become available... (${i + 1}/${maxRetries})`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
};

// Setup database and all collections for the race day application
export async function ensureDatabaseSetup(config: SetupConfig, context: any): Promise<void> {
  const client = new Client()
    .setEndpoint(config.endpoint)
    .setProject(config.projectId)
    .setKey(config.apiKey);

  const databases = new Databases(client);

  try {
    context.log('Checking database setup...');

    // Ensure database exists
    const dbExists = await resourceExists(() => databases.get(config.databaseId));
    if (!dbExists) {
      context.log('Creating database...');
      await databases.create(config.databaseId, 'RaceDay Database');
      context.log('Database created successfully');
    }

    // Ensure all collections exist in dependency order
    await ensureMeetingsCollection(databases, config, context);
    await ensureRacesCollection(databases, config, context);
    await ensureEntrantsCollection(databases, config, context);
    await ensureOddsHistoryCollection(databases, config, context);
    await ensureMoneyFlowHistoryCollection(databases, config, context);
    await ensureUserAlertConfigsCollection(databases, config, context);
    await ensureNotificationsCollection(databases, config, context);

    context.log('Database setup verification completed');

  } catch (error) {
    context.error('Database setup failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

async function ensureMeetingsCollection(databases: Databases, config: SetupConfig, context: any): Promise<void> {
  const collectionId = collections.meetings;
  
  // Check if collection exists
  const exists = await resourceExists(() => 
    databases.getCollection(config.databaseId, collectionId)
  );

  if (!exists) {
    context.log('Creating meetings collection...');
    await databases.createCollection(
      config.databaseId,
      collectionId,
      'Meetings',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    );
  }

  // Ensure required attributes exist
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
        await databases.createStringAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.size!,
          attr.required
        );
      } else if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.required
        );
      }
    }
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(config.databaseId, collectionId);

  if (!collection.indexes.some((idx: { key: string }) => idx.key === 'idx_date')) {
    context.log('Creating idx_date index on date...');
    const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'date', context);
    if (!isAvailable) {
      context.log('date attribute is not available for index creation, skipping idx_date index');
    } else {
      try {
        await databases.createIndex(config.databaseId, collectionId, 'idx_date', IndexType.Key, ['date']);
        context.log('idx_date index created successfully');
      } catch (error) {
        context.error(`Failed to create idx_date index: ${error}`);
      }
    }
  }

  if (!collection.indexes.some((idx: { key: string }) => idx.key === 'idx_country')) {
    const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'country', context);
    if (isAvailable) {
      try {
        await databases.createIndex(config.databaseId, collectionId, 'idx_country', IndexType.Key, ['country']);
        context.log('idx_country index created successfully');
      } catch (error) {
        context.error(`Failed to create idx_country index: ${error}`);
      }
    } else {
      context.log('country attribute is not available for index creation, skipping idx_country index');
    }
  }

  if (!collection.indexes.some((idx: { key: string }) => idx.key === 'idx_race_type')) {
    const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'raceType', context);
    if (isAvailable) {
      try {
        await databases.createIndex(config.databaseId, collectionId, 'idx_race_type', IndexType.Key, ['raceType']);
        context.log('idx_race_type index created successfully');
      } catch (error) {
        context.error(`Failed to create idx_race_type index: ${error}`);
      }
    } else {
      context.log('raceType attribute is not available for index creation, skipping idx_race_type index');
    }
  }

  if (!collection.indexes.some((idx: { key: string }) => idx.key === 'idx_meeting_id')) {
    const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'meetingId', context);
    if (isAvailable) {
      try {
        await databases.createIndex(config.databaseId, collectionId, 'idx_meeting_id', IndexType.Unique, ['meetingId']);
        context.log('idx_meeting_id index created successfully');
      } catch (error) {
        context.error(`Failed to create idx_meeting_id index: ${error}`);
      }
    } else {
      context.log('meetingId attribute is not available for index creation, skipping idx_meeting_id index');
    }
  }
}

async function ensureRacesCollection(databases: Databases, config: SetupConfig, context: any): Promise<void> {
  const collectionId = collections.races;
  
  // Check if collection exists
  const exists = await resourceExists(() => 
    databases.getCollection(config.databaseId, collectionId)
  );

  if (!exists) {
    context.log('Creating races collection...');
    await databases.createCollection(
      config.databaseId,
      collectionId,
      'Races',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    );
  }

  // Ensure required attributes exist
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
        await databases.createStringAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.size!,
          attr.required
        );
      } else if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.required
        );
      } else if (attr.type === 'integer') {
        await databases.createIntegerAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.required
        );
      }
    }
  }

  // Ensure relationship to meetings exists
  if (!(await attributeExists(databases, config.databaseId, collectionId, 'meeting'))) {
    context.log('Creating races->meetings relationship...');
    await databases.createRelationshipAttribute(
      config.databaseId,
      collectionId,
      collections.meetings,
      RelationshipType.ManyToOne,
      false,
      'meeting',
      'races'
    );
  }

  // Create indexes for races collection
  const racesCollection = await databases.getCollection(config.databaseId, collectionId);

  if (!racesCollection.indexes.some((idx: { key: string }) => idx.key === 'idx_race_id')) {
    const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'raceId', context);
    if (isAvailable) {
      try {
        await databases.createIndex(config.databaseId, collectionId, 'idx_race_id', IndexType.Unique, ['raceId']);
        context.log('idx_race_id index created successfully');
      } catch (error) {
        context.error(`Failed to create idx_race_id index: ${error}`);
      }
    } else {
      context.log('raceId attribute is not available for index creation, skipping idx_race_id index');
    }
  }

  if (!racesCollection.indexes.some((idx: { key: string }) => idx.key === 'idx_start_time')) {
    const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'startTime', context);
    if (isAvailable) {
      try {
        await databases.createIndex(config.databaseId, collectionId, 'idx_start_time', IndexType.Key, ['startTime']);
        context.log('idx_start_time index created successfully');
      } catch (error) {
        context.error(`Failed to create idx_start_time index: ${error}`);
      }
    } else {
      context.log('startTime attribute is not available for index creation, skipping idx_start_time index');
    }
  }

  if (!racesCollection.indexes.some((idx: { key: string }) => idx.key === 'idx_race_number')) {
    const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'raceNumber', context);
    if (isAvailable) {
      try {
        await databases.createIndex(config.databaseId, collectionId, 'idx_race_number', IndexType.Key, ['raceNumber']);
        context.log('idx_race_number index created successfully');
      } catch (error) {
        context.error(`Failed to create idx_race_number index: ${error}`);
      }
    } else {
      context.log('raceNumber attribute is not available for index creation, skipping idx_race_number index');
    }
  }
}

async function ensureEntrantsCollection(databases: Databases, config: SetupConfig, context: any): Promise<void> {
  const collectionId = collections.entrants;
  
  // Check if collection exists
  const exists = await resourceExists(() => 
    databases.getCollection(config.databaseId, collectionId)
  );

  if (!exists) {
    context.log('Creating entrants collection...');
    await databases.createCollection(
      config.databaseId,
      collectionId,
      'Entrants',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    );
  }

  // Ensure required attributes exist
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
        await databases.createStringAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.size!,
          attr.required
        );
      } else if (attr.type === 'integer') {
        await databases.createIntegerAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.required
        );
      } else if (attr.type === 'float') {
        await databases.createFloatAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.required
        );
      } else if (attr.type === 'boolean') {
        await databases.createBooleanAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.required,
          attr.default
        );
      }
    }
  }

  // Ensure relationship to races exists
  if (!(await attributeExists(databases, config.databaseId, collectionId, 'race'))) {
    context.log('Creating entrants->races relationship...');
    await databases.createRelationshipAttribute(
      config.databaseId,
      collectionId,
      collections.races,
      RelationshipType.ManyToOne,
      false,
      'race',
      'entrants'
    );
  }

  // Create indexes for entrants collection
  const entrantsCollection = await databases.getCollection(config.databaseId, collectionId);

  if (!entrantsCollection.indexes.some((idx: { key: string }) => idx.key === 'idx_entrant_id')) {
    const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'entrantId', context);
    if (isAvailable) {
      try {
        await databases.createIndex(config.databaseId, collectionId, 'idx_entrant_id', IndexType.Unique, ['entrantId']);
        context.log('idx_entrant_id index created successfully');
      } catch (error) {
        context.error(`Failed to create idx_entrant_id index: ${error}`);
      }
    } else {
      context.log('entrantId attribute is not available for index creation, skipping idx_entrant_id index');
    }
  }

  if (!entrantsCollection.indexes.some((idx: { key: string }) => idx.key === 'idx_runner_number')) {
    const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'runnerNumber', context);
    if (isAvailable) {
      try {
        await databases.createIndex(config.databaseId, collectionId, 'idx_runner_number', IndexType.Key, ['runnerNumber']);
        context.log('idx_runner_number index created successfully');
      } catch (error) {
        context.error(`Failed to create idx_runner_number index: ${error}`);
      }
    } else {
      context.log('runnerNumber attribute is not available for index creation, skipping idx_runner_number index');
    }
  }
}

async function ensureOddsHistoryCollection(databases: Databases, config: SetupConfig, context: any): Promise<void> {
  const collectionId = collections.oddsHistory;
  
  // Check if collection exists
  const exists = await resourceExists(() => 
    databases.getCollection(config.databaseId, collectionId)
  );

  if (!exists) {
    context.log('Creating odds history collection...');
    await databases.createCollection(
      config.databaseId,
      collectionId,
      'OddsHistory',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    );
  }

  // Ensure required attributes exist
  const requiredAttributes = [
    { key: 'odds', type: 'float', required: true },
    { key: 'eventTimestamp', type: 'datetime', required: true },
    { key: 'type', type: 'string', size: 20, required: true },
  ];

  for (const attr of requiredAttributes) {
    if (!(await attributeExists(databases, config.databaseId, collectionId, attr.key))) {
      context.log(`Creating odds history attribute: ${attr.key}`);
      
      if (attr.type === 'string') {
        await databases.createStringAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.size!,
          attr.required
        );
      } else if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.required
        );
      } else if (attr.type === 'float') {
        await databases.createFloatAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.required
        );
      }
    }
  }

  // Ensure relationship to entrants exists
  if (!(await attributeExists(databases, config.databaseId, collectionId, 'entrant'))) {
    context.log('Creating odds history->entrants relationship...');
    await databases.createRelationshipAttribute(
      config.databaseId,
      collectionId,
      collections.entrants,
      RelationshipType.ManyToOne,
      false,
      'entrant',
      'oddsHistory'
    );
  }

  // Create indexes for odds history collection
  const oddsCollection = await databases.getCollection(config.databaseId, collectionId);

  if (!oddsCollection.indexes.some((idx: { key: string }) => idx.key === 'idx_timestamp')) {
    const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'eventTimestamp', context);
    if (isAvailable) {
      try {
        await databases.createIndex(config.databaseId, collectionId, 'idx_timestamp', IndexType.Key, ['eventTimestamp']);
        context.log('idx_timestamp index created successfully for odds history');
      } catch (error) {
        context.error(`Failed to create idx_timestamp index for odds history: ${error}`);
      }
    } else {
      context.log('eventTimestamp attribute is not available for index creation, skipping idx_timestamp index');
    }
  }
}

async function ensureMoneyFlowHistoryCollection(databases: Databases, config: SetupConfig, context: any): Promise<void> {
  const collectionId = collections.moneyFlowHistory;
  
  // Check if collection exists
  const exists = await resourceExists(() => 
    databases.getCollection(config.databaseId, collectionId)
  );

  if (!exists) {
    context.log('Creating money flow history collection...');
    await databases.createCollection(
      config.databaseId,
      collectionId,
      'MoneyFlowHistory',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    );
  }

  // Ensure required attributes exist
  const requiredAttributes = [
    { key: 'holdPercentage', type: 'float', required: true },
    { key: 'eventTimestamp', type: 'datetime', required: true },
  ];

  for (const attr of requiredAttributes) {
    if (!(await attributeExists(databases, config.databaseId, collectionId, attr.key))) {
      context.log(`Creating money flow history attribute: ${attr.key}`);
      
      if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.required
        );
      } else if (attr.type === 'float') {
        await databases.createFloatAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.required
        );
      }
    }
  }

  // Ensure relationship to entrants exists
  if (!(await attributeExists(databases, config.databaseId, collectionId, 'entrant'))) {
    context.log('Creating money flow history->entrants relationship...');
    await databases.createRelationshipAttribute(
      config.databaseId,
      collectionId,
      collections.entrants,
      RelationshipType.ManyToOne,
      false,
      'entrant',
      'moneyFlowHistory'
    );
  }

  // Create indexes for money flow history collection
  const moneyFlowCollection = await databases.getCollection(config.databaseId, collectionId);

  if (!moneyFlowCollection.indexes.some((idx: { key: string }) => idx.key === 'idx_timestamp')) {
    const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'eventTimestamp', context);
    if (isAvailable) {
      try {
        await databases.createIndex(config.databaseId, collectionId, 'idx_timestamp', IndexType.Key, ['eventTimestamp']);
        context.log('idx_timestamp index created successfully for money flow history');
      } catch (error) {
        context.error(`Failed to create idx_timestamp index for money flow history: ${error}`);
      }
    } else {
      context.log('eventTimestamp attribute is not available for index creation, skipping idx_timestamp index');
    }
  }
}

async function ensureUserAlertConfigsCollection(databases: Databases, config: SetupConfig, context: any): Promise<void> {
  const collectionId = collections.userAlertConfigs;
  
  // Check if collection exists
  const exists = await resourceExists(() => 
    databases.getCollection(config.databaseId, collectionId)
  );

  if (!exists) {
    context.log('Creating user alert configs collection...');
    await databases.createCollection(
      config.databaseId,
      collectionId,
      'UserAlertConfigs',
      [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    );
  }

  // Ensure required attributes exist
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
        await databases.createStringAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.size!,
          attr.required
        );
      } else if (attr.type === 'integer') {
        await databases.createIntegerAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.required
        );
      } else if (attr.type === 'float') {
        await databases.createFloatAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.required
        );
      } else if (attr.type === 'boolean') {
        await databases.createBooleanAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.required
        );
      }
    }
  }

  // Ensure relationship to entrants exists
  if (!(await attributeExists(databases, config.databaseId, collectionId, 'entrant'))) {
    context.log('Creating user alert configs->entrants relationship...');
    await databases.createRelationshipAttribute(
      config.databaseId,
      collectionId,
      collections.entrants,
      RelationshipType.ManyToOne,
      false,
      'entrant',
      'alertConfigs'
    );
  }

  // Create indexes for user alert configs collection
  const alertConfigsCollection = await databases.getCollection(config.databaseId, collectionId);

  if (!alertConfigsCollection.indexes.some((idx: { key: string }) => idx.key === 'idx_user_id')) {
    const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'userId', context);
    if (isAvailable) {
      try {
        await databases.createIndex(config.databaseId, collectionId, 'idx_user_id', IndexType.Key, ['userId']);
        context.log('idx_user_id index created successfully for user alert configs');
      } catch (error) {
        context.error(`Failed to create idx_user_id index for user alert configs: ${error}`);
      }
    } else {
      context.log('userId attribute is not available for index creation, skipping idx_user_id index');
    }
  }

  if (!alertConfigsCollection.indexes.some((idx: { key: string }) => idx.key === 'idx_alert_type')) {
    const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'alertType', context);
    if (isAvailable) {
      try {
        await databases.createIndex(config.databaseId, collectionId, 'idx_alert_type', IndexType.Key, ['alertType']);
        context.log('idx_alert_type index created successfully for user alert configs');
      } catch (error) {
        context.error(`Failed to create idx_alert_type index for user alert configs: ${error}`);
      }
    } else {
      context.log('alertType attribute is not available for index creation, skipping idx_alert_type index');
    }
  }
}

async function ensureNotificationsCollection(databases: Databases, config: SetupConfig, context: any): Promise<void> {
  const collectionId = collections.notifications;
  
  // Check if collection exists
  const exists = await resourceExists(() => 
    databases.getCollection(config.databaseId, collectionId)
  );

  if (!exists) {
    context.log('Creating notifications collection...');
    await databases.createCollection(
      config.databaseId,
      collectionId,
      'Notifications',
      [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    );
  }

  // Ensure required attributes exist
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
        await databases.createStringAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.size!,
          attr.required
        );
      } else if (attr.type === 'boolean') {
        await databases.createBooleanAttribute(
          config.databaseId,
          collectionId,
          attr.key,
          attr.required,
          attr.default
        );
      }
    }
  }

  // Create indexes for notifications collection
  const notificationsCollection = await databases.getCollection(config.databaseId, collectionId);

  if (!notificationsCollection.indexes.some((idx: { key: string }) => idx.key === 'idx_user_id')) {
    const isAvailable = await waitForAttributeAvailable(databases, config.databaseId, collectionId, 'userId', context);
    if (isAvailable) {
      try {
        await databases.createIndex(config.databaseId, collectionId, 'idx_user_id', IndexType.Key, ['userId']);
        context.log('idx_user_id index created successfully for notifications');
      } catch (error) {
        context.error(`Failed to create idx_user_id index for notifications: ${error}`);
      }
    } else {
      context.log('userId attribute is not available for index creation, skipping idx_user_id index');
    }
  }
}