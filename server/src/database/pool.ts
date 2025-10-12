import type { PoolConfig } from 'pg'
import { Pool } from 'pg'
import { buildDatabaseUrl, env } from '../shared/env.js'
import { logger } from '../shared/logger.js'

declare global {
  var racedayPoolSignalsRegistered: boolean | undefined
}

const poolConfig: PoolConfig = {
  connectionString: buildDatabaseUrl(env),
  max: env.DB_POOL_MAX, // Cap active connections at validated DB_POOL_MAX (AC2)
  min: 2, // Maintain two idle connections to satisfy warm pool requirement (AC2)
  idleTimeoutMillis: 30_000, // Recycle idle clients every 30s per tech spec (AC3)
  connectionTimeoutMillis: 2_000, // Fail fast when connections are exhausted (AC4)
}

const pool = new Pool(poolConfig)

pool.on('error', (err) => {
  logger.error({ err }, 'PostgreSQL pool error')
})

logger.info(
  {
    pool: {
      max: poolConfig.max,
      min: poolConfig.min,
      idleTimeoutMillis: poolConfig.idleTimeoutMillis,
      connectionTimeoutMillis: poolConfig.connectionTimeoutMillis,
    },
  },
  'PostgreSQL pool configured',
)

// Start connection pool monitoring in production (Story 2.5 observability enhancement)
// Monitors pool usage patterns to detect exhaustion and validate concurrency limits
import { monitorPool } from './pool-monitor.js'

const stopMonitoring = monitorPool(pool, {
  refreshInterval: 5000, // Check every 5 seconds
  logThreshold: 70, // Warn when >70% pool utilization
  enabled: process.env.NODE_ENV === 'production',
})

let isClosing = false
let closePromise: Promise<void> | null = null

const closePool = async (reason = 'manual'): Promise<void> => {
  if (isClosing && closePromise !== null) {
    await closePromise
    return
  }

  isClosing = true
  closePromise = (async () => {
    try {
      stopMonitoring() // Stop monitoring before closing pool
      await pool.end()
      logger.info({ reason }, 'PostgreSQL pool closed')
    } catch (err) {
      logger.error({ err, reason }, 'Error closing PostgreSQL pool')
    }
  })()

  await closePromise
}

const terminationSignals: readonly NodeJS.Signals[] = ['SIGTERM', 'SIGINT']

const registerTerminationHandlers = (): void => {
  if (globalThis.racedayPoolSignalsRegistered === true) {
    return
  }

  for (const signal of terminationSignals) {
    process.once(signal, () => {
      logger.info({ signal }, 'Termination signal received; closing PostgreSQL pool')
      void closePool(signal)
    })
  }

  globalThis.racedayPoolSignalsRegistered = true
}

registerTerminationHandlers()

export { closePool, pool, poolConfig }
