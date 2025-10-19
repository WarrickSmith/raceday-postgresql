import { describe, beforeEach, it, expect } from 'vitest'

import { cloneTransformedRace } from './story-2-10d-test-helpers.js'
import { validateTransformedRaceData } from '../../../src/validation/data-quality.js'
import { filterSignificantOddsChanges, clearOddsSnapshot } from '../../../src/utils/odds-change-detection.js'
import type { TransformedRace, TransformedEntrant, MoneyFlowRecord } from '../../../src/workers/messages.js'
import type { OddsRecord } from '../../../src/database/time-series.js'

const QUALITY_MIN_ACCEPTABLE_SCORE = 80
const SAMPLE_RACE = cloneTransformedRace()
const [sampleEntrant] = SAMPLE_RACE.entrants
if (sampleEntrant === undefined) {
  throw new Error('Story 2.10D fixture must contain at least one entrant')
}
const TEMPLATE_ENTRANT = JSON.parse(JSON.stringify(sampleEntrant)) as TransformedEntrant

const [sampleMoneyFlow] = SAMPLE_RACE.moneyFlowRecords
if (sampleMoneyFlow === undefined) {
  throw new Error('Story 2.10D fixture must contain at least one money flow record')
}
const TEMPLATE_MONEY_FLOW = JSON.parse(JSON.stringify(sampleMoneyFlow)) as MoneyFlowRecord

const createEntrant = (
  id: string,
  winPct: number,
  placePct: number,
  customize?: (entrant: TransformedEntrant) => void
): TransformedEntrant => {
  const entrant = JSON.parse(JSON.stringify(TEMPLATE_ENTRANT)) as TransformedEntrant
  const setEntrantValue = <K extends keyof TransformedEntrant>(
    key: K,
    value: TransformedEntrant[K]
  ): void => {
    entrant[key] = value
  }

  setEntrantValue('entrant_id', id)
  setEntrantValue('race_id', 'story-2-10d-race-1')
  setEntrantValue('name', `Entrant ${id}`)
  setEntrantValue('runner_number', Number.parseInt(id, 10))
  setEntrantValue('barrier', 1)
  setEntrantValue('is_scratched', false)
  setEntrantValue('is_late_scratched', null)
  setEntrantValue('fixed_win_odds', 2.5)
  setEntrantValue('fixed_place_odds', 1.5)
  setEntrantValue('pool_win_odds', 2.6)
  setEntrantValue('pool_place_odds', 1.6)
  setEntrantValue('hold_percentage', 15)
  setEntrantValue('bet_percentage', 14.5)
  setEntrantValue('win_pool_percentage', winPct)
  setEntrantValue('place_pool_percentage', placePct)
  setEntrantValue('win_pool_amount', 150_000)
  setEntrantValue('place_pool_amount', 90_000)
  setEntrantValue('jockey', 'Test Jockey')
  setEntrantValue('trainer_name', 'Test Trainer')
  setEntrantValue('silk_colours', 'Red')
  setEntrantValue('favourite', false)
  setEntrantValue('mover', false)

  if (customize !== undefined) {
    customize(entrant)
  }
  return entrant
}

const createMoneyFlowRecord = (
  entrantId: string,
  customize?: (record: MoneyFlowRecord) => void
): MoneyFlowRecord => {
  const record = JSON.parse(JSON.stringify(TEMPLATE_MONEY_FLOW)) as MoneyFlowRecord
  const setRecordValue = <K extends keyof MoneyFlowRecord>(
    key: K,
    value: MoneyFlowRecord[K]
  ): void => {
    record[key] = value
  }

  setRecordValue('entrant_id', entrantId)
  setRecordValue('race_id', 'story-2-10d-race-1')
  setRecordValue('time_to_start', 5)
  setRecordValue('time_interval', 5)
  setRecordValue('interval_type', '2m')
  setRecordValue('polling_timestamp', new Date().toISOString())
  setRecordValue('hold_percentage', 15)
  setRecordValue('bet_percentage', 14.5)
  setRecordValue('win_pool_percentage', 15)
  setRecordValue('place_pool_percentage', 15)
  setRecordValue('win_pool_amount', 150_000)
  setRecordValue('place_pool_amount', 90_000)
  setRecordValue('total_pool_amount', 240_000)
  setRecordValue('incremental_win_amount', 10_000)
  setRecordValue('incremental_place_amount', 8_000)
  setRecordValue('fixed_win_odds', 2.5)
  setRecordValue('fixed_place_odds', 1.5)
  setRecordValue('pool_win_odds', 2.6)
  setRecordValue('pool_place_odds', 1.6)

  if (customize !== undefined) {
    customize(record)
  }
  return record
}

