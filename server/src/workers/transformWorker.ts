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
  const transformedAt = new Date().toISOString()

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

  // Extract pool totals from payload for money flow calculations (AC3)
  const poolData: PoolData = {
    winPoolTotal: payload.pools?.winPool ?? 0,
    placePoolTotal: payload.pools?.placePool ?? 0,
    totalRacePool: payload.pools?.totalPool ?? 0,
  }

  // Calculate time metadata for this polling cycle (AC5)
  // Construct race start datetime from date and time fields
  // start_time_nz already includes timezone info (e.g., "15:59:00 NZDT")
  // so we just need to combine date and time without adding extra timezone info
  const raceStartDatetime = `${payload.race_date_nz}T${payload.start_time_nz}`
  const timeMetadata = calculateTimeMetadata(raceStartDatetime, transformedAt)

  // Transform entrants with money flow calculations (AC2, AC3, AC6)
  const transformedEntrants: TransformedEntrant[] = []
  const moneyFlowRecords: MoneyFlowRecord[] = []

  if (Array.isArray(payload.entrants) && payload.entrants.length > 0) {
    for (const entrant of payload.entrants) {
      // Build transformed entrant with base fields
      const transformedEntrant: TransformedEntrant = {
        entrant_id: entrant.entrantId,
        race_id: payload.id,
        runner_number: entrant.runnerNumber,
        name: entrant.name,
        barrier: entrant.barrier ?? null,
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
  const poolFieldCount =
    payload.pools == null
      ? 0
      : Object.values(payload.pools).filter((value) => value != null).length

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
