#!/usr/bin/env node

import { config as loadEnv } from 'dotenv'
import {
  Client,
  Databases,
  Permission,
  Role,
  IndexType,
  RelationshipType,
} from 'node-appwrite'

// Load environment variables from .env.local
loadEnv({ path: '.env.local' })

// Configuration
const config = {
  endpoint: process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.APPWRITE_PROJECT_ID || '',
  apiKey: process.env.APPWRITE_API_KEY || '',
  databaseId: 'raceday-db',
  collections: {
    meetings: 'meetings',
    races: 'races',
    entrants: 'entrants',
    entrantsHistory: 'entrants-history',
    oddsHistory: 'odds-history',
    moneyFlowHistory: 'money-flow-history',
    userAlertConfigs: 'user-alert-configs',
    notifications: 'notifications',
  },
}

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey)

const databases = new Databases(client)

// Utility function for logging
const log = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
  const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'
  console.log(`${prefix} ${message}`)
}

// Check if resource exists (idempotent helper)
const resourceExists = async (
  checkFn: () => Promise<unknown>
): Promise<boolean> => {
  try {
    await checkFn()
    return true
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 404
    ) {
      return false
    }
    throw error
  }
}

// Check if attribute exists (idempotent helper for attributes)
const attributeExists = async (
  collectionId: string,
  attributeKey: string
): Promise<boolean> => {
  try {
    const collection = await databases.getCollection(
      config.databaseId,
      collectionId
    )
    const attribute = collection.attributes.find(
      (attr: { key: string; status?: string }) => attr.key === attributeKey
    )
    return !!attribute // Return true if attribute exists, regardless of status
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 404
    ) {
      return false
    }
    throw error
  }
}

// Check if attribute is available for index creation
const isAttributeAvailable = async (
  collectionId: string,
  attributeKey: string
): Promise<boolean> => {
  try {
    const collection = await databases.getCollection(
      config.databaseId,
      collectionId
    )
    const attribute = collection.attributes.find(
      (attr: { key: string; status?: string }) => attr.key === attributeKey
    )
    return attribute?.status === 'available'
  } catch {
    return false
  }
}

// Wait for attribute to become available
const waitForAttributeAvailable = async (
  collectionId: string,
  attributeKey: string,
  maxRetries: number = 10,
  delayMs: number = 1000
): Promise<boolean> => {
  for (let i = 0; i < maxRetries; i++) {
    if (await isAttributeAvailable(collectionId, attributeKey)) {
      return true
    }
    log(
      `Waiting for attribute ${attributeKey} to become available... (${
        i + 1
      }/${maxRetries})`
    )
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return false
}

// Create database
const createDatabase = async () => {
  log('Creating database...')

  const exists = await resourceExists(() => databases.get(config.databaseId))

  if (exists) {
    log('Database already exists, skipping creation', 'info')
    return
  }

  await databases.create(config.databaseId, 'RaceDay Database')
  log('Database created successfully', 'success')
}

// Create Meetings collection
const createMeetingsCollection = async () => {
  log('Creating Meetings collection...')

  const exists = await resourceExists(() =>
    databases.getCollection(config.databaseId, config.collections.meetings)
  )

  if (exists) {
    log('Meetings collection already exists, skipping creation', 'info')
  } else {
    await databases.createCollection(
      config.databaseId,
      config.collections.meetings,
      'Meetings',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    )
  }

  // Enhanced Meetings attributes - synced with server database-setup.js
  const meetingAttributes: Array<{key: string, type: string, size?: number, required: boolean}> = [
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
  ]

  for (const attr of meetingAttributes) {
    if (!(await attributeExists(config.collections.meetings, attr.key))) {
      log(`Creating meetings attribute: ${attr.key}`)
      if (attr.type === 'string') {
        await databases.createStringAttribute(
          config.databaseId,
          config.collections.meetings,
          attr.key,
          attr.size!,
          attr.required
        )
      } else if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(
          config.databaseId,
          config.collections.meetings,
          attr.key,
          attr.required
        )
      }
    }
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(
    config.databaseId,
    config.collections.meetings
  )

  if (
    !collection.indexes.some((idx: { key: string }) => idx.key === 'idx_date')
  ) {
    log('Creating idx_date index on date...')

    // Wait for date attribute to be available
    const isAvailable = await waitForAttributeAvailable(
      config.collections.meetings,
      'date'
    )
    if (!isAvailable) {
      log(
        'date attribute is not available for index creation, skipping idx_date index',
        'error'
      )
    } else {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.meetings,
          'idx_date',
          IndexType.Key,
          ['date']
        )
        log('idx_date index created successfully')
      } catch (error) {
        log(`Failed to create idx_date index: ${error}`, 'error')
        // Don't throw error for index creation failures, just log and continue
      }
    }
  }

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_country'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.meetings,
      'country'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.meetings,
          'idx_country',
          IndexType.Key,
          ['country']
        )
        log('idx_country index created successfully')
      } catch (error) {
        log(`Failed to create idx_country index: ${error}`, 'error')
      }
    } else {
      log(
        'country attribute is not available for index creation, skipping idx_country index',
        'error'
      )
    }
  }

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_race_type'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.meetings,
      'raceType'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.meetings,
          'idx_race_type',
          IndexType.Key,
          ['raceType']
        )
        log('idx_race_type index created successfully')
      } catch (error) {
        log(`Failed to create idx_race_type index: ${error}`, 'error')
      }
    } else {
      log(
        'raceType attribute is not available for index creation, skipping idx_race_type index',
        'error'
      )
    }
  }

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_meeting_id'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.meetings,
      'meetingId'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.meetings,
          'idx_meeting_id',
          IndexType.Unique,
          ['meetingId']
        )
        log('idx_meeting_id index created successfully')
      } catch (error) {
        log(`Failed to create idx_meeting_id index: ${error}`, 'error')
      }
    } else {
      log(
        'meetingId attribute is not available for index creation, skipping idx_meeting_id index',
        'error'
      )
    }
  }

  log('Meetings collection created successfully', 'success')
}

