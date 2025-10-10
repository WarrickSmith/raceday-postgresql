import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync, unlinkSync } from 'node:fs'
import { describe, it, beforeEach, afterEach, afterAll, expect, vi } from 'vitest'
import type { WorkerRequest } from '../../../src/workers/messages.js'
import { workerRequestSchema } from '../../../src/workers/messages.js'

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

const workerDir = dirname(fileURLToPath(new URL('../../../src/workers/transformWorker.entry.js', import.meta.url)))
const compiledWorkerPath = join(workerDir, 'transformWorker.js')
const originalNodeEnv = process.env.NODE_ENV

describe('WorkerPool production runtime', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production'
    controller.reset()
    writeFileSync(compiledWorkerPath, 'export {};', 'utf8')

    vi.resetModules()
    vi.mock('tsx/esm/api', () => {
      throw new Error('tsx runtime should not be loaded in production')
    })
  })

  afterEach(() => {
    controller.reset()
    vi.resetModules()
    vi.unmock('tsx/esm/api')
    try {
      unlinkSync(compiledWorkerPath)
    } catch {
      // ignore
    }
  })

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('initializes without relying on TypeScript loaders', async () => {
    const { WorkerPool: workerPoolClass, workerPool } = await import('../../../src/workers/worker-pool.js')
    await workerPool.shutdown()
    controller.reset()
    const pool = new workerPoolClass({ size: 1 })
    expect(controller.instances).toHaveLength(1)
    await pool.shutdown()
  })
})
