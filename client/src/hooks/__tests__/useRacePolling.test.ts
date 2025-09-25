import {
  calculatePollingIntervalMs,
  isRaceComplete,
} from '@/hooks/useRacePolling'

const MINUTE_IN_MS = 60 * 1000

describe('calculatePollingIntervalMs', () => {
  const originalDateNow = Date.now

  beforeAll(() => {
    // Freeze time for deterministic interval calculations
    Date.now = () => new Date('2024-05-01T00:00:00Z').getTime()
  })

  afterAll(() => {
    Date.now = originalDateNow
  })

  it('returns baseline interval when race start is more than 65 minutes away', () => {
    const startTime = new Date('2024-05-01T02:00:00Z').toISOString()
    const interval = calculatePollingIntervalMs(startTime, 'Open', false)
    expect(interval).toBe(30 * MINUTE_IN_MS)
  })

  it('returns active interval when race start is between 5 and 65 minutes away', () => {
    const startTime = new Date('2024-05-01T00:30:00Z').toISOString()
    const interval = calculatePollingIntervalMs(startTime, 'Open', false)
    expect(interval).toBe(2.5 * MINUTE_IN_MS)
  })

  it('returns critical interval when race is within five minutes', () => {
    const startTime = new Date('2024-05-01T00:03:00Z').toISOString()
    const interval = calculatePollingIntervalMs(startTime, 'Open', false)
    expect(interval).toBe(30 * 1000)
  })

  it('applies double frequency multiplier when enabled', () => {
    const startTime = new Date('2024-05-01T00:30:00Z').toISOString()
    const interval = calculatePollingIntervalMs(startTime, 'Open', true)
    expect(interval).toBe(1.25 * MINUTE_IN_MS)
  })

  it('returns infinity when race is complete', () => {
    const startTime = new Date('2024-05-01T00:30:00Z').toISOString()
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
