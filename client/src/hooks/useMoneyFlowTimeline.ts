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

// Server response interface for raw database data
interface ServerEntrant {
  entrantId?: string
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
  // Server may return either a relational `entrant` field or a scalar `entrantId`.
  // Our API currently selects `entrantId` for performance; include both for compatibility.
  entrant?: EntrantReference
  entrantId?: string
  eventTimestamp?: string
  pollingTimestamp?: string
  timeToStart?: number
  timeInterval?: number
  intervalType?: TimelineIntervalType
  holdPercentage?: number
  betPercentage?: number
  winPoolAmount?: number
  placePoolAmount?: number
  type?: string
  poolType?: string
  incrementalWinAmount?: number
  incrementalPlaceAmount?: number
  incrementalAmount?: number
  totalPoolAmount?: number
  // CONSOLIDATED ODDS DATA (NEW in Story 4.9)
  fixedWinOdds?: number
  fixedPlaceOdds?: number
  poolWinOdds?: number
  poolPlaceOdds?: number
}

interface MoneyFlowTimelineResponse {
  success: boolean
  documents: ServerMoneyFlowPoint[]
  total?: number
  raceId?: string
  entrantIds?: string[]
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
  [timeInterval: number]: {
    [entrantId: string]: {
      incrementalAmount: number
      poolType: TimelinePoolType
      timestamp: string
    }
  }
}

interface UseMoneyFlowTimelineResult {
  timelineData: Map<string, EntrantMoneyFlowTimeline> // entrantId -> timeline data
  gridData: TimelineGridData // interval -> entrantId -> data
  isLoading: boolean
  error: string | null
  lastUpdate: Date | null
  refetch: () => Promise<void>
  getEntrantDataForInterval: (
    entrantId: string,
    interval: number,
    poolType: 'win' | 'place'
  ) => string
  // NEW: Multi-pool support functions
  getWinPoolData: (entrantId: string, interval: number) => string
  getPlacePoolData: (entrantId: string, interval: number) => string
  getOddsData: (entrantId: string, interval: number, oddsType: 'fixedWin' | 'fixedPlace' | 'poolWin' | 'poolPlace') => string
}

