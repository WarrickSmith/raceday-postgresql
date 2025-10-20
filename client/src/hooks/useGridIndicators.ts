'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Entrant } from '@/types/meetings'
import type { IndicatorConfig } from '@/types/alerts'
import type { EntrantMoneyFlowTimeline, MoneyFlowDataPoint } from '@/types/moneyFlow'
import type { IndicatorResult } from '@/types/alertCalculations'
import {
  calculateMoneyChangePercentage,
  calculateOddsChangePercentage,
  mapPercentageToIndicator,
} from '@/services/alertCalculationService'
import { loadUserAlertConfig } from '@/services/alertConfigService'

export type GridView = 'win' | 'place' | 'odds'

export type IndicatorMatrix = Map<number, Map<string, IndicatorResult>>

interface ComputeIndicatorParams {
  timelineData: Map<string, EntrantMoneyFlowTimeline>
  entrants: Entrant[]
  intervals: number[]
  selectedView: GridView
  indicatorConfigs: IndicatorConfig[]
  includeDisabled?: boolean
}

const getIntervalKey = (interval?: number | null): number | null => {
  if (interval === undefined || interval === null) {
    return null
  }

  // Some intervals arrive as floating point with many decimals; normalize
  return Number.parseFloat(interval.toString())
}

const findDataPoint = (
  timeline: EntrantMoneyFlowTimeline | undefined,
  targetInterval: number
) => {
  if (!timeline) return undefined
  return timeline.dataPoints.find((point) => {
    const interval =
      getIntervalKey(point.time_interval) ?? getIntervalKey(point.time_to_start)
    return interval === targetInterval
  })
}

const getEntrantKey = (entrant: Entrant): string => entrant.entrant_id || entrant.$id

const buildMoneyFrame = (
  entrants: Entrant[],
  timelineData: Map<string, EntrantMoneyFlowTimeline>,
  interval: number,
  view: Exclude<GridView, 'odds'>
) =>
  entrants.map((entrant) => {
    const entrantKey = getEntrantKey(entrant)
    const timeline = timelineData.get(entrantKey)
    const dataPoint = findDataPoint(timeline, interval)

    const rawAmount = (() => {
      if (!dataPoint) return 0
      if (view === 'place') {
        return dataPoint.incremental_place_amount ?? 0
      }
      return dataPoint.incremental_win_amount ?? dataPoint.incremental_amount ?? 0
    })()

    const basePoint: MoneyFlowDataPoint = {
      $id: `${entrantKey}-${interval}-${view}`,
      $createdAt: dataPoint?.$createdAt ?? '1970-01-01T00:00:00.000Z',
      $updatedAt: dataPoint?.$updatedAt ?? '1970-01-01T00:00:00.000Z',
      entrant: entrantKey,
      polling_timestamp: dataPoint?.polling_timestamp ?? '1970-01-01T00:00:00.000Z',
      time_to_start: interval,
      time_interval: interval,
      winPoolAmount: dataPoint?.winPoolAmount ?? 0,
      placePoolAmount: dataPoint?.placePoolAmount ?? 0,
      total_pool_amount: dataPoint?.total_pool_amount ?? 0,
      pool_percentage: dataPoint?.pool_percentage ?? 0,
      incremental_amount: Math.max(0, rawAmount || 0),
    }

    if (view === 'place') {
      basePoint.incremental_place_amount = basePoint.incremental_amount
      basePoint.incremental_win_amount = dataPoint?.incremental_win_amount ?? 0
    } else {
      basePoint.incremental_win_amount = basePoint.incremental_amount
      basePoint.incremental_place_amount = dataPoint?.incremental_place_amount ?? 0
    }

    return basePoint
  })

const computeMoneyIndicators = (
  params: ComputeIndicatorParams,
  intervals: number[],
  matrix: IndicatorMatrix
) => {
  const { entrants, timelineData, indicatorConfigs, includeDisabled } = params

  for (let idx = 1; idx < intervals.length; idx += 1) {
    const currentInterval = intervals[idx]
    const previousInterval = intervals[idx - 1]

    const currentFrame = buildMoneyFrame(
      entrants,
      timelineData,
      currentInterval,
      params.selectedView === 'place' ? 'place' : 'win'
    )
    const previousFrame = buildMoneyFrame(
      entrants,
      timelineData,
      previousInterval,
      params.selectedView === 'place' ? 'place' : 'win'
    )

    entrants.forEach((entrant) => {
      if (entrant.is_scratched) {
        return
      }

      const entrantKey = getEntrantKey(entrant)
      const percentageResult = calculateMoneyChangePercentage({
        currentTimeframe: currentFrame,
        previousTimeframe: previousFrame,
        entrant_id: entrantKey,
      })

      if (!percentageResult.hasChange) {
        return
      }

      const indicator = mapPercentageToIndicator(
        percentageResult.percentageChange,
        indicatorConfigs,
        'money_increase'
      )

      if (!indicator) {
        return
      }

      if (!includeDisabled && !indicator.enabled) {
        return
      }

      indicator.entrant_id = entrantKey
      indicator.percentageChange = percentageResult.percentageChange

      const existingIntervalMap = matrix.get(currentInterval) ?? new Map()
      existingIntervalMap.set(entrantKey, indicator)
      matrix.set(currentInterval, existingIntervalMap)
    })
  }
}

