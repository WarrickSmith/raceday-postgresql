import { randomUUID } from 'node:crypto'
import { parentPort } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import {
  workerRequestSchema,
  createWorkerErrorMessage,
  createWorkerSuccessMessage,
  transformedRaceSchema,
} from './messages.js'
import type {
  TransformedRace,
  TransformedMeeting,
  TransformedEntrant,
  MoneyFlowRecord,
} from './messages.js'
import type { RaceData } from '../clients/nztab-types.js'
import {
  calculatePoolAmounts,
  calculatePoolPercentages,
  calculateIncrementalDelta,
  calculateTimeMetadata,
  type PoolData,
} from './money-flow.js'
import { extractPoolTotals } from '../utils/race-pools.js'
import { logger } from '../shared/logger.js'

/* eslint-disable @typescript-eslint/naming-convention */

if (parentPort == null) {
  throw new Error('transformWorker must be executed as a worker thread')
}

const port = parentPort

/**
 * Transform raw NZ TAB race data into calculated money flow patterns (AC1-11)
 *
 * Implements per-race, per-entrant money flow calculations producing:
 * - Normalized meeting/race/entrant entities for bulk UPSERT (Story 2.5)
 * - Time-series money flow records for analytics queries
 *
 * Performance target: <1s per race (AC11)
 *
 * @param payload - Validated RaceData from NZ TAB API (Story 2.1/2.2)
 * @returns TransformedRace with calculated fields and time-series records
 */
