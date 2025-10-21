import { NextRequest } from 'next/server'
import { apiClient, ApiError } from '@/lib/api-client'
import type { RacePoolData } from '@/types/racePools'
import { jsonWithCompression } from '@/lib/http/compression'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: race_id } = await params

    if (!race_id) {
      return jsonWithCompression(
        request,
        { error: 'Race ID is required' },
        { status: 400 }
      )
    }

    const poolData = await apiClient.get<RacePoolData>('/api/race-pools', {
      params: { raceId: race_id },
      cache: 'no-store',
    })

    const response = await jsonWithCompression(request, poolData)
    response.headers.set('Cache-Control', 'public, max-age=5, stale-while-revalidate=15')
    response.headers.set('X-Pool-Data-Race-ID', race_id)

    return response
  } catch (error) {
    console.error('API Error fetching pool data:', error)

    const status = error instanceof ApiError ? error.status : 500
    const message =
      error instanceof ApiError
        ? `${error.status} ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Internal server error'

    return jsonWithCompression(
      request,
      { error: message },
      { status }
    )
  }
}
