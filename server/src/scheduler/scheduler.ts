import type { ProcessResult } from '../pipeline/race-processor.js'
import { calculatePollingInterval } from './interval.js'
import type {
  RaceRow,
  RaceScheduleSnapshot,
  SchedulerDependencies,
  SchedulerOptions,
  SchedulerState,
  TimerControls,
} from './types.js'

const DEFAULT_REEVALUATION_INTERVAL_MS = 60_000

type CleanupReason = 'race_started' | 'status_change' | 'shutdown'

interface ScheduledRace {
  handle: NodeJS.Timeout
  intervalMs: number
  startTime: Date
  status: string
  pollsExecuted: number
  isProcessing: boolean
}

const defaultTimers: TimerControls = {
  setInterval: (handler, timeout) => setInterval(handler, timeout),
  clearInterval: (handle) => {
    clearInterval(handle)
  },
}

const defaultNow = (): Date => new Date()

const TERMINAL_STATUSES = new Set(['final', 'abandoned', 'closed'])

export class RaceScheduler {
  private readonly deps: SchedulerDependencies
  private readonly timers: TimerControls
  private readonly now: () => Date
  private readonly reevaluationIntervalMs: number
  private readonly activeRaces = new Map<string, ScheduledRace>()

  private reevaluationHandle?: NodeJS.Timeout
  private running = false
  private evaluating = false

  constructor(deps: SchedulerDependencies, options: SchedulerOptions = {}) {
    this.deps = deps
    this.timers = deps.timers ?? defaultTimers
    this.now = deps.now ?? defaultNow
    this.reevaluationIntervalMs =
      options.reevaluationIntervalMs ?? DEFAULT_REEVALUATION_INTERVAL_MS
  }

  start(): void {
    if (this.running) {
      return
    }

    this.running = true
    void this.runEvaluation()
    this.reevaluationHandle = this.timers.setInterval(
      () => {
        void this.runEvaluation()
      },
      this.reevaluationIntervalMs,
    )
  }

  async evaluateNow(): Promise<void> {
    await this.runEvaluation()
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return
    }

    this.running = false

    if (this.reevaluationHandle !== undefined) {
      this.timers.clearInterval(this.reevaluationHandle)
      this.reevaluationHandle = undefined
    }

