import type {
  ProcessStatus,
  ProcessTimings,
} from '../pipeline/race-processor.js'

const roundTwoDecimals = (value: number): number =>
  Math.round(value * 100) / 100

const calculatePercentile = (
  values: readonly number[],
  percentile: number
): number => {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const rank = percentile / 100
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(rank * sorted.length) - 1)
  )

  return sorted[index] ?? 0
}

export interface StageStats {
  readonly min: number
  readonly max: number
  readonly avg: number
  readonly p95: number
  readonly p99: number
}

const emptyStageStats: StageStats = {
  min: 0,
  max: 0,
  avg: 0,
  p95: 0,
  p99: 0,
}

const computeStageStats = (values: readonly number[]): StageStats => {
  if (values.length === 0) {
    return emptyStageStats
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const avg = values.reduce((total, current) => total + current, 0) / values.length

  return {
    min: roundTwoDecimals(min),
    max: roundTwoDecimals(max),
    avg: roundTwoDecimals(avg),
    p95: roundTwoDecimals(calculatePercentile(values, 95)),
    p99: roundTwoDecimals(calculatePercentile(values, 99)),
  }
}

export interface BenchmarkRunRecord {
  readonly iteration: number
  readonly raceId: string
  readonly status: ProcessStatus
  readonly success: boolean
  readonly timings: ProcessTimings
  readonly errorType?: string
  readonly errorMessage?: string
}

export interface BenchmarkSummary {
  readonly totals: StageStats
  readonly fetch: StageStats
  readonly transform: StageStats
  readonly write: StageStats
  readonly sampleSize: number
}

export const summariseRuns = (
  runs: readonly BenchmarkRunRecord[]
): BenchmarkSummary => {
  const successful = runs.filter((run) => run.success)

  const totals = successful.map((run) => run.timings.total_ms)
  const fetch = successful.map((run) => run.timings.fetch_ms)
  const transform = successful.map((run) => run.timings.transform_ms)
  const write = successful.map((run) => run.timings.write_ms)

  return {
    totals: computeStageStats(totals),
    fetch: computeStageStats(fetch),
    transform: computeStageStats(transform),
    write: computeStageStats(write),
    sampleSize: successful.length,
  }
}

export interface BenchmarkTargets {
  readonly singleRaceTotalMs: number
  readonly multiRaceTotalMs: number
  readonly fetchMs: number
  readonly transformMs: number
  readonly writeMs: number
}

export const DEFAULT_TARGETS: BenchmarkTargets = {
  singleRaceTotalMs: 2_000,
  multiRaceTotalMs: 15_000,
  fetchMs: 500,
  transformMs: 1_000,
  writeMs: 300,
}

export interface ThresholdResult {
  readonly name: string
  readonly observed: number
  readonly limit: number
  readonly passed: boolean
  readonly context?: string
}

export interface ThresholdEvaluation {
  readonly passed: boolean
  readonly results: ThresholdResult[]
}

export interface ThresholdMetadata {
  readonly raceCount: number
  readonly batchMaxDuration: number
}

export const evaluateThresholds = (
  summary: BenchmarkSummary,
  metadata: ThresholdMetadata,
  targets: BenchmarkTargets = DEFAULT_TARGETS
): ThresholdEvaluation => {
  const results: ThresholdResult[] = []

  if (metadata.raceCount <= 1) {
    results.push({
      name: 'single_race_total_ms',
      observed: summary.totals.max,
      limit: targets.singleRaceTotalMs,
      passed: summary.totals.max <= targets.singleRaceTotalMs,
    })
  } else {
    results.push({
      name: 'multi_race_total_ms',
      observed: metadata.batchMaxDuration,
      limit: targets.multiRaceTotalMs,
      passed: metadata.batchMaxDuration <= targets.multiRaceTotalMs,
      context: `maxDuration_ms across ${String(metadata.raceCount)} race batch`,
    })
  }

  results.push(
    {
      name: 'fetch_max_ms',
      observed: summary.fetch.max,
      limit: targets.fetchMs,
      passed: summary.fetch.max <= targets.fetchMs,
    },
    {
      name: 'transform_max_ms',
      observed: summary.transform.max,
      limit: targets.transformMs,
      passed: summary.transform.max <= targets.transformMs,
    },
    {
      name: 'write_max_ms',
      observed: summary.write.max,
      limit: targets.writeMs,
      passed: summary.write.max <= targets.writeMs,
    }
  )

  return {
    passed: results.every((result) => result.passed),
    results,
  }
}

export interface BenchmarkReportMetadata {
  readonly scenario: string
  readonly raceCount: number
  readonly iterations: number
  readonly startedAt: string
  readonly completedAt: string
}

export interface BenchmarkReport {
  readonly metadata: BenchmarkReportMetadata
  readonly summary: BenchmarkSummary
  readonly thresholds: ThresholdEvaluation
  readonly runs: readonly BenchmarkRunRecord[]
}

export const buildBenchmarkReport = (
  metadata: BenchmarkReportMetadata,
  summary: BenchmarkSummary,
  thresholds: ThresholdEvaluation,
  runs: readonly BenchmarkRunRecord[]
): BenchmarkReport => ({
  metadata,
  summary,
  thresholds,
  runs,
})

export const toCsv = (
  runs: readonly BenchmarkRunRecord[]
): string => {
  const header = [
    'iteration',
    'race_id',
    'status',
    'success',
    'total_ms',
    'fetch_ms',
    'transform_ms',
    'write_ms',
    'error_type',
    'error_message',
  ]

  const lines = runs.map((run) => {
    const base = [
      run.iteration.toString(),
      run.raceId,
      run.status,
      run.success ? 'true' : 'false',
      run.timings.total_ms.toString(),
      run.timings.fetch_ms.toString(),
      run.timings.transform_ms.toString(),
      run.timings.write_ms.toString(),
      run.errorType ?? '',
      run.errorMessage?.replaceAll('\n', ' ') ?? '',
    ]
    return base.join(',')
  })

  return [header.join(','), ...lines].join('\n')
}
