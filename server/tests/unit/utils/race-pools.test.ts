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

      const result = extractPoolTotals(raceData, 'race-1')

      expect(result).toEqual({
        raceId: 'race-1',
        winPoolTotal: 10000000, // Converted to cents
        placePoolTotal: 5000000, // Converted to cents
        quinellaPoolTotal: 0,
        trifectaPoolTotal: 0,
        exactaPoolTotal: 2500000, // Converted to cents
        first4PoolTotal: 1500000, // Converted to cents
        totalRacePool: 19000000, // Converted to cents
        currency: '$',
        dataQualityScore: 100,
        extractedPools: 4,
      })
    })

    it('handles missing tote_pools', () => {
      const raceData = buildRaceData({
        tote_pools: undefined,
      })

      const result = extractPoolTotals(raceData, 'race-1')

      expect(result).toBeNull()
    })

    it('handles empty tote_pools array', () => {
      const raceData = buildRaceData({
        tote_pools: [],
      })

      const result = extractPoolTotals(raceData, 'race-1')

      expect(result?.raceId).toBe('race-1')
      expect(result?.winPoolTotal).toBe(0)
      expect(result?.placePoolTotal).toBe(0)
      expect(result?.extractedPools).toBe(0)
      expect(result?.dataQualityScore).toBe(70) // Reduced score for missing win/place
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

      const result = extractPoolTotals(raceData, 'race-1')

      expect(result?.winPoolTotal).toBe(10000000) // Converted to cents
      expect(result?.placePoolTotal).toBe(5000000) // Converted to cents
      expect(result?.exactaPoolTotal).toBe(0)
      expect(result?.first4PoolTotal).toBe(0)
      expect(result?.totalRacePool).toBe(15000000) // Converted to cents
      expect(result?.extractedPools).toBe(2)
      expect(result?.dataQualityScore).toBe(100)
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

      const result = extractPoolTotals(raceData, 'race-1')

      expect(result?.winPoolTotal).toBe(10000000) // Converted to cents
      expect(result?.placePoolTotal).toBe(0)
      expect(result?.exactaPoolTotal).toBe(0)
      expect(result?.first4PoolTotal).toBe(0)
      expect(result?.extractedPools).toBe(4)
      expect(result?.dataQualityScore).toBe(70) // Reduced for missing win/place
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

      const result = extractPoolTotals(raceData, 'race-1')

      expect(result?.winPoolTotal).toBe(10000000)
      expect(result?.placePoolTotal).toBe(5000000)
      expect(result?.first4PoolTotal).toBe(2500000) // Takes last matching value
      expect(result?.extractedPools).toBe(5)
      expect(result?.dataQualityScore).toBe(100)
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

      const result = extractPoolTotals(raceData, 'race-1')

      expect(result?.winPoolTotal).toBe(10000000)
      expect(result?.extractedPools).toBe(2) // Still counts unknown pools
      expect(result?.dataQualityScore).toBe(65) // 100 - 30 (missing place) - 5 (unknown type)
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

      const result = extractPoolTotals(raceData, 'race-1')

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

      const result = extractPoolTotals(raceData, 'race-1')

      expect(result?.winPoolTotal).toBe(0)
      expect(result?.placePoolTotal).toBe(0)
      expect(result?.exactaPoolTotal).toBe(2500000)
      expect(result?.dataQualityScore).toBe(70) // 100 - 30 (missing win/place)
    })
  })
})