// Create Races collection
const createRacesCollection = async () => {
  log('Creating Races collection...')

  const exists = await resourceExists(() =>
    databases.getCollection(config.databaseId, config.collections.races)
  )

  if (exists) {
    log('Races collection already exists, skipping creation', 'info')
  } else {
    await databases.createCollection(
      config.databaseId,
      config.collections.races,
      'Races',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    )
  }

  // Enhanced Races attributes - synced with server database-setup.js
  const raceAttributes: Array<{key: string, type: string, size?: number, required: boolean}> = [
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
  ]

  for (const attr of raceAttributes) {
    if (!(await attributeExists(config.collections.races, attr.key))) {
      log(`Creating races attribute: ${attr.key}`)
      if (attr.type === 'string') {
        await databases.createStringAttribute(
          config.databaseId,
          config.collections.races,
          attr.key,
          attr.size!,
          attr.required
        )
      } else if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(
          config.databaseId,
          config.collections.races,
          attr.key,
          attr.required
        )
      } else if (attr.type === 'integer') {
        await databases.createIntegerAttribute(
          config.databaseId,
          config.collections.races,
          attr.key,
          attr.required
        )
      } else if (attr.type === 'boolean') {
        await databases.createBooleanAttribute(
          config.databaseId,
          config.collections.races,
          attr.key,
          attr.required
        )
      }
    }
  }

  // Relationship to meetings (check if it exists first)
  if (!(await attributeExists(config.collections.races, 'meeting'))) {
    await databases.createRelationshipAttribute(
      config.databaseId,
      config.collections.races,
      config.collections.meetings,
      RelationshipType.ManyToOne,
      false,
      'meeting',
      'races'
    )
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(
    config.databaseId,
    config.collections.races
  )

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_race_id'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.races,
      'raceId'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.races,
          'idx_race_id',
          IndexType.Unique,
          ['raceId']
        )
        log('idx_race_id index created successfully')
      } catch (error) {
        log(`Failed to create idx_race_id index: ${error}`, 'error')
      }
    } else {
      log(
        'raceId attribute is not available for index creation, skipping idx_race_id index',
        'error'
      )
    }
  }

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_start_time'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.races,
      'startTime'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.races,
          'idx_start_time',
          IndexType.Key,
          ['startTime']
        )
        log('idx_start_time index created successfully')
      } catch (error) {
        log(`Failed to create idx_start_time index: ${error}`, 'error')
      }
    } else {
      log(
        'startTime attribute is not available for index creation, skipping idx_start_time index',
        'error'
      )
    }
  }

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_race_number'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.races,
      'raceNumber'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.races,
          'idx_race_number',
          IndexType.Key,
          ['raceNumber']
        )
        log('idx_race_number index created successfully')
      } catch (error) {
        log(`Failed to create idx_race_number index: ${error}`, 'error')
      }
    } else {
      log(
        'raceNumber attribute is not available for index creation, skipping idx_race_number index',
        'error'
      )
    }
  }

  log('Races collection created successfully', 'success')
}

