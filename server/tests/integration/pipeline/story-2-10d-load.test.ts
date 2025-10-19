/* eslint-disable @typescript-eslint/naming-convention */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RaceData } from '../../../src/clients/nztab-types.js'
import type { TransformedRace } from '../../../src/workers/messages.js'
import { env } from '../../../src/shared/env.js'
import { buildScenario } from './story-2-10d-test-helpers.js'

const fetchRaceDataMock: ReturnType<
  typeof vi.fn<(raceId: string) => Promise<RaceData>>
> = vi.hoisted(() => vi.fn())

const workerExecMock: ReturnType<
  typeof vi.fn<(data: RaceData) => Promise<TransformedRace>>
> = vi.hoisted(() => vi.fn())

const withTransactionMock: ReturnType<
  typeof vi.fn<
    <T>(callback: (client: unknown) => Promise<T>) => Promise<T>
  >
> = vi.hoisted(() => vi.fn())

const bulkUpsertMeetingsMock: ReturnType<
  typeof vi.fn<(meetings: unknown[]) => Promise<{ rowCount: number; duration: number }>>
> = vi.hoisted(() => vi.fn())

const bulkUpsertRacesMock: ReturnType<
  typeof vi.fn<(races: unknown[]) => Promise<{ rowCount: number; duration: number }>>
> = vi.hoisted(() => vi.fn())

const bulkUpsertEntrantsMock: ReturnType<
  typeof vi.fn<(entrants: unknown[]) => Promise<{ rowCount: number; duration: number }>>
> = vi.hoisted(() => vi.fn())

const bulkUpsertRacePoolsMock: ReturnType<
  typeof vi.fn<(pools: unknown[]) => Promise<{ rowCount: number; duration: number }>>
> = vi.hoisted(() => vi.fn())

const insertMoneyFlowHistoryMock: ReturnType<
  typeof vi.fn<() => Promise<{ rowCount: number; duration: number }>>
> = vi.hoisted(() => vi.fn())

const insertOddsHistoryMock: ReturnType<
  typeof vi.fn<() => Promise<{ rowCount: number; duration: number }>>
> = vi.hoisted(() => vi.fn())

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

vi.mock('../../../src/database/bulk-upsert.js', () => ({
  withTransaction: withTransactionMock,
  bulkUpsertMeetings: bulkUpsertMeetingsMock,
  bulkUpsertRaces: bulkUpsertRacesMock,
  bulkUpsertEntrants: bulkUpsertEntrantsMock,
  bulkUpsertRacePools: bulkUpsertRacePoolsMock,
}))

vi.mock('../../../src/database/time-series.js', () => ({
  insertMoneyFlowHistory: insertMoneyFlowHistoryMock,
  insertOddsHistory: insertOddsHistoryMock,
  ensurePartition: vi.fn(),
  PartitionNotFoundError: class PartitionNotFoundError extends Error {
    public readonly table: string
    public readonly partition: string

    constructor(table: string, partition: string) {
      super(`Partition missing: ${table} -> ${partition}`)
      this.table = table
      this.partition = partition
    }
  },
}))

import { FetchError, TransformError, WriteError, processRaces } from '../../../src/pipeline/race-processor.js'
import { NzTabError } from '../../../src/clients/nztab.js'

const originalDbPoolMax = env.DB_POOL_MAX

const createScenarios = (count: number) => {
  const scenarios = Array.from({ length: count }, (_, index) => buildScenario(`load-${String(index + 1)}`))
  const scenarioByRaceId = new Map(scenarios.map((scenario) => [scenario.raceId, scenario]))
  return { raceIds: scenarios.map((scenario) => scenario.raceId), scenarioByRaceId }
}

const configureFetchAndWorkerMocks = (
  scenarioByRaceId: Map<string, ReturnType<typeof buildScenario>>
): void => {
  fetchRaceDataMock.mockImplementation((raceId) => {
    const scenario = scenarioByRaceId.get(raceId)
    if (scenario === undefined) {
      throw new Error(`Unexpected raceId ${raceId}`)
    }
    return Promise.resolve(scenario.createRaceData())
  })

  workerExecMock.mockImplementation((raceData) => {
    const scenario = scenarioByRaceId.get(raceData.id)
    if (scenario === undefined) {
      throw new Error(`Unexpected race data id ${raceData.id}`)
    }
    return Promise.resolve(scenario.createTransformedRace())
  })
}

