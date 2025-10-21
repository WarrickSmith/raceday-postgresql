import { NextRequest } from 'next/server'
import { apiClient, ApiError } from '@/lib/api-client'
import type { Race } from '@/types/meetings'
import { jsonWithCompression } from '@/lib/http/compression'

const FINAL_STATUSES = new Set(['final', 'finalized', 'abandoned'])

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ meeting_id: string }> }
) {
  try {
    const { meeting_id } = await params

    if (!meeting_id) {
      return jsonWithCompression(
        request,
        { error: 'Meeting ID is required' },
        { status: 400 }
      )
    }

    const races = await apiClient.get<Race[]>('/api/races', {
      params: { meetingId: meeting_id },
      cache: 'no-store',
    })

    if (races.length === 0) {
      return jsonWithCompression(request, { isCompleted: false })
    }

    const finalizedRaces = races.filter((race) =>
      FINAL_STATUSES.has((race.status ?? '').toLowerCase())
    )
    const allFinalized = finalizedRaces.length === races.length

    return jsonWithCompression(request, {
      isCompleted: allFinalized,
      totalRaces: races.length,
      finalizedRaces: finalizedRaces.length,
    })
  } catch (error) {
    console.error('Error checking meeting status:', error)

    const status = error instanceof ApiError ? error.status : 500

    return jsonWithCompression(
      request,
      { isCompleted: false },
      { status }
    )
  }
}
