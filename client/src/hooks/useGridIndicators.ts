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
      getIntervalKey(point.timeInterval) ?? getIntervalKey(point.timeToStart)
    return interval === targetInterval
  })
}

const getEntrantKey = (entrant: Entrant): string => entrant.entrantId || entrant.$id

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
        return dataPoint.incrementalPlaceAmount ?? 0
      }
      return dataPoint.incrementalWinAmount ?? dataPoint.incrementalAmount ?? 0
    })()

    const basePoint: MoneyFlowDataPoint = {
      $id: `${entrantKey}-${interval}-${view}`,
      $createdAt: dataPoint?.$createdAt ?? '1970-01-01T00:00:00.000Z',
      $updatedAt: dataPoint?.$updatedAt ?? '1970-01-01T00:00:00.000Z',
      entrant: entrantKey,
      pollingTimestamp: dataPoint?.pollingTimestamp ?? '1970-01-01T00:00:00.000Z',
      timeToStart: interval,
      timeInterval: interval,
      winPoolAmount: dataPoint?.winPoolAmount ?? 0,
      placePoolAmount: dataPoint?.placePoolAmount ?? 0,
      totalPoolAmount: dataPoint?.totalPoolAmount ?? 0,
      poolPercentage: dataPoint?.poolPercentage ?? 0,
      incrementalAmount: Math.max(0, rawAmount || 0),
    }

    if (view === 'place') {
      basePoint.incrementalPlaceAmount = basePoint.incrementalAmount
      basePoint.incrementalWinAmount = dataPoint?.incrementalWinAmount ?? 0
    } else {
      basePoint.incrementalWinAmount = basePoint.incrementalAmount
      basePoint.incrementalPlaceAmount = dataPoint?.incrementalPlaceAmount ?? 0
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
      if (entrant.isScratched) {
        return
      }

      const entrantKey = getEntrantKey(entrant)
      const percentageResult = calculateMoneyChangePercentage({
        currentTimeframe: currentFrame,
        previousTimeframe: previousFrame,
        entrantId: entrantKey,
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

      indicator.entrantId = entrantKey
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
      if (entrant.isScratched) {
        return
      }

      const entrantKey = getEntrantKey(entrant)
      const timeline = timelineData.get(entrantKey)
      const currentPoint = findDataPoint(timeline, currentInterval)
      const previousPoint = findDataPoint(timeline, previousInterval)

      const currentOdds = currentPoint?.fixedWinOdds ?? currentPoint?.poolWinOdds
      const previousOdds =
        previousPoint?.fixedWinOdds ?? previousPoint?.poolWinOdds

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
        entrantId: entrant.$id,
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

      indicator.entrantId = entrantKey
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
    entrantId: string
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
    (interval: number, entrantId: string) => {
      const intervalKey = getIntervalKey(interval)
      if (intervalKey === null) {
        return null
      }

      const intervalMap = indicatorMatrix.get(intervalKey)
      if (!intervalMap) {
        return null
      }

      return intervalMap.get(entrantId) ?? null
    },
    [indicatorMatrix]
  )

  return {
    getIndicatorForCell,
    isLoading,
  }
}

export default useGridIndicators
