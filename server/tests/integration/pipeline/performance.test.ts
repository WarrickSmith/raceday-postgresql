import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import format from 'pg-format'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { pool } from '../../../src/database/pool.js'
import { clearOddsSnapshot } from '../../../src/utils/odds-change-detection.js'
import type { RaceData } from '../../../src/clients/nztab-types.js'
import type { TransformedRace } from '../../../src/workers/messages.js'
import {
  DEFAULT_TARGETS,
  evaluateThresholds,
  summariseRuns,
  type BenchmarkRunRecord,
} from '../../../src/scripts/benchmark-metrics.js'
import { logger } from '../../../src/shared/logger.js'

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
} = await import('../../../src/pipeline/race-processor.js')
const { NzTabError: nzTabErrorClass } = await import(
  '../../../src/clients/nztab.js'
)
const timeSeriesModule = await import('../../../src/database/time-series.js')
const { ensurePartition, getPartitionTableName, verifyPartitionExists } =
  timeSeriesModule
const { resolveOddsEventTimestamp } = await import(
  '../../../src/pipeline/odds-utils.js'
)

const loadFixture = (relativePath: string): unknown => {
  const filePath = fileURLToPath(new URL(relativePath, import.meta.url))
  const contents = readFileSync(filePath, 'utf-8')
  return JSON.parse(contents) as unknown
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const ensurePresent = <T>(
  value: T | null | undefined,
  message: string
): NonNullable<T> => {
  if (value == null) {
    throw new Error(message)
  }
  return value
}

const baseRaceData = loadFixture(
  '../../fixtures/nztab-api/race-2.10d.json'
) as RaceData
const baseTransformed = loadFixture(
  '../../fixtures/nztab-api/race-2.10d-transformed.json'
) as TransformedRace

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

const createPartitionIfMissing = async (
  tableName: string,
  partitionName: string,
  startTimestamp: string
): Promise<void> => {
  const start = new Date(startTimestamp)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const client = await pool.connect()

  try {
    const exists = await verifyPartitionExists(client, partitionName)
    if (exists) {
      return
    }

    await client.query(
      format(
        'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
        partitionName,
        tableName,
        start.toISOString(),
        end.toISOString()
      )
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error)
    if (!message.includes('already exists')) {
      throw error
    }
  } finally {
    client.release()
  }
}

interface ScenarioDefinition {
  readonly raceId: string
  readonly meetingId: string
  readonly entrantIds: readonly string[]
  createRaceData(): RaceData
  createTransformedRace(): TransformedRace
}

const createScenario = (label: string): ScenarioDefinition => {
  const raceId = `story-2-10d-${label}`
  const meetingId = `${raceId}-meeting`
  const entrantIds = baseTransformed.entrants.map(
    (_, index) => `${raceId}-entrant-${String(index + 1)}`
  )

  return {
    raceId,
    meetingId,
    entrantIds,
    createRaceData: () => {
      const raceData = clone(baseRaceData)
      raceData.id = raceId
      raceData.meeting_id = meetingId
      const { meeting: meetingRaw, entrants: entrantsRaw, money_tracker: moneyTrackerRaw } =
        raceData
      const meeting = ensurePresent(
        meetingRaw,
        'Fixture meeting data must be present for performance validation'
      )
      meeting.meeting = meetingId
      meeting.name = `Story 2.10D Fixture Meeting (${label})`

      const entrants = ensurePresent(
        entrantsRaw,
        'Fixture entrants must be present for performance validation'
      )
      raceData.entrants = entrants.map((entrant, index) => ({
        ...entrant,
        entrantId: entrantIds[index] ?? entrant.entrantId,
      }))

      const moneyTracker = ensurePresent(
        moneyTrackerRaw,
        'Fixture money tracker must be present for performance validation'
      )
      const { entrants: moneyTrackerEntrantsRaw } = moneyTracker
      const moneyTrackerEntrants = ensurePresent(
        moneyTrackerEntrantsRaw,
        'Fixture money tracker entrants must be present for performance validation'
      )
      moneyTracker.entrants = moneyTrackerEntrants.map((tracker, index) => ({
        ...tracker,
        ['entrant_id']: entrantIds[index] ?? tracker.entrant_id,
      }))

      return raceData
    },
    createTransformedRace: () => {
      const transformed = clone(baseTransformed)
      transformed.raceId = raceId
      const {
        meeting: meetingRaw,
        race: raceRaw,
        entrants: entrantsRaw,
        moneyFlowRecords: moneyFlowRecordsRaw,
        racePools: racePoolsRaw,
      } = transformed
      const meeting = ensurePresent(
        meetingRaw,
        'Transformed meeting data must be present for performance validation'
      )
      meeting.meeting_id = meetingId
      meeting.name = `Story 2.10D Fixture Meeting (${label})`

      const race = ensurePresent(
        raceRaw,
        'Transformed race data must be present for performance validation'
      )
      race.race_id = raceId
      race.meeting_id = meetingId
      race.name = `Story 2.10D Fixture Race (${label})`

      const entrants = ensurePresent(
        entrantsRaw,
        'Transformed entrants must be present for performance validation'
      )
      transformed.entrants = entrants.map((entrant, index) => ({
        ...entrant,
        ['entrant_id']: entrantIds[index] ?? entrant.entrant_id,
        ['race_id']: raceId,
      }))

      const moneyFlowRecords = ensurePresent(
        moneyFlowRecordsRaw,
        'Transformed money flow records must be present for performance validation'
      )
      transformed.moneyFlowRecords = moneyFlowRecords.map(
        (record, index) => ({
          ...record,
          ['race_id']: raceId,
          ['entrant_id']: entrantIds[index] ?? record.entrant_id,
        })
      )

      const racePools = ensurePresent(
        racePoolsRaw,
        'Transformed race pools must be present for performance validation'
      )
      transformed.racePools = racePools.map((pool) => ({
        ...pool,
        ['race_id']: raceId,
      }))
      return transformed
    },
  }
}

const configureMocks = (
  scenarios: readonly ScenarioDefinition[]
): void => {
  const scenarioByRace = new Map<string, ScenarioDefinition>()
  for (const scenario of scenarios) {
    scenarioByRace.set(scenario.raceId, scenario)
  }

  fetchRaceDataMock.mockReset()
  workerExecMock.mockReset()

  fetchRaceDataMock.mockImplementation((raceId) => {
    const scenario = scenarioByRace.get(raceId)
    if (scenario === undefined) {
      throw new nzTabErrorClass(`Unexpected raceId request: ${raceId}`, 404)
    }
    return Promise.resolve(scenario.createRaceData())
  })

  workerExecMock.mockImplementation((data) => {
    const scenario = scenarioByRace.get(data.id)
    if (scenario === undefined) {
      throw new Error(`Unexpected worker payload for race ${data.id}`)
    }
    return Promise.resolve(scenario.createTransformedRace())
  })
}

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

const cleanupScenarioData = async (
  scenarios: readonly ScenarioDefinition[]
): Promise<void> => {
  if (scenarios.length === 0) {
    return
  }

  const raceIds = scenarios.map((scenario) => scenario.raceId)
  const entrantIds = scenarios.flatMap((scenario) => scenario.entrantIds)
  const meetingIds = scenarios.map((scenario) => scenario.meetingId)

  await pool.query(
    'DELETE FROM money_flow_history WHERE race_id = ANY($1::text[])',
    [raceIds]
  )
  if (entrantIds.length > 0) {
    await pool.query(
      'DELETE FROM odds_history WHERE entrant_id = ANY($1::text[])',
      [entrantIds]
    )
  }
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

describe('Story 2.10D – performance validation', () => {
  beforeAll(async () => {
    await ensureBaseTables()

    if (moneyFlowPartitionName !== null && firstMoneyFlowRecord !== undefined) {
      const moneyFlowPartitionNameUtc = getPartitionTableName(
        'money_flow_history',
        new Date(firstMoneyFlowRecord.polling_timestamp).toISOString()
      )
      await pool.query(format('DROP TABLE IF EXISTS %I', moneyFlowPartitionName))
      if (moneyFlowPartitionNameUtc !== moneyFlowPartitionName) {
        await pool.query(format('DROP TABLE IF EXISTS %I', moneyFlowPartitionNameUtc))
      }
      try {
        await ensurePartition(
          'money_flow_history',
          new Date(firstMoneyFlowRecord.polling_timestamp)
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error)
        if (!message.includes('already exists')) {
          throw error
        }
      }
    }

    const oddsPartitionNameUtc = getPartitionTableName(
      'odds_history',
      new Date(oddsEventTimestamp).toISOString()
    )
    await pool.query(format('DROP TABLE IF EXISTS %I', oddsPartitionName))
    if (oddsPartitionNameUtc !== oddsPartitionName) {
      await pool.query(format('DROP TABLE IF EXISTS %I', oddsPartitionNameUtc))
    }
    await createPartitionIfMissing(
      'odds_history',
      oddsPartitionName,
      oddsEventTimestamp
    )
  })

  beforeEach(() => {
    vi.clearAllMocks()
    clearOddsSnapshot()
  })

  afterEach(() => {
    clearOddsSnapshot()
  })

  it('meets single race performance thresholds', async () => {
    const scenario = createScenario('perf-single')
    const runs: BenchmarkRunRecord[] = []
    const iterations = 3

    await cleanupScenarioData([scenario])

    for (let iteration = 1; iteration <= iterations; iteration += 1) {
      configureMocks([scenario])
      clearOddsSnapshot()

      const result = await processRace(scenario.raceId, {
        contextId: `perf-single-${String(iteration)}`,
      })

      runs.push({
        iteration,
        raceId: result.raceId,
        status: result.status,
        success: result.success,
        timings: result.timings,
        errorType: result.error?.type,
        errorMessage: result.error?.message,
      })

      expect(result.success).toBe(true)
      await cleanupScenarioData([scenario])
    }

    const summary = summariseRuns(runs)
    const evaluation = evaluateThresholds(
      summary,
      {
        raceCount: 1,
        batchMaxDuration: summary.totals.max,
      },
      DEFAULT_TARGETS
    )

    logger.info(
      {
        event: 'story_2_10d_single_race_perf',
        summary,
        evaluation,
      },
      'Story 2.10D single race performance baseline'
    )

    expect(evaluation.passed).toBe(true)
    expect(summary.totals.max).toBeLessThanOrEqual(
      DEFAULT_TARGETS.singleRaceTotalMs
    )
    expect(summary.fetch.max).toBeLessThanOrEqual(DEFAULT_TARGETS.fetchMs)
    expect(summary.transform.max).toBeLessThanOrEqual(
      DEFAULT_TARGETS.transformMs
    )
    expect(summary.write.max).toBeLessThanOrEqual(DEFAULT_TARGETS.writeMs)
  })

  it('meets five-race batch performance thresholds', async () => {
    const scenarios = [
      createScenario('perf-batch-1'),
      createScenario('perf-batch-2'),
      createScenario('perf-batch-3'),
      createScenario('perf-batch-4'),
      createScenario('perf-batch-5'),
    ]

    const raceIds = scenarios.map((scenario) => scenario.raceId)
    const runs: BenchmarkRunRecord[] = []
    const batchDurations: number[] = []
    const iterations = 3

    await cleanupScenarioData(scenarios)

    for (let iteration = 1; iteration <= iterations; iteration += 1) {
      configureMocks(scenarios)
      clearOddsSnapshot()

      const { results, errors, metrics } = await processRaces(raceIds, 5, {
        contextId: `perf-batch-${String(iteration)}`,
      })

      expect(errors.length).toBe(0)
      batchDurations.push(metrics.maxDuration_ms)

      for (const result of results) {
        runs.push({
          iteration,
          raceId: result.raceId,
          status: result.status,
          success: result.success,
          timings: result.timings,
          errorType: result.error?.type,
          errorMessage: result.error?.message,
        })
        expect(result.success).toBe(true)
      }

      expect(metrics.maxDuration_ms).toBeLessThanOrEqual(
        DEFAULT_TARGETS.multiRaceTotalMs
      )

      await cleanupScenarioData(scenarios)
    }

    await cleanupScenarioData(scenarios)

    const summary = summariseRuns(runs)
    const evaluation = evaluateThresholds(
      summary,
      {
        raceCount: scenarios.length,
        batchMaxDuration: Math.max(...batchDurations),
      },
      DEFAULT_TARGETS
    )

    logger.info(
      {
        event: 'story_2_10d_batch_perf',
        summary,
        evaluation,
      },
      'Story 2.10D five-race batch performance baseline'
    )

    expect(evaluation.passed).toBe(true)
    expect(Math.max(...batchDurations)).toBeLessThanOrEqual(
      DEFAULT_TARGETS.multiRaceTotalMs
    )
    expect(summary.fetch.max).toBeLessThanOrEqual(DEFAULT_TARGETS.fetchMs)
    expect(summary.transform.max).toBeLessThanOrEqual(
      DEFAULT_TARGETS.transformMs
    )
    expect(summary.write.max).toBeLessThanOrEqual(DEFAULT_TARGETS.writeMs)
  })
})