// Create Entrants collection
const createEntrantsCollection = async () => {
  log('Creating Entrants collection...')

  const exists = await resourceExists(() =>
    databases.getCollection(config.databaseId, config.collections.entrants)
  )

  if (exists) {
    log('Entrants collection already exists, skipping creation', 'info')
  } else {
    await databases.createCollection(
      config.databaseId,
      config.collections.entrants,
      'Entrants',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    )
  }

  // Daily Entrants attributes - for frequently updated data (odds, status, betting)
  // This matches the simplified schema from server database-setup.js
  const entrantAttributes: Array<{key: string, type: string, size?: number, required: boolean, default?: boolean}> = [
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
    
    // Import and update metadata
    { key: 'lastUpdated', type: 'datetime', required: false },
    { key: 'dataSource', type: 'string', size: 50, required: false }, // 'NZTAB'
    { key: 'importedAt', type: 'datetime', required: false },
  ]

  // Process entrant attributes
  log('Creating daily entrants attributes (optimized for frequent updates)...')
  for (const attr of entrantAttributes) {
    if (!(await attributeExists(config.collections.entrants, attr.key))) {
      log(`Creating entrants attribute: ${attr.key}`)
      if (attr.type === 'string') {
        await databases.createStringAttribute(
          config.databaseId,
          config.collections.entrants,
          attr.key,
          attr.size!,
          attr.required
        )
      } else if (attr.type === 'integer') {
        await databases.createIntegerAttribute(
          config.databaseId,
          config.collections.entrants,
          attr.key,
          attr.required
        )
      } else if (attr.type === 'float') {
        await databases.createFloatAttribute(
          config.databaseId,
          config.collections.entrants,
          attr.key,
          attr.required
        )
      } else if (attr.type === 'boolean') {
        await databases.createBooleanAttribute(
          config.databaseId,
          config.collections.entrants,
          attr.key,
          attr.required,
          attr.default
        )
      } else if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(
          config.databaseId,
          config.collections.entrants,
          attr.key,
          attr.required
        )
      }
    }
  }

  // Relationship to races (check if it exists first)
  if (!(await attributeExists(config.collections.entrants, 'race'))) {
    await databases.createRelationshipAttribute(
      config.databaseId,
      config.collections.entrants,
      config.collections.races,
      RelationshipType.ManyToOne,
      false,
      'race',
      'entrants'
    )
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(
    config.databaseId,
    config.collections.entrants
  )

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_entrant_id'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.entrants,
      'entrantId'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.entrants,
          'idx_entrant_id',
          IndexType.Unique,
          ['entrantId']
        )
        log('idx_entrant_id index created successfully')
      } catch (error) {
        log(`Failed to create idx_entrant_id index: ${error}`, 'error')
      }
    } else {
      log(
        'entrantId attribute is not available for index creation, skipping idx_entrant_id index',
        'error'
      )
    }
  }

  if (
    !collection.indexes.some((idx: { key: string }) => idx.key === 'idx_runner_number')
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.entrants,
      'runnerNumber'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.entrants,
          'idx_runner_number',
          IndexType.Key,
          ['runnerNumber']
        )
        log('idx_runner_number index created successfully')
      } catch (error) {
        log(`Failed to create idx_runner_number index: ${error}`, 'error')
      }
    } else {
      log(
        'runnerNumber attribute is not available for index creation, skipping idx_runner_number index',
        'error'
      )
    }
  }

  log('Entrants collection created successfully', 'success')
}

