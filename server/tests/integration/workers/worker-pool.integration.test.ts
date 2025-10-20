import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { transformedRaceSchema } from '../../../src/workers/messages.js'
import type { RaceData } from '../../../src/clients/nztab-types.js'

const sampleRace = (): RaceData => {
  /* eslint-disable @typescript-eslint/naming-convention */
  const race: RaceData = {
    id: 'race-integration',
    name: 'Integration Race',
    status: 'open',
    race_date_nz: '2025-10-10',
    start_time_nz: '12:05',
    entrants: [
      {
        entrantId: 'entrant-int-1',
        name: 'Runner Integration',
        runnerNumber: 1,
      },
      {
        entrantId: 'entrant-int-2',
        name: 'Runner Integration 2',
        runnerNumber: 2,
      },
    ],
    tote_pools: [
      {
        product_type: 'Win',
        total: 1200, // $1,200 in dollars
      },
      {
        product_type: 'Place',
        total: 800, // $800 in dollars
      },
    ],
    meeting: {
      meeting: 'meeting-int',
      name: 'Riccarton',
      date: '2025-10-10T12:05:00Z',
      country: 'NZ',
      category: 'R',
      category_name: 'Thoroughbred',
      state: 'Canterbury',
      track_condition: 'Good',
      tote_status: 'open',
      meeting_date: null,
      meeting_type: null,
      tote_meeting_number: 2,
      tote_raceday_date: '2025-10-10',
    },
  }
  /* eslint-enable @typescript-eslint/naming-convention */
  return race
}

describe('WorkerPool integration', () => {
  beforeAll(() => {
    vi.unmock('node:worker_threads')
  })

  it('processes tasks via real worker thread', async () => {
    vi.resetModules()
    const { WorkerPool: workerPoolClass, workerPool } = await import('../../../src/workers/worker-pool.js')

    await workerPool.shutdown()

    const pool = new workerPoolClass({ size: 1 })
    const result = await pool.exec(sampleRace())

    const parsed = transformedRaceSchema.parse(result)
    expect(parsed.raceId).toBe('race-integration')
    expect(parsed.metrics.entrantCount).toBe(2)
    expect(parsed.metrics.poolFieldCount).toBeGreaterThanOrEqual(1)

    await pool.shutdown()
  })

  afterAll(async () => {
    const { workerPool } = await import('../../../src/workers/worker-pool.js')
    await workerPool.shutdown()
  })
})
