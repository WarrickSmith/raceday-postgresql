import { NextRequest } from 'next/server'
import { apiClient, ApiError } from '@/lib/api-client'
import type { Race, Meeting } from '@/types/meetings'
import { jsonWithCompression } from '@/lib/http/compression'

interface RaceResponse {
  race_id: string
  meeting_id: string
  name: string | null
  race_number: number | null
  start_time: string | null
  actual_start: string | null
  status: string | null
  distance: number | null
  track_condition: string | null
  weather: string | null
  type: string | null
  created_at: string | null
  updated_at: string | null
}

interface MeetingResponse {
  meeting_id: string
  meeting_name: string
  country: string | null
  race_type: string | null
  date: string
  status: string | null
  track_condition: string | null
  weather: string | null
  created_at: string | null
  updated_at: string | null
}

const mapRace = (race: RaceResponse): Race => {
  const nowIso = new Date().toISOString()
  return {
    race_id: race.race_id,
    created_at: race.created_at ?? nowIso,
    updated_at: race.updated_at ?? race.created_at ?? nowIso,
    race_number: race.race_number ?? 0,
    name: race.name ?? 'Unknown Race',
    start_time: race.start_time ?? nowIso,
    actual_start: race.actual_start,
    meeting_id: race.meeting_id,
    status: race.status ?? 'unknown',
    distance: race.distance,
    track_condition: race.track_condition,
    weather: race.weather,
    race_type: race.type,
  }
}

const mapMeeting = (meeting: MeetingResponse): Meeting => {
  const nowIso = new Date().toISOString()
  return {
    meeting_id: meeting.meeting_id,
    meeting_name: meeting.meeting_name,
    country: meeting.country ?? 'NZ',
    race_type: meeting.race_type ?? 'unknown',
    date: meeting.date,
    status: meeting.status ?? 'unknown',
    created_at: meeting.created_at ?? nowIso,
    updated_at: meeting.updated_at ?? meeting.created_at ?? nowIso,
  }
}

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

    const race = await apiClient.get<RaceResponse>(`/api/races/${race_id}`, {
      cache: 'no-store',
    })

    const meeting = await apiClient.get<MeetingResponse>(
      `/api/meetings/${race.meeting_id}`,
      {
        cache: 'no-store',
      }
    )

    const response = await jsonWithCompression(request, {
      race: mapRace(race),
      meeting: mapMeeting(meeting),
    })
    response.headers.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=60')
    return response
  } catch (error) {
    console.error('API Error fetching basic race data:', error)

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
