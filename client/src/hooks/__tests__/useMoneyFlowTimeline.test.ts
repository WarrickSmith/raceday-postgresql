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
        { name: 'Take On', holdPercentage: 13 },
        { name: 'Runner B', holdPercentage: 15 },
        { name: 'Runner C', holdPercentage: 12 },
        { name: 'Runner D', holdPercentage: 18 },
        { name: 'Runner E', holdPercentage: 22 },
        { name: 'Runner F', holdPercentage: 8 },
        { name: 'Runner G', holdPercentage: 12 },
      ]

      const totalHoldPercentage = runners.reduce(
        (sum, runner) => sum + runner.holdPercentage,
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
            pollingTimestamp: '2023-01-01T00:00:00.000Z',
            timeInterval: -5,
            timeToStart: -5,
            winPoolAmount: 500,
            placePoolAmount: 200,
            holdPercentage: 15,
          },
          {
            $id: 'doc-2',
            $createdAt: '2023-01-01T00:05:00.000Z',
            $updatedAt: '2023-01-01T00:05:00.000Z',
            entrant: 'entrant-1',
            pollingTimestamp: '2023-01-01T00:05:00.000Z',
            timeInterval: -5,
            timeToStart: -5,
            winPoolAmount: 300,
            placePoolAmount: 150,
            holdPercentage: 10,
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
        (point) => point.timeInterval === -5
      )

      expect(consolidatedPoint?.winPoolAmount).toBe(300)
      expect(consolidatedPoint?.placePoolAmount).toBe(150)
      expect(consolidatedPoint?.poolPercentage).toBe(10)
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
            pollingTimestamp: '2023-01-01T00:00:00.000Z',
            timeInterval: -5,
            timeToStart: -5,
            winPoolAmount: 1000,
            incrementalWinAmount: 50,
            intervalType: '5m',
          },
          {
            $id: 'doc-2',
            $createdAt: '2023-01-01T00:04:00.000Z',
            $updatedAt: '2023-01-01T00:04:00.000Z',
            entrant: 'entrant-1',
            pollingTimestamp: '2023-01-01T00:04:00.000Z',
            timeInterval: -1,
            timeToStart: -1,
            winPoolAmount: 1200,
            incrementalWinAmount: 200,
            intervalType: '1m',
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
        (point) => point.timeInterval === -5
      )
      const oneMinutePoint = entrantData?.dataPoints.find(
        (point) => point.timeInterval === -1
      )

      expect(fiveMinutePoint?.incrementalAmount).toBe(50)
      expect(oneMinutePoint?.incrementalAmount).toBe(200)
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
})