const computeOddsIndicators = (
  params: ComputeIndicatorParams,
  intervals: number[],
  matrix: IndicatorMatrix
) => {
  const { entrants, timelineData, indicatorConfigs, includeDisabled } = params

  for (let idx = 1; idx < intervals.length; idx += 1) {
    const currentInterval = intervals[idx]
    const previousInterval = intervals[idx - 1]

    entrants.forEach((entrant) => {
      if (entrant.is_scratched) {
        return
      }

      const entrantKey = getEntrantKey(entrant)
      const timeline = timelineData.get(entrantKey)
      const currentPoint = findDataPoint(timeline, currentInterval)
      const previousPoint = findDataPoint(timeline, previousInterval)

      const currentOdds = currentPoint?.fixed_win_odds ?? currentPoint?.pool_win_odds
      const previousOdds =
        previousPoint?.fixed_win_odds ?? previousPoint?.pool_win_odds

      if (
        currentOdds === undefined ||
        previousOdds === undefined ||
        currentOdds === null ||
        previousOdds === null
      ) {
        return
      }

      const oddsResult = calculateOddsChangePercentage({
        currentOdds,
        previousOdds,
        entrant_id: entrant.$id,
      })

      if (!oddsResult.hasChange) {
        return
      }

      const indicator = mapPercentageToIndicator(
        oddsResult.percentageChange,
        indicatorConfigs,
        'odds_shortening'
      )

      if (!indicator) {
        return
      }

      if (!includeDisabled && !indicator.enabled) {
        return
      }

      indicator.entrant_id = entrantKey
      indicator.percentageChange = oddsResult.percentageChange

      const intervalMap = matrix.get(currentInterval) ?? new Map()
      intervalMap.set(entrantKey, indicator)
      matrix.set(currentInterval, intervalMap)
    })
  }
}

export const computeIndicatorMatrix = (
  params: ComputeIndicatorParams
): IndicatorMatrix => {
  const { intervals, selectedView, timelineData, entrants, indicatorConfigs } =
    params
  const normalizedIntervals = Array.from(new Set(intervals))
    .map((interval) => getIntervalKey(interval))
    .filter((interval): interval is number => interval !== null)
    .sort((a, b) => b - a)

  if (
    normalizedIntervals.length === 0 ||
    indicatorConfigs.length === 0 ||
    timelineData.size === 0 ||
    entrants.length === 0
  ) {
    return new Map()
  }

  const matrix: IndicatorMatrix = new Map()

  if (selectedView === 'odds') {
    computeOddsIndicators({ ...params }, normalizedIntervals, matrix)
  } else {
    computeMoneyIndicators({ ...params }, normalizedIntervals, matrix)
  }

  return matrix
}

interface UseGridIndicatorsParams {
  timelineData: Map<string, EntrantMoneyFlowTimeline>
  entrants: Entrant[]
  intervals: number[]
  selectedView: GridView
  includeDisabled?: boolean
}

interface UseGridIndicatorsResult {
  getIndicatorForCell: (
    interval: number,
    entrant_id: string
  ) => IndicatorResult | null
  isLoading: boolean
}

export const useGridIndicators = (
  params: UseGridIndicatorsParams
): UseGridIndicatorsResult => {
  const {
    timelineData,
    entrants,
    intervals,
    selectedView,
    includeDisabled = false,
  } = params
  const [indicatorConfigs, setIndicatorConfigs] = useState<IndicatorConfig[] | null>(
    null
  )
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const fetchConfig = async () => {
      try {
        const config = await loadUserAlertConfig()
        if (!cancelled) {
          setIndicatorConfigs(config.indicators)
        }
      } catch (error) {
        console.error('Failed to load alert configuration', error)
        if (!cancelled) {
          setIndicatorConfigs([])
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchConfig()

    return () => {
      cancelled = true
    }
  }, [])

  const indicatorMatrix = useMemo(() => {
    if (!indicatorConfigs) {
      return new Map()
    }

    return computeIndicatorMatrix({
      timelineData,
      entrants,
      intervals,
      selectedView,
      indicatorConfigs,
      includeDisabled,
    })
  }, [
    indicatorConfigs,
    entrants,
    includeDisabled,
    intervals,
    selectedView,
    timelineData,
  ])

  const getIndicatorForCell = useCallback(
    (interval: number, entrant_id: string) => {
      const intervalKey = getIntervalKey(interval)
      if (intervalKey === null) {
        return null
      }

      const intervalMap = indicatorMatrix.get(intervalKey)
      if (!intervalMap) {
        return null
      }

      return intervalMap.get(entrant_id) ?? null
    },
    [indicatorMatrix]
  )

  return {
    getIndicatorForCell,
    isLoading,
  }
}

export default useGridIndicators
