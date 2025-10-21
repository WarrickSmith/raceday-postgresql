/* eslint-disable @typescript-eslint/naming-convention */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import type { Server } from 'node:http'

import { createServer } from '../../../src/api/server.js'
import { pool } from '../../../src/database/pool.js'

const TEST_PORT = 7011
const BASE_URL = `http://localhost:${String(TEST_PORT)}`

const setupTables = async (): Promise<void> => {
  await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meetings (
      meeting_id TEXT PRIMARY KEY,
      meeting_name TEXT NOT NULL,
      country TEXT NOT NULL,
      race_type TEXT NOT NULL,
      date DATE NOT NULL,
      status TEXT NOT NULL
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS races (
      race_id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL REFERENCES meetings(meeting_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      race_number INTEGER NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS entrants (
      entrant_id TEXT PRIMARY KEY,
      race_id TEXT NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      runner_number INTEGER NOT NULL,
      win_odds NUMERIC(10,2),
      place_odds NUMERIC(10,2),
      hold_percentage NUMERIC(5,2),
      is_scratched BOOLEAN NOT NULL DEFAULT FALSE
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS race_pools (
      race_id TEXT PRIMARY KEY REFERENCES races(race_id) ON DELETE CASCADE,
      win_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      place_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      quinella_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      trifecta_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS race_results (
      race_id TEXT PRIMARY KEY REFERENCES races(race_id) ON DELETE CASCADE,
      results_available BOOLEAN NOT NULL DEFAULT FALSE,
      results_data JSONB,
      dividends_data JSONB,
      fixed_odds_data JSONB,
      result_status TEXT,
      photo_finish BOOLEAN NOT NULL DEFAULT FALSE,
      stewards_inquiry BOOLEAN NOT NULL DEFAULT FALSE,
      protest_lodged BOOLEAN NOT NULL DEFAULT FALSE,
      result_time TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_alert_configs (
      indicator_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      indicator_type TEXT NOT NULL,
      percentage_range_min NUMERIC(5,2) NOT NULL,
      percentage_range_max NUMERIC(5,2),
      color CHAR(7) NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 6),
      audible_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_alert_configs_user_display
      ON user_alert_configs(user_id, display_order)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS money_flow_history (
      id BIGSERIAL PRIMARY KEY,
      entrant_id TEXT NOT NULL REFERENCES entrants(entrant_id) ON DELETE CASCADE,
      race_id TEXT NOT NULL,
      hold_percentage NUMERIC(5,2),
      win_pool_amount BIGINT,
      event_timestamp TIMESTAMPTZ NOT NULL
    ) PARTITION BY RANGE (event_timestamp)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS odds_history (
      id BIGSERIAL PRIMARY KEY,
      entrant_id TEXT NOT NULL REFERENCES entrants(entrant_id) ON DELETE CASCADE,
      odds NUMERIC(10,2),
      type TEXT,
      event_timestamp TIMESTAMPTZ NOT NULL
    ) PARTITION BY RANGE (event_timestamp)
  `)

  await pool.query(`
    DO $$
    DECLARE
      partition_date DATE := CURRENT_DATE;
      partition_name TEXT := 'money_flow_history_' || TO_CHAR(partition_date, 'YYYY_MM_DD');
      start_range TEXT := partition_date::TEXT;
      end_range TEXT := (partition_date + INTERVAL '1 day')::DATE::TEXT;
    BEGIN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF money_flow_history FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        start_range,
        end_range
      );
    END $$;
  `)

  await pool.query(`
    DO $$
    DECLARE
      partition_date DATE := CURRENT_DATE;
      partition_name TEXT := 'odds_history_' || TO_CHAR(partition_date, 'YYYY_MM_DD');
      start_range TEXT := partition_date::TEXT;
      end_range TEXT := (partition_date + INTERVAL '1 day')::DATE::TEXT;
    BEGIN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF odds_history FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        start_range,
        end_range
      );
    END $$;
  `)
}

const truncateTables = async (): Promise<void> => {
  await pool.query('TRUNCATE TABLE odds_history RESTART IDENTITY CASCADE')
  await pool.query('TRUNCATE TABLE money_flow_history RESTART IDENTITY CASCADE')
  await pool.query('TRUNCATE TABLE race_pools RESTART IDENTITY CASCADE')
  await pool.query('TRUNCATE TABLE entrants RESTART IDENTITY CASCADE')
  await pool.query('TRUNCATE TABLE races RESTART IDENTITY CASCADE')
  await pool.query('TRUNCATE TABLE meetings RESTART IDENTITY CASCADE')
  await pool.query('TRUNCATE TABLE race_results RESTART IDENTITY CASCADE')
  await pool.query('TRUNCATE TABLE user_alert_configs RESTART IDENTITY CASCADE')
}

describe('Story 2.10D – client compatibility API', () => {
  let app: Express
  let server: Server

  beforeAll(async () => {
    app = createServer()
    await setupTables()
    server = app.listen(TEST_PORT)
  })

  afterAll(async () => {
    await truncateTables()
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err != null) {
          reject(err)
          return
        }
        resolve()
      })
    })
    await pool.end()
  })

  beforeEach(async () => {
    await truncateTables()

    const now = Date.now()
    const primaryRaceStartIso = new Date(now + 30 * 60_000).toISOString()
    const secondaryRaceStartIso = new Date(now + 90 * 60_000).toISOString()
    const bucketedEventIso = new Date(now - 5 * 60_000).toISOString()
    const bucketedEventIsoLate = new Date(now - 2 * 60_000).toISOString()
    const legacyEventIso = new Date(now - 15 * 60_000).toISOString()

    await pool.query(
      `INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
       VALUES ($1, $2, $3, $4, $5, $6)` ,
      ['NZ-AUK-20251005', 'Auckland', 'NZ', 'thoroughbred', '2025-10-05', 'active']
    )

    await pool.query(
      `INSERT INTO races (race_id, meeting_id, name, race_number, start_time, status)
       VALUES
       ($1, $2, $3, $4, $5, $6),
       ($7, $2, $8, $9, $10, $11)` ,
      [
        'NZ-AUK-20251005-R1',
        'NZ-AUK-20251005',
        'Race 1 - Maiden',
        1,
        primaryRaceStartIso,
        'open',
        'NZ-AUK-20251005-R2',
        'Race 2 - Handicap',
        2,
        secondaryRaceStartIso,
        'open',
      ]
    )

    await pool.query(
      `INSERT INTO race_pools (
        race_id,
        win_pool_total,
        place_pool_total,
        quinella_pool_total,
        trifecta_pool_total,
        exacta_pool_total,
        first4_pool_total,
        currency,
        data_quality_score,
        extracted_pools
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)` ,
      [
        'NZ-AUK-20251005-R1',
        50000,
        30000,
        10000,
        5000,
        2500,
        1500,
        '$',
        95,
        6,
      ]
    )

    await pool.query(
      `INSERT INTO entrants (entrant_id, race_id, name, runner_number, win_odds, place_odds, hold_percentage, is_scratched)
       VALUES
       ('ENT-001', 'NZ-AUK-20251005-R1', 'Thunder Bolt', 1, 3.50, 1.80, 15.2, FALSE),
       ('ENT-002', 'NZ-AUK-20251005-R1', 'Silver Arrow', 2, 4.10, 2.05, 12.3, FALSE)`
    )

    await pool.query(
      `INSERT INTO odds_history (entrant_id, odds, type, event_timestamp)
       VALUES
       ('ENT-001', 3.50, 'fixed_win', $1),
       ('ENT-001', 3.40, 'fixed_win', $2),
       ('ENT-002', 4.10, 'fixed_win', $1)`,
      [bucketedEventIso, bucketedEventIsoLate]
    )

    await pool.query(
      `INSERT INTO race_results (
        race_id,
        results_available,
        results_data,
        dividends_data,
        fixed_odds_data,
        result_status,
        photo_finish,
        stewards_inquiry,
        protest_lodged,
        result_time
      )
       VALUES (
        $1,
        TRUE,
        $2::jsonb,
        $3::jsonb,
        $4::jsonb,
        'final',
        FALSE,
        FALSE,
        FALSE,
        $5
       )`,
      [
        'NZ-AUK-20251005-R1',
        JSON.stringify([{ position: 1, entrant_id: 'ENT-001', margin: '0.2L' }]),
        JSON.stringify([{ pool: 'Win', dividend: 3.4 }]),
        JSON.stringify({ ENT_001: { fixed_win: 3.5, fixed_place: 1.8 } }),
        new Date(now + 45 * 60_000).toISOString(),
      ]
    )

    await pool.query(
      `INSERT INTO money_flow_history (
        entrant_id,
        race_id,
        type,
        time_interval,
        time_to_start,
        interval_type,
        hold_percentage,
        win_pool_amount,
        place_pool_amount,
        incremental_win_amount,
        incremental_place_amount,
        win_pool_percentage,
        place_pool_percentage,
        event_timestamp,
        polling_timestamp
      )
       VALUES
       ('ENT-001', 'NZ-AUK-20251005-R1', 'bucketed_aggregation', 5, NULL, 'pre', 15.2, 50000, 25000, 1500, 700, 52.5, 30.1, $1, $1),
       ('ENT-001', 'NZ-AUK-20251005-R1', 'bucketed_aggregation', 1, NULL, 'pre', 15.8, 52000, 26000, 1800, 900, 53.0, 31.0, $2, $2),
       ('ENT-001', 'NZ-AUK-20251005-R1', 'point_sample', NULL, 2, 'legacy', 16.0, 53000, 27000, 0, 0, 54.0, 32.0, $3, $3),
       ('ENT-002', 'NZ-AUK-20251005-R1', 'bucketed_aggregation', 5, NULL, 'pre', 12.3, 43000, 21000, 900, 500, 45.2, 28.4, $1, $1)
      `,
      [bucketedEventIso, bucketedEventIsoLate, legacyEventIso]
    )
  })

  afterEach(async () => {
    await truncateTables()
  })

  const assertSnakeCaseKeys = (payload: Record<string, unknown>): void => {
    for (const key of Object.keys(payload)) {
      expect(key).toMatch(/^[a-z0-9_]+$/)
    }
  }

  it('matches Appwrite meeting contract with snake_case fields (Subtasks 5.1-5.3)', async () => {
    const start = performance.now()
    const response = await fetch(`${BASE_URL}/api/meetings?date=2025-10-05&raceType=thoroughbred`)
    const duration = performance.now() - start

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>[]

    expect(body).toHaveLength(1)
    const [meeting] = body
    expect(meeting).toBeDefined()
    if (meeting === undefined) {
      throw new Error('Meeting response missing')
    }

    expect(meeting).toMatchObject({
      meeting_id: 'NZ-AUK-20251005',
      meeting_name: 'Auckland',
      country: 'NZ',
      race_type: 'thoroughbred',
      date: '2025-10-05',
      status: 'active',
    })

    assertSnakeCaseKeys(meeting)
    expect(duration).toBeLessThan(250)
  })

  it('returns races with ISO timestamps ready for client consumption (Subtasks 5.1, 5.4, 5.5)', async () => {
    const start = performance.now()
    const response = await fetch(`${BASE_URL}/api/races?meeting_id=NZ-AUK-20251005`)
    const duration = performance.now() - start

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>[]
    expect(body.length).toBeGreaterThanOrEqual(1)

    const race = body.find((entry) => entry.race_id === 'NZ-AUK-20251005-R1')
    expect(race).toBeDefined()
    if (race === undefined) {
      throw new Error('Race response missing')
    }
    expect(race).toMatchObject({
      race_id: 'NZ-AUK-20251005-R1',
      name: 'Race 1 - Maiden',
      race_number: 1,
      status: 'open',
      meeting_id: 'NZ-AUK-20251005',
    })

    assertSnakeCaseKeys(race)
    expect(typeof race.start_time).toBe('string')
    // Verify Pacific/Auckland timezone format (not UTC 'Z')
    expect(race.start_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/)
    expect(race.start_time).not.toContain('Z')
    // Verify the timestamp is parseable and represents correct time
    const parsedTime = new Date(race.start_time as string)
    expect(parsedTime.getTime()).not.toBeNaN()
    expect(duration).toBeLessThan(250)
  })

  it('serves entrants with odds and money flow history aligned to contract (Subtasks 5.1-5.6)', async () => {
    const start = performance.now()
    const response = await fetch(`${BASE_URL}/api/entrants?race_id=NZ-AUK-20251005-R1`)
    const duration = performance.now() - start

    expect(response.status).toBe(200)
    const entrants = (await response.json()) as Record<string, unknown>[]
    expect(entrants).toHaveLength(2)

    const thunderBolt = entrants.find((entrant) => entrant.entrant_id === 'ENT-001')
    expect(thunderBolt).toBeDefined()
    if (thunderBolt === undefined) {
      throw new Error('Thunder Bolt entrant missing')
    }

    assertSnakeCaseKeys(thunderBolt)

    expect(thunderBolt).toMatchObject({
      name: 'Thunder Bolt',
      runner_number: 1,
      win_odds: 3.5,
      place_odds: 1.8,
      hold_percentage: 15.2,
      is_scratched: false,
    })

    const oddsHistory = thunderBolt.odds_history as Record<string, unknown>[]
    expect(oddsHistory).toHaveLength(2)
    for (const entry of oddsHistory) {
      assertSnakeCaseKeys(entry)
      expect(typeof entry.timestamp).toBe('string')
      // Verify Pacific/Auckland timezone format (not UTC 'Z')
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/)
      expect(entry.timestamp).not.toContain('Z')
      // Verify the timestamp is parseable
      const parsedTime = new Date(entry.timestamp as string)
      expect(parsedTime.getTime()).not.toBeNaN()
    }

    const moneyHistory = thunderBolt.money_flow_history as Record<string, unknown>[]
    expect(moneyHistory.length).toBeGreaterThanOrEqual(2)
    for (const entry of moneyHistory) {
      assertSnakeCaseKeys(entry)
      expect(typeof entry.timestamp).toBe('string')
      // Verify Pacific/Auckland timezone format (not UTC 'Z')
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/)
      expect(entry.timestamp).not.toContain('Z')
      // Verify the timestamp is parseable
      const parsedTime = new Date(entry.timestamp as string)
      expect(parsedTime.getTime()).not.toBeNaN()
    }

    expect(duration).toBeLessThan(250)
  })

  it('returns 400 when key query parameters are missing', async () => {
    const racesResponse = await fetch(`${BASE_URL}/api/races`)
    expect(racesResponse.status).toBe(400)

    const entrantsResponse = await fetch(`${BASE_URL}/api/entrants`)
    expect(entrantsResponse.status).toBe(400)
  })

  it('returns race pool totals with comprehensive metrics (Task 9.3)', async () => {
    const response = await fetch(`${BASE_URL}/api/race-pools?race_id=NZ-AUK-20251005-R1`)
    expect(response.status).toBe(200)

    const body = (await response.json()) as Record<string, unknown>
    assertSnakeCaseKeys(body)

    expect(body).toMatchObject({
      race_id: 'NZ-AUK-20251005-R1',
      win_pool_total: 50000,
      place_pool_total: 30000,
      quinella_pool_total: 10000,
      trifecta_pool_total: 5000,
      exacta_pool_total: 2500,
      first4_pool_total: 1500,
      currency: '$',
      data_quality_score: 95,
      extracted_pools: 6,
    })
    expect(body.total_race_pool).toBe(50000 + 30000 + 10000 + 5000 + 2500 + 1500)
    expect(typeof body.last_updated).toBe('string')
  })

  it('returns race results payload with JSONB fields (Task 9.4)', async () => {
    const response = await fetch(`${BASE_URL}/api/race-results?race_id=NZ-AUK-20251005-R1`)
    expect(response.status).toBe(200)

    const body = (await response.json()) as Record<string, unknown>
    assertSnakeCaseKeys(body)

    expect(body).toMatchObject({
      race_id: 'NZ-AUK-20251005-R1',
      results_available: true,
      result_status: 'final',
      photo_finish: false,
      stewards_inquiry: false,
      protest_lodged: false,
    })

    expect(Array.isArray(body.results_data)).toBe(true)
    expect(Array.isArray(body.dividends_data)).toBe(true)
    expect(typeof body.fixed_odds_data).toBe('object')
    expect(typeof body.result_time).toBe('string')
  })

  it('returns bucketed money flow timeline data (Task 9.5)', async () => {
    const response = await fetch(
      `${BASE_URL}/api/money-flow-timeline?race_id=NZ-AUK-20251005-R1&entrants=ENT-001,ENT-002&pool_type=win&limit=10`
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>

    expect(body.success).toBe(true)
    expect(body.bucketed_data).toBe(true)
    expect(body.pool_type).toBe('win')

    const documents = body.documents as Record<string, unknown>[]
    expect(documents.length).toBeGreaterThanOrEqual(3)
    documents.forEach(assertSnakeCaseKeys)

    const [firstDoc] = documents
    expect(firstDoc).toBeDefined()
    if (firstDoc === undefined) {
      throw new Error('Timeline response missing first document')
    }
    expect(firstDoc.race_id).toBe('NZ-AUK-20251005-R1')
    expect(typeof firstDoc.time_interval === 'number' || typeof firstDoc.time_to_start === 'number').toBe(true)

    const intervalCoverage = body.interval_coverage as Record<string, unknown>
    expect(intervalCoverage.summary).toBeDefined()
    expect(body.next_cursor).not.toBeUndefined()
  })

  it('creates default user alert configs when none exist (Task 9.6)', async () => {
    const response = await fetch(`${BASE_URL}/api/user-alert-configs?userId=Test%20User`)
    expect(response.status).toBe(200)

    const body = (await response.json()) as Record<string, unknown>
    const indicators = body.indicators as Record<string, unknown>[]

    expect(indicators).toHaveLength(6)
    indicators.forEach((indicator, index) => {
      assertSnakeCaseKeys(indicator)
      expect(indicator.display_order).toBe(index + 1)
      expect(typeof indicator.color).toBe('string')
    })

    expect(body.toggle_all).toBe(true)
    expect(body.audible_alerts_enabled).toBe(true)
  })

  it('updates user alert configs with POST (Task 9.7)', async () => {
    const seedResponse = await fetch(`${BASE_URL}/api/user-alert-configs?userId=Workflow%20User`)
    const seedBody = (await seedResponse.json()) as Record<string, unknown>
    const indicators = seedBody.indicators as Record<string, unknown>[]

    const updatedIndicators = indicators.map((indicator, index) => ({
      ...indicator,
      enabled: index === 0 ? false : indicator.enabled,
      color: index === 0 ? '#FFFFFF' : indicator.color,
    }))

    const postResponse = await fetch(`${BASE_URL}/api/user-alert-configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: seedBody.user_id,
        indicators: updatedIndicators,
        audible_alerts_enabled: false,
      }),
    })

    expect(postResponse.status).toBe(200)
    const postBody = (await postResponse.json()) as Record<string, unknown>
    expect(postBody.success).toBe(true)

    const verifyResponse = await fetch(`${BASE_URL}/api/user-alert-configs?userId=${encodeURIComponent(seedBody.user_id as string)}`)
    const verifyBody = (await verifyResponse.json()) as Record<string, unknown>
    const verifyIndicators = verifyBody.indicators as Record<string, unknown>[]

    const firstIndicator = verifyIndicators.find((indicator) => indicator.display_order === 1)
    expect(firstIndicator?.enabled).toBe(false)
    expect(firstIndicator?.color).toBe('#FFFFFF')
    expect(verifyBody.audible_alerts_enabled).toBe(false)
  })

  it('returns upcoming races within the requested window (Task 9.8)', async () => {
    const response = await fetch(
      `${BASE_URL}/api/races/upcoming?window_minutes=180&lookback_minutes=1&limit=5`
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>

    const races = body.races as Record<string, unknown>[]
    expect(races.length).toBeGreaterThanOrEqual(2)

    const raceIds = races.map((race) => race.race_id)
    expect(raceIds).toContain('NZ-AUK-20251005-R1')
    expect(raceIds).toContain('NZ-AUK-20251005-R2')

    const windowInfo = body.window as Record<string, unknown>
    expect(windowInfo.window_minutes).toBe(180)
    expect(windowInfo.lookback_minutes).toBe(1)
  })

  it('returns the next scheduled race (Task 9.9)', async () => {
    const response = await fetch(`${BASE_URL}/api/races/next-scheduled`)
    expect(response.status).toBe(200)

    const body = (await response.json()) as Record<string, unknown> | null
    expect(body).not.toBeNull()
    if (body === null) {
      throw new Error('Expected next scheduled race payload')
    }

    expect(body.race_id).toBe('NZ-AUK-20251005-R1')
    expect(typeof body.start_time).toBe('string')
  })
})

/* eslint-enable @typescript-eslint/naming-convention */
