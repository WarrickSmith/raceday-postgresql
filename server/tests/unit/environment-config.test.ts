import { describe, expect, it } from 'vitest'
import 'dotenv/config'

describe('Environment Configuration Tests', () => {
  it('should have database connection parameters configured', () => {
    expect(process.env.DB_HOST).toBeDefined()
    expect(process.env.DB_PORT).toBeDefined()
    expect(Number(process.env.DB_PORT)).toBeGreaterThan(0)
    expect(process.env.DB_USER).toBeDefined()
    expect(process.env.DB_PASSWORD).toBeDefined()
    expect(process.env.DB_NAME).toBeDefined()
  })

  it('should have NZTAB_API_URL configured', () => {
    expect(process.env.NZTAB_API_URL).toBeDefined()
    expect(process.env.NZTAB_API_URL).toBe('https://api.tab.co.nz')
  })

  it('should have NODE_ENV configured', () => {
    expect(process.env.NODE_ENV).toBeDefined()
    expect(['development', 'production', 'test']).toContain(
      process.env.NODE_ENV
    )
  })

  it('should have PORT configured', () => {
    expect(process.env.PORT).toBeDefined()
    expect(Number(process.env.PORT)).toBeGreaterThan(0)
    expect(Number(process.env.PORT)).toBeLessThan(65536)
  })

  it('should have LOG_LEVEL configured', () => {
    expect(process.env.LOG_LEVEL).toBeDefined()
    expect(['debug', 'info', 'warn', 'error']).toContain(process.env.LOG_LEVEL)
  })

  it('should have performance tuning variables configured', () => {
    expect(process.env.UV_THREADPOOL_SIZE).toBeDefined()
    expect(Number(process.env.UV_THREADPOOL_SIZE)).toBeGreaterThan(0)

    expect(process.env.MAX_WORKER_THREADS).toBeDefined()
    expect(Number(process.env.MAX_WORKER_THREADS)).toBeGreaterThan(0)

    expect(process.env.DB_POOL_MAX).toBeDefined()
    expect(Number(process.env.DB_POOL_MAX)).toBeGreaterThan(0)
  })
})
