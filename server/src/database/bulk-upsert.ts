import type { PoolClient } from 'pg'
import { pool } from './pool.js'
import { logger } from '../shared/logger.js'
import type {
  TransformedMeeting,
  TransformedEntrant,
} from '../workers/messages.js'
import type { RacePoolData } from '../utils/race-pools.js'

/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Transaction wrapper that borrows pooled client, executes work in BEGIN/COMMIT,
 * and ensures ROLLBACK + connection release on error (AC5)
 */
export const withTransaction = async <T>(
  work: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Bulk UPSERT normalized meetings using multi-row INSERT...ON CONFLICT (AC1)
 *
 * Uses parameterized query with IS DISTINCT FROM predicates to skip unchanged rows (AC4)
 * Returns only after transaction commits (AC1)
 *
 * @param meetings - Array of normalized meeting entities from transform worker
 * @returns Promise resolving to row count metrics
 */
export const bulkUpsertMeetings = async (
  meetings: TransformedMeeting[],
  client?: PoolClient
): Promise<{ rowCount: number; duration: number }> => {
  if (meetings.length === 0) {
    return { rowCount: 0, duration: 0 }
  }

  const startTime = performance.now()

  // Build parameterized multi-row INSERT values
  const values: unknown[] = []
  const valueRows: string[] = []
  let paramIndex = 1

  for (const meeting of meetings) {
    valueRows.push(
      `($${String(paramIndex)}, $${String(paramIndex + 1)}, $${String(paramIndex + 2)}, $${String(paramIndex + 3)}, $${String(paramIndex + 4)}, $${String(paramIndex + 5)}, $${String(paramIndex + 6)}, $${String(paramIndex + 7)})`
    )
    values.push(
      meeting.meeting_id,
      meeting.name,
      meeting.country,
      meeting.category, // Maps to race_type column
      meeting.date,
      meeting.track_condition ?? null,
      meeting.tote_status ?? null,
      'active' // Default status for new meetings
    )
    paramIndex += 8
  }

  // Multi-row UPSERT with IS DISTINCT FROM change detection (AC4)
  const sql = `
    INSERT INTO meetings (
      meeting_id, meeting_name, country, race_type, date, track_condition, tote_status, status
    ) VALUES ${valueRows.join(', ')}
    ON CONFLICT (meeting_id) DO UPDATE SET
      meeting_name = EXCLUDED.meeting_name,
      country = EXCLUDED.country,
      race_type = EXCLUDED.race_type,
      date = EXCLUDED.date,
      track_condition = EXCLUDED.track_condition,
      tote_status = EXCLUDED.tote_status,
      status = EXCLUDED.status,
      updated_at = NOW()
    WHERE
      meetings.meeting_name IS DISTINCT FROM EXCLUDED.meeting_name
      OR meetings.country IS DISTINCT FROM EXCLUDED.country
      OR meetings.race_type IS DISTINCT FROM EXCLUDED.race_type
      OR meetings.date IS DISTINCT FROM EXCLUDED.date
      OR meetings.track_condition IS DISTINCT FROM EXCLUDED.track_condition
      OR meetings.tote_status IS DISTINCT FROM EXCLUDED.tote_status
      OR meetings.status IS DISTINCT FROM EXCLUDED.status
  `

  if (client !== undefined) {
    // Use provided client (already in a transaction)
    const result = await client.query(sql, values)
    const duration = performance.now() - startTime

    logger.info(
      {
        table: 'meetings',
        rowCount: result.rowCount ?? 0,
        write_ms: Math.round(duration),
        overBudget: duration >= 300,
      },
      'Bulk UPSERT meetings completed'
    )

    if (duration >= 300) {
      logger.warn(
        { duration: Math.round(duration), rowCount: result.rowCount ?? 0 },
        'Meetings UPSERT exceeded 300ms threshold'
      )
    }

    return { rowCount: result.rowCount ?? 0, duration }
  } else {
    // Create new transaction
    return withTransaction(async (client) => {
      const result = await client.query(sql, values)
      const duration = performance.now() - startTime

      logger.info(
        {
          table: 'meetings',
          rowCount: result.rowCount ?? 0,
          write_ms: Math.round(duration),
          overBudget: duration >= 300,
        },
        'Bulk UPSERT meetings completed'
      )

      if (duration >= 300) {
        logger.warn(
          { duration: Math.round(duration), rowCount: result.rowCount ?? 0 },
          'Meetings UPSERT exceeded 300ms threshold'
        )
      }

      return { rowCount: result.rowCount ?? 0, duration }
    })
  }
}

interface TransformedRace {
  race_id: string
  name: string
  status: 'open' | 'closed' | 'interim' | 'final' | 'abandoned'
  race_number: number | null
  race_date_nz: string
  start_time_nz: string
  meeting_id: string | null
  // Story 2.10 additional fields
  actual_start?: string | null
  tote_start_time?: string | null
  distance?: number | null
  track_condition?: string | null
  track_surface?: string | null
  weather?: string | null
  type?: string | null
  total_prize_money?: number | null
  entrant_count?: number | null
  field_size?: number | null
  positions_paid?: number | null
  silk_url?: string | null
  silk_base_url?: string | null
  video_channels?: string | null
}

/**
 * Bulk UPSERT normalized races using multi-row INSERT...ON CONFLICT (AC2)
 *
 * Mirrors meeting behavior with enum normalization and timestamp handling (AC2)
 * Uses parameterized query with IS DISTINCT FROM predicates (AC4)
 *
 * @param races - Array of normalized race entities from transform worker
 * @returns Promise resolving to row count metrics
 */
export const bulkUpsertRaces = async (
  races: TransformedRace[],
  client?: PoolClient
): Promise<{ rowCount: number; duration: number }> => {
  if (races.length === 0) {
    return { rowCount: 0, duration: 0 }
  }

  const startTime = performance.now()

  // Build parameterized multi-row INSERT values
  const values: unknown[] = []
  const valueRows: string[] = []
  let paramIndex = 1

  for (const race of races) {
    // Combine race_date_nz and start_time_nz into start_time timestamp
    // start_time_nz already includes timezone info (e.g., "15:59:00 NZDT")
    // so we just need to combine date and time without adding extra timezone info
    const startTime = `${race.race_date_nz}T${race.start_time_nz}`

    valueRows.push(
      `($${String(paramIndex)}, $${String(paramIndex + 1)}, $${String(paramIndex + 2)}, $${String(paramIndex + 3)}, $${String(paramIndex + 4)}, $${String(paramIndex + 5)}, $${String(paramIndex + 6)}, $${String(paramIndex + 7)}, $${String(paramIndex + 8)}, $${String(paramIndex + 9)}, $${String(paramIndex + 10)}, $${String(paramIndex + 11)}, $${String(paramIndex + 12)}, $${String(paramIndex + 13)}, $${String(paramIndex + 14)}, $${String(paramIndex + 15)}, $${String(paramIndex + 16)}, $${String(paramIndex + 17)}, $${String(paramIndex + 18)}, $${String(paramIndex + 19)}, $${String(paramIndex + 20)}, $${String(paramIndex + 21)})`
    )
    values.push(
      race.race_id,
      race.meeting_id,
      race.name,
      race.race_number ?? null,
      startTime,
      race.status,
      race.race_date_nz,
      race.start_time_nz,
      // Story 2.10 new race fields
      race.actual_start ?? null,
      race.tote_start_time ?? null,
      race.distance ?? null,
      race.track_condition ?? null,
      race.track_surface ?? null,
      race.weather ?? null,
      race.type ?? null,
      race.total_prize_money ?? null,
      race.entrant_count ?? null,
      race.field_size ?? null,
      race.positions_paid ?? null,
      race.silk_url ?? null,
      race.silk_base_url ?? null,
      race.video_channels ?? null
    )
    paramIndex += 22
  }

  // Multi-row UPSERT with IS DISTINCT FROM change detection (AC4)
  const sql = `
    INSERT INTO races (
      race_id, meeting_id, name, race_number, start_time, status, race_date_nz, start_time_nz,
      actual_start, tote_start_time, distance, track_condition, track_surface, weather, type,
      total_prize_money, entrant_count, field_size, positions_paid, silk_url, silk_base_url, video_channels
    ) VALUES ${valueRows.join(', ')}
    ON CONFLICT (race_id) DO UPDATE SET
      meeting_id = EXCLUDED.meeting_id,
      name = EXCLUDED.name,
      race_number = EXCLUDED.race_number,
      start_time = EXCLUDED.start_time,
      status = EXCLUDED.status,
      race_date_nz = EXCLUDED.race_date_nz,
      start_time_nz = EXCLUDED.start_time_nz,
      actual_start = EXCLUDED.actual_start,
      tote_start_time = EXCLUDED.tote_start_time,
      distance = EXCLUDED.distance,
      track_condition = EXCLUDED.track_condition,
      track_surface = EXCLUDED.track_surface,
      weather = EXCLUDED.weather,
      type = EXCLUDED.type,
      total_prize_money = EXCLUDED.total_prize_money,
      entrant_count = EXCLUDED.entrant_count,
      field_size = EXCLUDED.field_size,
      positions_paid = EXCLUDED.positions_paid,
      silk_url = EXCLUDED.silk_url,
      silk_base_url = EXCLUDED.silk_base_url,
      video_channels = EXCLUDED.video_channels,
      updated_at = NOW()
    WHERE
      races.meeting_id IS DISTINCT FROM EXCLUDED.meeting_id
      OR races.name IS DISTINCT FROM EXCLUDED.name
      OR races.race_number IS DISTINCT FROM EXCLUDED.race_number
      OR races.start_time IS DISTINCT FROM EXCLUDED.start_time
      OR races.status IS DISTINCT FROM EXCLUDED.status
      OR races.race_date_nz IS DISTINCT FROM EXCLUDED.race_date_nz
      OR races.start_time_nz IS DISTINCT FROM EXCLUDED.start_time_nz
      OR races.actual_start IS DISTINCT FROM EXCLUDED.actual_start
      OR races.tote_start_time IS DISTINCT FROM EXCLUDED.tote_start_time
      OR races.distance IS DISTINCT FROM EXCLUDED.distance
      OR races.track_condition IS DISTINCT FROM EXCLUDED.track_condition
      OR races.track_surface IS DISTINCT FROM EXCLUDED.track_surface
      OR races.weather IS DISTINCT FROM EXCLUDED.weather
      OR races.type IS DISTINCT FROM EXCLUDED.type
      OR races.total_prize_money IS DISTINCT FROM EXCLUDED.total_prize_money
      OR races.entrant_count IS DISTINCT FROM EXCLUDED.entrant_count
      OR races.field_size IS DISTINCT FROM EXCLUDED.field_size
      OR races.positions_paid IS DISTINCT FROM EXCLUDED.positions_paid
      OR races.silk_url IS DISTINCT FROM EXCLUDED.silk_url
      OR races.silk_base_url IS DISTINCT FROM EXCLUDED.silk_base_url
      OR races.video_channels IS DISTINCT FROM EXCLUDED.video_channels
  `

  if (client !== undefined) {
    // Use provided client (already in a transaction)
    const result = await client.query(sql, values)
    const duration = performance.now() - startTime

    logger.info(
      {
        table: 'races',
        rowCount: result.rowCount ?? 0,
        write_ms: Math.round(duration),
        overBudget: duration >= 300,
      },
      'Bulk UPSERT races completed'
    )

    if (duration >= 300) {
      logger.warn(
        { duration: Math.round(duration), rowCount: result.rowCount ?? 0 },
        'Races UPSERT exceeded 300ms threshold'
      )
    }

    return { rowCount: result.rowCount ?? 0, duration }
  } else {
    // Create new transaction
    return withTransaction(async (client) => {
      const result = await client.query(sql, values)
      const duration = performance.now() - startTime

      logger.info(
        {
          table: 'races',
          rowCount: result.rowCount ?? 0,
          write_ms: Math.round(duration),
          overBudget: duration >= 300,
        },
        'Bulk UPSERT races completed'
      )

      if (duration >= 300) {
        logger.warn(
          { duration: Math.round(duration), rowCount: result.rowCount ?? 0 },
          'Races UPSERT exceeded 300ms threshold'
        )
      }

      return { rowCount: result.rowCount ?? 0, duration }
    })
  }
}

/**
 * Bulk UPSERT normalized entrants with Story 2.4 money-flow fields (AC3)
 *
 * Persists all calculated fields without loss while maintaining transactional guarantees (AC3)
 * Uses parameterized query with IS DISTINCT FROM predicates (AC4)
 *
 * @param entrants - Array of normalized entrant entities with money-flow calculations
 * @returns Promise resolving to row count metrics
 */
export const bulkUpsertEntrants = async (
  entrants: TransformedEntrant[],
  client?: PoolClient
): Promise<{ rowCount: number; duration: number }> => {
  if (entrants.length === 0) {
    return { rowCount: 0, duration: 0 }
  }

  const startTime = performance.now()

  // Build parameterized multi-row INSERT values (Story 2.4 field mapping)
  const values: unknown[] = []
  const valueRows: string[] = []
  let paramIndex = 1

  for (const entrant of entrants) {
    valueRows.push(
      `($${String(paramIndex)}, $${String(paramIndex + 1)}, $${String(paramIndex + 2)}, $${String(paramIndex + 3)}, $${String(paramIndex + 4)}, $${String(paramIndex + 5)}, $${String(paramIndex + 6)}, $${String(paramIndex + 7)}, $${String(paramIndex + 8)}, $${String(paramIndex + 9)}, $${String(paramIndex + 10)}, $${String(paramIndex + 11)}, $${String(paramIndex + 12)}, $${String(paramIndex + 13)}, $${String(paramIndex + 14)}, $${String(paramIndex + 15)}, $${String(paramIndex + 16)}, $${String(paramIndex + 17)}, $${String(paramIndex + 18)}, $${String(paramIndex + 19)}, $${String(paramIndex + 20)}, $${String(paramIndex + 21)}, $${String(paramIndex + 22)}, $${String(paramIndex + 23)}, $${String(paramIndex + 24)}, $${String(paramIndex + 25)})`
    )
    values.push(
      entrant.entrant_id,
      entrant.race_id,
      entrant.name,
      entrant.runner_number,
      entrant.barrier ?? null,
      entrant.is_scratched,
      entrant.is_late_scratched ?? null,
      entrant.fixed_win_odds ?? null,
      entrant.fixed_place_odds ?? null,
      entrant.pool_win_odds ?? null,
      entrant.pool_place_odds ?? null,
      entrant.hold_percentage ?? null,
      entrant.bet_percentage ?? null,
      entrant.win_pool_percentage ?? null,
      entrant.place_pool_percentage ?? null,
      entrant.win_pool_amount ?? null,
      entrant.place_pool_amount ?? null,
      entrant.jockey ?? null,
      entrant.trainer_name ?? null,
      entrant.silk_colours ?? null,
      entrant.favourite ?? null,
      entrant.mover ?? null,
      // Story 2.10 new fields
      entrant.silk_url_64x64 ?? null,
      entrant.silk_url_128x128 ?? null,
      entrant.scratch_time ?? null,
      entrant.runner_change ?? null
    )
    paramIndex += 26
  }

  // Multi-row UPSERT with IS DISTINCT FROM change detection for ALL fields (AC4)
  // 26 entrant fields (Story 2.4 + Story 2.10 comprehensive fields):
  //   1-4: Core identity (entrant_id, race_id, name, runner_number)
  //   5-7: Race metadata (barrier, is_scratched, is_late_scratched)
  //   8-11: Odds data (fixed_win_odds, fixed_place_odds, pool_win_odds, pool_place_odds)
  //   12-15: Money-flow percentages (hold_percentage, bet_percentage, win_pool_percentage, place_pool_percentage)
  //   16-17: Pool amounts in cents (win_pool_amount, place_pool_amount)
  //   18-22: Additional metadata (jockey, trainer_name, silk_colours, favourite, mover)
  //   23-26: Story 2.10 new fields (silk_url_64x64, silk_url_128x128, scratch_time, runner_change)
  const sql = `
    INSERT INTO entrants (
      entrant_id, race_id, name, runner_number, barrier, is_scratched, is_late_scratched,
      fixed_win_odds, fixed_place_odds, pool_win_odds, pool_place_odds,
      hold_percentage, bet_percentage, win_pool_percentage, place_pool_percentage,
      win_pool_amount, place_pool_amount,
      jockey, trainer_name, silk_colours, favourite, mover,
      silk_url_64x64, silk_url_128x128, scratch_time, runner_change
    ) VALUES ${valueRows.join(', ')}
    ON CONFLICT (entrant_id) DO UPDATE SET
      race_id = EXCLUDED.race_id,
      name = EXCLUDED.name,
      runner_number = EXCLUDED.runner_number,
      barrier = EXCLUDED.barrier,
      is_scratched = EXCLUDED.is_scratched,
      is_late_scratched = EXCLUDED.is_late_scratched,
      fixed_win_odds = EXCLUDED.fixed_win_odds,
      fixed_place_odds = EXCLUDED.fixed_place_odds,
      pool_win_odds = EXCLUDED.pool_win_odds,
      pool_place_odds = EXCLUDED.pool_place_odds,
      hold_percentage = EXCLUDED.hold_percentage,
      bet_percentage = EXCLUDED.bet_percentage,
      win_pool_percentage = EXCLUDED.win_pool_percentage,
      place_pool_percentage = EXCLUDED.place_pool_percentage,
      win_pool_amount = EXCLUDED.win_pool_amount,
      place_pool_amount = EXCLUDED.place_pool_amount,
      jockey = EXCLUDED.jockey,
      trainer_name = EXCLUDED.trainer_name,
      silk_colours = EXCLUDED.silk_colours,
      favourite = EXCLUDED.favourite,
      mover = EXCLUDED.mover,
      silk_url_64x64 = EXCLUDED.silk_url_64x64,
      silk_url_128x128 = EXCLUDED.silk_url_128x128,
      scratch_time = EXCLUDED.scratch_time,
      runner_change = EXCLUDED.runner_change,
      updated_at = NOW()
    WHERE
      entrants.race_id IS DISTINCT FROM EXCLUDED.race_id
      OR entrants.name IS DISTINCT FROM EXCLUDED.name
      OR entrants.runner_number IS DISTINCT FROM EXCLUDED.runner_number
      OR entrants.barrier IS DISTINCT FROM EXCLUDED.barrier
      OR entrants.is_scratched IS DISTINCT FROM EXCLUDED.is_scratched
      OR entrants.is_late_scratched IS DISTINCT FROM EXCLUDED.is_late_scratched
      OR entrants.fixed_win_odds IS DISTINCT FROM EXCLUDED.fixed_win_odds
      OR entrants.fixed_place_odds IS DISTINCT FROM EXCLUDED.fixed_place_odds
      OR entrants.pool_win_odds IS DISTINCT FROM EXCLUDED.pool_win_odds
      OR entrants.pool_place_odds IS DISTINCT FROM EXCLUDED.pool_place_odds
      OR entrants.hold_percentage IS DISTINCT FROM EXCLUDED.hold_percentage
      OR entrants.bet_percentage IS DISTINCT FROM EXCLUDED.bet_percentage
      OR entrants.win_pool_percentage IS DISTINCT FROM EXCLUDED.win_pool_percentage
      OR entrants.place_pool_percentage IS DISTINCT FROM EXCLUDED.place_pool_percentage
      OR entrants.win_pool_amount IS DISTINCT FROM EXCLUDED.win_pool_amount
      OR entrants.place_pool_amount IS DISTINCT FROM EXCLUDED.place_pool_amount
      OR entrants.jockey IS DISTINCT FROM EXCLUDED.jockey
      OR entrants.trainer_name IS DISTINCT FROM EXCLUDED.trainer_name
      OR entrants.silk_colours IS DISTINCT FROM EXCLUDED.silk_colours
      OR entrants.favourite IS DISTINCT FROM EXCLUDED.favourite
      OR entrants.mover IS DISTINCT FROM EXCLUDED.mover
      OR entrants.silk_url_64x64 IS DISTINCT FROM EXCLUDED.silk_url_64x64
      OR entrants.silk_url_128x128 IS DISTINCT FROM EXCLUDED.silk_url_128x128
      OR entrants.scratch_time IS DISTINCT FROM EXCLUDED.scratch_time
      OR entrants.runner_change IS DISTINCT FROM EXCLUDED.runner_change
  `

  if (client !== undefined) {
    // Use provided client (already in a transaction)
    const result = await client.query(sql, values)
    const duration = performance.now() - startTime

    logger.info(
      {
        table: 'entrants',
        rowCount: result.rowCount ?? 0,
        write_ms: Math.round(duration),
        overBudget: duration >= 300,
      },
      'Bulk UPSERT entrants completed'
    )

    if (duration >= 300) {
      logger.warn(
        { duration: Math.round(duration), rowCount: result.rowCount ?? 0 },
        'Entrants UPSERT exceeded 300ms threshold'
      )
    }

    return { rowCount: result.rowCount ?? 0, duration }
  } else {
    // Create new transaction
    return withTransaction(async (client) => {
      const result = await client.query(sql, values)
      const duration = performance.now() - startTime

      logger.info(
        {
          table: 'entrants',
          rowCount: result.rowCount ?? 0,
          write_ms: Math.round(duration),
          overBudget: duration >= 300,
        },
        'Bulk UPSERT entrants completed'
      )

      if (duration >= 300) {
        logger.warn(
          { duration: Math.round(duration), rowCount: result.rowCount ?? 0 },
          'Entrants UPSERT exceeded 300ms threshold'
        )
      }

      return { rowCount: result.rowCount ?? 0, duration }
    })
  }
}

/**
 * Error class for database write failures (AC6)
 * Allows race processor to classify retryable vs fatal errors
 */
export class DatabaseWriteError extends Error {
  constructor(
    message: string,
    public readonly raceId: string,
    public readonly cause?: Error,
    public readonly retryable = false
  ) {
    super(message)
    this.name = 'DatabaseWriteError'
  }
}

/**
 * Bulk UPSERT for race pools data from NZTAB API (Task 3.2)
 * Stores pool totals with enhanced validation and metadata
 *
 * @param poolDataArray - Array of race pool data to upsert
 * @param client - Optional database client (for transaction handling)
 * @returns Promise resolving to row count metrics
 */
export const bulkUpsertRacePools = async (
  poolDataArray: RacePoolData[],
  client?: PoolClient
): Promise<{ rowCount: number; duration: number }> => {
  if (poolDataArray.length === 0) {
    return { rowCount: 0, duration: 0 }
  }

  const startTime = performance.now()

  // Build parameterized multi-row INSERT values
  const values: unknown[] = []
  const valueRows: string[] = []
  let paramIndex = 1

  for (const poolData of poolDataArray) {
    valueRows.push(
      `($${String(paramIndex)}, $${String(paramIndex + 1)}, $${String(paramIndex + 2)}, $${String(paramIndex + 3)}, $${String(paramIndex + 4)}, $${String(paramIndex + 5)}, $${String(paramIndex + 6)}, $${String(paramIndex + 7)}, $${String(paramIndex + 8)}, $${String(paramIndex + 9)})`
    )
    values.push(
      poolData.race_id,
      poolData.win_pool_total,
      poolData.place_pool_total,
      poolData.quinella_pool_total,
      poolData.trifecta_pool_total,
      poolData.exacta_pool_total,
      poolData.first4_pool_total,
      poolData.currency,
      poolData.data_quality_score,
      poolData.extracted_pools
    )
    paramIndex += 10
  }

  // Multi-row UPSERT with IS DISTINCT FROM change detection
  const sql = `
    INSERT INTO race_pools (
      race_id, win_pool_total, place_pool_total, quinella_pool_total, trifecta_pool_total,
      exacta_pool_total, first4_pool_total, currency, data_quality_score, extracted_pools
    ) VALUES ${valueRows.join(', ')}
    ON CONFLICT (race_id) DO UPDATE SET
      win_pool_total = EXCLUDED.win_pool_total,
      place_pool_total = EXCLUDED.place_pool_total,
      quinella_pool_total = EXCLUDED.quinella_pool_total,
      trifecta_pool_total = EXCLUDED.trifecta_pool_total,
      exacta_pool_total = EXCLUDED.exacta_pool_total,
      first4_pool_total = EXCLUDED.first4_pool_total,
      currency = EXCLUDED.currency,
      data_quality_score = EXCLUDED.data_quality_score,
      extracted_pools = EXCLUDED.extracted_pools,
      last_updated = NOW()
    WHERE
      race_pools.win_pool_total IS DISTINCT FROM EXCLUDED.win_pool_total
      OR race_pools.place_pool_total IS DISTINCT FROM EXCLUDED.place_pool_total
      OR race_pools.quinella_pool_total IS DISTINCT FROM EXCLUDED.quinella_pool_total
      OR race_pools.trifecta_pool_total IS DISTINCT FROM EXCLUDED.trifecta_pool_total
      OR race_pools.exacta_pool_total IS DISTINCT FROM EXCLUDED.exacta_pool_total
      OR race_pools.first4_pool_total IS DISTINCT FROM EXCLUDED.first4_pool_total
      OR race_pools.data_quality_score IS DISTINCT FROM EXCLUDED.data_quality_score
      OR race_pools.extracted_pools IS DISTINCT FROM EXCLUDED.extracted_pools
  `

  if (client !== undefined) {
    // Use provided client (already in a transaction)
    const result = await client.query(sql, values)
    const duration = performance.now() - startTime

    logger.info(
      {
        table: 'race_pools',
        rowCount: result.rowCount ?? 0,
        write_ms: Math.round(duration),
        overBudget: duration >= 300,
      },
      'Bulk UPSERT race pools completed'
    )

    if (duration >= 300) {
      logger.warn(
        { duration: Math.round(duration), rowCount: result.rowCount ?? 0 },
        'Race pools UPSERT exceeded 300ms threshold'
      )
    }

    return { rowCount: result.rowCount ?? 0, duration }
  } else {
    // Create new transaction
    return withTransaction(async (client) => {
      const result = await client.query(sql, values)
      const duration = performance.now() - startTime

      logger.info(
        {
          table: 'race_pools',
          rowCount: result.rowCount ?? 0,
          write_ms: Math.round(duration),
          overBudget: duration >= 300,
        },
        'Bulk UPSERT race pools completed'
      )

      if (duration >= 300) {
        logger.warn(
          { duration: Math.round(duration), rowCount: result.rowCount ?? 0 },
          'Race pools UPSERT exceeded 300ms threshold'
        )
      }

      return { rowCount: result.rowCount ?? 0, duration }
    })
  }
}

/**
 * Error class for transaction failures (AC6)
 */
export class TransactionError extends Error {
  constructor(
    message: string,
    public readonly raceId: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'TransactionError'
  }
}
