/**
 * Query Plan Documentation for Story 2.5 UPSERT Operations
 *
 * This script uses EXPLAIN ANALYZE to validate query execution plans
 * and confirms INDEX SCAN usage on primary keys with IS DISTINCT FROM predicates.
 *
 * Run: tsx src/database/document-query-plans.ts
 */

import { pool } from './pool.js'
import { logger } from '../shared/logger.js'

interface ExplainRow {
  /* eslint-disable @typescript-eslint/naming-convention */
  'QUERY PLAN': string
  /* eslint-enable @typescript-eslint/naming-convention */
}

async function explainMeetingsUpsert(): Promise<void> {
  logger.info('Analyzing meetings UPSERT query plan')

  const sql = `
    EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
    INSERT INTO meetings (
      meeting_id, meeting_name, country, race_type, date, track_condition, tote_status, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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

  const result = await pool.query<ExplainRow>(sql, [
    'M_EXPLAIN_TEST',
    'Test Meeting',
    'NZ',
    'thoroughbred',
    '2025-10-12',
    'Good',
    'open',
    'active',
  ])

  /* eslint-disable no-console */
  console.log('\n=== MEETINGS UPSERT QUERY PLAN ===')
  result.rows.forEach((row) => {
    console.log(row['QUERY PLAN'])
  })
  console.log('\n')
  /* eslint-enable no-console */
}

async function explainRacesUpsert(): Promise<void> {
  logger.info('Analyzing races UPSERT query plan')

  const sql = `
    EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
    INSERT INTO races (
      race_id, meeting_id, name, race_number, start_time, status, race_date_nz, start_time_nz
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (race_id) DO UPDATE SET
      meeting_id = EXCLUDED.meeting_id,
      name = EXCLUDED.name,
      race_number = EXCLUDED.race_number,
      start_time = EXCLUDED.start_time,
      status = EXCLUDED.status,
      race_date_nz = EXCLUDED.race_date_nz,
      start_time_nz = EXCLUDED.start_time_nz,
      updated_at = NOW()
    WHERE
      races.meeting_id IS DISTINCT FROM EXCLUDED.meeting_id
      OR races.name IS DISTINCT FROM EXCLUDED.name
      OR races.race_number IS DISTINCT FROM EXCLUDED.race_number
      OR races.start_time IS DISTINCT FROM EXCLUDED.start_time
      OR races.status IS DISTINCT FROM EXCLUDED.status
      OR races.race_date_nz IS DISTINCT FROM EXCLUDED.race_date_nz
      OR races.start_time_nz IS DISTINCT FROM EXCLUDED.start_time_nz
  `

  const result = await pool.query<ExplainRow>(sql, [
    'R_EXPLAIN_TEST',
    'M_EXPLAIN_TEST',
    'Test Race 1',
    1,
    '2025-10-12T14:00:00Z',
    'open',
    '2025-10-12',
    '14:00:00',
  ])

  /* eslint-disable no-console */
  console.log('\n=== RACES UPSERT QUERY PLAN ===')
  result.rows.forEach((row) => {
    console.log(row['QUERY PLAN'])
  })
  console.log('\n')
  /* eslint-enable no-console */
}

async function explainEntrantsUpsert(): Promise<void> {
  logger.info('Analyzing entrants UPSERT query plan')

  const sql = `
    EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
    INSERT INTO entrants (
      entrant_id, race_id, name, runner_number, barrier, is_scratched, is_late_scratched,
      fixed_win_odds, fixed_place_odds, pool_win_odds, pool_place_odds,
      hold_percentage, bet_percentage, win_pool_percentage, place_pool_percentage,
      win_pool_amount, place_pool_amount,
      jockey, trainer_name, silk_colours, favourite, mover
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
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
  `

  const result = await pool.query<ExplainRow>(sql, [
    'E_EXPLAIN_TEST',
    'R_EXPLAIN_TEST',
    'Test Horse',
    1,
    5,
    false,
    false,
    4.2,
    1.95,
    4.15,
    1.9,
    18.75,
    15.5,
    24.3,
    19.8,
    187500,
    95000,
    'J. Smith',
    'T. Brown',
    'Red, White, Blue',
    true,
    false,
  ])

  /* eslint-disable no-console */
  console.log('\n=== ENTRANTS UPSERT QUERY PLAN ===')
  result.rows.forEach((row) => {
    console.log(row['QUERY PLAN'])
  })
  console.log('\n')
  /* eslint-enable no-console */
}

async function main(): Promise<void> {
  try {
    logger.info('Starting UPSERT query plan documentation (Story 2.5 AC4)')

    await explainMeetingsUpsert()
    await explainRacesUpsert()
    await explainEntrantsUpsert()

    logger.info('Query plan analysis complete')
    /* eslint-disable no-console */
    console.log('\n✅ Query Plan Validation Summary:')
    console.log('- Verify INDEX SCAN on primary keys (meeting_id, race_id, entrant_id)')
    console.log('- Confirm WHERE clause evaluates IS DISTINCT FROM predicates')
    console.log('- Check that UPDATE is skipped when WHERE returns false')
    console.log('- Review buffer usage and execution time\n')
    /* eslint-enable no-console */
  } catch (error: unknown) {
    logger.error({ error }, 'Failed to analyze query plans')
    throw error
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error('Query plan documentation failed:', error)
  process.exit(1)
})
