import React from 'react'
import { render, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import EnhancedEntrantsGrid from '../EnhancedEntrantsGrid'
import type { IndicatorResult } from '@/types/alertCalculations'
import type { EntrantMoneyFlowTimeline } from '@/types/moneyFlow'
import type { Entrant } from '@/types/meetings'

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

// Mock audible alerts context so the grid can render without provider
jest.mock('@/contexts/AudibleAlertContext', () => ({
  useAudibleAlerts: jest.fn(() => ({
    isEnabled: false,
    isLoading: false,
    isPersisting: false,
    lastError: null,
    toggle: jest.fn(async () => {}),
    setEnabled: jest.fn(async () => {}),
    setFilterPredicate: jest.fn(() => {}),
    primeAudioWithUserGesture: jest.fn(() => {}),
  })),
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
    const entrant: Entrant = {
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
      moneyFlowTimeline: undefined,
      poolMoney: undefined,
      previousHoldPercentage: undefined,
      holdPercentage: undefined,
      moneyFlowTrend: undefined,
    }

    await act(async () => {
      render(
        <EnhancedEntrantsGrid
          initialEntrants={[entrant]}
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

  it('highlights finishing positions on the entrant cell', async () => {
    const entrants: Entrant[] = [
      {
        $id: 'entrant-10',
        $createdAt: '2024-01-01T00:00:00.000Z',
        $updatedAt: '2024-01-01T00:00:00.000Z',
        entrantId: 'entrant-10',
        name: 'Golden Arrow',
        runnerNumber: 10,
        isScratched: false,
        race: 'race-1',
        winOdds: 2.1,
        placeOdds: 1.4,
        moneyFlowTimeline: undefined,
        poolMoney: undefined,
        previousHoldPercentage: undefined,
        holdPercentage: undefined,
        moneyFlowTrend: undefined,
      },
      {
        $id: 'entrant-05',
        $createdAt: '2024-01-01T00:00:00.000Z',
        $updatedAt: '2024-01-01T00:00:00.000Z',
        entrantId: 'entrant-05',
        name: 'Silver Storm',
        runnerNumber: 5,
        isScratched: false,
        race: 'race-1',
        winOdds: 3.4,
        placeOdds: 1.9,
        moneyFlowTimeline: undefined,
        poolMoney: undefined,
        previousHoldPercentage: undefined,
        holdPercentage: undefined,
        moneyFlowTrend: undefined,
      },
      {
        $id: 'entrant-02',
        $createdAt: '2024-01-01T00:00:00.000Z',
        $updatedAt: '2024-01-01T00:00:00.000Z',
        entrantId: 'entrant-02',
        name: 'Bronze Bandit',
        runnerNumber: 2,
        isScratched: false,
        race: 'race-1',
        winOdds: 4.8,
        placeOdds: 2.5,
        moneyFlowTimeline: undefined,
        poolMoney: undefined,
        previousHoldPercentage: undefined,
        holdPercentage: undefined,
        moneyFlowTrend: undefined,
      },
    ]

    useRace.mockReturnValue({
      raceData: {
        race: {
          $id: 'race-1',
          startTime: new Date().toISOString(),
          status: 'final',
          resultStatus: 'final',
          resultsData: [
            { position: 1, runnerNumber: 10, runnerName: 'Golden Arrow' },
            { position: 2, runnerNumber: 5, runnerName: 'Silver Storm' },
            { position: 3, runnerNumber: 2, runnerName: 'Bronze Bandit' },
          ],
        },
        entrants,
        meeting: null,
      },
    })

    await act(async () => {
      render(
        <EnhancedEntrantsGrid
          initialEntrants={entrants}
          raceId="race-1"
          raceStartTime={new Date().toISOString()}
          resultsData={[
            { position: 1, runnerNumber: 10, runnerName: 'Golden Arrow' },
            { position: 2, runnerNumber: 5, runnerName: 'Silver Storm' },
            { position: 3, runnerNumber: 2, runnerName: 'Bronze Bandit' },
          ]}
          resultStatus="final"
        />
      )
    })

    const firstPlaceCell = document.querySelector(
      'td[data-finishing-position="1"]'
    ) as HTMLElement | null
    expect(firstPlaceCell).toBeInTheDocument()
    if (!firstPlaceCell) {
      throw new Error('First place cell not found')
    }

    expect(firstPlaceCell.className).toMatch(/bg-amber-100/)
    expect(firstPlaceCell.getAttribute('title')).toBe('1st place')

    const runnerNumberElement = firstPlaceCell.querySelector('span.text-lg')
    expect(runnerNumberElement?.className).toMatch(/text-amber-900/)

    const srOnlyElement = firstPlaceCell.querySelector('.sr-only')
    expect(srOnlyElement).toHaveTextContent('Finished first place')

    const highlightedRow = Array.from(
      document.querySelectorAll('tr[aria-label]')
    ).find((row) => row.getAttribute('aria-label')?.includes('Finished first place'))
    expect(highlightedRow).toBeDefined()
    expect(highlightedRow?.getAttribute('aria-label')).toContain(
      'Finished first place'
    )
  })

  it('highlights interim results with only a winner', async () => {
    const entrants: Entrant[] = [
      {
        $id: 'entrant-07',
        $createdAt: '2024-01-01T00:00:00.000Z',
        $updatedAt: '2024-01-01T00:00:00.000Z',
        entrantId: 'entrant-07',
        name: 'Swift Winner',
        runnerNumber: 7,
        isScratched: false,
        race: 'race-1',
        winOdds: 1.8,
        placeOdds: 1.2,
        moneyFlowTimeline: undefined,
        poolMoney: undefined,
        previousHoldPercentage: undefined,
        holdPercentage: undefined,
        moneyFlowTrend: undefined,
      },
      {
        $id: 'entrant-12',
        $createdAt: '2024-01-01T00:00:00.000Z',
        $updatedAt: '2024-01-01T00:00:00.000Z',
        entrantId: 'entrant-12',
        name: 'Second Place',
        runnerNumber: 12,
        isScratched: false,
        race: 'race-1',
        winOdds: 3.2,
        placeOdds: 1.7,
        moneyFlowTimeline: undefined,
        poolMoney: undefined,
        previousHoldPercentage: undefined,
        holdPercentage: undefined,
        moneyFlowTrend: undefined,
      },
    ]

    useRace.mockReturnValue({
      raceData: {
        race: {
          $id: 'race-1',
          startTime: new Date().toISOString(),
          status: 'interim',
          resultStatus: 'interim',
          resultsData: null, // No results in race context - only via props
        },
        entrants,
        meeting: null,
      },
    })

    await act(async () => {
      render(
        <EnhancedEntrantsGrid
          initialEntrants={entrants}
          raceId="race-1"
          raceStartTime={new Date().toISOString()}
          resultsData={[
            { position: 1, runnerNumber: 7, runnerName: 'Swift Winner' }
          ]}
          resultStatus="interim"
        />
      )
    })

    // Check that only the winner is highlighted (golden)
    const winnerCell = document.querySelector(
      'td[data-finishing-position="1"]'
    ) as HTMLElement | null
    expect(winnerCell).toBeInTheDocument()
    expect(winnerCell?.className).toMatch(/bg-amber-100/)
    expect(winnerCell?.getAttribute('title')).toBe('1st place')

    // Check that runner #12 (not the winner) is NOT highlighted
    const nonWinnerRow = Array.from(
      document.querySelectorAll('tr[aria-label]')
    ).find((row) =>
      row.getAttribute('aria-label')?.includes('number 12') &&
      !row.getAttribute('aria-label')?.includes('Finished first place')
    )
    expect(nonWinnerRow).toBeDefined()

    // Verify screen reader announcement for interim winner
    const srOnlyElement = winnerCell?.querySelector('.sr-only')
    expect(srOnlyElement).toHaveTextContent('Finished first place')
  })
})
