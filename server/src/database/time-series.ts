import type { PoolClient } from 'pg'
import { logger } from '../shared/logger.js'
import { withTransaction, DatabaseWriteError } from './bulk-upsert.js'
import type { MoneyFlowRecord } from '../workers/messages.js'

/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Odds record for odds_history time-series table
 *
 * **Timestamp Field:**
 * - `event_timestamp`: Represents when the odds observation occurred.
 *   Set to race start time (from race_date_nz + start_time_nz) for accurate
 *   temporal tracking and partition routing. See race-processor.ts for implementation.
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
 */
export const getPartitionTableName = (
  baseTable: string,
  eventTimestamp: string
): string => {
  const date = new Date(eventTimestamp)
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
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
export const insertMoneyFlowHistory = async (
  records: MoneyFlowRecord[],
  options: { tableName?: string } = {}
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

  return withTransaction(async (client) => {
    let totalRowCount = 0

    // Insert to each partition separately (AC5)
    for (const [partitionName, partitionRecords] of recordsByPartition) {
      // Verify partition exists before INSERT (AC5)
      const exists = await verifyPartitionExists(client, partitionName)

      if (!exists) {
        const [firstRecord] = partitionRecords
        if (firstRecord === undefined) {
          throw new Error('No records found for partition')
        }
        throw new PartitionNotFoundError(
          tableName,
          partitionName,
          firstRecord.polling_timestamp
        )
      }

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
        INSERT INTO ${partitionName} (
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
export const insertOddsHistory = async (
  records: OddsRecord[],
  options: { tableName?: string } = {}
): Promise<{ rowCount: number; duration: number }> => {
  const tableName = options.tableName ?? 'odds_history'
  if (records.length === 0) {
    return { rowCount: 0, duration: 0 }
  }

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

  return withTransaction(async (client) => {
    let totalRowCount = 0

    // Insert to each partition separately (AC5)
    for (const [partitionName, partitionRecords] of recordsByPartition) {
      // Verify partition exists before INSERT (AC5)
      const exists = await verifyPartitionExists(client, partitionName)

      if (!exists) {
        const [firstRecord] = partitionRecords
        if (firstRecord === undefined) {
          throw new Error('No records found for partition')
        }
        throw new PartitionNotFoundError(
          tableName,
          partitionName,
          firstRecord.event_timestamp
        )
      }

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
        INSERT INTO ${partitionName} (
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
  })
}
