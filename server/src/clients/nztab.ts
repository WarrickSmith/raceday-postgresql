import axios, { AxiosError, type AxiosInstance } from 'axios'
import { z } from 'zod'
import { env } from '../shared/env.js'
import { logger } from '../shared/logger.js'
import { MeetingDataSchema, type MeetingData } from './nztab-types.js'

/**
 * Zod schema for race data validation
 * Validates the response from NZ TAB API /racing/events/{id}
 *
 * Note: Uses snake_case to match NZ TAB API response format
 */
/* eslint-disable @typescript-eslint/naming-convention */
export const RaceDataSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(['open', 'closed', 'interim', 'final', 'abandoned']),
    race_date_nz: z.string(), // YYYY-MM-DD format in NZ timezone
    start_time_nz: z.string(), // HH:MM format in NZ timezone
    race_number: z.number().optional(),
    meeting_id: z.string().optional(),
    // Additional fields can be added as needed for validation
    // Using passthrough to allow additional fields while validating critical ones
  })
  .passthrough()

export type RaceData = z.infer<typeof RaceDataSchema>

const MeetingsResponseSchema = z
  .object({
    data: z.object({
      meetings: z.array(MeetingDataSchema),
    }),
    header: z
      .object({
        generated_time: z.string().optional(),
      })
      .optional(),
  })
  .passthrough()
/* eslint-enable @typescript-eslint/naming-convention */

const DEFAULT_MEETING_COUNTRIES = new Set(['NZ', 'AU'])
const DEFAULT_MEETING_CATEGORIES = new Set(['R', 'H']) // R = thoroughbred, H = harness

/**
 * Retry configuration following PRD NFR005 requirements
 */
const RETRY_CONFIG = {
  maxAttempts: 3,
  delays: [100, 200, 400] as const, // Exponential backoff in milliseconds
} as const

/**
 * Determine if an error is retriable (network, timeout, or 5xx)
 */
function isRetriableError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false
  }

  // Network errors and timeouts are retriable
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return true
  }

  // Missing or undefined response indicates network error
  if (error.response === undefined) {
    return true
  }

  // 5xx server errors are retriable
  const { status } = error.response
  return status >= 500 && status < 600
}

/**
 * Build status-aware query parameters for race data fetch
 * Adapts parameters based on race status per research findings
 *
 * Note: Uses snake_case to match NZ TAB API parameter format
 */
/* eslint-disable @typescript-eslint/naming-convention */
function buildFetchParams(status?: string): Record<string, boolean> {
  if (status === 'open') {
    return {
      with_tote_trends_data: true,
      with_money_tracker: true,
      with_big_bets: true,
      with_live_bets: true,
      with_will_pays: true,
    }
  }

  if (status === 'interim' || status === 'closed') {
    return {
      with_results: true,
      ...(status === 'closed' && { with_dividends: true }),
    }
  }

  // Default: fetch all pre-race parameters
  return {
    with_tote_trends_data: true,
    with_money_tracker: true,
    with_big_bets: true,
    with_live_bets: true,
    with_will_pays: true,
  }
}
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Create Axios client configured for NZ TAB API
 * Enforces 5s timeout and applies verified partner headers
 */
/* eslint-disable @typescript-eslint/naming-convention */
export function createNzTabClient(): AxiosInstance {
  return axios.create({
    baseURL: env.NZTAB_API_URL,
    timeout: 5000,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RaceDay-Daily-Importer/2.0.0',
      From: env.NZTAB_FROM_EMAIL,
      'X-Partner': env.NZTAB_PARTNER_NAME.replace(/_/g, ' '), // Replace underscores with spaces
      'X-Partner-ID': env.NZTAB_PARTNER_ID.replace(/_/g, '-'), // Replace underscores with hyphens
    },
  })
}
/* eslint-enable @typescript-eslint/naming-convention */

// Singleton client instance
let nztabClient: AxiosInstance | null = null

/**
 * Get or create the NZ TAB client instance
 */
function getNzTabClient(): AxiosInstance {
  nztabClient ??= createNzTabClient()
  return nztabClient
}

/**
 * Custom error class for NZ TAB API errors
 */
export class NzTabError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseExcerpt?: string,
    public readonly isRetriable = false
  ) {
    super(message)
    this.name = 'NzTabError'
  }
}

/**
 * Fetch race data from NZ TAB API with retry logic and validation
 * Implements AC1-AC6 requirements including retry, timeout, and logging
 *
 * @param raceId - The race ID to fetch
 * @param status - Optional race status to optimize fetch parameters
 * @param clientOverride - Optional Axios client override for testing
 * @returns Validated race data
 * @throws NzTabError with sanitized error details
 */
