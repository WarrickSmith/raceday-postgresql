/**
 * Unit tests for useUnifiedRaceRealtime hook
 */

import { renderHook, act } from '@testing-library/react'
import { useUnifiedRaceRealtime } from '../useUnifiedRaceRealtime'
import { Race, Entrant } from '@/types/meetings'

// Mock the Appwrite client
jest.mock('@/lib/appwrite-client', () => ({
  client: {
    subscribe: jest.fn(() => jest.fn()),
  },
  databases: {
    listDocuments: jest.fn(),
  },
}))

// Get the mocked functions
import { client, databases } from '@/lib/appwrite-client'

type MockRealtimeEvent = {
  events: string[]
  channels: string[]
  timestamp: string
  payload?: Record<string, unknown>
}

type SubscribeCallback = (event: MockRealtimeEvent) => void

const mockSubscribe = client.subscribe as jest.MockedFunction<
  (channels: string | string[], callback: SubscribeCallback) => () => void
>
const mockListDocuments = databases.listDocuments as jest.Mock

// Mock global fetch
global.fetch = jest.fn()

describe('useUnifiedRaceRealtime', () => {
  const mockRace: Race = {
    $id: 'race-123',
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString(),
    raceId: 'race-456',
    raceNumber: 1,
    name: 'Test Race',
    status: 'open',
    startTime: new Date().toISOString(),
    resultsAvailable: false,
    meeting: 'meeting-123',
  }

  const mockEntrants: Entrant[] = [
    {
      $id: 'entrant-1',
      $createdAt: new Date().toISOString(),
      $updatedAt: new Date().toISOString(),
      entrantId: 'entrant-1',
      runnerNumber: 1,
      name: 'Test Runner',
      race: 'race-123',
      isScratched: false,
      winOdds: 2.5,
    },
  ]

  const mockProps = {
    raceId: 'race-456',
    initialRace: mockRace,
    initialEntrants: mockEntrants,
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock successful API response
    ;(fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          race: mockRace,
          entrants: mockEntrants,
          meeting: null,
          navigationData: null,
        }),
    })

    // Mock database responses
    mockListDocuments.mockResolvedValue({
      documents: [],
    })
  })

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useUnifiedRaceRealtime(mockProps))

    expect(result.current.race).toEqual(mockRace)
    expect(result.current.entrants).toEqual(mockEntrants)
    expect(result.current.isConnected).toBe(true) // Hook connects when race document ID is available
    expect(result.current.connectionAttempts).toBe(0)
    expect(result.current.totalUpdates).toBe(0)
    expect(result.current.lastUpdate).toBeNull()
  })

  it('should provide connection health metrics', () => {
    const { result } = renderHook(() => useUnifiedRaceRealtime(mockProps))

    const health = result.current.getConnectionHealth()

    expect(health).toHaveProperty('isHealthy')
    expect(health).toHaveProperty('avgLatency')
    expect(health).toHaveProperty('uptime')
    expect(typeof health.isHealthy).toBe('boolean')
    expect(
      typeof health.avgLatency === 'number' || health.avgLatency === null
    ).toBe(true)
    expect(typeof health.uptime).toBe('number')
  })

  it('should handle reconnection', () => {
    const { result } = renderHook(() => useUnifiedRaceRealtime(mockProps))

    act(() => {
      result.current.reconnect()
    })

    // Should set connection state to false and increment attempts
    expect(result.current.isConnected).toBe(false)
    expect(result.current.connectionAttempts).toBe(0) // Reset to 0 on reconnect
  })

  it('should clear update history', () => {
    const { result } = renderHook(() => useUnifiedRaceRealtime(mockProps))

    // Call clear history
    act(() => {
      result.current.clearHistory()
    })

    // Verify history is cleared
    expect(result.current.totalUpdates).toBe(0)
    expect(result.current.lastUpdate).toBeNull()
    // updateLatency is not cleared by clearHistory method based on implementation
  })

  it('should fetch initial data when raceId changes', async () => {
    renderHook(() =>
      useUnifiedRaceRealtime({
        raceId: 'race-456',
        initialRace: null, // No initial race data - this should trigger fetch
        initialEntrants: [], // No initial entrants
      })
    )

    // Wait for initial fetch to complete
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    // Should fetch data when no initial race data is provided
    expect(fetch).toHaveBeenCalledWith('/api/race/race-456')
  })

  it('should handle fetch errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    ;(fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'))

    renderHook(() =>
      useUnifiedRaceRealtime({
        raceId: 'test-race-id',
        initialRace: null, // Force fetch
        initialEntrants: [],
      })
    )

    // Wait for initial data fetch to complete
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    // Should not throw error, just handle gracefully
    // With conditional logging, expect the new formatted message
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch initial data'),
      expect.stringContaining('color: #EF4444'),
      expect.any(Error)
    )

    consoleSpy.mockRestore()
  })

  it('should use smart channel management', () => {
    const { result } = renderHook(() => useUnifiedRaceRealtime(mockProps))

    // The hook should internally manage channels based on race data
    // This is tested indirectly by ensuring the hook doesn't crash
    expect(result.current.race).toBeDefined()
    expect(result.current.entrants).toBeDefined()
  })

  it('should provide all required interface properties', () => {
    const { result } = renderHook(() => useUnifiedRaceRealtime(mockProps))

    // Core race data
    expect(result.current).toHaveProperty('race')
    expect(result.current).toHaveProperty('entrants')
    expect(result.current).toHaveProperty('meeting')
    expect(result.current).toHaveProperty('navigationData')

    // Real-time data
    expect(result.current).toHaveProperty('poolData')
    expect(result.current).toHaveProperty('resultsData')

    // Connection and freshness
    expect(result.current).toHaveProperty('isConnected')
    expect(result.current).toHaveProperty('connectionAttempts')
    expect(result.current).toHaveProperty('lastUpdate')
    expect(result.current).toHaveProperty('updateLatency')
    expect(result.current).toHaveProperty('totalUpdates')

    // Data freshness indicators
    expect(result.current).toHaveProperty('lastRaceUpdate')
    expect(result.current).toHaveProperty('lastPoolUpdate')
    expect(result.current).toHaveProperty('lastResultsUpdate')
    expect(result.current).toHaveProperty('lastEntrantsUpdate')

    // Actions
    expect(result.current).toHaveProperty('reconnect')
    expect(result.current).toHaveProperty('clearHistory')
    expect(result.current).toHaveProperty('getConnectionHealth')

    // Verify functions are callable
    expect(typeof result.current.reconnect).toBe('function')
    expect(typeof result.current.clearHistory).toBe('function')
    expect(typeof result.current.getConnectionHealth).toBe('function')
  })

  it('should handle real-time subscription and message processing', async () => {
    // Mock the subscription callback
    const mockCallback = jest.fn<void, [MockRealtimeEvent]>()
    const mockUnsubscribe = jest.fn()

    // Setup mock subscription
    mockSubscribe.mockImplementation((channels, callback) => {
      mockCallback.mockImplementation(callback)
      return mockUnsubscribe
    })

    // Mock the listDocuments to return a race document
    mockListDocuments.mockResolvedValue({
      documents: [
        {
          $id: 'race-123',
          raceId: 'race-456',
          status: 'open',
          resultsAvailable: false,
        },
      ],
    })

    const { result } = renderHook(() => useUnifiedRaceRealtime(mockProps))

    // Wait for initial data fetch and subscription setup
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    // Ensure the subscription was set up
    expect(mockSubscribe).toHaveBeenCalled()

    // Simulate a real-time message with correct raceId matching
    await act(async () => {
      mockCallback({
        events: [
          'databases.raceday-db.collections.races.documents.race-123.update',
        ],
        channels: ['databases.raceday-db.collections.races.documents.race-123'],
        timestamp: new Date().toISOString(),
        payload: {
          $id: 'race-123',
          raceId: 'race-456', // Match the race ID from mockProps
          status: 'closed',
          resultsAvailable: true,
        },
      })
    })

    // Wait for the message to be processed
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150)) // Wait for throttling delay
    })

    // Verify the hook processed the message
    expect(result.current.race?.status).toBe('closed')
    expect(result.current.race?.resultsAvailable).toBe(true)
    expect(result.current.lastRaceUpdate).toBeInstanceOf(Date)
    expect(result.current.totalUpdates).toBeGreaterThan(0)
  })

  it('should handle pool data updates from real-time messages', async () => {
    const mockCallback = jest.fn<void, [MockRealtimeEvent]>()
    const mockUnsubscribe = jest.fn()

    mockSubscribe.mockImplementation((channels, callback) => {
      mockCallback.mockImplementation(callback)
      return mockUnsubscribe
    })

    // Mock the listDocuments to return a race document
    mockListDocuments.mockResolvedValue({
      documents: [
        {
          $id: 'race-123',
          raceId: 'race-456',
          status: 'open',
          resultsAvailable: false,
        },
      ],
    })

    const { result } = renderHook(() => useUnifiedRaceRealtime(mockProps))

    // Wait for initial data fetch
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Simulate a pool data update
    await act(async () => {
      mockCallback({
        events: [
          'databases.raceday-db.collections.race-pools.documents.create',
        ],
        channels: ['databases.raceday-db.collections.race-pools.documents'],
        timestamp: new Date().toISOString(),
        payload: {
          $id: 'pool-123',
          raceId: 'race-456',
          winPoolTotal: 10000,
          placePoolTotal: 5000,
          totalRacePool: 15000,
        },
      })
    })

    // Wait for the message to be processed
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150)) // Wait for throttling delay
    })

    // Verify pool data was updated
    expect(result.current.poolData).toEqual({
      $id: 'pool-123',
      $createdAt: expect.any(String),
      $updatedAt: expect.any(String),
      raceId: 'race-456',
      winPoolTotal: 10000,
      placePoolTotal: 5000,
      quinellaPoolTotal: 0,
      trifectaPoolTotal: 0,
      exactaPoolTotal: 0,
      first4PoolTotal: 0,
      totalRacePool: 15000,
      currency: '$',
      lastUpdated: expect.any(String),
      isLive: false,
    })
    expect(result.current.lastPoolUpdate).toBeInstanceOf(Date)
  })

  it('should batch multiple updates for performance', async () => {
    const mockCallback = jest.fn<void, [MockRealtimeEvent]>()
    const mockUnsubscribe = jest.fn()

    mockSubscribe.mockImplementation((channels, callback) => {
      mockCallback.mockImplementation(callback)
      return mockUnsubscribe
    })

    // Mock the listDocuments to return a race document
    mockListDocuments.mockResolvedValue({
      documents: [
        {
          $id: 'race-123',
          raceId: 'race-456',
          status: 'open',
          resultsAvailable: false,
        },
      ],
    })

    const { result } = renderHook(() => useUnifiedRaceRealtime(mockProps))

    // Wait for initial data fetch
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Simulate multiple rapid updates with correct raceId matching
    await act(async () => {
      mockCallback({
        events: [
          'databases.raceday-db.collections.races.documents.race-123.update',
        ],
        channels: ['databases.raceday-db.collections.races.documents.race-123'],
        timestamp: new Date().toISOString(),
        payload: {
          $id: 'race-123',
          raceId: 'race-456', // Match the race ID from mockProps
          status: 'closed',
        },
      })

      mockCallback({
        events: [
          'databases.raceday-db.collections.entrants.documents.entrant-1.update',
        ],
        channels: [
          'databases.raceday-db.collections.entrants.documents.entrant-1',
        ],
        timestamp: new Date().toISOString(),
        payload: {
          $id: 'entrant-1',
          race: 'race-123', // Add race reference for proper matching
          winOdds: 3.0,
        },
      })
    })

    // Wait for the messages to be processed
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150)) // Wait for throttling delay
    })

    // Updates should be processed
    expect(result.current.race?.status).toBe('closed')
    expect(result.current.entrants[0]?.winOdds).toBe(3.0)
  })

  it('should cleanup subscription on unmount', () => {
    const mockUnsubscribe = jest.fn()
    mockSubscribe.mockReturnValue(mockUnsubscribe)

    const { unmount } = renderHook(() => useUnifiedRaceRealtime(mockProps))

    unmount()

    expect(mockUnsubscribe).toHaveBeenCalled()
  })
})
