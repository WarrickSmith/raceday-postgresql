import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { RaceDataSchema } from '../clients/nztab-types.js'
import type { RaceData } from '../clients/nztab-types.js'
import { env } from '../shared/env.js'
import { logger } from '../shared/logger.js'
import {
  workerRequestSchema,
  workerResultSchema,
  type TransformedRace,
  type WorkerResult,
} from './messages.js'

type WorkerStatus = 'idle' | 'busy'

interface PendingTask {
  taskId: string
  payload: RaceData
  resolve: (value: TransformedRace) => void
  reject: (reason: unknown) => void
  enqueuedAt: number
  attempts: number
}

interface WorkerState {
  worker: Worker
  status: WorkerStatus
  currentTask?: PendingTask
}

export interface WorkerPoolMetrics {
  totalWorkers: number
  activeWorkers: number
  idleWorkers: number
  queueDepth: number
}

interface WorkerPoolOptions {
  size?: number
  maxAttempts?: number
}

const MAX_DEFAULT_ATTEMPTS = 2

export class WorkerPool {
  private readonly configuredSize: number
  private readonly maxAttempts: number
  private readonly workerScriptUrl: URL
  private readonly execArgv: string[]
  private readonly workerStates = new Map<number, WorkerState>()
  private readonly taskQueue: PendingTask[] = []
  private readonly tasksById = new Map<string, PendingTask>()
  private isShuttingDown = false

  constructor(options?: WorkerPoolOptions) {
    this.configuredSize = this.resolveSize(options?.size)
    this.maxAttempts = Math.max(1, options?.maxAttempts ?? MAX_DEFAULT_ATTEMPTS)

    const { scriptUrl, execArgv } = this.resolveWorkerEntrypoint()
    this.workerScriptUrl = scriptUrl
    this.execArgv = execArgv

    for (let index = 0; index < this.configuredSize; index += 1) {
      this.spawnWorker()
    }

    logger.info(
      {
        event: 'worker_pool_initialized',
        size: this.configuredSize,
        script: this.workerScriptUrl.toString(),
      },
      'Worker pool initialized'
    )
  }

  get size(): number {
    return this.configuredSize
  }

