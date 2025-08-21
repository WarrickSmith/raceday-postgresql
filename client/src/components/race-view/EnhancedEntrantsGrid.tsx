'use client'

import { memo, useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { Entrant } from '@/types/meetings'
import {
  // EnhancedGridContext,
  GridSortState,
  SortableColumn,
  PoolViewState,
  DEFAULT_GRID_DISPLAY_CONFIG,
  DEFAULT_POOL_VIEW_STATE,
} from '@/types/enhancedGrid'
import { useAppwriteRealtime } from '@/hooks/useAppwriteRealtime'
import { useRealtimeRace } from '@/hooks/useRealtimeRace'
import { useRacePoolData } from '@/hooks/useRacePoolData'
import { useMoneyFlowTimeline } from '@/hooks/useMoneyFlowTimeline'
import { PoolToggle } from './PoolToggle'
import { useRace } from '@/contexts/RaceContext'
import { screenReader, AriaLabels } from '@/utils/accessibility'
import { useRenderTracking, useMemoryOptimization } from '@/utils/performance'
import { useValueFlash } from '@/hooks/useValueFlash'
import { JockeySilks } from './JockeySilks'
import { getStatusConfig, getStatusBadgeClasses } from '@/utils/raceStatusConfig'

// Flash-enabled Win Odds Cell Component
const WinOddsCell = memo(function WinOddsCell({ 
  entrant, 
  formatOdds 
}: { 
  entrant: Entrant; 
  formatOdds: (odds?: number) => string;
}) {
  const { flashClasses } = useValueFlash(entrant.winOdds)
  
  return (
    <td 
      className={`px-3 py-3 whitespace-nowrap text-right border-r border-gray-200 sticky left-[200px] z-20 ${flashClasses}`} 
      style={{ verticalAlign: 'middle', height: '60px', backgroundColor: flashClasses.includes('bg-') ? undefined : 'white' }}
    >
      <div className="flex items-center justify-end h-full">
        <span className="text-sm font-medium text-gray-900">
          {entrant.isScratched ? '—' : formatOdds(entrant.winOdds)}
        </span>
      </div>
    </td>
  )
})

// Flash-enabled Place Odds Cell Component  
const PlaceOddsCell = memo(function PlaceOddsCell({ 
  entrant, 
  formatOdds 
}: { 
  entrant: Entrant; 
  formatOdds: (odds?: number) => string;
}) {
  const { flashClasses } = useValueFlash(entrant.placeOdds)
  
  return (
    <td 
      className={`px-3 py-3 whitespace-nowrap text-right border-r-2 border-gray-300 sticky left-[280px] z-20 ${flashClasses}`} 
      style={{ verticalAlign: 'middle', height: '60px', backgroundColor: flashClasses.includes('bg-') ? undefined : 'white' }}
    >
      <div className="flex items-center justify-end h-full">
        <span className="text-sm font-medium text-gray-900">
          {entrant.isScratched ? '—' : formatOdds(entrant.placeOdds)}
        </span>
      </div>
    </td>
  )
})

interface TimelineColumn {
  label: string
  interval: number // minutes relative to scheduled start (negative = before, positive = after)
  timestamp: string
  isScheduledStart?: boolean
  isDynamic?: boolean // true for columns added post-scheduled start
}

interface EnhancedEntrantsGridProps {
  initialEntrants: Entrant[]
  raceId: string
  raceStartTime: string
  dataFreshness?: {
    lastUpdated: string
    entrantsDataAge: number
    oddsHistoryCount: number
    moneyFlowHistoryCount: number
  }
  className?: string
  enableMoneyFlowTimeline?: boolean
  enableJockeySilks?: boolean
}

// Enhanced single-component architecture with integrated timeline:
// - Fixed left columns: Runner, Win, Place
// - Scrollable center timeline: Dynamic time-based columns  
// - Fixed right columns: Pool amount and percentage
// All using a single table structure for perfect row alignment

export const EnhancedEntrantsGrid = memo(function EnhancedEntrantsGrid({
  initialEntrants,
  raceId,
  raceStartTime,
  dataFreshness,
  className = '',
  enableMoneyFlowTimeline = true,
  enableJockeySilks = true,
}: EnhancedEntrantsGridProps) {
  const { raceData } = useRace()

  // Use live race data for status synchronization (same as header and footer)
  const { race: liveRace, isConnected: raceConnected } = useRealtimeRace({ 
    initialRace: raceData?.race || {
      $id: raceId || 'fallback',
      raceId: raceId || 'fallback', 
      startTime: raceStartTime,
      status: 'open',
      name: '',
      raceNumber: 0,
      meeting: '',
      distance: undefined,
      trackCondition: undefined,
      $createdAt: '',
      $updatedAt: ''
    }
  })

  // Use context data if available, fallback to props for initial render
  const currentEntrants = raceData?.entrants || initialEntrants
  const currentRaceId = raceData?.race.$id || raceId
  const currentRaceStartTime = liveRace?.startTime || raceData?.race.startTime || raceStartTime
  const currentDataFreshness = raceData?.dataFreshness || dataFreshness

  // Get actual race pool data 
  const { poolData: racePoolData } = useRacePoolData(currentRaceId)
  
  // Pool view state - must be declared before money flow timeline hook
  const [poolViewState, setPoolViewState] = useState<PoolViewState>(
    DEFAULT_POOL_VIEW_STATE
  )
  
  // Get money flow timeline data for all entrants
  const entrantIds = useMemo(() => currentEntrants.map(e => e.$id), [currentEntrants])
  const { timelineData, isLoading: timelineLoading, error: timelineError } = useMoneyFlowTimeline(
    currentRaceId,
    entrantIds,
    poolViewState.activePool
  )
  
  // Debug: Track pool toggle changes
  console.log('🎯 Pool view state changed:', {
    activePool: poolViewState.activePool,
    timelineDataSize: timelineData?.size || 0,
    entrantsCount: currentEntrants.length
  })

  // Debug logging for entrants updates (can be removed in production)
  // console.log('🏃 EnhancedEntrantsGrid render:', {
  //   raceDataExists: !!raceData,
  //   contextEntrantsCount: raceData?.entrants?.length,
  //   initialEntrantsCount: initialEntrants.length,
  //   currentEntrantsCount: currentEntrants.length,
  //   raceId: currentRaceId
  // });
  const [showPerformancePanel, setShowPerformancePanel] = useState(false)
  const [updateNotifications, setUpdateNotifications] = useState(true)
  const [selectedEntrant, setSelectedEntrant] = useState<string | undefined>()
  
  // Timeline-related state
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [maxPostStartMinutes, setMaxPostStartMinutes] = useState(0) // Track max columns shown
  const [hasShownPostStartColumns, setHasShownPostStartColumns] = useState(false) // Track if we've ever shown post-start columns

  // Enhanced grid state
  const [displayConfig] = useState({
    ...DEFAULT_GRID_DISPLAY_CONFIG,
    showJockeySilks: enableJockeySilks,
    showMoneyFlowColumns: enableMoneyFlowTimeline,
  })

  const [sortState, setSortState] = useState<GridSortState>({
    column: 'winOdds',
    direction: 'asc', // Default: lowest to highest odds (favorites first)
    isLoading: false,
  })

  // Performance and memory optimization
  const renderCount = useRenderTracking('EnhancedEntrantsGrid')
  const { triggerCleanup, getMemoryReport } = useMemoryOptimization()

  const realtimeResult = useAppwriteRealtime({
    raceId: currentRaceId,
    initialEntrants:
      currentEntrants && currentEntrants.length > 0
        ? currentEntrants
        : initialEntrants,
  })

  const {
    entrants: realtimeEntrants,
    isConnected,
    connectionAttempts,
    lastUpdate,
    updateLatency,
    totalUpdates,
    reconnect,
    clearHistory,
  } = realtimeResult

  // IMPORTANT: Use currentEntrants (from context) as base to preserve data flow
  // Real-time entrants are used only for updating live fields (odds, scratch status) in calculations
  // This prevents calculated pool data from being overwritten by real-time updates
  const baseEntrants = currentEntrants && currentEntrants.length > 0 ? currentEntrants : initialEntrants
  
  // Merge real-time updates into base entrants for live odds data
  const entrants = useMemo(() => {
    if (!realtimeEntrants || realtimeEntrants.length === 0) {
      console.log('📡 Using base entrants (no real-time data)')
      return baseEntrants
    }
    
    console.log('🔄 Merging real-time data:', {
      baseEntrantsCount: baseEntrants.length,
      realtimeEntrantsCount: realtimeEntrants.length,
      totalUpdates
    })
    
    // Create a map of real-time entrants for quick lookup
    const realtimeMap = new Map(realtimeEntrants.map(e => [e.$id, e]))
    
    // Merge real-time data with base entrants, prioritizing live odds data
    return baseEntrants.map(baseEntrant => {
      const realtimeEntrant = realtimeMap.get(baseEntrant.$id)
      if (realtimeEntrant) {
        // Merge real-time fields while preserving base entrant structure
        return {
          ...baseEntrant,
          winOdds: realtimeEntrant.winOdds ?? baseEntrant.winOdds,
          placeOdds: realtimeEntrant.placeOdds ?? baseEntrant.placeOdds,
          isScratched: realtimeEntrant.isScratched ?? baseEntrant.isScratched,
          holdPercentage: realtimeEntrant.holdPercentage ?? baseEntrant.holdPercentage,
          moneyFlowTrend: realtimeEntrant.moneyFlowTrend ?? baseEntrant.moneyFlowTrend,
          // Preserve any calculated fields that might exist
          poolMoney: baseEntrant.poolMoney,
          moneyFlowTimeline: baseEntrant.moneyFlowTimeline
        }
      }
      return baseEntrant
    })
  }, [baseEntrants, realtimeEntrants])

  // Validation function to check if timeline amounts sum to total pool
  const validateTimelineSummation = useCallback((entrant: any) => {
    if (!entrant.moneyFlowTimeline || !entrant.poolMoney) return true;
    
    const timeline = entrant.moneyFlowTimeline;
    if (!timeline.dataPoints || timeline.dataPoints.length === 0) return true;
    
    // Sum all incremental amounts for this entrant
    const timelineSum = timeline.dataPoints.reduce((sum: number, point: any) => {
      return sum + (point.incrementalAmount || 0);
    }, 0);
    
    // Compare with current pool total for this entrant
    const poolTotal = entrant.poolMoney.total || 0;
    const difference = Math.abs(timelineSum - poolTotal);
    const tolerance = poolTotal * 0.05; // 5% tolerance
    
    if (difference > tolerance && poolTotal > 100) { // Only flag significant discrepancies
      console.warn(`⚠️ Timeline summation mismatch for ${entrant.name}: timeline sum=${timelineSum}, pool total=${poolTotal}, difference=${difference}`);
      return false;
    }
    
    return true;
  }, []);

  // Calculate pool money for each entrant using actual timeline data and pool data
  const entrantsWithPoolData = useMemo(() => {
    if (!entrants || entrants.length === 0) return []
    
    console.log('🔍 Pool calculation debug:', {
      entrantsCount: entrants.length,
      timelineDataAvailable: timelineData?.size > 0,
      racePoolDataAvailable: !!racePoolData,
      sampleEntrant: entrants[0] ? {
        id: entrants[0].$id,
        name: entrants[0].name,
        holdPercentage: entrants[0].holdPercentage,
        isScratched: entrants[0].isScratched
      } : null
    })
    
    return entrants.map(entrant => {
      if (entrant.isScratched) {
        console.log(`🐴 Scratched entrant ${entrant.name} (${entrant.runnerNumber}) - returning unchanged`)
        return {
          ...entrant,
          moneyFlowTimeline: undefined // No timeline for scratched entrants
        }
      }
      
      // Get timeline data for this entrant
      const entrantTimeline = timelineData?.get(entrant.$id) || undefined
      
      // Use real timeline data for pool calculations - prioritize latest percentage from timeline
      let poolPercentage: number = 0
      let useRealTimelineData = false
      
      if (entrantTimeline && entrantTimeline.dataPoints.length > 0) {
        // Use the latest percentage from the timeline data which is already calculated
        poolPercentage = entrantTimeline.latestPercentage
        useRealTimelineData = true
        console.log(`💰 Using real timeline latestPercentage for ${entrant.name} (${entrant.runnerNumber}): ${poolPercentage}%`)
      } else if (entrant.holdPercentage && entrant.holdPercentage > 0) {
        // Fallback to entrant's current holdPercentage (must be > 0 to avoid navigation mode defaults)
        poolPercentage = entrant.holdPercentage
        console.log(`📊 Using entrant holdPercentage for ${entrant.name} (${entrant.runnerNumber}): ${poolPercentage}%`)
      } else {
        // No real data available yet - don't show dummy values, skip this entrant for now
        console.log(`⚠️ No real data available for ${entrant.name} (${entrant.runnerNumber}), skipping pool calculation until comprehensive data loads`)
        return {
          ...entrant,
          moneyFlowTimeline: entrantTimeline,
          poolMoney: undefined // Don't show dummy data
        }
      }
      
      // Calculate individual pool contributions based on pool percentage
      const holdPercentageDecimal = poolPercentage / 100
      const winPoolInDollars = Math.round((racePoolData?.winPoolTotal || 0) / 100) 
      const placePoolInDollars = Math.round((racePoolData?.placePoolTotal || 0) / 100)
      const winPoolContribution = winPoolInDollars * holdPercentageDecimal
      const placePoolContribution = placePoolInDollars * holdPercentageDecimal
      const totalPoolContribution = winPoolContribution + placePoolContribution
      
      console.log(`💰 Pool calculation for ${entrant.name} (${entrant.runnerNumber}):`, {
        poolPercentage: poolPercentage,
        winPoolContribution: winPoolContribution.toFixed(0),
        placePoolContribution: placePoolContribution.toFixed(0),
        totalPoolContribution: totalPoolContribution.toFixed(0),
        timelineDataPoints: entrantTimeline?.dataPoints.length || 0,
        useRealTimelineData: useRealTimelineData,
        timelineTrend: entrantTimeline?.trend || 'none'
      })
      
      const entrantWithPoolData = {
        ...entrant,
        moneyFlowTimeline: entrantTimeline, // Add timeline data to entrant
        poolMoney: {
          win: winPoolContribution,
          place: placePoolContribution,
          total: totalPoolContribution,
          percentage: poolPercentage
        }
      };
      
      // Validate timeline summation for debugging
      validateTimelineSummation(entrantWithPoolData);
      
      // Special debugging for "Wal" entrant
      if (entrant.name.toLowerCase().includes('wal')) {
        console.log(`🔍 DEBUG "Wal" entrant:`, {
          name: entrant.name,
          runnerNumber: entrant.runnerNumber,
          poolPercentage,
          poolMoney: entrantWithPoolData.poolMoney,
          timelineDataPoints: entrantTimeline?.dataPoints?.length || 0,
          sampleTimelinePoint: entrantTimeline?.dataPoints?.[0] || null,
          timelineTrend: entrantTimeline?.trend || 'none'
        });
      }
      
      return entrantWithPoolData;
    })
  }, [entrants, racePoolData, timelineData, poolViewState.activePool, validateTimelineSummation])

  // Debug logging removed - entrants data structure verified

  // Sorting logic - applied to all three components to maintain alignment
  const sortedEntrants = useMemo(() => {
    if (!entrantsWithPoolData || entrantsWithPoolData.length === 0) return []

    const sorted = [...entrantsWithPoolData].sort((a, b) => {
      // Ensure scratched entrants always sort to the end (stable and explicit)
      if (a.isScratched && !b.isScratched) return 1
      if (!a.isScratched && b.isScratched) return -1
      if (a.isScratched && b.isScratched) {
        // Sort scratched runners by runner number for consistency
        return a.runnerNumber - b.runnerNumber
      }

      // Use explicit numeric sentinel values for missing odds to ensure deterministic ordering
      let aValue: number
      let bValue: number

      switch (sortState.column) {
        case 'winOdds':
          aValue =
            typeof a.winOdds === 'number' ? a.winOdds : Number.POSITIVE_INFINITY
          bValue =
            typeof b.winOdds === 'number' ? b.winOdds : Number.POSITIVE_INFINITY
          break
        case 'placeOdds':
          aValue =
            typeof a.placeOdds === 'number'
              ? a.placeOdds
              : Number.POSITIVE_INFINITY
          bValue =
            typeof b.placeOdds === 'number'
              ? b.placeOdds
              : Number.POSITIVE_INFINITY
          break
        case 'runnerNumber':
          aValue = a.runnerNumber
          bValue = b.runnerNumber
          break
        case 'holdPercentage':
          aValue =
            typeof a.holdPercentage === 'number'
              ? a.holdPercentage
              : Number.NEGATIVE_INFINITY
          bValue =
            typeof b.holdPercentage === 'number'
              ? b.holdPercentage
              : Number.NEGATIVE_INFINITY
          break
        default:
          aValue = a.runnerNumber
          bValue = b.runnerNumber
      }

      const result = aValue - bValue
      return sortState.direction === 'asc' ? result : -result
    })

    return sorted
  }, [entrantsWithPoolData, sortState])

  // Update current time for dynamic timeline updates
  // More frequent updates near race start time, but pause for final races
  useEffect(() => {
    const raceStatus = liveRace?.status || 'Open'
    
    // Don't update time frequently for completed races
    if (['Final', 'Closed'].includes(raceStatus)) {
      const timer = setInterval(() => {
        setCurrentTime(new Date())
      }, 300000) // Update every 5 minutes for completed races
      
      return () => clearInterval(timer)
    }

    const raceStart = new Date(currentRaceStartTime)
    const current = new Date()
    const timeToRace = (raceStart.getTime() - current.getTime()) / (1000 * 60) // minutes

    // Determine update frequency based on proximity to race start for active races
    let updateInterval = 60000 // Default: 1 minute
    if (timeToRace <= 5 && timeToRace >= -5) {
      updateInterval = 15000 // 15 seconds near race start
    } else if (timeToRace <= 10 && timeToRace >= -10) {
      updateInterval = 30000 // 30 seconds within 10 minutes
    }

    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, updateInterval)

    return () => clearInterval(timer)
  }, [currentRaceStartTime, liveRace?.status])

  // Generate timeline columns based on current time and race status
  const timelineColumns = useMemo(() => {
    const raceStart = new Date(currentRaceStartTime)
    const current = currentTime
    const timeToRaceMs = raceStart.getTime() - current.getTime()
    const timeToRaceMinutes = Math.floor(timeToRaceMs / (1000 * 60))
    const raceStatus = liveRace?.status || 'Open'
    
    // Race status sync verified - using real-time race status

    // Pre-scheduled timeline milestones (always show these)
    const preScheduledMilestones = [
      -60, -55, -50, -45, -40, -35, -30, -25, -20, -15, -10, -5, -4, -3, -2, -1,
      -0.5, 0,
    ]

    const columns: TimelineColumn[] = []

    // Add pre-scheduled milestones
    preScheduledMilestones.forEach((interval) => {
      const timestamp = new Date(raceStart.getTime() + interval * 60 * 1000)
      let label: string
      if (interval === 0) {
        label = '0 (Start)'
      } else if (interval === -0.5) {
        label = '-30s'
      } else {
        label = `${interval}m`
      }

      columns.push({
        label,
        interval,
        timestamp: timestamp.toISOString(),
        isScheduledStart: interval === 0,
        isDynamic: false,
      })
    })

    // Add post-scheduled columns:
    // 1. For Open races: Add dynamic columns in real-time as time progresses
    // 2. For closed/interim/final races: Show static columns up to actual race end, but don't add new ones
    // 3. Columns persist once added (timeline doesn't shrink)
    const allowDynamicColumns = raceStatus === 'Open' && timeToRaceMinutes < 0
    const shouldShowPostStartColumns =
      allowDynamicColumns ||
      (raceData?.race?.actualStart && ['Final', 'Interim', 'Closed'].includes(raceStatus)) ||
      (hasShownPostStartColumns && ['Final', 'Interim', 'Closed'].includes(raceStatus)) // Persist columns for closed races

    if (shouldShowPostStartColumns) {
      let postStartMinutes: number

      if (allowDynamicColumns) {
        // For open races, use current time relative to scheduled start and update max
        postStartMinutes = Math.abs(timeToRaceMinutes)
        setMaxPostStartMinutes(prev => Math.max(prev, postStartMinutes))
        setHasShownPostStartColumns(true) // Mark that we've shown post-start columns
      } else {
        // For closed races, use the maximum that was previously shown to persist columns
        if (raceData?.race?.actualStart) {
          const actualStartTime = new Date(raceData.race.actualStart)
          const scheduledStartTime = new Date(currentRaceStartTime)
          const actualPostStartMinutes = Math.max(
            0,
            (actualStartTime.getTime() - scheduledStartTime.getTime()) /
              (1000 * 60)
          )
          // Use the maximum of actual time or previously shown columns
          postStartMinutes = Math.max(maxPostStartMinutes, actualPostStartMinutes)
        } else {
          // If no actualStart, just use the max we've shown so far
          postStartMinutes = maxPostStartMinutes
        }
      }

      // Add 30-second intervals for first 2 minutes, then minute intervals
      const dynamicIntervals: number[] = []

      // 30-second intervals for first 2 minutes
      if (postStartMinutes <= 2) {
        const thirtySecondIntervals = Math.floor(postStartMinutes * 2) // 2 intervals per minute
        for (let i = 1; i <= thirtySecondIntervals; i++) {
          dynamicIntervals.push(i * 0.5) // 0.5, 1.0, 1.5, 2.0, etc.
        }
      }

      // Then minute intervals
      if (postStartMinutes > 2) {
        // Add the 30-second intervals for first 2 minutes
        dynamicIntervals.push(0.5, 1.0, 1.5, 2.0)

        // Add minute intervals from 3 minutes onwards
        const additionalMinutes = Math.floor(postStartMinutes) - 2
        for (let i = 1; i <= additionalMinutes && i <= 10; i++) {
          // Cap at 10 additional minutes
          dynamicIntervals.push(2 + i)
        }
      }

      // Add post-start columns (dynamic for open races, static for closed races)
      dynamicIntervals.forEach((interval) => {
        const timestamp = new Date(raceStart.getTime() + interval * 60 * 1000)
        const label =
          interval < 1 ? `+${(interval * 60).toFixed(0)}s` : `+${interval}m`

        columns.push({
          label,
          interval,
          timestamp: timestamp.toISOString(),
          isScheduledStart: false,
          isDynamic: allowDynamicColumns, // Only mark as dynamic for open races
        })
      })
    }

    return columns.sort((a, b) => a.interval - b.interval)
  }, [currentRaceStartTime, raceData?.race?.actualStart, raceData?.race?.status, currentTime])

  // Auto-scroll to show current time position
  useEffect(() => {
    if (!autoScroll || !scrollContainerRef.current) return

    const container = scrollContainerRef.current
    const raceStart = new Date(currentRaceStartTime)
    const currentInterval =
      (currentTime.getTime() - raceStart.getTime()) / (1000 * 60)

    // Find the column that represents the current time
    const currentColumnIndex = timelineColumns.findIndex(
      (col) => col.interval >= currentInterval
    )

    if (currentColumnIndex > 0) {
      const columnWidth = 80 // Approximate column width
      const scrollPosition = (currentColumnIndex - 2) * columnWidth // Center current time

      container.scrollTo({
        left: Math.max(0, scrollPosition),
        behavior: 'smooth',
      })
    }
  }, [timelineColumns, currentRaceStartTime, autoScroll, currentTime])

  // Get data for specific timeline point - shows incremental money amounts since previous time point
  const getTimelineData = useCallback((entrantId: string, interval: number): string => {
    const entrant = sortedEntrants.find((e) => e.$id === entrantId)
    if (!entrant || entrant.isScratched) return '—'

    // Check if this is a future time column (no data exists yet)
    const raceStart = new Date(currentRaceStartTime)
    const currentTimestamp = currentTime.getTime()
    const currentIntervalMinutes = (currentTimestamp - raceStart.getTime()) / (1000 * 60)
    
    // For live races: If this interval is in the future (more than current time), show placeholder
    // For completed races: Show all timeline data regardless of current time
    console.log(`⏰ Timeline check: interval=${interval}, currentIntervalMinutes=${currentIntervalMinutes}, raceFinished=${currentIntervalMinutes > 0}`)
    if (currentIntervalMinutes <= 0 && interval > currentIntervalMinutes) {
      return '—'
    }

    // Check if we have timeline data available from the money flow timeline
    const entrantTimeline = timelineData?.get(entrant.$id)
    if (entrantTimeline && entrantTimeline.dataPoints && entrantTimeline.dataPoints.length > 0) {
      console.log(`📊 Processing timeline for entrant ${entrant.name}: ${entrantTimeline.dataPoints.length} data points, interval=${interval}`)
      console.log(`📊 Sample data points:`, entrantTimeline.dataPoints.slice(0, 2).map(p => ({ timeToStart: p.timeToStart, winPoolAmount: p.winPoolAmount, placePoolAmount: p.placePoolAmount })))
      
      // Sort data points by timeToStart for proper chronological order
      const sortedDataPoints = [...entrantTimeline.dataPoints].sort((a, b) => {
        // Sort by timeToStart descending (closer to race start = lower timeToStart values)
        const aTime = a.timeToStart !== undefined ? a.timeToStart : Infinity
        const bTime = b.timeToStart !== undefined ? b.timeToStart : Infinity
        return bTime - aTime // Descending order
      })
      
      console.log(`📊 Sorted data points for ${entrant.name}:`, sortedDataPoints.slice(0, 3).map(p => ({ timeToStart: p.timeToStart, winPoolAmount: p.winPoolAmount })))
      
      // Find the data point that matches this timeline interval
      // Look for timeToStart values that are close to the negative of our interval
      // (interval is negative minutes before start, timeToStart is positive minutes before start)
      const targetTimeToStart = Math.abs(interval)
      console.log(`📊 Looking for timeline data at interval=${interval} (targetTimeToStart=${targetTimeToStart})`)
      let bestMatch = null
      let bestTimeDiff = Infinity
      
      for (const point of sortedDataPoints) {
        if (point.timeToStart !== undefined) {
          const timeDiff = Math.abs(point.timeToStart - targetTimeToStart)
          // Increased tolerance to 10 minutes and added debug logging
          if (timeDiff < bestTimeDiff && timeDiff <= 10) { 
            bestTimeDiff = timeDiff
            bestMatch = point
            console.log(`🎯 Timeline match found: interval=${interval}, targetTimeToStart=${targetTimeToStart}, pointTimeToStart=${point.timeToStart}, timeDiff=${timeDiff}`)
          }
        }
      }
      
      if (bestMatch) {
        // Calculate pool amount based on current pool type selection
        const poolType = poolViewState.activePool
        let currentAmount = 0
        
        if (poolType === 'win' && bestMatch.winPoolAmount !== undefined) {
          currentAmount = bestMatch.winPoolAmount
        } else if (poolType === 'place' && bestMatch.placePoolAmount !== undefined) {
          currentAmount = bestMatch.placePoolAmount
        } else {
          // Fallback: use win + place as total
          const winAmount = bestMatch.winPoolAmount || 0
          const placeAmount = bestMatch.placePoolAmount || 0
          currentAmount = winAmount + placeAmount
        }
        
        // Find the chronologically previous data point (by timeToStart, not by index)
        // Sort by timeToStart descending to find the point that occurred before this one chronologically
        const chronologicallyPrevious = sortedDataPoints.find(point => 
          point.timeToStart !== undefined && 
          point.timeToStart > bestMatch.timeToStart && // Greater timeToStart = further from race start = chronologically earlier
          point.$id !== bestMatch.$id
        )
        
        if (chronologicallyPrevious) {
          // Calculate previous pool amount for comparison
          let previousAmount = 0
          if (poolType === 'win' && chronologicallyPrevious.winPoolAmount !== undefined) {
            previousAmount = chronologicallyPrevious.winPoolAmount
          } else if (poolType === 'place' && chronologicallyPrevious.placePoolAmount !== undefined) {
            previousAmount = chronologicallyPrevious.placePoolAmount
          } else {
            const winAmount = chronologicallyPrevious.winPoolAmount || 0
            const placeAmount = chronologicallyPrevious.placePoolAmount || 0
            previousAmount = winAmount + placeAmount
          }
          
          // Calculate incremental change - ensure we're showing flow toward pool, not away
          const incrementalAmount = currentAmount - previousAmount
          
          // Validation: For timeline display, we should generally see positive incremental amounts
          // as money flows into the pool. Negative amounts should be rare and significant
          console.log(`💰 ${entrant.name} at ${interval}m: current=${currentAmount}, previous=${previousAmount}, incremental=${incrementalAmount}`)
          
          // Special logging for "Wal" entrant to debug specific issues
          if (entrant.name.toLowerCase().includes('wal')) {
            console.log(`🔍 WAL DEBUG at ${interval}m:`, {
              name: entrant.name,
              poolType: poolViewState.activePool,
              currentAmount,
              previousAmount,
              incrementalAmount,
              bestMatchTimeToStart: bestMatch.timeToStart,
              chronologicallyPreviousTimeToStart: chronologicallyPrevious?.timeToStart
            });
          }
          
          if (Math.abs(incrementalAmount) < 1) { // Less than $1 difference
            return '$0'
          } else if (incrementalAmount > 0) {
            return `+$${Math.round(incrementalAmount).toLocaleString()}`
          } else {
            // Negative values - show but mark as unusual for non-Wal debugging
            if (entrant.name.toLowerCase().includes('wal')) {
              console.warn(`⚠️ Negative value for ${entrant.name} at ${interval}m: ${incrementalAmount}`);
            }
            return `-$${Math.round(Math.abs(incrementalAmount)).toLocaleString()}`
          }
        } else {
          // First data point - show the total as initial amount if significant
          if (currentAmount > 0) {
            return `$${Math.round(currentAmount).toLocaleString()}`
          }
        }
      }
    }

    // For past intervals where no timeline data exists, show dash
    return '—'
  }, [sortedEntrants, currentRaceStartTime, currentTime, timelineData, poolViewState.activePool])

  // Determine if column should be highlighted (current time)
  const isCurrentTimeColumn = useCallback((interval: number): boolean => {
    const raceStart = new Date(currentRaceStartTime)
    const currentInterval =
      (currentTime.getTime() - raceStart.getTime()) / (1000 * 60)

    // Highlight if within 30 seconds of this interval
    return Math.abs(currentInterval - interval) <= 0.5
  }, [currentRaceStartTime, currentTime])

  // Utility functions
  const formatOdds = useCallback((odds?: number) => {
    if (odds === undefined || odds === null) return '—'
    return odds.toFixed(2)
  }, [])

  const formatMoney = useCallback((amount?: number) => {
    if (!amount) return '—'
    // Pool amounts are calculated from cents, so round to nearest dollar for display
    const rounded = Math.round(amount)
    return `$${rounded.toLocaleString()}`
  }, [])

  const formatPercentage = useCallback((percentage?: number) => {
    if (percentage === undefined || percentage === null) return '—'
    return `${Math.round(percentage)}%`
  }, [])

  // Get pool amount for the currently selected pool type
  const getPoolAmount = useCallback((entrant: Entrant): number | undefined => {
    if (!entrant.poolMoney) return undefined // Return undefined when no real data yet
    
    switch (poolViewState.activePool) {
      case 'win':
        return entrant.poolMoney.win || 0
      case 'place':
        return entrant.poolMoney.place || 0
      default:
        return entrant.poolMoney.total || 0
    }
  }, [poolViewState.activePool])

  // Get pool percentage for the currently selected pool type
  const getPoolPercentage = useCallback((entrant: Entrant): number | undefined => {
    if (entrant.isScratched) return 0
    
    // Return undefined if no pool money data available yet (avoid showing dummy percentages)
    if (!entrant.poolMoney) return undefined
    
    // Calculate percentage based on selected pool type
    switch (poolViewState.activePool) {
      case 'win':
        // Calculate percentage of win pool
        const totalWinPool = entrantsWithPoolData.reduce((sum, e) => 
          !e.isScratched && e.poolMoney ? sum + (e.poolMoney.win || 0) : sum, 0)
        return totalWinPool > 0 ? ((entrant.poolMoney.win || 0) / totalWinPool) * 100 : 0
      
      case 'place':
        // Calculate percentage of place pool
        const totalPlacePool = entrantsWithPoolData.reduce((sum, e) => 
          !e.isScratched && e.poolMoney ? sum + (e.poolMoney.place || 0) : sum, 0)
        return totalPlacePool > 0 ? ((entrant.poolMoney.place || 0) / totalPlacePool) * 100 : 0
      
      default:
        // Default to existing percentage calculation
        return entrant.poolMoney.percentage || 0
    }
  }, [poolViewState.activePool, entrantsWithPoolData])


  // Handle pool toggle changes
  const handlePoolChange = useCallback(
    (pool: typeof poolViewState.activePool) => {
      setPoolViewState((prev) => ({
        ...prev,
        activePool: pool,
      }))
    },
    [poolViewState]
  )

  const handleDisplayModeChange = useCallback(
    (mode: typeof poolViewState.displayMode) => {
      setPoolViewState((prev) => ({
        ...prev,
        displayMode: mode,
      }))
    },
    [poolViewState]
  )

  // Handle entrant selection
  const handleEntrantClick = useCallback((entrantId: string) => {
    setSelectedEntrant((prev) => (prev === entrantId ? undefined : entrantId))
    const entrant = sortedEntrants.find((e) => e.$id === entrantId)
    if (entrant) {
      screenReader?.announce(
        `Selected ${entrant.name}, runner number ${entrant.runnerNumber}`,
        'polite'
      )
    }
  }, [sortedEntrants])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, entrantId: string) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleEntrantClick(entrantId)
      }
    },
    [handleEntrantClick]
  )

  const togglePerformancePanel = useCallback(() => {
    setShowPerformancePanel((prev) => !prev)
  }, [])

  // Handle column sorting
  const handleSort = useCallback((column: SortableColumn) => {
    setSortState((prev) => ({
      ...prev,
      column,
      direction:
        prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
      isLoading: false,
    }))
  }, [])

  if (sortedEntrants.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-gray-600 text-sm text-center">
            No entrants found for this race.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`enhanced-entrants-grid bg-white rounded-lg shadow-md h-full flex flex-col ${className}`}
    >
      {/* Enhanced Header with Pool Toggle */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Enhanced Race Entrants ({sortedEntrants.length})
          </h2>
          <div className="flex items-center space-x-3">
            {currentDataFreshness && (
              <div className="text-xs text-gray-500">
                Data: {Math.round(currentDataFreshness.entrantsDataAge / 60)}min
                ago
              </div>
            )}

            <button
              onClick={togglePerformancePanel}
              className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
            >
              📊 Stats
            </button>

            <div className="flex items-center space-x-2">
              <span
                className={`text-xs px-2 py-1 rounded-full transition-colors ${
                  isConnected
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}
                aria-live="polite"
              >
                {isConnected ? '🔄 Live' : '📶 Disconnected'}
              </span>

              {!isConnected && connectionAttempts > 0 && (
                <button
                  onClick={reconnect}
                  className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
                >
                  🔄 Retry
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Pool Toggle Controls */}
        <PoolToggle
          poolViewState={poolViewState}
          onPoolChange={handlePoolChange}
          onDisplayModeChange={handleDisplayModeChange}
          className="mb-4"
        />

        {/* Performance Panel */}
        {showPerformancePanel && (
          <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-3 border border-gray-200 mb-4">
            <div className="flex justify-between items-center">
              <h3 className="font-medium text-gray-900">
                Enhanced Performance
              </h3>
              <div className="flex space-x-2">
                <button
                  onClick={clearHistory}
                  className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
                >
                  Clear History
                </button>
                <button
                  onClick={() => {
                    const report = getMemoryReport()
                    console.log('📊 Memory Report:', report)
                    alert(
                      `Memory Report:\n\nMemory Usage: ${
                        report.memory.currentMemory
                          ? (
                              report.memory.currentMemory
                                .memoryUsagePercentage * 100
                            ).toFixed(1) + '%'
                          : 'N/A'
                      }\n\nRecommendations:\n${report.recommendations.join(
                        '\n'
                      )}`
                    )
                  }}
                  className="text-xs px-2 py-1 rounded bg-blue-200 text-blue-700 hover:bg-blue-300 transition-colors"
                >
                  Memory Report
                </button>
                <button
                  onClick={triggerCleanup}
                  className="text-xs px-2 py-1 rounded bg-orange-200 text-orange-700 hover:bg-orange-300 transition-colors"
                >
                  Cleanup
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-gray-500">Connection</div>
                <div
                  className={`font-medium ${
                    isConnected ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {isConnected ? 'Connected' : 'Disconnected'}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Updates</div>
                <div className="font-medium text-blue-600">
                  {totalUpdates} total
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Latency</div>
                <div className="font-medium text-blue-600">
                  {updateLatency.toFixed(1)}ms
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Grid State</div>
                <div className="font-medium text-purple-600">
                  Sort: {sortState.column} {sortState.direction}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Renders</div>
                <div className="font-medium text-indigo-600">
                  #{renderCount}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Pool View</div>
                <div className="font-medium text-indigo-600">
                  {poolViewState.activePool} / {poolViewState.displayMode}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Single-Table Grid Architecture with Perfect Row Alignment */}
      <div className="flex-1 overflow-hidden bg-white border border-gray-200 rounded-lg flex flex-col">
        {/* Timeline Controls */}
        <div className="flex items-center justify-between p-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-sm font-medium text-gray-900">
            Money Flow Timeline ({timelineColumns.length} points)
          </h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                autoScroll
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-200 text-gray-600'
              }`}
              title={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
            >
              {autoScroll ? '🔄 Auto' : '⏸️ Manual'}
            </button>
            <span className={getStatusBadgeClasses(liveRace?.status, 'small')}>
              {getStatusConfig(liveRace?.status).label}
            </span>
          </div>
        </div>

        {/* Single Table with Combined Horizontal and Vertical Scrolling */}
        <div className="flex-1 relative min-h-0">
          <div 
            ref={scrollContainerRef}
            className="absolute inset-0 overflow-auto"
          >
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              {/* Column Groups for Layout Control */}
              <colgroup>
                {/* Fixed Left Columns */}
                <col style={{ width: '200px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '80px' }} />
                
                {/* Timeline Columns */}
                {timelineColumns.map((column) => (
                  <col key={`col_${column.interval}`} style={{ width: '80px' }} />
                ))}
                
                {/* Fixed Right Columns */}
                <col style={{ width: '100px' }} />
                <col style={{ width: '80px' }} />
              </colgroup>

              {/* Unified Header */}
              <thead className="bg-gray-50">
                <tr style={{ height: '60px' }}>
                  {/* Left Fixed Headers - Sticky */}
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-r border-gray-200 sticky left-0 top-0 z-30" style={{ backgroundColor: '#f9fafb' }}>
                    Runner
                  </th>
                  <th
                    className={`px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 border-r border-gray-200 sticky left-[200px] top-0 z-30 ${
                      sortState?.column === 'winOdds' ? 'bg-blue-50' : ''
                    }`}
                    style={{ backgroundColor: sortState?.column === 'winOdds' ? '#eff6ff' : '#f9fafb' }}
                    onClick={() => handleSort('winOdds')}
                    title="Click to sort by Win odds"
                  >
                    <div className="flex items-center justify-end">
                      <span>Win</span>
                      {sortState?.column === 'winOdds' && (
                        <span className="ml-1">
                          {sortState.direction === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wider border-r-2 border-gray-300 sticky left-[280px] top-0 z-30" style={{ backgroundColor: '#f9fafb' }}>
                    Place
                  </th>

                  {/* Timeline Headers */}
                  {timelineColumns.map((column) => (
                    <th
                      key={`header_${column.interval}`}
                      className={`px-2 py-2 text-xs font-medium text-gray-700 text-center border-r border-gray-200 sticky top-0 z-20 ${
                        isCurrentTimeColumn(column.interval)
                          ? 'border-green-300 shadow-sm'
                          : column.isScheduledStart
                          ? 'border-blue-300'
                          : ''
                      }`}
                      style={{
                        backgroundColor: isCurrentTimeColumn(column.interval)
                          ? '#dcfce7'
                          : column.isScheduledStart
                          ? '#dbeafe'
                          : column.isDynamic
                          ? '#fefce8'
                          : '#f9fafb'
                      }}
                      title={`${column.label} - ${new Date(column.timestamp).toLocaleTimeString()}`}
                    >
                      <div className="flex flex-col items-center justify-center" style={{ height: '60px' }}>
                        <span className="font-medium text-xs">{column.label}</span>
                        <span className="text-[9px] text-gray-500">
                          {new Date(column.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {column.isDynamic && (
                          <span className="text-[8px] text-yellow-600 font-medium">LIVE</span>
                        )}
                      </div>
                    </th>
                  ))}

                  {/* Right Fixed Headers - Sticky */}
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wider border-l-2 border-gray-300 border-r border-gray-200 sticky right-[80px] top-0 z-30" style={{ backgroundColor: '#f9fafb' }}>
                    Pool
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wider sticky right-0 top-0 z-30" style={{ backgroundColor: '#f9fafb' }}>
                    Pool %
                  </th>
                </tr>
              </thead>

              {/* Unified Body */}
              <tbody className="bg-white divide-y divide-gray-100">
                {sortedEntrants.map((entrant) => (
                  <tr
                    key={entrant.$id}
                    className={`hover:bg-gray-50 focus-within:bg-blue-50 transition-colors ${
                      entrant.isScratched ? 'opacity-50 bg-pink-50' : ''
                    } ${selectedEntrant === entrant.$id ? 'bg-blue-100' : ''} cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset`}
                    onClick={() => handleEntrantClick(entrant.$id)}
                    onKeyDown={(e) => handleKeyDown(e, entrant.$id)}
                    tabIndex={0}
                    style={{ height: '60px', minHeight: '60px', maxHeight: '60px' }}
                    aria-label={AriaLabels.generateRunnerRowLabel(
                      entrant.runnerNumber,
                      entrant.name,
                      entrant.jockey || 'Unknown jockey',
                      entrant.trainerName || 'Unknown trainer',
                      entrant.winOdds,
                      entrant.placeOdds,
                      entrant.isScratched
                    )}
                  >
                    {/* Left Fixed Columns - Sticky */}
                    <td className="px-3 py-3 whitespace-nowrap border-r border-gray-200 sticky left-0 bg-white z-20" style={{ verticalAlign: 'middle', height: '60px' }}>
                      <div className="flex items-center space-x-3 h-full">
                        <div className="flex items-center space-x-2">
                          {displayConfig.showJockeySilks && (
                            <JockeySilks
                              silk={entrant.silk}
                              runnerNumber={entrant.runnerNumber}
                              runnerName={entrant.name}
                              jockey={entrant.jockey}
                              fallbackUrl={entrant.silkUrl}
                              config={{ size: 'small' }}
                            />
                          )}
                          <div className="flex flex-col items-center min-w-[32px]">
                            <span className="text-lg font-bold text-gray-900">
                              {entrant.runnerNumber}
                            </span>
                            {entrant.isScratched && (
                              <span className="text-xs text-red-600 font-medium">SCR</span>
                            )}
                          </div>
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {entrant.name}
                          </div>
                          {entrant.jockey && (
                            <div className="text-xs text-gray-600 truncate">
                              {entrant.jockey}
                            </div>
                          )}
                          {entrant.trainerName && (
                            <div className="text-xs text-gray-500 truncate">
                              {entrant.trainerName}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <WinOddsCell entrant={entrant} formatOdds={formatOdds} />
                    <PlaceOddsCell entrant={entrant} formatOdds={formatOdds} />

                    {/* Timeline Columns */}
                    {timelineColumns.map((column) => (
                      <td
                        key={`${entrant.$id}_${column.interval}`}
                        className={`px-3 py-3 text-xs text-center border-r border-gray-100 ${
                          entrant.isScratched
                            ? 'bg-pink-50'
                            : column.isScheduledStart
                            ? 'border-blue-200 bg-blue-100'
                            : column.isDynamic
                            ? 'bg-yellow-50'
                            : ''
                        } ${
                          !entrant.isScratched && isCurrentTimeColumn(column.interval)
                            ? 'bg-green-50 border-green-200 font-medium'
                            : ''
                        }`}
                        style={{ verticalAlign: 'middle', height: '60px' }}
                      >
                        <div className="text-gray-900 flex items-center justify-center h-full">
                          {getTimelineData(entrant.$id, column.interval)}
                        </div>
                      </td>
                    ))}

                    {/* Right Fixed Columns */}
                    <td className="px-3 py-3 whitespace-nowrap text-right border-l-2 border-gray-300 border-r border-gray-200 sticky right-[80px] bg-white z-20" style={{ verticalAlign: 'middle', height: '60px' }}>
                      <div className="flex items-center justify-end h-full">
                        <span className="text-sm font-medium text-gray-900">
                          {entrant.isScratched ? '—' : (() => {
                            const amount = getPoolAmount(entrant);
                            return amount !== undefined ? formatMoney(amount) : '...';
                          })()}
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-3 whitespace-nowrap text-right sticky right-0 bg-white z-20" style={{ verticalAlign: 'middle', height: '60px' }}>
                      <div className="flex items-center justify-end h-full">
                        <span className="text-sm font-medium text-gray-900">
                          {entrant.isScratched ? '—' : (() => {
                            const percentage = getPoolPercentage(entrant);
                            return percentage !== undefined ? formatPercentage(percentage) : '...';
                          })()}
                        </span>
                        {!entrant.isScratched && entrant.moneyFlowTrend && entrant.moneyFlowTrend !== 'neutral' && (
                          <span
                            className={`ml-1 text-xs ${
                              entrant.moneyFlowTrend === 'up'
                                ? 'text-red-600'
                                : entrant.moneyFlowTrend === 'down'
                                ? 'text-blue-600'
                                : 'text-gray-400'
                            }`}
                          >
                            {entrant.moneyFlowTrend === 'up'
                              ? '↑'
                              : entrant.moneyFlowTrend === 'down'
                              ? '↓'
                              : ''}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Timeline Footer */}
        <div className="p-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600 flex-shrink-0">
          <div className="flex justify-between items-center">
            <span>
              Scroll to see full timeline • Blue: Scheduled start • Yellow: Live data • Green: Current time
            </span>
            <span>
              {timelineColumns.filter((col) => col.isDynamic).length} live columns
            </span>
          </div>
        </div>
      </div>

      {/* Enhanced Footer */}
      <div className="p-3 border-t border-gray-100 bg-gray-50 flex-shrink-0">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center space-x-4">
            <span className="text-gray-500">
              Last update:{' '}
              {lastUpdate ? lastUpdate.toLocaleTimeString() : 'No updates yet'}
            </span>
            {selectedEntrant && (
              <span className="text-blue-600">
                Selected:{' '}
                {sortedEntrants.find((e) => e.$id === selectedEntrant)?.name}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setUpdateNotifications(!updateNotifications)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                updateNotifications
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {updateNotifications ? '🔊' : '🔇'}
            </button>
          </div>
        </div>
      </div>

      {/* Enhanced Accessibility descriptions */}
      <div id="grid-instructions" className="sr-only">
        Navigate the data grid using arrow keys. Press Enter or Space to select
        a runner. Use Tab to move between interactive elements. Sort columns by
        clicking headers or pressing Enter when focused.
      </div>

      <div id="money-flow-description" className="sr-only">
        Money flow percentage shows the current hold percentage for each
        entrant, representing market interest and betting volume. Higher
        percentages indicate more money being wagered on that runner.
      </div>

      <div id="trend-description" className="sr-only">
        Trend indicators show recent odds changes. Up arrows indicate odds have
        lengthened (less favored), down arrows indicate odds have shortened
        (more favored).
      </div>

      <div id="pool-toggle-description" className="sr-only">
        Pool toggle controls allow you to switch between different betting pool
        types (Win, Place, Quinella) and display modes (Odds, Money,
        Percentage). Use arrow keys to navigate between options.
      </div>

      <div className="sr-only" aria-live="polite" id="grid-status">
        Showing {sortedEntrants.length} runners. Last update:{' '}
        {lastUpdate ? lastUpdate.toLocaleTimeString() : 'No updates yet'}.
        Connection status: {isConnected ? 'Connected' : 'Disconnected'}.
      </div>
    </div>
  )
})

export default EnhancedEntrantsGrid
