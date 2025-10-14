import { pool } from '../database/pool.js'
import { processRace } from '../pipeline/race-processor.js'
import { logger } from '../shared/logger.js'
import { calculatePollingInterval } from './interval.js'
import { RaceScheduler } from './scheduler.js'
import type { RaceRow, SchedulerOptions, SchedulerState } from './types.js'

const fetchUpcomingRaces = async (now: Date): Promise<RaceRow[]> => {
  const { rows } = await pool.query<{
    raceId: string
    startTime: string
    status: string
  }>(
    `
      SELECT
        race_id AS "raceId",
        start_time AS "startTime",
        status
      FROM races
      WHERE status IN ('upcoming', 'open')
        AND start_time IS NOT NULL
        AND start_time > $1::timestamptz
        AND start_time < ($1::timestamptz + INTERVAL '24 hours')
      ORDER BY start_time ASC
    `,
    [now.toISOString()],
  )

  return rows.map((row) => ({
    raceId: row.raceId,
    startTime: new Date(row.startTime),
    status: row.status,
  }))
}

const fetchRaceStatus = async (raceId: string): Promise<string | null> => {
  const { rows } = await pool.query<{ status: string }>(
    `
      SELECT status
      FROM races
      WHERE race_id = $1
      LIMIT 1
    `,
    [raceId],
  )

  const [row] = rows
  return row?.status ?? null
}

const scheduler = new RaceScheduler(
  {
    fetchUpcomingRaces,
    fetchRaceStatus,
    processRace: async (raceId: string) => processRace(raceId),
    logger,
  },
  {},
)

const startScheduler = (): void => {
  scheduler.start()
}

const stopScheduler = async (): Promise<void> => {
  await scheduler.stop()
}

const getSchedulerState = (): SchedulerState => scheduler.getState()

const createScheduler = (
  deps: ConstructorParameters<typeof RaceScheduler>[0],
  options: SchedulerOptions = {},
): RaceScheduler => new RaceScheduler(deps, options)

export {
  calculatePollingInterval,
  createScheduler,
  getSchedulerState,
  startScheduler,
  stopScheduler,
}
export type { SchedulerState }
