import { createServer } from './api/server.js'
import { env } from './shared/env.js'
import { logger } from './shared/logger.js'
import { closePool } from './database/pool.js'
import type { Server } from 'node:http'

// Create and start Express server
const app = createServer()
const server: Server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info({ port: env.PORT }, `Server listening on port ${String(env.PORT)}`)
  logger.info('Health endpoint available at /health')
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

  await closePool(signal)

  process.exit(0)
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})
