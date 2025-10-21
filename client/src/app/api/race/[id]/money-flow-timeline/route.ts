import { NextRequest } from 'next/server'
import { apiClient, ApiError } from '@/lib/api-client'
import { jsonWithCompression } from '@/lib/http/compression'

const VALID_POOL_TYPES = new Set(['win', 'place', 'odds'])

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(request.url)
  const entrantsParam = searchParams.get('entrants') ?? ''
  const entrant_ids = entrantsParam
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  const poolTypeParam = searchParams.get('poolType') ?? 'win'
  const cursorAfter = searchParams.get('cursorAfter') ?? undefined
  const createdAfter = searchParams.get('createdAfter') ?? undefined
  const limit = searchParams.get('limit') ?? undefined
  const { id: race_id } = await params

  if (!race_id) {
    return jsonWithCompression(
      request,
      { error: 'Race ID is required' },
      { status: 400 }
    )
  }

  if (entrant_ids.length === 0) {
    return jsonWithCompression(
      request,
      { error: 'Entrant IDs are required' },
      { status: 400 }
    )
  }

  if (!VALID_POOL_TYPES.has(poolTypeParam)) {
    return jsonWithCompression(
      request,
      {
        error: 'Invalid poolType parameter',
        message: `poolType must be one of: ${[...VALID_POOL_TYPES].join(', ')}`,
        received: poolTypeParam,
      },
      { status: 400 }
    )
  }

  try {
    const payload = await apiClient.get('/api/money-flow-timeline', {
      params: {
        raceId: race_id,
        entrants: entrant_ids.join(','),
        poolType: poolTypeParam,
        limit,
        cursorAfter,
        createdAfter,
      },
      cache: 'no-store',
    })

    return jsonWithCompression(request, payload)
  } catch (error) {
    console.error('Failed to fetch money flow timeline:', error)

    const status = error instanceof ApiError ? error.status : 500
    const message =
      error instanceof ApiError
        ? `${error.status} ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Failed to fetch money flow timeline data'

    return jsonWithCompression(
      request,
      { error: message },
      { status }
    )
  }
}
