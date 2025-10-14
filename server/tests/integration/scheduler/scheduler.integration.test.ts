import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from 'pino'

import { pool } from '../../../src/database/pool.js'
import { createScheduler } from '../../../src/scheduler/index.js'
import type { SchedulerDependencies, TimerControls } from '../../../src/scheduler/types.js'
import type { ProcessResult } from '../../../src/pipeline/race-processor.js'

const TEST_PREFIX = 'itest-scheduler'
const baseTime = new Date('2025-10-14T00:00:00Z')

/* eslint-disable @typescript-eslint/naming-convention */
const createProcessResult = (raceId: string): ProcessResult => ({
  raceId,
  status: 'success',
  success: true,
  timings: {
    fetch_ms: 12,
    transform_ms: 6,
    write_ms: 8,
    total_ms: 26,
  },
  rowCounts: {
    meetings: 0,
    races: 0,
    entrants: 0,
    moneyFlowHistory: 0,
    oddsHistory: 0,
  },
})

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const waitForCondition = async (predicate: () => boolean, maxIterations = 50): Promise<void> => {
  for (let i = 0; i < maxIterations; i += 1) {
    if (predicate()) {
      return
    }
    await settle()
  }
  throw new Error('Condition not met within expected iterations')
}
/* eslint-enable @typescript-eslint/naming-convention */

const createMockLogger = () => {
  const infoMock = vi.fn<(obj: Record<string, unknown>, msg: string) => void>()
  const warnMock = vi.fn()
  const errorMock = vi.fn()
  const debugMock = vi.fn()
  const childMock = vi.fn().mockReturnThis()

  const logger = {
    info: ((obj: Record<string, unknown>, msg: string) => {
      infoMock(obj, msg)
    }) as unknown as Logger['info'],
    warn: warnMock as unknown as Logger['warn'],
    error: errorMock as unknown as Logger['error'],
    debug: debugMock as unknown as Logger['debug'],
    child: childMock as unknown as Logger['child'],
  } as Logger

  return { logger, infoMock }
}

