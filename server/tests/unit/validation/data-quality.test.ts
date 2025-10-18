/**
 * Data Quality Validation Tests
 * Story 2.10C - Task 4 (AC4)
 */

import { describe, it, expect } from 'vitest'
import { validateTransformedRaceData, getDataQualityScore } from '../../../src/validation/data-quality.js'
import type { TransformedRace, TransformedEntrant, MoneyFlowRecord } from '../../../src/workers/messages.js'
import type { RacePoolData } from '../../../src/utils/race-pools.js'

/* eslint-disable @typescript-eslint/naming-convention */

const createMockRacePools = (): RacePoolData => ({
  race_id: 'race-1',
  win_pool_total: 5000000, // $50,000 in cents
  place_pool_total: 3000000, // $30,000 in cents
  quinella_pool_total: 1000000,
  trifecta_pool_total: 500000,
  exacta_pool_total: 800000,
  first4_pool_total: 300000,
  total_race_pool: 10600000,
  currency: '$',
  data_quality_score: 100,
  extracted_pools: 6,
})

const createMockEntrant = (
  id: string,
  winPoolPct: number,
  placePoolPct: number
): TransformedEntrant => ({
  entrant_id: id,
  race_id: 'race-1',
  name: `Entrant ${id}`,
  runner_number: Number.parseInt(id),
  barrier: Number.parseInt(id),
  is_scratched: false,
  is_late_scratched: null,
  fixed_win_odds: 5.0,
  fixed_place_odds: 2.0,
  pool_win_odds: 4.5,
  pool_place_odds: 1.8,
  hold_percentage: 15.0,
  bet_percentage: 14.5,
  win_pool_percentage: winPoolPct,
  place_pool_percentage: placePoolPct,
  win_pool_amount: 750000,
  place_pool_amount: 450000,
  jockey: 'Test Jockey',
  trainer_name: 'Test Trainer',
  silk_colours: 'red',
  favourite: false,
  mover: null,
})

const createMockMoneyFlowRecord = (entrantId: string): MoneyFlowRecord => ({
  entrant_id: entrantId,
  race_id: 'race-1',
  time_to_start: 5,
  time_interval: 5,
  interval_type: '2m',
  polling_timestamp: new Date().toISOString(),
  hold_percentage: 15.0,
  bet_percentage: 14.5,
  win_pool_percentage: 15.0,
  place_pool_percentage: 15.0,
  win_pool_amount: 750000,
  place_pool_amount: 450000,
  total_pool_amount: 1200000,
  incremental_win_amount: 50000,
  incremental_place_amount: 30000,
  fixed_win_odds: 5.0,
  fixed_place_odds: 2.0,
  pool_win_odds: 4.5,
  pool_place_odds: 1.8,
})

const createMockTransformedRace = (
  entrants: TransformedEntrant[],
  racePools: RacePoolData | null = createMockRacePools(),
  moneyFlowRecords: MoneyFlowRecord[] = []
): TransformedRace => ({
  raceId: 'race-1',
  raceName: 'Test Race',
  status: 'open',
  transformedAt: new Date().toISOString(),
  metrics: {
    entrantCount: entrants.length,
    poolFieldCount: 6,
    moneyFlowRecordCount: moneyFlowRecords.length,
  },
  meeting: {
    meeting_id: 'meeting-1',
    name: 'Test Meeting',
    date: '2025-10-18',
    country: 'NZ',
    category: 'thoroughbred',
    track_condition: 'good',
    tote_status: 'open',
  },
  race: {
    race_id: 'race-1',
    name: 'Test Race',
    status: 'open',
    race_number: 1,
    race_date_nz: '2025-10-18',
    start_time_nz: '15:00:00 NZDT',
    meeting_id: 'meeting-1',
  },
  entrants,
  moneyFlowRecords,
  racePools: racePools !== null ? [racePools] : null,
  originalPayload: {} as never, // Not used in validation
})

