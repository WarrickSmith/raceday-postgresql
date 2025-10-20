import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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
import { clearOddsSnapshot } from '../../../src/utils/odds-change-detection.js'
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
  FetchError: fetchErrorClass,
  TransformError: transformErrorClass,
  WriteError: writeErrorClass,
} = await import('../../../src/pipeline/race-processor.js')
const { NzTabError: nzTabErrorClass } = await import(
  '../../../src/clients/nztab.js'
)
const timeSeriesModule = await import('../../../src/database/time-series.js')
const {
  ensurePartition,
  PartitionNotFoundError: partitionNotFoundErrorClass,
  getPartitionTableName,
} = timeSeriesModule
const { resolveOddsEventTimestamp } = await import(
  '../../../src/pipeline/odds-utils.js'
)

const TEST_RACE_ID = 'story-2-10d-race-1'
const TEST_MEETING_ID = 'story-2-10d-meeting-1'

const loadFixture = (relativePath: string): unknown => {
  const filePath = fileURLToPath(new URL(relativePath, import.meta.url))
  const contents = readFileSync(filePath, 'utf-8')
  return JSON.parse(contents) as unknown
}

const baseRaceData = loadFixture(
  '../../fixtures/nztab-api/race-2.10d.json'
) as RaceData
const baseTransformed = loadFixture(
  '../../fixtures/nztab-api/race-2.10d-transformed.json'
) as TransformedRace

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const fixtureEntrantIds = baseTransformed.entrants.map(
  (entrant) => entrant.entrant_id
)
const meetingIds = [baseTransformed.meeting?.meeting_id, TEST_MEETING_ID]
  .filter((value): value is string => value != null && value !== '')
const oddsEventTimestamp = resolveOddsEventTimestamp(baseTransformed)
const [firstMoneyFlowRecord] = baseTransformed.moneyFlowRecords
const oddsPartitionName = getPartitionTableName(
  'odds_history',
  oddsEventTimestamp
)
const moneyFlowPartitionName =
  firstMoneyFlowRecord !== undefined
    ? getPartitionTableName(
        'money_flow_history',
        firstMoneyFlowRecord.polling_timestamp
      )
    : null

