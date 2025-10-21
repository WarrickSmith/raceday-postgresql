import { NextRequest } from 'next/server'
import { apiClient, ApiError } from '@/lib/api-client'
import { jsonWithCompression } from '@/lib/http/compression'

const DEFAULT_WINDOW_MINUTES = 120
const DEFAULT_LOOKBACK_MINUTES = 5
const DEFAULT_LIMIT = 50

/**
 * GET /api/races/upcoming
 *
 * Fetches upcoming races within a specified time window
 * Server-side endpoint to eliminate CORS issues and keep Appwrite credentials secure
 *
 * Query Parameters:
 * - windowMinutes: Number of minutes ahead to search (default: 120)
 * - lookbackMinutes: Number of minutes to look back (default: 5)
 * - limit: Maximum number of races to return (default: 50)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    const windowMinutes =
      Number(searchParams.get('windowMinutes')) || DEFAULT_WINDOW_MINUTES
    const lookbackMinutes =
      Number(searchParams.get('lookbackMinutes')) || DEFAULT_LOOKBACK_MINUTES
    const limitRaw = Number(searchParams.get('limit'))
    const limit = Math.min(
      Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_LIMIT,
      100
    )

    if (windowMinutes < 0 || lookbackMinutes < 0 || limit < 1) {
      return jsonWithCompression(
        request,
        { error: 'Invalid query parameters' },
        { status: 400 }
      )
    }

    const payload = await apiClient.get<{
      races: unknown[]
      total: number
      timestamp: string
      window: {
        lower_bound: string
        upper_bound: string
        window_minutes: number
        lookback_minutes: number
      }
    }>('/api/races/upcoming', {
      params: {
        windowMinutes,
        lookbackMinutes,
        limit,
      },
      cache: 'no-store',
    })

    return jsonWithCompression(request, {
      races: payload.races,
      total: payload.total,
      timestamp: payload.timestamp,
      window: {
        lowerBound: payload.window.lower_bound,
        upperBound: payload.window.upper_bound,
        windowMinutes: payload.window.window_minutes,
        lookbackMinutes: payload.window.lookback_minutes,
      },
    })
  } catch (error) {
    console.error('Error fetching upcoming races:', error)

    const errorMessage =
      error instanceof ApiError
        ? `${error.status} ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Failed to fetch upcoming races'

    const status = error instanceof ApiError ? error.status : 500

    return jsonWithCompression(
      request,
      { error: errorMessage },
      { status }
    )
  }
}
