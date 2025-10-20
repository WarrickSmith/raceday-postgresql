/* eslint-disable @typescript-eslint/naming-convention */
import { fetchMeetingsForDate, fetchRaceData } from '../clients/nztab.js'
import {
  bulkUpsertEntrants,
  bulkUpsertMeetings,
  bulkUpsertRaces,
} from '../database/bulk-upsert.js'
import { logger } from '../shared/logger.js'
import type {
  DailyInitializationDependencies,
  InitializationResult,
  InitializationRunOptions,
  InitializationStats,
} from './types.js'
import type { MeetingData, RaceData } from '../clients/nztab-types.js'
import type {
  TransformedEntrant,
  TransformedMeeting,
} from '../workers/messages.js'

const NZ_TIMEZONE = 'Pacific/Auckland'
const MAX_RACE_CONCURRENCY = 5
type RacePayload = Awaited<ReturnType<typeof fetchRaceData>>

const defaultWait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const defaultDependencies: DailyInitializationDependencies = {
  logger,
  now: () => new Date(),
  wait: defaultWait,
  fetchMeetingsForDate: async (date: string) => fetchMeetingsForDate(date),
  fetchRacesForMeeting: async (meeting) =>
    fetchRacesForMeetingDefault(meeting, logger),
  transformMeetings: (meetings: MeetingData[]): TransformedMeeting[] =>
    meetings
      .map(transformMeeting)
      .filter((meeting): meeting is TransformedMeeting => meeting !== null),
  transformRaces: (payloads: RaceData[]) => transformRacesForBaseline(payloads),
  upsertMeetings: bulkUpsertMeetings,
  upsertRaces: bulkUpsertRaces,
  upsertEntrants: bulkUpsertEntrants,
}

const getNzDateString = (reference: Date): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: NZ_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  return formatter.format(reference)
}

const transformMeeting = (meeting: MeetingData): TransformedMeeting | null => {
  const meetingDate = new Date(meeting.date)
  const trackCondition =
    typeof meeting.track_condition === 'string' &&
    meeting.track_condition.trim() !== ''
      ? meeting.track_condition
      : null
  const toteStatus =
    typeof meeting.tote_status === 'string' && meeting.tote_status.trim() !== ''
      ? meeting.tote_status
      : null

  // Map NZ TAB category codes to database enum values
  // T = thoroughbred, H = harness, G = greyhounds
  // Currently only 'thoroughbred' and 'harness' are supported in the database
  const categoryMap: Record<string, 'thoroughbred' | 'harness'> = {
    T: 'thoroughbred',
    H: 'harness',
    thoroughbred: 'thoroughbred',
    harness: 'harness',
    // Note: 'G' (greyhounds) is not currently supported in the database schema
  }

  const mappedCategory = categoryMap[meeting.category]
  if (mappedCategory === undefined) {
    logger.warn(
      {
        meetingId: meeting.meeting,
        category: meeting.category,
        event: 'unsupported_category',
      },
      'Meeting category not supported in database schema, skipping meeting'
    )
    // Skip this meeting by returning null
    return null
  }

  return {
    meeting_id: meeting.meeting,
    name: meeting.name,
    date: Number.isNaN(meetingDate.getTime())
      ? getNzDateString(new Date())
      : meetingDate.toISOString().slice(0, 10),
    country: meeting.country,
    category: mappedCategory,
    track_condition: trackCondition,
    tote_status: toteStatus,
  }
}

const normalizeStartTimeNz = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    return '00:00:00'
  }

  const trimmed = value.trim()
  const pattern = /(\d{1,2}:\d{2}(?::\d{2})?)/
  const execMatch = pattern.exec(trimmed)
  const time = execMatch?.[1] ?? trimmed
  const parts = time.split(':')

  if (parts.length >= 2) {
    const [part0 = '00', part1 = '00'] = parts
    const isValidPart = (part: string): boolean => part.length > 0
    const formattedPart0 = isValidPart(part0) ? part0 : '00'
    const formattedPart1 = isValidPart(part1) ? part1 : '00'
    return `${formattedPart0.padStart(2, '0')}:${formattedPart1.padStart(2, '0')}`
  }

  return '00:00'
}

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

interface NormalizedRaceForUpsert {
  race_id: string
  meeting_id: string | null
  name: string
  race_number: number | null
  race_date_nz: string
  start_time_nz: string
  status: 'open' | 'closed' | 'interim' | 'final' | 'abandoned'
}

