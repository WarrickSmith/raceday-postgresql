/* eslint-disable @typescript-eslint/naming-convention */
import { fetchRaceData, NzTabError } from '../clients/nztab.js'
import type { RaceData } from '../clients/nztab-types.js'
import { workerPool } from '../workers/worker-pool.js'
import {
  bulkUpsertMeetings,
  bulkUpsertRaces,
  bulkUpsertEntrants,
  DatabaseWriteError,
  TransactionError,
  withTransaction,
} from '../database/bulk-upsert.js'
import type { PoolClient } from 'pg'
import {
  insertMoneyFlowHistory,
  insertOddsHistory,
  PartitionNotFoundError,
} from '../database/time-series.js'
import type { TransformedRace } from '../workers/messages.js'
import { logger } from '../shared/logger.js'
import { buildOddsRecords } from './odds-utils.js'
import { env } from '../shared/env.js'

/**
 * Pipeline stage identifier used when classifying structured process errors.
 */
type ProcessErrorType = 'fetch' | 'transform' | 'write'

/**
 * Millisecond timings measured at each pipeline boundary.
 */
export interface ProcessTimings {
  fetch_ms: number
  transform_ms: number
  write_ms: number
  total_ms: number
}

/**
 * Row counts persisted during the write stage for observability and auditing.
 */
export interface ProcessRowCounts {
  meetings: number
  races: number
  entrants: number
  moneyFlowHistory: number
  oddsHistory: number
}

export type ProcessStatus = 'success' | 'skipped' | 'failed'

/**
 * Optional execution hints used by race processor callers.
 */
export interface ProcessOptions {
  contextId?: string
}

/**
 * Canonical result returned by race processor executions.
 *
 * Exposes per-stage timings, persistence row counts, and optional error metadata for
 * downstream schedulers and monitoring pipelines.
 */
export interface ProcessResult {
  raceId: string
  status: ProcessStatus
  success: boolean
  contextId?: string
  timings: ProcessTimings
  rowCounts: ProcessRowCounts
  error?: {
    type: ProcessErrorType
    message: string
    retryable: boolean
  }
}

interface ProcessErrorDetails {
  type: ProcessErrorType
  message: string
  retryable: boolean
}

interface WriteStageOutcome {
  rowCounts: ProcessRowCounts
  breakdown: {
    meetings_ms: number
    races_ms: number
    entrants_ms: number
    money_flow_ms: number
    odds_ms: number
  }
}

const ZERO_ROW_COUNTS: ProcessRowCounts = {
  meetings: 0,
  races: 0,
  entrants: 0,
  moneyFlowHistory: 0,
  oddsHistory: 0,
}

const zeroRowCounts = (): ProcessRowCounts => ({
  ...ZERO_ROW_COUNTS,
})

const serializeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return { message: String(error) }
}

const createResult = (
  raceId: string,
  status: ProcessStatus,
  durations: { fetch: number; transform: number; write: number; total: number },
  rowCounts: ProcessRowCounts,
  errorDetails?: ProcessErrorDetails,
  options?: ProcessOptions
): ProcessResult => {
  const result: ProcessResult = {
    raceId,
    status,
    success: status === 'success',
    timings: {
      fetch_ms: Math.round(durations.fetch),
      transform_ms: Math.round(durations.transform),
      write_ms: Math.round(durations.write),
      total_ms: Math.round(durations.total),
    },
    rowCounts: {
      ...rowCounts,
    },
  }

  if (options?.contextId !== undefined) {
    result.contextId = options.contextId
  }

  if (errorDetails !== undefined) {
    result.error = { ...errorDetails }
  }

  return result
}

interface PipelineErrorCtorArgs {
  raceId: string
  message: string
  type: ProcessErrorType
  result: ProcessResult
  retryable: boolean
  cause?: unknown
}

abstract class PipelineErrorBase extends Error {
  public readonly raceId: string
  public readonly stage: ProcessErrorType
  public readonly result: ProcessResult
  public readonly retryable: boolean
  public readonly cause?: unknown

  protected constructor({
    raceId,
    message,
    type,
    result,
    retryable,
    cause,
  }: PipelineErrorCtorArgs) {
    super(message)
    this.raceId = raceId
    this.stage = type
    this.result = result
    this.retryable = retryable
    this.cause = cause
    this.name = `${type.charAt(0).toUpperCase()}${type.slice(1)}Error`
  }
}

export class FetchError extends PipelineErrorBase {
  /**
   * Error thrown when the fetch stage fails or returns invalid data.
   */
  constructor(
    raceId: string,
    message: string,
    result: ProcessResult,
    retryable: boolean,
    cause?: unknown
  ) {
    super({ raceId, message, type: 'fetch', result, retryable, cause })
  }
}

