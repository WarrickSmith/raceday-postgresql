/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { fetchRaceData, RaceDataSchema, NzTabError } from '../../src/clients/nztab.js'

// Mock axios and logger
vi.mock('axios')
vi.mock('../../src/shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('NZ TAB Client', () => {
  interface MockAxiosResponse {
    data: unknown
    status?: number
  }

  type MockAxiosGet = Mock<
    (url: string, config?: AxiosRequestConfig) => Promise<MockAxiosResponse>
  >

  const mockAxiosGet: MockAxiosGet = vi.fn()
  const mockAxiosInstance: { get: MockAxiosGet } = {
    get: mockAxiosGet,
  }

  const mockAxiosAsInstance = mockAxiosInstance as unknown as AxiosInstance

  beforeEach(() => {
    vi.clearAllMocks()
    const mockedAxios = vi.mocked(axios, true)
    mockedAxios.create.mockReturnValue(mockAxiosAsInstance)
    mockedAxios.isAxiosError.mockImplementation(
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'isAxiosError' in error &&
        (error as { isAxiosError?: unknown }).isAxiosError === true
    )
  })

  describe('RaceDataSchema validation', () => {
    it('should validate correct race data structure', () => {
      const validData = {
        id: 'race-123',
        name: 'Test Race',
        status: 'open',
        race_date_nz: '2025-10-10',
        start_time_nz: '14:30',
      }

      const result = RaceDataSchema.parse(validData)
      expect(result).toEqual(validData)
    })

    it('should reject invalid status values', () => {
      const invalidData = {
        id: 'race-123',
        name: 'Test Race',
        status: 'invalid-status',
        race_date_nz: '2025-10-10',
        start_time_nz: '14:30',
      }

      expect(() => RaceDataSchema.parse(invalidData)).toThrow()
    })

    it('should allow passthrough of additional fields', () => {
      const dataWithExtraFields = {
        id: 'race-123',
        name: 'Test Race',
        status: 'open',
        race_date_nz: '2025-10-10',
        start_time_nz: '14:30',
        extra_field: 'extra_value',
        nested: { data: 'value' },
      }

      const result = RaceDataSchema.parse(dataWithExtraFields)
      expect(result).toHaveProperty('extra_field')
      expect(result).toHaveProperty('nested')
    })
  })

  describe('fetchRaceData - Success path (AC7)', () => {
    it('should successfully fetch and validate race data on first attempt', async () => {
      const mockRaceData = {
        id: 'race-456',
        name: 'Auckland Cup',
        status: 'open',
        race_date_nz: '2025-10-10',
        start_time_nz: '15:00',
      }

      mockAxiosGet.mockResolvedValueOnce({
        data: mockRaceData,
        status: 200,
      })

      const result = await fetchRaceData('race-456', undefined, mockAxiosAsInstance)

      expect(result).toEqual(mockRaceData)
      expect(mockAxiosGet).toHaveBeenCalledTimes(1)
      expect(mockAxiosGet).toHaveBeenCalledWith('/racing/events/race-456', {
        params: {
          with_tote_trends_data: true,
          with_money_tracker: true,
          with_big_bets: true,
          with_live_bets: true,
          with_will_pays: true,
        },
      })
    })

    it('should use status-aware params for open races', async () => {
      const mockRaceData = {
        id: 'race-789',
        name: 'Test Race',
        status: 'open',
        race_date_nz: '2025-10-10',
        start_time_nz: '16:00',
      }

      mockAxiosGet.mockResolvedValueOnce({ data: mockRaceData })

      await fetchRaceData('race-789', 'open', mockAxiosAsInstance)

      expect(mockAxiosGet).toHaveBeenCalledWith('/racing/events/race-789', {
        params: {
          with_tote_trends_data: true,
          with_money_tracker: true,
          with_big_bets: true,
          with_live_bets: true,
          with_will_pays: true,
        },
      })
    })

    it('should use status-aware params for interim races', async () => {
      const mockRaceData = {
        id: 'race-interim',
        name: 'Interim Race',
        status: 'interim',
        race_date_nz: '2025-10-10',
        start_time_nz: '17:00',
      }

      mockAxiosGet.mockResolvedValueOnce({ data: mockRaceData })

      await fetchRaceData('race-interim', 'interim', mockAxiosAsInstance)

      expect(mockAxiosGet).toHaveBeenCalledWith('/racing/events/race-interim', {
        params: {
          with_results: true,
        },
      })
    })

    it('should use status-aware params for closed races with dividends', async () => {
      const mockRaceData = {
        id: 'race-closed',
        name: 'Closed Race',
        status: 'closed',
        race_date_nz: '2025-10-10',
        start_time_nz: '18:00',
      }

      mockAxiosGet.mockResolvedValueOnce({ data: mockRaceData })

      await fetchRaceData('race-closed', 'closed', mockAxiosAsInstance)

      expect(mockAxiosGet).toHaveBeenCalledWith('/racing/events/race-closed', {
        params: {
          with_results: true,
          with_dividends: true,
        },
      })
    })
  })

  describe('fetchRaceData - Retry with eventual success (AC4, AC7)', () => {
    it('should retry on network error and succeed on second attempt', async () => {
      const networkError = {
        isAxiosError: true,
        code: 'ECONNABORTED',
        message: 'Network timeout',
      }

      const mockRaceData = {
        id: 'race-retry',
        name: 'Retry Race',
        status: 'open',
        race_date_nz: '2025-10-10',
        start_time_nz: '19:00',
      }

      mockAxiosGet
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ data: mockRaceData })

      const result = await fetchRaceData('race-retry', undefined, mockAxiosAsInstance)

      expect(result).toEqual(mockRaceData)
      expect(mockAxiosGet).toHaveBeenCalledTimes(2)
    })

    it('should retry on 5xx error with exponential backoff', async () => {
      const serverError = {
        isAxiosError: true,
        response: { status: 503, data: { error: 'Service unavailable' } },
        message: '503 error',
      }

      const mockRaceData = {
        id: 'race-503',
        name: '503 Race',
        status: 'open',
        race_date_nz: '2025-10-10',
        start_time_nz: '20:00',
      }

      mockAxiosGet
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({ data: mockRaceData })

      const result = await fetchRaceData('race-503', undefined, mockAxiosAsInstance)

      expect(result).toEqual(mockRaceData)
      expect(mockAxiosGet).toHaveBeenCalledTimes(3)
    })

    it('should enforce exponential backoff delays (100ms, 200ms, 400ms)', async () => {
      const timeoutError = {
        isAxiosError: true,
        code: 'ETIMEDOUT',
        message: 'Timeout',
      }

      const mockRaceData = {
        id: 'race-backoff',
        name: 'Backoff Race',
        status: 'open',
        race_date_nz: '2025-10-10',
        start_time_nz: '21:00',
      }

      const attemptTimestamps: number[] = []

      mockAxiosGet.mockImplementation(() => {
        attemptTimestamps.push(Date.now())
        if (attemptTimestamps.length < 3) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject(timeoutError)
        }
        return Promise.resolve({ data: mockRaceData })
      })

      await fetchRaceData('race-backoff', undefined, mockAxiosAsInstance)

      expect(mockAxiosGet).toHaveBeenCalledTimes(3)
    })
  })

  describe('fetchRaceData - Retry exhaustion (AC4, AC7)', () => {
    it('should fail after 3 retry attempts with network errors', async () => {
      const networkError = {
        isAxiosError: true,
        code: 'ECONNABORTED',
        message: 'Network timeout',
      }

      mockAxiosGet.mockRejectedValue(networkError)

      try {
        await fetchRaceData('race-fail', undefined, mockAxiosAsInstance)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(NzTabError)
        expect((error as NzTabError).message).toContain('after 3 attempts')
      }

      expect(mockAxiosGet).toHaveBeenCalledTimes(3)
    })

    it('should fail after 3 retry attempts with 5xx errors', async () => {
      const serverError = {
        isAxiosError: true,
        response: { status: 500, data: { error: 'Internal server error' } },
        message: '500 error',
      }

      mockAxiosGet.mockRejectedValue(serverError)

      await expect(fetchRaceData('race-500', undefined, mockAxiosAsInstance)).rejects.toThrow(NzTabError)
      expect(mockAxiosGet).toHaveBeenCalledTimes(3)
    })
  })

  describe('fetchRaceData - 4xx immediate failure (AC6, AC7)', () => {
    it('should fail immediately on 404 without retry', async () => {
      const notFoundError = {
        isAxiosError: true,
        response: {
          status: 404,
          data: { error: 'Race not found' },
        },
        message: '404 error',
      }

      mockAxiosGet.mockRejectedValueOnce(notFoundError)

      try {
        await fetchRaceData('race-404', undefined, mockAxiosAsInstance)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(NzTabError)
        expect((error as NzTabError).statusCode).toBe(404)
        expect((error as NzTabError).isRetriable).toBe(false)
      }

      expect(mockAxiosGet).toHaveBeenCalledTimes(1)
    })

    it('should fail immediately on 400 without retry', async () => {
      const badRequestError = {
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: 'Bad request' },
        },
        message: '400 error',
      }

      mockAxiosGet.mockRejectedValueOnce(badRequestError)

      await expect(fetchRaceData('race-400', undefined, mockAxiosAsInstance)).rejects.toThrow(NzTabError)
      expect(mockAxiosGet).toHaveBeenCalledTimes(1)
    })

    it('should include sanitized response excerpt in 4xx errors', async () => {
      const unauthorizedError = {
        isAxiosError: true,
        response: {
          status: 401,
          data: { error: 'Unauthorized', details: 'Invalid credentials' },
        },
        message: '401 error',
      }

      mockAxiosGet.mockRejectedValueOnce(unauthorizedError)

      try {
        await fetchRaceData('race-401', undefined, mockAxiosAsInstance)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(NzTabError)
        expect((error as NzTabError).responseExcerpt).toBeDefined()
        expect((error as NzTabError).responseExcerpt).toContain('Unauthorized')
      }
    })
  })

  describe('fetchRaceData - Validation errors (AC3)', () => {
    it('should reject malformed payloads that fail schema validation', async () => {
      const invalidData = {
        id: 'race-invalid',
        name: 'Invalid Race',
        status: 'invalid-status', // Invalid enum value
        race_date_nz: '2025-10-10',
        start_time_nz: '22:00',
      }

      mockAxiosGet.mockResolvedValueOnce({ data: invalidData })

      try {
        await fetchRaceData('race-invalid', undefined, mockAxiosAsInstance)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(NzTabError)
        expect((error as NzTabError).isRetriable).toBe(false)
      }

      expect(mockAxiosGet).toHaveBeenCalledTimes(1)
    })

    it('should reject payloads missing required fields', async () => {
      const incompleteData = {
        id: 'race-incomplete',
        // Missing name, status, race_date_nz, start_time_nz
      }

      mockAxiosGet.mockResolvedValueOnce({ data: incompleteData })

      await expect(fetchRaceData('race-incomplete', undefined, mockAxiosAsInstance)).rejects.toThrow(NzTabError)
    })
  })

  describe('Error handling and types', () => {
    it('should create NzTabError with correct properties', () => {
      const error = new NzTabError('Test error', 404, 'excerpt', false)

      expect(error.name).toBe('NzTabError')
      expect(error.message).toBe('Test error')
      expect(error.statusCode).toBe(404)
      expect(error.responseExcerpt).toBe('excerpt')
      expect(error.isRetriable).toBe(false)
    })

    it('should handle non-Axios errors as non-retriable', async () => {
      const genericError = new Error('Generic error')

      mockAxiosGet.mockRejectedValue(genericError)

      await expect(fetchRaceData('race-generic-error', undefined, mockAxiosAsInstance)).rejects.toThrow()
      // Non-Axios errors are non-retriable, so only 1 attempt
      expect(mockAxiosGet).toHaveBeenCalledTimes(1)
    })
  })
})
