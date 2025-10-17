/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest'
import { extractPoolTotals } from '../../../src/utils/race-pools.js'
import type { RaceData } from '../../../src/clients/nztab-types.js'

describe('Race Pools Extraction', () => {
  const buildRaceData = (overrides: Partial<RaceData> = {}): RaceData => ({
    id: 'race-1',
    name: 'Test Race',
    status: 'open',
    race_date_nz: '2025-10-14',
    start_time_nz: '12:00',
    meeting_id: 'meeting-1',
    entrants: [],
    ...overrides,
  })

  describe('extractPoolTotals', () => {
    it('extracts pool totals from NZTAB tote_pools structure', () => {
      const raceData = buildRaceData({
        tote_pools: [
          {
            product_type: 'WIN',
            total: 100000,
          },
          {
            product_type: 'PLACE',
            total: 50000,
          },
          {
            product_type: 'EXACTA',
            total: 25000,
          },
          {
            product_type: 'FIRST 4',
            total: 15000,
          },
        ],
      })

      const result = extractPoolTotals(raceData as { tote_pools?: unknown }, 'race-1')

      expect(result).toEqual({
        race_id: 'race-1',
        win_pool_total: 10000000, // Converted to cents
        place_pool_total: 5000000, // Converted to cents
        quinella_pool_total: 0,
        trifecta_pool_total: 0,
        exacta_pool_total: 2500000, // Converted to cents
        first4_pool_total: 1500000, // Converted to cents
        total_race_pool: 19000000, // Converted to cents
        currency: '$',
        data_quality_score: 100,
        extracted_pools: 4,
      })
    })

    it('handles missing tote_pools', () => {
      const raceData = buildRaceData({
        tote_pools: undefined,
      })

      const result = extractPoolTotals(raceData as { tote_pools?: unknown }, 'race-1')

      expect(result).toBeNull()
    })

    it('handles empty tote_pools array', () => {
      const raceData = buildRaceData({
        tote_pools: [],
      })

      const result = extractPoolTotals(raceData as { tote_pools?: unknown }, 'race-1')

      expect(result?.race_id).toBe('race-1')
      expect(result?.win_pool_total).toBe(0)
      expect(result?.place_pool_total).toBe(0)
      expect(result?.extracted_pools).toBe(0)
      expect(result?.data_quality_score).toBe(70) // Reduced score for missing win/place
    })

    it('handles partial pool data', () => {
      const raceData = buildRaceData({
        tote_pools: [
          {
            product_type: 'WIN',
            total: 100000,
          },
          {
            product_type: 'PLACE',
            total: 50000,
          },
          // Missing exacta and first4
        ],
      })

      const result = extractPoolTotals(raceData as { tote_pools?: unknown }, 'race-1')

      expect(result?.win_pool_total).toBe(10000000) // Converted to cents
      expect(result?.place_pool_total).toBe(5000000) // Converted to cents
      expect(result?.exacta_pool_total).toBe(0)
      expect(result?.first4_pool_total).toBe(0)
      expect(result?.total_race_pool).toBe(15000000) // Converted to cents
      expect(result?.extracted_pools).toBe(2)
      expect(result?.data_quality_score).toBe(100)
    })

    it('handles pools with missing total values', () => {
      const raceData = buildRaceData({
        tote_pools: [
          {
            product_type: 'WIN',
            total: 100000,
          },
          {
            product_type: 'PLACE',
            // Missing total defaults to 0
          },
          {
            product_type: 'EXACTA',
            total: 0,
          },
          {
            product_type: 'FIRST 4',
            total: null,
          },
        ],
      })

      const result = extractPoolTotals(raceData as { tote_pools?: unknown }, 'race-1')

      expect(result?.win_pool_total).toBe(10000000) // Converted to cents
      expect(result?.place_pool_total).toBe(0)
      expect(result?.exacta_pool_total).toBe(0)
      expect(result?.first4_pool_total).toBe(0)
      expect(result?.extracted_pools).toBe(4)
      expect(result?.data_quality_score).toBe(70) // Reduced for missing win/place
    })

    it('handles different product_type variations', () => {
      const raceData = buildRaceData({
        tote_pools: [
          {
            product_type: 'win', // lowercase
            total: 100000,
          },
          {
            product_type: 'Place', // mixed case
            total: 50000,
          },
          {
            product_type: 'first4', // no space
            total: 15000,
          },
          {
            product_type: 'first four', // with space
            total: 20000,
          },
          {
            product_type: 'firstfour', // all together
            total: 25000,
          },
        ],
      })

      const result = extractPoolTotals(raceData as { tote_pools?: unknown }, 'race-1')

      expect(result?.win_pool_total).toBe(10000000)
      expect(result?.place_pool_total).toBe(5000000)
      expect(result?.first4_pool_total).toBe(2500000) // Takes last matching value
      expect(result?.extracted_pools).toBe(5)
      expect(result?.data_quality_score).toBe(100)
    })

    it('handles unknown pool types gracefully', () => {
      const raceData = buildRaceData({
        tote_pools: [
          {
            product_type: 'WIN',
            total: 100000,
          },
          {
            product_type: 'UNKNOWN_POOL',
            total: 50000,
          },
        ],
      })

      const result = extractPoolTotals(raceData as { tote_pools?: unknown }, 'race-1')

      expect(result?.win_pool_total).toBe(10000000)
      expect(result?.extracted_pools).toBe(2) // Still counts unknown pools
      expect(result?.data_quality_score).toBe(65) // 100 - 30 (missing place) - 5 (unknown type)
    })

    it('uses default currency', () => {
      const raceData = buildRaceData({
        tote_pools: [
          {
            product_type: 'WIN',
            total: 100000,
          },
        ],
      })

      const result = extractPoolTotals(raceData as { tote_pools?: unknown }, 'race-1')

      expect(result?.currency).toBe('$')
    })

    it('validates minimum expected pools', () => {
      const raceData = buildRaceData({
        tote_pools: [
          {
            product_type: 'EXACTA',
            total: 25000,
          },
          // Missing WIN and PLACE pools
        ],
      })

      const result = extractPoolTotals(raceData as { tote_pools?: unknown }, 'race-1')

      expect(result?.win_pool_total).toBe(0)
      expect(result?.place_pool_total).toBe(0)
      expect(result?.exacta_pool_total).toBe(2500000)
      expect(result?.data_quality_score).toBe(70) // 100 - 30 (missing win/place)
    })
  })
})