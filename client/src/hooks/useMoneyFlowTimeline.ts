/**
 * Hook for fetching and managing money flow timeline data for Enhanced Race Entrants
 * Story 4.9 implementation - provides real money flow history for timeline grid
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  MoneyFlowDataPoint,
  EntrantMoneyFlowTimeline,
} from '@/types/moneyFlow'

// Server response interface for raw database data
interface ServerMoneyFlowPoint {
  $id: string
  $createdAt: string
  $updatedAt: string
  entrant: string | { entrantId: string; name: string; [key: string]: any } // Can be string or nested object
  eventTimestamp?: string
  pollingTimestamp?: string
  timeToStart?: number
  holdPercentage?: number
  betPercentage?: number
  winPoolAmount?: number
  placePoolAmount?: number
  type?: string
  poolType?: string
  // CONSOLIDATED ODDS DATA (NEW in Story 4.9)
  fixedWinOdds?: number
  fixedPlaceOdds?: number
  poolWinOdds?: number
  poolPlaceOdds?: number
}

export interface TimelineGridData {
  [timeInterval: number]: {
    [entrantId: string]: {
      incrementalAmount: number
      poolType: 'win' | 'place' | 'quinella' | 'trifecta' | 'exacta' | 'first4'
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
  poolType:
    | 'win'
    | 'place'
    | 'quinella'
    | 'trifecta'
    | 'exacta'
    | 'first4' = 'win',
  raceStatus?: string // Add race status to control post-race behavior
): UseMoneyFlowTimelineResult {
  const [timelineData, setTimelineData] = useState<
    Map<string, EntrantMoneyFlowTimeline>
  >(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [forceRefresh, setForceRefresh] = useState(0)

  // Fetch money flow timeline data for all entrants
  const fetchTimelineData = useCallback(async () => {
    if (!raceId || entrantIds.length === 0) return

    // Check race status to avoid unnecessary polling for completed races
    const isRaceComplete =
      raceStatus &&
      ['Final', 'Finalized', 'Abandoned', 'Cancelled'].includes(raceStatus)

    if (isRaceComplete && timelineData.size > 0) {
      // Race is complete and we have timeline data, skip fetch
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Use API route to fetch money flow timeline data
      const response = await fetch(
        `/api/race/${raceId}/money-flow-timeline?entrants=${entrantIds.join(
          ','
        )}`
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch timeline data: ${response.statusText}`)
      }

      const data = await response.json()
      const documents = data.documents || []

      // Log interval coverage analysis if available
      if (data.intervalCoverage) {
      }

      // Log the API response for debugging
      if (data.message) {
      }

      // Handle empty data gracefully
      if (documents.length === 0) {
        setTimelineData(new Map())
        setLastUpdate(new Date())
        return
      }

      // Use unified processing for both bucketed and legacy data
      const entrantDataMap = processTimelineData(
        documents,
        entrantIds,
        poolType,
        data.bucketedData
      )
      setTimelineData(entrantDataMap)
      setLastUpdate(new Date())

      return
      // This code path should no longer be reached due to unified processing above
      console.warn(
        '⚠️ Fallback legacy processing path reached - this should not happen'
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch timeline data'
      )
      console.error('Error fetching money flow timeline:', err)
    } finally {
      setIsLoading(false)
    }
  }, [raceId, entrantIds.join(','), poolType, raceStatus, timelineData.size])

  // Generate timeline grid data optimized for component display
  const gridData = useMemo(() => {
    const grid: TimelineGridData = {}

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
        const incrementalAmount = dataPoint.incrementalAmount || 0

        // Skip if this pool type doesn't match what we're displaying
        const hasValidPoolData =
          (poolType === 'win' && typeof dataPoint.winPoolAmount === 'number') ||
          (poolType === 'place' &&
            typeof dataPoint.placePoolAmount === 'number')

        if (!hasValidPoolData && !dataPoint.poolPercentage) {
          console.log(
            `⚠️ Skipping data point - no valid pool data for ${poolType}:`,
            {
              winPoolAmount: dataPoint.winPoolAmount,
              placePoolAmount: dataPoint.placePoolAmount,
              poolPercentage: dataPoint.poolPercentage,
            }
          )
          continue
        }

        // Use timeInterval if available (bucketed data), otherwise timeToStart (legacy)
        // This ensures compatibility with both data structures
        const interval =
          (dataPoint as any).timeInterval ?? dataPoint.timeToStart

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
    
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '📊 Money flow timeline using fetch-only mode (no subscription)',
        { raceId, entrantIds: entrantIds.length }
      )
    }

    return () => {
      // No subscription cleanup needed - using unified subscription architecture
    }
  }, [raceId, entrantIds.join(','), raceStatus, fetchTimelineData]) // Use entrantIds.join(',') to avoid array reference issues

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
  poolType: string,
  isBucketed: boolean = false
): Map<string, EntrantMoneyFlowTimeline> {
  const entrantDataMap = new Map<string, EntrantMoneyFlowTimeline>()

  for (const entrantId of entrantIds) {
    // Extract entrant ID consistently across all data formats
    const entrantDocs = documents.filter((doc) => {
      const docEntrantId = extractEntrantId(doc.entrant)
      return docEntrantId === entrantId
    })

    if (entrantDocs.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`⚠️ No documents found for entrant ${entrantId}`)
      }
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

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `📊 Processing entrant ${entrantId}: ${entrantDocs.length} documents`
      )
    }

    // Group documents by time interval to handle duplicates
    const intervalMap = new Map<number, ServerMoneyFlowPoint[]>()

    entrantDocs.forEach((doc) => {
      // Use timeInterval if available (bucketed), otherwise timeToStart (legacy)
      const interval = (doc as any).timeInterval ?? doc.timeToStart ?? -999
      if (interval === -999) {
        console.warn(
          `⚠️ Document missing time information for entrant ${entrantId}`
        )
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
        timeInterval: (doc as any).timeInterval || interval,
        intervalType: (doc as any).intervalType || '5m',
        winPoolAmount: doc.winPoolAmount || 0,
        placePoolAmount: doc.placePoolAmount || 0,
        totalPoolAmount: (doc.winPoolAmount || 0) + (doc.placePoolAmount || 0),
        poolPercentage: doc.holdPercentage || doc.betPercentage || 0,
        // Use server pre-calculated incremental amounts directly
        incrementalAmount:
          (doc as any).incrementalWinAmount ||
          (doc as any).incrementalAmount ||
          0,
        incrementalWinAmount: (doc as any).incrementalWinAmount || 0,
        incrementalPlaceAmount: (doc as any).incrementalPlaceAmount || 0,
        pollingInterval: getPollingIntervalFromType((doc as any).intervalType),
        // CONSOLIDATED ODDS DATA (NEW in Story 4.9)
        fixedWinOdds: (doc as any).fixedWinOdds,
        fixedPlaceOdds: (doc as any).fixedPlaceOdds,
        poolWinOdds: (doc as any).poolWinOdds,
        poolPlaceOdds: (doc as any).poolPlaceOdds,
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

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `✅ Processed entrant ${entrantId}: ${timelinePoints.length} timeline points using server pre-calculated data`
      )
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('📊 Timeline processing complete:', {
      entrantsProcessed: entrantDataMap.size,
      totalDataPoints: Array.from(entrantDataMap.values()).reduce(
        (sum, data) => sum + data.dataPoints.length,
        0
      ),
    })
  }

  return entrantDataMap
}

/**
 * Extract entrant ID consistently from various data formats
 */
function extractEntrantId(entrant: any): string {
  if (typeof entrant === 'string') {
    return entrant
  }
  if (entrant && typeof entrant === 'object') {
    return entrant.entrantId || entrant.$id || entrant.id || 'unknown'
  }
  return 'unknown'
}

/**
 * Get polling interval from interval type string
 */
function getPollingIntervalFromType(intervalType?: string): number {
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