export async function fetchRaceData(
  raceId: string,
  status?: string,
  clientOverride?: AxiosInstance
): Promise<RaceData> {
  const client = clientOverride ?? getNzTabClient()
  const startTime = Date.now()
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
    const attemptStart = Date.now()

    try {
      // Log fetch start
      logger.info({
        raceId,
        attempt,
        status,
        event: 'fetch_start',
      })

      // Build status-aware query parameters
      const params = buildFetchParams(status)

      // Execute fetch
      const response = await client.get<unknown>(`/racing/events/${raceId}`, {
        params,
      })

      // Log the raw response for debugging
      logger.info({
        raceId,
        attempt,
        responseData: response.data,
        event: 'fetch_raw_response',
      })

      // Extract race data from the nested structure
      // The API returns data in the format: { data: { race: { ...raceFields } } }
      const responseData = response.data as Record<string, unknown>
      const dataSection = responseData.data as
        | Record<string, unknown>
        | undefined
      const raceData = dataSection?.race as Record<string, unknown> | undefined

      if (raceData == null) {
        throw new NzTabError(
          `Invalid API response structure for race ${raceId}: missing data.race object`,
          undefined
        )
      }

      // Transform API response to match our schema
      const apiData = raceData
      /* eslint-disable @typescript-eslint/naming-convention */
      const transformedRaceData = {
        // Only include the fields we need with our naming convention
        id: apiData.event_id ?? apiData.id,
        name: apiData.description ?? apiData.name,
        // Normalize status values from API (capitalized) to our schema (lowercase)
        status:
          typeof apiData.status === 'string'
            ? apiData.status.toLowerCase()
            : undefined,
        // Map API field names to our expected field names
        meeting_id: apiData.meeting_id,
        race_number: apiData.race_number,
        // Use the NZ-specific date and time fields from the API
        race_date_nz: apiData.race_date_nz,
        start_time_nz: apiData.start_time_nz,
        // Transform entrants if present
        entrants: Array.isArray(apiData.entrants)
          ? apiData.entrants.map((entrant: unknown) => {
              const entrantData = entrant as Record<string, unknown>
              return {
                // Only include the fields we need with our naming convention
                entrantId: entrantData.entrant_id,
                runnerNumber: entrantData.runner_number,
                barrier: entrantData.barrier_position ?? entrantData.barrier,
                // Normalize odds data
                fixedWinOdds: (entrantData.odds as Record<string, unknown>)
                  .fixed_win,
                fixedPlaceOdds: (entrantData.odds as Record<string, unknown>)
                  .fixed_place,
                poolWinOdds: (entrantData.odds as Record<string, unknown>)
                  .pool_win,
                poolPlaceOdds: (entrantData.odds as Record<string, unknown>)
                  .pool_place,
                // Normalize scratching status
                isScratched: entrantData.is_scratched,
                isLateScratched: entrantData.is_late_scratched,
                // Map connection details
                jockey: entrantData.jockey,
                trainerName: entrantData.trainer_name,
                // Map visual presentation
                silkColours: entrantData.silk_colours,
                silkUrl64: entrantData.silk_url_64x64,
                silkUrl128: entrantData.silk_url_128x128,
              }
            })
          : undefined,
      }
      /* eslint-enable @typescript-eslint/naming-convention */

      // Validate response with Zod schema
      const validatedData = RaceDataSchema.parse(transformedRaceData)

      // Log success
      const duration = Date.now() - attemptStart
      logger.info({
        raceId,
        attempt,
        duration,
        event: 'fetch_success',
      })

      return validatedData
    } catch (error) {
      const duration = Date.now() - attemptStart
      lastError = error instanceof Error ? error : new Error(String(error))

      // Handle Axios errors
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError
        const statusCode = axiosError.response?.status

        // 4xx errors are non-retriable
        if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
          const responseExcerpt = JSON.stringify(
            axiosError.response?.data
          ).slice(0, 200)

          logger.error({
            raceId,
            attempt,
            duration,
            statusCode,
            responseExcerpt,
            event: 'fetch_failure_4xx',
            message: axiosError.message,
          })

          throw new NzTabError(
            `NZ TAB API returned ${String(statusCode)} for race ${raceId}`,
            statusCode,
            responseExcerpt,
            false
          )
        }
      }

      // Handle Zod validation errors (non-retriable)
      if (error instanceof z.ZodError) {
        logger.error({
          raceId,
          attempt,
          duration,
          event: 'fetch_validation_error',
          validationErrors: error.errors,
        })

        throw new NzTabError(
          `Race data validation failed for ${raceId}: ${error.message}`,
          undefined,
          undefined,
          false
        )
      }

      // Check if error is retriable
      const canRetry = isRetriableError(error)

      if (!canRetry || attempt === RETRY_CONFIG.maxAttempts) {
        // Terminal failure
        const totalDuration = Date.now() - startTime
        logger.error({
          raceId,
          attempt,
          duration: totalDuration,
          event: 'fetch_terminal_failure',
          error: lastError.message,
          retriable: canRetry,
        })

        throw new NzTabError(
          `Failed to fetch race ${raceId} after ${String(attempt)} attempts: ${lastError.message}`,
          axios.isAxiosError(error) ? error.response?.status : undefined,
          undefined,
          false
        )
      }

      // Log retry
      const delay = RETRY_CONFIG.delays[attempt - 1] ?? 400
      logger.warn({
        raceId,
        attempt,
        duration,
        delay,
        event: 'fetch_retry',
        error: lastError.message,
      })

      // Wait before retry with exponential backoff
      await new Promise((resolve) => {
        setTimeout(resolve, delay)
      })
    }
  }

  // Should never reach here due to throw in loop, but TypeScript needs this
  throw lastError ?? new Error('Unknown error during fetch')
}

