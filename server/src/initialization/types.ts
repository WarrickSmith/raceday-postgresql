/* eslint-disable @typescript-eslint/naming-convention */
import type { Logger } from 'pino'
import type { MeetingData, RaceData } from '../clients/nztab-types.js'
import type { fetchRaceData } from '../clients/nztab.js'
import type {
  TransformedEntrant,
  TransformedMeeting,
} from '../workers/messages.js'
import type {
  bulkUpsertEntrants,
  bulkUpsertMeetings,
  bulkUpsertRaces,
} from '../database/bulk-upsert.js'

export interface InitializationRunOptions {
  reason?: string
  referenceDate?: Date
}

export interface InitializationStats {
  meetingsFetched: number
  meetingsWritten: number
  racesFetched: number
  racesCreated: number
  entrantsPopulated: number
  failedMeetings: string[]
  failedRaces: string[]
  retries: number
  durationMs: number
}

export interface InitializationResult {
  success: boolean
  startedAt: Date
  completedAt: Date
  stats: InitializationStats
  error?: Error
}

export interface MeetingFetchDependencies {
  fetchMeetingsForDate: (
    date: string
  ) => Promise<MeetingData[]>
}

export interface DailyInitializationDependencies {
  logger: Logger
  now: () => Date
  wait: (ms: number) => Promise<void>
  fetchMeetingsForDate: (
    date: string
  ) => Promise<MeetingData[]>
  fetchRacesForMeeting: (
    meeting: MeetingData
  ) => Promise<{
    races: Awaited<ReturnType<typeof fetchRaceData>>[]
    failedRaceIds: string[]
  }>
  transformMeetings: (
    meetings: MeetingData[]
  ) => TransformedMeeting[]
  transformRaces: (
    races: RaceData[]
  ) => {
    meetings: TransformedMeeting[]
    races: {
      race_id: string
      name: string
      status: 'open' | 'closed' | 'interim' | 'final' | 'abandoned'
      race_number: number | null
      race_date_nz: string
      start_time_nz: string
      meeting_id: string | null
    }[]
    entrants: TransformedEntrant[]
  }
  upsertMeetings: typeof bulkUpsertMeetings
  upsertRaces: typeof bulkUpsertRaces
  upsertEntrants: typeof bulkUpsertEntrants
}

export interface DailyInitializationSchedulerOptions {
  timezone?: string
  morningCronExpression?: string
  eveningCronExpression?: string | null
  runOnStartup?: boolean
  timeoutMs?: number
  logger?: Logger
  task?: (options?: InitializationRunOptions) => Promise<InitializationResult>
}

export interface DailyInitializationSchedulerHandle {
  stop: () => Promise<void>
  runNow: (reason?: string) => Promise<InitializationResult>
  isRunning: () => boolean
  initialRunPromise?: Promise<InitializationResult>
}
