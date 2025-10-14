import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createScheduler } from '../../../src/scheduler/index.js'
import type { SchedulerDependencies } from '../../../src/scheduler/types.js'
import type { ProcessResult } from '../../../src/pipeline/race-processor.js'
import type { Logger } from 'pino'

const baseTime = new Date('2025-10-14T00:00:00Z')

/* eslint-disable @typescript-eslint/naming-convention */
const createProcessResult = (raceId: string): ProcessResult => ({
  raceId,
  status: 'success',
  success: true,
  timings: {
    fetch_ms: 10,
    transform_ms: 5,
    write_ms: 7,
    total_ms: 22,
  },
  rowCounts: {
    meetings: 0,
    races: 0,
    entrants: 0,
    moneyFlowHistory: 0,
    oddsHistory: 0,
  },
})
/* eslint-enable @typescript-eslint/naming-convention */

const createMockLogger = (): Logger => {
  const mock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }

  return mock as unknown as Logger
}

describe('RaceScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(baseTime)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('schedules upcoming races with calculated intervals and logs the event', async () => {
    const logger = createMockLogger()

    const fetchUpcomingRaces =
      vi.fn<SchedulerDependencies['fetchUpcomingRaces']>().mockResolvedValue([
        {
          raceId: 'race-1',
          startTime: new Date(baseTime.getTime() + 10 * 60 * 1000),
          status: 'upcoming',
        },
      ])

    const fetchRaceStatus =
      vi.fn<SchedulerDependencies['fetchRaceStatus']>().mockResolvedValue('completed')

    const processRace =
      vi.fn<SchedulerDependencies['processRace']>().mockResolvedValue(createProcessResult('race-1'))

    const scheduler = createScheduler(
      {
        fetchUpcomingRaces,
        fetchRaceStatus,
        processRace,
        logger,
      },
      { reevaluationIntervalMs: 1_000 },
    )

    scheduler.start()
    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.resolve()

    const state = scheduler.getState()
    expect(state.isRunning).toBe(true)
    expect(state.activeRaces).toHaveLength(1)
    expect(state.activeRaces[0]?.intervalMs).toBe(30_000)

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'scheduler_race_scheduled', raceId: 'race-1' }),
      'Race scheduled for polling',
    )

    await scheduler.stop()
  })

  it('updates polling interval as race start approaches and cleans up on removal', async () => {
    const logger = createMockLogger()

    let evaluationCall = 0
    const fetchUpcomingRaces = vi
      .fn<SchedulerDependencies['fetchUpcomingRaces']>()
      .mockImplementation(() => {
        const current = evaluationCall
        evaluationCall += 1

        if (current === 0) {
          return Promise.resolve([
            {
              raceId: 'race-interval',
              startTime: new Date(baseTime.getTime() + 10 * 60 * 1000),
              status: 'upcoming',
            },
          ])
        }

        if (current === 1) {
          return Promise.resolve([
            {
              raceId: 'race-interval',
              startTime: new Date(baseTime.getTime() + 10 * 60 * 1000),
              status: 'open',
            },
          ])
        }

        return Promise.resolve([])
      })

    const fetchRaceStatus =
      vi.fn<SchedulerDependencies['fetchRaceStatus']>().mockResolvedValue('final')

    const processRace =
      vi.fn<SchedulerDependencies['processRace']>().mockResolvedValue(
        createProcessResult('race-interval'),
      )

    const scheduler = createScheduler(
      {
        fetchUpcomingRaces,
        fetchRaceStatus,
        processRace,
        logger,
      },
      { reevaluationIntervalMs: 60_000 },
    )

    scheduler.start()
    await Promise.resolve()

    expect(scheduler.getState().activeRaces[0]?.intervalMs).toBe(30_000)

    vi.setSystemTime(new Date(baseTime.getTime() + 7 * 60 * 1000))
    await vi.advanceTimersByTimeAsync(60_000)
    await Promise.resolve()

    expect(scheduler.getState().activeRaces[0]?.intervalMs).toBe(15_000)

    vi.setSystemTime(new Date(baseTime.getTime() + 25 * 60 * 1000))
    await vi.advanceTimersByTimeAsync(60_000)
    await Promise.resolve()

    expect(fetchRaceStatus).toHaveBeenCalledWith('race-interval')
    expect(scheduler.getState().activeRaces).toHaveLength(0)

    await scheduler.stop()
  })

  it('continues polling races after the advertised start time until terminal status', async () => {
    const logger = createMockLogger()
    const startTime = new Date(baseTime.getTime() + 60_000)
    let evaluationCall = 0

    const fetchUpcomingRaces = vi
      .fn<SchedulerDependencies['fetchUpcomingRaces']>()
      .mockImplementation(() => {
        const call = evaluationCall
        evaluationCall += 1

        if (call === 0) {
          return Promise.resolve([
            {
              raceId: 'race-active',
              startTime,
              status: 'upcoming',
            },
          ])
        }

        return Promise.resolve([])
      })

    const fetchRaceStatus = vi
      .fn<SchedulerDependencies['fetchRaceStatus']>()
      .mockResolvedValueOnce('open')
      .mockResolvedValueOnce('final')
      .mockResolvedValue('final')

    const processRace =
      vi.fn<SchedulerDependencies['processRace']>().mockResolvedValue(
        createProcessResult('race-active'),
      )

    const scheduler = createScheduler(
      {
        fetchUpcomingRaces,
        fetchRaceStatus,
        processRace,
        logger,
      },
      { reevaluationIntervalMs: 30_000 },
    )

    scheduler.start()
    await Promise.resolve()

    const initialState = scheduler.getState()
    expect(initialState.activeRaces).toHaveLength(1)
    expect(initialState.activeRaces[0]?.intervalMs).toBe(15_000)

    vi.setSystemTime(new Date(baseTime.getTime() + 90_000))
    await vi.advanceTimersByTimeAsync(30_000)
    await Promise.resolve()

    const afterStartState = scheduler.getState()
    expect(afterStartState.activeRaces).toHaveLength(1)
    expect(afterStartState.activeRaces[0]?.intervalMs).toBe(15_000)

    const pollsBefore = processRace.mock.calls.length
    await vi.advanceTimersByTimeAsync(15_000)
    await Promise.resolve()
    expect(processRace.mock.calls.length).toBeGreaterThan(pollsBefore)

    vi.setSystemTime(new Date(baseTime.getTime() + 30 * 60 * 1000))
    await vi.advanceTimersByTimeAsync(30_000)
    await Promise.resolve()

    expect(fetchRaceStatus).toHaveBeenCalledWith('race-active')
    expect(scheduler.getState().activeRaces).toHaveLength(0)

    await scheduler.stop()
  })

  it('avoids overlapping polls when a race execution is still running', async () => {
    const logger = createMockLogger()

    const fetchUpcomingRaces =
      vi.fn<SchedulerDependencies['fetchUpcomingRaces']>().mockResolvedValue([
        {
          raceId: 'race-overlap',
          startTime: new Date(baseTime.getTime() + 2 * 60 * 1000),
          status: 'open',
        },
      ])

    const fetchRaceStatus =
      vi.fn<SchedulerDependencies['fetchRaceStatus']>().mockResolvedValue('completed')

    let resolveProcess: ((result: ProcessResult) => void) | undefined
    const processRace =
      vi.fn<SchedulerDependencies['processRace']>().mockImplementation(
        () =>
          new Promise<ProcessResult>((resolve) => {
            resolveProcess = resolve
          }),
      )

    const scheduler = createScheduler(
      {
        fetchUpcomingRaces,
        fetchRaceStatus,
        processRace,
        logger,
      },
      { reevaluationIntervalMs: 1_000 },
    )

    scheduler.start()
    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.resolve()

    await vi.advanceTimersByTimeAsync(15_000)
    expect(processRace).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(processRace).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'scheduler_race_skip', raceId: 'race-overlap' }),
      'Skipping poll because previous execution still in progress',
    )

    if (resolveProcess === undefined) {
      throw new Error('Expected resolveProcess to be set before completing test')
    }
    resolveProcess(createProcessResult('race-overlap'))
    await Promise.resolve()

    await scheduler.stop()
  })
})
