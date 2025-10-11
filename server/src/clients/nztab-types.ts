import { z } from 'zod'

/**
 * NZ TAB API Response Type Definitions
 *
 * Comprehensive Zod schemas for validating NZ TAB API responses at runtime
 * while providing compile-time TypeScript types. These schemas align with:
 * - NZ TAB OpenAPI spec (docs/api/nztab-openapi.json)
 * - Appwrite legacy field mappings (server-old/database-setup/src/database-setup.js)
 *
 * All schemas use .passthrough() to allow API evolution while validating
 * critical fields required by the transform and database layers.
 *
 * @see {@link https://github.com/colinhacks/zod} for Zod documentation
 * @see {@link docs/tech-spec-epic-2.md#L89} for RaceDataSchema specification
 * @see {@link server-old/database-setup/src/database-setup.js#L942} for Appwrite schema mappings
 */

/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Schema for meeting/venue data
 *
 * Validates core meeting information from NZ TAB API including location,
 * date, race type, and status. Aligns with MeetingData schema in OpenAPI spec.
 *
 * Critical fields validated:
 * - meeting: Unique meeting identifier (string)
 * - name: Display name of the meeting venue
 * - date: Meeting date in ISO 8601 format (datetime)
 * - country: Country code (e.g., 'NZ', 'AU')
 * - category: Race category/type ('R' = thoroughbred, 'H' = harness, 'G' = greyhounds)
 * - tote_status: Meeting status for tote betting
 *
 * @see {@link docs/api/nztab-openapi.json#L2200} for full MeetingData schema
 */
export const MeetingDataSchema = z
  .object({
    meeting: z.string(),
    name: z.string(),
    date: z.string().datetime(), // ISO 8601 format
    country: z.string(),
    category: z.string(), // R = thoroughbred, H = harness, G = greyhounds
    category_name: z.string(),
    state: z.string(),
    track_condition: z.string(),
    tote_status: z.string(),
    meeting_date: z.string().optional().nullable(), // yyyymmdd format
    meeting_type: z.string().optional().nullable(),
    tote_meeting_number: z.number().int().optional(),
    tote_raceday_date: z.string().optional(),
  })
  .passthrough()

export type MeetingData = z.infer<typeof MeetingDataSchema>

/**
 * Schema for odds data (historical and current)
 *
 * Validates odds information for entrants including win/place odds,
 * odds type (fixed/pool/tote), and timestamp for tracking odds movements.
 *
 * Used for:
 * - Odds history tracking over time
 * - Current live odds display
 * - Market movement analysis
 *
 * Field mappings to Appwrite:
 * - fixedWinOdds: float (AC7)
 * - fixedPlaceOdds: float (AC7)
 * - eventTimestamp: datetime for tracking when odds were recorded
 */
export const OddsSchema = z
  .object({
    type: z.enum(['fixed', 'pool', 'tote']),
    odds: z.number(),
    eventTimestamp: z.string().datetime().optional(),
  })
  .passthrough()

export type Odds = z.infer<typeof OddsSchema>

/**
 * Schema for betting pool data
 *
 * Validates pool information for win/place pools including total amounts,
 * individual pool values, and bet percentages for money flow analysis.
 *
 * Critical fields for money flow calculations (AC7):
 * - totalPool: Combined pool amount
 * - winPool: Win pool amount
 * - placePool: Place pool amount
 * - holdPercentage: Percentage of hold on the pool
 * - betPercentage: Percentage of total bets
 *
 * @see {@link server-old/database-setup/src/database-setup.js#L959} for Appwrite pool mappings
 * @see {@link docs/api/nztab-openapi.json#L3020} for pool total field
 */
export const PoolSchema = z
  .object({
    totalPool: z.number().optional().nullable(),
    winPool: z.number().optional().nullable(),
    placePool: z.number().optional().nullable(),
    holdPercentage: z.number().optional().nullable(),
    betPercentage: z.number().optional().nullable(),
  })
  .passthrough()

export type Pool = z.infer<typeof PoolSchema>

/**
 * Schema for race entrant (horse/greyhound/trotter)
 *
 * Validates entrant data including identification, odds, scratching status,
 * and betting indicators. Aligns precisely with Appwrite legacy fields
 * from database-setup.js to ensure smooth data flow through the pipeline.
 *
 * Critical field mappings (AC1, AC7):
 * - entrantId: string (50 chars max) - unique identifier
 * - name: string (255 chars max) - entrant display name
 * - runnerNumber: integer - saddle cloth number
 * - barrier: integer - starting barrier/gate position
 * - fixedWinOdds: float - current fixed odds for win bet
 * - fixedPlaceOdds: float - current fixed odds for place bet
 * - poolWinOdds: float - current pool/tote odds for win
 * - poolPlaceOdds: float - current pool/tote odds for place
 * - isScratched: boolean - whether entrant is scratched
 * - isLateScratched: boolean - whether scratched late
 * - favourite: boolean - market favourite indicator
 * - mover: boolean - odds movement indicator
 *
 * Additional fields:
 * - jockey, trainerName: connection details
 * - silkColours, silkUrl64, silkUrl128: visual presentation
 *
 * @see {@link server-old/database-setup/src/database-setup.js#L942} for Appwrite entrants schema
 */
export const EntrantSchema = z
  .object({
    entrantId: z.string(),
    name: z.string(),
    runnerNumber: z.number().int().positive(),
    barrier: z.number().int().positive().optional().nullable(),
    raceId: z.string().optional(),
    // Current odds - using legacy Appwrite field names (AC7)
    fixedWinOdds: z.number().optional().nullable(),
    fixedPlaceOdds: z.number().optional().nullable(),
    poolWinOdds: z.number().optional().nullable(),
    poolPlaceOdds: z.number().optional().nullable(),
    // Scratching status
    isScratched: z.boolean().optional().nullable(),
    isLateScratched: z.boolean().optional().nullable(),
    scratchTime: z.number().int().optional().nullable(), // Unix timestamp
    runnerChange: z.string().optional().nullable(),
    // Betting indicators
    favourite: z.boolean().optional().nullable(),
    mover: z.boolean().optional().nullable(),
    // Connections
    jockey: z.string().optional().nullable(),
    trainerName: z.string().optional().nullable(),
    // Visual presentation
    silkColours: z.string().optional().nullable(),
    silkUrl64: z.string().optional().nullable(),
    silkUrl128: z.string().optional().nullable(),
    // Metadata timestamps
    lastUpdated: z.string().datetime().optional().nullable(),
    importedAt: z.string().datetime().optional().nullable(),
  })
  .passthrough()

export type Entrant = z.infer<typeof EntrantSchema>

/**
 * Schema for entrant liability/money flow data
 *
 * Validates bet percentage and hold percentage for individual entrants,
 * enabling money flow analysis and liability tracking.
 *
 * Fields align with OpenAPI EntrantLiability schema (AC7):
 * - entrant_id: Links to entrant
 * - bet_percentage: Percent of total bets placed on this entrant
 * - hold_percentage: Percent of total hold on this entrant
 *
 * @see {@link docs/api/nztab-openapi.json#L36} for EntrantLiability schema definition
 */
export const EntrantLiabilitySchema = z
  .object({
    entrant_id: z.string(),
    bet_percentage: z.number(),
    hold_percentage: z.number(),
  })
  .passthrough()

export type EntrantLiability = z.infer<typeof EntrantLiabilitySchema>

/**
 * Schema for money_tracker data from NZTAB API
 *
 * The money_tracker object contains an array of entrant liability snapshots
 * showing hold_percentage and bet_percentage for each entrant over time.
 *
 * API Endpoint: /affiliates/v1/racing/events/{id}?with_money_tracker=true
 *
 * Multiple entries per entrant_id can exist (historical snapshots from polling).
 * For current transform, use most recent entry per entrant.
 *
 * @see {@link docs/api/nztab-samples/money-pool-calculation-guide.md} for calculation details
 * @see {@link server/tests/fixtures/money-flow-legacy/README.md} for fixture documentation
 */
export const MoneyTrackerSchema = z
  .object({
    entrants: z.array(EntrantLiabilitySchema),
  })
  .passthrough()

export type MoneyTracker = z.infer<typeof MoneyTrackerSchema>

/**
 * Comprehensive schema for race data including entrants, pools, and meeting info
 *
 * This is the primary schema for validating complete race information from
 * the NZ TAB API. It composes all sub-schemas (Meeting, Entrants, Pools)
 * and validates critical fields required by the transform layer (Story 2.4)
 * and database UPSERT operations (Story 2.5).
 *
 * Extends the basic RaceDataSchema from Story 2.1 with full entity relationships.
 *
 * Critical fields validated (AC1, AC3):
 * - id: Unique race identifier (raceId)
 * - name: Race display name
 * - status: Race status enum - guards against invalid API values
 * - race_date_nz: Race date in NZ timezone (YYYY-MM-DD)
 * - start_time_nz: Start time in NZ timezone (HH:MM)
 * - race_number: Race number within meeting
 * - meeting_id: Links to meeting
 *
 * Nested collections:
 * - entrants: Array of EntrantSchema - all runners in the race
 * - pools: Pool data for betting analysis
 * - meeting: Full meeting context
 *
 * Status enum values match observed API responses and database constraints:
 * - 'open': Betting open, race upcoming
 * - 'closed': Betting closed, race in progress or about to start
 * - 'interim': Race finished, results being confirmed
 * - 'final': Official results posted
 * - 'abandoned': Race cancelled/abandoned
 *
 * Uses .passthrough() (AC8) to allow API evolution - new fields from NZ TAB
 * won't break validation, but critical fields remain strictly validated.
 *
 * @see {@link docs/tech-spec-epic-2.md#L89} for RaceDataSchema requirements
 * @see {@link server/src/clients/nztab.ts#L13} for basic schema from Story 2.1
 */
export const RaceDataSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(['open', 'closed', 'interim', 'final', 'abandoned']),
    race_date_nz: z.string(), // YYYY-MM-DD format in NZ timezone
    start_time_nz: z.string(), // HH:MM format in NZ timezone
    race_number: z.number().int().optional(),
    meeting_id: z.string().optional(),
    // Nested entities
    entrants: z.array(EntrantSchema).optional().nullable(),
    pools: PoolSchema.optional().nullable(),
    meeting: MeetingDataSchema.optional().nullable(),
    money_tracker: MoneyTrackerSchema.optional().nullable(),
  })
  .passthrough()

