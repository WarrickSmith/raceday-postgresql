import { getMeetingsData, getMeetingById } from '../meetings-data'
import { apiClient } from '@/lib/api-client'
import { RACE_TYPE_CODES } from '@/constants/raceTypes'

jest.mock('@/lib/api-client', () => {
  class ApiError extends Error {
    status: number
    url: string
    constructor(message: string, status: number, url: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.url = url
    }
  }

  return {
    apiClient: {
      get: jest.fn(),
    },
    ApiError,
  }
})

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>

describe('meetings-data', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getMeetingsData', () => {
    it('fetches meetings and sorts by first race start time', async () => {
      const todayMeetings = [
        {
          meeting_id: 'meeting1',
          meeting_name: 'Meeting 1',
          country: 'AUS',
          race_type: 'Thoroughbred Horse Racing',
          category: RACE_TYPE_CODES.THOROUGHBRED,
          date: '2024-01-01',
          status: 'active',
          created_at: '2024-01-01T08:00:00Z',
          updated_at: '2024-01-01T08:00:00Z',
        },
        {
          meeting_id: 'meeting2',
          meeting_name: 'Meeting 2',
          country: 'NZ',
          race_type: 'Harness Horse Racing',
          category: RACE_TYPE_CODES.HARNESS,
          date: '2024-01-01',
          status: 'active',
          created_at: '2024-01-01T06:00:00Z',
          updated_at: '2024-01-01T06:00:00Z',
        },
      ]

      const meeting1Races = [
        {
          race_id: 'race1',
          race_number: 1,
          name: 'Race 1',
          start_time: '2024-01-01T10:00:00Z',
          meeting_id: 'meeting1',
          status: 'open',
          created_at: '2024-01-01T08:00:00Z',
          updated_at: '2024-01-01T08:00:00Z',
        },
      ]

      const meeting2Races = [
        {
          race_id: 'race2',
          race_number: 1,
          name: 'Race 1',
          start_time: '2024-01-01T09:00:00Z',
          meeting_id: 'meeting2',
          status: 'open',
          created_at: '2024-01-01T07:00:00Z',
          updated_at: '2024-01-01T07:00:00Z',
        },
      ]

      mockApiClient.get
        .mockResolvedValueOnce(todayMeetings) // meetings list
        .mockResolvedValueOnce(meeting1Races) // races for meeting1
        .mockResolvedValueOnce(meeting2Races) // races for meeting2

      const result = await getMeetingsData()

      expect(result).toHaveLength(2)
      expect(result[0].meeting_id).toBe('meeting2')
      expect(result[0].first_race_time).toBe('2024-01-01T09:00:00Z')
      expect(result[1].meeting_id).toBe('meeting1')
      expect(result[1].first_race_time).toBe('2024-01-01T10:00:00Z')
    })

    it('returns empty array when meetings API returns none', async () => {
      mockApiClient.get.mockResolvedValueOnce([])

      const result = await getMeetingsData()

      expect(result).toEqual([])
    })

    it('gracefully handles API errors', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const error = new (jest.requireMock('@/lib/api-client').ApiError)(
        'Upstream failure',
        503,
        '/meetings'
      )
      mockApiClient.get.mockRejectedValueOnce(error)

      const result = await getMeetingsData()

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalledWith(
        'PostgreSQL meetings query failed, returning empty list:',
        '503 Upstream failure'
      )

      warnSpy.mockRestore()
    })

    it('falls back to meeting created_at when race fetch fails', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const meeting = {
        meeting_id: 'meeting1',
        meeting_name: 'Meeting 1',
        country: 'AUS',
        race_type: 'Thoroughbred Horse Racing',
        category: RACE_TYPE_CODES.THOROUGHBRED,
        date: '2024-01-01',
        status: 'active',
        created_at: '2024-01-01T08:00:00Z',
        updated_at: '2024-01-01T08:00:00Z',
      }

      mockApiClient.get
        .mockResolvedValueOnce([meeting])
        .mockRejectedValueOnce(new Error('Race fetch error'))

      const result = await getMeetingsData()

      expect(result).toHaveLength(1)
      expect(result[0].first_race_time).toBe(meeting.created_at)
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to fetch races for meeting meeting1:',
        expect.any(Error)
      )

      errorSpy.mockRestore()
    })
  })

  describe('getMeetingById', () => {
    it('returns meeting for valid id', async () => {
      const meeting = {
        meeting_id: 'meeting1',
        meeting_name: 'Test Meeting',
        country: 'NZ',
        race_type: 'Thoroughbred Horse Racing',
        category: RACE_TYPE_CODES.THOROUGHBRED,
        date: '2024-01-01',
        status: 'active',
        created_at: '2024-01-01T08:00:00Z',
        updated_at: '2024-01-01T08:00:00Z',
      }

      mockApiClient.get.mockResolvedValueOnce(meeting)

      const result = await getMeetingById('meeting1')

      expect(result).toEqual(meeting)
      expect(mockApiClient.get).toHaveBeenCalledWith('/meetings/meeting1')
    })

    it('returns null for missing meeting', async () => {
      const apiError = new (jest.requireMock('@/lib/api-client').ApiError)(
        'Not Found',
        404,
        '/meetings/unknown'
      )
      mockApiClient.get.mockRejectedValueOnce(apiError)

      const result = await getMeetingById('unknown')

      expect(result).toBeNull()
    })

    it('logs and returns null for other errors', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      mockApiClient.get.mockRejectedValueOnce(new Error('Network failure'))

      const result = await getMeetingById('meeting1')

      expect(result).toBeNull()
      expect(errorSpy).toHaveBeenCalledWith(
        'Error fetching meeting meeting1:',
        expect.any(Error)
      )

      errorSpy.mockRestore()
    })
  })
})
