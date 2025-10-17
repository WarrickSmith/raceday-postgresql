import type { PoolClient } from 'pg'
import { logger } from '../shared/logger.js'
import { withTransaction, DatabaseWriteError } from './bulk-upsert.js'
import type { MoneyFlowRecord } from '../workers/messages.js'
import { pool } from './index.js'

/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Odds record for odds_history time-series table
 *
 * **Timestamp Field:**
 * - `event_timestamp`: Represents when the odds observation occurred.
 *   Set to race start time derived from NZTAB API fields (race_date_nz + start_time_nz)
 *   for accurate temporal tracking and NZ-aligned partition routing.
 *
 * **IMPORTANT TIME ZONE NOTE:**
 * NZTAB API provides race_date_nz and start_time_nz fields in New Zealand local time.
 * These fields are already in NZ timezone and should NOT be converted to UTC.
 * This ensures partitions align with NZ race days, not UTC calendar days.
 */
export interface OddsRecord {
  entrant_id: string
  odds: number
  type: 'fixed_win' | 'fixed_place' | 'pool_win' | 'pool_place'
  event_timestamp: string // ISO 8601 timestamp (race start time in NZ local time context)
}

/**
 * Error thrown when target partition does not exist (AC7)
 * Indicates Epic 4 partition automation dependency
 */
export class PartitionNotFoundError extends DatabaseWriteError {
  constructor(
    public readonly tableName: string,
    public readonly partitionName: string,
    public readonly eventTimestamp: string
  ) {
    super(
      `Partition ${partitionName} not found for table ${tableName}. Ensure Epic 4 partition automation has created daily partitions.`,
      'partition-missing',
      undefined,
      false // Not retryable - requires partition creation
    )
    this.name = 'PartitionNotFoundError'
  }
}

/**
 * Extract date from event_timestamp and construct partition table name (AC5)
 * Format: {base_table}_{YYYY_MM_DD}
 *
 * IMPORTANT: Uses NZ local time instead of UTC for partition naming.
 * NZTAB API provides race_date_nz and start_time_nz fields that are already
 * in New Zealand local time and should NOT be converted to UTC.
 * Races occur during NZ daylight hours, so partition alignment with NZ dates
 * prevents data from going to wrong partition when race spans midnight UTC.
 */
export const getPartitionTableName = (
  baseTable: string,
  eventTimestamp: string
): string => {
  // Extract date part from ISO timestamp to avoid timezone conversion issues
  // This preserves the original date from the timestamp regardless of local timezone
  const [datePart] = eventTimestamp.split('T') // YYYY-MM-DD format
  if (datePart === undefined) {
    throw new Error(`Invalid timestamp format: ${eventTimestamp}`)
  }
  const [year, month, day] = datePart.split('-')
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid date format: ${datePart}`)
  }
  return `${baseTable}_${year}_${month}_${day}`
}

/**
 * Verify partition exists by querying PostgreSQL system catalogs (AC5)
 * Checks pg_class and pg_inherits for partition table
 */
export const verifyPartitionExists = async (
  client: PoolClient,
  partitionName: string
): Promise<boolean> => {
  const result = await client.query<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = $1
      AND n.nspname = 'public'
    ) as exists
    `,
    [partitionName]
  )

  return result.rows[0]?.exists ?? false
}

/**
 * Ensure partition exists for time-series table on specified date (Task 1.1)
 * Creates daily partition automatically if it doesn't exist
 *
 * @param tableName - Base table name (e.g., 'money_flow_history', 'odds_history')
 * @param date - Date for which to create partition
 * @returns Promise resolving when partition is verified/created
 */
