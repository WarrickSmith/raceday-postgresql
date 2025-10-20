import { apiClient, ApiError } from '@/lib/api-client'
import type { Meeting, Race } from '@/types/meetings'

const PACIFIC_AUCKLAND_TZ = 'Pacific/Auckland'

const getTodayNzDate = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: PACIFIC_AUCKLAND_TZ })

const fetchFirstRaceStart = async (meeting: Meeting): Promise<string | undefined> => {
  try {
    const races = await apiClient.get<Race[]>('/races', {
      params: { meeting_id: meeting.meeting_id },
    })

    if (races.length === 0) {
      return undefined
    }

    return races
      .map((race) => race.start_time)
      .filter((value): value is string => Boolean(value))
      .sort()[0]
  } catch (error) {
    console.error(`Failed to fetch races for meeting ${meeting.meeting_id}:`, error)
    return undefined
  }
}

export async function getMeetingsData(): Promise<Meeting[]> {
  const today = getTodayNzDate()

  try {
    const meetings = await apiClient.get<Meeting[]>('/meetings', {
      params: { date: today },
    })

    const meetingsWithFirstRace = await Promise.all(
      meetings.map(async (meeting) => {
        const firstRace = await fetchFirstRaceStart(meeting)
        return {
          ...meeting,
          first_race_time: firstRace ?? meeting.created_at,
        }
      })
    )

    meetingsWithFirstRace.sort((a, b) => {
      const aTime = new Date(a.first_race_time ?? a.created_at).getTime()
      const bTime = new Date(b.first_race_time ?? b.created_at).getTime()
      return aTime - bTime
    })

    return meetingsWithFirstRace
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `${error.status} ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Unknown error'

    console.warn('PostgreSQL meetings query failed, returning empty list:', message)
    return []
  }
}

export async function getMeetingById(meeting_id: string): Promise<Meeting | null> {
  try {
    const meeting = await apiClient.get<Meeting>(`/meetings/${meeting_id}`)
    return meeting
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }

    console.error(`Error fetching meeting ${meeting_id}:`, error)
    return null
  }
}
