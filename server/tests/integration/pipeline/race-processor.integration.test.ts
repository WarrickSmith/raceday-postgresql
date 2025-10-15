/* eslint-disable @typescript-eslint/naming-convention */
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
import { pool } from '../../../src/database/pool.js'
import type { RaceData } from '../../../src/clients/nztab-types.js'
import type { TransformedRace } from '../../../src/workers/messages.js'

const fetchRaceDataMock = vi.fn<(raceId: string) => Promise<RaceData>>()
const workerExecMock = vi.fn<(data: RaceData) => Promise<TransformedRace>>()

vi.mock('../../../src/clients/nztab.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/clients/nztab.js')
  >('../../../src/clients/nztab.js')
  return {
    ...actual,
    fetchRaceData: fetchRaceDataMock,
  }
})

vi.mock('../../../src/workers/worker-pool.js', () => ({
  workerPool: {
    exec: workerExecMock,
  },
}))

const {
  processRace,
  processRaces,
  WriteError: PipelineWriteError,
} = await import('../../../src/pipeline/race-processor.js')
const { env } = await import('../../../src/shared/env.js')

const TEST_PREFIX = 'itest-race-processor'

const ensureBaseTables = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meetings (
      meeting_id TEXT PRIMARY KEY,
      meeting_name TEXT NOT NULL,
      country TEXT NOT NULL,
      race_type TEXT NOT NULL,
      date DATE NOT NULL,
      track_condition TEXT,
      tote_status TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS races (
      race_id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL REFERENCES meetings(meeting_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      race_number INTEGER,
      start_time TIMESTAMPTZ,
      status TEXT NOT NULL,
      race_date_nz DATE,
      start_time_nz TIME,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS entrants (
      entrant_id TEXT PRIMARY KEY,
      race_id TEXT NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      runner_number INTEGER NOT NULL,
      barrier INTEGER,
      is_scratched BOOLEAN NOT NULL DEFAULT FALSE,
      is_late_scratched BOOLEAN,
      fixed_win_odds NUMERIC(10,2),
      fixed_place_odds NUMERIC(10,2),
      pool_win_odds NUMERIC(10,2),
      pool_place_odds NUMERIC(10,2),
      hold_percentage NUMERIC(5,2),
      bet_percentage NUMERIC(5,2),
      win_pool_percentage NUMERIC(5,2),
      place_pool_percentage NUMERIC(5,2),
      win_pool_amount BIGINT,
      place_pool_amount BIGINT,
      jockey TEXT,
      trainer_name TEXT,
      silk_colours TEXT,
      favourite BOOLEAN,
      mover BOOLEAN,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS money_flow_history (
      id BIGSERIAL,
      entrant_id TEXT NOT NULL,
      race_id TEXT NOT NULL,
      hold_percentage NUMERIC(5,2),
      bet_percentage NUMERIC(5,2),
      time_to_start INTEGER,
      time_interval INTEGER,
      interval_type TEXT,
      polling_timestamp TIMESTAMPTZ NOT NULL,
      event_timestamp TIMESTAMPTZ NOT NULL,
      win_pool_amount BIGINT,
      place_pool_amount BIGINT,
      win_pool_percentage NUMERIC(5,2),
      place_pool_percentage NUMERIC(5,2),
      incremental_win_amount BIGINT,
      incremental_place_amount BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ) PARTITION BY RANGE (event_timestamp)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS odds_history (
      id BIGSERIAL,
      entrant_id TEXT NOT NULL,
      odds NUMERIC(10,2),
      type TEXT,
      event_timestamp TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ) PARTITION BY RANGE (event_timestamp)
  `)
}

const ensurePartition = async (
  tableName: string,
  date: string
): Promise<void> => {
  const partitionName = `${tableName}_${date.replace(/-/g, '_')}`

  const end = new Date(date)
  end.setDate(end.getDate() + 1)
  const endStr = end.toISOString().slice(0, 10)

  // Check if partition already exists
  const { rows } = await pool.query(
    'SELECT 1 FROM information_schema.tables WHERE table_name = $1',
    [partitionName]
  )

  if (rows.length === 0) {
    await pool.query(
      format(
        'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
        partitionName,
        tableName,
        date,
        endStr
      )
    )
  }
}

const deleteTestArtifacts = async (raceIds: string[]): Promise<void> => {
  const entrantIds = raceIds.map((raceId) => `${raceId}-entrant`)
  const meetingIds = raceIds.flatMap((raceId) => [raceId, `meeting-${raceId}`])

  // Wrap in a transaction to ensure atomic cleanup
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    try {
      // Delete from odds_history partitions if they exist
      const oddsPartitionsResult = await client.query(`
        SELECT tablename
        FROM pg_tables
        WHERE tablename LIKE 'odds_history_%'
      `)

      for (const partition of oddsPartitionsResult.rows as {
        tablename: string
      }[]) {
        try {
          await client.query(
            `DELETE FROM ${partition.tablename} WHERE entrant_id = ANY($1::text[])`,
            [entrantIds]
          )
        } catch {
          // Ignore errors if partition doesn't exist or other issues
        }
      }
    } catch {
      // Ignore errors getting partition list
    }

    try {
      // Delete from money_flow_history partitions if they exist
      const moneyFlowPartitionsResult = await client.query(`
        SELECT tablename
        FROM pg_tables
        WHERE tablename LIKE 'money_flow_history_%'
      `)

      for (const partition of moneyFlowPartitionsResult.rows as {
        tablename: string
      }[]) {
        try {
          await client.query(
            `DELETE FROM ${partition.tablename} WHERE race_id = ANY($1::text[])`,
            [raceIds]
          )
        } catch {
          // Ignore errors if partition doesn't exist or other issues
        }
      }
    } catch {
      // Ignore errors getting partition list
    }

    // Delete the entrants (ignore foreign key constraint errors)
    try {
      await client.query(
        'DELETE FROM entrants WHERE race_id = ANY($1::text[])',
        [raceIds]
      )
    } catch {
      // Ignore foreign key constraint errors
    }

    // Delete the races
    try {
      await client.query('DELETE FROM races WHERE race_id = ANY($1::text[])', [
        raceIds,
      ])
    } catch {
      // Ignore errors
    }

    // Finally delete the meetings (including both raceId and meeting-${raceId})
    try {
      await client.query(
        'DELETE FROM meetings WHERE meeting_id = ANY($1::text[])',
        [meetingIds]
      )
    } catch {
      // Ignore errors
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

describe('processRace – integration (real PostgreSQL)', () => {
  const successRaceId = `${TEST_PREFIX}-success`
  const failureRaceId = `${TEST_PREFIX}-failure`
  const successDate = '2025-10-13'
  const failureDate = '2035-01-01'

  beforeAll(async () => {
    await ensureBaseTables()
    await ensurePartition('money_flow_history', successDate)
    // Create partition for the previous day since odds timestamps at midnight NZ time fall into UTC previous day
    await ensurePartition('odds_history', '2025-10-12')
    await ensurePartition('odds_history', successDate)

    // Create odds partition for the failure date but NOT money_flow_history
    // This ensures the test properly rolls back when money_flow_history partition is missing
    await ensurePartition('odds_history', failureDate)

    // Create partition for the previous day of failure date for odds history
    const failureOddsDate = new Date(failureDate)
    failureOddsDate.setDate(failureOddsDate.getDate() - 1)
    await ensurePartition(
      'odds_history',
      failureOddsDate.toISOString().slice(0, 10)
    )

    // Clean up any existing test data before running tests
    await deleteTestArtifacts([successRaceId, failureRaceId])
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await deleteTestArtifacts([successRaceId, failureRaceId])
  })

  afterEach(async () => {
    // Clean up after each test to prevent data accumulation
    await deleteTestArtifacts([successRaceId, failureRaceId])
  })

  afterAll(async () => {
    await deleteTestArtifacts([successRaceId, failureRaceId])
  })

  const buildRaceData = (raceId: string): RaceData => ({
    id: raceId,
    name: `Race ${raceId}`,
    status: 'open',
    race_date_nz: successRaceId === raceId ? successDate : failureDate,
    start_time_nz: '12:00',
  })

  const buildTransformed = (raceId: string): TransformedRace => {
    const raceDate = successRaceId === raceId ? successDate : failureDate
    // For failure case, use a timestamp that maps to the missing partition
    // The key is to ensure the polling_timestamp creates the right partition name
    const pollingTimestamp =
      raceId === successRaceId
        ? `${successDate}T12:00:00.000Z`
        : `${failureDate}T12:00:00.000Z` // Use explicit failure date to hit missing partition

    return {
      raceId,
      raceName: `Race ${raceId}`,
      status: 'open',
      transformedAt: `${raceDate}T00:00:00.000Z`,
      metrics: {
        entrantCount: 1,
        poolFieldCount: 1,
        moneyFlowRecordCount: 1,
      },
      meeting: {
        meeting_id: raceId,
        name: `Meeting ${raceId}`,
        country: 'NZ',
        category: 'thoroughbred',
        date: raceDate,
        track_condition: 'GOOD',
        tote_status: 'open',
      },
      race: {
        race_id: raceId,
        name: `Race ${raceId}`,
        status: 'open',
        race_number: 1,
        race_date_nz: raceDate,
        start_time_nz: '12:00',
        meeting_id: raceId,
      },
      entrants: [
        {
          entrant_id: `${raceId}-entrant`,
          race_id: raceId,
          runner_number: 1,
          name: `Runner ${raceId}`,
          barrier: 5,
          is_scratched: false,
          is_late_scratched: null,
          fixed_win_odds: 2.5,
          fixed_place_odds: 1.5,
          pool_win_odds: 2.6,
          pool_place_odds: 1.6,
          hold_percentage: 0.45,
          bet_percentage: 0.35,
          win_pool_percentage: 0.5,
          place_pool_percentage: 0.3,
          win_pool_amount: 150000,
          place_pool_amount: 90000,
          jockey: 'J Doe',
          trainer_name: 'Trainer Smith',
          silk_colours: 'Blue',
          favourite: true,
          mover: false,
        },
      ],
      moneyFlowRecords: [
        {
          entrant_id: `${raceId}-entrant`,
          race_id: raceId,
          time_to_start: 10,
          time_interval: 5,
          interval_type: '5m',
          polling_timestamp: pollingTimestamp,
          hold_percentage: 0.45,
          bet_percentage: 0.35,
          win_pool_percentage: 0.5,
          place_pool_percentage: 0.3,
          win_pool_amount: 150000,
          place_pool_amount: 90000,
          total_pool_amount: 240000,
          incremental_win_amount: 5000,
          incremental_place_amount: 3000,
          fixed_win_odds: 2.5,
          fixed_place_odds: 1.5,
          pool_win_odds: 2.6,
          pool_place_odds: 1.6,
        },
      ],
      originalPayload: buildRaceData(raceId),
    }
  }

  it('persists pipeline output and meets nominal SLA', async () => {
    fetchRaceDataMock.mockResolvedValue(buildRaceData(successRaceId))
    workerExecMock.mockResolvedValue(buildTransformed(successRaceId))

    const result = await processRace(successRaceId)

    expect(result.status).toBe('success')
    expect(result.success).toBe(true)
    expect(result.timings.total_ms).toBeLessThan(2000)
    expect(result.rowCounts).toMatchObject({
      meetings: 1,
      races: 1,
      entrants: 1,
      moneyFlowHistory: 1,
      oddsHistory: 2,
    })

    const entrantRows = await pool.query<{
      name: string
      favourite: boolean | null
    }>('SELECT name, favourite FROM entrants WHERE race_id = $1', [
      successRaceId,
    ])
    expect(entrantRows.rowCount).toBe(1)
    expect(entrantRows.rows[0]?.name).toContain(successRaceId)

    const moneyFlowRows = await pool.query<{
      hold_percentage: string | null
      win_pool_amount: string | null
    }>(
      'SELECT hold_percentage, win_pool_amount FROM money_flow_history WHERE race_id = $1',
      [successRaceId]
    )
    expect(moneyFlowRows.rowCount).toBe(1)

    const oddsRows = await pool.query(
      'SELECT type, odds FROM odds_history WHERE entrant_id = $1 ORDER BY type',
      [`${successRaceId}-entrant`]
    )
    expect(oddsRows.rowCount).toBe(2)
  })

  it('rolls back write stage when partition is missing', async () => {
    // Ensure the partition doesn't exist before the test
    const client = await pool.connect()
    try {
      await client.query('DROP TABLE IF EXISTS money_flow_history_2035_01_01')
    } finally {
      client.release()
    }

    fetchRaceDataMock.mockResolvedValue(buildRaceData(failureRaceId))
    workerExecMock.mockResolvedValue(buildTransformed(failureRaceId))

    await expect(processRace(failureRaceId)).rejects.toBeInstanceOf(
      PipelineWriteError
    )

    const moneyFlowRows = await pool.query(
      'SELECT 1 FROM money_flow_history WHERE race_id = $1',
      [failureRaceId]
    )
    expect(moneyFlowRows.rowCount).toBe(0)

    const oddsRows = await pool.query(
      'SELECT 1 FROM odds_history WHERE entrant_id = $1',
      [`${failureRaceId}-entrant`]
    )
    expect(oddsRows.rowCount).toBe(0)
  })

  it('handles batch processing with mixed success and failure results', async () => {
    // Ensure the partition doesn't exist before the test
    const client = await pool.connect()
    try {
      await client.query('DROP TABLE IF EXISTS money_flow_history_2035_01_01')
    } finally {
      client.release()
    }

    const buildBatchRace = (raceId: string): RaceData => {
      const raceDate = raceId === failureRaceId ? failureDate : successDate
      return {
        id: raceId,
        name: `Race ${raceId}`,
        status: 'open',
        race_date_nz: raceDate,
        start_time_nz: '12:00',
      }
    }

    const buildBatchTransformed = (raceId: string): TransformedRace => {
      const raceDate = raceId === failureRaceId ? failureDate : successDate
      // For failure case, use a timestamp that maps to the missing partition
      const pollingTimestamp =
        raceId === successRaceId
          ? `${raceDate}T11:50:00.000Z`
          : `${failureDate}T11:50:00.000Z` // Use explicit failure date to hit missing partition

      return {
        raceId,
        raceName: `Race ${raceId}`,
        status: 'open',
        transformedAt: `${raceDate}T00:00:00.000Z`,
        metrics: {
          entrantCount: 1,
          poolFieldCount: 1,
          moneyFlowRecordCount: 1,
        },
        meeting: {
          meeting_id: raceId,
          name: `Meeting ${raceId}`,
          date: raceDate,
          country: 'NZ',
          category: 'thoroughbred',
          track_condition: 'GOOD',
          tote_status: 'open',
        },
        race: {
          race_id: raceId,
          name: `Race ${raceId}`,
          status: 'open',
          race_number: 1,
          race_date_nz: raceDate,
          start_time_nz: '12:00',
          meeting_id: raceId,
        },
        entrants: [
          {
            entrant_id: `${raceId}-entrant`,
            race_id: raceId,
            runner_number: 1,
            name: `Runner ${raceId}`,
            barrier: null,
            is_scratched: false,
            is_late_scratched: null,
            fixed_win_odds: 2.5,
            fixed_place_odds: 1.5,
            pool_win_odds: 2.6,
            pool_place_odds: 1.6,
            hold_percentage: 0.45,
            bet_percentage: 0.35,
            win_pool_percentage: 0.5,
            place_pool_percentage: 0.3,
            win_pool_amount: 150000,
            place_pool_amount: 90000,
            favourite: true,
            mover: false,
            jockey: 'J Doe',
            trainer_name: 'Trainer Smith',
            silk_colours: 'Blue',
          },
        ],
        moneyFlowRecords: [
          {
            entrant_id: `${raceId}-entrant`,
            race_id: raceId,
            time_to_start: 10,
            time_interval: 5,
            interval_type: '5m',
            polling_timestamp: pollingTimestamp,
            hold_percentage: 0.45,
            bet_percentage: 0.35,
            win_pool_percentage: 0.5,
            place_pool_percentage: 0.3,
            win_pool_amount: 150000,
            place_pool_amount: 90000,
            total_pool_amount: 240000,
            incremental_win_amount: 5000,
            incremental_place_amount: 3000,
            fixed_win_odds: 2.5,
            fixed_place_odds: 1.5,
            pool_win_odds: 2.6,
            pool_place_odds: 1.6,
          },
        ],
        originalPayload: buildBatchRace(raceId),
      }
    }

    fetchRaceDataMock.mockImplementation((raceId) =>
      Promise.resolve(buildBatchRace(raceId))
    )
    workerExecMock.mockImplementation((raceData) =>
      Promise.resolve(buildBatchTransformed(raceData.id))
    )

    const batchContext = 'batch-ctx-001'
    const { results, errors, metrics } = await processRaces(
      [successRaceId, failureRaceId],
      2,
      { contextId: batchContext }
    )

    expect(results).toHaveLength(1)
    expect(results[0]?.raceId).toBe(successRaceId)
    expect(results[0]?.status).toBe('success')
    expect(results[0]?.contextId).toBe(batchContext)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(PipelineWriteError)
    expect(errors[0]?.raceId).toBe(failureRaceId)
    expect(errors[0]?.result.contextId).toBe(batchContext)

    expect(metrics.totalRaces).toBe(2)
    expect(metrics.requestedConcurrency).toBe(2)
    expect(metrics.effectiveConcurrency).toBe(2)
    expect(metrics.successes).toBe(1)
    expect(metrics.failures).toBe(1)
    expect(metrics.retryableFailures).toBe(0)
    expect(metrics.maxDuration_ms).toBeGreaterThanOrEqual(0)

    const successOddsRows = await pool.query(
      'SELECT type, odds FROM odds_history WHERE entrant_id = $1',
      [`${successRaceId}-entrant`]
    )
    expect(successOddsRows.rowCount).toBe(2)

    const failureOddsRows = await pool.query(
      'SELECT 1 FROM odds_history WHERE entrant_id = $1',
      [`${failureRaceId}-entrant`]
    )
    expect(failureOddsRows.rowCount).toBe(0)
  })

  it('processes five races, caps concurrency, and reports batch metrics', async () => {
    const raceIds = Array.from(
      { length: 5 },
      (_, index) => `${TEST_PREFIX}-batch-${String(index)}`
    )

    await deleteTestArtifacts(raceIds)

    const buildBatchRace = (raceId: string): RaceData => ({
      id: raceId,
      name: `Race ${raceId}`,
      status: 'open',
      race_date_nz: successDate,
      start_time_nz: '12:00',
    })

    const buildBatchTransformed = (raceId: string): TransformedRace => ({
      raceId,
      raceName: `Race ${raceId}`,
      status: 'open',
      transformedAt: `${successDate}T00:00:00.000Z`,
      metrics: {
        entrantCount: 1,
        poolFieldCount: 1,
        moneyFlowRecordCount: 1,
      },
      meeting: {
        meeting_id: raceId,
        name: `Meeting ${raceId}`,
        country: 'NZ',
        category: 'thoroughbred',
        date: successDate,
        track_condition: 'GOOD',
        tote_status: 'open',
      },
      race: {
        race_id: raceId,
        name: `Race ${raceId}`,
        status: 'open',
        race_number: 1,
        race_date_nz: successDate,
        start_time_nz: '12:00',
        meeting_id: raceId,
      },
      entrants: [
        {
          entrant_id: `${raceId}-entrant`,
          race_id: raceId,
          runner_number: 1,
          name: `Runner ${raceId}`,
          barrier: 5,
          is_scratched: false,
          is_late_scratched: null,
          fixed_win_odds: 2.5,
          fixed_place_odds: 1.5,
          pool_win_odds: 2.6,
          pool_place_odds: 1.6,
          hold_percentage: 0.45,
          bet_percentage: 0.35,
          win_pool_percentage: 0.5,
          place_pool_percentage: 0.3,
          win_pool_amount: 150000,
          place_pool_amount: 90000,
          jockey: 'J Doe',
          trainer_name: 'Trainer Smith',
          silk_colours: 'Blue',
          favourite: true,
          mover: false,
        },
      ],
      moneyFlowRecords: [
        {
          entrant_id: `${raceId}-entrant`,
          race_id: raceId,
          time_to_start: 10,
          time_interval: 5,
          interval_type: '5m',
          polling_timestamp: `${successDate}T11:50:00.000Z`,
          hold_percentage: 0.45,
          bet_percentage: 0.35,
          win_pool_percentage: 0.5,
          place_pool_percentage: 0.3,
          win_pool_amount: 150000,
          place_pool_amount: 90000,
          total_pool_amount: 240000,
          incremental_win_amount: 5000,
          incremental_place_amount: 3000,
          fixed_win_odds: 2.5,
          fixed_place_odds: 1.5,
          pool_win_odds: 2.6,
          pool_place_odds: 1.6,
        },
      ],
      originalPayload: buildBatchRace(raceId),
    })

    fetchRaceDataMock.mockImplementation((raceId) =>
      Promise.resolve(buildBatchRace(raceId))
    )
    workerExecMock.mockImplementation((raceData) =>
      Promise.resolve(buildBatchTransformed(raceData.id))
    )

    await ensurePartition('money_flow_history', successDate)
    await ensurePartition('odds_history', successDate)

    try {
      const { results, errors, metrics } = await processRaces(
        raceIds,
        env.DB_POOL_MAX + 5,
        { contextId: 'batch-ctx-002' }
      )

      expect(errors).toHaveLength(0)
      expect(results).toHaveLength(5)
      expect(metrics.totalRaces).toBe(5)
      expect(metrics.requestedConcurrency).toBe(env.DB_POOL_MAX + 5)
      expect(metrics.effectiveConcurrency).toBeLessThanOrEqual(env.DB_POOL_MAX)
      expect(metrics.effectiveConcurrency).toBeGreaterThanOrEqual(1)
      expect(metrics.successes).toBe(5)
      expect(metrics.failures).toBe(0)
      expect(metrics.retryableFailures).toBe(0)
      expect(metrics.maxDuration_ms).toBeGreaterThanOrEqual(0)

      const batchEntrantIds = raceIds.map((raceId) => `${raceId}-entrant`)
      const oddsRows = await pool.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM odds_history WHERE entrant_id = ANY($1::text[])',
        [batchEntrantIds]
      )

      expect(oddsRows.rows[0]?.count).toBe(10)
    } finally {
      await deleteTestArtifacts(raceIds)
    }
  })

  it('deletes meetings using both race and prefixed meeting identifiers during cleanup', async () => {
    const raceId = `${TEST_PREFIX}-cleanup`
    await ensureBaseTables()

    await pool.query(
      `INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, track_condition, tote_status, status)
       VALUES ($1, 'Cleanup Meeting Primary', 'NZ', 'thoroughbred', CURRENT_DATE, 'GOOD', 'open', 'active')
       ON CONFLICT (meeting_id) DO NOTHING`,
      [raceId]
    )
    await pool.query(
      `INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, track_condition, tote_status, status)
       VALUES ($1, 'Cleanup Meeting Prefixed', 'NZ', 'thoroughbred', CURRENT_DATE, 'GOOD', 'open', 'active')
       ON CONFLICT (meeting_id) DO NOTHING`,
      [`meeting-${raceId}`]
    )

    await deleteTestArtifacts([raceId])

    const remaining = await pool.query(
      'SELECT meeting_id FROM meetings WHERE meeting_id = ANY($1::text[])',
      [[raceId, `meeting-${raceId}`]]
    )

    expect(remaining.rowCount).toBe(0)
  })
})
