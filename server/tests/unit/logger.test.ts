/* eslint-disable @typescript-eslint/naming-convention */
import pino, { type Logger } from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type LogRecord = Record<string, unknown>

const originalEnv = { ...process.env }

const baseEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'postgres',
  DB_PASSWORD: 'postgres',
  DB_NAME: 'raceday',
  NZTAB_API_URL: 'https://api.tab.co.nz',
  PORT: '7000',
  LOG_LEVEL: 'info',
  UV_THREADPOOL_SIZE: '8',
  MAX_WORKER_THREADS: '3',
  DB_POOL_MAX: '10',
}

const setEnv = (overrides: Partial<NodeJS.ProcessEnv> = {}): void => {
  process.env = {
    ...originalEnv,
    ...baseEnv,
    ...overrides,
  }
}

const loadLoggerModule = async (): Promise<{ logger: Logger }> =>
  import('../../src/shared/logger.js')

const serializeLog = (
  logger: Logger,
  level: keyof Logger['levels']['values'],
  obj?: Record<string, unknown> | Error,
  msg?: string
): LogRecord => {
  const asJson = Reflect.get(logger, pino.symbols.asJsonSym) as (
    payload: Record<string, unknown> | Error | undefined,
    message: string | undefined,
    levelNumber: number,
    time: string
  ) => string
  const timeFn = Reflect.get(logger, pino.symbols.timeSym) as () => string
  const levelValue = logger.levels.values[level]
  if (levelValue === undefined) {
    throw new Error(`Missing logger level value for ${String(level)}`)
  }
  const serialized = asJson.call(logger, obj, msg, levelValue, timeFn())
  return JSON.parse(serialized) as LogRecord
}

describe('logger', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('uses the validated LOG_LEVEL from the environment', async () => {
    setEnv({ LOG_LEVEL: 'debug' })
    const { logger } = await loadLoggerModule()

    expect(logger.level).toBe('debug')
  })

  it('includes NODE_ENV in the base context for every log entry', async () => {
    setEnv({ NODE_ENV: 'production' })
    const { logger } = await loadLoggerModule()

    const infoEntry = serializeLog(logger, 'info', undefined, 'first message')
    const warnEntry = serializeLog(logger, 'warn', undefined, 'second message')

    expect(infoEntry.env).toBe('production')
    expect(warnEntry.env).toBe('production')
  })

  it('outputs structured JSON with the expected fields', async () => {
    setEnv()
    const { logger } = await loadLoggerModule()

    const entry = serializeLog(logger, 'info', undefined, 'structured message')

    expect(entry).toHaveProperty('level')
    expect(entry).toHaveProperty('time')
    expect(entry).toHaveProperty('env', 'development')
    expect(entry).toHaveProperty('msg', 'structured message')
  })

  it('emits ISO 8601 timestamps', async () => {
    setEnv()
    const { logger } = await loadLoggerModule()

    const entry = serializeLog(logger, 'info', undefined, 'timestamp check')

    const timeValue = entry.time as string
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

    expect(timeValue).toMatch(iso8601Regex)
    expect(Number.isNaN(new Date(timeValue).getTime())).toBe(false)
  })

  it('formats levels as strings rather than numeric codes', async () => {
    setEnv({ LOG_LEVEL: 'debug' })
    const { logger } = await loadLoggerModule()

    const debugEntry = serializeLog(logger, 'debug', undefined, 'debug message')
    const infoEntry = serializeLog(logger, 'info', undefined, 'info message')
    const warnEntry = serializeLog(logger, 'warn', undefined, 'warn message')
    const errorEntry = serializeLog(logger, 'error', undefined, 'error message')

    expect(debugEntry.level).toBe('debug')
    expect(infoEntry.level).toBe('info')
    expect(warnEntry.level).toBe('warn')
    expect(errorEntry.level).toBe('error')
  })

  it('exports the logger as a named export', async () => {
    setEnv()
    const module = await import('../../src/shared/logger.js')

    expect(module).toHaveProperty('logger')
    expect(typeof module.logger.info).toBe('function')
  })

  it('preserves contextual fields provided at log time', async () => {
    setEnv()
    const { logger } = await loadLoggerModule()

    const entry = serializeLog(
      logger,
      'info',
      { raceId: 'NZ-AUK-20251005-R1', duration: 1200 },
      'Race processed'
    )

    expect(entry.raceId).toBe('NZ-AUK-20251005-R1')
    expect(entry.duration).toBe(1200)
    expect(entry.msg).toBe('Race processed')
  })

  it('serializes error objects alongside contextual data', async () => {
    setEnv()
    const { logger } = await loadLoggerModule()
    const testError = new Error('Test error')

    const entry = serializeLog(
      logger,
      'error',
      { err: testError, raceId: 'R3' },
      'Processing failed'
    )

    const err = entry.err as Record<string, unknown>

    expect(entry.raceId).toBe('R3')
    expect(entry.msg).toBe('Processing failed')
    expect(err.type).toBe('Error')
    expect(err.message).toBe('Test error')
  })
})