  public getMetrics(): WorkerPoolMetrics {
    const totalWorkers = this.workerStates.size
    const activeWorkers = Array.from(this.workerStates.values()).filter(
      (state) => state.status === 'busy'
    ).length

    return {
      totalWorkers,
      activeWorkers,
      idleWorkers: totalWorkers - activeWorkers,
      queueDepth: this.taskQueue.length,
    }
  }

  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return
    }
    this.isShuttingDown = true

    logger.info(
      {
        event: 'worker_pool_shutdown_start',
        pendingQueue: this.taskQueue.length,
        inflight: this.tasksById.size,
      },
      'Shutting down worker pool'
    )

    const terminationPromises = Array.from(this.workerStates.values()).map(async (state) => {
      try {
        await state.worker.terminate()
      } catch (error) {
        logger.error(
          {
            event: 'worker_pool_shutdown_error',
            workerId: state.worker.threadId,
            error,
          },
          'Failed terminating worker thread during shutdown'
        )
      }
    })

    await Promise.allSettled(terminationPromises)
    this.workerStates.clear()

    for (const task of this.tasksById.values()) {
      task.reject(new Error('Worker pool shut down before task completion'))
    }
    this.tasksById.clear()

    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift()
      task?.reject(new Error('Worker pool shut down before task execution'))
    }

    logger.info({ event: 'worker_pool_shutdown_complete' }, 'Worker pool shutdown complete')
  }

  public async exec(data: RaceData): Promise<TransformedRace> {
    if (this.isShuttingDown) {
      throw new Error('Worker pool is shutting down')
    }

    const payload = RaceDataSchema.parse(data)
    const taskId = randomUUID()

    return await new Promise<TransformedRace>((resolve, reject) => {
      const task: PendingTask = {
        taskId,
        payload,
        resolve,
        reject,
        enqueuedAt: Date.now(),
        attempts: 0,
      }

      this.taskQueue.push(task)
      logger.debug(
        {
          event: 'worker_pool_task_enqueued',
          taskId,
          queueDepth: this.taskQueue.length,
        },
        'Task enqueued for worker pool'
      )
      this.dispatchTasks()
    })
  }

  private resolveSize(size?: number): number {
    const candidate = size ?? env.MAX_WORKER_THREADS
    return Math.max(1, candidate)
  }

  private resolveWorkerEntrypoint(): { scriptUrl: URL; execArgv: string[] } {
    const entryUrl = new URL('./transformWorker.entry.js', import.meta.url)
    const entryPath = fileURLToPath(entryUrl)

    if (existsSync(entryPath)) {
      return { scriptUrl: entryUrl, execArgv: [] }
    }

    const compiledUrl = new URL('./transformWorker.js', import.meta.url)
    const compiledPath = fileURLToPath(compiledUrl)

    if (existsSync(compiledPath)) {
      return { scriptUrl: compiledUrl, execArgv: [] }
    }

    throw new Error(
      'Worker entrypoint not found. Build the project to generate transform worker JavaScript output.'
    )
  }

  private spawnWorker(): void {
    if (this.isShuttingDown) {
      return
    }

    const worker = new Worker(this.workerScriptUrl, {
      execArgv: this.execArgv,
      stderr: true,
      stdout: true,
    })
    const state: WorkerState = {
      worker,
      status: 'idle',
    }

    this.workerStates.set(worker.threadId, state)
    this.registerWorkerEvents(state)

    logger.info(
      {
        event: 'worker_pool_worker_started',
        workerId: worker.threadId,
        queueDepth: this.taskQueue.length,
      },
      'Worker thread started'
    )

    this.dispatchTasks()
  }

  private registerWorkerEvents(state: WorkerState): void {
    const { worker } = state

    worker.on('message', (message) => {
      this.onWorkerMessage(state, message)
    })

    worker.on('error', (error) => {
      logger.error(
        {
          event: 'worker_pool_worker_error',
          workerId: worker.threadId,
          error,
        },
        'Worker thread emitted error'
      )
      this.handleWorkerFailure(state, error)
    })

    worker.on('exit', (code) => {
      logger.warn(
        {
          event: 'worker_pool_worker_exit',
          workerId: worker.threadId,
          code,
          shuttingDown: this.isShuttingDown,
        },
        'Worker thread exited'
      )
      this.handleWorkerExit(state, code)
    })
  }

  private onWorkerMessage(state: WorkerState, raw: unknown): void {
    const parsed = workerResultSchema.safeParse(raw)

    if (!parsed.success) {
      logger.error(
        {
          event: 'worker_pool_invalid_message',
          workerId: state.worker.threadId,
          raw,
          error: parsed.error.flatten(),
        },
        'Received invalid response from worker thread'
      )
      this.failCurrentTask(state, new Error('Invalid worker response'))
      return
    }

    const message: WorkerResult = parsed.data
    const task = this.tasksById.get(message.taskId)

    if (task == null) {
      logger.warn(
        {
          event: 'worker_pool_unknown_task',
          workerId: state.worker.threadId,
          message,
        },
        'Worker reported result for unknown task'
      )
      return
    }

    this.tasksById.delete(message.taskId)
    state.currentTask = undefined
    state.status = 'idle'

    if (message.status === 'ok') {
      task.resolve(message.result)
      logger.info(
        {
          event: 'worker_pool_task_completed',
          workerId: state.worker.threadId,
          taskId: task.taskId,
          durationMs: message.durationMs,
          queueDepth: this.taskQueue.length,
        },
        'Worker completed task successfully'
      )
    } else {
      const taskError = new Error(message.error.message)
      taskError.name = message.error.name
      taskError.stack = message.error.stack
      task.reject(taskError)
      logger.error(
        {
          event: 'worker_pool_task_failure',
          workerId: state.worker.threadId,
          taskId: task.taskId,
          durationMs: message.durationMs,
          error: message.error,
        },
        'Worker failed to process task'
      )
    }

    this.dispatchTasks()
  }

  private dispatchTasks(): void {
    if (this.isShuttingDown) {
      return
    }

    for (const state of this.workerStates.values()) {
      if (state.status === 'busy') {
        continue
      }

      const nextTask = this.taskQueue.shift()
      if (nextTask == null) {
        break
      }

      this.startTask(state, nextTask)
    }
  }

  private startTask(state: WorkerState, task: PendingTask): void {
    const preparedMessage = workerRequestSchema.parse({
      taskId: task.taskId,
      payload: task.payload,
    })

    state.status = 'busy'
    state.currentTask = task
    this.tasksById.set(task.taskId, task)

    logger.info(
      {
        event: 'worker_pool_task_assigned',
        workerId: state.worker.threadId,
        taskId: task.taskId,
        queueDepth: this.taskQueue.length,
      },
      'Assigned task to worker thread'
    )

    state.worker.postMessage(preparedMessage)
  }

  private handleWorkerFailure(state: WorkerState, error: unknown): void {
    const task = state.currentTask
    if (task != null) {
      this.requeueOrFailTask(state, task, error)
    }
    const workerId = state.worker.threadId
    this.workerStates.delete(workerId)

    if (!this.isShuttingDown) {
      void state.worker.terminate().catch((terminateError: unknown) => {
        const normalizedError =
          terminateError instanceof Error
            ? {
                name: terminateError.name,
                message: terminateError.message,
                stack: terminateError.stack,
              }
            : { message: String(terminateError) }
        logger.warn(
          {
            event: 'worker_pool_worker_terminate_error',
            workerId,
            error: normalizedError,
          },
          'Error terminating failed worker thread'
        )
      })
    }
  }

  private handleWorkerExit(state: WorkerState, code: number | null): void {
    const task = state.currentTask
    if (task != null) {
      if (code === 0 && this.isShuttingDown) {
        task.reject(new Error('Worker stopped during shutdown'))
      } else {
        this.requeueOrFailTask(state, task, new Error(`Worker exited with code ${String(code)}`))
      }
    }

    this.workerStates.delete(state.worker.threadId)

    if (!this.isShuttingDown) {
      this.replaceWorker(state)
    }
  }

  private replaceWorker(state: WorkerState): void {
    if (this.isShuttingDown) {
      return
    }

    logger.warn(
      {
        event: 'worker_pool_worker_restart',
        previousWorkerId: state.worker.threadId,
      },
      'Restarting worker thread after failure'
    )

    this.spawnWorker()
  }

  private requeueOrFailTask(state: WorkerState, task: PendingTask, reason: unknown): void {
    this.tasksById.delete(task.taskId)
    state.currentTask = undefined
    state.status = 'idle'

    if (this.isShuttingDown) {
      task.reject(new Error('Worker pool shutting down'))
      return
    }

    if (task.attempts + 1 >= this.maxAttempts) {
      task.reject(
        reason instanceof Error ? reason : new Error('Worker failed to complete task')
      )
      logger.error(
        {
          event: 'worker_pool_task_abandoned',
          taskId: task.taskId,
          attempts: task.attempts + 1,
          reason,
        },
        'Abandoning task after exceeding max attempts'
      )
      return
    }

    task.attempts += 1
    this.taskQueue.unshift(task)
    logger.warn(
      {
        event: 'worker_pool_task_requeued',
        taskId: task.taskId,
        attempts: task.attempts,
        reason,
      },
      'Requeued task after worker failure'
    )
  }

  private failCurrentTask(state: WorkerState, error: Error): void {
    const task = state.currentTask
    if (task == null) {
      return
    }

    this.tasksById.delete(task.taskId)
    state.currentTask = undefined
    state.status = 'idle'
    task.reject(error)

    logger.error(
      {
        event: 'worker_pool_current_task_failed',
        workerId: state.worker.threadId,
        taskId: task.taskId,
        error,
      },
      'Current task failed due to worker message error'
    )
    this.dispatchTasks()
  }
}

export const workerPool = new WorkerPool()
