/* eslint-disable @typescript-eslint/naming-convention */
import type { OddsRecord } from '../database/time-series.js'
import type { TransformedRace } from '../workers/messages.js'

/**
 * Resolve the timestamp used when emitting odds history entries for a transformed race.
 * Prefers the normalized race metadata, then the first money flow polling timestamp,
 * and finally falls back to the current time when upstream data is incomplete.
 */
export const resolveOddsEventTimestamp = (
  transformed: TransformedRace
): string => {
  const raceMeta = transformed.race
  if (raceMeta != null) {
    // Create a timestamp at midnight for the NZ race date without timezone offset
    // This ensures odds records go into the correct NZ day partition
    // The date is already in NZ timezone from the NZTAB API (race_date_nz field)
    // We preserve it as-is to match the partition naming convention
    return `${raceMeta.race_date_nz}T00:00:00.000Z`
  }

  const [firstMoneyFlowRecord] = transformed.moneyFlowRecords
  if (firstMoneyFlowRecord != null) {
    return firstMoneyFlowRecord.polling_timestamp
  }

  return new Date().toISOString()
}

/**
 * Build structured odds records for persistence based on transformed entrants.
 * Generates distinct entries for fixed and pool odds, aligned to the resolved event timestamp.
 */
export const buildOddsRecords = (
  transformed: TransformedRace
): OddsRecord[] => {
  const eventTimestamp = resolveOddsEventTimestamp(transformed)
  const records: OddsRecord[] = []

  for (const entrant of transformed.entrants) {
    // Fixed win odds
    if (
      entrant.fixed_win_odds !== undefined &&
      entrant.fixed_win_odds !== null
    ) {
      records.push({
        entrant_id: entrant.entrant_id,
        odds: entrant.fixed_win_odds,
        type: 'fixed_win',
        event_timestamp: eventTimestamp,
      })
    }

    // Fixed place odds
    if (
      entrant.fixed_place_odds !== undefined &&
      entrant.fixed_place_odds !== null
    ) {
      records.push({
        entrant_id: entrant.entrant_id,
        odds: entrant.fixed_place_odds,
        type: 'fixed_place',
        event_timestamp: eventTimestamp,
      })
    }

    // Pool win odds
    if (entrant.pool_win_odds !== undefined && entrant.pool_win_odds !== null) {
      records.push({
        entrant_id: entrant.entrant_id,
        odds: entrant.pool_win_odds,
        type: 'pool_win',
        event_timestamp: eventTimestamp,
      })
    }

    // Pool place odds
    if (
      entrant.pool_place_odds !== undefined &&
      entrant.pool_place_odds !== null
    ) {
      records.push({
        entrant_id: entrant.entrant_id,
        odds: entrant.pool_place_odds,
        type: 'pool_place',
        event_timestamp: eventTimestamp,
      })
    }
  }

  return records
}