export class TransformError extends PipelineErrorBase {
  /**
   * Error thrown when the transform worker fails to produce a normalized payload.
   */
  constructor(
    raceId: string,
    message: string,
    result: ProcessResult,
    retryable: boolean,
    cause?: unknown
  ) {
    super({ raceId, message, type: 'transform', result, retryable, cause })
  }
}

export class WriteError extends PipelineErrorBase {
  /**
   * Error thrown when persistence logic fails, wrapping database/partition exceptions.
   */
  constructor(
    raceId: string,
    message: string,
    result: ProcessResult,
    retryable: boolean,
    cause?: unknown
  ) {
    super({ raceId, message, type: 'write', result, retryable, cause })
  }
}

export type PipelineStageError = FetchError | TransformError | WriteError

const persistTransformedRace = async (
  transformed: TransformedRace
): Promise<WriteStageOutcome> => {
  const { raceId } = transformed
  const log = logger.child({ raceId })
  log.info('Persisting transformed race')

  return await withTransaction(async (client: PoolClient) => {
    const meetingResult =
      transformed.meeting != null
        ? await bulkUpsertMeetings([transformed.meeting], client)
        : { rowCount: 0, duration: 0 }

    const racePayload =
      transformed.race != null
        ? [
            {
              race_id: transformed.race.race_id,
              meeting_id: transformed.race.meeting_id ?? null,
              name: transformed.race.name,
              race_number: transformed.race.race_number ?? null,
              start_time_nz: transformed.race.start_time_nz,
              status: transformed.race.status,
              race_date_nz: transformed.race.race_date_nz,
            },
          ]
        : []

    const raceResult =
      racePayload.length > 0
        ? await bulkUpsertRaces(racePayload, client)
        : { rowCount: 0, duration: 0 }

    const entrantResult =
      transformed.entrants.length > 0
        ? await bulkUpsertEntrants(transformed.entrants, client)
        : { rowCount: 0, duration: 0 }

    const moneyFlowResult =
      transformed.moneyFlowRecords.length > 0
        ? await insertMoneyFlowHistory(transformed.moneyFlowRecords, { client })
        : { rowCount: 0, duration: 0 }

    const oddsRecords = buildOddsRecords(transformed)
    const oddsResult =
      oddsRecords.length > 0
        ? await insertOddsHistory(oddsRecords, { client })
        : { rowCount: 0, duration: 0 }

    return {
      rowCounts: {
        meetings: meetingResult.rowCount,
        races: raceResult.rowCount,
        entrants: entrantResult.rowCount,
        moneyFlowHistory: moneyFlowResult.rowCount,
        oddsHistory: oddsResult.rowCount,
      },
      breakdown: {
        meetings_ms: Math.round(meetingResult.duration),
        races_ms: Math.round(raceResult.duration),
        entrants_ms: Math.round(entrantResult.duration),
        money_flow_ms: Math.round(moneyFlowResult.duration),
        odds_ms: Math.round(oddsResult.duration),
      },
    }
  })
}

/**
 * Execute the race processing pipeline for a single race identifier.
 *
 * The pipeline executes sequential stages (fetch → transform → write), collecting timings,
 * logging structured events, and surfacing typed failures with retry guidance.
 */
