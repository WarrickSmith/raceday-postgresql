import { act, renderHook, waitFor } from '@testing-library/react'
import {
  calculatePollingIntervalMs,
  isRaceComplete,
  useRacePolling,
} from '@/hooks/useRacePolling'
import type { RaceContextData } from '@/contexts/RaceContext'

const MINUTE_IN_MS = 60 * 1000

describe('calculatePollingIntervalMs', () => {
  const baseNow = new Date('2024-05-01T00:00:00Z').getTime()
  let dateNowSpy: jest.SpyInstance<number, []>

  beforeAll(() => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(baseNow)
  })

  afterAll(() => {
    dateNowSpy.mockRestore()
  })

  afterEach(() => {
    dateNowSpy.mockReturnValue(baseNow)
  })

  it('returns baseline interval when race start is more than 65 minutes away', () => {
    const start_time = new Date(baseNow + 120 * MINUTE_IN_MS).toISOString()
    const interval = calculatePollingIntervalMs(start_time, 'Open', false)
    expect(interval).toBe(30 * MINUTE_IN_MS)
  })

  it('returns active interval when race start is between 5 and 65 minutes away', () => {
    const start_time = new Date(baseNow + 30 * MINUTE_IN_MS).toISOString()
    const interval = calculatePollingIntervalMs(start_time, 'Open', false)
    expect(interval).toBe(2.5 * MINUTE_IN_MS)
  })

  it('returns active interval for the transition window between 60 and 65 minutes', () => {
    const start_time = new Date(baseNow + 64.5 * MINUTE_IN_MS).toISOString()
    const interval = calculatePollingIntervalMs(start_time, 'Open', false)
    expect(interval).toBe(2.5 * MINUTE_IN_MS)
  })

  it('returns critical interval when race is within five minutes', () => {
    const start_time = new Date(baseNow + 3 * MINUTE_IN_MS).toISOString()
    const interval = calculatePollingIntervalMs(start_time, 'Open', false)
    expect(interval).toBe(30 * 1000)
  })

  it('returns critical interval once the advertised start time has passed but status is still open', () => {
    const start_time = new Date(baseNow - 2 * MINUTE_IN_MS).toISOString()
    const interval = calculatePollingIntervalMs(start_time, 'Open', false)
    expect(interval).toBe(30 * 1000)
  })

  it('returns critical interval for closed and running statuses regardless of start time', () => {
    const start_time = new Date(baseNow + 90 * MINUTE_IN_MS).toISOString()
    const closedInterval = calculatePollingIntervalMs(start_time, 'Closed', false)
    const runningInterval = calculatePollingIntervalMs(start_time, 'Running', false)

    expect(closedInterval).toBe(30 * 1000)
    expect(runningInterval).toBe(30 * 1000)
  })

  it('applies double frequency multiplier when enabled', () => {
    const start_time = new Date(baseNow + 30 * MINUTE_IN_MS).toISOString()
    const interval = calculatePollingIntervalMs(start_time, 'Open', true)
    expect(interval).toBe(1.25 * MINUTE_IN_MS)
  })

  it('returns infinity when race is complete', () => {
    const start_time = new Date(baseNow + 30 * MINUTE_IN_MS).toISOString()
    const interval = calculatePollingIntervalMs(start_time, 'Final', false)
    expect(interval).toBe(Number.POSITIVE_INFINITY)
  })

  it('falls back to baseline interval when start time is invalid', () => {
    const interval = calculatePollingIntervalMs('invalid-date', 'Open', false)
    expect(interval).toBe(30 * MINUTE_IN_MS)
  })
})

describe('isRaceComplete', () => {
  it('returns true for recognised completed statuses', () => {
    expect(isRaceComplete('Final')).toBe(true)
    expect(isRaceComplete('finalized')).toBe(true)
    expect(isRaceComplete('Abandoned')).toBe(true)
    expect(isRaceComplete('Official')).toBe(true)
  })

  it('returns false for active statuses or empty values', () => {
    expect(isRaceComplete('Open')).toBe(false)
    expect(isRaceComplete('Running')).toBe(false)
    expect(isRaceComplete('')).toBe(false)
    expect(isRaceComplete(undefined)).toBe(false)
  })
})