const transformEntrantForBaseline = (
  raceId: string,
  entrantRaw: unknown
): TransformedEntrant | null => {
  if (entrantRaw == null || typeof entrantRaw !== 'object') {
    logger.debug({
      raceId,
      event: 'transform_entrant_invalid_input',
      inputType: typeof entrantRaw,
      input: entrantRaw,
    })
    return null
  }

  const entrant = entrantRaw as Record<string, unknown>
  const entrantId = entrant.entrantId ?? entrant.entrant_id
  const runnerNumber = entrant.runnerNumber ?? entrant.runner_number
  const name = entrant.name ?? entrant.runner_name

  // Log field availability for debugging
  logger.debug({
    raceId,
    event: 'transform_entrant_fields',
    availableFields: Object.keys(entrant),
    hasEntrantId: typeof entrantId === 'string' && entrantId.trim() !== '',
    hasRunnerNumber: typeof runnerNumber !== 'undefined',
    hasName: typeof name === 'string' && name.trim() !== '',
   entrantId,
    runnerNumber,
    name,
  })

  // Generate fallback entrantId if missing or empty
  const finalEntrantId =
    typeof entrantId === 'string' && entrantId.trim() !== ''
      ? entrantId.trim()
      : `${raceId}-entrant-${String(Date.now())}-${Math.random().toString(36).slice(2, 11)}`

  const runnerNumberValue =
    typeof runnerNumber === 'number'
      ? runnerNumber
      : typeof runnerNumber === 'string'
        ? Number.parseInt(runnerNumber, 10)
        : NaN

  // Use fallback runner number if parsing fails
  const finalRunnerNumber = Number.isFinite(runnerNumberValue) ? runnerNumberValue : 0

  return {
    entrant_id: finalEntrantId,
    race_id: raceId,
    runner_number: finalRunnerNumber,
    name:
      typeof name === 'string' && name.trim() !== ''
        ? name
        : `Runner ${String(finalRunnerNumber)}`,
    barrier: toNumberOrNull(entrant.barrier ?? entrant.barrier_number),
    is_scratched: Boolean(entrant.isScratched ?? entrant.is_scratched ?? false),
    is_late_scratched:
      typeof entrant.isLateScratched === 'boolean'
        ? entrant.isLateScratched
        : typeof entrant.is_late_scratched === 'boolean'
          ? entrant.is_late_scratched
          : null,
    fixed_win_odds: toNumberOrNull(
      entrant.fixedWinOdds ?? entrant.fixed_win_odds
    ),
    fixed_place_odds: toNumberOrNull(
      entrant.fixedPlaceOdds ?? entrant.fixed_place_odds
    ),
    pool_win_odds: toNumberOrNull(entrant.poolWinOdds ?? entrant.pool_win_odds),
    pool_place_odds: toNumberOrNull(
      entrant.poolPlaceOdds ?? entrant.pool_place_odds
    ),
    hold_percentage: toNumberOrNull(
      entrant.holdPercentage ?? entrant.hold_percentage
    ),
    bet_percentage: toNumberOrNull(
      entrant.betPercentage ?? entrant.bet_percentage
    ),
    win_pool_percentage: toNumberOrNull(
      entrant.winPoolPercentage ?? entrant.win_pool_percentage
    ),
    place_pool_percentage: toNumberOrNull(
      entrant.placePoolPercentage ?? entrant.place_pool_percentage
    ),
    win_pool_amount: toNumberOrNull(
      entrant.winPoolAmount ?? entrant.win_pool_amount
    ),
    place_pool_amount: toNumberOrNull(
      entrant.placePoolAmount ?? entrant.place_pool_amount
    ),
    jockey:
      typeof entrant.jockey === 'string'
        ? entrant.jockey
        : typeof entrant.jockeyName === 'string'
          ? entrant.jockeyName
          : typeof entrant.jockey_name === 'string'
            ? entrant.jockey_name
            : null,
    trainer_name:
      typeof entrant.trainerName === 'string'
        ? entrant.trainerName
        : typeof entrant.trainer_name === 'string'
          ? entrant.trainer_name
          : null,
    silk_colours:
      typeof entrant.silkColours === 'string'
        ? entrant.silkColours
        : typeof entrant.silk_colours === 'string'
          ? entrant.silk_colours
          : null,
    favourite:
      typeof entrant.favourite === 'boolean'
        ? entrant.favourite
        : typeof entrant.isFavourite === 'boolean'
          ? entrant.isFavourite
          : null,
    mover:
      typeof entrant.mover === 'boolean'
        ? entrant.mover
        : typeof entrant.isMover === 'boolean'
          ? entrant.isMover
          : null,
  }
}

