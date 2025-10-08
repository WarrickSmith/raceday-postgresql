/* eslint-disable @typescript-eslint/naming-convention */
import type { PoolConfig } from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

declare global {
  var racedayPoolSignalsRegistered: boolean | undefined
}

const originalEnv = { ...process.env }

interface MockPoolInstance {
  options: PoolConfig
  on: ReturnType<typeof vi.fn<(event: string, handler: (err: Error) => void) => void>>
  end: ReturnType<typeof vi.fn<() => Promise<void>>>
}

const poolInstances: MockPoolInstance[] = []

const mockPoolConstructor = vi.fn<(config: PoolConfig) => MockPoolInstance>((config) => {
  const on = vi.fn<(event: string, handler: (err: Error) => void) => void>()
  const end = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

  const instance: MockPoolInstance = {
    options: config,
    on,
    end,
  }

  poolInstances.push(instance)
  return instance
})

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
}

vi.mock('pg', () => ({
  Pool: mockPoolConstructor,
}))

vi.mock('../../../src/shared/logger.js', () => ({
  logger: mockLogger,
}))

const setTestEnv = (): void => {
  process.env = {
    ...originalEnv,
    NODE_ENV: 'test',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_USER: 'postgres',
    DB_PASSWORD: 'postgres',
    DB_NAME: 'raceday',
    NZTAB_API_URL: 'https://api.tab.co.nz',
    DB_POOL_MAX: '12',
  }
}

beforeEach(() => {
  vi.resetModules()
  mockPoolConstructor.mockClear()
  poolInstances.length = 0
  mockLogger.info.mockClear()
  mockLogger.error.mockClear()
  setTestEnv()
  globalThis.racedayPoolSignalsRegistered = undefined
})

afterEach(() => {
  process.env = originalEnv
})

describe('database pool', () => {
  it('configures pg.Pool with environment-driven options and emits metrics log', async () => {
    const onceSpy = vi.spyOn(process, 'once')

    const { poolConfig } = await import('../../../src/database/pool.js')

    expect(mockPoolConstructor).toHaveBeenCalledTimes(1)
    expect(poolConfig).toMatchObject({
      connectionString: 'postgresql://postgres:postgres@localhost:5432/raceday',
      max: 12,
      min: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
    })

    const instance = poolInstances.at(-1)
    expect(instance?.on).toHaveBeenCalledWith('error', expect.any(Function))

    expect(mockLogger.info).toHaveBeenCalledWith(
      {
        pool: {
          max: 12,
          min: 2,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 2_000,
        },
      },
      'PostgreSQL pool configured',
    )

    expect(onceSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function))
    expect(onceSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function))

    onceSpy.mockRestore()
  })

  it('closes the pool once even when invoked repeatedly', async () => {
    const { closePool } = await import('../../../src/database/pool.js')

    const instance = poolInstances.at(-1)
    expect(instance).toBeDefined()

    await closePool('SIGTERM')
    await closePool('SIGTERM')

    expect(instance?.end).toHaveBeenCalledTimes(1)

    expect(mockLogger.info).toHaveBeenLastCalledWith(
      { reason: 'SIGTERM' },
      'PostgreSQL pool closed',
    )
  })

  it('logs pool errors through shared logger', async () => {
    await import('../../../src/database/pool.js')

    const instance = poolInstances.at(-1)
    const errorHandler = instance?.on.mock.calls.find(([event]) => event === 'error')?.[1]

    expect(typeof errorHandler).toBe('function')

    const simulatedError = new Error('connection reset')
    errorHandler?.(simulatedError)

    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: simulatedError },
      'PostgreSQL pool error',
    )
  })
})