interface FetchMeetingsOptions {
  countries?: string[]
  categories?: string[]
  clientOverride?: AxiosInstance
}

export async function fetchMeetingsForDate(
  date: string,
  options: FetchMeetingsOptions = {}
): Promise<MeetingData[]> {
  const client = options.clientOverride ?? getNzTabClient()
  const countries =
    options.countries?.map((country) => country.toUpperCase()) ??
    Array.from(DEFAULT_MEETING_COUNTRIES)
  const categories =
    options.categories?.map((category) => category.toUpperCase()) ??
    Array.from(DEFAULT_MEETING_CATEGORIES)

  const countriesSet = new Set(countries)
  const categoriesSet = new Set(categories)

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
    const attemptStartedAt = Date.now()

    try {
      logger.info({
        event: 'fetch_meetings_start',
        attempt,
        date,
        url: `${String(client.defaults.baseURL)}/racing/meetings`,
        params: {
          dateFrom: date,
          dateTo: date,
        },
      })

      const response = await client.get<unknown>('/racing/meetings', {
        params: {
          ['date_from']: date,
          ['date_to']: date,
        },
      })

      logger.debug({
        event: 'fetch_meetings_response',
        attempt,
        date,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })

      const parsed = MeetingsResponseSchema.parse(response.data)
      const meetings = parsed.data.meetings.filter((meeting) => {
        const country =
          typeof meeting.country === 'string'
            ? meeting.country.toUpperCase()
            : ''
        const category =
          typeof meeting.category === 'string'
            ? meeting.category.toUpperCase()
            : ''
        return countriesSet.has(country) && categoriesSet.has(category)
      })

      const duration = Date.now() - attemptStartedAt

      logger.info({
        event: 'fetch_meetings_success',
        attempt,
        date,
        totalMeetings: parsed.data.meetings.length,
        filteredMeetings: meetings.length,
        generatedTime: parsed.header?.generated_time,
        duration,
      })

      return meetings
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const duration = Date.now() - attemptStartedAt

      if (error instanceof z.ZodError) {
        logger.error({
          event: 'fetch_meetings_validation_error',
          attempt,
          date,
          duration,
          errors: error.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        })

        throw new NzTabError(
          `Meetings data validation failed for date ${date}: ${error.message}`,
          undefined,
          undefined,
          false
        )
      }

      const retriable = isRetriableError(error)

      logger.warn({
        event: retriable ? 'fetch_meetings_retry' : 'fetch_meetings_failure',
        attempt,
        date,
        duration,
        error: serializeError(error),
        retriable,
      })

      if (!retriable || attempt === RETRY_CONFIG.maxAttempts) {
        throw new NzTabError(
          `Failed to fetch meetings for date ${date} after ${String(attempt)} attempts: ${lastError.message}`,
          axios.isAxiosError(error) ? error.response?.status : undefined,
          undefined,
          retriable
        )
      }

      const delay = RETRY_CONFIG.delays[attempt - 1] ?? 400
      await new Promise((resolve) => {
        setTimeout(resolve, delay)
      })
    }
  }

  throw lastError ?? new Error('Unknown error fetching meetings')
}

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
