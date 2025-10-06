import type { Pool } from 'pg'
import format from 'pg-format'
import { logger } from '../shared/logger.js'

/**
 * Generate partition name for a given table and date
 * @param tableName - Base table name (e.g., 'money_flow_history')
 * @param date - Date for partition
 * @returns Partition name in format {tableName}_YYYY_MM_DD
 */
export const getPartitionName = (tableName: string, date: Date): string => {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${tableName}_${year}_${month}_${day}`
}

/**
 * Create partitions for tomorrow for all partitioned tables
 * Idempotent: Safe to run multiple times (uses CREATE IF NOT EXISTS)
 * @param pool - PostgreSQL connection pool
 * @returns Array of created partition names
 */
export const createTomorrowPartitions = async (
  pool: Pool
): Promise<string[]> => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const tables = ['money_flow_history', 'odds_history']
  const createdPartitions: string[] = []

  for (const tableName of tables) {
    const partitionName = getPartitionName(tableName, tomorrow)
    const [startDate] = tomorrow.toISOString().split('T')
    const endDate = new Date(tomorrow)
    endDate.setDate(endDate.getDate() + 1)
    const [endDateStr] = endDate.toISOString().split('T')

    try {
      // Create partition using pg-format for safe SQL generation
      const sql = format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
        partitionName,
        tableName,
        startDate,
        endDateStr
      )

      await pool.query(sql)
      createdPartitions.push(partitionName)

      logger.info({ partitionName, tableName }, 'Partition created successfully')
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'

      // Log error but continue with other partitions
      logger.error(
        { partitionName, tableName, error: errorMessage },
        'Failed to create partition'
      )

      // Re-throw only if it's not a "already exists" error (idempotent behavior)
      if (!errorMessage.includes('already exists')) {
        throw error
      }
    }
  }

  return createdPartitions
}
