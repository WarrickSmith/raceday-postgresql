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
  minimumChange = 0.01
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

    logger.debug({
      entrantId: record.entrant_id,
      oddsType: record.type,
      previousOdds: previous.odds,
      currentOdds: record.odds,
      change: oddsDiff,
      threshold: minimumChange
    }, 'Odds change detected')

    return true
  }

  // No significant change - skip insertion
  logger.debug({
    entrantId: record.entrant_id,
    oddsType: record.type,
    odds: record.odds,
    change: oddsDiff,
    threshold: minimumChange
  }, 'Odds unchanged - skipping insertion')

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
  minimumChange = 0.01
): OddsRecord[] {
  const filtered = records.filter(record => shouldInsertOddsRecord(record, minimumChange))

  const skippedCount = records.length - filtered.length
  if (skippedCount > 0) {
    logger.info({
      totalRecords: records.length,
      insertedRecords: filtered.length,
      skippedRecords: skippedCount,
      filterRate: `${(skippedCount / records.length * 100).toFixed(1)}%`
    }, 'Filtered out unchanged odds records')
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
    /* eslint-disable @typescript-eslint/naming-convention */
    interface OddsRow {
      entrant_id: string
      odds: number
      type: string
      event_timestamp: string
    }
    /* eslint-enable @typescript-eslint/naming-convention */

    for (const row of result.rows as OddsRow[]) {
      const key = `${row.entrant_id}:${row.type}`
      lastOddsSnapshot.set(key, {
        odds: row.odds,
        timestamp: row.event_timestamp
      })
    }

    logger.debug({
      entrantCount: entrantIds.length,
      cachedRecords: result.rows.length,
      partition: partitionName,
      eventTimestamp
    }, 'Populated odds snapshot from database')

  } catch (error) {
    logger.warn({
      entrantCount: entrantIds.length,
      eventTimestamp,
      error: error instanceof Error ? error.message : String(error)
    }, 'Failed to populate odds snapshot from database')
    // Continue without database snapshot - will work with in-memory cache only
  }
}

/**
 * Clear odds snapshot cache for testing or cleanup
 */
export function clearOddsSnapshot(): void {
  lastOddsSnapshot.clear()
  logger.debug({}, 'Odds snapshot cache cleared')
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
    if (entrantId !== undefined) entrantIds.add(entrantId)
    if (oddsType !== undefined) oddsTypes.add(oddsType)
  }

  return {
    totalEntries: lastOddsSnapshot.size,
    entrantCount: entrantIds.size,
    oddsTypes: Array.from(oddsTypes)
  }
}