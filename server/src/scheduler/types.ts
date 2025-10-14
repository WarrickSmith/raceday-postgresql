import type { Logger } from 'pino'
import type { ProcessResult } from '../pipeline/race-processor.js'

export interface RaceRow {
  raceId: string
  startTime: Date
  status: string
}

export interface SchedulerOptions {
  reevaluationIntervalMs?: number
}

export interface TimerControls {
  setInterval: (handler: () => void, timeout: number) => NodeJS.Timeout
  clearInterval: (handle: NodeJS.Timeout) => void
}

export interface SchedulerDependencies {
  fetchUpcomingRaces: (now: Date) => Promise<RaceRow[]>
  fetchRaceStatus: (raceId: string) => Promise<string | null>
  processRace: (raceId: string) => Promise<ProcessResult>
  logger: Logger
  timers?: TimerControls
  now?: () => Date
}

export interface RaceScheduleSnapshot {
  raceId: string
  intervalMs: number
  pollsExecuted: number
  startTime: string
  status: string
}

export interface SchedulerState {
  isRunning: boolean
  activeRaces: RaceScheduleSnapshot[]
}