const fetchRacesForMeetingDefault = async (
  meeting: MeetingData,
  log: typeof logger
): Promise<{
  races: RacePayload[]
  failedRaceIds: string[]
}> => {
  const raceSummaries = meeting.races ?? []

  if (raceSummaries.length === 0) {
    return { races: [], failedRaceIds: [] }
  }

  log.info({
    event: 'fetch_meeting_races_start',
    meetingId: meeting.meeting,
    raceCount: raceSummaries.length,
  })

  const races: RacePayload[] = []
  const failedRaceIds: string[] = []

  for (
    let index = 0;
    index < raceSummaries.length;
    index += MAX_RACE_CONCURRENCY
  ) {
    const batch = raceSummaries.slice(index, index + MAX_RACE_CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map((race) => fetchRaceData(race.id, race.status ?? undefined))
    )

    results.forEach((result, batchIndex) => {
      const raceId = batch[batchIndex]?.id ?? 'unknown-race-id'

      if (result.status === 'fulfilled') {
        races.push(result.value)
        return
      }

      failedRaceIds.push(raceId)
      log.warn(
        {
          event: 'fetch_meeting_race_failed',
          meetingId: meeting.meeting,
          raceId,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        },
        'Failed to fetch race data; continuing with remaining races'
      )
    })
  }

  log.info({
    event: 'fetch_meeting_races_complete',
    meetingId: meeting.meeting,
    fetchedRaces: races.length,
    failedRaceIds,
  })

  return { races, failedRaceIds }
}

const isMeetingData = (value: unknown): value is MeetingData => {
  if (value == null || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.meeting === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.date === 'string' &&
    typeof candidate.country === 'string' &&
    typeof candidate.category === 'string'
  )
}

const normalizeRaceStatus = (
  status: unknown
): NormalizedRaceForUpsert['status'] => {
  const allowed: NormalizedRaceForUpsert['status'][] = [
    'open',
    'closed',
    'interim',
    'final',
    'abandoned',
  ]

  if (typeof status === 'string') {
    const normalized = status.toLowerCase()
    if ((allowed as readonly string[]).includes(normalized)) {
      return normalized as NormalizedRaceForUpsert['status']
    }
  }

  return 'open'
}

const transformRacesForBaseline = (
  racePayloads: RacePayload[]
): {
  meetings: TransformedMeeting[]
  races: NormalizedRaceForUpsert[]
  entrants: TransformedEntrant[]
} => {
  const meetingsMap = new Map<string, TransformedMeeting>()
  const races: NormalizedRaceForUpsert[] = []
  const entrants: TransformedEntrant[] = []

  let totalApiEntrants = 0
  let transformedEntrants = 0
  let failedTransformations = 0

  for (const race of racePayloads) {
    if (isMeetingData(race.meeting)) {
      const transformedMeeting = transformMeeting(race.meeting)
      if (transformedMeeting !== null) {
        meetingsMap.set(race.meeting.meeting, transformedMeeting)
      }
    }

    const meetingId =
      typeof race.meeting_id === 'string'
        ? race.meeting_id
        : isMeetingData(race.meeting)
          ? race.meeting.meeting
          : null

    races.push({
      race_id: race.id,
      meeting_id: meetingId,
      name: race.name,
      race_number:
        typeof race.race_number === 'number'
          ? race.race_number
          : typeof race.race_number === 'string'
            ? Number.parseInt(race.race_number, 10)
            : null,
      race_date_nz: race.race_date_nz,
      start_time_nz: normalizeStartTimeNz(race.start_time_nz),
      status: normalizeRaceStatus(race.status),
    })

    if (Array.isArray(race.entrants)) {
      totalApiEntrants += race.entrants.length

      logger.info({
        raceId: race.id,
        event: 'transform_race_entrants_start',
        apiEntrantsCount: race.entrants.length,
      })

      for (const entrant of race.entrants) {
        const transformedEntrant = transformEntrantForBaseline(race.id, entrant)
        if (transformedEntrant != null) {
          entrants.push(transformedEntrant)
          transformedEntrants++
        } else {
          failedTransformations++
        }
      }
    } else {
      logger.warn({
        raceId: race.id,
        event: 'transform_race_no_entrants',
        entrantsPresent: Array.isArray(race.entrants),
        entrantsCount: Array.isArray(race.entrants) ? race.entrants.length : 0,
      })
    }
  }

  logger.info({
    event: 'transform_races_complete',
    totalRaces: racePayloads.length,
    totalApiEntrants,
    transformedEntrants,
    failedTransformations,
    successRate: totalApiEntrants > 0 ? `${(transformedEntrants / totalApiEntrants * 100).toFixed(1)}%` : '0%',
  })

  return {
    meetings: Array.from(meetingsMap.values()),
    races,
    entrants,
  }
}

