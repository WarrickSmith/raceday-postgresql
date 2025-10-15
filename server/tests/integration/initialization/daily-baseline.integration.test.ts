/* eslint-disable @typescript-eslint/naming-convention */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { pool } from '../../../src/database/pool.js'

const fetchMeetingsForDateMock = vi.fn()
const fetchRaceDataMock = vi.fn()

vi.mock('../../../src/clients/nztab.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/clients/nztab.js')>(
    '../../../src/clients/nztab.js'
  )
  return {
    ...actual,
    fetchMeetingsForDate: fetchMeetingsForDateMock,
    fetchRaceData: fetchRaceDataMock,
  }
})

const { runDailyBaselineInitialization } = await import(
  '../../../src/initialization/daily-baseline.js'
)

const TEST_PREFIX = 'itest-daily-init'

const ensureCoreTables = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meetings (
      meeting_id TEXT PRIMARY KEY,
      meeting_name TEXT NOT NULL,
      country TEXT NOT NULL,
      race_type TEXT NOT NULL,
      date DATE NOT NULL,
      track_condition TEXT,
      tote_status TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS races (
      race_id TEXT PRIMARY KEY,
      meeting_id TEXT,
      name TEXT NOT NULL,
      race_number INTEGER,
      start_time TIMESTAMPTZ,
      status TEXT NOT NULL,
      race_date_nz DATE,
      start_time_nz TIME,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS entrants (
      entrant_id TEXT PRIMARY KEY,
      race_id TEXT NOT NULL,
      name TEXT NOT NULL,
      runner_number INTEGER NOT NULL,
      barrier INTEGER,
      is_scratched BOOLEAN NOT NULL DEFAULT FALSE,
      is_late_scratched BOOLEAN,
      fixed_win_odds NUMERIC(10,2),
      fixed_place_odds NUMERIC(10,2),
      pool_win_odds NUMERIC(10,2),
      pool_place_odds NUMERIC(10,2),
      hold_percentage NUMERIC(5,2),
      bet_percentage NUMERIC(5,2),
      win_pool_percentage NUMERIC(5,2),
      place_pool_percentage NUMERIC(5,2),
      win_pool_amount BIGINT,
      place_pool_amount BIGINT,
      jockey TEXT,
      trainer_name TEXT,
      silk_colours TEXT,
      favourite BOOLEAN,
      mover BOOLEAN,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

const meetingFixture = {
  meeting: `${TEST_PREFIX}-meeting`,
  name: 'Integration Park',
  date: '2025-10-14T18:00:00Z',
  track_condition: 'Good',
  category: 'thoroughbred',
  category_name: 'Thoroughbred Horse Racing',
  country: 'NZ',
  state: 'NZ',
  tote_status: 'open',
  races: [
    {
      id: `${TEST_PREFIX}-race-1`,
      race_number: 1,
      name: 'Integration Stakes',
      start_time: '2025-10-14T19:00:00Z',
      status: 'open',
    },
  ],
}

const racePayload = {
  id: `${TEST_PREFIX}-race-1`,
  name: 'Integration Stakes',
  status: 'open' as const,
  race_date_nz: '2025-10-15',
  start_time_nz: '06:00:00',
  race_number: 1,
  meeting_id: meetingFixture.meeting,
  meeting: meetingFixture,
  entrants: [
    {
      entrantId: `${TEST_PREFIX}-entrant-1`,
      runnerNumber: 1,
      name: 'Integration Runner',
      barrier: 3,
      isScratched: false,
      fixedWinOdds: 2.8,
      fixedPlaceOdds: 1.3,
      poolWinOdds: 2.7,
      poolPlaceOdds: 1.25,
      jockey: 'Jockey Test',
      trainerName: 'Trainer Test',
    },
  ],
}

beforeAll(async () => {
  await ensureCoreTables()
})

afterEach(async () => {
  await pool.query('DELETE FROM entrants WHERE race_id LIKE $1', [`${TEST_PREFIX}%`])
  await pool.query('DELETE FROM races WHERE race_id LIKE $1', [`${TEST_PREFIX}%`])
  await pool.query('DELETE FROM meetings WHERE meeting_id LIKE $1', [`${TEST_PREFIX}%`])
  fetchMeetingsForDateMock.mockReset()
  fetchRaceDataMock.mockReset()
})

describe('daily baseline initialization (integration)', () => {
  it('persists meetings, races, and entrants and exposes scheduler-ready data', async () => {
    fetchMeetingsForDateMock.mockResolvedValue([meetingFixture])
    fetchRaceDataMock.mockResolvedValue(racePayload)

    const result = await runDailyBaselineInitialization({
      reason: 'integration-test',
      referenceDate: new Date('2025-10-14T18:00:00Z'),
    })

    expect(result.success).toBe(true)

    const meetings = await pool.query(
      'SELECT meeting_id, meeting_name, race_type, date FROM meetings WHERE meeting_id = $1',
      [meetingFixture.meeting]
    )
    expect(meetings.rowCount).toBe(1)
    expect(meetings.rows[0]).toMatchObject({
      meeting_id: meetingFixture.meeting,
      meeting_name: meetingFixture.name,
      race_type: meetingFixture.category,
    })

    const races = await pool.query(
      `
        SELECT race_id, meeting_id, start_time_nz, status
        FROM races
        WHERE race_id = $1
      `,
      [racePayload.id]
    )
    expect(races.rowCount).toBe(1)
    expect(races.rows[0]).toMatchObject({
      race_id: racePayload.id,
      meeting_id: meetingFixture.meeting,
      start_time_nz: '06:00:00',
      status: 'open',
    })

    const entrants = await pool.query(
      `
        SELECT entrant_id, race_id, runner_number, favourite
        FROM entrants
        WHERE race_id = $1
      `,
      [racePayload.id]
    )
    expect(entrants.rowCount).toBe(1)
    expect(entrants.rows[0]).toMatchObject({
      entrant_id: `${TEST_PREFIX}-entrant-1`,
      race_id: racePayload.id,
      runner_number: 1,
    })

    const schedulerQuery = await pool.query(
      `
        SELECT race_id
        FROM races
        WHERE status IN ('upcoming', 'open')
          AND start_time IS NOT NULL
          AND start_time > NOW() - INTERVAL '1 day'
      `
    )

    const schedulerRaceIds: string[] = []
    for (const row of schedulerQuery.rows) {
      if (row != null && typeof row === 'object' && 'race_id' in row) {
        const raceIdValue = (row as Record<string, unknown>).race_id
        if (typeof raceIdValue === 'string') {
          schedulerRaceIds.push(raceIdValue)
        }
      }
    }

    expect(schedulerRaceIds).toContain(racePayload.id)
  })
})
