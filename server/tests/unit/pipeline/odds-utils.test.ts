/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it, vi } from 'vitest'
import type { TransformedRace } from '../../../src/workers/messages.js'
import { buildOddsRecords, resolveOddsEventTimestamp } from '../../../src/pipeline/odds-utils.js'

const buildTransformedRace = (overrides: Partial<TransformedRace> = {}): TransformedRace => ({
  raceId: 'race-1',
  raceName: 'Test Race',
  status: 'open',
  transformedAt: '2025-10-14T00:00:00.000Z',
  metrics: {
    entrantCount: 1,
    poolFieldCount: 1,
    moneyFlowRecordCount: 1,
  },
  meeting: {
    meeting_id: 'meeting-1',
    name: 'Meeting 1',
    date: '2025-10-14',
    country: 'NZ',
    category: 'R',
    track_condition: 'GOOD',
    tote_status: 'open',
  },
  race: {
    race_id: 'race-1',
    name: 'Test Race',
    status: 'open',
    race_number: 1,
    race_date_nz: '2025-10-14',
    start_time_nz: '12:00',
    meeting_id: 'meeting-1',
  },
  entrants: [
    {
      entrant_id: 'entrant-1',
      race_id: 'race-1',
      runner_number: 1,
      name: 'Runner 1',
      barrier: null,
      is_scratched: false,
      is_late_scratched: null,
      fixed_win_odds: 2.5,
      fixed_place_odds: null,
      pool_win_odds: 3.1,
      pool_place_odds: null,
      hold_percentage: null,
      bet_percentage: null,
      win_pool_percentage: null,
      place_pool_percentage: null,
      win_pool_amount: null,
      place_pool_amount: null,
      jockey: null,
      trainer_name: null,
      silk_colours: null,
      favourite: null,
      mover: null,
    },
  ],
  moneyFlowRecords: [
    {
      entrant_id: 'entrant-1',
      race_id: 'race-1',
      time_to_start: 10,
      time_interval: 5,
      interval_type: '5m',
      polling_timestamp: '2025-10-14T11:50:00.000Z',
      hold_percentage: 0.5,
      bet_percentage: null,
      win_pool_percentage: null,
      place_pool_percentage: null,
      win_pool_amount: 1000,
      place_pool_amount: 500,
      total_pool_amount: 1500,
      incremental_win_amount: 100,
      incremental_place_amount: 50,
      fixed_win_odds: 2.5,
      fixed_place_odds: null,
      pool_win_odds: 3.1,
      pool_place_odds: null,
    },
  ],
  originalPayload: undefined,
  ...overrides,
})

describe('resolveOddsEventTimestamp', () => {
  it('uses race metadata when available', () => {
    const timestamp = resolveOddsEventTimestamp(buildTransformedRace())
    expect(timestamp).toBe('2025-10-14T12:00:00Z')
  })

  it('falls back to money flow polling timestamp when race metadata missing', () => {
    const transformed = buildTransformedRace({
      race: null,
    })
    const timestamp = resolveOddsEventTimestamp(transformed)
    expect(timestamp).toBe('2025-10-14T11:50:00.000Z')
  })

  it('falls back to current time when no race metadata or money flow records', () => {
    const mockDate = new Date('2025-10-14T10:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(mockDate)

    const transformed = buildTransformedRace({
      race: null,
      moneyFlowRecords: [],
    })
    const timestamp = resolveOddsEventTimestamp(transformed)
    expect(timestamp).toBe(mockDate.toISOString())

    vi.useRealTimers()
  })
})

describe('buildOddsRecords', () => {
  it('emits records for fixed and pool odds with resolved timestamp', () => {
    const records = buildOddsRecords(buildTransformedRace())
    expect(records).toEqual([
      {
        entrant_id: 'entrant-1',
        odds: 2.5,
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:00:00Z',
      },
      {
        entrant_id: 'entrant-1',
        odds: 3.1,
        type: 'pool_win',
        event_timestamp: '2025-10-14T12:00:00Z',
      },
    ])
  })

  it('omits odds types that are nullish', () => {
    const records = buildOddsRecords(
      buildTransformedRace({
        entrants: [
          {
            entrant_id: 'entrant-1',
            race_id: 'race-1',
            runner_number: 1,
            name: 'Runner 1',
            barrier: null,
            is_scratched: false,
            is_late_scratched: null,
            fixed_win_odds: null,
            fixed_place_odds: null,
            pool_win_odds: null,
            pool_place_odds: null,
            hold_percentage: null,
            bet_percentage: null,
            win_pool_percentage: null,
            place_pool_percentage: null,
            win_pool_amount: null,
            place_pool_amount: null,
            jockey: null,
            trainer_name: null,
            silk_colours: null,
            favourite: null,
            mover: null,
          },
        ],
      })
    )

    expect(records).toHaveLength(0)
  })
})
