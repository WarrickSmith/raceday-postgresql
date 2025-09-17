import React from 'react'
import { render, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import EnhancedEntrantsGrid from '../EnhancedEntrantsGrid'
import type { IndicatorResult } from '@/types/alertCalculations'
import type { EntrantMoneyFlowTimeline } from '@/types/moneyFlow'

jest.mock('@/hooks/useMoneyFlowTimeline', () => ({
  useMoneyFlowTimeline: jest.fn(),
}))

jest.mock('@/contexts/RaceContext', () => ({
  useRace: jest.fn(),
}))

jest.mock('@/hooks/useGridIndicators', () => ({
  useGridIndicators: jest.fn(),
}))

jest.mock('@/hooks/useValueFlash', () => ({
  useValueFlash: jest.fn(() => ({ flashClasses: '' })),
}))

const { useMoneyFlowTimeline } = jest.requireMock('@/hooks/useMoneyFlowTimeline')
const { useRace } = jest.requireMock('@/contexts/RaceContext')
const { useGridIndicators } = jest.requireMock('@/hooks/useGridIndicators')

const buildTimeline = (
  entrantId: string,
  intervals: number[]
): EntrantMoneyFlowTimeline => ({
  entrantId,
  dataPoints: intervals.map((interval) => ({
    $id: `${entrantId}-${interval}`,
    $createdAt: '2024-01-01T00:00:00.000Z',
    $updatedAt: '2024-01-01T00:00:00.000Z',
    entrant: entrantId,
    pollingTimestamp: '2024-01-01T00:00:00.000Z',
    timeToStart: interval,
    timeInterval: interval,
    winPoolAmount: 0,
    placePoolAmount: 0,
    totalPoolAmount: 0,
    poolPercentage: 0,
    incrementalAmount: 0,
  })),
  latestPercentage: 0,
  trend: 'neutral',
  significantChange: false,
})

describe('EnhancedEntrantsGrid timeline indicators', () => {
  beforeEach(() => {
    jest.useFakeTimers()

    if (!window.HTMLElement.prototype.scrollTo) {
      window.HTMLElement.prototype.scrollTo = jest.fn()
    }

    const indicator: IndicatorResult = {
      entrantId: 'entrant-1',
      percentageChange: 30,
      indicatorType: '25-50%',
      color: '#FECACA',
      enabled: true,
      changeType: 'money_increase',
    }

    useGridIndicators.mockReturnValue({
      getIndicatorForCell: jest
        .fn()
        .mockImplementation((interval: number, entrantId: string) => {
          if (interval === 55 && entrantId === 'entrant-1') {
            return indicator
          }
          return null
        }),
      isLoading: false,
    })

    useRace.mockReturnValue({
      raceData: {
        race: {
          $id: 'race-1',
          startTime: new Date().toISOString(),
          status: 'Open',
        },
        entrants: null,
      },
    })

    const timelineData = new Map([
      ['entrant-1', buildTimeline('entrant-1', [60, 55])],
    ])

    useMoneyFlowTimeline.mockReturnValue({
      timelineData,
      gridData: {},
      isLoading: false,
      error: null,
      lastUpdate: null,
      refetch: jest.fn(),
      getEntrantDataForInterval: jest.fn(),
      getWinPoolData: jest
        .fn()
        .mockImplementation((entrantId: string, interval: number) => {
          if (entrantId === 'entrant-1' && interval === 60) return '$120'
          if (entrantId === 'entrant-1' && interval === 55) return '+$45'
          return '—'
        }),
      getPlacePoolData: jest.fn(),
      getOddsData: jest.fn(),
    })
  })

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers()
    })
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('applies indicator styling and metadata to timeline cells', async () => {
    const entrant = {
      $id: 'entrant-1',
      $createdAt: '2024-01-01T00:00:00.000Z',
      $updatedAt: '2024-01-01T00:00:00.000Z',
      entrantId: 'entrant-1',
      name: 'Runner One',
      runnerNumber: 1,
      isScratched: false,
      race: 'race-1',
      winOdds: 2.5,
      placeOdds: 1.5,
    }

    await act(async () => {
      render(
        <EnhancedEntrantsGrid
          initialEntrants={[entrant as any]}
          raceId="race-1"
          raceStartTime={new Date().toISOString()}
        />
      )
    })

    const indicatorCell = document.querySelector(
      '[data-indicator="25-50%"]'
    ) as HTMLElement | null
    expect(indicatorCell).toBeInTheDocument()
    if (!indicatorCell) {
      throw new Error('Indicator cell not rendered')
    }

    expect(indicatorCell).toHaveAttribute('data-indicator-change', '30.00')
    expect(indicatorCell.className).toMatch(/bg-red-200/)
    expect(indicatorCell.className).toMatch(/text-gray-900/)

    const indicatorElements = document.querySelectorAll('[data-indicator]')
    expect(indicatorElements).toHaveLength(1)
  })
})