const createdPartitions = new Set<string>()

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
      meeting TEXT,
      category_name TEXT,
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
      actual_start TIMESTAMPTZ,
      tote_start_time TIMESTAMPTZ,
      distance INTEGER,
      track_condition TEXT,
      track_surface TEXT,
      weather TEXT,
      type TEXT,
      total_prize_money NUMERIC(12,2),
      entrant_count INTEGER,
      field_size INTEGER,
      positions_paid INTEGER,
      silk_url TEXT,
      silk_base_url TEXT,
      video_channels TEXT,
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
      silk_url_64x64 TEXT,
      silk_url_128x128 TEXT,
      scratch_time INTEGER,
      runner_change TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS race_pools (
      id BIGSERIAL PRIMARY KEY,
      race_id TEXT NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
      win_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      place_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      quinella_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      trifecta_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      exacta_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      first4_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_race_pool NUMERIC(12,2) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT '$',
      data_quality_score INTEGER DEFAULT 100,
      extracted_pools INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (race_id)
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

const ensurePartitionForEvent = async (
  tableName: string,
  partitionName: string,
  startTimestamp: string
): Promise<void> => {
  const start = new Date(startTimestamp)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  await pool.query(format('DROP TABLE IF EXISTS %I', partitionName))
  await pool.query(
    format(
      'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
      partitionName,
      tableName,
      start.toISOString(),
      end.toISOString()
    )
  )

  createdPartitions.add(partitionName)
}

const cleanupPipelineData = async (): Promise<void> => {
  const raceIds = [TEST_RACE_ID]

  await pool.query(
    'DELETE FROM money_flow_history WHERE race_id = ANY($1::text[])',
    [raceIds]
  )
  await pool.query(
    'DELETE FROM odds_history WHERE entrant_id = ANY($1::text[])',
    [fixtureEntrantIds]
  )
  await pool.query(
    'DELETE FROM race_pools WHERE race_id = ANY($1::text[])',
    [raceIds]
  )
  await pool.query(
    'DELETE FROM entrants WHERE race_id = ANY($1::text[])',
    [raceIds]
  )
  await pool.query(
    'DELETE FROM races WHERE race_id = ANY($1::text[])',
    [raceIds]
  )
  if (meetingIds.length > 0) {
    await pool.query(
      'DELETE FROM meetings WHERE meeting_id = ANY($1::text[])',
      [meetingIds]
    )
  }
}

const dropCreatedPartitions = async (): Promise<void> => {
  for (const partitionName of createdPartitions) {
    await pool.query(format('DROP TABLE IF EXISTS %I', partitionName))
  }
  createdPartitions.clear()
}

describe('Story 2.10D – Integration pipeline validation', () => {
  beforeAll(async () => {
    await ensureBaseTables()

    if (moneyFlowPartitionName !== null && firstMoneyFlowRecord !== undefined) {
      await ensurePartition(
        'money_flow_history',
        new Date(firstMoneyFlowRecord.polling_timestamp)
      )
      createdPartitions.add(moneyFlowPartitionName)
    }

    await ensurePartitionForEvent(
      'odds_history',
      oddsPartitionName,
      oddsEventTimestamp
    )

    await cleanupPipelineData()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    clearOddsSnapshot()
    await cleanupPipelineData()
  })

  afterEach(async () => {
    await cleanupPipelineData()
    clearOddsSnapshot()
  })

  afterAll(async () => {
    await cleanupPipelineData()
    await dropCreatedPartitions()
  })

  const queryCount = async (
    sql: string,
    params: unknown[]
  ): Promise<number> => {
    const result = await pool.query<{ count: string }>(sql, params)
    const raw = result.rows[0]?.count
    return raw === undefined ? 0 : Number.parseInt(raw, 10)
  }

  it('persists complete API→database flow with referential integrity and partition routing', async () => {
    const raceData = clone(baseRaceData)
    const transformed = clone(baseTransformed)

    fetchRaceDataMock.mockResolvedValueOnce(raceData)
    workerExecMock.mockResolvedValueOnce(transformed)

    const result = await processRace(TEST_RACE_ID, {
      contextId: 'story-2-10d-test',
    })

    expect(result.success).toBe(true)
    expect(result.rowCounts).toEqual({
      meetings: 1,
      races: 1,
      entrants: 2,
      moneyFlowHistory: 2,
      oddsHistory: 8, // 2 entrants × 4 odds types (fixed_win, fixed_place, pool_win, pool_place)
      racePools: 1,
    })
    expect(result.timings.total_ms).toBeLessThan(2000)

    const meetingRows = await pool.query<{
      meetingId: string
      meetingName: string
      country: string
      raceType: string
    }>(
      `
        SELECT
          meeting_id AS "meetingId",
          meeting_name AS "meetingName",
          country,
          race_type AS "raceType"
        FROM meetings
        WHERE meeting_id = $1
      `,
      [TEST_MEETING_ID]
    )
    expect(meetingRows.rowCount).toBe(1)
    expect(meetingRows.rows[0]?.meetingName).toBe('Story 2.10D Fixture Meeting')

    const raceRows = await pool.query<{
      raceId: string
      meetingId: string
      status: string
    }>(
      `
        SELECT
          race_id AS "raceId",
          meeting_id AS "meetingId",
          status
        FROM races
        WHERE race_id = $1
      `,
      [TEST_RACE_ID]
    )
    expect(raceRows.rowCount).toBe(1)
    expect(raceRows.rows[0]?.meetingId).toBe(TEST_MEETING_ID)
    expect(raceRows.rows[0]?.status).toBe('open')

    const entrantCount = await queryCount(
      'SELECT COUNT(*) as count FROM entrants WHERE race_id = $1',
      [TEST_RACE_ID]
    )
    expect(entrantCount).toBe(2)

    const racePoolRows = await pool.query<{
      winPoolTotal: string
      placePoolTotal: string
      extractedPools: number
    }>(
      `
        SELECT
          win_pool_total AS "winPoolTotal",
          place_pool_total AS "placePoolTotal",
          extracted_pools AS "extractedPools"
        FROM race_pools
        WHERE race_id = $1
      `,
      [TEST_RACE_ID]
    )
    expect(racePoolRows.rowCount).toBe(1)
    expect(Number(racePoolRows.rows[0]?.winPoolTotal)).toBeGreaterThan(0)
    expect(Number(racePoolRows.rows[0]?.placePoolTotal)).toBeGreaterThan(0)
    expect(racePoolRows.rows[0]?.extractedPools).toBeGreaterThanOrEqual(1)

    const moneyFlowCount = await queryCount(
      'SELECT COUNT(*) as count FROM money_flow_history WHERE race_id = $1',
      [TEST_RACE_ID]
    )
    expect(moneyFlowCount).toBe(2)

    const oddsCount = await queryCount(
      'SELECT COUNT(*) as count FROM odds_history WHERE entrant_id = ANY($1::text[])',
      [fixtureEntrantIds]
    )
    expect(oddsCount).toBe(8) // 2 entrants × 4 odds types (fixed_win, fixed_place, pool_win, pool_place)

    const moneyFlowPartitions = await pool.query<{ partition: string }>(
      `
        SELECT DISTINCT tableoid::regclass::text as partition
        FROM money_flow_history
        WHERE race_id = $1
      `,
      [TEST_RACE_ID]
    )
    expect(moneyFlowPartitions.rowCount).toBe(1)
    expect(moneyFlowPartitions.rows[0]?.partition).toBe(
      moneyFlowPartitionName ?? undefined
    )

    const oddsPartitions = await pool.query<{ partition: string }>(
      `
        SELECT DISTINCT tableoid::regclass::text as partition
        FROM odds_history
        WHERE entrant_id = ANY($1::text[])
      `,
      [fixtureEntrantIds]
    )
    expect(oddsPartitions.rowCount).toBeGreaterThanOrEqual(1)
    expect(oddsPartitions.rows.map((row) => row.partition)).toContain(
      oddsPartitionName
    )
  })

  it('propagates NZTAB fetch failures as FetchError and leaves database untouched', async () => {
    fetchRaceDataMock.mockRejectedValueOnce(
      new nzTabErrorClass('NZTAB outage', 503, undefined, true)
    )

    await expect(processRace(TEST_RACE_ID)).rejects.toBeInstanceOf(
      fetchErrorClass
    )

    const meetingCount = await queryCount(
      'SELECT COUNT(*) as count FROM meetings WHERE meeting_id = $1',
      [TEST_MEETING_ID]
    )
    expect(meetingCount).toBe(0)

    const raceCount = await queryCount(
      'SELECT COUNT(*) as count FROM races WHERE race_id = $1',
      [TEST_RACE_ID]
    )
    expect(raceCount).toBe(0)

    const entrantCount = await queryCount(
      'SELECT COUNT(*) as count FROM entrants WHERE race_id = $1',
      [TEST_RACE_ID]
    )
    expect(entrantCount).toBe(0)
  })

  it('propagates worker transform failures as TransformError and rolls back persisted data', async () => {
    fetchRaceDataMock.mockResolvedValueOnce(clone(baseRaceData))
    workerExecMock.mockRejectedValueOnce(new Error('Transform worker failure'))

    await expect(processRace(TEST_RACE_ID)).rejects.toBeInstanceOf(
      transformErrorClass
    )

    const raceCount = await queryCount(
      'SELECT COUNT(*) as count FROM races WHERE race_id = $1',
      [TEST_RACE_ID]
    )
    expect(raceCount).toBe(0)
  })

  it('surfaces database partition issues as WriteError and maintains transactional integrity', async () => {
    const raceData = clone(baseRaceData)
    const transformed = clone(baseTransformed)

    fetchRaceDataMock.mockResolvedValueOnce(raceData)
    workerExecMock.mockResolvedValueOnce(transformed)

    const partitionError = new partitionNotFoundErrorClass(
      'money_flow_history',
      moneyFlowPartitionName ?? 'money_flow_history_missing',
      firstMoneyFlowRecord?.polling_timestamp ?? new Date().toISOString()
    )
    const insertSpy = vi
      .spyOn(timeSeriesModule, 'insertMoneyFlowHistory')
      .mockRejectedValueOnce(partitionError)

    await expect(processRace(TEST_RACE_ID)).rejects.toBeInstanceOf(
      writeErrorClass
    )

    insertSpy.mockRestore()

    const meetingCount = await queryCount(
      'SELECT COUNT(*) as count FROM meetings WHERE meeting_id = $1',
      [TEST_MEETING_ID]
    )
    expect(meetingCount).toBe(0)

    const moneyFlowCount = await queryCount(
      'SELECT COUNT(*) as count FROM money_flow_history WHERE race_id = $1',
      [TEST_RACE_ID]
    )
    expect(moneyFlowCount).toBe(0)
  })
})
