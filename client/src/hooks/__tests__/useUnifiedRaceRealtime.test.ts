/**
 * Unit tests for useUnifiedRaceRealtime hook
 */

import { renderHook, act } from '@testing-library/react'
import { useUnifiedRaceRealtime } from '../useUnifiedRaceRealtime'
import { Race, Entrant } from '@/types/meetings'
import { client, databases } from '@/lib/appwrite-client'

// Mock the Appwrite client
jest.mock('@/lib/appwrite-client', () => ({
  client: {
    subscribe: jest.fn(() => jest.fn()),
  },
  databases: {
    listDocuments: jest.fn(),
  },
}))

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
    ;(databases.listDocuments as jest.Mock).mockResolvedValue({
      documents: [],
    })
  })

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useUnifiedRaceRealtime(mockProps))

    expect(result.current.race).toEqual(mockRace)
    expect(result.current.entrants).toEqual(mockEntrants)
    expect(result.current.isConnected).toBe(false) // Hook starts disconnected
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
    expect(result.current.connectionAttempts).toBe(1)
  })

  it('should clear update history', () => {
    const { result } = renderHook(() => useUnifiedRaceRealtime(mockProps))

    // First set some updates
    act(() => {
      // Simulate some updates by setting state directly
      result.current.totalUpdates = 5
      result.current.lastUpdate = new Date()
    })

    act(() => {
      result.current.clearHistory()
    })

    expect(result.current.totalUpdates).toBe(0)
    expect(result.current.lastUpdate).toBeNull()
    expect(result.current.updateLatency).toBe(0)
  })

  it('should fetch initial data when raceId changes', async () => {
    const { result, rerender } = renderHook(
      ({ raceId }) => useUnifiedRaceRealtime({ ...mockProps, raceId }),
      { initialProps: { raceId: 'race-456' } }
    )

    // Clear mock calls before changing raceId
    ;(fetch as jest.Mock).mockClear()

    // Change raceId
    await act(async () => {
      rerender({ raceId: 'race-789' })
    })

    // Should fetch data when raceId changes and no initial data is provided
    expect(fetch).toHaveBeenCalledWith('/api/race/race-789')
  })

  it('should handle fetch errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    ;(fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'))

    const { result } = renderHook(() =>
      useUnifiedRaceRealtime({
        ...mockProps,
        initialRace: null, // Force fetch
        initialEntrants: [],
      })
    )

    // Wait for any async operations
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Should not throw error, just handle gracefully
    expect(consoleSpy).toHaveBeenCalledWith(
      '[UnifiedRaceRealtime] Failed to fetch initial data',
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
    const mockCallback = jest.fn()
    const mockUnsubscribe = jest.fn()

    // Setup mock subscription
    ;(client.subscribe as jest.Mock).mockImplementation(
      (channels, callback) => {
        mockCallback.mockImplementation(callback)
        return mockUnsubscribe
      }
    )

    const { result } = renderHook(() => useUnifiedRaceRealtime(mockProps))

    // Simulate a real-time message
    await act(async () => {
      mockCallback({
        events: [
          'databases.raceday-db.collections.races.documents.race-123.update',
        ],
        channels: ['databases.raceday-db.collections.races.documents.race-123'],
        timestamp: new Date().toISOString(),
        payload: {
          $id: 'race-123',
          status: 'closed',
          resultsAvailable: true,
        },
      })
    })

    // Verify the hook processed the message
    expect(result.current.race?.status).toBe('closed')
    expect(result.current.race?.resultsAvailable).toBe(true)
    expect(result.current.lastRaceUpdate).toBeInstanceOf(Date)
    expect(result.current.totalUpdates).toBeGreaterThan(0)
  })

  it('should handle pool data updates from real-time messages', async () => {
    const mockCallback = jest.fn()
    const mockUnsubscribe = jest.fn()

    ;(client.subscribe as jest.Mock).mockImplementation(
      (channels, callback) => {
        mockCallback.mockImplementation(callback)
        return mockUnsubscribe
      }
    )

    const { result } = renderHook(() => useUnifiedRaceRealtime(mockProps))

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

    // Verify pool data was updated
    expect(result.current.poolData).toEqual({
      $id: 'pool-123',
      $createdAt: undefined,
      $updatedAt: undefined,
      raceId: 'race-456',
      winPoolTotal: 10000,
      placePoolTotal: 5000,
      quinellaPoolTotal: 0,
      trifectaPoolTotal: 0,
      exactaPoolTotal: 0,
      first4PoolTotal: 0,
      totalRacePool: 15000,
      currency: '$',
      lastUpdated: undefined,
      isLive: false,
    })
    expect(result.current.lastPoolUpdate).toBeInstanceOf(Date)
  })

  it('should batch multiple updates for performance', async () => {
    const mockCallback = jest.fn()
    const mockUnsubscribe = jest.fn()

    ;(client.subscribe as jest.Mock).mockImplementation(
      (channels, callback) => {
        mockCallback.mockImplementation(callback)
        return mockUnsubscribe
      }
    )

    const { result } = renderHook(() => useUnifiedRaceRealtime(mockProps))

    // Simulate multiple rapid updates
    await act(async () => {
      mockCallback({
        events: [
          'databases.raceday-db.collections.races.documents.race-123.update',
        ],
        channels: ['databases.raceday-db.collections.races.documents.race-123'],
        timestamp: new Date().toISOString(),
        payload: {
          $id: 'race-123',
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
          winOdds: 3.0,
        },
      })
    })

    // Updates should be processed
    expect(result.current.race?.status).toBe('closed')
    expect(result.current.entrants[0]?.winOdds).toBe(3.0)
  })

  it('should cleanup subscription on unmount', () => {
    const mockUnsubscribe = jest.fn()
    ;(client.subscribe as jest.Mock).mockReturnValue(mockUnsubscribe)

    const { unmount } = renderHook(() => useUnifiedRaceRealtime(mockProps))

    unmount()

    expect(mockUnsubscribe).toHaveBeenCalled()
  })
})