// Create EntrantsHistory collection
const createEntrantsHistoryCollection = async () => {
  log('Creating EntrantsHistory collection...')

  const exists = await resourceExists(() =>
    databases.getCollection(config.databaseId, config.collections.entrantsHistory)
  )

  if (exists) {
    log('EntrantsHistory collection already exists, skipping creation', 'info')
  } else {
    await databases.createCollection(
      config.databaseId,
      config.collections.entrantsHistory,
      'EntrantsHistory',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    )
  }

  // Entrants History attributes - for static/historical data (breeding, form, performance stats)
  // This matches the comprehensive schema from server database-setup.js
  const entrantsHistoryAttributes: Array<{key: string, type: string, size?: number, required: boolean, default?: boolean}> = [
    // Core identifier to link with daily entrants
    { key: 'entrantId', type: 'string', size: 50, required: true },
    { key: 'horseId', type: 'integer', required: false }, // Unique horse identifier across races
    
    // Animal details (relatively static)
    { key: 'age', type: 'integer', required: false },
    { key: 'sex', type: 'string', size: 10, required: false }, // B, F, M, C, G
    { key: 'colour', type: 'string', size: 20, required: false }, // BK, BR, CH, etc
    { key: 'country', type: 'string', size: 10, required: false },
    { key: 'foalingDate', type: 'string', size: 20, required: false },
    { key: 'firstStartIndicator', type: 'boolean', required: false, default: false },
    
    // Breeding information (static)
    { key: 'sire', type: 'string', size: 255, required: false },
    { key: 'dam', type: 'string', size: 255, required: false },
    { key: 'breeding', type: 'string', size: 500, required: false },
    
    // Stable connections (relatively static)
    { key: 'trainerName', type: 'string', size: 255, required: false },
    { key: 'trainerLocation', type: 'string', size: 255, required: false },
    { key: 'owners', type: 'string', size: 500, required: false },
    
    // Rating and classification (updated periodically, not daily)
    { key: 'rating', type: 'string', size: 20, required: false },
    { key: 'handicapRating', type: 'string', size: 20, required: false },
    { key: 'classLevel', type: 'string', size: 50, required: false },
    { key: 'prizeMoney', type: 'string', size: 50, required: false },
    
    // Form and performance summary
    { key: 'lastTwentyStarts', type: 'string', size: 20, required: false }, // e.g., "21331"
    { key: 'bestTime', type: 'string', size: 20, required: false },
    { key: 'formComment', type: 'string', size: 2000, required: false },
    
    // Overall performance statistics
    { key: 'overallStarts', type: 'integer', required: false },
    { key: 'overallWins', type: 'integer', required: false },
    { key: 'overallSeconds', type: 'integer', required: false },
    { key: 'overallThirds', type: 'integer', required: false },
    { key: 'overallPlacings', type: 'integer', required: false },
    { key: 'winPercentage', type: 'string', size: 10, required: false }, // "40%"
    { key: 'placePercentage', type: 'string', size: 10, required: false }, // "100%"
    
    // Track/distance/condition specific stats
    { key: 'trackStarts', type: 'integer', required: false },
    { key: 'trackWins', type: 'integer', required: false },
    { key: 'trackSeconds', type: 'integer', required: false },
    { key: 'trackThirds', type: 'integer', required: false },
    { key: 'distanceStarts', type: 'integer', required: false },
    { key: 'distanceWins', type: 'integer', required: false },
    { key: 'distanceSeconds', type: 'integer', required: false },
    { key: 'distanceThirds', type: 'integer', required: false },
    
    // Barrier/box statistics
    { key: 'barrierStarts', type: 'integer', required: false },
    { key: 'barrierWins', type: 'integer', required: false },
    { key: 'barrierSeconds', type: 'integer', required: false },
    { key: 'barrierThirds', type: 'integer', required: false },
    
    // Recent form (last 12 months)
    { key: 'last12Starts', type: 'integer', required: false },
    { key: 'last12Wins', type: 'integer', required: false },
    { key: 'last12Seconds', type: 'integer', required: false },
    { key: 'last12Thirds', type: 'integer', required: false },
    { key: 'last12WinPercentage', type: 'string', size: 10, required: false },
    { key: 'last12PlacePercentage', type: 'string', size: 10, required: false },
    
    // Speed and prediction data
    { key: 'spr', type: 'integer', required: false }, // Speed Rating
    { key: 'averageTime', type: 'float', required: false },
    { key: 'averageKms', type: 'float', required: false },
    { key: 'bestTimeFloat', type: 'float', required: false },
    { key: 'bestKms', type: 'float', required: false },
    { key: 'bestDate', type: 'string', size: 20, required: false },
    { key: 'winPrediction', type: 'float', required: false },
    { key: 'placePrediction', type: 'float', required: false },
    
    // Visual and display (relatively static)
    { key: 'silkColours', type: 'string', size: 200, required: false },
    { key: 'silkUrl', type: 'string', size: 500, required: false },
    { key: 'silkUrl64x64', type: 'string', size: 500, required: false },
    { key: 'silkUrl128x128', type: 'string', size: 500, required: false },
    
    // Complex historical data stored as JSON strings
    { key: 'formIndicators', type: 'string', size: 2000, required: false }, // JSON array
    { key: 'lastStarts', type: 'string', size: 5000, required: false }, // JSON array of recent runs
    { key: 'allBoxHistory', type: 'string', size: 2000, required: false }, // JSON array
    { key: 'pastPerformances', type: 'string', size: 5000, required: false }, // JSON array
    { key: 'runnerWinHistory', type: 'string', size: 2000, required: false }, // JSON array
    { key: 'videoChannelsMeta', type: 'string', size: 2000, required: false }, // JSON object
    
    // Import and update metadata
    { key: 'lastUpdated', type: 'datetime', required: false },
    { key: 'dataSource', type: 'string', size: 50, required: false }, // 'NZTAB'
    { key: 'importedAt', type: 'datetime', required: false },
  ]

  // Process entrants history attributes
  log('Creating comprehensive entrants history attributes...')
  for (const attr of entrantsHistoryAttributes) {
    if (!(await attributeExists(config.collections.entrantsHistory, attr.key))) {
      log(`Creating entrants history attribute: ${attr.key}`)
      if (attr.type === 'string') {
        await databases.createStringAttribute(
          config.databaseId,
          config.collections.entrantsHistory,
          attr.key,
          attr.size!,
          attr.required
        )
      } else if (attr.type === 'integer') {
        await databases.createIntegerAttribute(
          config.databaseId,
          config.collections.entrantsHistory,
          attr.key,
          attr.required
        )
      } else if (attr.type === 'float') {
        await databases.createFloatAttribute(
          config.databaseId,
          config.collections.entrantsHistory,
          attr.key,
          attr.required
        )
      } else if (attr.type === 'boolean') {
        await databases.createBooleanAttribute(
          config.databaseId,
          config.collections.entrantsHistory,
          attr.key,
          attr.required,
          attr.default
        )
      } else if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(
          config.databaseId,
          config.collections.entrantsHistory,
          attr.key,
          attr.required
        )
      }
    }
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(
    config.databaseId,
    config.collections.entrantsHistory
  )

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_entrant_id_history'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.entrantsHistory,
      'entrantId'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.entrantsHistory,
          'idx_entrant_id_history',
          IndexType.Unique,
          ['entrantId']
        )
        log('idx_entrant_id_history index created successfully')
      } catch (error) {
        log(`Failed to create idx_entrant_id_history index: ${error}`, 'error')
      }
    } else {
      log(
        'entrantId attribute is not available for index creation, skipping idx_entrant_id_history index',
        'error'
      )
    }
  }

  if (
    !collection.indexes.some((idx: { key: string }) => idx.key === 'idx_horse_id')
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.entrantsHistory,
      'horseId'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.entrantsHistory,
          'idx_horse_id',
          IndexType.Key,
          ['horseId']
        )
        log('idx_horse_id index created successfully')
      } catch (error) {
        log(`Failed to create idx_horse_id index: ${error}`, 'error')
      }
    } else {
      log(
        'horseId attribute is not available for index creation, skipping idx_horse_id index',
        'error'
      )
    }
  }

  log('EntrantsHistory collection created successfully', 'success')
}

