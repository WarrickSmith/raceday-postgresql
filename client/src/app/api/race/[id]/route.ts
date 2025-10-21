import { NextRequest } from 'next/server'
import { apiClient, ApiError } from '@/lib/api-client'
import type {
  Entrant,
  Meeting,
  Race,
  RaceNavigationData,
} from '@/types/meetings'
import type { PoolDividend, RaceResult } from '@/types/racePools'
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

interface EntrantResponse {
  entrant_id: string
  name: string
  runner_number: number
  jockey?: string | null
  trainer_name?: string | null
  silk_url?: string | null
  silk_colours?: string | null
  silk_url_64?: string | null
  silk_url_128?: string | null
  is_scratched: boolean
  win_odds: number | null
  place_odds: number | null
  hold_percentage: number | null
  money_flow_history?: Array<{
    hold_percentage: number | null
    win_pool_amount: number | null
    timestamp: string
  }>
  odds_history?: Array<{
    odds: number | null
    type: string | null
    timestamp: string
  }>
}

interface RaceResultsResponse {
  race_id: string
  results_available: boolean
  results_data: RaceResult[] | null
  dividends_data: PoolDividend[] | null
  fixed_odds_data: Record<
    string,
    {
      fixed_win_odds: number | null
      fixed_place_odds: number | null
      runner_name: string | null
      entrant_id: string | null
    }
  > | null
  result_status: 'interim' | 'final' | 'protest' | null
  photo_finish: boolean
  stewards_inquiry: boolean
  protest_lodged: boolean
  result_time: string | null
  created_at: string | null
  updated_at: string | null
}

interface NavigationEntryResponse {
  race_id: string
  name: string
  start_time: string
  meeting_name: string
}

interface NavigationResponse {
  previousRace: NavigationEntryResponse | null
  nextRace: NavigationEntryResponse | null
  nextScheduledRace: NavigationEntryResponse | null
}

interface RaceContextData {
  race: Race
  meeting: Meeting
  entrants: Entrant[]
  navigationData: RaceNavigationData
  dataFreshness: {
    last_updated: string
    entrantsDataAge: number
    odds_historyCount: number
    money_flow_historyCount: number
  }
}

const nowIsoString = (): string => new Date().toISOString()

const mapRace = (
  race: RaceResponse,
  entrantCount: number,
  results: RaceResultsResponse | null
): Race => ({
  race_id: race.race_id,
  created_at: race.created_at ?? nowIsoString(),
  updated_at: race.updated_at ?? race.created_at ?? nowIsoString(),
  race_number: race.race_number ?? 0,
  name: race.name ?? 'Unknown Race',
  start_time: race.start_time ?? nowIsoString(),
  actual_start: race.actual_start,
  meeting_id: race.meeting_id,
  status: race.status ?? 'unknown',
  distance: race.distance,
  track_condition: race.track_condition,
  weather: race.weather,
  race_type: race.type,
  runner_count: entrantCount,
  results_available: results?.results_available ?? false,
  results_data: Array.isArray(results?.results_data)
    ? results?.results_data ?? undefined
    : undefined,
  dividends_data: Array.isArray(results?.dividends_data)
    ? results?.dividends_data ?? undefined
    : undefined,
  fixed_odds_data: results?.fixed_odds_data ?? undefined,
  result_status: results?.result_status ?? undefined,
  photo_finish: results?.photo_finish ?? false,
  stewards_inquiry: results?.stewards_inquiry ?? false,
  protest_lodged: results?.protest_lodged ?? false,
  result_time: results?.result_time ?? undefined,
})

const mapMeeting = (meeting: MeetingResponse): Meeting => ({
  meeting_id: meeting.meeting_id,
  meeting_name: meeting.meeting_name,
  country: meeting.country ?? 'NZ',
  race_type: meeting.race_type ?? 'unknown',
  date: meeting.date,
  status: meeting.status ?? 'unknown',
  created_at: meeting.created_at ?? nowIsoString(),
  updated_at: meeting.updated_at ?? meeting.created_at ?? nowIsoString(),
  track_condition: meeting.track_condition ?? undefined,
  weather: meeting.weather ?? undefined,
})

