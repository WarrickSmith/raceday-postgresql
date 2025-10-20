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
  entrant_id: string,
  intervals: number[]
): EntrantMoneyFlowTimeline => ({
  entrant_id,
  dataPoints: intervals.map((interval) => ({
    $id: `${entrant_id}-${interval}`,
    $createdAt: '2024-01-01T00:00:00.000Z',
    $updatedAt: '2024-01-01T00:00:00.000Z',
    entrant: entrant_id,
    polling_timestamp: '2024-01-01T00:00:00.000Z',
    time_to_start: interval,
    time_interval: interval,
    winPoolAmount: 0,
    placePoolAmount: 0,
    total_pool_amount: 0,
    pool_percentage: 0,
    incremental_amount: 0,
  })),
  latest_percentage: 0,
  trend: 'neutral',
  significant_change: false,
})

describe('EnhancedEntrantsGrid timeline indicators', () => {
  beforeEach(() => {
    jest.useFakeTimers()

    if (!window.HTMLElement.prototype.scrollTo) {
      window.HTMLElement.prototype.scrollTo = jest.fn()
    }

    const indicator: IndicatorResult = {
      entrant_id: 'entrant-1',
      percentageChange: 30,
      indicatorType: '25-50%',
      color: '#FECACA',
      enabled: true,
      changeType: 'money_increase',
    }

    useGridIndicators.mockReturnValue({
      getIndicatorForCell: jest
        .fn()
        .mockImplementation((interval: number, entrant_id: string) => {
          if (interval === 55 && entrant_id === 'entrant-1') {
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
          start_time: new Date().toISOString(),
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
        .mockImplementation((entrant_id: string, interval: number) => {
          if (entrant_id === 'entrant-1' && interval === 60) return '$120'
          if (entrant_id === 'entrant-1' && interval === 55) return '+$45'
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
      entrant_id: 'entrant-1',
      name: 'Runner One',
      runner_number: 1,
      is_scratched: false,
      race: 'race-1',
      win_odds: 2.5,
      place_odds: 1.5,
      money_flow_timeline: undefined,
      pool_money: undefined,
      previous_hold_percentage: undefined,
      hold_percentage: undefined,
      money_flow_trend: undefined,
    }

    await act(async () => {
      render(
        <EnhancedEntrantsGrid
          initialEntrants={[entrant]}
          race_id="race-1"
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
        entrant_id: 'entrant-10',
        name: 'Golden Arrow',
        runner_number: 10,
        is_scratched: false,
        race: 'race-1',
        win_odds: 2.1,
        place_odds: 1.4,
        money_flow_timeline: undefined,
        pool_money: undefined,
        previous_hold_percentage: undefined,
        hold_percentage: undefined,
        money_flow_trend: undefined,
      },
      {
        $id: 'entrant-05',
        $createdAt: '2024-01-01T00:00:00.000Z',
        $updatedAt: '2024-01-01T00:00:00.000Z',
        entrant_id: 'entrant-05',
        name: 'Silver Storm',
        runner_number: 5,
        is_scratched: false,
        race: 'race-1',
        win_odds: 3.4,
        place_odds: 1.9,
        money_flow_timeline: undefined,
        pool_money: undefined,
        previous_hold_percentage: undefined,
        hold_percentage: undefined,
        money_flow_trend: undefined,
      },
      {
        $id: 'entrant-02',
        $createdAt: '2024-01-01T00:00:00.000Z',
        $updatedAt: '2024-01-01T00:00:00.000Z',
        entrant_id: 'entrant-02',
        name: 'Bronze Bandit',
        runner_number: 2,
        is_scratched: false,
        race: 'race-1',
        win_odds: 4.8,
        place_odds: 2.5,
        money_flow_timeline: undefined,
        pool_money: undefined,
        previous_hold_percentage: undefined,
        hold_percentage: undefined,
        money_flow_trend: undefined,
      },
    ]

    useRace.mockReturnValue({
      raceData: {
        race: {
          $id: 'race-1',
          start_time: new Date().toISOString(),
          status: 'final',
          result_status: 'final',
          results_data: [
            { position: 1, runner_number: 10, runnerName: 'Golden Arrow' },
            { position: 2, runner_number: 5, runnerName: 'Silver Storm' },
            { position: 3, runner_number: 2, runnerName: 'Bronze Bandit' },
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
          race_id="race-1"
          raceStartTime={new Date().toISOString()}
          results_data={[
            { position: 1, runner_number: 10, runnerName: 'Golden Arrow' },
            { position: 2, runner_number: 5, runnerName: 'Silver Storm' },
            { position: 3, runner_number: 2, runnerName: 'Bronze Bandit' },
          ]}
          result_status="final"
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

    const runner_numberElement = firstPlaceCell.querySelector('span.text-lg')
    expect(runner_numberElement?.className).toMatch(/text-amber-900/)

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
        entrant_id: 'entrant-07',
        name: 'Swift Winner',
        runner_number: 7,
        is_scratched: false,
        race: 'race-1',
        win_odds: 1.8,
        place_odds: 1.2,
        money_flow_timeline: undefined,
        pool_money: undefined,
        previous_hold_percentage: undefined,
        hold_percentage: undefined,
        money_flow_trend: undefined,
      },
      {
        $id: 'entrant-12',
        $createdAt: '2024-01-01T00:00:00.000Z',
        $updatedAt: '2024-01-01T00:00:00.000Z',
        entrant_id: 'entrant-12',
        name: 'Second Place',
        runner_number: 12,
        is_scratched: false,
        race: 'race-1',
        win_odds: 3.2,
        place_odds: 1.7,
        money_flow_timeline: undefined,
        pool_money: undefined,
        previous_hold_percentage: undefined,
        hold_percentage: undefined,
        money_flow_trend: undefined,
      },
    ]

    useRace.mockReturnValue({
      raceData: {
        race: {
          $id: 'race-1',
          start_time: new Date().toISOString(),
          status: 'interim',
          result_status: 'interim',
          results_data: null, // No results in race context - only via props
        },
        entrants,
        meeting: null,
      },
    })

    await act(async () => {
      render(
        <EnhancedEntrantsGrid
          initialEntrants={entrants}
          race_id="race-1"
          raceStartTime={new Date().toISOString()}
          results_data={[
            { position: 1, runner_number: 7, runnerName: 'Swift Winner' }
          ]}
          result_status="interim"
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