export type RaceData = z.infer<typeof RaceDataSchema>

/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Validation helper: Parse and validate race data with detailed error logging
 *
 * Wraps schema.safeParse() to provide structured error logging when validation
 * fails. Logs field path, expected type, actual value, and error reason using
 * Pino structured format (AC4).
 *
 * @param data - Raw race data from NZ TAB API
 * @param logger - Pino logger instance for structured logging
 * @returns Validated RaceData if successful
 * @throws Error with structured validation details if parsing fails
 *
 * @example
 * ```typescript
 * try {
 *   const race = validateRaceData(apiResponse, logger)
 *   // race is now type-safe and validated
 * } catch (error) {
 *   // Validation errors already logged with field details
 *   throw error
 * }
 * ```
 */
export function validateRaceData(
  data: unknown,
  logger: { error: (obj: object) => void }
): RaceData {
  const result = RaceDataSchema.safeParse(data)

  if (!result.success) {
    // Log structured validation errors (AC4)
    logger.error({
      event: 'race_data_validation_error',
      errors: result.error.errors.map((err) => ({
        fieldPath: err.path.join('.'),
        code: err.code,
        errorReason: err.message,
      })),
    })

    throw new Error(`Race data validation failed: ${result.error.message}`)
  }

  return result.data
}

/**
 * Validation helper: Parse and validate meeting data with detailed error logging
 *
 * Similar to validateRaceData but for meeting-specific validation.
 *
 * @param data - Raw meeting data from NZ TAB API
 * @param logger - Pino logger instance for structured logging
 * @returns Validated MeetingData if successful
 * @throws Error with structured validation details if parsing fails
 */
export function validateMeetingData(
  data: unknown,
  logger: { error: (obj: object) => void }
): MeetingData {
  const result = MeetingDataSchema.safeParse(data)

  if (!result.success) {
    logger.error({
      event: 'meeting_data_validation_error',
      errors: result.error.errors.map((err) => ({
        fieldPath: err.path.join('.'),
        code: err.code,
        errorReason: err.message,
      })),
    })

    throw new Error(`Meeting data validation failed: ${result.error.message}`)
  }

  return result.data
}

/**
 * Validation helper: Parse and validate entrant data with detailed error logging
 *
 * @param data - Raw entrant data from NZ TAB API
 * @param logger - Pino logger instance for structured logging
 * @returns Validated Entrant if successful
 * @throws Error with structured validation details if parsing fails
 */
export function validateEntrant(
  data: unknown,
  logger: { error: (obj: object) => void }
): Entrant {
  const result = EntrantSchema.safeParse(data)

  if (!result.success) {
    logger.error({
      event: 'entrant_validation_error',
      errors: result.error.errors.map((err) => ({
        fieldPath: err.path.join('.'),
        code: err.code,
        errorReason: err.message,
      })),
    })

    throw new Error(`Entrant validation failed: ${result.error.message}`)
  }

  return result.data
}