const createOddsRecord = (
  entrantId: string,
  odds: number,
  timestamp: string,
  type: OddsRecord['type'] = 'fixed_win',
  customize?: (record: OddsRecord) => void
): OddsRecord => {
  const record = {} as OddsRecord
  const setOddsValue = <K extends keyof OddsRecord>(
    key: K,
    value: OddsRecord[K]
  ): void => {
    record[key] = value
  }

  setOddsValue('entrant_id', entrantId)
  setOddsValue('odds', odds)
  setOddsValue('type', type)
  setOddsValue('event_timestamp', timestamp)

  if (customize !== undefined) {
    customize(record)
  }

  return record
}

describe('Story 2.10D – data quality validation', () => {
  beforeEach(() => {
    clearOddsSnapshot()
  })

  it('flags mathematical inconsistency when pool percentages deviate from 100% (AC3 Subtask 3.1)', () => {
    const baseRace = cloneTransformedRace()
    const transformed: TransformedRace = {
      ...baseRace,
      entrants: [
        createEntrant('1', 40, 40),
        createEntrant('2', 30, 30),
        createEntrant('3', 20, 20),
      ],
    }

    const result = validateTransformedRaceData(transformed)
    expect(result.warnings.some((warning) => warning.includes('percentages sum'))).toBe(true)
    expect(result.quality_score).toBeLessThan(80)
  })

  it('detects incorrect money flow deltas exceeding recorded totals (AC3 Subtask 3.2)', () => {
    const baseRace = cloneTransformedRace()
    const transformed: TransformedRace = {
      ...baseRace,
      entrants: [createEntrant('1', 50, 50), createEntrant('2', 50, 50)],
      moneyFlowRecords: [
        createMoneyFlowRecord('1', (record) => {
          record.win_pool_amount = 50_000
          record.incremental_win_amount = 75_000
        }),
        createMoneyFlowRecord('2'),
      ],
    }

    const result = validateTransformedRaceData(transformed)
    expect(result.warnings.some((warning) => warning.includes('Incremental win amount'))).toBe(true)
    expect(result.metrics.failed_checks).toBeGreaterThan(0)
  })

  it('suppresses duplicate odds inserts when no significant change detected (AC3 Subtask 3.3)', () => {
    const records: OddsRecord[] = [
      createOddsRecord('1', 2.5, '2025-10-19T12:00:00.000Z'),
      createOddsRecord('1', 2.505, '2025-10-19T12:01:00.000Z'),
    ]

    const filtered = filterSignificantOddsChanges(records)
    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toEqual(records[0])
  })

  it('produces quality warnings and reduced score for incomplete datasets (AC3 Subtask 3.4)', () => {
    const baseRace = cloneTransformedRace()
    const transformed: TransformedRace = {
      ...baseRace,
      entrants: [],
      moneyFlowRecords: [],
      racePools: null,
    }

    const result = validateTransformedRaceData(transformed)
    expect(result.is_valid).toBe(false)
    expect(result.quality_score).toBeLessThan(QUALITY_MIN_ACCEPTABLE_SCORE)
    expect(Number.isFinite(result.quality_score)).toBe(true)
  })

  it('handles edge cases with null pool percentages without crashing (AC3 Subtask 3.6)', () => {
    const baseRace = cloneTransformedRace()
    const transformed: TransformedRace = {
      ...baseRace,
      entrants: [
        createEntrant('1', 0, 0, (entrant) => {
          entrant.win_pool_percentage = null
          entrant.place_pool_percentage = null
        }),
        createEntrant('2', 100, 100),
      ],
    }

    const result = validateTransformedRaceData(transformed)
    expect(Number.isFinite(result.quality_score)).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})
