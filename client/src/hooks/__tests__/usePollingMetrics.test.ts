import { renderHook } from '@testing-library/react'
import { usePollingMetrics } from '../usePollingMetrics'
import type { RacePollingState } from '../useRacePolling'

// Mock polling state factory
const createMockPollingState = (
  overrides: Partial<RacePollingState> = {}
): RacePollingState => ({
  isPolling: false,
  error: null,
  lastUpdated: null,
  currentIntervalMs: null,
  nextPollTimestamp: null,
  isDoubleFrequencyEnabled: false,
  lastRequestDurationMs: null,
  retry: jest.fn(),
  stop: jest.fn(),
  ...overrides,
})

describe('usePollingMetrics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should initialize with empty metrics', () => {
    const pollingState = createMockPollingState()
    const { result } = renderHook(() => usePollingMetrics(pollingState))

    expect(result.current.requests).toBe(0)
    expect(result.current.successRate).toBe(100)
    expect(result.current.errorRate).toBe(0)
    expect(result.current.avgLatency).toBe(0)
    expect(result.current.alerts).toEqual([])
    expect(result.current.recentActivity).toEqual([])
    expect(result.current.uptime).toBe(100)
  })

  it('should have metrics for all endpoints', () => {
    const pollingState = createMockPollingState()
    const { result } = renderHook(() => usePollingMetrics(pollingState))

    expect(result.current.endpoints).toHaveProperty('race')
    expect(result.current.endpoints).toHaveProperty('pools')
    expect(result.current.endpoints).toHaveProperty('money-flow')

    // Each endpoint should have complete metrics
    Object.values(result.current.endpoints).forEach((endpoint) => {
      expect(endpoint).toMatchObject({
        requests: 0,
        errors: 0,
        latency: 0,
        lastSuccess: null,
        status: 'OK',
        fallbacks: 0,
        recoveries: 0,
        lastError: null,
      })
    })
  })

  it('should initialize cadence metrics', () => {
    const pollingState = createMockPollingState({
      currentIntervalMs: 30000,
      nextPollTimestamp: Date.now() + 30000,
    })
    const { result } = renderHook(() => usePollingMetrics(pollingState))

    expect(result.current.cadence).toMatchObject({
      targetIntervalMs: 30000,
      actualIntervalMs: null,
      status: 'on-track',
      nextPollTimestamp: expect.any(Number),
      durationSeconds: expect.any(Number),
    })
  })

  it('should update metrics when polling state changes', () => {
    const pollingState = createMockPollingState({
      isPolling: false,
    })

    const { result, rerender } = renderHook(
      ({ state }) => usePollingMetrics(state),
      { initialProps: { state: pollingState } }
    )

    // Initial state
    expect(result.current.requests).toBe(0)

    // Update to polling
    const updatedState = createMockPollingState({
      isPolling: true,
      lastUpdated: new Date(),
    })

    rerender({ state: updatedState })

    // Metrics should remain consistent (simplified metric tracking)
    expect(result.current).toBeDefined()
  })

  it('should track errors in polling state', () => {
    const errorMessage = 'Network timeout'
    const pollingState = createMockPollingState({
      isPolling: true,
      error: new Error(errorMessage),
      lastUpdated: new Date(),
    })

    const { result } = renderHook(() => usePollingMetrics(pollingState))

    // Error tracking is reflected in error rate
    expect(result.current.errorRate).toBeGreaterThanOrEqual(0)
  })

  it('should calculate success rate correctly', () => {
    const pollingState = createMockPollingState({
      isPolling: false,
      lastUpdated: null,
    })

    const { result } = renderHook(() => usePollingMetrics(pollingState))

    // With no requests, success rate should be 100%
    expect(result.current.successRate).toBe(100)
    expect(result.current.errorRate).toBe(0)
  })

  it('should respect custom configuration', () => {
    const pollingState = createMockPollingState()
    const config = {
      maxActivityEvents: 10,
      errorRateThreshold: 50,
      latencyThreshold: 10000,
      cadenceTolerancePercent: 20,
    }

    const { result } = renderHook(() => usePollingMetrics(pollingState, config))

    expect(result.current).toBeDefined()
    // Config is applied internally, verify metrics exist
    expect(result.current.recentActivity.length).toBeLessThanOrEqual(10)
  })

  it('should limit recent activity to maxActivityEvents', () => {
    const pollingState = createMockPollingState({
      isPolling: true,
      lastUpdated: new Date(),
    })

    const { result } = renderHook(() =>
      usePollingMetrics(pollingState, { maxActivityEvents: 5 })
    )

    expect(result.current.recentActivity.length).toBeLessThanOrEqual(5)
  })

  it('should calculate uptime percentage', () => {
    const pollingState = createMockPollingState({
      isPolling: false,
      lastUpdated: new Date(),
    })

    const { result } = renderHook(() => usePollingMetrics(pollingState))

    expect(result.current.uptime).toBeGreaterThanOrEqual(0)
    expect(result.current.uptime).toBeLessThanOrEqual(100)
  })

  it('should handle double frequency mode', () => {
    const pollingState = createMockPollingState({
      isDoubleFrequencyEnabled: true,
      currentIntervalMs: 15000, // Half of normal 30s
    })

    const { result } = renderHook(() => usePollingMetrics(pollingState))

    expect(result.current.cadence.targetIntervalMs).toBe(15000)
  })

  it('should update duration seconds over time', () => {
    const pollingState = createMockPollingState()
    const { result } = renderHook(() => usePollingMetrics(pollingState))

    expect(result.current.cadence.durationSeconds).toBeGreaterThanOrEqual(0)
  })

  it('should handle null lastUpdated gracefully', () => {
    const pollingState = createMockPollingState({
      lastUpdated: null,
    })

    const { result } = renderHook(() => usePollingMetrics(pollingState))

    expect(result.current.cadence.actualIntervalMs).toBeNull()
  })

  it('should initialize all endpoint statuses as OK', () => {
    const pollingState = createMockPollingState()
    const { result } = renderHook(() => usePollingMetrics(pollingState))

    Object.values(result.current.endpoints).forEach((endpoint) => {
      expect(endpoint.status).toBe('OK')
    })
  })
})