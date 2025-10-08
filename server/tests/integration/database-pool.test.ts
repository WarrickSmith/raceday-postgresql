/* eslint-disable @typescript-eslint/naming-convention */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'

declare global {
  var racedayPoolSignalsRegistered: boolean | undefined
}

const originalEnv = { ...process.env }

const withFallback = (value: string | undefined, fallback: string): string =>
  value ?? fallback

describe('Shared PostgreSQL pool integration', () => {
  let pool: Pool
  let closePool: (reason?: string) => Promise<void>
  let checkDatabase: () => Promise<{ healthy: boolean; message?: string }>

  beforeAll(async () => {
    vi.resetModules()
    globalThis.racedayPoolSignalsRegistered = undefined

    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      DB_HOST: withFallback(originalEnv.DB_HOST, 'localhost'),
      DB_PORT: withFallback(originalEnv.DB_PORT, '5432'),
      DB_USER: withFallback(originalEnv.DB_USER, 'postgres'),
      DB_PASSWORD: withFallback(originalEnv.DB_PASSWORD, 'postgres'),
      DB_NAME: withFallback(originalEnv.DB_NAME, 'raceday'),
      NZTAB_API_URL: withFallback(originalEnv.NZTAB_API_URL, 'https://api.tab.co.nz'),
      DB_POOL_MAX: withFallback(originalEnv.DB_POOL_MAX, '10'),
    }

    ;({ pool, closePool } = await import('../../src/database/pool.js'))
    ;({ checkDatabase } = await import('../../src/health/database.js'))
  })

  afterAll(async () => {
    await closePool('integration-tests')
    process.env = originalEnv
  })

  it('executes SELECT 1 via the shared pool', async () => {
    const result = await pool.query<{ ready: number }>('SELECT 1 as ready')
    expect(result.rows[0]?.ready).toBe(1)

    const health = await checkDatabase()
    expect(health).toEqual({ healthy: true })
  })

  it('surfaces errors when the pool encounters exhaustion-like failures', async () => {
    const simulatedError = new Error('connection timeout due to exhaustion')
    const querySpy = vi.spyOn(pool, 'query').mockRejectedValueOnce(simulatedError)

    const health = await checkDatabase()

    expect(health.healthy).toBe(false)
    expect(health.message).toBe(simulatedError.message)

    querySpy.mockRestore()
  })
})
