import { z } from 'zod'
import { RaceDataSchema } from '../clients/nztab-types.js'

export const workerRequestSchema = z.object({
  taskId: z.string().uuid(),
  payload: RaceDataSchema,
})

export type WorkerRequest = z.infer<typeof workerRequestSchema>

/**
 * Schema for normalized meeting data in transform output (AC6)
 */
/* eslint-disable @typescript-eslint/naming-convention */
export const transformedMeetingSchema = z.object({
  meeting_id: z.string().min(1),
  name: z.string().min(1),
  date: z.string(), // YYYY-MM-DD
  country: z.string(),
  category: z.string(),
  track_condition: z.string().optional().nullable(),
  tote_status: z.string().optional().nullable(),
})
/* eslint-enable @typescript-eslint/naming-convention */

export type TransformedMeeting = z.infer<typeof transformedMeetingSchema>

/**
 * Schema for transformed entrant with calculated money flow fields (AC3, AC4, AC6)
 * Enhanced with Story 2.10 missing fields from NZTAB API
 */
/* eslint-disable @typescript-eslint/naming-convention */
export const transformedEntrantSchema = z.object({
  entrant_id: z.string().min(1),
  race_id: z.string().min(1),
  runner_number: z.number().int().positive(),
  name: z.string().min(1),
  barrier: z.number().int().positive().optional().nullable(),
  is_scratched: z.boolean(),
  is_late_scratched: z.boolean().optional().nullable(),
  // Odds data
  fixed_win_odds: z.number().optional().nullable(),
  fixed_place_odds: z.number().optional().nullable(),
  pool_win_odds: z.number().optional().nullable(),
  pool_place_odds: z.number().optional().nullable(),
  // Money flow calculated fields (AC3)
  hold_percentage: z.number().optional().nullable(),
  bet_percentage: z.number().optional().nullable(),
  win_pool_percentage: z.number().optional().nullable(),
  place_pool_percentage: z.number().optional().nullable(),
  // Pool amounts in cents
  win_pool_amount: z.number().int().optional().nullable(),
  place_pool_amount: z.number().int().optional().nullable(),
  // Metadata
  jockey: z.string().optional().nullable(),
  trainer_name: z.string().optional().nullable(),
  silk_colours: z.string().optional().nullable(),
  favourite: z.boolean().optional().nullable(),
  mover: z.boolean().optional().nullable(),
  // Story 2.10: Additional fields from NZTAB API
  silk_url_64x64: z.string().optional().nullable(),
  silk_url_128x128: z.string().optional().nullable(),
  scratch_time: z.number().int().optional().nullable(),
  runner_change: z.string().optional().nullable(),
})
/* eslint-enable @typescript-eslint/naming-convention */

export type TransformedEntrant = z.infer<typeof transformedEntrantSchema>

/**
 * Schema for money flow time-series record (AC2, AC4, AC5)
 *
 * **Timestamp Fields:**
 * - `polling_timestamp`: When we polled/transformed the NZTAB API data (system clock, UTC).
 *   Used for partition routing and represents the observation time.
 * - `event_timestamp` (in DB): When the betting event actually occurred (race time context).
 *   Currently set equal to polling_timestamp but semantically represents the race event time.
 *
 * **Note**: For production, consider aligning event_timestamp with race start time
 * or actual betting activity timestamp if available from API for more accurate temporal tracking.
 */
/* eslint-disable @typescript-eslint/naming-convention */
export const moneyFlowRecordSchema = z.object({
  entrant_id: z.string().min(1),
  race_id: z.string().min(1),
  // Time metadata (AC5)
  time_to_start: z.number(), // Minutes until start (negative = after start)
  time_interval: z.number(), // Bucketed interval for aggregation
  interval_type: z.enum(['5m', '2m', '30s', 'live', 'unknown']),
  polling_timestamp: z.string().datetime(), // When we captured this data snapshot from API
  // Money flow data (AC3)
  hold_percentage: z.number(),
  bet_percentage: z.number().optional().nullable(),
  win_pool_percentage: z.number().optional().nullable(),
  place_pool_percentage: z.number().optional().nullable(),
  // Pool amounts in cents
  win_pool_amount: z.number().int(),
  place_pool_amount: z.number().int(),
  total_pool_amount: z.number().int(),
  // Incremental deltas (AC4)
  incremental_win_amount: z.number().int(),
  incremental_place_amount: z.number().int(),
  // Odds snapshot at this interval
  fixed_win_odds: z.number().optional().nullable(),
  fixed_place_odds: z.number().optional().nullable(),
  pool_win_odds: z.number().optional().nullable(),
  pool_place_odds: z.number().optional().nullable(),
})
/* eslint-enable @typescript-eslint/naming-convention */

