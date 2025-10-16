/**
 * Odds Change Detection Utilities
 * Prevents duplicate odds records by detecting significant changes
 */

import type { PoolClient } from 'pg'
import { logger } from '../shared/logger.js'
import type { OddsRecord } from '../database/time-series.js'

/**
 * Last odds snapshot cache for change detection
 * Map: entrant_id:odds_type -> { odds: number; timestamp: string }
 */
interface OddsSnapshot {
  odds: number
  timestamp: string
}

const lastOddsSnapshot = new Map<string, OddsSnapshot>()

/**
 * Determine if an odds record should be inserted based on change detection (Task 5.1)
 *
 * Only inserts odds records when:
 * 1. No previous snapshot exists for this entrant/odds_type combination
 * 2. Current odds differ from previous odds by more than 0.01
 *
 * @param record - Current odds record to evaluate
 * @param minimumChange - Minimum odds change threshold (default: 0.01)
 * @returns True if record should be inserted, false otherwise
 */
export function shouldInsertOddsRecord(
  record: OddsRecord,
  minimumChange: number = 0.01
): boolean {
  const key = `${record.entrant_id}:${record.type}`
  const previous = lastOddsSnapshot.get(key)

  // No previous snapshot - always insert
  if (previous === undefined) {
    lastOddsSnapshot.set(key, {
      odds: record.odds,
      timestamp: record.event_timestamp
    })
    return true
  }

  // Check if odds changed significantly
  const oddsDiff = Math.abs(record.odds - previous.odds)
  if (oddsDiff > minimumChange) {
    lastOddsSnapshot.set(key, {
      odds: record.odds,
      timestamp: record.event_timestamp
    })

    logger.debug('Odds change detected', {
      entrant_id: record.entrant_id,
      odds_type: record.type,
      previous_odds: previous.odds,
      current_odds: record.odds,
      change: oddsDiff,
      threshold: minimumChange
    })

    return true
  }

  // No significant change - skip insertion
  logger.debug('Odds unchanged - skipping insertion', {
    entrant_id: record.entrant_id,
    odds_type: record.type,
    odds: record.odds,
    change: oddsDiff,
    threshold: minimumChange
  })

  return false
}

/**
 * Filter odds records to only include those with significant changes (Task 5.2)
 *
 * @param records - Array of odds records to filter
 * @param minimumChange - Minimum odds change threshold
 * @returns Filtered array of odds records with significant changes
 */
export function filterSignificantOddsChanges(
  records: OddsRecord[],
  minimumChange: number = 0.01
): OddsRecord[] {
  const filtered = records.filter(record => shouldInsertOddsRecord(record, minimumChange))

  const skippedCount = records.length - filtered.length
  if (skippedCount > 0) {
    logger.info('Filtered out unchanged odds records', {
      total_records: records.length,
      inserted_records: filtered.length,
      skipped_records: skippedCount,
      filter_rate: (skippedCount / records.length * 100).toFixed(1) + '%'
    })
  }

  return filtered
}

/**
 * Query and cache previous odds from database for enhanced change detection
 *
 * @param client - Database client for querying
 * @param entrantIds - Array of entrant IDs to query
 * @param eventTimestamp - Current event timestamp for time-based filtering
 * @returns Promise resolving when odds snapshot cache is populated
 */
export async function populateOddsSnapshotFromDatabase(
  client: PoolClient,
  entrantIds: string[],
  eventTimestamp: string
): Promise<void> {
  if (entrantIds.length === 0) {
    return
  }

  try {
    // Get partition name for the current event timestamp
    const date = new Date(eventTimestamp)
    const year = String(date.getFullYear())
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const partitionName = `odds_history_${year}_${month}_${day}`

    // Query the most recent odds for each entrant from today's partition
    const query = `
      SELECT DISTINCT ON (entrant_id, type)
        entrant_id,
        odds,
        type,
        event_timestamp
      FROM ${partitionName}
      WHERE entrant_id = ANY($1)
        AND event_timestamp <= $2
      ORDER BY entrant_id, type, event_timestamp DESC
    `

    const result = await client.query(query, [entrantIds, eventTimestamp])

    // Populate the snapshot cache with query results
    for (const row of result.rows) {
      const key = `${row.entrant_id}:${row.type}`
      lastOddsSnapshot.set(key, {
        odds: row.odds,
        timestamp: row.event_timestamp
      })
    }

    logger.debug('Populated odds snapshot from database', {
      entrant_count: entrantIds.length,
      cached_records: result.rows.length,
      partition: partitionName,
      event_timestamp: eventTimestamp
    })

  } catch (error) {
    logger.warn('Failed to populate odds snapshot from database', {
      entrant_count: entrantIds.length,
      event_timestamp: eventTimestamp,
      error: error instanceof Error ? error.message : String(error)
    })
    // Continue without database snapshot - will work with in-memory cache only
  }
}

/**
 * Clear odds snapshot cache for testing or cleanup
 */
export function clearOddsSnapshot(): void {
  lastOddsSnapshot.clear()
  logger.debug('Odds snapshot cache cleared')
}

/**
 * Get current odds snapshot statistics for monitoring
 */
export function getOddsSnapshotStats(): {
  totalEntries: number
  entrantCount: number
  oddsTypes: string[]
} {
  const entrantIds = new Set<string>()
  const oddsTypes = new Set<string>()

  for (const [key] of lastOddsSnapshot.entries()) {
    const [entrantId, oddsType] = key.split(':')
    entrantIds.add(entrantId)
    oddsTypes.add(oddsType)
  }

  return {
    totalEntries: lastOddsSnapshot.size,
    entrantCount: entrantIds.size,
    oddsTypes: Array.from(oddsTypes)
  }
}