export const ensurePartition = async (
  tableName: string,
  date: Date
): Promise<void> => {
  const partitionName = getPartitionTableName(tableName, date.toISOString())
  const [startDate] = date.toISOString().split('T')
  const [endDate] = new Date(date.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')
  if (startDate === undefined || endDate === undefined) {
    throw new Error('Failed to extract date parts from ISO string')
  }

  // Use a dedicated client from the pool for partition operations
  const client = await pool.connect()

  try {
    // Check if partition exists
    const exists = await verifyPartitionExists(client, partitionName)

    if (exists) {
      logger.debug(
        { tableName, partitionName, date: startDate },
        'Partition already exists'
      )
      return
    }

    // Create partition for the specified date
    const createPartitionSQL = `
      CREATE TABLE "${partitionName}" PARTITION OF ${tableName}
      FOR VALUES FROM ('${startDate}') TO ('${endDate}')
    `

    await client.query(createPartitionSQL)

    logger.info(
      {
        tableName,
        partitionName,
        date: startDate,
        duration_ms: performance.now()
      },
      'Created partition for time-series table'
    )
  } catch (error) {
    logger.error(
      {
        tableName,
        partitionName,
        date: startDate,
        error: error instanceof Error ? error.message : String(error)
      },
      'Failed to create partition'
    )
    throw new Error(`Failed to create partition ${partitionName}: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    client.release()
  }
}

/**
 * Ensure partitions exist for today and tomorrow (Task 1.3)
 * Creates proactive partitions for current and next day
 */
export const ensureUpcomingPartitions = async (
  tableName: string
): Promise<void> => {
  const today = new Date()
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)

  try {
    // Ensure today's partition exists
    await ensurePartition(tableName, today)

    // Ensure tomorrow's partition exists
    await ensurePartition(tableName, tomorrow)

    logger.info(
      {
        tableName,
        today: today.toISOString().split('T')[0],
        tomorrow: tomorrow.toISOString().split('T')[0]
      },
      'Upcoming partitions ensured'
    )
  } catch (error) {
    logger.error(
      {
        tableName,
        error: error instanceof Error ? error.message : String(error)
      },
      'Failed to ensure upcoming partitions'
    )
    throw error
  }
}

/**
 * Check and ensure partitions exist before time-series writes (Task 1.2)
 * Validates partition existence and creates if missing
 */
export const validatePartitionBeforeWrite = async (
  tableName: string,
  eventTimestamp: string
): Promise<void> => {
  const date = new Date(eventTimestamp)
  const partitionName = getPartitionTableName(tableName, eventTimestamp)

  // Quick check using existing verifyPartitionExists function
  const client = await pool.connect()
  try {
    const exists = await verifyPartitionExists(client, partitionName)

    if (!exists) {
      logger.warn(
        {
          tableName,
          partitionName,
          eventTimestamp,
          date: date.toISOString().split('T')[0]
        },
        'Partition missing before write, creating automatically'
      )

      // Create partition automatically
      await ensurePartition(tableName, date)
    }
  } finally {
    client.release()
  }
}

/**
 * Insert money flow history records to partitioned time-series table (AC1)
 *
 * - Appends rows to correct daily partition based on event_timestamp (AC1, AC5)
 * - Returns only after transaction commits (AC1)
 * - Uses append-only INSERT (no ON CONFLICT) for zero UPSERT overhead (AC3)
 * - Emits structured logs with performance metrics (AC8)
 * - Throws PartitionNotFoundError if target partition missing (AC7)
 *
 * @param records - Array of money flow records with event_timestamp for partition routing
 * @param options - Optional configuration (table name for testing, default: 'money_flow_history')
 * @returns Promise resolving to row count and duration metrics
 */
/**
 * Helper function to insert money flow history records using an existing client
 */
const insertMoneyFlowHistoryWithClient = async (
  records: MoneyFlowRecord[],
  tableName: string,
  client: PoolClient
): Promise<{ rowCount: number; duration: number }> => {
  const startTime = performance.now()

  // Group records by partition (event_timestamp date)
  const recordsByPartition = new Map<string, MoneyFlowRecord[]>()

  for (const record of records) {
    const partitionName = getPartitionTableName(
      tableName,
      record.polling_timestamp
    )
    const existing = recordsByPartition.get(partitionName) ?? []
    existing.push(record)
    recordsByPartition.set(partitionName, existing)
  }

  let totalRowCount = 0

  // Insert to each partition separately (AC5)
  for (const [partitionName, partitionRecords] of recordsByPartition) {
    // Auto-create partition if missing (Task 1.2)
    const [firstRecord] = partitionRecords
    if (firstRecord === undefined) {
      throw new Error('Partition records array is empty')
    }
    await validatePartitionBeforeWrite(tableName, firstRecord.polling_timestamp)

    // Build parameterized multi-row INSERT (AC3)
    const values: unknown[] = []
    const valueRows: string[] = []
    let paramIndex = 1

    for (const record of partitionRecords) {
      valueRows.push(
        `($${String(paramIndex)}, $${String(paramIndex + 1)}, $${String(paramIndex + 2)}, $${String(paramIndex + 3)}, $${String(paramIndex + 4)}, $${String(paramIndex + 5)}, $${String(paramIndex + 6)}, $${String(paramIndex + 7)}, $${String(paramIndex + 8)}, $${String(paramIndex + 9)}, $${String(paramIndex + 10)}, $${String(paramIndex + 11)}, $${String(paramIndex + 12)}, $${String(paramIndex + 13)}, $${String(paramIndex + 14)})`
      )
      values.push(
        record.entrant_id,
        record.race_id,
        record.hold_percentage,
        record.bet_percentage ?? null,
        record.time_to_start,
        record.time_interval,
        record.interval_type,
        record.polling_timestamp,
        // event_timestamp: Semantically represents when betting event occurred.
        // Currently set to polling_timestamp (when we observed the data).
        // See messages.ts MoneyFlowRecord documentation for timestamp field semantics.
        record.polling_timestamp,
        record.win_pool_amount,
        record.place_pool_amount,
        record.win_pool_percentage ?? null,
        record.place_pool_percentage ?? null,
        record.incremental_win_amount,
        record.incremental_place_amount
      )
      paramIndex += 15
    }

    // Append-only INSERT (no ON CONFLICT clause) - AC3
    const sql = `
      INSERT INTO "${partitionName}" (
        entrant_id, race_id, hold_percentage, bet_percentage,
        time_to_start, time_interval, interval_type,
        polling_timestamp, event_timestamp,
        win_pool_amount, place_pool_amount,
        win_pool_percentage, place_pool_percentage,
        incremental_win_amount, incremental_place_amount
      ) VALUES ${valueRows.join(', ')}
    `

    const result = await client.query(sql, values)
    totalRowCount += result.rowCount ?? 0
  }

  const duration = performance.now() - startTime

  // Structured logging with performance metrics (AC8)
  logger.info(
    {
      table: tableName,
      partitions: Array.from(recordsByPartition.keys()),
      rowCount: totalRowCount,
      insert_ms: Math.round(duration),
      overBudget: duration >= 300,
    },
    'Money flow history INSERT completed'
  )

  if (duration >= 300) {
    logger.warn(
      {
        duration: Math.round(duration),
        rowCount: totalRowCount,
        partitions: Array.from(recordsByPartition.keys()),
      },
      'Money flow INSERT exceeded 300ms threshold'
    )
  }

  return { rowCount: totalRowCount, duration }
}

export const insertMoneyFlowHistory = async (
  records: MoneyFlowRecord[],
  options: { tableName?: string; client?: PoolClient } = {}
): Promise<{ rowCount: number; duration: number }> => {
  const tableName = options.tableName ?? 'money_flow_history'
  if (records.length === 0) {
    return { rowCount: 0, duration: 0 }
  }

  const startTime = performance.now()

  // Group records by partition (event_timestamp date)
  const recordsByPartition = new Map<string, MoneyFlowRecord[]>()

  for (const record of records) {
    const partitionName = getPartitionTableName(
      tableName,
      record.polling_timestamp
    )
    const existing = recordsByPartition.get(partitionName) ?? []
    existing.push(record)
    recordsByPartition.set(partitionName, existing)
  }

  // If a client is provided, use it directly; otherwise create a new transaction
  if (options.client !== undefined) {
    return await insertMoneyFlowHistoryWithClient(
      records,
      options.tableName ?? 'money_flow_history',
      options.client
    )
  }

  return withTransaction(async (client) => {
    let totalRowCount = 0

    // Insert to each partition separately (AC5)
    for (const [partitionName, partitionRecords] of recordsByPartition) {
      // Auto-create partition if missing (Task 1.2)
      const [firstRecord] = partitionRecords
      if (firstRecord === undefined) {
        throw new Error('Partition records array is empty')
      }
      await validatePartitionBeforeWrite(tableName, firstRecord.polling_timestamp)

      // Build parameterized multi-row INSERT (AC3)
      const values: unknown[] = []
      const valueRows: string[] = []
      let paramIndex = 1

      for (const record of partitionRecords) {
        valueRows.push(
          `($${String(paramIndex)}, $${String(paramIndex + 1)}, $${String(paramIndex + 2)}, $${String(paramIndex + 3)}, $${String(paramIndex + 4)}, $${String(paramIndex + 5)}, $${String(paramIndex + 6)}, $${String(paramIndex + 7)}, $${String(paramIndex + 8)}, $${String(paramIndex + 9)}, $${String(paramIndex + 10)}, $${String(paramIndex + 11)}, $${String(paramIndex + 12)}, $${String(paramIndex + 13)}, $${String(paramIndex + 14)})`
        )
        values.push(
          record.entrant_id,
          record.race_id,
          record.hold_percentage,
          record.bet_percentage ?? null,
          record.time_to_start,
          record.time_interval,
          record.interval_type,
          record.polling_timestamp,
          // event_timestamp: Semantically represents when betting event occurred.
          // Currently set to polling_timestamp (when we observed the data).
          // See messages.ts MoneyFlowRecord documentation for timestamp field semantics.
          record.polling_timestamp,
          record.win_pool_amount,
          record.place_pool_amount,
          record.win_pool_percentage ?? null,
          record.place_pool_percentage ?? null,
          record.incremental_win_amount,
          record.incremental_place_amount
        )
        paramIndex += 15
      }

      // Append-only INSERT (no ON CONFLICT clause) - AC3
      const sql = `
        INSERT INTO "${partitionName}" (
          entrant_id, race_id, hold_percentage, bet_percentage,
          time_to_start, time_interval, interval_type,
          polling_timestamp, event_timestamp,
          win_pool_amount, place_pool_amount,
          win_pool_percentage, place_pool_percentage,
          incremental_win_amount, incremental_place_amount
        ) VALUES ${valueRows.join(', ')}
      `

      const result = await client.query(sql, values)
      totalRowCount += result.rowCount ?? 0
    }

    const duration = performance.now() - startTime

    // Structured logging with performance metrics (AC8)
    logger.info(
      {
        table: tableName,
        partitions: Array.from(recordsByPartition.keys()),
        rowCount: totalRowCount,
        insert_ms: Math.round(duration),
        overBudget: duration >= 300,
      },
      'Money flow history INSERT completed'
    )

    if (duration >= 300) {
      logger.warn(
        {
          duration: Math.round(duration),
          rowCount: totalRowCount,
          partitions: Array.from(recordsByPartition.keys()),
        },
        'Money flow INSERT exceeded 300ms threshold'
      )
    }

    return { rowCount: totalRowCount, duration }
  })
}

/**
 * Insert odds history records to partitioned time-series table (AC2)
 *
 * - Mirrors money flow behavior with identical batching and partition logic (AC2)
 * - Appends rows to correct daily partition based on event_timestamp (AC2, AC5)
 * - Returns only after transaction commits (AC2)
 * - Uses append-only INSERT (no ON CONFLICT) for zero UPSERT overhead (AC3)
 * - Emits structured logs with performance metrics (AC8)
 * - Throws PartitionNotFoundError if target partition missing (AC7)
 *
 * @param records - Array of odds records with event_timestamp for partition routing
 * @param options - Optional configuration (table name for testing, default: 'odds_history')
 * @returns Promise resolving to row count and duration metrics
 */
/**
 * Helper function to insert odds history records using an existing client
 */
const insertOddsHistoryWithClient = async (
  records: OddsRecord[],
  tableName: string,
  client: PoolClient
): Promise<{ rowCount: number; duration: number }> => {
  const startTime = performance.now()

  // Group records by partition (event_timestamp date)
  const recordsByPartition = new Map<string, OddsRecord[]>()

  for (const record of records) {
    const partitionName = getPartitionTableName(
      tableName,
      record.event_timestamp
    )
    const existing = recordsByPartition.get(partitionName) ?? []
    existing.push(record)
    recordsByPartition.set(partitionName, existing)
  }

  let totalRowCount = 0

  // Insert to each partition separately (AC5)
  for (const [partitionName, partitionRecords] of recordsByPartition) {
    // Auto-create partition if missing (Task 1.2)
    const [firstRecord] = partitionRecords
    if (firstRecord === undefined) {
      throw new Error('Partition records array is empty')
    }
    await validatePartitionBeforeWrite(tableName, firstRecord.event_timestamp)

    // Build parameterized multi-row INSERT (AC3)
    const values: unknown[] = []
    const valueRows: string[] = []
    let paramIndex = 1

    for (const record of partitionRecords) {
      valueRows.push(
        `($${String(paramIndex)}, $${String(paramIndex + 1)}, $${String(paramIndex + 2)}, $${String(paramIndex + 3)})`
      )
      values.push(
        record.entrant_id,
        record.odds,
        record.type,
        record.event_timestamp
      )
      paramIndex += 4
    }

    // Append-only INSERT (no ON CONFLICT clause) - AC3
    const sql = `
      INSERT INTO "${partitionName}" (
        entrant_id, odds, type, event_timestamp
      ) VALUES ${valueRows.join(', ')}
    `

    const result = await client.query(sql, values)
    totalRowCount += result.rowCount ?? 0
  }

  const duration = performance.now() - startTime

  // Structured logging with performance metrics (AC8)
  logger.info(
    {
      table: tableName,
      partitions: Array.from(recordsByPartition.keys()),
      rowCount: totalRowCount,
      insert_ms: Math.round(duration),
      overBudget: duration >= 300,
    },
    'Odds history INSERT completed'
  )

  if (duration >= 300) {
    logger.warn(
      {
        duration: Math.round(duration),
        rowCount: totalRowCount,
        partitions: Array.from(recordsByPartition.keys()),
      },
      'Odds INSERT exceeded 300ms threshold'
    )
  }

  return { rowCount: totalRowCount, duration }
}

export const insertOddsHistory = async (
  records: OddsRecord[],
  options: { tableName?: string; client?: PoolClient } = {}
): Promise<{ rowCount: number; duration: number }> => {
  const tableName = options.tableName ?? 'odds_history'
  if (records.length === 0) {
    return { rowCount: 0, duration: 0 }
  }

  // Group records by partition (event_timestamp date)
  const recordsByPartition = new Map<string, OddsRecord[]>()

  for (const record of records) {
    const partitionName = getPartitionTableName(
      tableName,
      record.event_timestamp
    )
    const existing = recordsByPartition.get(partitionName) ?? []
    existing.push(record)
    recordsByPartition.set(partitionName, existing)
  }

  return options.client !== undefined
    ? insertOddsHistoryWithClient(records, tableName, options.client)
    : withTransaction(async (client) =>
        insertOddsHistoryWithClient(records, tableName, client)
      )
}
