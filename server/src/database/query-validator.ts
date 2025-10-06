import type { Pool, QueryResult } from 'pg'
import { logger } from '../shared/logger.js'

/**
 * Result of EXPLAIN ANALYZE validation
 */
export interface ExplainResult {
  query: string
  usesIndex: boolean
  scanType: string
  explainOutput: string[]
}

/**
 * Representative queries for index validation
 */
export const representativeQueries = {
  racesStartTime: `
    SELECT * FROM races
    WHERE start_time > NOW()
      AND status IN ('open', 'interim', 'closed')
    ORDER BY start_time
    LIMIT 10
  `,
  entrantsRace: `
    SELECT * FROM entrants
    WHERE EXISTS (SELECT 1 FROM races WHERE races.race_id = entrants.race_id LIMIT 1)
    LIMIT 10
  `,
  entrantsActive: `
    SELECT * FROM entrants
    WHERE is_scratched = false
    LIMIT 10
  `,
  meetingsDateType: `
    SELECT * FROM meetings
    WHERE date >= CURRENT_DATE - INTERVAL '7 days'
      AND race_type = 'thoroughbred'
      AND status = 'active'
    LIMIT 10
  `,
  moneyFlowHistory: `
    SELECT * FROM money_flow_history
    WHERE entrant_id IN (SELECT entrant_id FROM entrants LIMIT 1)
      AND event_timestamp > NOW() - INTERVAL '1 day'
    ORDER BY event_timestamp DESC
    LIMIT 50
  `,
  oddsHistory: `
    SELECT * FROM odds_history
    WHERE entrant_id IN (SELECT entrant_id FROM entrants LIMIT 1)
      AND event_timestamp > NOW() - INTERVAL '1 day'
    ORDER BY event_timestamp DESC
    LIMIT 50
  `,
} as const

/**
 * Parse EXPLAIN ANALYZE output to determine if index is used
 * @param explainOutput - Array of EXPLAIN ANALYZE result rows
 * @returns Object with scan type and index usage flag
 */
export const parseExplainOutput = (
  explainOutput: string[]
): { usesIndex: boolean; scanType: string } => {
  const output = explainOutput.join('\n')

  // Check for index scan types (positive indicators)
  const hasIndexScan = /Index Scan|Bitmap Index Scan/i.test(output)

  // Determine scan type for logging
  let scanType = 'Unknown'
  const indexScanRegex = /Index Scan using (\w+)/i
  const bitmapScanRegex = /Bitmap Index Scan on (\w+)/i
  const indexScanMatch = indexScanRegex.exec(output)
  const bitmapScanMatch = bitmapScanRegex.exec(output)

  if (indexScanMatch !== null) {
    const [matchedScanType] = indexScanMatch
    scanType = matchedScanType
  } else if (bitmapScanMatch !== null) {
    const [matchedScanType] = bitmapScanMatch
    scanType = matchedScanType
  } else {
    scanType = 'Seq Scan'
  }

  return {
    usesIndex: hasIndexScan,
    scanType,
  }
}

/**
 * Validate index usage for a given query using EXPLAIN ANALYZE
 * @param pool - PostgreSQL connection pool
 * @param query - SQL query to validate
 * @returns ExplainResult with index usage details
 */
export const validateIndexUsage = async (
  pool: Pool,
  query: string
): Promise<ExplainResult> => {
  try {
    const explainQuery = `EXPLAIN ANALYZE ${query}`
    const result: QueryResult<{
      /* eslint-disable-next-line @typescript-eslint/naming-convention */
      'QUERY PLAN': string
    }> = await pool.query(explainQuery)

    const explainOutput = result.rows.map((row) => row['QUERY PLAN'])
    const { usesIndex, scanType } = parseExplainOutput(explainOutput)

    logger.info(
      {
        query: query.trim().slice(0, 100),
        usesIndex,
        scanType,
      },
      'Index validation completed'
    )

    return {
      query: query.trim(),
      usesIndex,
      scanType,
      explainOutput,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logger.error(
      {
        query: query.trim().slice(0, 100),
        error: errorMessage,
      },
      'Index validation failed'
    )

    throw new Error(`Failed to validate index usage: ${errorMessage}`)
  }
}

/**
 * Validate all representative queries for index usage
 * @param pool - PostgreSQL connection pool
 * @returns Array of ExplainResult for all queries
 */
export const validateAllIndexes = async (
  pool: Pool
): Promise<ExplainResult[]> => {
  const results: ExplainResult[] = []

  for (const [name, query] of Object.entries(representativeQueries)) {
    try {
      const result = await validateIndexUsage(pool, query)
      results.push(result)

      logger.info(
        {
          queryName: name,
          usesIndex: result.usesIndex,
          scanType: result.scanType,
        },
        'Query validation result'
      )
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'

      logger.error(
        {
          queryName: name,
          error: errorMessage,
        },
        'Query validation failed'
      )
    }
  }

  return results
}