// Create OddsHistory collection
const createOddsHistoryCollection = async () => {
  log('Creating OddsHistory collection...')

  const exists = await resourceExists(() =>
    databases.getCollection(config.databaseId, config.collections.oddsHistory)
  )

  if (exists) {
    log('OddsHistory collection already exists, skipping creation', 'info')
  } else {
    await databases.createCollection(
      config.databaseId,
      config.collections.oddsHistory,
      'OddsHistory',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    )
  }

  // Create attributes (check if they exist first)
  if (!(await attributeExists(config.collections.oddsHistory, 'odds'))) {
    await databases.createFloatAttribute(
      config.databaseId,
      config.collections.oddsHistory,
      'odds',
      true
    )
  }

  if (
    !(await attributeExists(config.collections.oddsHistory, 'eventTimestamp'))
  ) {
    await databases.createDatetimeAttribute(
      config.databaseId,
      config.collections.oddsHistory,
      'eventTimestamp',
      true
    )
  }

  if (!(await attributeExists(config.collections.oddsHistory, 'type'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.oddsHistory,
      'type',
      20,
      true
    )
  }

  // Relationship to entrants (check if it exists first)
  if (!(await attributeExists(config.collections.oddsHistory, 'entrant'))) {
    await databases.createRelationshipAttribute(
      config.databaseId,
      config.collections.oddsHistory,
      config.collections.entrants,
      RelationshipType.ManyToOne,
      false,
      'entrant',
      'oddsHistory'
    )
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(
    config.databaseId,
    config.collections.oddsHistory
  )

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_timestamp'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.oddsHistory,
      'eventTimestamp'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.oddsHistory,
          'idx_timestamp',
          IndexType.Key,
          ['eventTimestamp']
        )
        log('idx_timestamp index created successfully')
      } catch (error) {
        log(`Failed to create idx_timestamp index: ${error}`, 'error')
      }
    } else {
      log(
        'eventTimestamp attribute is not available for index creation, skipping idx_timestamp index',
        'info'
      )
    }
  }

  log('OddsHistory collection created successfully', 'success')
}

