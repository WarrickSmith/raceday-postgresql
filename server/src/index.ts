import { createServer } from './api/server.js'
import { env } from './shared/env.js'
import { logger } from './shared/logger.js'
import { closePool, pool } from './database/pool.js'
import { workerPool } from './workers/worker-pool.js'
import {
  startScheduler as startDynamicScheduler,
  stopScheduler as stopDynamicScheduler,
} from './scheduler/index.js'
import { startDailyInitializationScheduler } from './initialization/scheduler.js'
import { startPartitionScheduler } from './database/partition-scheduler.js'
import type { Server } from 'node:http'

// Create and start Express server
const app = createServer()

// Start partition scheduler (Story 2.10B - Task 1)
// Creates daily partitions at midnight NZST before 6:00 AM data initialization
const partitionScheduler = startPartitionScheduler({
  pool,
  runOnStartup: true,
})

const dailyInitializationScheduler = startDailyInitializationScheduler({
  runOnStartup: true,
  eveningCronExpression: env.EVENING_BACKFILL_ENABLED
    ? env.EVENING_BACKFILL_CRON
    : null,
})

const server: Server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info(
    { port: env.PORT },
    `Server listening on port ${String(env.PORT)}`
  )
  logger.info('Health endpoint available at /health')
  logger.info(
    {
      event: 'worker_pool_ready',
      size: workerPool.size,
      metrics: workerPool.getMetrics(),
    },
    'Worker pool ready at startup'
  )
  void (async () => {
    try {
      if (dailyInitializationScheduler.initialRunPromise !== undefined) {
        await dailyInitializationScheduler.initialRunPromise
        logger.info(
          { event: 'daily_initialization_startup_complete' },
          'Daily baseline initialization completed before starting dynamic scheduler'
        )
      } else {
        logger.info(
          { event: 'daily_initialization_startup_skipped' },
          'Daily baseline initialization startup run skipped (runOnStartup disabled)'
        )
      }
    } catch (err) {
      logger.error(
        { err },
        'Daily baseline initialization failed during startup; starting dynamic scheduler anyway'
      )
    } finally {
      startDynamicScheduler()
      logger.info({ event: 'scheduler_started' }, 'Dynamic scheduler started')
    }
  })()
})

// Graceful shutdown
let isShuttingDown = false

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (isShuttingDown) {
    logger.warn({ signal }, 'Shutdown already in progress')
    return
  }
  isShuttingDown = true

  logger.info({ signal }, 'Shutting down gracefully')

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err?: Error | null) => {
        if (err != null) {
          reject(err)
          return
        }
        logger.info('Express server closed')
        resolve()
      })
    })
  } catch (err) {
    logger.error({ err }, 'Error closing Express server')
  }

  await dailyInitializationScheduler.stop()
  partitionScheduler.stop()
  await stopDynamicScheduler()
  await closePool(signal)
  await workerPool.shutdown()

  process.exit(0)
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})
