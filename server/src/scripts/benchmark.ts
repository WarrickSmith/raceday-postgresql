#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { join, resolve } from 'node:path'

import {
  DEFAULT_TARGETS,
  buildBenchmarkReport,
  evaluateThresholds,
  summariseRuns,
  toCsv,
  type BenchmarkRunRecord,
  type BenchmarkTargets,
} from './benchmark-metrics.js'
import {
  processRaces,
  type PipelineStageError,
  type ProcessResult,
} from '../pipeline/race-processor.js'
import { closePool } from '../database/pool.js'
import { logger } from '../shared/logger.js'

type OutputFormat = 'json' | 'csv'

type BenchmarkTargetOverrides = {
  -readonly [K in keyof BenchmarkTargets]?: BenchmarkTargets[K]
}

interface CliOptions {
  readonly raceIds: string[]
  readonly iterations: number
  readonly concurrency: number
  readonly outputDir: string
  readonly formats: Set<OutputFormat>
  readonly scenario: string
  readonly targets: BenchmarkTargets
}

interface RawCliOptions {
  raceIds: string[]
  iterations: number
  concurrency: number
  outputDir: string
  formats: Set<OutputFormat>
  scenario: string
  raceFile?: string
  targetOverrides: BenchmarkTargetOverrides
}

const parseNumber = (value: string, label: string): number => {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return parsed
}

const normaliseFormats = (value: string): Set<OutputFormat> => {
  const pieces = value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)

  const formats = new Set<OutputFormat>()
  for (const piece of pieces) {
    if (piece !== 'json' && piece !== 'csv') {
      throw new Error(`Unsupported format: ${piece}`)
    }
    formats.add(piece)
  }

  if (formats.size === 0) {
    formats.add('json')
  }

  return formats
}

