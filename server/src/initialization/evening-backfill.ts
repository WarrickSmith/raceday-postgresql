/* eslint-disable @typescript-eslint/naming-convention */
import { fetchRaceData } from '../clients/nztab.js'
import {
  bulkUpsertEntrants,
  bulkUpsertMeetings,
  bulkUpsertRaces,
} from '../database/bulk-upsert.js'
import { logger } from '../shared/logger.js'
import { pool } from '../database/pool.js'
import type {
  InitializationResult,
  InitializationRunOptions,
  InitializationStats,
} from './types.js'
import type { MeetingData } from '../clients/nztab-types.ts'
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
  // R = thoroughbred, H = harness, G = greyhounds
  // Currently only 'thoroughbred' and 'harness' are supported in the database
  const categoryMap: Record<string, 'thoroughbred' | 'harness'> = {
    R: 'thoroughbred',
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
    return null
  }

  const entrant = entrantRaw as Record<string, unknown>
  const entrantId = entrant.entrantId ?? entrant.entrant_id
  const runnerNumber = entrant.runnerNumber ?? entrant.runner_number
  const name = entrant.name ?? entrant.runner_name

  if (typeof entrantId !== 'string' || entrantId.trim() === '') {
    return null
  }

  const runnerNumberValue =
    typeof runnerNumber === 'number'
      ? runnerNumber
      : typeof runnerNumber === 'string'
        ? Number.parseInt(runnerNumber, 10)
        : NaN

  if (!Number.isFinite(runnerNumberValue)) {
    return null
  }

  return {
    entrant_id: entrantId,
    race_id: raceId,
    runner_number: runnerNumberValue,
    name:
      typeof name === 'string' && name.trim() !== ''
        ? name
        : `Runner ${String(runnerNumberValue)}`,
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
      for (const entrant of race.entrants) {
        const transformedEntrant = transformEntrantForBaseline(race.id, entrant)
        if (transformedEntrant != null) {
          entrants.push(transformedEntrant)
        }
      }
    }
  }

  return {
    meetings: Array.from(meetingsMap.values()),
    races,
    entrants,
  }
}

/**
 * Fetches races that have completed during the day for historical backfill
 * @param nzDate The NZ date to fetch races for (YYYY-MM-DD format)
 * @returns Array of completed race IDs
 */
