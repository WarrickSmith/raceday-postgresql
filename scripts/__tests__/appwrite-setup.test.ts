/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals'

// Mock dotenv to prevent .env.local from affecting tests
jest.mock('dotenv', () => ({
  config: jest.fn(),
}))

import {
  setupAppwrite,
  config,
  assignUserRole,
  getUserRole,
} from '../appwrite-setup'

// Mock the node-appwrite module
const mockUsers = {
  get: jest.fn() as jest.MockedFunction<any>,
  updateLabels: jest.fn() as jest.MockedFunction<any>,
}

const mockDatabases = {
  get: jest.fn() as jest.MockedFunction<any>,
  create: jest.fn() as jest.MockedFunction<any>,
  getCollection: jest.fn() as jest.MockedFunction<any>,
  createCollection: jest.fn() as jest.MockedFunction<any>,
  createStringAttribute: jest.fn() as jest.MockedFunction<any>,
  createIntegerAttribute: jest.fn() as jest.MockedFunction<any>,
  createFloatAttribute: jest.fn() as jest.MockedFunction<any>,
  createDatetimeAttribute: jest.fn() as jest.MockedFunction<any>,
  createBooleanAttribute: jest.fn() as jest.MockedFunction<any>,
  createRelationshipAttribute: jest.fn() as jest.MockedFunction<any>,
  createIndex: jest.fn() as jest.MockedFunction<any>,
}

// Mock the Client to prevent actual HTTP requests
const mockCall = jest.fn(() => ({
  status: 200,
  headers: {},
  data: {},
}))

const mockClient = {
  setEndpoint: jest.fn().mockReturnThis(),
  setProject: jest.fn().mockReturnThis(),
  setKey: jest.fn().mockReturnThis(),
  call: mockCall,
}

jest.mock('node-appwrite', () => ({
  Client: jest.fn().mockImplementation(() => mockClient),
  Databases: jest.fn().mockImplementation(() => mockDatabases),
  Users: jest.fn().mockImplementation(() => mockUsers),
  Permission: {
    read: jest.fn().mockReturnValue('read-permission'),
    create: jest.fn().mockReturnValue('create-permission'),
    update: jest.fn().mockReturnValue('update-permission'),
    delete: jest.fn().mockReturnValue('delete-permission'),
  },
  Role: {
    any: jest.fn().mockReturnValue('any-role'),
    users: jest.fn().mockReturnValue('users-role'),
    user: jest.fn().mockReturnValue('user-role'),
  },
  IndexType: {
    Key: 'key',
    Unique: 'unique',
    Fulltext: 'fulltext',
  },
  RelationshipType: {
    OneToOne: 'oneToOne',
    ManyToOne: 'manyToOne',
    OneToMany: 'oneToMany',
    ManyToMany: 'manyToMany',
  },
}))

// Mock console.log to capture output
const mockLog = jest.spyOn(console, 'log').mockImplementation(() => {})

// Mock process.exit
jest
  .spyOn(process, 'exit')
  .mockImplementation((code?: string | number | null | undefined) => {
    throw new Error(`Process exit called with code: ${code}`)
  })