// Create MoneyFlowHistory collection
const createMoneyFlowHistoryCollection = async () => {
  log('Creating MoneyFlowHistory collection...')

  const exists = await resourceExists(() =>
    databases.getCollection(
      config.databaseId,
      config.collections.moneyFlowHistory
    )
  )

  if (exists) {
    log('MoneyFlowHistory collection already exists, skipping creation', 'info')
  } else {
    await databases.createCollection(
      config.databaseId,
      config.collections.moneyFlowHistory,
      'MoneyFlowHistory',
      [
        Permission.read(Role.any()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    )
  }

  // Create attributes (check if they exist first)
  if (!(await attributeExists(config.collections.moneyFlowHistory, 'holdPercentage'))) {
    await databases.createFloatAttribute(
      config.databaseId,
      config.collections.moneyFlowHistory,
      'holdPercentage',
      true
    )
  }

  if (
    !(await attributeExists(
      config.collections.moneyFlowHistory,
      'eventTimestamp'
    ))
  ) {
    await databases.createDatetimeAttribute(
      config.databaseId,
      config.collections.moneyFlowHistory,
      'eventTimestamp',
      true
    )
  }

  // Relationship to entrants (check if it exists first)
  if (
    !(await attributeExists(config.collections.moneyFlowHistory, 'entrant'))
  ) {
    await databases.createRelationshipAttribute(
      config.databaseId,
      config.collections.moneyFlowHistory,
      config.collections.entrants,
      RelationshipType.ManyToOne,
      false,
      'entrant',
      'moneyFlowHistory'
    )
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(
    config.databaseId,
    config.collections.moneyFlowHistory
  )

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_timestamp'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.moneyFlowHistory,
      'eventTimestamp'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.moneyFlowHistory,
          'idx_timestamp',
          IndexType.Key,
          ['eventTimestamp']
        )
        log('idx_timestamp index created successfully')
      } catch (error) {
        log(`Failed to create idx_timestamp index: ${error}`, 'error')
      }
    } else {
      log(
        'eventTimestamp attribute is not available for index creation, skipping idx_timestamp index',
        'info'
      )
    }
  }

  log('MoneyFlowHistory collection created successfully', 'success')
}

