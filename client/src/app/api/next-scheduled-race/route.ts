import { NextRequest } from 'next/server'
import { apiClient, ApiError } from '@/lib/api-client'
import { jsonWithCompression } from '@/lib/http/compression'

interface NextScheduledRaceResponse {
  race_id: string
  meeting_id: string
  name: string
  race_number: number
  start_time: string
  status: string
  meeting_name?: string | null
}

export async function GET(request: NextRequest) {
  try {
    const nextRace = await apiClient.get<NextScheduledRaceResponse | null>(
      '/api/races/next-scheduled',
      {
        cache: 'no-store',
      }
    )

    const response = await jsonWithCompression(request, {
      nextScheduledRace: nextRace,
      message: nextRace ? undefined : 'No upcoming races available',
    })
    response.headers.set(
      'Cache-Control',
      'public, max-age=60, stale-while-revalidate=120'
    )

    return response
  } catch (error) {
    console.error('API Error fetching next scheduled race:', error)

    const status = error instanceof ApiError ? error.status : 500

    return jsonWithCompression(
      request,
      { error: 'Internal server error' },
      { status }
    )
  }
}