export const createDailyBaselineInitializer = (
  dependencies: DailyInitializationDependencies
) => {
  const deps = dependencies

  const run = async (
    options?: InitializationRunOptions
  ): Promise<InitializationResult> => {
    const startedAt = deps.now()
    const referenceDate = options?.referenceDate ?? startedAt
    const nzDate = getNzDateString(referenceDate)

    deps.logger.info({
      event: 'daily_initialization_run_start',
      reason: options?.reason ?? 'unspecified',
      nzDate,
    })

    try {
      deps.logger.info({
        event: 'daily_initialization_fetch_meetings_start',
        nzDate,
      })

      const meetings = await deps.fetchMeetingsForDate(nzDate)

      deps.logger.info({
        event: 'daily_initialization_fetch_meetings_complete',
        nzDate,
        meetingsCount: meetings.length,
      })

      const transformedMeetings = deps.transformMeetings(meetings)

      deps.logger.info({
        event: 'daily_initialization_transform_meetings_complete',
        nzDate,
        transformedCount: transformedMeetings.length,
        skippedCount: meetings.length - transformedMeetings.length,
      })

      const meetingWrite = await deps.upsertMeetings(transformedMeetings)

      deps.logger.info({
        event: 'daily_initialization_upsert_meetings_complete',
        nzDate,
        rowCount: meetingWrite.rowCount,
        duration: meetingWrite.duration,
      })

      let totalRacesFetched = 0
      let totalRetryCount = 0
      const failedRaceIds: string[] = []
      const failedMeetingIds = new Set<string>()
      const racePayloads: RacePayload[] = []

      for (const meeting of meetings) {
        const { races, failedRaceIds: meetingFailures } =
          await deps.fetchRacesForMeeting(meeting)
        racePayloads.push(...races)
        totalRacesFetched += races.length
        failedRaceIds.push(...meetingFailures)

        if (meetingFailures.length > 0) {
          totalRetryCount += meetingFailures.length
          failedMeetingIds.add(meeting.meeting)
          await deps.wait(Math.min(1000, 100 * meetingFailures.length))
        }
      }

      const { races: normalizedRaces, entrants: normalizedEntrants } =
        deps.transformRaces(racePayloads as RaceData[])

      deps.logger.info({
        event: 'daily_initialization_transform_races_complete',
        nzDate,
        racesCount: normalizedRaces.length,
        entrantsCount: normalizedEntrants.length,
      })

      let racesWritten = 0
      if (normalizedRaces.length > 0) {
        const raceWrite = await deps.upsertRaces(normalizedRaces)
        racesWritten = raceWrite.rowCount

        deps.logger.info({
          event: 'daily_initialization_upsert_races_complete',
          nzDate,
          rowCount: raceWrite.rowCount,
          duration: raceWrite.duration,
        })
      }

      let entrantsWritten = 0
      if (normalizedEntrants.length > 0) {
        const entrantWrite = await deps.upsertEntrants(normalizedEntrants)
        entrantsWritten = entrantWrite.rowCount

        deps.logger.info({
          event: 'daily_initialization_upsert_entrants_complete',
          nzDate,
          rowCount: entrantWrite.rowCount,
          duration: entrantWrite.duration,
        })
      }

      const completedAt = deps.now()
      const stats: InitializationStats = {
        meetingsFetched: meetings.length,
        meetingsWritten: meetingWrite.rowCount,
        racesFetched: totalRacesFetched,
        racesCreated: racesWritten,
        entrantsPopulated: entrantsWritten,
        failedMeetings: Array.from(failedMeetingIds),
        failedRaces: failedRaceIds,
        retries: totalRetryCount,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      }

      deps.logger.info({
        event: 'daily_initialization_run_complete',
        reason: options?.reason ?? 'unspecified',
        stats,
      })

      return {
        success: true,
        startedAt,
        completedAt,
        stats,
      }
    } catch (error: unknown) {
      const completedAt = deps.now()
      const stats: InitializationStats = {
        meetingsFetched: 0,
        meetingsWritten: 0,
        racesFetched: 0,
        racesCreated: 0,
        entrantsPopulated: 0,
        failedMeetings: [],
        failedRaces: [],
        retries: 0,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      }

      deps.logger.error(
        {
          event: 'daily_initialization_run_failed',
          reason: options?.reason ?? 'unspecified',
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: String(error) },
          stats,
        },
        'Daily baseline initialization failed'
      )

      return {
        success: false,
        startedAt,
        completedAt,
        stats,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }

  return { run }
}

export async function runDailyBaselineInitialization(
  options?: InitializationRunOptions
): Promise<InitializationResult> {
  const initializer = createDailyBaselineInitializer(defaultDependencies)
  return initializer.run(options)
}