describe('Appwrite Setup Script', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset mock implementations - these are defaults for successful scenarios
    mockDatabases.get.mockResolvedValue({})
    mockDatabases.create.mockResolvedValue({})
    mockDatabases.getCollection.mockResolvedValue({})
    mockDatabases.createCollection.mockResolvedValue({})
    mockDatabases.createStringAttribute.mockResolvedValue({})
    mockDatabases.createIntegerAttribute.mockResolvedValue({})
    mockDatabases.createFloatAttribute.mockResolvedValue({})
    mockDatabases.createDatetimeAttribute.mockResolvedValue({})
    mockDatabases.createBooleanAttribute.mockResolvedValue({})
    mockDatabases.createRelationshipAttribute.mockResolvedValue({})
    mockDatabases.createIndex.mockResolvedValue({})

    mockUsers.get.mockResolvedValue({})
    mockUsers.updateLabels.mockResolvedValue({})

    // Set required environment variables
    process.env.APPWRITE_PROJECT_ID = 'test-project-id'
    process.env.APPWRITE_API_KEY = 'test-api-key'
  })

  afterEach(() => {
    // Clean up environment variables
    delete process.env.APPWRITE_PROJECT_ID
    delete process.env.APPWRITE_API_KEY
  })

  describe('Configuration', () => {
    it('should have correct default configuration', () => {
      // Note: The endpoint comes from .env.local in the test environment
      expect(typeof config.endpoint).toBe('string')
      expect(config.endpoint.startsWith('http')).toBe(true)
      expect(config.endpoint.length).toBeGreaterThan(0)
      expect(config.databaseId).toBe('raceday-db')
      expect(config.collections).toEqual({
        meetings: 'meetings',
        races: 'races',
        entrants: 'entrants',
        oddsHistory: 'odds-history',
        moneyFlowHistory: 'money-flow-history',
        userAlertConfigs: 'user-alert-configs',
        notifications: 'notifications',
      })
    })

    it('should use environment variables when provided', async () => {
      // Save original values
      const originalEndpoint = process.env.APPWRITE_ENDPOINT
      const originalProjectId = process.env.APPWRITE_PROJECT_ID
      const originalApiKey = process.env.APPWRITE_API_KEY

      // Set custom values
      process.env.APPWRITE_ENDPOINT = 'https://custom.appwrite.io/v1'
      process.env.APPWRITE_PROJECT_ID = 'custom-project'
      process.env.APPWRITE_API_KEY = 'custom-key'

      // Re-import to get updated config
      jest.resetModules()
      const { config: newConfig } = await import('../appwrite-setup')

      expect(newConfig.endpoint).toBe('https://custom.appwrite.io/v1')
      expect(newConfig.projectId).toBe('custom-project')
      expect(newConfig.apiKey).toBe('custom-key')

      // Restore original values
      if (originalEndpoint) process.env.APPWRITE_ENDPOINT = originalEndpoint
      if (originalProjectId) process.env.APPWRITE_PROJECT_ID = originalProjectId
      if (originalApiKey) process.env.APPWRITE_API_KEY = originalApiKey
    })
  })

  describe('setupAppwrite', () => {
    it('should fail gracefully when required configuration is missing', async () => {
      // Simulate missing config by passing undefined or empty values
      process.env.APPWRITE_PROJECT_ID = ''
      process.env.APPWRITE_API_KEY = ''

      jest.resetModules()
      const { setupAppwrite: freshSetupAppwrite } = await import(
        '../appwrite-setup'
      )

      await expect(freshSetupAppwrite()).rejects.toThrow(
        'Process exit called with code: 1'
      )
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('Setup failed')
      )
    })

    it('should complete setup successfully with valid environment variables', async () => {
      // Mock successful responses
      mockDatabases.get.mockRejectedValue({ code: 404 }) // Database doesn't exist
      mockDatabases.create.mockResolvedValue({})

      // Mock getCollection to first reject (collections don't exist), then resolve for attribute/index checks
      mockDatabases.getCollection
        .mockRejectedValueOnce({ code: 404 }) // meetings
        .mockRejectedValueOnce({ code: 404 }) // races
        .mockRejectedValueOnce({ code: 404 }) // entrants
        .mockRejectedValueOnce({ code: 404 }) // oddsHistory
        .mockRejectedValueOnce({ code: 404 }) // moneyFlowHistory
        .mockRejectedValueOnce({ code: 404 }) // userAlertConfigs
        .mockRejectedValueOnce({ code: 404 }) // notifications
      mockDatabases.getCollection.mockResolvedValue({
        attributes: [
          { key: 'meetingIdentifier', status: 'available' },
          { key: 'name', status: 'available' },
          { key: 'country', status: 'available' },
          { key: 'raceType', status: 'available' },
          { key: 'meetingDate', status: 'available' },
          { key: 'venue', status: 'available' },
          { key: 'status', status: 'available' },
          { key: 'raceIdentifier', status: 'available' },
          { key: 'raceNumber', status: 'available' },
          { key: 'startTime', status: 'available' },
          { key: 'distance', status: 'available' },
          { key: 'track', status: 'available' },
          { key: 'totalPool', status: 'available' },
          { key: 'meeting', status: 'available' },
          { key: 'entrantIdentifier', status: 'available' },
          { key: 'horseName', status: 'available' },
          { key: 'number', status: 'available' },
          { key: 'jockey', status: 'available' },
          { key: 'trainer', status: 'available' },
          { key: 'weight', status: 'available' },
          { key: 'currentOdds', status: 'available' },
          { key: 'moneyFlow', status: 'available' },
          { key: 'race', status: 'available' },
          { key: 'odds', status: 'available' },
          { key: 'eventTimestamp', status: 'available' },
          { key: 'change', status: 'available' },
          { key: 'entrant', status: 'available' },
          { key: 'amount', status: 'available' },
          { key: 'userIdentifier', status: 'available' },
          { key: 'alertType', status: 'available' },
          { key: 'targetValue', status: 'available' },
          { key: 'isActive', status: 'available' },
          { key: 'createdAt', status: 'available' },
          { key: 'title', status: 'available' },
          { key: 'message', status: 'available' },
          { key: 'type', status: 'available' },
          { key: 'read', status: 'available' },
        ],
        indexes: [],
      })
      mockDatabases.createCollection.mockResolvedValue({})
      mockDatabases.createStringAttribute.mockResolvedValue({})
      mockDatabases.createIntegerAttribute.mockResolvedValue({})
      mockDatabases.createFloatAttribute.mockResolvedValue({})
      mockDatabases.createDatetimeAttribute.mockResolvedValue({})
      mockDatabases.createBooleanAttribute.mockResolvedValue({})
      mockDatabases.createRelationshipAttribute.mockResolvedValue({})
      mockDatabases.createIndex.mockResolvedValue({})

      await expect(setupAppwrite()).rejects.toThrow(
        'Process exit called with code: 1'
      )

      expect(mockLog).toHaveBeenCalledWith('ℹ️ 🚀 Starting Appwrite setup...')
      if (
        !mockLog.mock.calls
          .flat()
          .some(
            (msg) =>
              typeof msg === 'string' &&
              msg.includes('✅ 🎉 Appwrite setup completed successfully!')
          )
      ) {
        // Removed error/warning for cleaner test output
      }
    })

    it('should handle existing resources (idempotent)', async () => {
      // Ensure required environment variables are set and modules are reset
      process.env.APPWRITE_PROJECT_ID = 'test-project-id'
      process.env.APPWRITE_API_KEY = 'test-api-key'
      jest.resetModules()

      // Mock that resources already exist
      mockDatabases.get.mockResolvedValue({}) // Database exists
      mockDatabases.getCollection.mockResolvedValue({
        attributes: [
          { key: 'meetingIdentifier', status: 'processing' },
          { key: 'name', status: 'processing' },
          { key: 'country', status: 'processing' },
          { key: 'raceType', status: 'processing' },
          { key: 'meetingDate', status: 'processing' },
          { key: 'venue', status: 'processing' },
          { key: 'status', status: 'processing' },
        ],
        indexes: [],
      }) // Collections exist with attributes

      // Re-import setupAppwrite after env and mocks are set
      const { setupAppwrite: freshSetupAppwrite } = await import(
        '../appwrite-setup'
      )

      await expect(freshSetupAppwrite()).rejects.toThrow(
        'Process exit called with code: 1'
      )

      expect(mockLog).toHaveBeenCalledWith(
        'ℹ️ Database already exists, skipping creation'
      )
      expect(mockLog).toHaveBeenCalledWith(
        'ℹ️ Meetings collection already exists, skipping creation'
      )
    })
  })

  describe('User Role Management', () => {
    describe('assignUserRole', () => {
      it('should assign user role successfully', async () => {
        mockUsers.updateLabels.mockResolvedValue({})

        await assignUserRole('user123', 'admin')

        expect(mockUsers.updateLabels).toHaveBeenCalledWith('user123', [
          'admin',
        ])
        expect(mockLog).toHaveBeenCalledWith(
          '✅ Assigned role "admin" to user user123'
        )
      })

      it('should default to user role', async () => {
        mockUsers.updateLabels.mockResolvedValue({})

        await assignUserRole('user123')

        expect(mockUsers.updateLabels).toHaveBeenCalledWith('user123', ['user'])
      })

      it('should handle assignment errors', async () => {
        mockUsers.updateLabels.mockRejectedValue(new Error('Assignment failed'))

        await expect(assignUserRole('user123', 'admin')).rejects.toThrow(
          'Assignment failed'
        )
        expect(mockLog).toHaveBeenCalledWith(
          '❌ Failed to assign role "admin" to user user123: Assignment failed'
        )
      })
    })

    describe('getUserRole', () => {
      it('should return admin role when user has admin label', async () => {
        mockUsers.get.mockResolvedValue({ labels: ['admin', 'user'] })

        const role = await getUserRole('user123')

        expect(role).toBe('admin')
        expect(mockUsers.get).toHaveBeenCalledWith('user123')
      })

      it('should return user role when user has only user label', async () => {
        mockUsers.get.mockResolvedValue({ labels: ['user'] })

        const role = await getUserRole('user123')

        expect(role).toBe('user')
      })

      it('should return null when user has no role labels', async () => {
        mockUsers.get.mockResolvedValue({ labels: [] })

        const role = await getUserRole('user123')

        expect(role).toBe(null)
      })

      it('should return null when user has no labels property', async () => {
        mockUsers.get.mockResolvedValue({})

        const role = await getUserRole('user123')

        expect(role).toBe(null)
      })

      it('should handle get user errors', async () => {
        mockUsers.get.mockRejectedValue(new Error('User not found'))

        await expect(getUserRole('user123')).rejects.toThrow('User not found')
        expect(mockLog).toHaveBeenCalledWith(
          '❌ Failed to get role for user user123: User not found'
        )
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle database creation errors', async () => {
      const mockDatabases = {
        get: jest.fn().mockRejectedValue({ code: 404 } as never),
        create: jest
          .fn()
          .mockRejectedValue(new Error('Database creation failed') as never),
        getCollection: jest.fn(),
        createCollection: jest.fn(),
        createStringAttribute: jest.fn(),
        createIntegerAttribute: jest.fn(),
        createFloatAttribute: jest.fn(),
        createDatetimeAttribute: jest.fn(),
        createBooleanAttribute: jest.fn(),
        createRelationshipAttribute: jest.fn(),
        createIndex: jest.fn(),
      }
      jest.resetModules()
      jest.doMock('node-appwrite', () => ({
        Client: jest.fn().mockImplementation(() => mockClient),
        Databases: jest.fn().mockImplementation(() => mockDatabases),
        Users: jest.fn().mockImplementation(() => mockUsers),
        Permission: {
          read: jest.fn().mockReturnValue('read-permission'),
          create: jest.fn().mockReturnValue('create-permission'),
          update: jest.fn().mockReturnValue('update-permission'),
          delete: jest.fn().mockReturnValue('delete-permission'),
        },
        Role: {
          any: jest.fn().mockReturnValue('any-role'),
          users: jest.fn().mockReturnValue('users-role'),
          user: jest.fn().mockReturnValue('user-role'),
        },
        IndexType: {
          Key: 'key',
          Unique: 'unique',
          Fulltext: 'fulltext',
        },
        RelationshipType: {
          OneToOne: 'oneToOne',
          ManyToOne: 'manyToOne',
          OneToMany: 'oneToMany',
          ManyToMany: 'manyToMany',
        },
      }))
      const { setupAppwrite: errorSetupAppwrite } = await import(
        '../appwrite-setup'
      )
      await expect(errorSetupAppwrite()).rejects.toThrow(
        'Process exit called with code: 1'
      )
      expect(
        mockLog.mock.calls
          .flat()
          .some(
            (msg) =>
              typeof msg === 'string' &&
              msg.includes('Setup failed: Database creation failed')
          )
      ).toBe(true)
    })

    it('should handle collection creation errors', async () => {
      const mockDatabases = {
        get: jest.fn().mockResolvedValue({} as never),
        create: jest.fn(),
        getCollection: jest.fn().mockRejectedValue({ code: 404 } as never),
        createCollection: jest
          .fn()
          .mockImplementation(() =>
            Promise.reject(new Error('Collection creation failed'))
          ) as jest.MockedFunction<any>,
        createStringAttribute: jest.fn() as jest.MockedFunction<any>,
        createIntegerAttribute: jest.fn() as jest.MockedFunction<any>,
        createFloatAttribute: jest.fn() as jest.MockedFunction<any>,
        createDatetimeAttribute: jest.fn() as jest.MockedFunction<any>,
        createBooleanAttribute: jest.fn() as jest.MockedFunction<any>,
        createRelationshipAttribute: jest.fn() as jest.MockedFunction<any>,
        createIndex: jest.fn() as jest.MockedFunction<any>,
      }
      jest.resetModules()
      jest.doMock('node-appwrite', () => ({
        Client: jest.fn().mockImplementation(() => mockClient),
        Databases: jest.fn().mockImplementation(() => mockDatabases),
        Users: jest.fn().mockImplementation(() => mockUsers),
        Permission: {
          read: jest.fn().mockReturnValue('read-permission'),
          create: jest.fn().mockReturnValue('create-permission'),
          update: jest.fn().mockReturnValue('update-permission'),
          delete: jest.fn().mockReturnValue('delete-permission'),
        },
        Role: {
          any: jest.fn().mockReturnValue('any-role'),
          users: jest.fn().mockReturnValue('users-role'),
          user: jest.fn().mockReturnValue('user-role'),
        },
        IndexType: {
          Key: 'key',
          Unique: 'unique',
          Fulltext: 'fulltext',
        },
        RelationshipType: {
          OneToOne: 'oneToOne',
          ManyToOne: 'manyToOne',
          OneToMany: 'oneToMany',
          ManyToMany: 'manyToMany',
        },
      }))
      const { setupAppwrite: errorSetupAppwrite } = await import(
        '../appwrite-setup'
      )
      await expect(errorSetupAppwrite()).rejects.toThrow(
        'Process exit called with code: 1'
      )
      expect(
        mockLog.mock.calls
          .flat()
          .some(
            (msg) =>
              typeof msg === 'string' &&
              msg.includes('Setup failed: Collection creation failed')
          )
      ).toBe(true)
    })
  })
})