export type MoneyFlowRecord = z.infer<typeof moneyFlowRecordSchema>

/**
 * Enhanced transform output schema with normalized entities and time-series records (AC6)
 */
/* eslint-disable @typescript-eslint/naming-convention */
export const transformedRaceSchema = z.object({
  raceId: z.string().min(1),
  raceName: z.string().min(1),
  status: z.enum(['open', 'closed', 'interim', 'final', 'abandoned']),
  transformedAt: z.string().datetime(),
  metrics: z.object({
    entrantCount: z.number().int().nonnegative(),
    poolFieldCount: z.number().int().nonnegative(),
    moneyFlowRecordCount: z.number().int().nonnegative(),
  }),
  // Normalized entities for bulk UPSERT (Story 2.5 + Story 2.10)
  meeting: transformedMeetingSchema.optional().nullable(),
  race: z
    .object({
      race_id: z.string().min(1),
      name: z.string().min(1),
      status: z.enum(['open', 'closed', 'interim', 'final', 'abandoned']),
      race_number: z.number().int().optional().nullable(),
      race_date_nz: z.string(), // YYYY-MM-DD
      start_time_nz: z.string(), // HH:MM
      meeting_id: z.string().optional().nullable(),
      // Story 2.10: Additional race metadata from NZTAB API
      actual_start: z.string().datetime().optional().nullable(),
      tote_start_time: z.string().datetime().optional().nullable(),
      distance: z.number().int().optional().nullable(),
      track_condition: z.string().optional().nullable(),
      track_surface: z.string().optional().nullable(),
      weather: z.string().optional().nullable(),
      type: z.string().optional().nullable(),
      total_prize_money: z.number().optional().nullable(),
      entrant_count: z.number().int().optional().nullable(),
      field_size: z.number().int().optional().nullable(),
      positions_paid: z.number().int().optional().nullable(),
      silk_url: z.string().optional().nullable(),
      silk_base_url: z.string().optional().nullable(),
      video_channels: z.string().optional().nullable(), // JSON string
    })
    .optional()
    .nullable(),
  entrants: z.array(transformedEntrantSchema),
  moneyFlowRecords: z.array(moneyFlowRecordSchema),
  // Story 2.10: Race pools data extracted from NZTAB API (PostgreSQL snake_case)
  racePools: z.array(z.object({
    race_id: z.string().min(1),
    win_pool_total: z.number().int(),
    place_pool_total: z.number().int(),
    quinella_pool_total: z.number().int(),
    trifecta_pool_total: z.number().int(),
    exacta_pool_total: z.number().int(),
    first4_pool_total: z.number().int(),
    total_race_pool: z.number().int(),
    currency: z.string(),
    data_quality_score: z.number().int(),
    extracted_pools: z.number().int(),
  })).optional().nullable(),
  // Original payload for debugging/audit trail
  originalPayload: RaceDataSchema.optional(),
})
/* eslint-enable @typescript-eslint/naming-convention */

export type TransformedRace = z.infer<typeof transformedRaceSchema>

const workerResultSuccessSchema = z.object({
  status: z.literal('ok'),
  taskId: z.string().uuid(),
  durationMs: z.number().nonnegative(),
  result: transformedRaceSchema,
})

const workerResultFailureSchema = z.object({
  status: z.literal('error'),
  taskId: z.string().uuid(),
  durationMs: z.number().nonnegative(),
  error: z.object({
    name: z.string().min(1),
    message: z.string().min(1),
    stack: z.string().optional(),
  }),
})

export type WorkerResultSuccess = z.infer<typeof workerResultSuccessSchema>
export type WorkerResultFailure = z.infer<typeof workerResultFailureSchema>

export const workerResultSchema = z.discriminatedUnion('status', [
  workerResultSuccessSchema,
  workerResultFailureSchema,
])

export type WorkerResult = z.infer<typeof workerResultSchema>

export const createWorkerSuccessMessage = (
  taskId: string,
  durationMs: number,
  result: TransformedRace
): WorkerResultSuccess =>
  workerResultSuccessSchema.parse({
    status: 'ok',
    taskId,
    durationMs,
    result,
  })

export const createWorkerErrorMessage = (
  taskId: string,
  durationMs: number,
  error: { name: string; message: string; stack?: string }
): WorkerResultFailure =>
  workerResultFailureSchema.parse({
    status: 'error',
    taskId,
    durationMs,
    error,
  })
