import { describe, expect, it } from 'vitest'
import {
  calculatePoolAmounts,
  calculatePoolPercentages,
  calculateIncrementalDelta,
  getTimelineInterval,
  calculateTimeMetadata,
  type PoolData,
  type PoolAmounts,
  type PreviousBucketData,
} from '../../../src/workers/money-flow.js'

describe('Money Flow Calculation Utilities', () => {
  describe('calculatePoolAmounts (AC3)', () => {
    it('should calculate pool amounts from hold percentage', () => {
      const poolData: PoolData = {
        winPoolTotal: 50000, // $50,000
        placePoolTotal: 30000, // $30,000
        totalRacePool: 80000, // $80,000
      }

      const result = calculatePoolAmounts(15.5, poolData)

      // 15.5% of $50,000 = $7,750 = 775,000 cents
      expect(result.winPoolAmount).toBe(775000)
      // 15.5% of $30,000 = $4,650 = 465,000 cents
      expect(result.placePoolAmount).toBe(465000)
      // 15.5% of $80,000 = $12,400 = 1,240,000 cents
      expect(result.totalPoolAmount).toBe(1240000)
    })

    it('should handle zero pool scenario', () => {
      const poolData: PoolData = {
        winPoolTotal: 0,
        placePoolTotal: 0,
        totalRacePool: 0,
      }

      const result = calculatePoolAmounts(15.5, poolData)

      expect(result.winPoolAmount).toBe(0)
      expect(result.placePoolAmount).toBe(0)
      expect(result.totalPoolAmount).toBe(0)
    })

    it('should handle scratched entrant with zero hold percentage (edge case)', () => {
      const poolData: PoolData = {
        winPoolTotal: 100000,
        placePoolTotal: 60000,
        totalRacePool: 160000,
      }

      const result = calculatePoolAmounts(0, poolData)

      expect(result.winPoolAmount).toBe(0)
      expect(result.placePoolAmount).toBe(0)
      expect(result.totalPoolAmount).toBe(0)
    })

    it('should round to nearest cent for precise calculations', () => {
      const poolData: PoolData = {
        winPoolTotal: 33333.33,
        placePoolTotal: 22222.22,
        totalRacePool: 55555.55,
      }

      const result = calculatePoolAmounts(10.5, poolData)

      // 10.5% of $33,333.33 = $3,499.9997 = 349999.97 cents → rounds to 350000
      expect(result.winPoolAmount).toBe(350000)
      expect(result.placePoolAmount).toBe(233333)
      expect(result.totalPoolAmount).toBe(583333)
    })

    it('should handle very large pool totals', () => {
      const poolData: PoolData = {
        winPoolTotal: 5000000, // $5 million
        placePoolTotal: 3000000, // $3 million
        totalRacePool: 8000000, // $8 million
      }

      const result = calculatePoolAmounts(25.0, poolData)

      expect(result.winPoolAmount).toBe(125000000) // $1.25M in cents
      expect(result.placePoolAmount).toBe(75000000) // $750K in cents
      expect(result.totalPoolAmount).toBe(200000000) // $2M in cents
    })
  })

  describe('calculatePoolPercentages (AC3)', () => {
    it('should calculate pool percentages from amounts', () => {
      const poolAmounts: PoolAmounts = {
        winPoolAmount: 775000, // $7,750 in cents
        placePoolAmount: 465000, // $4,650 in cents
        totalPoolAmount: 1240000, // $12,400 in cents
      }

      const poolData: PoolData = {
        winPoolTotal: 50000, // $50,000
        placePoolTotal: 30000, // $30,000
        totalRacePool: 80000,
      }

      const result = calculatePoolPercentages(poolAmounts, poolData)

      // (775000 / (50000 * 100)) * 100 = 15.5%
      expect(result.win_pool_percentage).toBeCloseTo(15.5, 5)
      expect(result.place_pool_percentage).toBeCloseTo(15.5, 5)
    })

    it('should return null for win percentage when win pool is zero', () => {
      const poolAmounts: PoolAmounts = {
        winPoolAmount: 100000,
        placePoolAmount: 50000,
        totalPoolAmount: 150000,
      }

      const poolData: PoolData = {
        winPoolTotal: 0, // Zero win pool
        placePoolTotal: 30000,
        totalRacePool: 30000,
      }

      const result = calculatePoolPercentages(poolAmounts, poolData)

      expect(result.win_pool_percentage).toBeNull()
      expect(result.place_pool_percentage).not.toBeNull()
    })

    it('should return null for place percentage when place pool is zero', () => {
      const poolAmounts: PoolAmounts = {
        winPoolAmount: 100000,
        placePoolAmount: 50000,
        totalPoolAmount: 150000,
      }

      const poolData: PoolData = {
        winPoolTotal: 50000,
        placePoolTotal: 0, // Zero place pool
        totalRacePool: 50000,
      }

      const result = calculatePoolPercentages(poolAmounts, poolData)

      expect(result.win_pool_percentage).not.toBeNull()
      expect(result.place_pool_percentage).toBeNull()
    })

    it('should handle even distribution scenario', () => {
      const poolAmounts: PoolAmounts = {
        winPoolAmount: 1000000, // $10,000 in cents
        placePoolAmount: 1000000, // $10,000 in cents
        totalPoolAmount: 2000000,
      }

      const poolData: PoolData = {
        winPoolTotal: 100000, // $100,000
        placePoolTotal: 100000, // $100,000
        totalRacePool: 200000,
      }

      const result = calculatePoolPercentages(poolAmounts, poolData)

      expect(result.win_pool_percentage).toBe(10)
      expect(result.place_pool_percentage).toBe(10)
    })

    it('should handle skewed distribution (single entrant dominating)', () => {
      const poolAmounts: PoolAmounts = {
        winPoolAmount: 4500000, // $45,000 in cents (90% of pool)
        placePoolAmount: 2700000, // $27,000 in cents (90% of pool)
        totalPoolAmount: 7200000,
      }

      const poolData: PoolData = {
        winPoolTotal: 50000,
        placePoolTotal: 30000,
        totalRacePool: 80000,
      }

      const result = calculatePoolPercentages(poolAmounts, poolData)

      expect(result.win_pool_percentage).toBeCloseTo(90, 5)
      expect(result.place_pool_percentage).toBeCloseTo(90, 5)
    })
  })

  describe('calculateIncrementalDelta (AC4)', () => {
    it('should calculate positive delta for increasing pools', () => {
      const current: PoolAmounts = {
        winPoolAmount: 1000000, // $10,000
        placePoolAmount: 600000, // $6,000
        totalPoolAmount: 1600000,
      }

      const previous: PreviousBucketData = {
        winPoolAmount: 900000, // $9,000
        placePoolAmount: 550000, // $5,500
      }

      const result = calculateIncrementalDelta(current, previous)

      expect(result.incrementalWinAmount).toBe(100000) // $1,000 increase
      expect(result.incrementalPlaceAmount).toBe(50000) // $500 increase
    })

    it('should calculate negative delta for decreasing pools', () => {
      const current: PoolAmounts = {
        winPoolAmount: 900000,
        placePoolAmount: 500000,
        totalPoolAmount: 1400000,
      }

      const previous: PreviousBucketData = {
        winPoolAmount: 1000000,
        placePoolAmount: 600000,
      }

      const result = calculateIncrementalDelta(current, previous)

      expect(result.incrementalWinAmount).toBe(-100000) // $1,000 decrease
      expect(result.incrementalPlaceAmount).toBe(-100000) // $1,000 decrease
    })

    it('should calculate zero delta for unchanged pools', () => {
      const current: PoolAmounts = {
        winPoolAmount: 1000000,
        placePoolAmount: 600000,
        totalPoolAmount: 1600000,
      }

      const previous: PreviousBucketData = {
        winPoolAmount: 1000000,
        placePoolAmount: 600000,
      }

      const result = calculateIncrementalDelta(current, previous)

      expect(result.incrementalWinAmount).toBe(0)
      expect(result.incrementalPlaceAmount).toBe(0)
    })

    it('should use current amounts as baseline for first poll (no previous data)', () => {
      const current: PoolAmounts = {
        winPoolAmount: 1000000,
        placePoolAmount: 600000,
        totalPoolAmount: 1600000,
      }

      const result = calculateIncrementalDelta(current, null)

      expect(result.incrementalWinAmount).toBe(1000000)
      expect(result.incrementalPlaceAmount).toBe(600000)
    })
  })

  describe('getTimelineInterval (AC5)', () => {
    it('should return correct pre-race intervals', () => {
      expect(getTimelineInterval(65)).toBe(60) // >60 min → 60m bucket
      expect(getTimelineInterval(57)).toBe(55) // 55-60 min → 55m bucket
      expect(getTimelineInterval(12)).toBe(10) // 10-15 min → 10m bucket
      expect(getTimelineInterval(3.5)).toBe(3) // 3-4 min → 3m bucket
      expect(getTimelineInterval(0.5)).toBe(0) // 0-1 min → 0m bucket (race start)
    })

    it('should return correct post-race intervals', () => {
      expect(getTimelineInterval(-0.3)).toBe(-0.5) // -18 seconds → -30s bucket
      expect(getTimelineInterval(-0.8)).toBe(-1) // -48 seconds → -1m bucket
      expect(getTimelineInterval(-2.2)).toBe(-2.5) // -2:12 → -2:30 bucket
      expect(getTimelineInterval(-4.7)).toBe(-5) // -4:42 → -5m bucket
    })

    it('should return 1-minute intervals for long delays after start', () => {
      expect(getTimelineInterval(-5.5)).toBe(-5) // -5:30 → ceil(-5.5) = -5
      expect(getTimelineInterval(-6.1)).toBe(-6) // -6:06 → ceil(-6.1) = -6
      expect(getTimelineInterval(-7.2)).toBe(-7) // -7:12 → ceil(-7.2) = -7
      expect(getTimelineInterval(-10)).toBe(-10) // -10:00 → ceil(-10) = -10
    })

    it('should handle edge case: exactly at race start', () => {
      expect(getTimelineInterval(0)).toBe(0)
    })

    it('should handle 5-minute intervals for races far in future', () => {
      expect(getTimelineInterval(32)).toBe(30)
      expect(getTimelineInterval(48)).toBe(45)
      expect(getTimelineInterval(100)).toBe(60) // Caps at 60
    })
  })

  describe('calculateTimeMetadata (AC5)', () => {
    it('should calculate correct metadata for race 15 minutes before start', () => {
      const raceStart = new Date('2025-10-11T15:00:00Z')
      const current = new Date('2025-10-11T14:45:00Z')

      const result = calculateTimeMetadata(raceStart, current)

      expect(result.time_to_start).toBe(15)
      expect(result.time_interval).toBe(15)
      expect(result.interval_type).toBe('2m')
    })

    it('should calculate correct metadata for race 3 minutes before start', () => {
      const raceStart = new Date('2025-10-11T15:00:00Z')
      const current = new Date('2025-10-11T14:57:00Z')

      const result = calculateTimeMetadata(raceStart, current)

      expect(result.time_to_start).toBe(3)
      expect(result.time_interval).toBe(3)
      expect(result.interval_type).toBe('30s')
    })

    it('should calculate correct metadata for race 45 minutes before start', () => {
      const raceStart = new Date('2025-10-11T15:00:00Z')
      const current = new Date('2025-10-11T14:15:00Z')

      const result = calculateTimeMetadata(raceStart, current)

      expect(result.time_to_start).toBe(45)
      expect(result.time_interval).toBe(45)
      expect(result.interval_type).toBe('5m')
    })

    it('should calculate correct metadata for race in progress', () => {
      const raceStart = new Date('2025-10-11T15:00:00Z')
      const current = new Date('2025-10-11T15:02:00Z')

      const result = calculateTimeMetadata(raceStart, current)

      expect(result.time_to_start).toBe(-2)
      expect(result.time_interval).toBe(-2)
      expect(result.interval_type).toBe('live')
    })

    it('should accept ISO string datetime inputs', () => {
      const raceStart = '2025-10-11T15:00:00Z'
      const current = '2025-10-11T14:50:00Z'

      const result = calculateTimeMetadata(raceStart, current)

      expect(result.time_to_start).toBe(10)
      expect(result.time_interval).toBe(10)
      expect(result.interval_type).toBe('2m')
    })

    it('should handle mixed Date and string inputs', () => {
      const raceStart = new Date('2025-10-11T15:00:00Z')
      const current = '2025-10-11T14:40:00Z'

      const result = calculateTimeMetadata(raceStart, current)

      expect(result.time_to_start).toBe(20)
      expect(result.time_interval).toBe(20)
      expect(result.interval_type).toBe('2m')
    })
  })

  describe('Pure function determinism (AC10)', () => {
    it('calculatePoolAmounts should return same output for same inputs', () => {
      const poolData: PoolData = {
        winPoolTotal: 50000,
        placePoolTotal: 30000,
        totalRacePool: 80000,
      }

      const result1 = calculatePoolAmounts(15.5, poolData)
      const result2 = calculatePoolAmounts(15.5, poolData)
      const result3 = calculatePoolAmounts(15.5, poolData)

      expect(result1).toEqual(result2)
      expect(result2).toEqual(result3)
    })

    it('calculateTimeMetadata should be deterministic with fixed timestamps', () => {
      const raceStart = '2025-10-11T15:00:00Z'
      const current = '2025-10-11T14:45:00Z'

      const result1 = calculateTimeMetadata(raceStart, current)
      const result2 = calculateTimeMetadata(raceStart, current)

      expect(result1).toEqual(result2)
    })

    it('getTimelineInterval should be pure (no side effects)', () => {
      const input = 12.5

      const result1 = getTimelineInterval(input)
      const result2 = getTimelineInterval(input)

      expect(result1).toBe(result2)
      expect(result1).toBe(10) // Should always map to 10m bucket
    })
  })
})