describe('Story 2.10D – load validation', () => {
  beforeEach(() => {
    fetchRaceDataMock.mockReset()
    workerExecMock.mockReset()
    withTransactionMock.mockReset()
    bulkUpsertMeetingsMock.mockReset()
    bulkUpsertRacesMock.mockReset()
    bulkUpsertEntrantsMock.mockReset()
    bulkUpsertRacePoolsMock.mockReset()
    insertMoneyFlowHistoryMock.mockReset()
    insertOddsHistoryMock.mockReset()

    const fakeClient = { query: vi.fn(() => Promise.resolve({ rows: [] })) }
    withTransactionMock.mockImplementation(async (callback) => await callback(fakeClient))
    bulkUpsertMeetingsMock.mockResolvedValue({ rowCount: 1, duration: 1 })
    bulkUpsertRacesMock.mockResolvedValue({ rowCount: 1, duration: 1 })
    bulkUpsertEntrantsMock.mockResolvedValue({ rowCount: 2, duration: 1 })
    bulkUpsertRacePoolsMock.mockResolvedValue({ rowCount: 1, duration: 1 })
    insertMoneyFlowHistoryMock.mockResolvedValue({ rowCount: 2, duration: 1 })
    insertOddsHistoryMock.mockResolvedValue({ rowCount: 4, duration: 1 })

    env.DB_POOL_MAX = originalDbPoolMax
  })

  afterEach(() => {
    env.DB_POOL_MAX = originalDbPoolMax
  })

  it('respects connection pool limits while processing concurrently (Subtasks 4.1-4.3)', async () => {
    const { raceIds, scenarioByRaceId } = createScenarios(6)

    configureFetchAndWorkerMocks(scenarioByRaceId)

    env.DB_POOL_MAX = 3

    let inFlight = 0
    let peakConcurrency = 0

    workerExecMock.mockImplementation(async (raceData) => {
      const scenario = scenarioByRaceId.get(raceData.id)
      if (scenario === undefined) {
        throw new Error(`Unexpected race data id ${raceData.id}`)
      }
      inFlight += 1
      peakConcurrency = Math.max(peakConcurrency, inFlight)
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          inFlight -= 1
          resolve()
        }, 5)
      })
      return scenario.createTransformedRace()
    })

    const outcome = await processRaces(raceIds, 5, {
      contextId: 'story-2-10d-load-concurrency',
    })

    expect(outcome.errors).toHaveLength(0)
    expect(outcome.results).toHaveLength(raceIds.length)
    expect(outcome.metrics.effectiveConcurrency).toBe(Math.min(5, env.DB_POOL_MAX))
    expect(peakConcurrency).toBe(outcome.metrics.effectiveConcurrency)
    expect(workerExecMock).toHaveBeenCalledTimes(raceIds.length)
  })

  it('keeps remaining races successful when one transform fails (Subtask 4.4)', async () => {
    const { raceIds, scenarioByRaceId } = createScenarios(4)

    configureFetchAndWorkerMocks(scenarioByRaceId)

    const failingRaceId = raceIds[2] ?? raceIds[0]

    workerExecMock.mockImplementation((raceData) => {
      if (raceData.id === failingRaceId) {
        return Promise.reject(new Error('Worker failure'))
      }
      const scenario = scenarioByRaceId.get(raceData.id)
      if (scenario === undefined) {
        throw new Error(`Unexpected race data id ${raceData.id}`)
      }
      return Promise.resolve(scenario.createTransformedRace())
    })

    const outcome = await processRaces(raceIds, 4, {
      contextId: 'story-2-10d-load-failure-isolation',
    })

    expect(outcome.errors).toHaveLength(1)
    expect(outcome.errors[0]).toBeInstanceOf(TransformError)
    expect(outcome.metrics.failures).toBe(1)
    expect(outcome.metrics.successes).toBe(raceIds.length - 1)
    expect(outcome.results).toHaveLength(raceIds.length - 1)
  })

  it('counts retryable fetch outages under load (Subtask 4.5)', async () => {
    const { raceIds, scenarioByRaceId } = createScenarios(3)

    const failingRaceId = raceIds[1] ?? raceIds[0]

    configureFetchAndWorkerMocks(scenarioByRaceId)

    fetchRaceDataMock.mockImplementation((raceId) => {
      if (raceId === failingRaceId) {
        return Promise.reject(new NzTabError('NZTAB outage', 503, undefined, true))
      }
      const scenario = scenarioByRaceId.get(raceId)
      if (scenario === undefined) {
        throw new Error(`Unexpected raceId ${raceId}`)
      }
      return Promise.resolve(scenario.createRaceData())
    })

    const outcome = await processRaces(raceIds, 3, {
      contextId: 'story-2-10d-load-retryable',
    })

    expect(outcome.errors).toHaveLength(1)
    expect(outcome.errors[0]).toBeInstanceOf(FetchError)
    expect(outcome.errors[0]?.retryable).toBe(true)
    expect(outcome.metrics.retryableFailures).toBe(1)
    expect(outcome.metrics.failures).toBe(1)
  })

  it('handles write-stage failures without halting remaining races (Subtask 4.6)', async () => {
    const { raceIds, scenarioByRaceId } = createScenarios(4)

    configureFetchAndWorkerMocks(scenarioByRaceId)

    insertMoneyFlowHistoryMock.mockImplementationOnce(() => Promise.reject(new Error('DB timeout')))

    const outcome = await processRaces(raceIds, 4, {
      contextId: 'story-2-10d-load-write',
    })

    expect(outcome.errors).toHaveLength(1)
    expect(outcome.errors[0]).toBeInstanceOf(WriteError)
    expect(outcome.metrics.failures).toBe(1)
    expect(outcome.metrics.retryableFailures).toBe(0)
    expect(outcome.results).toHaveLength(raceIds.length - 1)
  })
})

/* eslint-enable @typescript-eslint/naming-convention */
