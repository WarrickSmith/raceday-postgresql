import { Client, Databases, Permission, Role, RelationshipType } from 'node-appwrite';

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
}