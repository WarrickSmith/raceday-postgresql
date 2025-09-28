import {
  calculatePollingIntervalMs,
  isRaceComplete,
} from '@/hooks/useRacePolling'

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
    const startTime = new Date(baseNow + 120 * MINUTE_IN_MS).toISOString()
    const interval = calculatePollingIntervalMs(startTime, 'Open', false)
    expect(interval).toBe(30 * MINUTE_IN_MS)
  })

  it('returns active interval when race start is between 5 and 65 minutes away', () => {
    const startTime = new Date(baseNow + 30 * MINUTE_IN_MS).toISOString()
    const interval = calculatePollingIntervalMs(startTime, 'Open', false)
    expect(interval).toBe(2.5 * MINUTE_IN_MS)
  })

  it('returns active interval for the transition window between 60 and 65 minutes', () => {
    const startTime = new Date(baseNow + 64.5 * MINUTE_IN_MS).toISOString()
    const interval = calculatePollingIntervalMs(startTime, 'Open', false)
    expect(interval).toBe(2.5 * MINUTE_IN_MS)
  })

  it('returns critical interval when race is within five minutes', () => {
    const startTime = new Date(baseNow + 3 * MINUTE_IN_MS).toISOString()
    const interval = calculatePollingIntervalMs(startTime, 'Open', false)
    expect(interval).toBe(30 * 1000)
  })

  it('returns critical interval once the advertised start time has passed but status is still open', () => {
    const startTime = new Date(baseNow - 2 * MINUTE_IN_MS).toISOString()
    const interval = calculatePollingIntervalMs(startTime, 'Open', false)
    expect(interval).toBe(30 * 1000)
  })

  it('returns critical interval for closed and running statuses regardless of start time', () => {
    const startTime = new Date(baseNow + 90 * MINUTE_IN_MS).toISOString()
    const closedInterval = calculatePollingIntervalMs(startTime, 'Closed', false)
    const runningInterval = calculatePollingIntervalMs(startTime, 'Running', false)

    expect(closedInterval).toBe(30 * 1000)
    expect(runningInterval).toBe(30 * 1000)
  })

  it('applies double frequency multiplier when enabled', () => {
    const startTime = new Date(baseNow + 30 * MINUTE_IN_MS).toISOString()
    const interval = calculatePollingIntervalMs(startTime, 'Open', true)
    expect(interval).toBe(1.25 * MINUTE_IN_MS)
  })

  it('returns infinity when race is complete', () => {
    const startTime = new Date(baseNow + 30 * MINUTE_IN_MS).toISOString()
    const interval = calculatePollingIntervalMs(startTime, 'Final', false)
    expect(interval).toBe(Number.POSITIVE_INFINITY)
  })

  it('falls back to active interval when start time is invalid', () => {
    const interval = calculatePollingIntervalMs('invalid-date', 'Open', false)
    expect(interval).toBe(2.5 * MINUTE_IN_MS)
  })
})

describe('isRaceComplete', () => {
  it('returns true for recognised completed statuses', () => {
    expect(isRaceComplete('Final')).toBe(true)
    expect(isRaceComplete('finalized')).toBe(true)
    expect(isRaceComplete('Abandoned')).toBe(true)
  })

  it('returns false for active statuses or empty values', () => {
    expect(isRaceComplete('Open')).toBe(false)
    expect(isRaceComplete('Running')).toBe(false)
    expect(isRaceComplete('')).toBe(false)
    expect(isRaceComplete(undefined)).toBe(false)
  })
})
