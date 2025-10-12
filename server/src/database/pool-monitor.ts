/**
 * Connection Pool Monitoring for Story 2.5
 *
 * Lightweight monitoring solution that tracks pool metrics without external dependencies.
 * Logs connection usage patterns to detect pool exhaustion and optimize concurrency limits.
 *
 * Integration point for future observability dashboards (Story 2.5 follow-up).
 */

import type { Pool } from 'pg'
import { logger } from '../shared/logger.js'

export interface PoolMetrics {
  totalCount: number // Total clients in pool
  idleCount: number // Clients available for checkout
  waitingCount: number // Requests waiting for client
  timestamp: Date
}

export interface PoolMonitorOptions {
  refreshInterval?: number // Milliseconds between metric collections (default: 5000)
  logThreshold?: number // Only log when pool usage exceeds this percentage (default: 70)
  enabled?: boolean // Enable/disable monitoring (default: true in production)
}

/**
 * Monitors PostgreSQL connection pool metrics
 *
 * Tracks pool usage patterns to:
 * - Detect connection exhaustion before it impacts requests
 * - Validate 10-connection budget stays within safety margins
 * - Identify optimal maxConcurrency for race processor
 * - Feed metrics to observability dashboards (future)
 *
 * @param pool - PostgreSQL connection pool from pg driver
 * @param options - Monitoring configuration
 * @returns Cleanup function to stop monitoring
 */
export function monitorPool(
  pool: Pool,
  options: PoolMonitorOptions = {}
): () => void {
  const {
    refreshInterval = 5000,
    logThreshold = 70,
    enabled = process.env.NODE_ENV === 'production',
  } = options

  if (!enabled) {
    logger.info('Pool monitoring disabled (not in production)')
    return () => {
      /* no-op */
    }
  }

  logger.info(
    { refreshInterval, logThreshold },
    'Connection pool monitoring started'
  )

  const intervalId = setInterval(() => {
    collectMetrics(pool, logThreshold)
  }, refreshInterval)

  // Return cleanup function
  return () => {
    clearInterval(intervalId)
    logger.info('Connection pool monitoring stopped')
  }
}

/**
 * Collects and logs pool metrics snapshot
 */
function collectMetrics(pool: Pool, logThreshold: number): void {
  const metrics: PoolMetrics = {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    timestamp: new Date(),
  }

  const usagePercent =
    pool.totalCount > 0
      ? Math.round(((pool.totalCount - pool.idleCount) / pool.totalCount) * 100)
      : 0

  // Only log when usage exceeds threshold (reduce noise)
  if (usagePercent >= logThreshold || pool.waitingCount > 0) {
    logger.warn(
      {
        poolTotal: metrics.totalCount,
        poolIdle: metrics.idleCount,
        poolActive: metrics.totalCount - metrics.idleCount,
        poolWaiting: metrics.waitingCount,
        usagePercent,
        thresholdExceeded: usagePercent >= logThreshold,
      },
      'High connection pool usage detected'
    )
  } else {
    // Debug-level logging for normal usage
    logger.debug(
      {
        poolTotal: metrics.totalCount,
        poolIdle: metrics.idleCount,
        poolActive: metrics.totalCount - metrics.idleCount,
        usagePercent,
      },
      'Connection pool metrics snapshot'
    )
  }

  // Alert if clients are waiting (pool exhaustion)
  if (pool.waitingCount > 0) {
    logger.error(
      {
        waitingCount: pool.waitingCount,
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
      },
      'Connection pool exhausted - requests waiting for available client'
    )
  }
}

/**
 * Gets current pool metrics snapshot (for on-demand queries)
 */
export function getPoolMetrics(pool: Pool): PoolMetrics {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    timestamp: new Date(),
  }
}

/**
 * Calculates pool usage percentage
 */
export function getPoolUsagePercent(pool: Pool): number {
  if (pool.totalCount === 0) return 0
  const active = pool.totalCount - pool.idleCount
  return Math.round((active / pool.totalCount) * 100)
}