const transformRace = (payload: RaceData): TransformedRace => {
  // Use the NZ race date for partition routing to ensure records go to correct NZ day partition
  // The NZTAB API provides race_date_nz which is already in NZ timezone
  // We create an ISO timestamp at midnight for this date to preserve the NZ date
  const transformedAt = `${payload.race_date_nz}T00:00:00.000Z`

  // Extract normalized meeting data (AC6)
  const meeting: TransformedMeeting | null =
    payload.meeting != null
      ? {
          meeting_id: payload.meeting.meeting,
          name: payload.meeting.name,
          date: payload.meeting.date,
          country: payload.meeting.country,
          category: payload.meeting.category,
          track_condition: payload.meeting.track_condition,
          tote_status: payload.meeting.tote_status ?? null,
        }
      : null

  // Extract normalized race data (AC6)
  const race = {
    race_id: payload.id,
    name: payload.name,
    status: payload.status,
    race_number: payload.race_number ?? null,
    race_date_nz: payload.race_date_nz,
    start_time_nz: payload.start_time_nz,
    meeting_id: payload.meeting_id ?? null,
  }

  // Extract comprehensive race pools data from NZTAB API (Task 3.2)
  // This must happen BEFORE money flow calculations to provide pool totals
  const racePools = extractPoolTotals(payload as { tote_pools?: unknown }, payload.id)

  // Extract pool totals from racePools for money flow calculations (AC3)
  // racePools values are in cents (from race-pools.ts conversion at lines 152-159)
  // Convert back to dollars for money flow calculations (to match old server logic)
  const poolData: PoolData = {
    winPoolTotal: (racePools?.win_pool_total ?? 0) / 100,
    placePoolTotal: (racePools?.place_pool_total ?? 0) / 100,
    totalRacePool: (racePools?.total_race_pool ?? 0) / 100,
  }

  // Log when pool data is available for money flow calculations
  if (racePools !== null && poolData.totalRacePool > 0) {
    logger.debug({
      raceId: payload.id,
      totalRacePoolDollars: poolData.totalRacePool,
      winPoolTotalDollars: poolData.winPoolTotal,
      placePoolTotalDollars: poolData.placePoolTotal,
    }, 'Pool data available for money flow calculations (in dollars)')
  } else {
    logger.debug({
      raceId: payload.id,
      hasRacePools: racePools !== null,
      totalRacePoolDollars: poolData.totalRacePool,
    }, 'No pool data available for money flow calculations')
  }

  // Calculate time metadata for this polling cycle (AC5)
  // Construct race start datetime from date and time fields
  // start_time_nz includes timezone abbreviation (e.g., "15:59:00 NZDT")
  // Strip the timezone abbreviation to create valid ISO datetime
  const [timeOnly] = payload.start_time_nz.split(' ') // "15:59:00 NZDT" → "15:59:00"
  const raceStartDatetime = `${payload.race_date_nz}T${timeOnly ?? ''}`
  const timeMetadata = calculateTimeMetadata(raceStartDatetime, transformedAt)

  // Transform entrants with money flow calculations (AC2, AC3, AC6)
  const transformedEntrants: TransformedEntrant[] = []
  const moneyFlowRecords: MoneyFlowRecord[] = []

  if (Array.isArray(payload.entrants) && payload.entrants.length > 0) {
    for (const entrant of payload.entrants) {
      // Build transformed entrant with base fields
      // Parse barrier: can be number (e.g., 1) or string (e.g., "Fr1", "Sr2" for mobile starts)
      const parseBarrier = (
        barrierValue: number | string | null | undefined
      ): number | null => {
        if (typeof barrierValue === 'number') {
          return barrierValue
        }
        if (typeof barrierValue === 'string') {
          // Extract numeric part from strings like "Fr1", "Sr2" using RegExp.exec()
          const pattern = /\d+/
          const match = pattern.exec(barrierValue)
          return match !== null ? parseInt(match[0], 10) : null
        }
        return null
      }

      const barrier = parseBarrier(entrant.barrier)

      const transformedEntrant: TransformedEntrant = {
        entrant_id: entrant.entrantId,
        race_id: payload.id,
        runner_number: entrant.runnerNumber,
        name: entrant.name,
        barrier,
        is_scratched: entrant.isScratched ?? false,
        is_late_scratched: entrant.isLateScratched ?? null,
        // Odds snapshot
        fixed_win_odds: entrant.fixedWinOdds ?? null,
        fixed_place_odds: entrant.fixedPlaceOdds ?? null,
        pool_win_odds: entrant.poolWinOdds ?? null,
        pool_place_odds: entrant.poolPlaceOdds ?? null,
        // Money flow fields - will be calculated if data available
        hold_percentage: null,
        bet_percentage: null,
        win_pool_percentage: null,
        place_pool_percentage: null,
        win_pool_amount: null,
        place_pool_amount: null,
        // Metadata
        jockey: entrant.jockey ?? null,
        trainer_name: entrant.trainerName ?? null,
        silk_colours: entrant.silkColours ?? null,
        favourite: entrant.favourite ?? null,
        mover: entrant.mover ?? null,
      }

      // Extract money flow percentages from money_tracker if available (AC3)
      // money_tracker.entrants[] may contain multiple entries per entrant (historical snapshots)
      // Use most recent entry by finding last occurrence of this entrant_id
      let holdPercentage = 0
      let betPercentage = 0

      if (payload.money_tracker?.entrants != null) {
        // Find most recent entry for this entrant (last in array)
        const moneyTrackerEntries = payload.money_tracker.entrants.filter(
          (mt) => mt.entrant_id === entrant.entrantId
        )
        const latestEntry = moneyTrackerEntries[moneyTrackerEntries.length - 1]

        if (latestEntry != null) {
          holdPercentage = latestEntry.hold_percentage
          betPercentage = latestEntry.bet_percentage
        }
      }

      // Calculate pool amounts and percentages if hold_percentage available (AC3, AC4)
      if (holdPercentage > 0 && poolData.totalRacePool > 0) {
        const poolAmounts = calculatePoolAmounts(holdPercentage, poolData)
        const poolPercentages = calculatePoolPercentages(poolAmounts, poolData)

        // Update transformed entrant with calculated fields
        transformedEntrant.hold_percentage = holdPercentage
        transformedEntrant.bet_percentage = betPercentage
        transformedEntrant.win_pool_percentage =
          poolPercentages.win_pool_percentage
        transformedEntrant.place_pool_percentage =
          poolPercentages.place_pool_percentage
        transformedEntrant.win_pool_amount = poolAmounts.winPoolAmount
        transformedEntrant.place_pool_amount = poolAmounts.placePoolAmount

        // Calculate incremental delta (AC4)
        // TODO (Story 2.5): Implement previous bucket query once bulk UPSERT operational
        // Current limitation: Always treats as first bucket (no previous data from DB)
        // This means incrementalAmount = currentPoolAmount (baseline, not delta)
        // Full AC4 compliance requires querying money_flow_history for previous bucket
        // based on entrant_id, race_id, and previous time_interval
        const incrementalDelta = calculateIncrementalDelta(poolAmounts, null)

        // Create money flow time-series record (AC2, AC5)
        const moneyFlowRecord: MoneyFlowRecord = {
          entrant_id: entrant.entrantId,
          race_id: payload.id,
          time_to_start: timeMetadata.time_to_start,
          time_interval: timeMetadata.time_interval,
          interval_type: timeMetadata.interval_type,
          polling_timestamp: transformedAt,
          hold_percentage: holdPercentage,
          bet_percentage: betPercentage,
          win_pool_percentage: poolPercentages.win_pool_percentage,
          place_pool_percentage: poolPercentages.place_pool_percentage,
          win_pool_amount: poolAmounts.winPoolAmount,
          place_pool_amount: poolAmounts.placePoolAmount,
          total_pool_amount: poolAmounts.totalPoolAmount,
          incremental_win_amount: incrementalDelta.incrementalWinAmount,
          incremental_place_amount: incrementalDelta.incrementalPlaceAmount,
          // Odds snapshot at this interval
          fixed_win_odds: entrant.fixedWinOdds ?? null,
          fixed_place_odds: entrant.fixedPlaceOdds ?? null,
          pool_win_odds: entrant.poolWinOdds ?? null,
          pool_place_odds: entrant.poolPlaceOdds ?? null,
        }

        moneyFlowRecords.push(moneyFlowRecord)
      }

      transformedEntrants.push(transformedEntrant)
    }
  }

  const entrantCount = transformedEntrants.length
  const poolFieldCount = racePools !== null ? 1 : 0

  // Return complete TransformedRace payload (AC6)
  return transformedRaceSchema.parse({
    raceId: payload.id,
    raceName: payload.name,
    status: payload.status,
    transformedAt,
    metrics: {
      entrantCount,
      poolFieldCount,
      moneyFlowRecordCount: moneyFlowRecords.length,
    },
    meeting,
    race,
    entrants: transformedEntrants,
    moneyFlowRecords,
    racePools: racePools !== null ? [racePools] : null, // Array to match schema
    originalPayload: payload,
  })
}

port.on('message', (rawMessage) => {
  const startedAt = performance.now()
  const parsedMessage = workerRequestSchema.safeParse(rawMessage)

  if (!parsedMessage.success) {
    const fallbackTaskId =
      typeof rawMessage === 'object' &&
      rawMessage != null &&
      'taskId' in rawMessage &&
      typeof (rawMessage as { taskId?: unknown }).taskId === 'string'
        ? (rawMessage as { taskId: string }).taskId
        : `invalid-${randomUUID()}`

    port.postMessage(
      createWorkerErrorMessage(fallbackTaskId, performance.now() - startedAt, {
        name: 'ValidationError',
        message: parsedMessage.error.message,
        stack: parsedMessage.error.stack,
      })
    )
    return
  }

  const {
    data: { taskId, payload },
  } = parsedMessage

  try {
    const result = transformRace(payload)
    port.postMessage(
      createWorkerSuccessMessage(taskId, performance.now() - startedAt, result)
    )
  } catch (error) {
    const err =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'Unknown worker error')

    port.postMessage(
      createWorkerErrorMessage(taskId, performance.now() - startedAt, {
        name: err.name,
        message: err.message,
        stack: err.stack,
      })
    )
  }
})