describe('Data Quality Validation', () => {
  describe('validateTransformedRaceData', () => {
    it('should return high quality score for valid data with correct percentages', () => {
      // Create 8 entrants with percentages summing to ~100%
      const entrants = [
        createMockEntrant('1', 20.0, 20.0),
        createMockEntrant('2', 15.0, 15.0),
        createMockEntrant('3', 15.0, 15.0),
        createMockEntrant('4', 12.5, 12.5),
        createMockEntrant('5', 12.5, 12.5),
        createMockEntrant('6', 10.0, 10.0),
        createMockEntrant('7', 10.0, 10.0),
        createMockEntrant('8', 5.0, 5.0),
      ]

      const moneyFlowRecords = entrants.map((e) => createMockMoneyFlowRecord(e.entrant_id))
      const race = createMockTransformedRace(entrants, createMockRacePools(), moneyFlowRecords)

      const result = validateTransformedRaceData(race)

      expect(result.is_valid).toBe(true)
      expect(result.quality_score).toBeGreaterThanOrEqual(95)
      expect(result.errors).toHaveLength(0)
      expect(result.metrics.passed_checks).toBeGreaterThan(0)
    })

    it('should detect invalid percentages that do not sum to 100%', () => {
      const entrants = [
        createMockEntrant('1', 50.0, 50.0), // Only 50% each - should trigger warning
        createMockEntrant('2', 25.0, 25.0),
      ]

      const race = createMockTransformedRace(entrants)

      const result = validateTransformedRaceData(race)

      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings.some((w) => w.includes('percentages sum'))).toBe(true)
    })

    it('should detect missing race pools data', () => {
      const entrants = [
        createMockEntrant('1', 50.0, 50.0),
        createMockEntrant('2', 50.0, 50.0),
      ]

      const race = createMockTransformedRace(entrants, null) // No race pools

      const result = validateTransformedRaceData(race)

      expect(result.warnings.some((w) => w.includes('No race pool data'))).toBe(true)
      expect(result.quality_score).toBeLessThan(100)
    })

    it('should detect entrant count below minimum threshold', () => {
      const entrants = [createMockEntrant('1', 100.0, 100.0)] // Only 1 entrant

      const race = createMockTransformedRace(entrants)

      const result = validateTransformedRaceData(race)

      expect(result.warnings.some((w) => w.includes('Entrant count'))).toBe(true)
      expect(result.quality_score).toBeLessThan(100)
    })

    it('should detect incremental amounts exceeding total pool amounts', () => {
      const entrants = [
        createMockEntrant('1', 50.0, 50.0),
        createMockEntrant('2', 50.0, 50.0),
      ]

      // Create money flow record with invalid incremental amount
      const moneyFlowRecords: MoneyFlowRecord[] = [
        {
          ...createMockMoneyFlowRecord('1'),
          win_pool_amount: 100000,
          incremental_win_amount: 150000, // Exceeds total - invalid!
        },
      ]

      const race = createMockTransformedRace(entrants, createMockRacePools(), moneyFlowRecords)

      const result = validateTransformedRaceData(race)

      expect(result.warnings.some((w) => w.includes('Incremental win amount'))).toBe(true)
    })

    it('should detect interval_type inconsistency with time_to_start', () => {
      const entrants = [
        createMockEntrant('1', 50.0, 50.0),
        createMockEntrant('2', 50.0, 50.0),
      ]

      // Create money flow record with invalid interval_type
      const moneyFlowRecords: MoneyFlowRecord[] = [
        {
          ...createMockMoneyFlowRecord('1'),
          interval_type: 'live', // Should be negative time_to_start
          time_to_start: 5, // Positive - inconsistent!
        },
      ]

      const race = createMockTransformedRace(entrants, createMockRacePools(), moneyFlowRecords)

      const result = validateTransformedRaceData(race)

      expect(result.warnings.some((w) => w.includes("interval_type is 'live'"))).toBe(true)
    })

    it('should return low quality score when multiple checks fail', () => {
      const entrants = [createMockEntrant('1', 30.0, 30.0)] // Only 1 entrant, wrong percentages

      const race = createMockTransformedRace(entrants, null, []) // No pools, no money flow

      const result = validateTransformedRaceData(race)

      expect(result.quality_score).toBeLessThan(80)
      expect(result.is_valid).toBe(false)
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('should validate place pool ratio against win pool', () => {
      const poolsWithBadRatio: RacePoolData = {
        ...createMockRacePools(),
        win_pool_total: 1000000, // $10,000
        place_pool_total: 4000000, // $40,000 - 4x win pool (exceeds 3x threshold)
      }

      const entrants = [
        createMockEntrant('1', 33.0, 33.0),
        createMockEntrant('2', 33.0, 33.0),
        createMockEntrant('3', 34.0, 34.0),
      ]

      const race = createMockTransformedRace(entrants, poolsWithBadRatio)

      const result = validateTransformedRaceData(race)

      expect(result.warnings.some((w) => w.includes('unusually large'))).toBe(true)
    })
  })

  describe('getDataQualityScore', () => {
    it('should return quality score directly', () => {
      const entrants = [
        createMockEntrant('1', 50.0, 50.0),
        createMockEntrant('2', 50.0, 50.0),
      ]

      const race = createMockTransformedRace(entrants)

      const score = getDataQualityScore(race)

      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(100)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty entrants array', () => {
      const race = createMockTransformedRace([])

      const result = validateTransformedRaceData(race)

      expect(result.quality_score).toBeLessThan(100)
      expect(result.is_valid).toBe(false)
    })

    it('should handle entrants with null pool percentages', () => {
      const entrant: TransformedEntrant = {
        ...createMockEntrant('1', 0, 0),
        win_pool_percentage: null,
        place_pool_percentage: null,
      }

      const race = createMockTransformedRace([entrant])

      const result = validateTransformedRaceData(race)

      // Should not crash, but will have warnings
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('should handle missing meeting data', () => {
      const entrants = [
        createMockEntrant('1', 50.0, 50.0),
        createMockEntrant('2', 50.0, 50.0),
      ]

      const race = createMockTransformedRace(entrants)
      race.meeting = null

      const result = validateTransformedRaceData(race)

      expect(result.quality_score).toBeLessThan(100)
    })
  })
})

/* eslint-enable @typescript-eslint/naming-convention */
