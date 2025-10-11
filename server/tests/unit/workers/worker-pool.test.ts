import { EventEmitter } from 'node:events'
import { setImmediate } from 'node:timers'
import { describe, it, beforeEach, expect, afterEach, vi } from 'vitest'
import type { WorkerRequest } from '../../../src/workers/messages.js'
import {
  workerRequestSchema,
  transformedRaceSchema,
  createWorkerErrorMessage,
  createWorkerSuccessMessage,
} from '../../../src/workers/messages.js'
import type { RaceData } from '../../../src/clients/nztab-types.js'

let nextThreadId = 1

const controller: MockWorkerController = {
  instances: [],
  postedMessages: [],
  reset(): void {
    this.instances.length = 0
    this.postedMessages.length = 0
    nextThreadId = 1
  },
}

interface MockWorkerController {
  instances: MockWorker[]
  postedMessages: MockWorkerMessage[]
  reset(): void
}

interface MockWorkerMessage {
  worker: MockWorker
  data: WorkerRequest
}

class MockWorker extends EventEmitter {
  public readonly threadId: number
  public readonly posted: unknown[] = []
  public terminated = false

  constructor() {
    super()
    this.threadId = nextThreadId++
    controller.instances.push(this)
  }

  postMessage(data: unknown): void {
    this.posted.push(data)
    const parsed = workerRequestSchema.parse(data)
    controller.postedMessages.push({ worker: this, data: parsed })
  }

  terminate(): Promise<void> {
    this.terminated = true
    this.emit('exit', 0)
    return Promise.resolve()
  }
}

vi.mock('node:worker_threads', () => ({
  ['Worker']: MockWorker,
  mockController: controller,
}))

let workerPoolClass: typeof import('../../../src/workers/worker-pool.js').WorkerPool
let workerController: MockWorkerController

const getPostedMessage = (index: number): MockWorkerMessage => {
  const message = workerController.postedMessages.at(index)
  if (message == null) {
    throw new Error(`Expected worker message at index ${String(index)}`)
  }
  return message
}

const getWorkerInstance = (index: number): MockWorker => {
  const instance = workerController.instances.at(index)
  if (instance == null) {
    throw new Error(`Expected worker instance at index ${String(index)}`)
  }
  return instance
}

const createRaceData = (overrides?: Partial<RaceData>): RaceData => {
  /* eslint-disable @typescript-eslint/naming-convention */
  const base: RaceData = {
    id: 'race-123',
    name: 'Sample Race',
    status: 'open',
    race_date_nz: '2025-10-10',
    start_time_nz: '12:00',
    entrants: [
      {
        entrantId: 'entrant-1',
        name: 'Runner 1',
        runnerNumber: 1,
      },
    ],
    pools: {
      totalPool: 1000,
      winPool: 600,
      placePool: 400,
    },
    meeting: {
      meeting: 'meeting-1',
      name: 'Ellerslie',
      date: '2025-10-10T12:00:00Z',
      country: 'NZ',
      category: 'R',
      category_name: 'Thoroughbred',
      state: 'Auckland',
      track_condition: 'Good',
      tote_status: 'open',
      meeting_date: null,
      meeting_type: null,
      tote_meeting_number: 1,
      tote_raceday_date: '2025-10-10',
    },
  }
  /* eslint-enable @typescript-eslint/naming-convention */
  return { ...base, ...overrides }
}

const createTransformedRace = (payload: RaceData) =>
  transformedRaceSchema.parse({
    raceId: payload.id,
    raceName: payload.name,
    status: payload.status,
    transformedAt: new Date().toISOString(),
    metrics: {
      entrantCount: Array.isArray(payload.entrants) ? payload.entrants.length : 0,
      poolFieldCount:
        payload.pools == null ? 0 : Object.values(payload.pools).filter((value) => value != null).length,
      moneyFlowRecordCount: 0,
    },
    entrants: [],
    moneyFlowRecords: [],
    originalPayload: payload,
  })

beforeEach(async () => {
  vi.resetModules()
  const workerThreadsModule = (await import('node:worker_threads')) as unknown as {
    mockController: MockWorkerController
  }
  workerController = workerThreadsModule.mockController

  const { WorkerPool: importedWorkerPool, workerPool } = await import('../../../src/workers/worker-pool.js')
  workerPoolClass = importedWorkerPool
  await workerPool.shutdown()
  workerController.reset()
})

afterEach(() => {
  workerController.reset()
})