describe('useRacePolling lifecycle behaviour', () => {
  const baseNow = new Date('2024-05-01T00:00:00Z')
  const race_id = 'race-1'
  let originalFetch: typeof globalThis.fetch
  let fetchMock: jest.MockedFunction<typeof globalThis.fetch>

  const createRaceData = (
    status: string,
    start_time: string
  ): RaceContextData => ({
    race: {
      $id: 'doc-race-1',
      $createdAt: baseNow.toISOString(),
      $updatedAt: baseNow.toISOString(),
      race_id,
      race_number: 1,
      name: 'Test Race',
      start_time,
      meeting: 'meeting-1',
      status,
    },
    meeting: {
      $id: 'doc-meeting-1',
      $createdAt: baseNow.toISOString(),
      $updatedAt: baseNow.toISOString(),
      meeting_id: 'meeting-1',
      meeting_name: 'Test Meeting',
      country: 'NZ',
      race_type: 'Gallops',
      category: 'T',
      date: baseNow.toISOString(),
    },
    entrants: [],
    navigationData: {
      previousRace: null,
      nextRace: null,
      nextScheduledRace: null,
    },
    dataFreshness: {
      last_updated: baseNow.toISOString(),
      entrantsDataAge: 0,
      odds_historyCount: 0,
      money_flow_historyCount: 0,
    },
  })

  const createMockResponse = (
    status: string,
    start_time: string
  ): Response =>
    ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(createRaceData(status, start_time)),
    } as Response)

  beforeAll(() => {
    originalFetch = global.fetch
  })

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(baseNow)
    fetchMock = jest
      .fn<ReturnType<typeof globalThis.fetch>, Parameters<typeof globalThis.fetch>>()
      .mockResolvedValue(createMockResponse('Closed', baseNow.toISOString()))
    global.fetch = fetchMock
  })

  afterEach(() => {
    fetchMock.mockReset()
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    global.fetch = originalFetch
  })

  it('stops polling on final status and resumes when race reactivates', async () => {
    const criticalStartTime = new Date(
      baseNow.getTime() + 3 * MINUTE_IN_MS
    ).toISOString()

    fetchMock
      .mockResolvedValueOnce(createMockResponse('Closed', criticalStartTime))
      .mockResolvedValueOnce(createMockResponse('Final', criticalStartTime))
      .mockResolvedValueOnce(
        createMockResponse(
          'Closed',
          new Date(baseNow.getTime() + 30 * MINUTE_IN_MS).toISOString()
        )
      )

    const onDataUpdate = jest.fn()
    const onError = jest.fn()

    const { result, rerender } = renderHook((props) => useRacePolling(props), {
      initialProps: {
        race_id,
        raceStartTime: criticalStartTime,
        raceStatus: 'Open',
        hasInitialData: true,
        onDataUpdate,
        onError,
      },
    })

    act(() => {
      jest.advanceTimersByTime(30 * 1000)
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    expect(result.current.isPolling).toBe(true)
    expect(result.current.currentIntervalMs).toBe(30 * 1000)

    act(() => {
      jest.advanceTimersByTime(30 * 1000)
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    await waitFor(() => expect(result.current.isPolling).toBe(false))

    act(() => {
      rerender({
        race_id,
        raceStartTime: criticalStartTime,
        raceStatus: 'Final',
        hasInitialData: true,
        onDataUpdate,
        onError,
      })
    })

    await waitFor(() => expect(result.current.isPolling).toBe(false))

    act(() => {
      rerender({
        race_id,
        raceStartTime: new Date(
          baseNow.getTime() + 30 * MINUTE_IN_MS
        ).toISOString(),
        raceStatus: 'Open',
        hasInitialData: true,
        onDataUpdate,
        onError,
      })
    })

    await waitFor(() => expect(result.current.isPolling).toBe(true))

    act(() => {
      jest.advanceTimersByTime(2.5 * MINUTE_IN_MS)
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))

    expect(onDataUpdate).toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})