// Create UserAlertConfigs collection
const createUserAlertConfigsCollection = async () => {
  log('Creating UserAlertConfigs collection...')

  const exists = await resourceExists(() =>
    databases.getCollection(
      config.databaseId,
      config.collections.userAlertConfigs
    )
  )

  if (exists) {
    log('UserAlertConfigs collection already exists, skipping creation', 'info')
  } else {
    await databases.createCollection(
      config.databaseId,
      config.collections.userAlertConfigs,
      'UserAlertConfigs',
      [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    )
  }

  // Create attributes (check if they exist first)
  if (!(await attributeExists(config.collections.userAlertConfigs, 'userId'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.userAlertConfigs,
      'userId',
      50,
      true
    )
  }

  if (
    !(await attributeExists(config.collections.userAlertConfigs, 'alertType'))
  ) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.userAlertConfigs,
      'alertType',
      50,
      true
    )
  }

  if (
    !(await attributeExists(config.collections.userAlertConfigs, 'threshold'))
  ) {
    await databases.createFloatAttribute(
      config.databaseId,
      config.collections.userAlertConfigs,
      'threshold',
      true
    )
  }

  if (
    !(await attributeExists(config.collections.userAlertConfigs, 'timeWindowSeconds'))
  ) {
    await databases.createIntegerAttribute(
      config.databaseId,
      config.collections.userAlertConfigs,
      'timeWindowSeconds',
      false
    )
  }

  if (
    !(await attributeExists(config.collections.userAlertConfigs, 'enabled'))
  ) {
    await databases.createBooleanAttribute(
      config.databaseId,
      config.collections.userAlertConfigs,
      'enabled',
      true
    )
  }

  // Add relationship to entrants
  if (!(await attributeExists(config.collections.userAlertConfigs, 'entrant'))) {
    await databases.createRelationshipAttribute(
      config.databaseId,
      config.collections.userAlertConfigs,
      config.collections.entrants,
      RelationshipType.ManyToOne,
      false,
      'entrant',
      'alertConfigs'
    )
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(
    config.databaseId,
    config.collections.userAlertConfigs
  )

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_user_id'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.userAlertConfigs,
      'userId'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.userAlertConfigs,
          'idx_user_id',
          IndexType.Key,
          ['userId']
        )
        log('idx_user_id index created successfully')
      } catch (error) {
        log(`Failed to create idx_user_id index: ${error}`, 'error')
      }
    } else {
      log(
        'userId attribute is not available for index creation, skipping idx_user_id index',
        'error'
      )
    }
  }

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_alert_type'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.userAlertConfigs,
      'alertType'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.userAlertConfigs,
          'idx_alert_type',
          IndexType.Key,
          ['alertType']
        )
        log('idx_alert_type index created successfully')
      } catch (error) {
        log(`Failed to create idx_alert_type index: ${error}`, 'error')
      }
    } else {
      log(
        'alertType attribute is not available for index creation, skipping idx_alert_type index',
        'error'
      )
    }
  }

  log('UserAlertConfigs collection created successfully', 'success')
}