    await this.clearAllSchedules('shutdown')
  }

  getState(): SchedulerState {
    const snapshots: RaceScheduleSnapshot[] = []
    for (const [raceId, entry] of this.activeRaces.entries()) {
      snapshots.push({
        raceId,
        intervalMs: entry.intervalMs,
        pollsExecuted: entry.pollsExecuted,
        startTime: entry.startTime.toISOString(),
        status: entry.status,
      })
    }

    return {
      isRunning: this.running,
      activeRaces: snapshots,
    }
  }

  private async runEvaluation(): Promise<void> {
    if (!this.running || this.evaluating) {
      return
    }

    this.evaluating = true
    const evaluationStartedAt = this.now()

    try {
      const upcomingRaces = await this.deps.fetchUpcomingRaces(evaluationStartedAt)
      const seenRaceIds = new Set<string>()

      for (const race of upcomingRaces) {
        seenRaceIds.add(race.raceId)
        await this.upsertRaceSchedule(race, evaluationStartedAt)
      }

      for (const raceId of Array.from(this.activeRaces.keys())) {
        if (seenRaceIds.has(raceId)) {
          continue
        }

        const entry = this.activeRaces.get(raceId)
        if (entry === undefined) {
          continue
        }

        try {
          const latestStatus = await this.deps.fetchRaceStatus(raceId)

          if (latestStatus === null) {
            await this.cleanUpRace(raceId, 'status_change')
            continue
          }

          entry.status = latestStatus

          if (TERMINAL_STATUSES.has(latestStatus)) {
            await this.cleanUpRace(raceId, 'status_change')
          }
        } catch (err) {
          this.deps.logger.error(
            { err, raceId },
            'Failed to refresh race status during evaluation',
          )
        }
      }
    } catch (err) {
      this.deps.logger.error({ err }, 'Scheduler evaluation failed')
    } finally {
      this.evaluating = false
    }
  }

  private async upsertRaceSchedule(race: RaceRow, evaluationReference: Date): Promise<void> {
    const timeToStartSeconds = Math.floor(
      (race.startTime.getTime() - evaluationReference.getTime()) / 1000,
    )
    const intervalMs = calculatePollingInterval(timeToStartSeconds)

    const existing = this.activeRaces.get(race.raceId)

    if (intervalMs === 0) {
      if (existing !== undefined) {
        await this.cleanUpRace(race.raceId, 'race_started')
      }
      return
    }

    if (existing === undefined) {
      this.scheduleRace(race, intervalMs, timeToStartSeconds)
      return
    }

    existing.startTime = race.startTime
    existing.status = race.status

    if (existing.intervalMs !== intervalMs) {
      this.updateRaceInterval(race, existing, intervalMs, timeToStartSeconds)
    }
  }

  private scheduleRace(
    race: RaceRow,
    intervalMs: number,
    timeToStartSeconds: number,
  ): void {
    const handler = () => {
      void this.executeRace(race.raceId)
    }

    const intervalHandle = this.timers.setInterval(handler, intervalMs)

    this.activeRaces.set(race.raceId, {
      handle: intervalHandle,
      intervalMs,
      startTime: race.startTime,
      status: race.status,
      pollsExecuted: 0,
      isProcessing: false,
    })

    this.deps.logger.info(
      {
        event: 'scheduler_race_scheduled',
        raceId: race.raceId,
        startTime: race.startTime.toISOString(),
        timeToStartSeconds: Math.max(timeToStartSeconds, 0),
        pollingIntervalMs: intervalMs,
      },
      'Race scheduled for polling',
    )
  }

  private updateRaceInterval(
    race: RaceRow,
    entry: ScheduledRace,
    newIntervalMs: number,
    timeToStartSeconds: number,
  ): void {
    this.timers.clearInterval(entry.handle)

    const handler = () => {
      void this.executeRace(race.raceId)
    }

    entry.handle = this.timers.setInterval(handler, newIntervalMs)

    const oldInterval = entry.intervalMs
    entry.intervalMs = newIntervalMs

    this.deps.logger.info(
      {
        event: 'scheduler_interval_changed',
        raceId: race.raceId,
        oldIntervalMs: oldInterval,
        newIntervalMs,
        timeToStartSeconds: Math.max(timeToStartSeconds, 0),
        startTime: race.startTime.toISOString(),
      },
      'Polling interval updated',
    )
  }

  private async executeRace(raceId: string): Promise<void> {
    const entry = this.activeRaces.get(raceId)

    if (entry === undefined) {
      return
    }

    if (entry.isProcessing) {
      this.deps.logger.warn(
        {
          event: 'scheduler_race_skip',
          raceId,
          reason: 'poll_in_flight',
        },
        'Skipping poll because previous execution still in progress',
      )
      return
    }

    entry.isProcessing = true

    try {
      const result = await this.deps.processRace(raceId)
      this.handleProcessResult(result, entry)
    } catch (err) {
      this.deps.logger.error({ err, raceId }, 'Race processing failed')
    } finally {
      entry.isProcessing = false
    }
  }

  private handleProcessResult(result: ProcessResult, entry: ScheduledRace): void {
    entry.pollsExecuted += 1

    this.deps.logger.debug(
      {
        event: 'scheduler_race_polled',
        raceId: result.raceId,
        pollCount: entry.pollsExecuted,
        timings: result.timings,
        success: result.success,
      },
      'Race processed by scheduler',
    )
  }

  private async cleanUpRace(raceId: string, reason: CleanupReason): Promise<void> {
    const entry = this.activeRaces.get(raceId)

    if (entry === undefined) {
      return
    }

    this.timers.clearInterval(entry.handle)
    this.activeRaces.delete(raceId)

    let finalStatus: string | null = null

    if (reason !== 'shutdown') {
      try {
        finalStatus = await this.deps.fetchRaceStatus(raceId)
      } catch (err) {
        this.deps.logger.error({ err, raceId }, 'Failed to fetch final race status')
      }
    }

    this.deps.logger.info(
      {
        event: 'scheduler_race_completed',
        raceId,
        reason,
        finalStatus: finalStatus ?? entry.status,
        totalPolls: entry.pollsExecuted,
        lastIntervalMs: entry.intervalMs,
      },
      'Race polling completed',
    )
  }

  private async clearAllSchedules(reason: CleanupReason): Promise<void> {
    const raceIds = Array.from(this.activeRaces.keys())
    for (const raceId of raceIds) {
      await this.cleanUpRace(raceId, reason)
    }
  }
}