const ensureRaceTable = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meetings (
      meeting_id TEXT PRIMARY KEY,
      meeting_name TEXT NOT NULL,
      country TEXT NOT NULL,
      race_type TEXT NOT NULL,
      date DATE NOT NULL,
      track_condition TEXT,
      tote_status TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS races (
      race_id TEXT PRIMARY KEY,
      meeting_id TEXT,
      name TEXT NOT NULL,
      race_number INTEGER,
      start_time TIMESTAMPTZ,
      status TEXT NOT NULL,
      race_date_nz DATE,
      start_time_nz TIME,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

const truncateTestRaces = async (): Promise<void> => {
  await pool.query('DELETE FROM races WHERE race_id LIKE $1', [`${TEST_PREFIX}%`])
}

describe('Scheduler integration', () => {
  beforeAll(async () => {
    await ensureRaceTable()
  })

  beforeEach(async () => {
    vi.resetAllMocks()
    await truncateTestRaces()
  })

  afterEach(async () => {
    await truncateTestRaces()
  })

  afterAll(async () => {
    await truncateTestRaces()
  })

  it('schedules races, updates intervals, and cleans up when statuses change', async () => {
    const races = [
      { raceId: `${TEST_PREFIX}-15m`, offsetMinutes: 20 },
      { raceId: `${TEST_PREFIX}-10m`, offsetMinutes: 10 },
      { raceId: `${TEST_PREFIX}-3m`, offsetMinutes: 3 },
    ] as const

    for (const race of races) {
      const meetingId = `${race.raceId}-meeting`

      await pool.query(
        `
          INSERT INTO meetings (
            meeting_id,
            meeting_name,
            country,
            race_type,
            date,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (meeting_id) DO NOTHING
        `,
        [
          meetingId,
          `Meeting ${race.raceId}`,
          'NZ',
          'thoroughbred',
          baseTime,
          'active',
        ],
      )

      await pool.query(
        `
          INSERT INTO races (race_id, meeting_id, name, race_number, start_time, status)
          VALUES ($1, $2, $3, $4, $5, 'open')
          ON CONFLICT (race_id) DO UPDATE SET
            meeting_id = EXCLUDED.meeting_id,
            name = EXCLUDED.name,
            race_number = EXCLUDED.race_number,
            start_time = EXCLUDED.start_time,
            status = EXCLUDED.status
        `,
        [
          race.raceId,
          meetingId,
          `Race ${race.raceId}`,
          1,
          new Date(baseTime.getTime() + race.offsetMinutes * 60 * 1000),
        ],
      )
    }

    let currentTime = baseTime

    const scheduledIntervals = new Map<
      number,
      { interval: number; handler: () => void }
    >()
    let nextTimerId = 1

    const timers: TimerControls = {
      setInterval: (handler, timeout) => {
        const id = nextTimerId
        nextTimerId += 1
        scheduledIntervals.set(id, { interval: timeout, handler })
        return id as unknown as NodeJS.Timeout
      },
      clearInterval: (handle) => {
        scheduledIntervals.delete(handle as unknown as number)
      },
    }

    const fetchUpcomingRaces: SchedulerDependencies['fetchUpcomingRaces'] = async (now) => {
      const { rows } = await pool.query<{
        raceId: string
        startTime: string
        status: string
      }>(
        `
          SELECT
            race_id AS "raceId",
            start_time AS "startTime",
            status
          FROM races
          WHERE status IN ('upcoming', 'open')
            AND start_time IS NOT NULL
            AND start_time > $1::timestamptz
            AND start_time < ($1::timestamptz + INTERVAL '24 hours')
          ORDER BY start_time ASC
        `,
        [now.toISOString()],
      )

      return rows.map((row) => ({
        raceId: row.raceId,
        startTime: new Date(row.startTime),
        status: row.status,
      }))
    }

    const fetchRaceStatus: SchedulerDependencies['fetchRaceStatus'] = async (raceId) => {
      const { rows } = await pool.query<{ status: string }>(
        'SELECT status FROM races WHERE race_id = $1',
        [raceId],
      )
      return rows[0]?.status ?? null
    }

    const processRaceMock = vi.fn<(raceId: string) => Promise<ProcessResult>>((raceId) =>
      Promise.resolve(createProcessResult(raceId)),
    )

    const { logger, infoMock } = createMockLogger()

    const scheduler = createScheduler(
      {
        fetchUpcomingRaces,
        fetchRaceStatus,
        processRace: processRaceMock,
        logger,
        timers,
        now: () => currentTime,
      },
      { reevaluationIntervalMs: 60_000 },
    )

    scheduler.start()
    await waitForCondition(() => scheduledIntervals.size >= 4)

    const intervalEntries = Array.from(scheduledIntervals.entries())
    const reevaluationEntryId = Math.max(...intervalEntries.map(([id]) => id))
    const raceEntries = intervalEntries.filter(([id]) => id !== reevaluationEntryId)

    const intervals = raceEntries.map(([, entry]) => entry.interval).sort((a, b) => a - b)
    expect(intervals).toEqual([15_000, 30_000, 60_000])

    const schedulerWithExecute = scheduler as unknown as {
      executeRace: (raceId: string) => Promise<void>
    }

    processRaceMock.mockClear()
    await schedulerWithExecute.executeRace(`${TEST_PREFIX}-3m`)
    expect(processRaceMock).toHaveBeenCalledWith(`${TEST_PREFIX}-3m`)

    processRaceMock.mockClear()
    await schedulerWithExecute.executeRace(`${TEST_PREFIX}-10m`)
    expect(processRaceMock).toHaveBeenCalledWith(`${TEST_PREFIX}-10m`)

    processRaceMock.mockClear()
    await schedulerWithExecute.executeRace(`${TEST_PREFIX}-15m`)
    expect(processRaceMock).toHaveBeenCalledWith(`${TEST_PREFIX}-15m`)

    infoMock.mockClear()
    currentTime = new Date(baseTime.getTime() + 6 * 60 * 1000)
    await scheduler.evaluateNow()
    expect(
      infoMock.mock.calls.some(
        ([payload, message]) =>
          (payload as { event?: string; raceId?: string; newIntervalMs?: number }).event ===
            'scheduler_interval_changed' &&
          (payload as { event?: string; raceId?: string; newIntervalMs?: number }).raceId ===
            `${TEST_PREFIX}-10m` &&
          (payload as { event?: string; raceId?: string; newIntervalMs?: number }).newIntervalMs ===
            15_000 &&
          message === 'Polling interval updated',
      ),
    ).toBe(true)

    currentTime = new Date(baseTime.getTime() + 5 * 60 * 1000)
    await scheduler.evaluateNow()

    const stateAfterStart = scheduler.getState()
    expect(
      stateAfterStart.activeRaces.some((race) => race.raceId === `${TEST_PREFIX}-3m`),
    ).toBe(true)

    await pool.query('UPDATE races SET status = $2 WHERE race_id = $1', [
      `${TEST_PREFIX}-3m`,
      'final',
    ])

    currentTime = new Date(baseTime.getTime() + 30 * 60 * 1000)
    await scheduler.evaluateNow()

    const finalState = scheduler.getState()
    expect(finalState.activeRaces.some((race) => race.raceId === `${TEST_PREFIX}-3m`)).toBe(false)

    await scheduler.stop()
    expect(scheduledIntervals.size).toBe(0)
  })
})
