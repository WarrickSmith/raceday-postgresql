import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { transformedRaceSchema } from '../../../src/workers/messages.js'
import type { RaceData } from '../../../src/clients/nztab-types.js'

/**
 * Integration tests for transform worker with money flow calculations (AC6, AC9, AC11)
 *
 * These tests validate end-to-end worker behavior:
 * - Receive RaceData message via WorkerPool
 * - Execute production transform logic with money flow calculations
 * - Return valid TransformedRace within performance budget
 */

const sampleRaceWithPools = (): RaceData => {
  /* eslint-disable @typescript-eslint/naming-convention */
  const race: RaceData = {
    id: 'race-transform-001',
    name: 'Auckland Stakes',
    status: 'open',
    race_date_nz: '2025-10-10',
    start_time_nz: '15:30',
    race_number: 7,
    meeting_id: 'MTG-AKL-20251010',
    entrants: [
      {
        entrantId: 'ENT-001',
        name: 'Fast Runner',
        runnerNumber: 1,
        barrier: 2,
        fixedWinOdds: 3.5,
        fixedPlaceOdds: 1.8,
        poolWinOdds: 3.2,
        poolPlaceOdds: 1.6,
        isScratched: false,
        jockey: 'J. Smith',
        trainerName: 'T. Jones',
        favourite: true,
      },
      {
        entrantId: 'ENT-002',
        name: 'Slow Walker',
        runnerNumber: 2,
        barrier: 5,
        fixedWinOdds: 8.0,
        fixedPlaceOdds: 2.5,
        isScratched: false,
        jockey: 'M. Brown',
        trainerName: 'R. Smith',
        favourite: false,
      },
    ],
    pools: {
      totalPool: 80000, // $80,000
      winPool: 50000, // $50,000
      placePool: 30000, // $30,000
      holdPercentage: null,
      betPercentage: null,
    },
    meeting: {
      meeting: 'NZ-AKL-20251010',
      name: 'Auckland Thoroughbred',
      date: '2025-10-10T00:00:00Z',
      country: 'NZ',
      category: 'R',
      category_name: 'Thoroughbred',
      state: 'Auckland',
      track_condition: 'Good3',
      tote_status: 'open',
      meeting_date: null,
      meeting_type: null,
      tote_meeting_number: 1,
      tote_raceday_date: '2025-10-10',
    },
  }
  /* eslint-enable @typescript-eslint/naming-convention */
  return race
}

