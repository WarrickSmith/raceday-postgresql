import { describe, expect, it } from 'vitest'

import { calculatePollingInterval } from '../../../src/scheduler/interval.js'

describe('calculatePollingInterval', () => {
  it('returns 15 seconds when the race has started or is within the critical window', () => {
    expect(calculatePollingInterval(0)).toBe(15_000)
    expect(calculatePollingInterval(-30)).toBe(15_000)
  })

  it('returns 15 seconds when time-to-start is within the critical five-minute window', () => {
    expect(calculatePollingInterval(1)).toBe(15_000)
    expect(calculatePollingInterval(299)).toBe(15_000)
    expect(calculatePollingInterval(300)).toBe(15_000)
  })

  it('returns 30 seconds for the moderate window (greater than 5 minutes up to 15 minutes)', () => {
    expect(calculatePollingInterval(301)).toBe(30_000)
    expect(calculatePollingInterval(899)).toBe(30_000)
    expect(calculatePollingInterval(900)).toBe(30_000)
  })

  it('returns 60 seconds when time-to-start exceeds 15 minutes', () => {
    expect(calculatePollingInterval(901)).toBe(60_000)
    expect(calculatePollingInterval(5_400)).toBe(60_000)
  })

  it('throws when provided a non-finite value', () => {
    expect(() => calculatePollingInterval(Number.NaN)).toThrow(TypeError)
    expect(() => calculatePollingInterval(Infinity)).toThrow(TypeError)
    expect(() => calculatePollingInterval(-Infinity)).toThrow(TypeError)
  })
})