describe('WorkerPool', () => {
  it('initializes configured worker count', async () => {
    const pool = new workerPoolClass({ size: 2 })
    expect(workerController.instances).toHaveLength(2)
    await pool.shutdown()
  })

  it('assigns tasks to idle workers and resolves on completion', async () => {
    const pool = new workerPoolClass({ size: 1 })
    const race = createRaceData()
    const resultPromise = pool.exec(race)

    expect(workerController.postedMessages).toHaveLength(1)
    const message = getPostedMessage(0)

    const transformed = createTransformedRace(race)
    setImmediate(() => {
      message.worker.emit(
        'message',
        createWorkerSuccessMessage(message.data.taskId, 4.5, transformed)
      )
    })

    await expect(resultPromise).resolves.toMatchObject({
      raceId: race.id,
      metrics: {
        entrantCount: 1,
      },
    })

    await pool.shutdown()
  })

  it('queues tasks when all workers are busy and processes in FIFO order', async () => {
    const pool = new workerPoolClass({ size: 1 })
    const firstRace = createRaceData({ id: 'race-first', name: 'Race A' })
    const secondRace = createRaceData({ id: 'race-second', name: 'Race B' })

    const firstPromise = pool.exec(firstRace)
    const secondPromise = pool.exec(secondRace)

    expect(workerController.postedMessages).toHaveLength(1)
    expect(pool.getMetrics().queueDepth).toBe(1)

    const firstMessage = getPostedMessage(0)
    setImmediate(() => {
      firstMessage.worker.emit(
        'message',
        createWorkerSuccessMessage(firstMessage.data.taskId, 3.2, createTransformedRace(firstRace))
      )
    })

    await expect(firstPromise).resolves.toHaveProperty('raceId', 'race-first')
    expect(workerController.postedMessages).toHaveLength(2)

    const secondMessage = getPostedMessage(1)
    setImmediate(() => {
      secondMessage.worker.emit(
        'message',
        createWorkerSuccessMessage(secondMessage.data.taskId, 2.1, createTransformedRace(secondRace))
      )
    })

    await expect(secondPromise).resolves.toHaveProperty('raceId', 'race-second')
    expect(pool.getMetrics().queueDepth).toBe(0)

    await pool.shutdown()
  })

  it('rejects exec promise when worker reports failure', async () => {
    const pool = new workerPoolClass({ size: 1 })
    const race = createRaceData()
    const promise = pool.exec(race)

    const message = getPostedMessage(0)
    setImmediate(() => {
      message.worker.emit(
        'message',
        createWorkerErrorMessage(message.data.taskId, 5.6, {
          name: 'TransformError',
          message: 'Failed to transform',
        })
      )
    })

    await expect(promise).rejects.toHaveProperty('message', 'Failed to transform')
    await pool.shutdown()
  })

  it('requeues tasks and restarts workers after crash', async () => {
    const pool = new workerPoolClass({ size: 1, maxAttempts: 2 })
    const race = createRaceData()
    const resultPromise = pool.exec(race)

    const firstWorker = getWorkerInstance(0)

    firstWorker.emit('error', new Error('Unexpected failure'))

    expect(workerController.instances).toHaveLength(2)
    const replacementWorker = getWorkerInstance(1)

    expect(workerController.postedMessages).toHaveLength(2)
    const reassignedMessage = getPostedMessage(1)
    expect(reassignedMessage.worker).toBe(replacementWorker)
    expect(reassignedMessage.data.taskId).toBeDefined()

    setImmediate(() => {
      reassignedMessage.worker.emit(
        'message',
        createWorkerSuccessMessage(
          reassignedMessage.data.taskId,
          7.8,
          createTransformedRace(race)
        )
      )
    })

    await expect(resultPromise).resolves.toHaveProperty('raceId', race.id)
    await pool.shutdown()
  })

  it('exposes metrics for active and idle workers', async () => {
    const pool = new workerPoolClass({ size: 2 })
    const race = createRaceData()
    const promise = pool.exec(race)
    const metrics = pool.getMetrics()

    expect(metrics.totalWorkers).toBe(2)
    expect(metrics.activeWorkers).toBe(1)
    expect(metrics.idleWorkers).toBe(1)

    const message = getPostedMessage(0)
    setImmediate(() => {
      message.worker.emit(
        'message',
        createWorkerSuccessMessage(message.data.taskId, 3.3, createTransformedRace(race))
      )
    })

    await promise
    const afterMetrics = pool.getMetrics()
    expect(afterMetrics.activeWorkers).toBe(0)
    expect(afterMetrics.idleWorkers).toBe(2)

    await pool.shutdown()
  })
})