describe('Transform Worker Integration (AC6, AC9, AC11)', () => {
  beforeAll(() => {
    vi.unmock('node:worker_threads')
  })

  it('should transform race data with correct structure (AC6)', async () => {
    vi.resetModules()
    const {
      WorkerPool: workerPoolClass,
      workerPool,
    } = await import('../../../src/workers/worker-pool.js')

    await workerPool.shutdown()

    const pool = new workerPoolClass({ size: 1 })
    const result = await pool.exec(sampleRaceWithPools())

    // Validate against schema
    const parsed = transformedRaceSchema.parse(result)

    // Check normalized meeting data (AC6)
    expect(parsed.meeting).toBeDefined()
    expect(parsed.meeting?.meeting_id).toBe('NZ-AKL-20251010')
    expect(parsed.meeting?.name).toBe('Auckland Thoroughbred')
    expect(parsed.meeting?.country).toBe('NZ')
    expect(parsed.meeting?.category).toBe('R')

    // Check normalized race data (AC6)
    expect(parsed.race).toBeDefined()
    expect(parsed.race?.race_id).toBe('race-transform-001')
    expect(parsed.race?.name).toBe('Auckland Stakes')
    expect(parsed.race?.status).toBe('open')
    expect(parsed.race?.race_date_nz).toBe('2025-10-10')
    expect(parsed.race?.start_time_nz).toBe('15:30')

    // Check transformed entrants (AC6)
    expect(parsed.entrants).toBeDefined()
    expect(parsed.entrants.length).toBe(2)

    const [firstEntrant] = parsed.entrants
    expect(firstEntrant?.entrant_id).toBe('ENT-001')
    expect(firstEntrant?.race_id).toBe('race-transform-001')
    expect(firstEntrant?.name).toBe('Fast Runner')
    expect(firstEntrant?.runner_number).toBe(1)
    expect(firstEntrant?.fixed_win_odds).toBe(3.5)

    // Check metrics (AC6)
    expect(parsed.metrics.entrantCount).toBe(2)
    expect(parsed.metrics.poolFieldCount).toBeGreaterThanOrEqual(1)
    expect(parsed.metrics.moneyFlowRecordCount).toBeGreaterThanOrEqual(0)

    await pool.shutdown()
  })

  it('should complete transform within performance budget (AC11)', async () => {
    vi.resetModules()
    const {
      WorkerPool: workerPoolClass,
      workerPool,
    } = await import('../../../src/workers/worker-pool.js')

    await workerPool.shutdown()

    const pool = new workerPoolClass({ size: 1 })

    const startTime = performance.now()
    await pool.exec(sampleRaceWithPools())
    const duration = performance.now() - startTime

    // Transform should complete in <1s per AC11
    expect(duration).toBeLessThan(1000)

    await pool.shutdown()
  })

  it('should handle race with minimal data gracefully', async () => {
    vi.resetModules()
    const {
      WorkerPool: workerPoolClass,
      workerPool,
    } = await import('../../../src/workers/worker-pool.js')

    await workerPool.shutdown()

    /* eslint-disable @typescript-eslint/naming-convention */
    const minimalRace: RaceData = {
      id: 'race-minimal',
      name: 'Minimal Race',
      status: 'closed',
      race_date_nz: '2025-10-10',
      start_time_nz: '16:00',
    }
    /* eslint-enable @typescript-eslint/naming-convention */

    const pool = new workerPoolClass({ size: 1 })
    const result = await pool.exec(minimalRace)

    const parsed = transformedRaceSchema.parse(result)
    expect(parsed.raceId).toBe('race-minimal')
    expect(parsed.entrants).toHaveLength(0)
    expect(parsed.moneyFlowRecords).toHaveLength(0)

    await pool.shutdown()
  })

  it('should handle error cases with proper error messages', async () => {
    vi.resetModules()
    const {
      WorkerPool: workerPoolClass,
      workerPool,
    } = await import('../../../src/workers/worker-pool.js')

    await workerPool.shutdown()

    const invalidRace = {
      id: 'race-invalid',
      // Missing required fields
    }

    const pool = new workerPoolClass({ size: 1 })

    await expect(pool.exec(invalidRace as RaceData)).rejects.toThrow()

    await pool.shutdown()
  })

  it('should generate money flow records when money_tracker data present', async () => {
    vi.resetModules()
    const {
      WorkerPool: workerPoolClass,
      workerPool,
    } = await import('../../../src/workers/worker-pool.js')

    await workerPool.shutdown()

    /* eslint-disable @typescript-eslint/naming-convention */
    const raceWithMoneyTracker: RaceData = {
      id: 'race-money-flow-001',
      name: 'Money Flow Test Race',
      status: 'open',
      race_date_nz: '2025-10-11',
      start_time_nz: '15:30',
      race_number: 3,
      entrants: [
        {
          entrantId: 'ent-001',
          name: 'Runner One',
          runnerNumber: 1,
          barrier: 1,
          fixedWinOdds: 3.5,
          isScratched: false,
        },
        {
          entrantId: 'ent-002',
          name: 'Runner Two',
          runnerNumber: 2,
          barrier: 2,
          fixedWinOdds: 4.0,
          isScratched: false,
        },
      ],
      pools: {
        totalPool: 100000,
        winPool: 60000,
        placePool: 40000,
        holdPercentage: null,
        betPercentage: null,
      },
      money_tracker: {
        entrants: [
          {
            entrant_id: 'ent-001',
            hold_percentage: 15,
            bet_percentage: 12,
          },
          {
            entrant_id: 'ent-002',
            hold_percentage: 10,
            bet_percentage: 8,
          },
        ],
      },
    }
    /* eslint-enable @typescript-eslint/naming-convention */

    const pool = new workerPoolClass({ size: 1 })
    const result = await pool.exec(raceWithMoneyTracker)

    const parsed = transformedRaceSchema.parse(result)

    // Validate money flow records were generated
    expect(parsed.moneyFlowRecords).toBeDefined()
    expect(parsed.moneyFlowRecords.length).toBe(2)

    // Validate Runner One money flow calculations
    const runnerOneRecord = parsed.moneyFlowRecords.find(
      (r) => r.entrant_id === 'ent-001'
    )
    expect(runnerOneRecord).toBeDefined()
    expect(runnerOneRecord?.hold_percentage).toBe(15)
    expect(runnerOneRecord?.bet_percentage).toBe(12)
    // 15% of 60000 = 9000 * 100 cents = 900000
    expect(runnerOneRecord?.win_pool_amount).toBe(900000)
    // 15% of 40000 = 6000 * 100 cents = 600000
    expect(runnerOneRecord?.place_pool_amount).toBe(600000)
    expect(runnerOneRecord?.win_pool_percentage).toBeCloseTo(15, 2)
    expect(runnerOneRecord?.place_pool_percentage).toBeCloseTo(15, 2)

    // Validate Runner Two money flow calculations
    const runnerTwoRecord = parsed.moneyFlowRecords.find(
      (r) => r.entrant_id === 'ent-002'
    )
    expect(runnerTwoRecord).toBeDefined()
    expect(runnerTwoRecord?.hold_percentage).toBe(10)
    expect(runnerTwoRecord?.bet_percentage).toBe(8)
    // 10% of 60000 = 6000 * 100 cents = 600000
    expect(runnerTwoRecord?.win_pool_amount).toBe(600000)
    // 10% of 40000 = 4000 * 100 cents = 400000
    expect(runnerTwoRecord?.place_pool_amount).toBe(400000)

    await pool.shutdown()
  })

  afterAll(async () => {
    const { workerPool } = await import('../../../src/workers/worker-pool.js')
    await workerPool.shutdown()
  })
})
