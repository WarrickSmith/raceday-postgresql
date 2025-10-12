import type { RaceData } from '../clients/nztab-types.js'
import { workerPool } from '../workers/worker-pool.js'
import {
  bulkUpsertMeetings,
  bulkUpsertRaces,
  bulkUpsertEntrants,
  DatabaseWriteError,
  TransactionError,
} from '../database/bulk-upsert.js'
import { logger } from '../shared/logger.js'
import type { TransformedRace } from '../workers/messages.js'

export interface RaceProcessResult {
  raceId: string
  success: boolean
  transformDuration: number
  writeDuration: number
  totalDuration: number
  rowCounts: {
    meetings: number
    races: number
    entrants: number
  }
}

export interface RaceProcessError {
  raceId: string
  error: Error
  retryable: boolean
  phase: 'fetch' | 'transform' | 'write'
}

/**
 * Process a single race through the full pipeline: transform → persist (Story 2.5)
 *
 * Coordinates:
 * 1. Transform worker execution (Story 2.4) via WorkerPool (Story 2.3)
 * 2. Bulk UPSERT operations (Story 2.5) with transactional guarantees
 * 3. Error classification and structured logging
 *
 * @param raceData - Validated RaceData from NZ TAB API (Story 2.1/2.2)
 * @returns Process result with timing metrics and row counts
 * @throws DatabaseWriteError for retryable/fatal database failures
 */
export const processRace = async (
  raceData: RaceData
): Promise<RaceProcessResult> => {
  const raceId = raceData.id
  const startTime = performance.now()

  try {
    // Phase 1: Transform via worker pool (Story 2.4, AC2 in Story 2.5)
    logger.info({ raceId, phase: 'transform' }, 'Starting race transform')
    const transformStart = performance.now()
    const transformed: TransformedRace = await workerPool.exec(raceData)
    const transformDuration = performance.now() - transformStart

    logger.info(
      {
        raceId,
        transformDuration: Math.round(transformDuration),
        entrantCount: transformed.entrants.length,
        moneyFlowRecordCount: transformed.moneyFlowRecords.length,
      },
      'Transform completed'
    )

    // Phase 2: Persist via bulk UPSERT (Story 2.5, AC1-7)
    logger.info({ raceId, phase: 'write' }, 'Starting database write')
    const writeStart = performance.now()

    // Execute UPSERTs sequentially (meetings → races → entrants)
    // Each uses shared connection pool and returns metrics
    const meetingResult = transformed.meeting !== null && transformed.meeting !== undefined
      ? await bulkUpsertMeetings([transformed.meeting])
      : { rowCount: 0, duration: 0 }

    const raceResult = transformed.race !== null && transformed.race !== undefined
      ? await bulkUpsertRaces([{
          /* eslint-disable @typescript-eslint/naming-convention */
          race_id: transformed.race.race_id,
          name: transformed.race.name,
          status: transformed.race.status,
          race_number: transformed.race.race_number ?? null,
          race_date_nz: transformed.race.race_date_nz,
          start_time_nz: transformed.race.start_time_nz,
          meeting_id: transformed.race.meeting_id ?? null,
          /* eslint-enable @typescript-eslint/naming-convention */
        }])
      : { rowCount: 0, duration: 0 }

    const entrantResult = await bulkUpsertEntrants(transformed.entrants)

    const writeDuration = performance.now() - writeStart
    const totalDuration = performance.now() - startTime

    // Aggregate metrics and log summary (AC7)
    const result: RaceProcessResult = {
      raceId,
      success: true,
      transformDuration: Math.round(transformDuration),
      writeDuration: Math.round(writeDuration),
      totalDuration: Math.round(totalDuration),
      rowCounts: {
        meetings: meetingResult.rowCount,
        races: raceResult.rowCount,
        entrants: entrantResult.rowCount,
      },
    }

    logger.info(
      {
        raceId,
        transformDuration: result.transformDuration,
        writeDuration: result.writeDuration,
        totalDuration: result.totalDuration,
        rowCounts: result.rowCounts,
        overBudget: result.totalDuration >= 2000,
      },
      'Race processing completed'
    )

    if (result.totalDuration >= 2000) {
      logger.warn(
        {
          raceId,
          totalDuration: result.totalDuration,
          target: 2000,
        },
        'Race processing exceeded 2s budget'
      )
    }

    return result
  } catch (error) {
    const totalDuration = performance.now() - startTime

    // Classify error for retry logic (AC6)
    const isTransformError = error instanceof Error && error.message.includes('Worker')
    const isDatabaseError =
      error instanceof DatabaseWriteError || error instanceof TransactionError

    const retryable = isTransformError || (error instanceof DatabaseWriteError && error.retryable)

    // Emit structured error log with race identifier (AC6)
    logger.error(
      {
        raceId,
        error: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        retryable,
        duration: Math.round(totalDuration),
      },
      'Race processing failed'
    )

    // Surface typed error to caller for classification (AC6)
    if (isDatabaseError) {
      throw error
    }

    throw new DatabaseWriteError(
      `Race processing failed: ${error instanceof Error ? error.message : String(error)}`,
      raceId,
      error instanceof Error ? error : new Error(String(error)),
      retryable
    )
  }
}

/**
 * Process multiple races in parallel with concurrency control
 *
 * @param races - Array of RaceData to process
 * @param maxConcurrency - Maximum concurrent race processors (default: 5)
 * @returns Array of results and errors
 */
export const processRaces = async (
  races: RaceData[],
  maxConcurrency = 5
): Promise<{
  results: RaceProcessResult[]
  errors: RaceProcessError[]
}> => {
  const results: RaceProcessResult[] = []
  const errors: RaceProcessError[] = []

  // Process races in batches to respect pool limits
  for (let i = 0; i < races.length; i += maxConcurrency) {
    const batch = races.slice(i, i + maxConcurrency)

    const settled = await Promise.allSettled(
      batch.map((race) => processRace(race))
    )

    for (const [index, outcome] of settled.entries()) {
      const race = batch[index]
      if (race === undefined) continue // Skip if race is undefined

      if (outcome.status === 'fulfilled') {
        results.push(outcome.value)
      } else {
        const error = outcome.reason as Error
        errors.push({
          raceId: race.id,
          error,
          retryable:
            error instanceof DatabaseWriteError ? error.retryable : false,
          phase: 'write',
        })
      }
    }
  }

  logger.info(
    {
      total: races.length,
      successful: results.length,
      failed: errors.length,
      retryable: errors.filter((e) => e.retryable).length,
    },
    'Batch race processing completed'
  )

  return { results, errors }
}
