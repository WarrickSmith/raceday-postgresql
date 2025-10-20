/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-condition, prefer-destructuring */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import format from 'pg-format'
import { pool } from '../../src/database/pool.js'
import { clearOddsSnapshot } from '../../src/utils/odds-change-detection.js'
import type { RaceData } from '../../src/clients/nztab-types.js'
import type { TransformedRace } from '../../src/workers/messages.js'

// Mock the NZ TAB client and worker pool
const fetchRaceDataMock = vi.fn<(raceId: string) => Promise<RaceData>>()
const workerExecMock = vi.fn<(data: RaceData) => Promise<TransformedRace>>()

vi.mock('../../src/clients/nztab.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/clients/nztab.js')>('../../src/clients/nztab.js')
  return {
    ...actual,
    fetchRaceData: fetchRaceDataMock,
  }
})

vi.mock('../../src/workers/worker-pool.js', () => ({
  workerPool: {
    exec: workerExecMock,
  },
}))

const {
  processRace,
} = await import('../../src/pipeline/race-processor.js')

const TEST_PREFIX = 'story-2-10-e2e'

const ensureBaseTablesAndPartitions = async (): Promise<void> => {
  // Ensure race_pools table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS race_pools (
      id BIGSERIAL PRIMARY KEY,
      race_id TEXT NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
      win_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      place_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      exacta_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      first4_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT '$',
      data_quality_score INTEGER DEFAULT 100,
      extracted_pools INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  // Create unique index to prevent duplicates
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_race_pools_race_id_unique
    ON race_pools(race_id)
  `)

  // Create time-series partitions for testing
  const testDate = '2025-10-14'
  const previousDay = '2025-10-13' // For odds timestamps that fall into previous UTC day

  // Create money_flow_history partition
  const moneyFlowPartition = `money_flow_history_${testDate.replace(/-/g, '_')}`
  await pool.query(
    format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF money_flow_history FOR VALUES FROM (%L) TO (%L)',
      moneyFlowPartition,
      testDate,
      '2025-10-15'
    )
  )

  // Create odds_history partitions
  const oddsPartition1 = `odds_history_${previousDay.replace(/-/g, '_')}`
  await pool.query(
    format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF odds_history FOR VALUES FROM (%L) TO (%L)',
      oddsPartition1,
      previousDay,
      testDate
    )
  )

  const oddsPartition2 = `odds_history_${testDate.replace(/-/g, '_')}`
  await pool.query(
    format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF odds_history FOR VALUES FROM (%L) TO (%L)',
      oddsPartition2,
      testDate,
      '2025-10-15'
    )
  )
}

const cleanupTestData = async (raceIds: string[]): Promise<void> => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Delete from time-series partitions
    const partitions = ['money_flow_history_2025_10_14', 'odds_history_2025_10_13', 'odds_history_2025_10_14']

    for (const partition of partitions) {
      try {
        await client.query(
          format('DELETE FROM %I WHERE race_id = ANY($1::text[])', partition),
          [raceIds]
        )
      } catch {
        // Ignore if partition doesn't exist
      }
    }

    // Delete from race_pools
    await client.query('DELETE FROM race_pools WHERE race_id = ANY($1::text[])', [raceIds])

    // Delete from main tables
    await client.query('DELETE FROM entrants WHERE race_id = ANY($1::text[])', [raceIds])
    await client.query('DELETE FROM races WHERE race_id = ANY($1::text[])', [raceIds])

    const meetingIds = raceIds.flatMap(raceId => [raceId, `meeting-${raceId}`])
    await client.query('DELETE FROM meetings WHERE meeting_id = ANY($1::text[])', [meetingIds])

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

describe.skip('Story 2.10 End-to-End Integration Tests', () => {
  const raceId = `${TEST_PREFIX}-race-1`
  const testDate = '2025-10-14'

  beforeAll(async () => {
    await ensureBaseTablesAndPartitions()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    clearOddsSnapshot()
    await cleanupTestData([raceId])
  })

  afterEach(async () => {
    await cleanupTestData([raceId])
  })

  afterAll(async () => {
    await cleanupTestData([raceId])
  })

  const buildComprehensiveRaceData = (): RaceData => ({
    id: raceId,
    name: 'Story 2.10 Test Race',
    status: 'open',
    race_date_nz: testDate,
    start_time_nz: '15:30:00 NZDT',
    meeting_id: `meeting-${raceId}`,
    // Enhanced race metadata
    distance: 1200,
    track_condition: 'GOOD',
    track_surface: 'Turf',
    weather: 'Fine',
    type: 'Group 1',
    total_prize_money: 1000000,
    actual_start: `${testDate}T15:30:00.000+13:00`,
    tote_start_time: `${testDate}T10:00:00.000+13:00`,
    positions_paid: 3,
    silk_url: 'https://example.com/silks',
    silk_base_url: 'https://example.com/silks/base',
    video_channels: '["channel1", "channel2"]',

    // Comprehensive entrants with new fields
    entrants: [
      {
        entrantId: `${raceId}-entrant-1`,
        runnerNumber: 1,
        name: 'Fast Horse',
        barrier: 5,
        isScratched: false,
        isLateScratched: null,
        fixedWinOdds: 2.5,
        fixedPlaceOdds: 1.5,
        poolWinOdds: 2.6,
        poolPlaceOdds: 1.6,
        jockey: 'Jockey One',
        trainerName: 'Trainer One',
        silkColours: 'Red and White',
        favourite: true,
        mover: 'STEADY',
        scratchTime: null,
        runnerChange: null,
        silkUrl64x64: 'https://example.com/silks/64x64/1.png',
        silkUrl128x128: 'https://example.com/silks/128x128/1.png',
      },
      {
        entrantId: `${raceId}-entrant-2`,
        runnerNumber: 2,
        name: 'Slow Horse',
        barrier: 8,
        isScratched: false,
        isLateScratched: null,
        fixedWinOdds: 8.0,
        fixedPlaceOdds: 3.2,
        poolWinOdds: 7.5,
        poolPlaceOdds: 3.0,
        jockey: 'Jockey Two',
        trainerName: 'Trainer Two',
        silkColours: 'Blue and Yellow',
        favourite: false,
        mover: 'OUT',
        scratchTime: null,
        runnerChange: null,
        silkUrl64x64: 'https://example.com/silks/64x64/2.png',
        silkUrl128x128: 'https://example.com/silks/128x128/2.png',
      },
    ],

    // Enhanced money tracker data
    money_tracker: {
      entrants: [
        {
          entrant_id: `${raceId}-entrant-1`,
          hold_percentage: 0.45,
          bet_percentage: 0.35,
        },
        {
          entrant_id: `${raceId}-entrant-2`,
          hold_percentage: 0.15,
          bet_percentage: 0.20,
        },
      ],
    },

    // Comprehensive pool data
    pools: {
      winPool: 250000,
      place: 150000,
      totalPool: 400000,
    },

    // Enhanced tote pools for race pools extraction
    tote_pools: {
      win: {
        total: 250000,
        currency: 'NZD',
      },
      place: {
        total: 150000,
        currency: 'NZD',
      },
      exacta: {
        total: 75000,
        currency: 'NZD',
      },
      first4: {
        total: 25000,
        currency: 'NZD',
      },
    },

    // Meeting data with new fields
    meeting: {
      meeting: `meeting-${raceId}`,
      name: 'Story 2.10 Test Meeting',
      date: testDate,
      country: 'NZ',
      category: 'thoroughbred',
      category_name: 'Thoroughbred Horse Racing',
      state: 'active',
      track_condition: 'GOOD',
      tote_status: 'open',
    },
  } as any)

  const buildComprehensiveTransformedRace = (): TransformedRace => {
    const raceData = buildComprehensiveRaceData()

    return {
      raceId: raceData.id,
      raceName: raceData.name,
      status: raceData.status,
      transformedAt: `${testDate}T00:00:00.000Z`,
      metrics: {
        entrantCount: raceData.entrants?.length || 0,
        poolFieldCount: Object.values(raceData.pools || {}).filter(v => v != null).length,
        moneyFlowRecordCount: raceData.entrants?.length || 0,
      },

      meeting: {
        meeting_id: raceData.meeting?.meeting ?? raceData.meeting_id ?? '',
        name: raceData.meeting?.name ?? 'Test Meeting',
        date: raceData.meeting?.date ?? testDate,
        country: raceData.meeting?.country ?? 'NZ',
        category: raceData.meeting?.category ?? 'thoroughbred',
        track_condition: raceData.meeting?.track_condition ?? 'GOOD',
        tote_status: raceData.meeting?.tote_status ?? 'open',
      },

      race: {
        race_id: raceData.id,
        name: raceData.name,
        status: raceData.status,
        race_number: 1,
        race_date_nz: raceData.race_date_nz,
        start_time_nz: raceData.start_time_nz,
        meeting_id: raceData.meeting_id,
      },

      entrants: raceData.entrants?.map(entrant => {
        // Parse barrier to number (can be string like "Fr1" or number)
        let barrier: number | null = null
        if (typeof entrant.barrier === 'number') {
          barrier = entrant.barrier
        } else if (typeof entrant.barrier === 'string') {
          const pattern = /\d+/
          const match = pattern.exec(entrant.barrier)
          barrier = match !== null ? parseInt(match[0], 10) : null
        }

        return {
          entrant_id: entrant.entrantId,
          race_id: raceData.id,
          runner_number: entrant.runnerNumber,
          name: entrant.name,
          barrier,
        is_scratched: entrant.isScratched || false,
        is_late_scratched: entrant.isLateScratched,
        fixed_win_odds: entrant.fixedWinOdds,
        fixed_place_odds: entrant.fixedPlaceOdds,
        pool_win_odds: entrant.poolWinOdds,
        pool_place_odds: entrant.poolPlaceOdds,
        hold_percentage: raceData.money_tracker?.entrants?.find(mt => mt.entrant_id === entrant.entrantId)?.hold_percentage || null,
        bet_percentage: raceData.money_tracker?.entrants?.find(mt => mt.entrant_id === entrant.entrantId)?.bet_percentage || null,
        win_pool_percentage: null, // Will be calculated
        place_pool_percentage: null, // Will be calculated
        win_pool_amount: null, // Will be calculated
        place_pool_amount: null, // Will be calculated
        jockey: entrant.jockey,
        trainer_name: entrant.trainerName,
        silk_colours: entrant.silkColours,
        favourite: entrant.favourite,
        mover: entrant.mover,
      }
      }) || [],

      moneyFlowRecords: raceData.entrants?.map(entrant => {
        const moneyTracker = raceData.money_tracker?.entrants?.find(mt => mt.entrant_id === entrant.entrantId)
        if (!moneyTracker || !moneyTracker.hold_percentage) return null

        return {
          entrant_id: entrant.entrantId,
          race_id: raceData.id,
          time_to_start: 10,
          time_interval: 5,
          interval_type: '5m',
          polling_timestamp: `${testDate}T15:20:00.000Z`,
          hold_percentage: moneyTracker.hold_percentage,
          bet_percentage: moneyTracker.bet_percentage || 0,
          win_pool_percentage: 0.5,
          place_pool_percentage: 0.3,
          win_pool_amount: 150000,
          place_pool_amount: 90000,
          total_pool_amount: 240000,
          incremental_win_amount: 5000,
          incremental_place_amount: 3000,
          fixed_win_odds: entrant.fixedWinOdds,
          fixed_place_odds: entrant.fixedPlaceOdds,
          pool_win_odds: entrant.poolWinOdds,
          pool_place_odds: entrant.poolPlaceOdds,
        }
      }).filter(Boolean) as any[],

      // Race pools data should be extracted
      racePools: [{
        race_id: raceData.id,
        win_pool_total: 25000000, // From tote_pools extraction (250000 * 100 = cents)
        place_pool_total: 15000000, // 150000 * 100
        quinella_pool_total: 0,
        trifecta_pool_total: 0,
        exacta_pool_total: 7500000, // 75000 * 100
        first4_pool_total: 2500000, // 25000 * 100
        total_race_pool: 50000000, // Total sum in cents
        currency: '$',
        data_quality_score: 100,
        extracted_pools: 4,
      }],

      originalPayload: raceData,
    }
  }

  it('processes complete race data with all Story 2.10 enhancements', async () => {
    fetchRaceDataMock.mockResolvedValue(buildComprehensiveRaceData())
    workerExecMock.mockResolvedValue(buildComprehensiveTransformedRace())

    const result = await processRace(raceId)

    // Validate successful processing
    expect(result.status).toBe('success')
    expect(result.success).toBe(true)
    expect(result.timings.total_ms).toBeLessThan(3000) // Should be fast

    // Validate row counts include race pools
    expect(result.rowCounts).toMatchObject({
      meetings: 1,
      races: 1,
      entrants: 2,
      moneyFlowHistory: 2, // Only entrants with hold_percentage
      oddsHistory: 4, // 2 entrants * 2 odds types each
      racePools: 1, // NEW: Race pools record
    })

    // Validate enhanced entrants data with new fields
    const entrantsResult = await pool.query(`
      SELECT entrant_id, name, favourite, mover, barrier, jockey, trainer_name, silk_colours
      FROM entrants WHERE race_id = $1 ORDER BY runner_number
    `, [raceId])

    expect(entrantsResult.rows).toHaveLength(2)

    const entrant1 = entrantsResult.rows[0]
    expect(entrant1.entrant_id).toBe(`${raceId}-entrant-1`)
    expect(entrant1.name).toBe('Fast Horse')
    expect(entrant1.favourite).toBe(true)
    expect(entrant1.mover).toBe('STEADY')
    expect(entrant1.barrier).toBe(5)
    expect(entrant1.jockey).toBe('Jockey One')
    expect(entrant1.trainer_name).toBe('Trainer One')
    expect(entrant1.silk_colours).toBe('Red and White')

    const entrant2 = entrantsResult.rows[1]
    expect(entrant2.entrant_id).toBe(`${raceId}-entrant-2`)
    expect(entrant2.name).toBe('Slow Horse')
    expect(entrant2.favourite).toBe(false)
    expect(entrant2.mover).toBe('OUT')

    // Validate race pools data was extracted and stored
    const racePoolsResult = await pool.query(`
      SELECT race_id, win_pool_total, place_pool_total, exacta_pool_total,
             first4_pool_total, currency, extracted_pools, data_quality_score
      FROM race_pools WHERE race_id = $1
    `, [raceId])

    expect(racePoolsResult.rows).toHaveLength(1)
    const racePools = racePoolsResult.rows[0]
    expect(racePools.race_id).toBe(raceId)
    expect(racePools.win_pool_total).toBe('250000.00')
    expect(racePools.place_pool_total).toBe('150000.00')
    expect(racePools.exacta_pool_total).toBe('75000.00')
    expect(racePools.first4_pool_total).toBe('25000.00')
    expect(racePools.currency).toBe('NZD')
    expect(racePools.extracted_pools).toBe(4)
    expect(racePools.data_quality_score).toBe(100)

    // Validate odds change detection is working (should have odds records)
    const oddsResult = await pool.query(`
      SELECT DISTINCT entrant_id, type, odds
      FROM odds_history
      WHERE entrant_id LIKE $1
      ORDER BY entrant_id, type
    `, [`${raceId}-entrant-%`])

    expect(oddsResult.rows).toHaveLength(4) // 2 entrants * 2 odds types

    // Check odds change detection filtered appropriately
    const oddsTypes = [...new Set(oddsResult.rows.map(r => r.type))]
    expect(oddsTypes).toEqual(['fixed_win', 'pool_win'])

    // Validate meeting data with new fields
    const meetingResult = await pool.query(`
      SELECT meeting_id, name, country, category, track_condition, tote_status
      FROM meetings WHERE meeting_id = $1
    `, [`meeting-${raceId}`])

    expect(meetingResult.rows).toHaveLength(1)
    const meeting = meetingResult.rows[0]
    expect(meeting.meeting_id).toBe(`meeting-${raceId}`)
    expect(meeting.name).toBe('Story 2.10 Test Meeting')
    expect(meeting.country).toBe('NZ')
    expect(meeting.category).toBe('thoroughbred')
    expect(meeting.track_condition).toBe('GOOD')
    expect(meeting.tote_status).toBe('open')

    // Validate timing metrics include race pools processing
    // TODO: Add breakdown timing support to ProcessTimings interface
    // expect(result.timings).toHaveProperty('breakdown')
    // expect(result.timings.breakdown).toHaveProperty('race_pools_ms')
    // expect(typeof result.timings.breakdown.race_pools_ms).toBe('number')
    // expect(result.timings.breakdown.race_pools_ms).toBeGreaterThan(0)
  })

  it('handles odds change detection correctly across multiple updates', async () => {
    const raceData = buildComprehensiveRaceData()

    // First processing
    fetchRaceDataMock.mockResolvedValue(raceData)
    workerExecMock.mockResolvedValue(buildComprehensiveTransformedRace())

    const result1 = await processRace(raceId)
    expect(result1.success).toBe(true)

    // Check initial odds records
    const initialOddsResult = await pool.query(`
      SELECT COUNT(*) as count FROM odds_history WHERE entrant_id LIKE $1
    `, [`${raceId}-entrant-%`])
    expect(initialOddsResult.rows[0]?.count).toBe(4)

    // Second processing with unchanged odds (should be filtered out)
    const unchangedRaceData = JSON.parse(JSON.stringify(raceData))
    fetchRaceDataMock.mockResolvedValue(unchangedRaceData)

    const result2 = await processRace(raceId)
    expect(result2.success).toBe(true)

    // Should not have created new odds records due to change detection
    const unchangedOddsResult = await pool.query(`
      SELECT COUNT(*) as count FROM odds_history WHERE entrant_id LIKE $1
    `, [`${raceId}-entrant-%`])
    expect(unchangedOddsResult.rows[0]?.count).toBe(4) // Same count as before

    // Third processing with changed odds (should create new records)
    const changedRaceData = JSON.parse(JSON.stringify(raceData))
    changedRaceData.entrants![0]!.fixedWinOdds = 2.8 // Significant change
    fetchRaceDataMock.mockResolvedValue(changedRaceData)

    const result3 = await processRace(raceId)
    expect(result3.success).toBe(true)

    // Should have created new odds records for the changed odds
    const changedOddsResult = await pool.query(`
      SELECT COUNT(*) as count FROM odds_history WHERE entrant_id LIKE $1
    `, [`${raceId}-entrant-%`])
    expect(changedOddsResult.rows[0]?.count).toBe(5) // One new record
  })

  it('validates all database schema fields are populated', async () => {
    fetchRaceDataMock.mockResolvedValue(buildComprehensiveRaceData())
    workerExecMock.mockResolvedValue(buildComprehensiveTransformedRace())

    await processRace(raceId)

    // Validate entrants table has all new fields populated
    const entrantsSchemaResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'entrants'
        AND column_name IN ('silk_url_64x64', 'silk_url_128x128', 'scratch_time',
                           'runner_change', 'mover', 'favourite')
      ORDER BY column_name
    `)

    expect(entrantsSchemaResult.rows).toHaveLength(6)

    // Validate race_pools table structure
    const racePoolsSchemaResult = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'race_pools'
        AND column_name IN ('exacta_pool_total', 'first4_pool_total', 'currency',
                           'data_quality_score', 'extracted_pools')
      ORDER BY column_name
    `)

    expect(racePoolsSchemaResult.rows).toHaveLength(5)

    // Validate performance indexes exist
    const indexResult = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN ('idx_entrants_silk_urls', 'idx_race_pools_comprehensive')
      ORDER BY indexname
    `)

    expect(indexResult.rows).toHaveLength(2)
  })

  it('meets performance targets for Story 2.10 requirements', async () => {
    fetchRaceDataMock.mockResolvedValue(buildComprehensiveRaceData())
    workerExecMock.mockResolvedValue(buildComprehensiveTransformedRace())

    const startTime = Date.now()
    const result = await processRace(raceId)
    const endTime = Date.now()

    // Performance targets from Story 2.10
    expect(result.success).toBe(true)
    expect(endTime - startTime).toBeLessThan(3000) // Overall < 3s
    expect(result.timings.total_ms).toBeLessThan(3000) // Internal timing < 3s

    // Validate individual stage timings are reasonable
    // TODO: Add breakdown timing support to ProcessTimings interface
    // const breakdown = result.timings.breakdown
    // expect(breakdown.meetings_ms).toBeLessThan(500)
    // expect(breakdown.races_ms).toBeLessThan(500)
    // expect(breakdown.entrants_ms).toBeLessThan(1000)
    // expect(breakdown.money_flow_ms).toBeLessThan(1000)
    // expect(breakdown.odds_ms).toBeLessThan(1000)
    // expect(breakdown.race_pools_ms).toBeLessThan(500) // NEW: Race pools should be fast
  })
})