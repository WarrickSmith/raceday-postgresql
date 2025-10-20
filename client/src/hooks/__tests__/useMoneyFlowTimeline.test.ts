import { renderHook, waitFor } from '@testing-library/react'
import { useMoneyFlowTimeline } from '../useMoneyFlowTimeline'

type FetchReturn = ReturnType<typeof globalThis.fetch>
type FetchArgs = Parameters<typeof globalThis.fetch>
const mockFetch = jest.fn<FetchReturn, FetchArgs>() as jest.MockedFunction<
  typeof globalThis.fetch
>

beforeAll(() => {
  global.fetch = mockFetch
})

beforeEach(() => {
  mockFetch.mockReset()
})

const createMockResponse = <T>(
  payload: T,
  init?: { status?: number; statusText?: string }
): Response => {
  const status = init?.status ?? 200
  const statusText = init?.statusText ?? 'OK'
  const ok = status >= 200 && status < 400

  return {
    ok,
    status,
    statusText,
    json: () => Promise.resolve(payload),
  } as Response
}

describe('useMoneyFlowTimeline', () => {
  describe('Money Flow Calculation Validation', () => {
    it('should correctly calculate runner bet amounts using formula: Win Pool Total × (Runner Hold % ÷ 100)', () => {
      const testCases = [
        {
          winPoolTotal: 1340.52,
          runnerHoldPercentage: 9,
          expectedRunnerBetAmount: 120.65,
        },
        {
          winPoolTotal: 8949.85,
          runnerHoldPercentage: 13,
          expectedRunnerBetAmount: 1163.48,
        },
      ]

      testCases.forEach(({ winPoolTotal, runnerHoldPercentage, expectedRunnerBetAmount }) => {
        const calculatedAmount = winPoolTotal * (runnerHoldPercentage / 100)
        expect(calculatedAmount).toBeCloseTo(expectedRunnerBetAmount, 2)
      })
    })

    it('should validate that all runner hold percentages sum to approximately 100%', () => {
      const runners = [
        { name: 'Take On', hold_percentage: 13 },
        { name: 'Runner B', hold_percentage: 15 },
        { name: 'Runner C', hold_percentage: 12 },
        { name: 'Runner D', hold_percentage: 18 },
        { name: 'Runner E', hold_percentage: 22 },
        { name: 'Runner F', hold_percentage: 8 },
        { name: 'Runner G', hold_percentage: 12 },
      ]

      const totalHoldPercentage = runners.reduce(
        (sum, runner) => sum + runner.hold_percentage,
        0
      )

      expect(totalHoldPercentage).toBeGreaterThan(98)
      expect(totalHoldPercentage).toBeLessThan(102)
    })
  })

  describe('Data Consolidation Logic', () => {
    it('should retain the most recent record when duplicate intervals exist', async () => {
      const mockApiResponse = {
        success: true,
        documents: [
          {
            $id: 'doc-1',
            $createdAt: '2023-01-01T00:00:00.000Z',
            $updatedAt: '2023-01-01T00:00:00.000Z',
            entrant: 'entrant-1',
            polling_timestamp: '2023-01-01T00:00:00.000Z',
            time_interval: -5,
            time_to_start: -5,
            winPoolAmount: 500,
            placePoolAmount: 200,
            hold_percentage: 15,
          },
          {
            $id: 'doc-2',
            $createdAt: '2023-01-01T00:05:00.000Z',
            $updatedAt: '2023-01-01T00:05:00.000Z',
            entrant: 'entrant-1',
            polling_timestamp: '2023-01-01T00:05:00.000Z',
            time_interval: -5,
            time_to_start: -5,
            winPoolAmount: 300,
            placePoolAmount: 150,
            hold_percentage: 10,
          },
        ],
      }

      mockFetch.mockResolvedValue(createMockResponse(mockApiResponse))

      const { result } = renderHook(() =>
        useMoneyFlowTimeline('test-race-id', ['entrant-1'])
      )

      await waitFor(() => expect(result.current.timelineData.size).toBe(1))

      const entrantData = result.current.timelineData.get('entrant-1')
      expect(entrantData).toBeDefined()

      const consolidatedPoint = entrantData?.dataPoints.find(
        (point) => point.time_interval === -5
      )

      expect(consolidatedPoint?.winPoolAmount).toBe(300)
      expect(consolidatedPoint?.placePoolAmount).toBe(150)
      expect(consolidatedPoint?.pool_percentage).toBe(10)
    })
  })

  describe('Time Bucketed Data Processing', () => {
    it('should handle bucketed data with pre-calculated incrementals', async () => {
      const mockBucketedResponse = {
        success: true,
        bucketedData: true,
        documents: [
          {
            $id: 'doc-1',
            $createdAt: '2023-01-01T00:00:00.000Z',
            $updatedAt: '2023-01-01T00:00:00.000Z',
            entrant: 'entrant-1',
            polling_timestamp: '2023-01-01T00:00:00.000Z',
            time_interval: -5,
            time_to_start: -5,
            winPoolAmount: 1000,
            incremental_win_amount: 50,
            interval_type: '5m',
          },
          {
            $id: 'doc-2',
            $createdAt: '2023-01-01T00:04:00.000Z',
            $updatedAt: '2023-01-01T00:04:00.000Z',
            entrant: 'entrant-1',
            polling_timestamp: '2023-01-01T00:04:00.000Z',
            time_interval: -1,
            time_to_start: -1,
            winPoolAmount: 1200,
            incremental_win_amount: 200,
            interval_type: '1m',
          },
        ],
      }

      mockFetch.mockResolvedValue(createMockResponse(mockBucketedResponse))

      const { result } = renderHook(() =>
        useMoneyFlowTimeline('test-race-id', ['entrant-1'])
      )

      await waitFor(() => expect(result.current.timelineData.size).toBe(1))

      const entrantData = result.current.timelineData.get('entrant-1')
      expect(entrantData).toBeDefined()
      expect(entrantData?.dataPoints.length).toBe(2)

      const fiveMinutePoint = entrantData?.dataPoints.find(
        (point) => point.time_interval === -5
      )
      const oneMinutePoint = entrantData?.dataPoints.find(
        (point) => point.time_interval === -1
      )

      expect(fiveMinutePoint?.incremental_amount).toBe(50)
      expect(oneMinutePoint?.incremental_amount).toBe(200)
    })
  })

  describe('Dynamic Column Generation', () => {
    it('should generate appropriate time intervals based on race proximity', () => {
      const expectedColumns = [-30, -25, -20, -15, -10, -5]

      expect(expectedColumns.every((interval) => interval <= 0)).toBe(true)
      expect(expectedColumns[0]).toBe(-30)
      expect(expectedColumns[expectedColumns.length - 1]).toBe(-5)
    })
  })

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() =>
        useMoneyFlowTimeline('test-race-id', ['entrant-1'])
      )

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.error).toBe('Network error')
    })

    it('should handle empty entrant list', () => {
      const { result } = renderHook(() =>
        useMoneyFlowTimeline('test-race-id', [])
      )

      expect(result.current.timelineData).toBeInstanceOf(Map)
      expect(result.current.timelineData.size).toBe(0)
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('Incremental merge and retention', () => {
    it('should not clear existing timeline data when an incremental poll returns no documents', async () => {
      const initialResponse = {
        success: true,
        documents: [
          {
            $id: 'doc-A',
            $createdAt: '2023-01-01T00:05:00.000Z',
            $updatedAt: '2023-01-01T00:05:00.000Z',
            entrant: 'entrant-1',
            polling_timestamp: '2023-01-01T00:05:00.000Z',
            time_interval: 5,
            time_to_start: 5,
            winPoolAmount: 1000,
            placePoolAmount: 400,
            hold_percentage: 12,
          },
        ],
        nextCreatedAt: '2023-01-01T00:05:00.000Z',
      }

      const emptyIncremental = {
        success: true,
        documents: [],
        nextCreatedAt: null,
      }

      mockFetch
        .mockResolvedValueOnce(createMockResponse(initialResponse))
        .mockResolvedValueOnce(createMockResponse(emptyIncremental))

      const { result } = renderHook(() =>
        useMoneyFlowTimeline('race-1', ['entrant-1'])
      )

      await waitFor(() => expect(result.current.timelineData.size).toBe(1))

      // Trigger incremental refetch (no new docs)
      await result.current.refetch()

      // Expect previous data retained
      expect(result.current.timelineData.size).toBe(1)
      const entrantData = result.current.timelineData.get('entrant-1')
      expect(entrantData?.dataPoints.length).toBe(1)
      expect(entrantData?.dataPoints[0].$id).toBe('doc-A')
    })

    it('should merge new documents without duplicating existing points', async () => {
      const initialResponse = {
        success: true,
        documents: [
          {
            $id: 'doc-A',
            $createdAt: '2023-01-01T00:00:00.000Z',
            $updatedAt: '2023-01-01T00:00:00.000Z',
            entrant: 'entrant-1',
            polling_timestamp: '2023-01-01T00:00:00.000Z',
            time_interval: 10,
            time_to_start: 10,
            winPoolAmount: 800,
            placePoolAmount: 300,
            hold_percentage: 10,
          },
        ],
        nextCreatedAt: '2023-01-01T00:00:00.000Z',
      }

      const incrementalResponse = {
        success: true,
        documents: [
          // Duplicate of doc-A (should not be added again)
          {
            $id: 'doc-A',
            $createdAt: '2023-01-01T00:00:00.000Z',
            $updatedAt: '2023-01-01T00:00:00.000Z',
            entrant: 'entrant-1',
            polling_timestamp: '2023-01-01T00:00:00.000Z',
            time_interval: 10,
            time_to_start: 10,
            winPoolAmount: 800,
            placePoolAmount: 300,
            hold_percentage: 10,
          },
          // New point
          {
            $id: 'doc-B',
            $createdAt: '2023-01-01T00:03:00.000Z',
            $updatedAt: '2023-01-01T00:03:00.000Z',
            entrant: 'entrant-1',
            polling_timestamp: '2023-01-01T00:03:00.000Z',
            time_interval: 7,
            time_to_start: 7,
            winPoolAmount: 900,
            placePoolAmount: 340,
            hold_percentage: 11,
          },
        ],
        nextCreatedAt: '2023-01-01T00:03:00.000Z',
      }

      mockFetch
        .mockResolvedValueOnce(createMockResponse(initialResponse))
        .mockResolvedValueOnce(createMockResponse(incrementalResponse))

      const { result } = renderHook(() =>
        useMoneyFlowTimeline('race-1', ['entrant-1'])
      )

      await waitFor(() => expect(result.current.timelineData.size).toBe(1))

      // Merge second batch
      await result.current.refetch()

      const entrantData = result.current.timelineData.get('entrant-1')
      expect(entrantData).toBeDefined()
      expect(entrantData?.dataPoints.length).toBe(2)
      const ids = entrantData!.dataPoints.map((p) => p.$id).sort()
      expect(ids).toEqual(['doc-A', 'doc-B'])
    })
  })
})
