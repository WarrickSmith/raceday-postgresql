/**
 * Hook for fetching and managing money flow timeline data for Enhanced Race Entrants
 * Story 4.9 implementation - provides real money flow history for timeline grid
 */

'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type {
  MoneyFlowDataPoint,
  EntrantMoneyFlowTimeline,
} from '@/types/moneyFlow'
import { useLogger } from '@/utils/logging'
import type { ComponentLogger } from '@/utils/logging'
import { useEndpointMetrics } from './useEndpointMetrics'
import { PollingEndpoint } from '@/types/pollingMetrics'
import { getConnectionState } from '@/state/connectionState'

// Server response interface for raw database data
interface ServerEntrant {
  entrant_id?: string
  name?: string
  $id?: string
  id?: string
  [key: string]: unknown
}

type EntrantReference = string | ServerEntrant

type TimelinePoolType =
  | 'win'
  | 'place'
  | 'quinella'
  | 'trifecta'
  | 'exacta'
  | 'first4'

type TimelineIntervalType = '30s' | '1m' | '5m' | string

interface ServerMoneyFlowPoint {
  $id: string
  $createdAt: string
  $updatedAt: string
  // Server may return either a relational `entrant` field or a scalar `entrant_id`.
  // Our API currently selects `entrant_id` for performance; include both for compatibility.
  entrant?: EntrantReference
  entrant_id?: string
  eventTimestamp?: string
  polling_timestamp?: string
  time_to_start?: number
  time_interval?: number
  interval_type?: TimelineIntervalType
  hold_percentage?: number
  betPercentage?: number
  winPoolAmount?: number
  placePoolAmount?: number
  type?: string
  poolType?: string
  incremental_win_amount?: number
  incremental_place_amount?: number
  incremental_amount?: number
  total_pool_amount?: number
  // CONSOLIDATED ODDS DATA (NEW in Story 4.9)
  fixed_win_odds?: number
  fixed_place_odds?: number
  pool_win_odds?: number
  pool_place_odds?: number
}

interface MoneyFlowTimelineResponse {
  success: boolean
  documents: ServerMoneyFlowPoint[]
  total?: number
  race_id?: string
  entrant_ids?: string[]
  poolType?: string
  bucketedData?: boolean
  intervalCoverage?: Record<string, unknown>
  message?: string
  queryOptimizations?: string[]
  // Incremental fetch cursors
  nextCursor?: string | null
  nextCreatedAt?: string | null
}

export interface TimelineGridData {
  [time_interval: number]: {
    [entrant_id: string]: {
      incremental_amount: number
      poolType: TimelinePoolType
      timestamp: string
    }
  }
}

interface UseMoneyFlowTimelineResult {
  timelineData: Map<string, EntrantMoneyFlowTimeline> // entrant_id -> timeline data
  gridData: TimelineGridData // interval -> entrant_id -> data
  isLoading: boolean
  error: string | null
  lastUpdate: Date | null
  refetch: () => Promise<void>
  getEntrantDataForInterval: (
    entrant_id: string,
    interval: number,
    poolType: 'win' | 'place'
  ) => string
  // NEW: Multi-pool support functions
  getWinPoolData: (entrant_id: string, interval: number) => string
  getPlacePoolData: (entrant_id: string, interval: number) => string
  getOddsData: (entrant_id: string, interval: number, oddsType: 'fixedWin' | 'fixedPlace' | 'poolWin' | 'poolPlace') => string
}

