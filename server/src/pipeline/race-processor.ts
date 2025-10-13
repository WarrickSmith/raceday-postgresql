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
} from '../database/bulk-upsert.js'
import {
  insertMoneyFlowHistory,
  insertOddsHistory,
  PartitionNotFoundError,
  type OddsRecord,
} from '../database/time-series.js'
import type { TransformedRace } from '../workers/messages.js'
import { logger } from '../shared/logger.js'

type ProcessErrorType = 'fetch' | 'transform' | 'write'

export interface ProcessTimings {
  fetch_ms: number
  transform_ms: number
  write_ms: number
  total_ms: number
}

export interface ProcessRowCounts {
  meetings: number
  races: number
  entrants: number
  moneyFlowHistory: number
  oddsHistory: number
}

export type ProcessStatus = 'success' | 'skipped' | 'failed'

export interface ProcessResult {
  raceId: string
  status: ProcessStatus
  success: boolean
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
  errorDetails?: ProcessErrorDetails
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

const resolveOddsEventTimestamp = (transformed: TransformedRace): string => {
  const raceMeta = transformed.race
  if (raceMeta != null) {
    return `${raceMeta.race_date_nz}T${raceMeta.start_time_nz}:00Z`
  }

  const [firstMoneyFlowRecord] = transformed.moneyFlowRecords
  if (firstMoneyFlowRecord != null) {
    return firstMoneyFlowRecord.polling_timestamp
  }

  return new Date().toISOString()
}

const buildOddsRecords = (transformed: TransformedRace): OddsRecord[] => {
  const eventTimestamp = resolveOddsEventTimestamp(transformed)
  const records: OddsRecord[] = []

  for (const entrant of transformed.entrants) {
    if (entrant.fixed_win_odds !== undefined && entrant.fixed_win_odds !== null) {
      records.push({
        entrant_id: entrant.entrant_id,
        odds: entrant.fixed_win_odds,
        type: 'fixed_win',
        event_timestamp: eventTimestamp,
      })
    }

    if (entrant.pool_win_odds !== undefined && entrant.pool_win_odds !== null) {
      records.push({
        entrant_id: entrant.entrant_id,
        odds: entrant.pool_win_odds,
        type: 'pool_win',
        event_timestamp: eventTimestamp,
      })
    }
  }

  return records
}

const persistTransformedRace = async (
  transformed: TransformedRace
): Promise<WriteStageOutcome> => {
  const meetingResult =
    transformed.meeting != null
      ? await bulkUpsertMeetings([transformed.meeting])
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
      ? await bulkUpsertRaces(racePayload)
      : { rowCount: 0, duration: 0 }

  const entrantResult =
    transformed.entrants.length > 0
      ? await bulkUpsertEntrants(transformed.entrants)
      : { rowCount: 0, duration: 0 }

  const moneyFlowResult =
    transformed.moneyFlowRecords.length > 0
      ? await insertMoneyFlowHistory(transformed.moneyFlowRecords)
      : { rowCount: 0, duration: 0 }

  const oddsRecords = buildOddsRecords(transformed)
  const oddsResult =
    oddsRecords.length > 0
      ? await insertOddsHistory(oddsRecords)
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
}

export const processRace = async (raceId: string): Promise<ProcessResult> => {
  const pipelineStart = performance.now()
  logger.info({ raceId, event: 'pipeline_start' }, 'Race pipeline started')

  let fetchDuration = 0
  let transformDuration = 0
  let writeDuration = 0
  let rowCounts = zeroRowCounts()

  let raceData: RaceData | null = null
  let transformedRace: TransformedRace | null = null

  // Fetch stage
  logger.info({ raceId, event: 'fetch_start' }, 'Starting fetch stage')
  const fetchStart = performance.now()
  try {
    raceData = await fetchRaceData(raceId)
    fetchDuration = performance.now() - fetchStart

    logger.info(
      {
        raceId,
        event: 'fetch_complete',
        fetch_ms: Math.round(fetchDuration),
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
      }
    )

    logger.error(
      {
        raceId,
        event: 'fetch_failed',
        duration_ms: result.timings.fetch_ms,
        retryable,
        error: serializeError(error),
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
      }
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
      },
      'Race pipeline completed with skip status'
    )

    return result
  }

  // Transform stage
  logger.info({ raceId, event: 'transform_start' }, 'Starting transform stage')
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
      }
    )

    logger.error(
      {
        raceId,
        event: 'transform_failed',
        duration_ms: result.timings.transform_ms,
        error: serializeError(error),
      },
      'Transform stage failed'
    )

    throw new TransformError(raceId, message, result, false, error)
  }

  // Write stage
  logger.info({ raceId, event: 'write_start' }, 'Starting write stage')
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
      }
    )

    logger.error(
      {
        raceId,
        event: 'write_failed',
        duration_ms: result.timings.write_ms,
        retryable,
        error: serializeError(error),
        isDatabaseError,
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
    rowCounts
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
      },
      'Race processing exceeded 2s budget'
    )
  }

  return result
}

export const processRaces = async (
  raceIds: string[],
  maxConcurrency = 5
): Promise<{
  results: ProcessResult[]
  errors: PipelineStageError[]
}> => {
  const results: ProcessResult[] = []
  const errors: PipelineStageError[] = []

  for (let index = 0; index < raceIds.length; index += maxConcurrency) {
    const batch = raceIds.slice(index, index + maxConcurrency)
    const settled = await Promise.allSettled(
      batch.map((raceId) => processRace(raceId))
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
        }
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
    }
  }

  logger.info(
    {
      event: 'pipeline_batch_complete',
      total: raceIds.length,
      successful: results.length,
      failed: errors.length,
      retryable: errors.filter((error) => error.retryable).length,
    },
    'Batch race processing completed'
  )

  return { results, errors }
}