// Create Notifications collection
const createNotificationsCollection = async () => {
  log('Creating Notifications collection...')

  const exists = await resourceExists(() =>
    databases.getCollection(config.databaseId, config.collections.notifications)
  )

  if (exists) {
    log('Notifications collection already exists, skipping creation', 'info')
  } else {
    await databases.createCollection(
      config.databaseId,
      config.collections.notifications,
      'Notifications',
      [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]
    )
  }

  // Create attributes (check if they exist first)
  if (!(await attributeExists(config.collections.notifications, 'userId'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.notifications,
      'userId',
      50,
      true
    )
  }

  if (!(await attributeExists(config.collections.notifications, 'title'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.notifications,
      'title',
      255,
      true
    )
  }

  if (!(await attributeExists(config.collections.notifications, 'message'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.notifications,
      'message',
      1000,
      true
    )
  }

  if (!(await attributeExists(config.collections.notifications, 'type'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.notifications,
      'type',
      50,
      true
    )
  }

  if (!(await attributeExists(config.collections.notifications, 'read'))) {
    await databases.createBooleanAttribute(
      config.databaseId,
      config.collections.notifications,
      'read',
      false
    )
  }

  if (!(await attributeExists(config.collections.notifications, 'raceId'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.notifications,
      'raceId',
      50,
      false
    )
  }

  if (!(await attributeExists(config.collections.notifications, 'entrantId'))) {
    await databases.createStringAttribute(
      config.databaseId,
      config.collections.notifications,
      'entrantId',
      50,
      false
    )
  }

  // Create indexes (check if they exist first)
  const collection = await databases.getCollection(
    config.databaseId,
    config.collections.notifications
  )

  if (
    !collection.indexes.some(
      (idx: { key: string }) => idx.key === 'idx_user_id'
    )
  ) {
    const isAvailable = await waitForAttributeAvailable(
      config.collections.notifications,
      'userId'
    )
    if (isAvailable) {
      try {
        await databases.createIndex(
          config.databaseId,
          config.collections.notifications,
          'idx_user_id',
          IndexType.Key,
          ['userId']
        )
        log('idx_user_id index created successfully')
      } catch (error) {
        log(`Failed to create idx_user_id index: ${error}`, 'error')
      }
    } else {
      log(
        'userId attribute is not available for index creation, skipping idx_user_id index',
        'error'
      )
    }
  }

  log('Notifications collection created successfully', 'success')
}

// User labels must be created manually in the Appwrite console.
// See instructions in documentation for setting up user role labels.

// Helper function to assign user roles (for use in application code)
const assignUserRole = async (
  userId: string,
  role: 'user' | 'admin' = 'user'
) => {
  const { Users } = await import('node-appwrite')
  const users = new Users(client)

  try {
    // Add the role label to the user
    await users.updateLabels(userId, [role])
    log(`Assigned role "${role}" to user ${userId}`, 'success')
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    log(
      `Failed to assign role "${role}" to user ${userId}: ${errorMessage}`,
      'error'
    )
    throw error
  }
}

// Helper function to get user role (for use in application code)
const getUserRole = async (
  userId: string
): Promise<'user' | 'admin' | null> => {
  const { Users } = await import('node-appwrite')
  const users = new Users(client)

  try {
    const user = await users.get(userId)
    const labels = user.labels || []

    if (labels.includes('admin')) return 'admin'
    if (labels.includes('user')) return 'user'
    return null
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    log(`Failed to get role for user ${userId}: ${errorMessage}`, 'error')
    throw error
  }
}

// Main setup function
const setupAppwrite = async () => {
  try {
    log('🚀 Starting Appwrite setup...')

    // Validate environment variables
    if (!config.projectId || !config.apiKey) {
      throw new Error(
        'Missing required environment variables: APPWRITE_PROJECT_ID and APPWRITE_API_KEY'
      )
    }

    // Create database
    await createDatabase()

    // Create collections
    await createMeetingsCollection()
    await createRacesCollection()
    await createEntrantsCollection()
    await createEntrantsHistoryCollection()
    await createOddsHistoryCollection()
    await createMoneyFlowHistoryCollection()
    await createUserAlertConfigsCollection()
    await createNotificationsCollection()

    // Note: User labels will be created later as part of actual user creation
    // No need to set them up in this script

    log('🎉 Appwrite setup completed successfully!', 'success')
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    log(`Setup failed: ${errorMessage}`, 'error')
    process.exit(1)
  }
}

// Run setup if called directly
if (require.main === module) {
  setupAppwrite()
}

// Export functions for testing
export { setupAppwrite, config, assignUserRole, getUserRole }
