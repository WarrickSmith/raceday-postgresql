import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TARGETS,
  evaluateThresholds,
  summariseRuns,
  toCsv,
  type BenchmarkRunRecord,
} from '../../../src/scripts/benchmark-metrics.js'
import type { ProcessTimings } from '../../../src/pipeline/race-processor.js'

interface TimingOverrides {
  readonly totalMs?: number
  readonly fetchMs?: number
  readonly transformMs?: number
  readonly writeMs?: number
}

const buildTimings = (overrides?: TimingOverrides): ProcessTimings => {
  /* eslint-disable @typescript-eslint/naming-convention */
  const timings: ProcessTimings = {
    total_ms: overrides?.totalMs ?? 1500,
    fetch_ms: overrides?.fetchMs ?? 400,
    transform_ms: overrides?.transformMs ?? 700,
    write_ms: overrides?.writeMs ?? 300,
  }
  /* eslint-enable @typescript-eslint/naming-convention */
  return timings
}

interface RunOverrides extends Partial<Omit<BenchmarkRunRecord, 'timings'>> {
  readonly timings?: TimingOverrides
}

const createRun = (overrides: RunOverrides = {}): BenchmarkRunRecord => ({
  iteration: overrides.iteration ?? 1,
  raceId: overrides.raceId ?? 'race-1',
  status: overrides.status ?? 'success',
  success: overrides.success ?? true,
  timings: buildTimings(overrides.timings),
  errorType: overrides.errorType,
  errorMessage: overrides.errorMessage,
})

describe('summariseRuns', () => {
  it('calculates basic statistics for successful runs', () => {
    const runs: BenchmarkRunRecord[] = [
      createRun({ timings: { totalMs: 1500, fetchMs: 400, transformMs: 700, writeMs: 300 } }),
      createRun({ iteration: 2, timings: { totalMs: 1400, fetchMs: 380, transformMs: 680, writeMs: 280 } }),
      createRun({ iteration: 3, timings: { totalMs: 1600, fetchMs: 420, transformMs: 720, writeMs: 320 } }),
    ]

    const summary = summariseRuns(runs)

    expect(summary.sampleSize).toBe(3)
    expect(summary.totals.min).toBe(1400)
    expect(summary.totals.max).toBe(1600)
    expect(summary.totals.avg).toBeCloseTo(1500)
    expect(summary.fetch.max).toBe(420)
    expect(summary.transform.max).toBe(720)
    expect(summary.write.max).toBe(320)
  })

  it('ignores failed runs when computing statistics', () => {
    const runs: BenchmarkRunRecord[] = [
      createRun(),
      createRun({
        iteration: 2,
        success: false,
        status: 'failed',
        timings: {
          totalMs: 2_500,
          fetchMs: 1_000,
          transformMs: 1_000,
          writeMs: 500,
        },
      }),
    ]

    const summary = summariseRuns(runs)

    expect(summary.sampleSize).toBe(1)
    expect(summary.totals.max).toBe(1500)
  })
})

describe('evaluateThresholds', () => {
  it('passes when metrics are within targets for single race', () => {
    const summary = summariseRuns([
      createRun({ timings: { totalMs: 1_800, fetchMs: 450, transformMs: 900, writeMs: 250 } }),
    ])

    const evaluation = evaluateThresholds(summary, {
      raceCount: 1,
      batchMaxDuration: summary.totals.max,
    })

    expect(evaluation.passed).toBe(true)
    expect(evaluation.results.every((result) => result.passed)).toBe(true)
  })

  it('fails when any metric exceeds targets', () => {
    const summary = summariseRuns([
      createRun({ timings: { totalMs: 1_600, fetchMs: 600, transformMs: 900, writeMs: 250 } }),
    ])

    const evaluation = evaluateThresholds(summary, {
      raceCount: 1,
      batchMaxDuration: summary.totals.max,
    })

    expect(evaluation.passed).toBe(false)
    const fetchThreshold = evaluation.results.find((result) => result.name === 'fetch_max_ms')
    expect(fetchThreshold?.passed).toBe(false)
  })

  it('uses multi-race threshold when race count is greater than one', () => {
    const summary = summariseRuns([
      createRun({ raceId: 'race-1', timings: { totalMs: 5_000, fetchMs: 400, transformMs: 900, writeMs: 250 } }),
      createRun({ iteration: 2, raceId: 'race-2', timings: { totalMs: 6_000, fetchMs: 420, transformMs: 950, writeMs: 280 } }),
    ])

    const evaluation = evaluateThresholds(summary, {
      raceCount: 5,
      batchMaxDuration: 12_000,
    })

    expect(evaluation.passed).toBe(true)
    const totalThreshold = evaluation.results.find((result) => result.name === 'multi_race_total_ms')
    expect(totalThreshold?.limit).toBe(DEFAULT_TARGETS.multiRaceTotalMs)
  })
})

describe('toCsv', () => {
  it('renders run records as CSV string', () => {
    const csv = toCsv([
      createRun({ raceId: 'race-1' }),
      createRun({ iteration: 2, raceId: 'race-2', success: false, status: 'failed', errorType: 'fetch', errorMessage: 'timeout' }),
    ])

    const lines = csv.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('iteration,race_id,status,success')
    expect(lines[1]).toContain('race-1')
    expect(lines[2]).toContain('false')
    expect(lines[2]).toContain('timeout')
  })
})
