/* eslint-disable @typescript-eslint/naming-convention */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import format from 'pg-format'
import { pool } from '../../../src/database/pool.js'
import type { RaceData } from '../../../src/clients/nztab-types.js'
import type { TransformedRace } from '../../../src/workers/messages.js'

const fetchRaceDataMock = vi.fn<(raceId: string) => Promise<RaceData>>()
const workerExecMock = vi.fn<(data: RaceData) => Promise<TransformedRace>>()

vi.mock('../../../src/clients/nztab.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/clients/nztab.js')>(
    '../../../src/clients/nztab.js'
  )
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

const { processRace, WriteError: PipelineWriteError } = await import('../../../src/pipeline/race-processor.js')

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
      meeting_id TEXT,
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
      race_id TEXT NOT NULL,
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

const ensurePartition = async (tableName: string, date: string): Promise<void> => {
  const partitionName = `${tableName}_${date.replace(/-/g, '_')}`

  const end = new Date(date)
  end.setDate(end.getDate() + 1)
  const endStr = end.toISOString().slice(0, 10)

  await pool.query(
    format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
      partitionName,
      tableName,
      date,
      endStr
    )
  )
}

const deleteTestArtifacts = async (raceIds: string[]): Promise<void> => {
  await pool.query('DELETE FROM money_flow_history WHERE race_id = ANY($1::text[])', [raceIds])
  await pool.query('DELETE FROM odds_history WHERE entrant_id = ANY($1::text[])', [raceIds])
  await pool.query('DELETE FROM entrants WHERE race_id = ANY($1::text[])', [raceIds])
  await pool.query('DELETE FROM races WHERE race_id = ANY($1::text[])', [raceIds])
  await pool.query('DELETE FROM meetings WHERE meeting_id = ANY($1::text[])', [raceIds])
}

describe('processRace – integration (real PostgreSQL)', () => {
  const successRaceId = `${TEST_PREFIX}-success`
  const failureRaceId = `${TEST_PREFIX}-failure`
  const successDate = '2025-10-13'
  const failureDate = '2035-01-01'

  beforeAll(async () => {
    await ensureBaseTables()
    await ensurePartition('money_flow_history', successDate)
    await ensurePartition('odds_history', successDate)
  })

  beforeEach(async () => {
    vi.clearAllMocks()
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
    const pollingTimestamp =
      raceDate === successDate ? `${raceDate}T12:00:00.000Z` : `${raceDate}T08:00:00.000Z`

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
          entrant_id: raceId,
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
        entrant_id: raceId,
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

    const entrantRows = await pool.query<{ name: string; favourite: boolean | null }>(
      'SELECT name, favourite FROM entrants WHERE race_id = $1',
      [successRaceId]
    )
    expect(entrantRows.rowCount).toBe(1)
    expect(entrantRows.rows[0]?.name).toContain(successRaceId)

    const moneyFlowRows = await pool.query<{ hold_percentage: string | null; win_pool_amount: string | null }>(
      'SELECT hold_percentage, win_pool_amount FROM money_flow_history WHERE race_id = $1',
      [successRaceId]
    )
    expect(moneyFlowRows.rowCount).toBe(1)

    const oddsRows = await pool.query(
      'SELECT type, odds FROM odds_history WHERE entrant_id = $1 ORDER BY type',
      [successRaceId]
    )
    expect(oddsRows.rowCount).toBe(2)
  })

  it('rolls back write stage when partition is missing', async () => {
    fetchRaceDataMock.mockResolvedValue(buildRaceData(failureRaceId))
    workerExecMock.mockResolvedValue(buildTransformed(failureRaceId))

    await expect(processRace(failureRaceId)).rejects.toBeInstanceOf(PipelineWriteError)

    const moneyFlowRows = await pool.query(
      'SELECT 1 FROM money_flow_history WHERE race_id = $1',
      [failureRaceId]
    )
    expect(moneyFlowRows.rowCount).toBe(0)

    const oddsRows = await pool.query(
      'SELECT 1 FROM odds_history WHERE entrant_id = $1',
      [failureRaceId]
    )
    expect(oddsRows.rowCount).toBe(0)
  })
})