export function useMoneyFlowTimeline(
  raceId: string,
  entrantIds: string[],
  poolType: TimelinePoolType = 'win',
  raceStatus?: string // Add race status to control post-race behavior
): UseMoneyFlowTimelineResult {
  const logger = useLogger('useMoneyFlowTimeline')
  const loggerRef = useRef(logger)
  loggerRef.current = logger
  const entrantKey = useMemo(() => entrantIds.join(','), [entrantIds])
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
    if (!raceId || entrantIds.length === 0) {
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

        const params = new URLSearchParams()
        params.set('entrants', entrantKey)
        // Use createdAfter for incremental fetches when we have a cursor timestamp
        if (nextCreatedAtRef.current) {
          params.set('createdAfter', nextCreatedAtRef.current)
        }
        const response = await fetch(
          `/api/race/${raceId}/money-flow-timeline?${params.toString()}`
        )

        if (!response.ok) {
          throw new Error(
            `Failed to fetch timeline data: ${response.statusText}`
          )
        }

        const data = (await response.json()) as MoneyFlowTimelineResponse
        const documents = data.documents ?? []

        if (data.intervalCoverage) {
          loggerRef.current.debug(
            'Money flow interval coverage received',
            data.intervalCoverage
          )
        }

        if (data.message) {
          loggerRef.current.info('Money flow timeline message', {
            message: data.message,
          })
        }

        const incomingMap = processTimelineData(documents, entrantIds, loggerRef.current)
        const hasIncoming = documents.length > 0 && incomingMap.size > 0

        // Update cursors for next incremental request only when we received new data
        if (hasIncoming) {
          nextCursorRef.current = data.nextCursor ?? nextCursorRef.current
          nextCreatedAtRef.current = data.nextCreatedAt ?? nextCreatedAtRef.current
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
                const ai = (a.timeInterval ?? a.timeToStart ?? -Infinity) as number
                const bi = (b.timeInterval ?? b.timeToStart ?? -Infinity) as number
                return bi - ai
              })
              merged.set(eid, { ...prev, ...newData, dataPoints: combined })
            }
            setTimelineData(merged)
          }
        } // else: no incoming data and same entrants -> keep existing timeline to avoid flicker
        setLastUpdate(new Date())
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch timeline data'
        setError(errorMessage)
        loggerRef.current.error('Error fetching money flow timeline', err)
      } finally {
        isFetchingRef.current = false
        pendingRequestRef.current = null
        setIsLoading(false)
      }
    })()

    pendingRequestRef.current = fetchPromise
    return fetchPromise
  }, [raceId, entrantIds, entrantKey, raceStatus])

  // Generate timeline grid data optimized for component display
  const gridData = useMemo(() => {
    const grid: TimelineGridData = {}
    const currentLogger = loggerRef.current

    for (const [entrantId, entrantData] of timelineData) {
      // Skip if no data points
      if (entrantData.dataPoints.length === 0) {
        continue
      }

      // Use the already calculated incremental amounts from dataPoints
      // The data points are already sorted chronologically and have incremental amounts calculated
      for (let i = 0; i < entrantData.dataPoints.length; i++) {
        const dataPoint = entrantData.dataPoints[i]

        // Skip if no timeToStart data
        if (typeof dataPoint.timeToStart !== 'number') {
          continue
        }

        // Use the incremental amount that was already calculated in the first processing loop
        // This ensures we maintain the correct chronological incremental calculations
        const incrementalAmount = dataPoint.incrementalAmount ?? 0

        // Skip if this pool type doesn't match what we're displaying
        const hasValidPoolData =
          (poolType === 'win' && typeof dataPoint.winPoolAmount === 'number') ||
          (poolType === 'place' &&
            typeof dataPoint.placePoolAmount === 'number')

        if (!hasValidPoolData && !dataPoint.poolPercentage) {
          currentLogger.debug(`Skipping data point - no valid pool data for ${poolType}`, {
            winPoolAmount: dataPoint.winPoolAmount,
            placePoolAmount: dataPoint.placePoolAmount,
            poolPercentage: dataPoint.poolPercentage,
          })
          continue
        }

        // Use timeInterval if available (bucketed data), otherwise timeToStart (legacy)
        // This ensures compatibility with both data structures
        const interval =
          dataPoint.timeInterval ?? dataPoint.timeToStart

        if (interval === undefined) {
          continue
        }

        // Add grid data for this interval
        if (!grid[interval]) {
          grid[interval] = {}
        }

        grid[interval][entrantId] = {
          incrementalAmount,
          poolType,
          timestamp: dataPoint.pollingTimestamp,
        }
      }
    }

    return grid
  }, [timelineData, poolType])

  // Get formatted data for specific entrant and time interval
  const getEntrantDataForInterval = useCallback(
    (
      entrantId: string,
      interval: number,
      requestedPoolType: 'win' | 'place'
    ) => {
      // Handle empty timeline data gracefully
      if (!timelineData || timelineData.size === 0) {
        return '—'
      }

      // Get entrant's timeline data directly
      const entrantTimeline = timelineData.get(entrantId)
      if (!entrantTimeline || entrantTimeline.dataPoints.length === 0) {
        return '—'
      }

      // Find data point for this specific interval
      const dataPoint = entrantTimeline.dataPoints.find((point) => {
        const pointInterval = point.timeInterval ?? point.timeToStart ?? -999
        return pointInterval === interval
      })

      if (!dataPoint) {
        return '—'
      }

      // SIMPLIFIED: Server pre-calculated everything in incrementalWinAmount/incrementalPlaceAmount
      // For 60m: server stored absolute total in incrementalWinAmount
      // For others: server stored true increment in incrementalWinAmount
      const displayAmount =
        requestedPoolType === 'win'
          ? dataPoint.incrementalWinAmount || dataPoint.incrementalAmount || 0
          : dataPoint.incrementalPlaceAmount || dataPoint.incrementalAmount || 0

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
    if (!raceId || entrantIds.length === 0) return

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
      raceId,
      entrantIds: entrantIds.length
    })

    return () => {
      // No subscription cleanup needed - using unified subscription architecture
    }
  }, [raceId, entrantIds, entrantKey, raceStatus, fetchTimelineData])

  // NEW: Get Win pool data for specific entrant and time interval
  const getWinPoolData = useCallback(
    (entrantId: string, interval: number) => {
      return getEntrantDataForInterval(entrantId, interval, 'win')
    },
    [getEntrantDataForInterval]
  )

  // NEW: Get Place pool data for specific entrant and time interval
  const getPlacePoolData = useCallback(
    (entrantId: string, interval: number) => {
      return getEntrantDataForInterval(entrantId, interval, 'place')
    },
    [getEntrantDataForInterval]
  )

  // NEW: Get odds data for specific entrant and time interval
  const getOddsData = useCallback(
    (
      entrantId: string,
      interval: number,
      oddsType: 'fixedWin' | 'fixedPlace' | 'poolWin' | 'poolPlace'
    ) => {
      // Handle empty timeline data gracefully
      if (!timelineData || timelineData.size === 0) {
        return '—'
      }

      // Get entrant's timeline data directly
      const entrantTimeline = timelineData.get(entrantId)
      if (!entrantTimeline || entrantTimeline.dataPoints.length === 0) {
        return '—'
      }

      // Find data point for this specific interval
      const dataPoint = entrantTimeline.dataPoints.find((point) => {
        const pointInterval = point.timeInterval ?? point.timeToStart ?? -999
        return pointInterval === interval
      })

      if (!dataPoint) {
        return '—'
      }

      // Get odds value based on type from consolidated data
      let oddsValue: number | undefined
      switch (oddsType) {
        case 'fixedWin':
          oddsValue = dataPoint.fixedWinOdds
          break
        case 'fixedPlace':
          oddsValue = dataPoint.fixedPlaceOdds
          break
        case 'poolWin':
          oddsValue = dataPoint.poolWinOdds
          break
        case 'poolPlace':
          oddsValue = dataPoint.poolPlaceOdds
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
  entrantIds: string[],
  logger?: ComponentLogger
): Map<string, EntrantMoneyFlowTimeline> {
  const entrantDataMap = new Map<string, EntrantMoneyFlowTimeline>()

  for (const entrantId of entrantIds) {
    // Extract entrant ID consistently across all data formats
    const entrantDocs = documents.filter((doc) => {
      // Prefer scalar `entrantId` when present, fallback to relational `entrant`
      const docEntrantId = (doc.entrantId && String(doc.entrantId)) || extractEntrantId(doc.entrant as EntrantReference)
      return docEntrantId === entrantId
    })

    if (entrantDocs.length === 0) {
      logger?.debug(`No documents found for entrant ${entrantId}`)
      // Create empty entry to maintain consistency
      entrantDataMap.set(entrantId, {
        entrantId,
        dataPoints: [],
        latestPercentage: 0,
        trend: 'neutral',
        significantChange: false,
      })
      continue
    }

    logger?.debug(`Processing entrant ${entrantId}`, { documentCount: entrantDocs.length })

    // Group documents by time interval to handle duplicates
    const intervalMap = new Map<number, ServerMoneyFlowPoint[]>()

    entrantDocs.forEach((doc) => {
      // Use timeInterval if available (bucketed), otherwise timeToStart (legacy)
      const interval = doc.timeInterval ?? doc.timeToStart ?? -999
      if (interval === -999) {
        logger?.warn(`Document missing time information for entrant ${entrantId}`)
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
        entrant: entrantId,
        pollingTimestamp: doc.pollingTimestamp || doc.$createdAt,
        timeToStart: doc.timeToStart || 0,
        timeInterval: doc.timeInterval ?? interval,
        intervalType: doc.intervalType || '5m',
        winPoolAmount: doc.winPoolAmount ?? 0,
        placePoolAmount: doc.placePoolAmount ?? 0,
        totalPoolAmount: (doc.winPoolAmount ?? 0) + (doc.placePoolAmount ?? 0),
        poolPercentage: doc.holdPercentage ?? doc.betPercentage ?? 0,
        // Use server pre-calculated incremental amounts directly
        incrementalAmount:
          doc.incrementalWinAmount ??
          doc.incrementalAmount ??
          0,
        incrementalWinAmount: doc.incrementalWinAmount ?? 0,
        incrementalPlaceAmount: doc.incrementalPlaceAmount ?? 0,
        pollingInterval: getPollingIntervalFromType(doc.intervalType),
        // CONSOLIDATED ODDS DATA (NEW in Story 4.9)
        fixedWinOdds: doc.fixedWinOdds,
        fixedPlaceOdds: doc.fixedPlaceOdds,
        poolWinOdds: doc.poolWinOdds,
        poolPlaceOdds: doc.poolPlaceOdds,
      }

      timelinePoints.push(timelinePoint)
    }

    // Sort by time interval descending (60, 55, 50... 0, -0.5, -1)
    timelinePoints.sort((a, b) => {
      const aInterval = a.timeInterval ?? a.timeToStart ?? -Infinity
      const bInterval = b.timeInterval ?? b.timeToStart ?? -Infinity
      return bInterval - aInterval
    })

    // Server pre-calculated incremental amounts - no client calculation needed
    // Per Implementation Guide: "Server pre-calculated everything in incrementalWinAmount/incrementalPlaceAmount"

    // Calculate trend and metadata
    const latestPoint = timelinePoints[timelinePoints.length - 1]
    const secondLatestPoint =
      timelinePoints.length > 1
        ? timelinePoints[timelinePoints.length - 2]
        : null

    let trend: 'up' | 'down' | 'neutral' = 'neutral'
    let significantChange = false

    if (latestPoint && secondLatestPoint) {
      const percentageChange =
        latestPoint.poolPercentage - secondLatestPoint.poolPercentage
      trend =
        percentageChange > 0.5
          ? 'up'
          : percentageChange < -0.5
          ? 'down'
          : 'neutral'
      significantChange = Math.abs(percentageChange) >= 1.0 // Reduced threshold for more sensitivity
    }

    // Calculate latest odds from timeline data (NEW in Story 4.9)
    let latestWinOdds: number | undefined
    let latestPlaceOdds: number | undefined
    
    // Find the most recent odds values - timelinePoints is sorted by time interval descending (60, 55, 50... 0, -0.5, -1)
    // The LOWEST intervals (closest to 0 or negative) are the NEWEST, so iterate BACKWARDS from the end
    for (let i = timelinePoints.length - 1; i >= 0; i--) {
      const point = timelinePoints[i]
      if (!latestWinOdds && point.fixedWinOdds !== undefined && point.fixedWinOdds > 0) {
        latestWinOdds = point.fixedWinOdds
      }
      if (!latestPlaceOdds && point.fixedPlaceOdds !== undefined && point.fixedPlaceOdds > 0) {
        latestPlaceOdds = point.fixedPlaceOdds
      }
      // Break if we found both odds values
      if (latestWinOdds && latestPlaceOdds) break
    }

    entrantDataMap.set(entrantId, {
      entrantId,
      dataPoints: timelinePoints,
      latestPercentage: latestPoint?.poolPercentage || 0,
      trend,
      significantChange,
      // Add latest odds from timeline data
      latestWinOdds,
      latestPlaceOdds,
    })

    logger?.debug(`Processed entrant ${entrantId} timeline points`, {
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
    if (typeof entrant.entrantId === 'string') {
      return entrant.entrantId
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
function getPollingIntervalFromType(intervalType?: TimelineIntervalType): number {
  switch (intervalType) {
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
