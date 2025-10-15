import * as cron from 'node-cron'
import type { Logger } from 'pino'
import { logger as defaultLogger } from '../shared/logger.js'
import { runDailyBaselineInitialization } from './daily-baseline.js'
import type {
  DailyInitializationSchedulerHandle,
  DailyInitializationSchedulerOptions,
  InitializationResult,
} from './types.js'

// Define ScheduledTask interface locally
interface ScheduledTask {
  stop(): void
}

const DEFAULT_TIMEZONE = 'Pacific/Auckland'
const MORNING_CRON = '0 6 * * *'
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes ceiling for large race days

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

export const startDailyInitializationScheduler = (
  options: DailyInitializationSchedulerOptions = {}
): DailyInitializationSchedulerHandle => {
  const timezone = options.timezone ?? DEFAULT_TIMEZONE
  const morningCronExpression = options.morningCronExpression ?? MORNING_CRON
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const log: Logger = options.logger ?? defaultLogger
  const task = options.task ?? runDailyBaselineInitialization

  const scheduledTasks: ScheduledTask[] = []
  let stopped = false
  let pendingRun: Promise<InitializationResult> | null = null

  const runOnce = async (reason: string): Promise<InitializationResult> => {
    if (pendingRun !== null) {
      return pendingRun
    }

    const startedAt = new Date()
    log.info(
      {
        event: 'daily_initialization_start',
        reason,
        scheduledFor: morningCronExpression,
        timezone,
        timeoutMs,
        startedAt: startedAt.toISOString(),
      },
      'Daily baseline initialization starting'
    )

    let timeoutHandle: NodeJS.Timeout | undefined

    const timeoutPromise = new Promise<InitializationResult>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const timeoutErr = new Error(
          `Daily baseline initialization exceeded ${String(timeoutMs)}ms timeout`
        )
        reject(timeoutErr)
      }, timeoutMs)
    })

    const execution = (async (): Promise<InitializationResult> => {
      try {
        const result = await task({ reason })
        log.info(
          {
            event: 'daily_initialization_complete',
            reason,
            durationMs: result.stats.durationMs,
            meetingsFetched: result.stats.meetingsFetched,
            meetingsWritten: result.stats.meetingsWritten,
            racesFetched: result.stats.racesFetched,
            racesCreated: result.stats.racesCreated,
            entrantsPopulated: result.stats.entrantsPopulated,
            retries: result.stats.retries,
            startedAt: result.startedAt.toISOString(),
            completedAt: result.completedAt.toISOString(),
          },
          'Daily baseline initialization completed'
        )
        return result
      } catch (error: unknown) {
        log.error(
          {
            event: 'daily_initialization_failed',
            reason,
            error: serializeError(error),
            startedAt: startedAt.toISOString(),
          },
          'Daily baseline initialization failed'
        )
        throw error
      }
    })()

    pendingRun = Promise.race([execution, timeoutPromise])
      .catch((error: unknown) => {
        log.error(
          {
            event: 'daily_initialization_terminated',
            reason,
            error: serializeError(error),
          },
          'Daily baseline initialization terminated'
        )
        throw error
      })
      .finally(() => {
        if (timeoutHandle !== undefined) {
          clearTimeout(timeoutHandle)
        }
        pendingRun = null
      })

    return pendingRun
  }

  const scheduleTask = (
    cronExpression: string,
    task: () => void,
    options?: {
      timezone?: string
      scheduled?: boolean
    }
  ): ScheduledTask => {
    const cronModule = cron as unknown as {
      schedule: (
        expression: string,
        fn: () => void,
        opts?: {
          timezone?: string
          scheduled?: boolean
        }
      ) => ScheduledTask
    }

    const cronTask = cronModule.schedule(cronExpression, task, options)

    scheduledTasks.push(cronTask)
    return cronTask
  }

  // Schedule 6:00 AM job
  scheduleTask(
    morningCronExpression,
    () => {
      void runOnce('scheduled:morning')
    },
    {
      timezone,
      scheduled: true,
    }
  )

  // Optional evening job deferred until Task 10 when configured
  if (
    options.eveningCronExpression != null &&
    options.eveningCronExpression !== ''
  ) {
    scheduleTask(
      options.eveningCronExpression,
      () => {
        void runOnce('scheduled:evening')
      },
      {
        timezone,
        scheduled: options.runOnStartup ?? true,
      }
    )
  }

  const initialRunPromise =
    options.runOnStartup === true ? runOnce('startup') : undefined

  const stop = async (): Promise<void> => {
    if (stopped) {
      return
    }

    stopped = true
    for (const taskHandle of scheduledTasks) {
      taskHandle.stop()
    }

    if (pendingRun !== null) {
      try {
        await pendingRun
      } catch {
        // Swallow errors when stopping; already logged above
      }
    }
  }

  const handle: DailyInitializationSchedulerHandle = {
    stop,
    runNow: (reason?: string) => runOnce(reason ?? 'manual'),
    isRunning: () => !stopped,
    initialRunPromise,
  }

  return handle
}
