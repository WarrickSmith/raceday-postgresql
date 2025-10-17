import * as cron from 'node-cron'
import type { Pool } from 'pg'
import type { Logger } from 'pino'
import { logger as defaultLogger } from '../shared/logger.js'
import { createTomorrowPartitions } from './partitions.js'

/**
 * Partition scheduler configuration options
 */
export interface PartitionSchedulerOptions {
  /** PostgreSQL connection pool */
  pool: Pool
  /** Logger instance (defaults to application logger) */
  logger?: Logger
  /** Cron expression for partition creation (defaults to midnight NZST) */
  cronExpression?: string
  /** Timezone for cron schedule (defaults to Pacific/Auckland) */
  timezone?: string
  /** Create partitions on startup (defaults to true) */
  runOnStartup?: boolean
}

/**
 * Partition scheduler handle for managing lifecycle
 */
export interface PartitionSchedulerHandle {
  /** Stop the scheduler and cleanup resources */
  stop: () => void
  /** Manually trigger partition creation */
  runNow: () => Promise<string[]>
  /** Check if scheduler is running */
  isRunning: () => boolean
  /** Promise for initial run on startup (if enabled) */
  initialRunPromise?: Promise<string[]>
}

/**
 * Scheduled task interface from node-cron
 */
interface ScheduledTask {
  stop(): void
}

const DEFAULT_TIMEZONE = 'Pacific/Auckland'
const MIDNIGHT_CRON = '0 0 * * *' // Every day at midnight

const serializeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return { message: String(error) }
}

/**
 * Start automatic partition creation scheduler
 *
 * Creates daily partitions for time-series tables at midnight NZST.
 * Runs in New Zealand timezone to align with racing day boundaries.
 *
 * **Story 2.10B - Task 1 (Subtask 1.4):**
 * - Scheduled at midnight NZST before 6:00 AM data initialization
 * - Creates partitions for money_flow_history and odds_history tables
 * - Error handling logs failures without crashing scheduler
 *
 * @param options - Configuration options
 * @returns Handle for managing scheduler lifecycle
 */
export const startPartitionScheduler = (
  options: PartitionSchedulerOptions
): PartitionSchedulerHandle => {
  const { pool } = options
  const timezone = options.timezone ?? DEFAULT_TIMEZONE
  const cronExpression = options.cronExpression ?? MIDNIGHT_CRON
  const log: Logger = options.logger ?? defaultLogger
  const runOnStartup = options.runOnStartup ?? true

  let scheduledTask: ScheduledTask | null = null
  let stopped = false
  let pendingRun: Promise<string[]> | null = null

  /**
   * Execute partition creation (Subtask 1.5, 1.6)
   */
  const runOnce = async (reason: string): Promise<string[]> => {
    // Prevent concurrent runs
    if (pendingRun !== null) {
      log.debug(
        { event: 'partition_creation_skip', reason: 'already_running' },
        'Partition creation already in progress'
      )
      return pendingRun
    }

    const startedAt = new Date()
    const startTime = performance.now()

    log.info(
      {
        event: 'partition_creation_start',
        reason,
        scheduledFor: cronExpression,
        timezone,
        startedAt: startedAt.toISOString(),
      },
      'Partition creation starting'
    )

    const execution = (async (): Promise<string[]> => {
      try {
        const createdPartitions = await createTomorrowPartitions(pool)
        const duration = performance.now() - startTime

        log.info(
          {
            event: 'partition_creation_complete',
            reason,
            partitionsCreated: createdPartitions.length,
            partitionNames: createdPartitions,
            durationMs: Math.round(duration),
            startedAt: startedAt.toISOString(),
            completedAt: new Date().toISOString(),
          },
          'Partition creation completed successfully'
        )

        return createdPartitions
      } catch (error: unknown) {
        const duration = performance.now() - startTime

        log.error(
          {
            event: 'partition_creation_failed',
            reason,
            error: serializeError(error),
            durationMs: Math.round(duration),
            startedAt: startedAt.toISOString(),
          },
          'Partition creation failed'
        )

        // Re-throw to allow callers to handle failures
        throw error
      }
    })()

    pendingRun = execution.finally(() => {
      pendingRun = null
    })

    return pendingRun
  }

  /**
   * Schedule cron job using node-cron
   */
  const scheduleTask = (
    expression: string,
    task: () => void,
    opts?: {
      timezone?: string
      scheduled?: boolean
    }
  ): ScheduledTask => {
    const cronModule = cron as unknown as {
      schedule: (
        expr: string,
        fn: () => void,
        options?: {
          timezone?: string
          scheduled?: boolean
        }
      ) => ScheduledTask
    }

    return cronModule.schedule(expression, task, opts)
  }

  // Schedule midnight job (Subtask 1.4)
  scheduledTask = scheduleTask(
    cronExpression,
    () => {
      void runOnce('scheduled:midnight')
    },
    {
      timezone,
      scheduled: true,
    }
  )

  log.info(
    {
      event: 'partition_scheduler_started',
      cronExpression,
      timezone,
    },
    'Partition scheduler started'
  )

  // Optionally run on startup to ensure partitions exist immediately
  const initialRunPromise = runOnStartup
    ? runOnce('startup')
    : undefined

  /**
   * Stop the scheduler
   */
  const stop = (): void => {
    if (stopped) {
      return
    }

    stopped = true

    if (scheduledTask !== null) {
      scheduledTask.stop()
      scheduledTask = null
    }

    log.info(
      { event: 'partition_scheduler_stopped' },
      'Partition scheduler stopped'
    )
  }

  const handle: PartitionSchedulerHandle = {
    stop,
    runNow: (reason?: string) => runOnce(reason ?? 'manual'),
    isRunning: () => !stopped,
    initialRunPromise,
  }

  return handle
}