const parseCliArgs = (argv: readonly string[]): RawCliOptions => {
  const options: RawCliOptions = {
    raceIds: [],
    iterations: 3,
    concurrency: 5,
    outputDir: resolve('benchmark-results'),
    formats: new Set<OutputFormat>(['json', 'csv']),
    scenario: 'benchmark',
    targetOverrides: {},
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === undefined) {
      continue
    }

    switch (arg) {
      case '--race': {
        const value = argv[index + 1]
        if (value === undefined) {
          throw new Error('--race requires a value')
        }
        options.raceIds.push(value)
        index += 1
        break
      }
      case '--races': {
        const value = argv[index + 1]
        if (value === undefined) {
          throw new Error('--races requires a comma-separated list')
        }
        options.raceIds.push(
          ...value
            .split(',')
            .map((piece) => piece.trim())
            .filter((piece) => piece.length > 0)
        )
        index += 1
        break
      }
      case '--race-file': {
        const value = argv[index + 1]
        if (value === undefined) {
          throw new Error('--race-file requires a path')
        }
        options.raceFile = value
        index += 1
        break
      }
      case '--iterations': {
        const value = argv[index + 1]
        if (value === undefined) {
          throw new Error('--iterations requires a numeric value')
        }
        options.iterations = parseNumber(value, '--iterations')
        index += 1
        break
      }
      case '--concurrency': {
        const value = argv[index + 1]
        if (value === undefined) {
          throw new Error('--concurrency requires a numeric value')
        }
        options.concurrency = parseNumber(value, '--concurrency')
        index += 1
        break
      }
      case '--output':
      case '--output-dir': {
        const value = argv[index + 1]
        if (value === undefined) {
          throw new Error(`${arg} requires a value`)
        }
        options.outputDir = resolve(value)
        index += 1
        break
      }
      case '--formats':
      case '--format': {
        const value = argv[index + 1]
        if (value === undefined) {
          throw new Error(`${arg} requires a value`)
        }
        options.formats = normaliseFormats(value)
        index += 1
        break
      }
      case '--scenario': {
        const value = argv[index + 1]
        if (value === undefined) {
          throw new Error('--scenario requires a value')
        }
        options.scenario = value
        index += 1
        break
      }
      case '--single-target': {
        const value = argv[index + 1]
        if (value === undefined) {
          throw new Error('--single-target requires a numeric value in ms')
        }
        options.targetOverrides.singleRaceTotalMs = parseNumber(
          value,
          '--single-target'
        )
        index += 1
        break
      }
      case '--multi-target': {
        const value = argv[index + 1]
        if (value === undefined) {
          throw new Error('--multi-target requires a numeric value in ms')
        }
        options.targetOverrides.multiRaceTotalMs = parseNumber(
          value,
          '--multi-target'
        )
        index += 1
        break
      }
      case '--fetch-target': {
        const value = argv[index + 1]
        if (value === undefined) {
          throw new Error('--fetch-target requires a numeric value in ms')
        }
        options.targetOverrides.fetchMs = parseNumber(value, '--fetch-target')
        index += 1
        break
      }
      case '--transform-target': {
        const value = argv[index + 1]
        if (value === undefined) {
          throw new Error('--transform-target requires a numeric value in ms')
        }
        options.targetOverrides.transformMs = parseNumber(
          value,
          '--transform-target'
        )
        index += 1
        break
      }
      case '--write-target': {
        const value = argv[index + 1]
        if (value === undefined) {
          throw new Error('--write-target requires a numeric value in ms')
        }
        options.targetOverrides.writeMs = parseNumber(
          value,
          '--write-target'
        )
        index += 1
        break
      }
      case '--help': {
        process.stdout.write(`Usage: npm run benchmark -- [options]

Options:
  --race <id>                 Add a race ID to benchmark (can repeat)
  --races <id1,id2>           Comma separated list of race IDs
  --race-file <path>          JSON file containing an array of race IDs
  --iterations <n>            Number of iterations to run (default: 3)
  --concurrency <n>           Max concurrent races (default: 5)
  --output <path>             Directory to write results (default: ./benchmark-results)
  --formats <json,csv>        Output formats (default: json,csv)
  --scenario <name>           Scenario label for reporting (default: benchmark)
  --single-target <ms>        Override single race total threshold (default: 2000)
  --multi-target <ms>         Override multi race total threshold (default: 15000)
  --fetch-target <ms>         Override fetch stage threshold (default: 500)
  --transform-target <ms>     Override transform stage threshold (default: 1000)
  --write-target <ms>         Override write stage threshold (default: 300)
  --help                      Show this help message
`)
        process.exit(0)
        break
      }
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown argument: ${arg}`)
        }
    }
  }

  return options
}

const loadRaceIds = async (options: RawCliOptions): Promise<string[]> => {
  const raceIds = new Set<string>(options.raceIds)

  if (options.raceFile !== undefined) {
    const fileContent = await readFile(resolve(options.raceFile), 'utf8')
    const parsed: unknown = JSON.parse(fileContent)

    if (!Array.isArray(parsed)) {
      throw new Error('--race-file must contain a JSON array of strings')
    }

    for (const value of parsed) {
      if (typeof value !== 'string') {
        throw new Error('--race-file entries must be strings')
      }

      const trimmed = value.trim()
      if (trimmed.length === 0) {
        throw new Error('--race-file entries must be non-empty strings')
      }
      raceIds.add(trimmed)
    }
  }

  if (raceIds.size === 0) {
    throw new Error('At least one race ID is required. Use --race or --race-file')
  }

  return [...raceIds]
}

const buildRunRecordFromResult = (
  iteration: number,
  result: ProcessResult
): BenchmarkRunRecord => ({
  iteration,
  raceId: result.raceId,
  status: result.status,
  success: result.success,
  timings: result.timings,
  errorType: result.error?.type,
  errorMessage: result.error?.message,
})

const buildRunRecordFromError = (
  iteration: number,
  error: PipelineStageError
): BenchmarkRunRecord => ({
  iteration,
  raceId: error.raceId,
  status: 'failed',
  success: false,
  timings: error.result.timings,
  errorType: error.stage,
  errorMessage: error.message,
})

const formatTimestampForFile = (isoString: string): string =>
  isoString.replaceAll(':', '-').replaceAll('.', '-')

const writeOutputs = async (
  formats: Set<OutputFormat>,
  outputDir: string,
  baseName: string,
  reportJson: string,
  csv: string | null
): Promise<void> => {
  await mkdir(outputDir, { recursive: true })

  if (formats.has('json')) {
    const jsonPath = join(outputDir, `${baseName}.json`)
    await writeFile(jsonPath, reportJson, 'utf8')
    logger.info({ jsonPath }, 'Benchmark JSON report saved')
  }

  if (csv !== null && formats.has('csv')) {
    const csvPath = join(outputDir, `${baseName}.csv`)
    await writeFile(csvPath, csv, 'utf8')
    logger.info({ csvPath }, 'Benchmark CSV report saved')
  }
}

const runBenchmark = async (argv: readonly string[]): Promise<number> => {
  const rawOptions = parseCliArgs(argv)
  const raceIds = await loadRaceIds(rawOptions)

  const resolvedTargets: BenchmarkTargets = {
    ...DEFAULT_TARGETS,
    ...rawOptions.targetOverrides,
  }

  const options: CliOptions = {
    raceIds,
    iterations: rawOptions.iterations,
    concurrency: rawOptions.concurrency,
    outputDir: rawOptions.outputDir,
    formats: rawOptions.formats,
    scenario: rawOptions.scenario,
    targets: resolvedTargets,
  }

  const runs: BenchmarkRunRecord[] = []
  const startedAt = new Date().toISOString()
  let batchMaxDuration = 0

  for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
    const iterationStart = performance.now()
    logger.info(
      {
        iteration,
        raceIds: options.raceIds,
        concurrency: options.concurrency,
      },
      'Benchmark iteration started'
    )

    const { results, errors, metrics } = await processRaces(
      options.raceIds,
      options.concurrency,
      {
        contextId: `${options.scenario}-iteration-${String(iteration)}`,
      }
    )

    for (const result of results) {
      runs.push(buildRunRecordFromResult(iteration, result))
    }

    for (const error of errors) {
      runs.push(buildRunRecordFromError(iteration, error))
    }

    if (metrics.maxDuration_ms > batchMaxDuration) {
      batchMaxDuration = metrics.maxDuration_ms
    }

    const iterationDurationMs = Math.round(performance.now() - iterationStart)

    logger.info(
      {
        iteration,
        durationMs: iterationDurationMs,
        successes: metrics.successes,
        failures: metrics.failures,
        retryableFailures: metrics.retryableFailures,
        maxDurationMs: metrics.maxDuration_ms,
      },
      'Benchmark iteration completed'
    )
  }

  const summary = summariseRuns(runs)
  const completedAt = new Date().toISOString()

  const expectedSampleSize = options.raceIds.length * options.iterations
  const errorCount = runs.filter((run) => !run.success).length

  if (summary.sampleSize === 0) {
    logger.error(
      { errorCount, expectedSampleSize },
      'Benchmark failed - all runs errored, no successful samples'
    )
    return 1
  }

  if (summary.sampleSize < expectedSampleSize) {
    logger.warn(
      {
        sampleSize: summary.sampleSize,
        expectedSampleSize,
        errorCount,
      },
      'Benchmark completed with partial failures'
    )
  }

  const thresholds = evaluateThresholds(summary, {
    raceCount: options.raceIds.length,
    batchMaxDuration,
  }, options.targets)

  const report = buildBenchmarkReport(
    {
      scenario: options.scenario,
      raceCount: options.raceIds.length,
      iterations: options.iterations,
      startedAt,
      completedAt,
    },
    summary,
    thresholds,
    runs
  )

  const reportJson = JSON.stringify(report, null, 2)
  const csv = runs.length > 0 ? toCsv(runs) : null

  const baseName = options.scenario.concat(
    '-',
    formatTimestampForFile(completedAt)
  )
  await writeOutputs(options.formats, options.outputDir, baseName, reportJson, csv)

  logger.info({
    scenario: options.scenario,
    raceCount: options.raceIds.length,
    iterations: options.iterations,
    summary,
    thresholds,
  }, 'Benchmark run complete')

  if (!thresholds.passed) {
    logger.error({ thresholds }, 'Benchmark thresholds not met')
    return 1
  }

  if (errorCount > 0) {
    logger.error(
      { errorCount, expectedSampleSize },
      'Benchmark had pipeline errors - failing'
    )
    return 1
  }

  return 0
}

try {
  const exitCode = await runBenchmark(process.argv.slice(2))
  await closePool('benchmark complete')
  process.exitCode = exitCode
} catch (error) {
  await closePool('benchmark error')
  logger.error({ err: error }, 'Benchmark execution failed')
  process.exitCode = 1
}
