import { NextRequest } from 'next/server'
import { apiClient, ApiError } from '@/lib/api-client'
import type { Race } from '@/types/meetings'
import { jsonWithCompression } from '@/lib/http/compression'

/**
 * GET /api/meetings/[meeting_id]/races
 *
 * Fetches all races for a specific meeting ID
 * Server-side endpoint to eliminate CORS issues and keep Appwrite credentials secure
 */
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

    return jsonWithCompression(request, {
      races,
      total: races.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error fetching races for meeting:', error)

    const errorMessage =
      error instanceof ApiError
        ? `${error.status} ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Failed to fetch races'

    const status = error instanceof ApiError ? error.status : 500

    return jsonWithCompression(
      request,
      { error: errorMessage },
      { status }
    )
  }
}
