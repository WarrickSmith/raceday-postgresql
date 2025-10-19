/* eslint-disable @typescript-eslint/naming-convention */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import type { Server } from 'node:http'

import { createServer } from '../../../src/api/server.js'
import { pool } from '../../../src/database/pool.js'

const TEST_PORT = 7011
const BASE_URL = `http://localhost:${String(TEST_PORT)}`

const setupTables = async (): Promise<void> => {
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
    CREATE TABLE IF NOT EXISTS money_flow_history_2025_10_05 PARTITION OF money_flow_history
    FOR VALUES FROM ('2025-10-05') TO ('2025-10-06')
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS odds_history_2025_10_05 PARTITION OF odds_history
    FOR VALUES FROM ('2025-10-05') TO ('2025-10-06')
  `)
}

const truncateTables = async (): Promise<void> => {
  await pool.query('TRUNCATE TABLE odds_history RESTART IDENTITY CASCADE')
  await pool.query('TRUNCATE TABLE money_flow_history RESTART IDENTITY CASCADE')
  await pool.query('TRUNCATE TABLE race_pools RESTART IDENTITY CASCADE')
  await pool.query('TRUNCATE TABLE entrants RESTART IDENTITY CASCADE')
  await pool.query('TRUNCATE TABLE races RESTART IDENTITY CASCADE')
  await pool.query('TRUNCATE TABLE meetings RESTART IDENTITY CASCADE')
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

    await pool.query(
      `INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
       VALUES ($1, $2, $3, $4, $5, $6)` ,
      ['NZ-AUK-20251005', 'Auckland', 'NZ', 'thoroughbred', '2025-10-05', 'active']
    )

    await pool.query(
      `INSERT INTO races (race_id, meeting_id, name, race_number, start_time, status)
       VALUES ($1, $2, $3, $4, $5, $6)` ,
      [
        'NZ-AUK-20251005-R1',
        'NZ-AUK-20251005',
        'Race 1 - Maiden',
        1,
        '2025-10-05T12:00:00Z',
        'open',
      ]
    )

    await pool.query(
      `INSERT INTO race_pools (race_id, win_pool_total, place_pool_total, quinella_pool_total, trifecta_pool_total)
       VALUES ($1, $2, $3, $4, $5)` ,
      ['NZ-AUK-20251005-R1', 50000, 30000, 10000, 5000]
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
       ('ENT-001', 3.50, 'fixed_win', '2025-10-05T11:59:00Z'),
       ('ENT-001', 3.40, 'fixed_win', '2025-10-05T11:58:30Z'),
       ('ENT-002', 4.10, 'fixed_win', '2025-10-05T11:59:00Z')`
    )

    await pool.query(
      `INSERT INTO money_flow_history (entrant_id, race_id, hold_percentage, win_pool_amount, event_timestamp, polling_timestamp)
       VALUES
       ('ENT-001', 'NZ-AUK-20251005-R1', 15.2, 50000, '2025-10-05T11:59:00Z', '2025-10-05T11:59:00Z'),
       ('ENT-001', 'NZ-AUK-20251005-R1', 15.8, 52000, '2025-10-05T11:58:30Z', '2025-10-05T11:58:30Z'),
       ('ENT-002', 'NZ-AUK-20251005-R1', 12.3, 43000, '2025-10-05T11:59:00Z', '2025-10-05T11:59:00Z')`
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
    const response = await fetch(`${BASE_URL}/api/races?meetingId=NZ-AUK-20251005`)
    const duration = performance.now() - start

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>[]
    expect(body).toHaveLength(1)

    const [race] = body
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
    const response = await fetch(`${BASE_URL}/api/entrants?raceId=NZ-AUK-20251005-R1`)
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
    expect(moneyHistory).toHaveLength(2)
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
})

/* eslint-enable @typescript-eslint/naming-convention */