const mapEntrant = (raceId: string, entrant: EntrantResponse): Entrant => {
  const now = nowIsoString()
  return {
    entrant_id: entrant.entrant_id,
    created_at: now,
    updated_at: now,
    name: entrant.name,
    runner_number: entrant.runner_number,
    jockey: entrant.jockey ?? undefined,
    trainer_name: entrant.trainer_name ?? undefined,
    weight: undefined,
    silk_url: entrant.silk_url ?? undefined,
    silk_colours: entrant.silk_colours ?? undefined,
    silk_url_64: entrant.silk_url_64 ?? undefined,
    silk_url_128: entrant.silk_url_128 ?? undefined,
    is_scratched: entrant.is_scratched,
    race_id: raceId,
    fixed_win_odds: entrant.win_odds ?? undefined,
    pool_win_odds: undefined,
    fixed_place_odds: entrant.place_odds ?? undefined,
    pool_place_odds: undefined,
    hold_percentage: entrant.hold_percentage ?? undefined,
    previous_hold_percentage: undefined,
    money_flow_trend: undefined,
    money_flow_timeline: undefined,
    silk: undefined,
    pool_money: undefined,
    odds_history: [],
    money_flow_history: [],
  }
}

const mapNavigationEntry = (
  entry: NavigationEntryResponse | null
): RaceNavigationData['previous_race'] => {
  if (!entry) {
    return null
  }

  return {
    race_id: entry.race_id,
    name: entry.name,
    start_time: entry.start_time,
    meeting_name: entry.meeting_name,
  }
}

const buildNavigationData = (
  payload: NavigationResponse
): RaceNavigationData => ({
  previous_race: mapNavigationEntry(payload.previousRace),
  next_race: mapNavigationEntry(payload.nextRace),
  next_scheduled_race: mapNavigationEntry(payload.nextScheduledRace),
})

const sumHistory = <T>(
  entrants: Entrant[],
  accessor: (entrant: Entrant) => T[] | undefined
): number =>
  entrants.reduce((total, entrant) => {
    const history = accessor(entrant)
    return total + (Array.isArray(history) ? history.length : 0)
  }, 0)

const fetchRaceContext = async (race_id: string): Promise<RaceContextData | null> => {
  try {
    const race = await apiClient.get<RaceResponse>(`/api/races/${race_id}`, {
      cache: 'no-store',
    })

    const [meeting, entrantsResponse, navigation, raceResults] = await Promise.all([
      apiClient.get<MeetingResponse>(`/api/meetings/${race.meeting_id}`, {
        cache: 'no-store',
      }),
      apiClient.get<EntrantResponse[]>('/api/entrants', {
        params: { raceId: race_id },
        cache: 'no-store',
      }),
      apiClient.get<NavigationResponse>('/api/races/navigation', {
        params: { raceId: race_id },
        cache: 'no-store',
      }),
      apiClient
        .get<RaceResultsResponse>('/api/race-results', {
          params: { raceId: race_id },
          cache: 'no-store',
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) {
            return null
          }
          throw error
        }),
    ])

    const entrants = entrantsResponse.map((entrant) => mapEntrant(race_id, entrant))

    const raceData = mapRace(race, entrants.length, raceResults)
    const meetingData = mapMeeting(meeting)
    const navigationData = buildNavigationData(navigation)

    const dataFreshness = {
      last_updated: raceData.updated_at,
      entrantsDataAge: 0,
      odds_historyCount: sumHistory(entrants, (entrant) => entrant.odds_history),
      money_flow_historyCount: sumHistory(entrants, (entrant) => entrant.money_flow_history),
    }

    return {
      race: raceData,
      meeting: meetingData,
      entrants,
      navigationData,
      dataFreshness,
    }
  } catch (error) {
    console.error('Failed to build race context', error)
    return null
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

    const url = new URL(request.url)
    const isNavigation = url.searchParams.get('nav') === 'true'

    const raceContext = await fetchRaceContext(race_id)

    if (!raceContext) {
      return jsonWithCompression(
        request,
        { error: 'Race not found' },
        { status: 404 }
      )
    }

    const response = await jsonWithCompression(request, raceContext)

    if (isNavigation) {
      response.headers.set(
        'Cache-Control',
        'public, max-age=15, stale-while-revalidate=60'
      )
    } else {
      response.headers.set(
        'Cache-Control',
        'public, max-age=30, stale-while-revalidate=120'
      )
    }

    response.headers.set(
      'X-Race-Data-Mode',
      isNavigation ? 'navigation' : 'comprehensive'
    )
    response.headers.set('X-Race-ID', race_id)

    return response
  } catch (error) {
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