const normalizeInterval = (
  value: number | string | null | undefined
): number | null => {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const parsed = Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

export function useMoneyFlowTimeline(
  race_id: string,
  entrant_ids: string[],
  poolType: TimelinePoolType = 'win',
  raceStatus?: string // Add race status to control post-race behavior
): UseMoneyFlowTimelineResult {
  const logger = useLogger('useMoneyFlowTimeline')
  const loggerRef = useRef(logger)
  loggerRef.current = logger
  const entrantKey = useMemo(() => entrant_ids.join(','), [entrant_ids])

  // Metrics tracking
  const { recordRequest } = useEndpointMetrics(PollingEndpoint.MONEY_FLOW)
  const [timelineData, setTimelineData] = useState<
    Map<string, EntrantMoneyFlowTimeline>
  >(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const timelineDataRef = useRef(timelineData)
  const isFetchingRef = useRef(false)
  const pendingRequestRef = useRef<Promise<void> | null>(null)
  // Incremental fetch tracking
  const nextCursorRef = useRef<string | null>(null)
  const nextCreatedAtRef = useRef<string | null>(null)
  const lastEntrantKeyRef = useRef<string>('')

  useEffect(() => {
    timelineDataRef.current = timelineData
  }, [timelineData])

  // Fetch money flow timeline data for all entrants
  const fetchTimelineData = useCallback(async () => {
    if (!race_id || entrant_ids.length === 0) {
      return
    }

    // Check connection state before attempting fetch
    const connectionState = getConnectionState()
    if (connectionState !== 'connected') {
      // Don't attempt fetch if not connected
      setError('Connection unavailable')
      return
    }

    // Check race status to avoid unnecessary polling for completed races
    const isRaceComplete =
      raceStatus &&
      ['Final', 'Finalized', 'Abandoned', 'Cancelled'].includes(raceStatus)

    if (isRaceComplete && timelineDataRef.current.size > 0) {
      // Race is complete and we have timeline data, skip fetch
      return
    }

    if (isFetchingRef.current && pendingRequestRef.current) {
      return pendingRequestRef.current
    }

    setError(null)
    const overallStartTime = performance.now()

    const fetchPromise = (async () => {
      if (!isFetchingRef.current) {
        isFetchingRef.current = true
        setIsLoading(true)
      }

      try {
        // Reset cursors when entrant set changes
        const entrantsChangedThisFetch = lastEntrantKeyRef.current !== entrantKey
        if (entrantsChangedThisFetch) {
          nextCursorRef.current = null
          nextCreatedAtRef.current = null
          lastEntrantKeyRef.current = entrantKey
        }

        const aggregatedDocuments: ServerMoneyFlowPoint[] = []
        let pageCursor: string | null = null
        let pageNextCursor: string | null = null
        let pageNextCreatedAt: string | null = null
        let page = 0
        const MAX_PAGES = 10

        do {
          const params = new URLSearchParams()
          params.set('entrants', entrantKey)
          if (pageCursor) {
            params.set('cursorAfter', pageCursor)
          } else if (nextCreatedAtRef.current) {
            params.set('createdAfter', nextCreatedAtRef.current)
          }

          const response = await fetch(
            `/api/race/${race_id}/money-flow-timeline?${params.toString()}`
          )

          if (!response.ok) {
            throw new Error(
              `Failed to fetch timeline data: ${response.statusText}`
            )
          }

          const pageData = (await response.json()) as MoneyFlowTimelineResponse
          const pageDocuments = pageData.documents ?? []

          if (page === 0) {
            if (pageData.intervalCoverage) {
              loggerRef.current.debug(
                'Money flow interval coverage received',
                pageData.intervalCoverage
              )
            }

            if (pageData.message) {
              loggerRef.current.info('Money flow timeline message', {
                message: pageData.message,
              })
            }
          }

          aggregatedDocuments.push(...pageDocuments)

          pageNextCursor = pageData.nextCursor ?? null
          pageNextCreatedAt = pageData.nextCreatedAt ?? pageNextCreatedAt

          pageCursor = pageNextCursor
          page += 1
        } while (pageCursor && page < MAX_PAGES)

        const incomingMap = processTimelineData(
          aggregatedDocuments,
          entrant_ids,
          loggerRef.current
        )
        const hasIncoming =
          aggregatedDocuments.length > 0 && incomingMap.size > 0

        const lastAggregatedCreatedAt = aggregatedDocuments.length > 0
          ? aggregatedDocuments[aggregatedDocuments.length - 1]?.$createdAt ?? null
          : null

        // Update cursors for next incremental request only when we received new data
        if (hasIncoming) {
          nextCursorRef.current = pageNextCursor ?? nextCursorRef.current
          nextCreatedAtRef.current =
            pageNextCreatedAt ?? lastAggregatedCreatedAt ?? nextCreatedAtRef.current
        }

        if (entrantsChangedThisFetch) {
          // For entrant set changes, replace with whatever we have (can be empty)
          setTimelineData(incomingMap)
        } else if (hasIncoming) {
          if (!nextCreatedAtRef.current || timelineDataRef.current.size === 0) {
            // Initial load or no cursor provided -> replace
            setTimelineData(incomingMap)
          } else {
            // Incremental load -> merge into existing map by $id
            const merged = new Map(timelineDataRef.current)
            for (const [eid, newData] of incomingMap) {
              const prev = merged.get(eid)
              if (!prev) {
                merged.set(eid, newData)
                continue
              }
              const seen = new Set(prev.dataPoints.map((p) => p.$id))
              const combined = [...prev.dataPoints]
              for (const p of newData.dataPoints) {
                if (p.$id && !seen.has(p.$id)) {
                  combined.push(p)
                }
              }
              combined.sort((a, b) => {
                const ai =
                  normalizeInterval(a.time_interval) ??
                  normalizeInterval(a.time_to_start) ??
                  Number.NEGATIVE_INFINITY
                const bi =
                  normalizeInterval(b.time_interval) ??
                  normalizeInterval(b.time_to_start) ??
                  Number.NEGATIVE_INFINITY
                return bi - ai
              })
              merged.set(eid, { ...prev, ...newData, dataPoints: combined })
            }
            setTimelineData(merged)
          }
        } // else: no incoming data and same entrants -> keep existing timeline to avoid flicker
        setLastUpdate(new Date())

        // Record successful request
        const requestDuration = Math.round(performance.now() - overallStartTime)
        recordRequest({
          success: true,
          durationMs: requestDuration,
        })
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch timeline data'
        setError(errorMessage)
        loggerRef.current.error('Error fetching money flow timeline', err)

        // Record failed request
        const requestDuration = Math.round(performance.now() - overallStartTime)
        recordRequest({
          success: false,
          durationMs: requestDuration,
          error: errorMessage,
        })
      } finally {
        isFetchingRef.current = false
        pendingRequestRef.current = null
        setIsLoading(false)
      }
    })()

    pendingRequestRef.current = fetchPromise
    return fetchPromise
  }, [race_id, entrant_ids, entrantKey, raceStatus, recordRequest])

  // Generate timeline grid data optimized for component display
  const gridData = useMemo(() => {
    const grid: TimelineGridData = {}
    const currentLogger = loggerRef.current

    for (const [entrant_id, entrantData] of timelineData) {
      // Skip if no data points
      if (entrantData.dataPoints.length === 0) {
        continue
      }

      // Use the already calculated incremental amounts from dataPoints
      // The data points are already sorted chronologically and have incremental amounts calculated
      for (let i = 0; i < entrantData.dataPoints.length; i++) {
        const dataPoint = entrantData.dataPoints[i]

        // Use the incremental amount that was already calculated in the first processing loop
        // This ensures we maintain the correct chronological incremental calculations
        const incremental_amount = dataPoint.incremental_amount ?? 0

        // Skip if this pool type doesn't match what we're displaying
        const hasValidPoolData =
          (poolType === 'win' && typeof dataPoint.winPoolAmount === 'number') ||
          (poolType === 'place' &&
            typeof dataPoint.placePoolAmount === 'number')

        if (!hasValidPoolData && !dataPoint.pool_percentage) {
          currentLogger.debug(`Skipping data point - no valid pool data for ${poolType}`, {
            winPoolAmount: dataPoint.winPoolAmount,
            placePoolAmount: dataPoint.placePoolAmount,
            pool_percentage: dataPoint.pool_percentage,
          })
          continue
        }

        // Use time_interval if available (bucketed data), otherwise time_to_start (legacy)
        // This ensures compatibility with both data structures
        const intervalValue =
          normalizeInterval(dataPoint.time_interval) ??
          normalizeInterval(dataPoint.time_to_start)

        if (intervalValue === null) {
          continue
        }

        // Add grid data for this interval
        if (!grid[intervalValue]) {
          grid[intervalValue] = {}
        }

        grid[intervalValue][entrant_id] = {
          incremental_amount,
          poolType,
          timestamp: dataPoint.polling_timestamp,
        }
      }
    }

    return grid
  }, [timelineData, poolType])

  // Get formatted data for specific entrant and time interval
  const getEntrantDataForInterval = useCallback(
    (
      entrant_id: string,
      interval: number,
      requestedPoolType: 'win' | 'place'
    ) => {
      // Handle empty timeline data gracefully
      if (!timelineData || timelineData.size === 0) {
        return '—'
      }

      // Get entrant's timeline data directly
      const entrantTimeline = timelineData.get(entrant_id)
      if (!entrantTimeline || entrantTimeline.dataPoints.length === 0) {
        return '—'
      }

      // Find data point for this specific interval
      const dataPoint = entrantTimeline.dataPoints.find((point) => {
        const pointInterval =
          normalizeInterval(point.time_interval) ??
          normalizeInterval(point.time_to_start)
        return pointInterval === interval
      })

      if (!dataPoint) {
        return '—'
      }

      // SIMPLIFIED: Server pre-calculated everything in incremental_win_amount/incremental_place_amount
      // For 60m: server stored absolute total in incremental_win_amount
      // For others: server stored true increment in incremental_win_amount
      const displayAmount =
        requestedPoolType === 'win'
          ? dataPoint.incremental_win_amount || dataPoint.incremental_amount || 0
          : dataPoint.incremental_place_amount || dataPoint.incremental_amount || 0

      // Convert cents to dollars for display
      const amountInDollars = Math.round(displayAmount / 100)

      // Format for display: 60m shows baseline ($2,341), others show increment (+$344)
      if (amountInDollars <= 0) {
        return '—' // No data or zero amount
      }

      if (interval === 60) {
        // 60m column: baseline amount (server stored absolute total)
        return `$${amountInDollars.toLocaleString()}`
      } else {
        // All other columns: incremental change (server calculated increment)
        return `+$${amountInDollars.toLocaleString()}`
      }
    },
    [timelineData]
  )

  // Set up real-time subscription for money flow updates
  useEffect(() => {
    if (!race_id || entrant_ids.length === 0) return

    // Initial fetch
    fetchTimelineData()

    // Skip real-time subscriptions for completed races to preserve final state
    const isRaceComplete =
      raceStatus &&
      ['Final', 'Finalized', 'Abandoned', 'Cancelled'].includes(raceStatus)
    if (isRaceComplete) {
      // Race is complete, skip real-time subscription
      return
    }

    // NOTE: Real-time subscription removed to follow hybrid architecture
    // This hook now only handles data fetching - real-time updates come from 
    // the unified subscription in useUnifiedRaceRealtime
    // The parent component should trigger refetch when it receives money-flow-history updates
    
    loggerRef.current.debug('Money flow timeline using fetch-only mode (no subscription)', {
      race_id,
      entrant_ids: entrant_ids.length
    })

    return () => {
      // No subscription cleanup needed - using unified subscription architecture
    }
  }, [race_id, entrant_ids, entrantKey, raceStatus, fetchTimelineData])

  // NEW: Get Win pool data for specific entrant and time interval
  const getWinPoolData = useCallback(
    (entrant_id: string, interval: number) => {
      return getEntrantDataForInterval(entrant_id, interval, 'win')
    },
    [getEntrantDataForInterval]
  )

  // NEW: Get Place pool data for specific entrant and time interval
  const getPlacePoolData = useCallback(
    (entrant_id: string, interval: number) => {
      return getEntrantDataForInterval(entrant_id, interval, 'place')
    },
    [getEntrantDataForInterval]
  )

  // NEW: Get odds data for specific entrant and time interval
  const getOddsData = useCallback(
    (
      entrant_id: string,
      interval: number,
      oddsType: 'fixedWin' | 'fixedPlace' | 'poolWin' | 'poolPlace'
    ) => {
      // Handle empty timeline data gracefully
      if (!timelineData || timelineData.size === 0) {
        return '—'
      }

      // Get entrant's timeline data directly
      const entrantTimeline = timelineData.get(entrant_id)
      if (!entrantTimeline || entrantTimeline.dataPoints.length === 0) {
        return '—'
      }

      // Find data point for this specific interval
      const dataPoint = entrantTimeline.dataPoints.find((point) => {
        const pointInterval = point.time_interval ?? point.time_to_start ?? -999
        return pointInterval === interval
      })

      if (!dataPoint) {
        return '—'
      }

      // Get odds value based on type from consolidated data
      let oddsValue: number | undefined
      switch (oddsType) {
        case 'fixedWin':
          oddsValue = dataPoint.fixed_win_odds
          break
        case 'fixedPlace':
          oddsValue = dataPoint.fixed_place_odds
          break
        case 'poolWin':
          oddsValue = dataPoint.pool_win_odds
          break
        case 'poolPlace':
          oddsValue = dataPoint.pool_place_odds
          break
        default:
          return '—'
      }

      // Format odds for display
      if (!oddsValue || oddsValue <= 0) {
        return '—'
      }

      return oddsValue.toFixed(2)
    },
    [timelineData]
  )

  return {
    timelineData,
    gridData,
    isLoading,
    error,
    lastUpdate,
    refetch: fetchTimelineData,
    getEntrantDataForInterval,
    getWinPoolData,
    getPlacePoolData,
    getOddsData,
  }
}

/**
 * Unified processing function for all timeline data (bucketed or legacy)
 * Standardizes incremental calculation logic to eliminate inconsistencies
 */
function processTimelineData(
  documents: ServerMoneyFlowPoint[],
  entrant_ids: string[],
  logger?: ComponentLogger
): Map<string, EntrantMoneyFlowTimeline> {
  const entrantDataMap = new Map<string, EntrantMoneyFlowTimeline>()

  for (const entrant_id of entrant_ids) {
    // Extract entrant ID consistently across all data formats
    const entrantDocs = documents.filter((doc) => {
      // Prefer scalar `entrant_id` when present, fallback to relational `entrant`
      const docEntrantId = (doc.entrant_id && String(doc.entrant_id)) || extractEntrantId(doc.entrant as EntrantReference)
      return docEntrantId === entrant_id
    })

    if (entrantDocs.length === 0) {
      logger?.debug(`No documents found for entrant ${entrant_id}`)
      // Create empty entry to maintain consistency
      entrantDataMap.set(entrant_id, {
        entrant_id,
        dataPoints: [],
        latest_percentage: 0,
        trend: 'neutral',
        significant_change: false,
      })
      continue
    }

    logger?.debug(`Processing entrant ${entrant_id}`, { documentCount: entrantDocs.length })

    // Group documents by time interval to handle duplicates
    const intervalMap = new Map<number, ServerMoneyFlowPoint[]>()

    entrantDocs.forEach((doc) => {
      // Use time_interval if available (bucketed), otherwise time_to_start (legacy)
      const interval =
        normalizeInterval(doc.time_interval) ?? normalizeInterval(doc.time_to_start)

      if (interval === null) {
        logger?.warn(`Document missing time information for entrant ${entrant_id}`)
        return
      }

      if (!intervalMap.has(interval)) {
        intervalMap.set(interval, [])
      }
      intervalMap.get(interval)!.push(doc)
    })

    // Use server pre-calculated timeline points directly (no client consolidation)
    // Per Implementation Guide: Server provides clean bucket data with pre-calculated increments
    const timelinePoints: MoneyFlowDataPoint[] = []

    for (const [interval, intervalDocs] of intervalMap) {
      // Use the latest document for this interval (server should provide one clean bucket per interval)
      const doc = intervalDocs[intervalDocs.length - 1] // Get most recent if multiple

      // Trust server pre-calculated data - no client processing needed
      const timelinePoint: MoneyFlowDataPoint = {
        $id: doc.$id,
        $createdAt: doc.$createdAt,
        $updatedAt: doc.$updatedAt,
        entrant: entrant_id,
        polling_timestamp: doc.polling_timestamp || doc.$createdAt,
        time_to_start: normalizeInterval(doc.time_to_start) ?? interval,
        time_interval: normalizeInterval(doc.time_interval) ?? interval,
        interval_type: doc.interval_type || '5m',
        winPoolAmount: doc.winPoolAmount ?? 0,
        placePoolAmount: doc.placePoolAmount ?? 0,
        total_pool_amount: (doc.winPoolAmount ?? 0) + (doc.placePoolAmount ?? 0),
        pool_percentage: doc.hold_percentage ?? doc.betPercentage ?? 0,
        // Use server pre-calculated incremental amounts directly
        incremental_amount:
          doc.incremental_win_amount ??
          doc.incremental_amount ??
          0,
        incremental_win_amount: doc.incremental_win_amount ?? 0,
        incremental_place_amount: doc.incremental_place_amount ?? 0,
        polling_interval: getPollingIntervalFromType(doc.interval_type),
        // CONSOLIDATED ODDS DATA (NEW in Story 4.9)
        fixed_win_odds: doc.fixed_win_odds,
        fixed_place_odds: doc.fixed_place_odds,
        pool_win_odds: doc.pool_win_odds,
        pool_place_odds: doc.pool_place_odds,
      }

      timelinePoints.push(timelinePoint)
    }

    // Sort by time interval descending (60, 55, 50... 0, -0.5, -1)
    timelinePoints.sort((a, b) => {
      const aInterval =
        normalizeInterval(a.time_interval) ??
        normalizeInterval(a.time_to_start) ??
        Number.NEGATIVE_INFINITY
      const bInterval =
        normalizeInterval(b.time_interval) ??
        normalizeInterval(b.time_to_start) ??
        Number.NEGATIVE_INFINITY
      return bInterval - aInterval
    })

    // Server pre-calculated incremental amounts - no client calculation needed
    // Per Implementation Guide: "Server pre-calculated everything in incremental_win_amount/incremental_place_amount"

    // Calculate trend and metadata
    const latestPoint = timelinePoints[timelinePoints.length - 1]
    const secondLatestPoint =
      timelinePoints.length > 1
        ? timelinePoints[timelinePoints.length - 2]
        : null

    let trend: 'up' | 'down' | 'neutral' = 'neutral'
    let significant_change = false

    if (latestPoint && secondLatestPoint) {
      const percentageChange =
        latestPoint.pool_percentage - secondLatestPoint.pool_percentage
      trend =
        percentageChange > 0.5
          ? 'up'
          : percentageChange < -0.5
          ? 'down'
          : 'neutral'
      significant_change = Math.abs(percentageChange) >= 1.0 // Reduced threshold for more sensitivity
    }

    // Calculate latest odds from timeline data (NEW in Story 4.9)
    let latest_win_odds: number | undefined
    let latest_place_odds: number | undefined
    
    // Find the most recent odds values - timelinePoints is sorted by time interval descending (60, 55, 50... 0, -0.5, -1)
    // The LOWEST intervals (closest to 0 or negative) are the NEWEST, so iterate BACKWARDS from the end
    for (let i = timelinePoints.length - 1; i >= 0; i--) {
      const point = timelinePoints[i]
      if (!latest_win_odds && point.fixed_win_odds !== undefined && point.fixed_win_odds > 0) {
        latest_win_odds = point.fixed_win_odds
      }
      if (!latest_place_odds && point.fixed_place_odds !== undefined && point.fixed_place_odds > 0) {
        latest_place_odds = point.fixed_place_odds
      }
      // Break if we found both odds values
      if (latest_win_odds && latest_place_odds) break
    }

    entrantDataMap.set(entrant_id, {
      entrant_id,
      dataPoints: timelinePoints,
      latest_percentage: latestPoint?.pool_percentage || 0,
      trend,
      significant_change,
      // Add latest odds from timeline data
      latest_win_odds,
      latest_place_odds,
    })

    logger?.debug(`Processed entrant ${entrant_id} timeline points`, {
      timelinePointsCount: timelinePoints.length,
      usingServerCalculatedData: true
    })
  }

  logger?.debug('Timeline processing complete', {
    entrantsProcessed: entrantDataMap.size,
    totalDataPoints: Array.from(entrantDataMap.values()).reduce(
      (sum, data) => sum + data.dataPoints.length,
      0
    ),
  })

  return entrantDataMap
}

/**
 * Extract entrant ID consistently from various data formats
 */
function extractEntrantId(entrant: EntrantReference): string {
  if (typeof entrant === 'string') {
    return entrant
  }

  if (entrant && typeof entrant === 'object') {
    if (typeof entrant.entrant_id === 'string') {
      return entrant.entrant_id
    }
    if (typeof entrant.$id === 'string') {
      return entrant.$id
    }
    if (typeof entrant.id === 'string') {
      return entrant.id
    }
  }

  return 'unknown'
}

/**
 * Get polling interval from interval type string
 */
function getPollingIntervalFromType(interval_type?: TimelineIntervalType): number {
  switch (interval_type) {
    case '30s':
      return 0.5
    case '1m':
      return 1
    case '5m':
      return 5
    default:
      return 5
  }
}

// End of file