const fetchCompletedRacesForDay = async (nzDate: string): Promise<string[]> => {
  try {
    const result = await pool.query(
      `SELECT race_id
       FROM races
       WHERE race_date_nz = $1
         AND status IN ('final', 'abandoned')
       ORDER BY start_time_nz ASC`,
      [nzDate]
    )

    return result.rows.map((row: { race_id: string }) => row.race_id)
  } catch (error) {
    logger.error(
      {
        event: 'evening_backfill_fetch_completed_races_failed',
        nzDate,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to fetch completed races for backfill'
    )
    return []
  }
}

/**
 * Fetches comprehensive historical race data for completed races
 * @param raceIds Array of race IDs to fetch historical data for
 * @returns Promise resolving to race data with comprehensive historical information
 */
const fetchHistoricalRaceData = async (
  raceIds: string[]
): Promise<RacePayload[]> => {
  const races: RacePayload[] = []
  const failedRaceIds: string[] = []

  logger.info({
    event: 'evening_backfill_fetch_historical_data_start',
    raceCount: raceIds.length,
  })

  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < raceIds.length; i += MAX_RACE_CONCURRENCY) {
    const batch = raceIds.slice(i, i + MAX_RACE_CONCURRENCY)

    const results = await Promise.allSettled(
      batch.map(async (raceId) => {
        try {
          // Fetch with comprehensive historical data parameters
          return await fetchRaceData(raceId, 'final')
        } catch (error) {
          logger.warn(
            {
              event: 'evening_backfill_fetch_historical_race_failed',
              raceId,
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to fetch historical race data for backfill'
          )
          throw error
        }
      })
    )

    results.forEach((result, index) => {
      const raceId = batch[index]

      if (result.status === 'fulfilled') {
        races.push(result.value)
      } else {
        if (raceId != null) {
          failedRaceIds.push(raceId)
        }
      }
    })

    // Wait between batches to be respectful to the API
    if (i + MAX_RACE_CONCURRENCY < raceIds.length) {
      await defaultWait(500)
    }
  }

  logger.info({
    event: 'evening_backfill_fetch_historical_data_complete',
    requestedRaces: raceIds.length,
    fetchedRaces: races.length,
    failedRaceIds,
  })

  return races
}

/**
 * Runs evening backfill to fetch comprehensive historical data for completed races
 * @param options Initialization options
 * @returns Promise resolving to the initialization result
 */
export async function runEveningBackfill(
  options?: InitializationRunOptions
): Promise<InitializationResult> {
  const startedAt = new Date()
  const nzDate = getNzDateString(startedAt)

  logger.info({
    event: 'evening_backfill_start',
    reason: options?.reason ?? 'unspecified',
    nzDate,
  })

  try {
    // Step 1: Fetch completed races for the day
    logger.info({
      event: 'evening_backfill_fetch_completed_races_start',
      nzDate,
    })

    const completedRaceIds = await fetchCompletedRacesForDay(nzDate)

    logger.info({
      event: 'evening_backfill_fetch_completed_races_complete',
      nzDate,
      completedRacesCount: completedRaceIds.length,
    })

    if (completedRaceIds.length === 0) {
      logger.info({
        event: 'evening_backfill_no_completed_races',
        nzDate,
      })

      const stats: InitializationStats = {
        meetingsFetched: 0,
        meetingsWritten: 0,
        racesFetched: 0,
        racesCreated: 0,
        entrantsPopulated: 0,
        failedMeetings: [],
        failedRaces: [],
        retries: 0,
        durationMs: new Date().getTime() - startedAt.getTime(),
      }

      return {
        success: true,
        startedAt,
        completedAt: new Date(),
        stats,
      }
    }

    // Step 2: Fetch comprehensive historical race data
    logger.info({
      event: 'evening_backfill_fetch_historical_data_start',
      nzDate,
      raceCount: completedRaceIds.length,
    })

    const racePayloads = await fetchHistoricalRaceData(completedRaceIds)

    logger.info({
      event: 'evening_backfill_fetch_historical_data_complete',
      nzDate,
      racesFetched: racePayloads.length,
    })

    // Step 3: Transform and upsert data
    const { meetings, races, entrants } =
      transformRacesForBaseline(racePayloads)

    logger.info({
      event: 'evening_backfill_transform_complete',
      nzDate,
      meetingsCount: meetings.length,
      racesCount: races.length,
      entrantsCount: entrants.length,
    })

    let meetingsWritten = 0
    if (meetings.length > 0) {
      const meetingWrite = await bulkUpsertMeetings(meetings)
      meetingsWritten = meetingWrite.rowCount

      logger.info({
        event: 'evening_backfill_upsert_meetings_complete',
        nzDate,
        rowCount: meetingWrite.rowCount,
        duration: meetingWrite.duration,
      })
    }

    let racesWritten = 0
    if (races.length > 0) {
      const raceWrite = await bulkUpsertRaces(races)
      racesWritten = raceWrite.rowCount

      logger.info({
        event: 'evening_backfill_upsert_races_complete',
        nzDate,
        rowCount: raceWrite.rowCount,
        duration: raceWrite.duration,
      })
    }

    let entrantsWritten = 0
    if (entrants.length > 0) {
      const entrantWrite = await bulkUpsertEntrants(entrants)
      entrantsWritten = entrantWrite.rowCount

      logger.info({
        event: 'evening_backfill_upsert_entrants_complete',
        nzDate,
        rowCount: entrantWrite.rowCount,
        duration: entrantWrite.duration,
      })
    }

    const completedAt = new Date()
    const stats: InitializationStats = {
      meetingsFetched: meetings.length,
      meetingsWritten,
      racesFetched: racePayloads.length,
      racesCreated: racesWritten,
      entrantsPopulated: entrantsWritten,
      failedMeetings: [],
      failedRaces: [],
      retries: 0,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    }

    logger.info({
      event: 'evening_backfill_complete',
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
    const completedAt = new Date()
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

    logger.error(
      {
        event: 'evening_backfill_failed',
        reason: options?.reason ?? 'unspecified',
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
        stats,
      },
      'Evening backfill failed'
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