export const processRace = async (
  raceId: string,
  options: ProcessOptions = {}
): Promise<ProcessResult> => {
  const pipelineStart = performance.now()
  logger.info(
    { raceId, event: 'pipeline_start', contextId: options.contextId },
    'Race pipeline started'
  )

  let fetchDuration = 0
  let transformDuration = 0
  let writeDuration = 0
  let rowCounts = zeroRowCounts()

  let raceData: RaceData | null = null
  let transformedRace: TransformedRace | null = null

  // Fetch stage
  logger.info(
    { raceId, event: 'fetch_start', contextId: options.contextId },
    'Starting fetch stage'
  )
  const fetchStart = performance.now()
  try {
    raceData = await fetchRaceData(raceId)
    fetchDuration = performance.now() - fetchStart

    logger.info(
      {
        raceId,
        event: 'fetch_complete',
        fetch_ms: Math.round(fetchDuration),
        contextId: options.contextId,
      },
      'Fetch stage completed'
    )
  } catch (error) {
    fetchDuration = performance.now() - fetchStart
    const totalDuration = performance.now() - pipelineStart
    const retryable = error instanceof NzTabError ? error.isRetriable : false
    const message =
      error instanceof Error ? error.message : 'Unknown fetch failure'

    const result = createResult(
      raceId,
      'failed',
      {
        fetch: fetchDuration,
        transform: transformDuration,
        write: writeDuration,
        total: totalDuration,
      },
      rowCounts,
      {
        type: 'fetch',
        message,
        retryable,
      },
      options
    )

    logger.error(
      {
        raceId,
        event: 'fetch_failed',
        duration_ms: result.timings.fetch_ms,
        retryable,
        error: serializeError(error),
        contextId: options.contextId,
      },
      'Fetch stage failed'
    )

    throw new FetchError(raceId, message, result, retryable, error)
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (raceData == null) {
    const totalDuration = performance.now() - pipelineStart
    const result = createResult(
      raceId,
      'skipped',
      {
        fetch: fetchDuration,
        transform: transformDuration,
        write: writeDuration,
        total: totalDuration,
      },
      rowCounts,
      {
        type: 'fetch',
        message: 'Fetch returned null – pipeline short-circuited',
        retryable: false,
      },
      options
    )

    logger.warn(
      {
        raceId,
        event: 'fetch_null',
        fetch_ms: result.timings.fetch_ms,
      },
      'Fetch returned null; skipping transform and write stages'
    )

    logger.info(
      {
        raceId,
        event: 'pipeline_complete',
        status: result.status,
        timings: result.timings,
        rowCounts: result.rowCounts,
        contextId: options.contextId,
      },
      'Race pipeline completed with skip status'
    )

    return result
  }

  // Transform stage
  logger.info(
    { raceId, event: 'transform_start', contextId: options.contextId },
    'Starting transform stage'
  )
  const transformStart = performance.now()
  try {
    transformedRace = await workerPool.exec(raceData)
    transformDuration = performance.now() - transformStart

    logger.info(
      {
        raceId,
        event: 'transform_complete',
        transform_ms: Math.round(transformDuration),
        entrants: transformedRace.entrants.length,
        moneyFlowRecords: transformedRace.moneyFlowRecords.length,
        contextId: options.contextId,
      },
      'Transform stage completed'
    )
  } catch (error) {
    transformDuration = performance.now() - transformStart
    const totalDuration = performance.now() - pipelineStart
    const message =
      error instanceof Error ? error.message : 'Unknown transform failure'

    const result = createResult(
      raceId,
      'failed',
      {
        fetch: fetchDuration,
        transform: transformDuration,
        write: writeDuration,
        total: totalDuration,
      },
      rowCounts,
      {
        type: 'transform',
        message,
        retryable: false,
      },
      options
    )

    logger.error(
      {
        raceId,
        event: 'transform_failed',
        duration_ms: result.timings.transform_ms,
        error: serializeError(error),
        contextId: options.contextId,
      },
      'Transform stage failed'
    )

    throw new TransformError(raceId, message, result, false, error)
  }

  // Write stage
  logger.info(
    { raceId, event: 'write_start', contextId: options.contextId },
    'Starting write stage'
  )
  const writeStart = performance.now()
  try {
    const writeOutcome = await persistTransformedRace(transformedRace)
    writeDuration = performance.now() - writeStart
    const { rowCounts: newRowCounts, breakdown } = writeOutcome
    rowCounts = newRowCounts

    logger.info(
      {
        raceId,
        event: 'write_complete',
        write_ms: Math.round(writeDuration),
        rowCounts,
        breakdown_ms: breakdown,
        contextId: options.contextId,
      },
      'Write stage completed'
    )
  } catch (error) {
    writeDuration = performance.now() - writeStart
    const totalDuration = performance.now() - pipelineStart
    const isDatabaseError = error instanceof DatabaseWriteError
    const retryable =
      error instanceof DatabaseWriteError
        ? error.retryable
        : error instanceof PartitionNotFoundError
          ? false
          : error instanceof TransactionError
            ? false
            : false
    const message =
      error instanceof Error ? error.message : 'Unknown write failure'

    const result = createResult(
      raceId,
      'failed',
      {
        fetch: fetchDuration,
        transform: transformDuration,
        write: writeDuration,
        total: totalDuration,
      },
      rowCounts,
      {
        type: 'write',
        message,
        retryable,
      },
      options
    )

    logger.error(
      {
        raceId,
        event: 'write_failed',
        duration_ms: result.timings.write_ms,
        retryable,
        error: serializeError(error),
        isDatabaseError,
        contextId: options.contextId,
      },
      'Write stage failed'
    )

    throw new WriteError(raceId, message, result, retryable, error)
  }

  const totalDuration = performance.now() - pipelineStart
  const result = createResult(
    raceId,
    'success',
    {
      fetch: fetchDuration,
      transform: transformDuration,
      write: writeDuration,
      total: totalDuration,
    },
    rowCounts,
    undefined,
    options
  )

  const overBudget = result.timings.total_ms >= 2000

  logger.info(
    {
      raceId,
      event: 'pipeline_complete',
      status: result.status,
      timings: result.timings,
      rowCounts: result.rowCounts,
      overBudget,
      contextId: options.contextId,
    },
    'Race pipeline completed'
  )

  if (overBudget) {
    logger.warn(
      {
        raceId,
        event: 'pipeline_over_budget',
        total_ms: result.timings.total_ms,
        target_ms: 2000,
        contextId: options.contextId,
      },
      'Race processing exceeded 2s budget'
    )
  }

  return result
}

/**
 * Execute the race processing pipeline for multiple races with bounded concurrency.
 *
 * Returns the per-race results alongside captured stage errors so callers can
 * aggregate metrics while deciding on retries or alerting strategies.
 */
export const processRaces = async (
  raceIds: string[],
  maxConcurrency = 5,
  options: ProcessOptions = {}
): Promise<{
  results: ProcessResult[]
  errors: PipelineStageError[]
  metrics: {
    requestedConcurrency: number
    effectiveConcurrency: number
    totalRaces: number
    successes: number
    failures: number
    retryableFailures: number
    maxDuration_ms: number
  }
}> => {
  const results: ProcessResult[] = []
  const errors: PipelineStageError[] = []

  const poolLimit = Math.max(1, env.DB_POOL_MAX)
  const effectiveConcurrency = Math.max(1, Math.min(maxConcurrency, poolLimit))

  if (effectiveConcurrency < maxConcurrency) {
    logger.warn(
      {
        event: 'pipeline_batch_concurrency_adjusted',
        requestedConcurrency: maxConcurrency,
        effectiveConcurrency,
        poolLimit,
        contextId: options.contextId,
      },
      'Adjusted batch concurrency to respect connection pool limit'
    )
  }

  const metrics = {
    requestedConcurrency: maxConcurrency,
    effectiveConcurrency,
    totalRaces: raceIds.length,
    successes: 0,
    failures: 0,
    retryableFailures: 0,
    maxDuration_ms: 0,
  }

  logger.info(
    {
      event: 'pipeline_batch_start',
      total: raceIds.length,
      requestedConcurrency: maxConcurrency,
      effectiveConcurrency,
      contextId: options.contextId,
    },
    'Batch race processing started'
  )

  for (let index = 0; index < raceIds.length; index += effectiveConcurrency) {
    const batch = raceIds.slice(index, index + effectiveConcurrency)
    const settled = await Promise.allSettled(
      batch.map((raceId) => processRace(raceId, options))
    )

    for (let i = 0; i < settled.length; i += 1) {
      const outcome = settled[i]
      const raceId = batch[i]

      if (outcome === undefined) {
        continue
      }

      if (raceId === undefined) {
        continue
      }

      if (outcome.status === 'fulfilled') {
        results.push(outcome.value)
        metrics.successes += 1
        metrics.maxDuration_ms = Math.max(
          metrics.maxDuration_ms,
          outcome.value.timings.total_ms
        )
        continue
      }

      // eslint-disable-next-line prefer-destructuring
      const reason: unknown = outcome.reason

      if (
        reason instanceof FetchError ||
        reason instanceof TransformError ||
        reason instanceof WriteError
      ) {
        errors.push(reason)
        metrics.failures += 1
        const failureDuration = reason.result.timings.total_ms
        if (failureDuration > metrics.maxDuration_ms) {
          metrics.maxDuration_ms = failureDuration
        }

        if (reason.retryable) {
          metrics.retryableFailures += 1
        }

        continue
      }

      const fallbackResult = createResult(
        raceId,
        'failed',
        { fetch: 0, transform: 0, write: 0, total: 0 },
        zeroRowCounts(),
        {
          type: 'write',
          message:
            reason instanceof Error
              ? reason.message
              : 'Unknown pipeline batch error',
          retryable: false,
        },
        options
      )

      errors.push(
        new WriteError(
          raceId,
          fallbackResult.error?.message ?? 'Unknown pipeline batch error',
          fallbackResult,
          false,
          reason
        )
      )

      metrics.failures += 1
      metrics.maxDuration_ms = Math.max(
        metrics.maxDuration_ms,
        fallbackResult.timings.total_ms
      )
    }
  }

  logger.info(
    {
      event: 'pipeline_batch_complete',
      total: raceIds.length,
      successful: results.length,
      failed: errors.length,
      retryable: errors.filter((error) => error.retryable).length,
      maxDuration_ms: metrics.maxDuration_ms,
      effectiveConcurrency,
      contextId: options.contextId,
    },
    'Batch race processing completed'
  )

  return { results, errors, metrics }
}
