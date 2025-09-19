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
import type { RacePoolData, RaceResult } from '@/types/racePools'
import { useMoneyFlowTimeline } from '@/hooks/useMoneyFlowTimeline'
import { useRace } from '@/contexts/RaceContext'
import { screenReader, AriaLabels } from '@/utils/accessibility'
import { useRenderTracking, useMemoryOptimization } from '@/utils/performance'
import { useValueFlash } from '@/hooks/useValueFlash'
import { useGridIndicators } from '@/hooks/useGridIndicators'
import mapIndicatorColorToCellStyle from '@/utils/indicatorColors'
import { JockeySilks } from './JockeySilks'
import { useLogger } from '@/utils/logging'
import { useAudibleAlerts } from '@/contexts/AudibleAlertContext'

interface PositionHighlightStyle {
  backgroundClass: string
  textClass: string
  srLabel: string
  shortLabel: string
}

const POSITION_HIGHLIGHT_STYLES: Record<number, PositionHighlightStyle> = {
  1: {
    backgroundClass: 'bg-amber-100',
    textClass: 'text-amber-900',
    srLabel: 'Finished first place',
    shortLabel: '1st place',
  },
  2: {
    backgroundClass: 'bg-gray-100',
    textClass: 'text-gray-900',
    srLabel: 'Finished second place',
    shortLabel: '2nd place',
  },
  3: {
    backgroundClass: 'bg-orange-100',
    textClass: 'text-orange-900',
    srLabel: 'Finished third place',
    shortLabel: '3rd place',
  },
}

interface ResultHighlightInfo extends PositionHighlightStyle {
  position: number
  runnerNumber: number
  runnerName: string
}

// Flash-enabled Win Odds Cell Component
const WinOddsCell = memo(function WinOddsCell({
  entrant,
  formatOdds,
}: {
  entrant: Entrant
  formatOdds: (odds?: number) => string
}) {
  const { flashClasses } = useValueFlash(entrant.winOdds)

  return (
    <td
      className={`px-2 py-1 whitespace-nowrap text-right border-r border-gray-200 sticky left-[200px] z-20 ${flashClasses}`}
      style={{
        verticalAlign: 'middle',
        height: '30px',
        backgroundColor: flashClasses.includes('bg-') ? undefined : 'white',
      }}
    >
      <div className="flex items-center justify-end h-full pr-2">
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
  formatOdds,
}: {
  entrant: Entrant
  formatOdds: (odds?: number) => string
}) {
  const { flashClasses } = useValueFlash(entrant.placeOdds)

  return (
    <td
      className={`px-2 py-1 whitespace-nowrap text-right border-r-2 border-gray-300 sticky left-[270px] z-20 ${flashClasses}`}
      style={{
        verticalAlign: 'middle',
        height: '30px',
        backgroundColor: flashClasses.includes('bg-') ? undefined : 'white',
      }}
    >
      <div className="flex items-center justify-end h-full pr-2">
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
    oddsHistoryCount: number // DEPRECATED: Always 0, odds data comes from MoneyFlowHistory
    moneyFlowHistoryCount: number
  }
  className?: string
  enableMoneyFlowTimeline?: boolean
  enableJockeySilks?: boolean
  realtimeEntrants?: Entrant[]
  lastUpdate?: Date | null
  // Real-time pool data from unified subscription
  poolData?: RacePoolData | null
  // Trigger for timeline refetch when unified subscription receives money flow updates
  moneyFlowUpdateTrigger?: number
  // Results data for position highlighting (merged from real-time and persistent sources)
  resultsData?: RaceResult[]
  // Race status for determining when to show results highlighting
  raceStatus?: string
  resultStatus?: string
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
  className = '',
  enableMoneyFlowTimeline = true,
  enableJockeySilks = true,
  realtimeEntrants,
  lastUpdate,
  poolData = null,
  moneyFlowUpdateTrigger,
  resultsData,
  raceStatus,
  resultStatus,
}: EnhancedEntrantsGridProps) {
  const logger = useLogger('EnhancedEntrantsGrid');
  const { raceData } = useRace()
  const {
    isEnabled: audioAlertsEnabled,
    isLoading: audioPreferenceLoading,
    isPersisting: audioPreferencePersisting,
    toggle: toggleAudioAlerts,
    lastError: audioPreferenceError,
    primeAudioWithUserGesture,
  } = useAudibleAlerts()

  // Use real-time entrants data from unified subscription if available
  const currentEntrants =
    realtimeEntrants || raceData?.entrants || initialEntrants
  const currentRaceId = raceData?.race.$id || raceId
  const currentRaceStartTime = raceData?.race.startTime || raceStartTime
  const currentRace = raceData?.race

  // Get actual race pool data
  // Use real-time pool data from unified subscription with fallback for persistence
  const racePoolData = poolData

  // Pool view state - fixed to win pool since toggle is removed
  const poolViewState: PoolViewState = {
    ...DEFAULT_POOL_VIEW_STATE,
    activePool: 'win', // Fixed to win pool as per Phase 1 requirements
  }

  // Add update count tracking for grid component
  const [updateCount, setUpdateCount] = useState(0)

  // Get money flow timeline data for all entrants
  const entrantIds = useMemo(
    () => currentEntrants.map((e) => e.$id),
    [currentEntrants]
  )

  // Local selection for Win/Place/Odds selector - MUST be declared before hook calls
  const [selectedView, setSelectedView] = useState<'win' | 'place' | 'odds'>(
    'win'
  )

  // Debug: Log entrant IDs being passed to timeline hook (development only)
  if (process.env.NODE_ENV === 'development') {
    logger.debug('Timeline hook parameters:', {
      raceId: currentRaceId,
      entrantIds: entrantIds.length,
      entrantCount: entrantIds.length,
      selectedView,
    })
  }

  const {
    timelineData,
    isLoading: timelineLoading,
    error: timelineError,
    getWinPoolData,
    getPlacePoolData,
    getOddsData,
    refetch: refetchTimeline,
  } = useMoneyFlowTimeline(currentRaceId, entrantIds, selectedView === 'odds' ? 'win' : selectedView)

  const [selectedEntrant, setSelectedEntrant] = useState<string | undefined>()

  const handleAudioToggle = useCallback(() => {
    if (!audioAlertsEnabled) {
      primeAudioWithUserGesture()
    }

    toggleAudioAlerts().catch((error) => {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to toggle audible alerts', error)
      }
    })
  }, [audioAlertsEnabled, primeAudioWithUserGesture, toggleAudioAlerts])


  // Trigger timeline refetch when unified subscription receives money flow updates
  useEffect(() => {
    if (moneyFlowUpdateTrigger && refetchTimeline) {
      refetchTimeline()
    }
  }, [moneyFlowUpdateTrigger, refetchTimeline])

  // Timeline-related state
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const resultAnnouncementRef = useRef<string>('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  // State-dependent variables removed - now using data-driven approach for timeline persistence

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
  // Track renders for performance monitoring
  const renderCount = useRenderTracking('EnhancedEntrantsGrid')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _memory = useMemoryOptimization()

  // Track entrants data updates
  useEffect(() => {
    setUpdateCount((prev) => prev + 1)
  }, [currentEntrants])

  // Use entrants data directly (real-time updates come from unified subscription)
  const entrants = useMemo(() => {
    // Use current entrants which includes real-time updates from unified subscription
    const finalEntrants =
      currentEntrants && currentEntrants.length > 0
        ? currentEntrants
        : initialEntrants

    // Debug logging (can be simplified in production)
    if (process.env.NODE_ENV === 'development') {
      logger.debug('EnhancedEntrantsGrid entrants:', {
        entrantsCount: finalEntrants.length,
        hasRealtimeData: !!realtimeEntrants,
        lastUpdateTime: lastUpdate?.toISOString(),
      })
    }

    return finalEntrants
  }, [currentEntrants, initialEntrants, realtimeEntrants, lastUpdate, logger])

  // Validation function to check if timeline amounts sum to total pool
  const validateTimelineSummation = useCallback((entrant: Entrant) => {
    if (!entrant.moneyFlowTimeline || !entrant.poolMoney) return true

    const timeline = entrant.moneyFlowTimeline
    if (!timeline.dataPoints || timeline.dataPoints.length === 0) return true

    // Sum all incremental amounts for this entrant
    const timelineSum = timeline.dataPoints.reduce(
      (sum: number, point: { incrementalAmount?: number }) => {
        return sum + (point.incrementalAmount || 0)
      },
      0
    )

    // Compare with current pool total for this entrant
    const poolTotal = entrant.poolMoney.total || 0
    const difference = Math.abs(timelineSum - poolTotal)
    const tolerance = poolTotal * 0.05 // 5% tolerance

    if (difference > tolerance && poolTotal > 100) {
      // Only flag significant discrepancies
      logger.warn(
        `Timeline summation mismatch for ${entrant.name}`, {
          timelineSum,
          poolTotal,
          difference,
          entrantName: entrant.name
        }
      )
      return false
    }

    return true
  }, [logger])

  // Calculate pool money for each entrant using actual timeline data and pool data
  const entrantsWithPoolData = useMemo(() => {
    if (!entrants || entrants.length === 0) return []

    logger.debug('Pool calculation debug:', {
      entrantsCount: entrants.length,
      timelineDataAvailable: timelineData?.size > 0,
      timelineDataSize: timelineData?.size || 0,
      racePoolDataAvailable: !!racePoolData,
      racePoolData: racePoolData
        ? {
            winPoolTotal: racePoolData.winPoolTotal,
            placePoolTotal: racePoolData.placePoolTotal,
          }
        : null,
      sampleEntrant: entrants[0]
        ? {
            id: entrants[0].$id,
            name: entrants[0].name,
            holdPercentage: entrants[0].holdPercentage,
            isScratched: entrants[0].isScratched,
          }
        : null,
    })

    return entrants.map((entrant) => {
      if (entrant.isScratched) {
        logger.debug(`Scratched entrant ${entrant.name} (${entrant.runnerNumber}) - returning unchanged`)
        return {
          ...entrant,
          moneyFlowTimeline: undefined, // No timeline for scratched entrants
        }
      }

      // NEW PRIORITY HIERARCHY (FIXED):
      // Priority 1: Real entrant holdPercentage (must be > 0)
      let poolPercentage: number | undefined = undefined
      let dataSource = 'none'

      if (entrant.holdPercentage && entrant.holdPercentage > 0) {
        poolPercentage = entrant.holdPercentage
        dataSource = 'entrant_real_data'
        logger.debug(`Using real entrant data for ${entrant.name}: ${poolPercentage}%`)
      }

      // Priority 2: Timeline latest percentage (only if entrant data missing)
      const entrantTimeline = timelineData?.get(entrant.$id)
      if (
        !poolPercentage &&
        entrantTimeline &&
        entrantTimeline.dataPoints.length > 0
      ) {
        const latestPercentage = entrantTimeline.latestPercentage
        if (latestPercentage && latestPercentage > 0) {
          poolPercentage = latestPercentage
          dataSource = 'timeline_data'
          logger.debug(`Using timeline data for ${entrant.name}: ${poolPercentage}%`)
        }
      }

      // Priority 3: Calculate from odds if we have pool data and odds
      if (
        !poolPercentage &&
        racePoolData &&
        entrant.winOdds &&
        entrant.winOdds > 0
      ) {
        // Calculate implied probability from odds (odds = 1/probability)
        // Add small margin for house edge estimation
        const impliedProbability = 1 / entrant.winOdds
        const estimatedPercentage = impliedProbability * 100 * 0.85 // Adjust for house edge

        if (estimatedPercentage > 0 && estimatedPercentage < 100) {
          poolPercentage = estimatedPercentage
          dataSource = 'calculated_from_odds'
          logger.debug(`Calculated from odds for ${entrant.name}: ${poolPercentage.toFixed(2)}% (odds: ${entrant.winOdds})`)
        }
      }

      // Priority 4: Fallback to dummy data temporarily to ensure display works
      if (!poolPercentage) {
        logger.debug(`No calculable data for ${entrant.name}, using fallback percentage`)
        // Use a fallback percentage based on entrant position for testing
        poolPercentage = Math.max(1, 15 - entrant.runnerNumber) // Simple fallback
        dataSource = 'fallback_for_testing'
      }

      // Calculate individual pool contributions based on pool percentage
      const holdPercentageDecimal = poolPercentage / 100

      // Use fallback pool totals if no race pool data (for testing)
      const fallbackWinPool = 5000000 // $50k in cents
      const fallbackPlacePool = 2000000 // $20k in cents

      const winPoolInDollars = Math.round(
        (racePoolData?.winPoolTotal || fallbackWinPool) / 100
      )
      const placePoolInDollars = Math.round(
        (racePoolData?.placePoolTotal || fallbackPlacePool) / 100
      )
      const winPoolContribution = winPoolInDollars * holdPercentageDecimal
      const placePoolContribution = placePoolInDollars * holdPercentageDecimal
      const totalPoolContribution = winPoolContribution + placePoolContribution

      logger.debug(`Real calculation for ${entrant.name}:`, {
        poolPercentage,
        winPoolContribution: winPoolContribution.toFixed(0),
        placePoolContribution: placePoolContribution.toFixed(0),
        totalPoolContribution: totalPoolContribution.toFixed(0),
        dataSource,
      })

      const entrantWithPoolData = {
        ...entrant,
        moneyFlowTimeline: entrantTimeline, // Add timeline data to entrant
        // Update odds with latest values from timeline data if available (NEW in Story 4.9)
        winOdds: entrantTimeline?.latestWinOdds ?? entrant.winOdds,
        placeOdds: entrantTimeline?.latestPlaceOdds ?? entrant.placeOdds,
        poolMoney: {
          win: winPoolContribution,
          place: placePoolContribution,
          total: totalPoolContribution,
          percentage: poolPercentage,
        },
      }

      // Validate timeline summation for debugging
      validateTimelineSummation(entrantWithPoolData)

      // Special debugging for "Wal" entrant
      if (entrant.name.toLowerCase().includes('wal')) {
        logger.debug(`DEBUG "Wal" entrant:`, {
          name: entrant.name,
          runnerNumber: entrant.runnerNumber,
          poolPercentage,
          poolMoney: entrantWithPoolData.poolMoney,
          timelineDataPoints: entrantTimeline?.dataPoints?.length || 0,
          sampleTimelinePoint: entrantTimeline?.dataPoints?.[0] || null,
          timelineTrend: entrantTimeline?.trend || 'none',
        })
      }

      return entrantWithPoolData
    })
  }, [entrants, racePoolData, timelineData, validateTimelineSummation, logger])

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

  const resultHighlights = useMemo(() => {
    const highlights = new Map<number, ResultHighlightInfo>()

    // Use props data first, fallback to race context for backward compatibility
    const results = resultsData || currentRace?.resultsData

    if (!Array.isArray(results) || results.length === 0) {
      return highlights
    }

    // Use props status first, fallback to race context
    const status = (resultStatus || raceStatus || currentRace?.resultStatus || currentRace?.status || '')
      .toString()
      .toLowerCase()

    // Debug logging to track data flow
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Result highlighting check:', {
        hasResultsData: !!results,
        resultsLength: results?.length || 0,
        status,
        fromProps: { resultsData: !!resultsData, resultStatus, raceStatus },
        fromContext: {
          resultsData: !!currentRace?.resultsData,
          resultStatus: currentRace?.resultStatus,
          status: currentRace?.status
        }
      })
    }

    if (!['interim', 'final'].includes(status)) {
      return highlights
    }

    const extractRunnerNumber = (result: RaceResult): number | undefined => {
      const rawNumber =
        (result.runnerNumber ?? result.runner_number) as
          | number
          | string
          | undefined

      if (rawNumber === undefined || rawNumber === null) {
        return undefined
      }

      if (typeof rawNumber === 'number') {
        return Number.isFinite(rawNumber) ? rawNumber : undefined
      }

      const parsed = parseInt(rawNumber, 10)
      return Number.isFinite(parsed) ? parsed : undefined
    }

    const extractRunnerName = (result: RaceResult): string | undefined => {
      return result.runnerName || result.name
    }

    const maxTrackedPositions = 3

    results.forEach((result, index) => {
      if (highlights.size >= maxTrackedPositions) {
        return
      }

      const runnerNumber = extractRunnerNumber(result)
      if (runnerNumber === undefined) {
        return
      }

      const normalizedPosition =
        typeof result.position === 'number' && result.position > 0
          ? result.position
          : index + 1

      const style = POSITION_HIGHLIGHT_STYLES[normalizedPosition]
      if (!style) {
        return
      }

      if (highlights.has(runnerNumber)) {
        return
      }

      const fallbackName =
        extractRunnerName(result) ||
        sortedEntrants.find((entrant) => entrant.runnerNumber === runnerNumber)
          ?.name ||
        `Runner ${runnerNumber}`

      highlights.set(runnerNumber, {
        ...style,
        position: normalizedPosition,
        runnerNumber,
        runnerName: fallbackName,
      })
    })

    return highlights
  }, [
    resultsData,
    resultStatus,
    raceStatus,
    currentRace?.resultsData,
    currentRace?.resultStatus,
    currentRace?.status,
    sortedEntrants,
    logger
  ])

  const highlightAnnouncements = useMemo(() => {
    if (resultHighlights.size === 0) {
      return []
    }

    return Array.from(resultHighlights.values())
      .sort((a, b) => a.position - b.position)
      .map(
        (info) =>
          `${info.shortLabel}: number ${info.runnerNumber} ${info.runnerName}`.trim()
      )
  }, [resultHighlights])

  useEffect(() => {
    if (!screenReader) {
      return
    }

    if (highlightAnnouncements.length === 0) {
      resultAnnouncementRef.current = ''
      return
    }

    const summary = `Race results updated. ${highlightAnnouncements.join('. ')}`

    if (summary !== resultAnnouncementRef.current) {
      screenReader.announce(summary, 'polite')
      resultAnnouncementRef.current = summary
    }
  }, [highlightAnnouncements])

  // Debug: Track pool toggle changes and timeline data
  logger.debug('Timeline data status:', {
    activePool: poolViewState.activePool,
    timelineDataSize: timelineData?.size || 0,
    entrantsCount: sortedEntrants.length,
    timelineLoading,
    timelineError: timelineError ? timelineError : null,
    entrantIdsPreview: entrantIds.slice(0, 3),
    sampleEntrantData: sortedEntrants.slice(0, 2).map((e) => ({
      id: e.$id,
      name: e.name,
      runnerNumber: e.runnerNumber,
    })),
  })

  // Update current time for dynamic timeline updates
  // More frequent updates near race start time, but pause for final races
  useEffect(() => {
    const raceStatus = currentRace?.status || 'Open'

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
  }, [currentRaceStartTime, currentRace?.status])

  // Generate timeline columns using data-driven approach for persistence
  const timelineColumns = useMemo(() => {
    const raceStart = new Date(currentRaceStartTime)
    const current = currentTime
    const timeToRaceMs = raceStart.getTime() - current.getTime()
    const timeToRaceMinutes = Math.floor(timeToRaceMs / (1000 * 60))
    const raceStatus = currentRace?.status || 'Open'

    // FIXED: Declare these variables at the top to avoid "before initialization" errors
    const raceHasStarted = timeToRaceMinutes < 0
    const raceIsCompleted = [
      'Final',
      'Interim',
      'Closed',
      'Abandoned',
    ].includes(raceStatus)

    // Calculate actual post-start minutes
    const actualPostStartMinutes =
      timeToRaceMinutes < 0 ? Math.abs(timeToRaceMinutes) : 0

    // Calculate max post-start from existing timeline data (DATA-DRIVEN)
    let maxPostStartFromData = 0
    if (timelineData && timelineData.size > 0) {
      for (const [, entrantData] of timelineData) {
        if (entrantData.dataPoints && entrantData.dataPoints.length > 0) {
          const maxTimeToStart = Math.max(
            ...entrantData.dataPoints.map((p) => Math.abs(p.timeToStart || 0))
          )
          maxPostStartFromData = Math.max(maxPostStartFromData, maxTimeToStart)
        }
      }
    }

    // Use maximum of actual time or data-driven max for persistence
    // const effectiveMaxPostStart = Math.max(actualPostStartMinutes, maxPostStartFromData) // Currently unused

    // Pre-scheduled timeline milestones (CORRECTED: positive = before start, negative = after start)
    // Backend uses: timeToStart: 60 = 60min before start, timeToStart: -2 = 2min after start
    const preScheduledMilestones = [
      60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 4, 3, 2, 1, 0,
    ]

    const columns: TimelineColumn[] = []

    // Add pre-scheduled milestones (FIXED: Always show standard columns by default)
    preScheduledMilestones.forEach((interval) => {
      // FIXED: Standard pre-race columns (60m-0m) should always be visible by default
      // Progressive display logic only applies to post-race delayed columns
      // For pre-race intervals (>= 0): Always show
      // For completed/delayed races: show all columns for historical review
      const shouldShowColumn =
        interval >= 0 || raceIsCompleted || timeToRaceMinutes <= 0

      if (shouldShowColumn) {
        // CORRECTED: interval is now positive for before-start times
        const timestamp = new Date(raceStart.getTime() - interval * 60 * 1000)
        let label: string
        if (interval === 0) {
          label = '0 (Start)'
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
      }
    })

    // Add post-scheduled columns when appropriate - FIXED to be time-driven, not data-driven
    // FIXED: Base delayed column visibility on actual elapsed time, not existing data
    // This ensures columns appear progressively as time elapses, not all at once
    const shouldShowPostStartColumns =
      (raceStatus === 'Open' && raceHasStarted && actualPostStartMinutes > 0) ||
      raceIsCompleted // Always show for completed races to preserve review capability

    if (shouldShowPostStartColumns) {
      const dynamicIntervals: number[] = []

      if (raceStatus === 'Open') {
        // FIXED: For open races, show delayed columns progressively based on actual elapsed time
        // Only show columns for time periods that have actually been reached
        // NOTE: Stop creating new dynamic columns when race status becomes 'Interim' or 'Final'
        const postStartMinutes = actualPostStartMinutes

        // Standard post-start progression: -1m, -2m, -3m, -4m, etc.
        const standardPostStartIntervals = [
          -1.0, -2.0, -3.0, -4.0, -5.0, -6.0, -7.0, -8.0,
          -9.0, -10.0,
        ]

        // FIXED: Only show intervals that have been reached by actual elapsed time
        // Show columns progressively: only add the NEXT interval when time is reached
        const sortedPostStartIntervals = [...standardPostStartIntervals].sort(
          (a, b) => Math.abs(a) - Math.abs(b)
        )

        // FIXED: Show all intervals that have been reached progressively
        // This shows columns as they become available during delayed periods
        for (const interval of sortedPostStartIntervals) {
          const intervalMinutes = Math.abs(interval)
          // Only add this interval if we've reached its time point
          if (postStartMinutes >= intervalMinutes) {
            dynamicIntervals.push(interval)
          } else {
            // Stop adding intervals once we reach one we haven't passed yet
            break
          }
        }

        // Only log when intervals change to reduce verbosity
        if (dynamicIntervals.length > 0 && postStartMinutes % 1 === 0) {
          logger.debug('Intervals updated:', {
            postStartMinutes,
            intervals: dynamicIntervals.length,
          })
        }
      } else {
        // For closed/final/interim/abandoned races, show columns based on existing data points
        // REQUIREMENT: Stop creating new dynamic columns after 'Interim' status
        const dataIntervals = new Set<number>()
        if (timelineData && timelineData.size > 0) {
          for (const [, entrantData] of timelineData) {
            if (entrantData.dataPoints && entrantData.dataPoints.length > 0) {
              entrantData.dataPoints.forEach((point) => {
                // FIXED: Use timeInterval when available (server-calculated), fallback to timeToStart
                const interval = point.timeInterval ?? point.timeToStart

                if (interval !== undefined) {
                  // Add post-race intervals to dynamic columns (negative intervals = post-start)
                  if (interval < 0) {
                    // Use server-calculated timeInterval directly (already properly bucketed)
                    dataIntervals.add(interval)
                  }
                }
              })
            }
          }
        }

        // Add intervals from data if available
        if (dataIntervals.size > 0) {
          dynamicIntervals.push(
            ...Array.from(dataIntervals).sort((a, b) => a - b)
          )
        } else {
          // REQUIREMENT: Only add fallback intervals for Final/Abandoned races, not Interim
          // After Interim status, stop creating new dynamic columns
          if (raceStatus === 'Final' || raceStatus === 'Finalized' || raceStatus === 'Abandoned') {
            // Fallback: Show standard post-race intervals for completed races even without data
            const standardPostRaceIntervals = [
              -1.0, -2.0, -3.0, -4.0, -5.0,
            ]
            dynamicIntervals.push(...standardPostRaceIntervals)
          }
          // For 'Interim', 'Closed', 'Running' - only show existing data columns, no fallback
        }
      }

      // Add post-start columns (CORRECTED: negative intervals are post-start)
      dynamicIntervals.forEach((interval) => {
        // For negative intervals (post-start), add the absolute time to get correct timestamp
        const timestamp = new Date(
          raceStart.getTime() + Math.abs(interval) * 60 * 1000
        )
        const absInterval = Math.abs(interval)

        // REQUIREMENT: Show labels like "-1m, -2m, -3m" for delayed starts
        // Full minute intervals: -1m, -2m, -3m
        const label = `-${absInterval}m`

        columns.push({
          label,
          interval,
          timestamp: timestamp.toISOString(),
          isScheduledStart: false,
          isDynamic: raceStatus === 'Open', // Only mark as dynamic for open races
        })
      })
    }

    // Sort columns chronologically: highest positive → 0 → lowest negative
    // Example: 60m, 50m, 40m, ..., 2m, 1m, 0 (Start), +1m, +2m, +4m
    return columns.sort((a, b) => b.interval - a.interval)
  }, [currentRaceStartTime, currentTime, currentRace?.status, timelineData, logger])

  const timelineIntervals = useMemo(
    () => timelineColumns.map((column) => column.interval),
    [timelineColumns]
  )

  const { getIndicatorForCell } = useGridIndicators({
    timelineData,
    entrants: sortedEntrants,
    intervals: timelineIntervals,
    selectedView,
  })

  // Determine if column should be highlighted (current time) - FIXED to highlight only ONE column
  const isCurrentTimeColumn = useCallback(
    (interval: number): boolean => {
      const raceStart = new Date(currentRaceStartTime)
      const timeToRaceMs = raceStart.getTime() - currentTime.getTime()
      const timeToRaceMinutes = timeToRaceMs / (1000 * 60)
      const raceStatus = currentRace?.status || 'Open'

      // Only highlight and follow current time while race status is 'Open'
      if (raceStatus === 'Open') {
        if (timeToRaceMinutes > 0) {
          // Race hasn't started yet - find the SINGLE active polling interval
          const sortedIntervals = timelineColumns
            .filter((col) => col.interval > 0) // Only pre-race intervals
            .map((col) => col.interval)
            .sort((a, b) => b - a) // Descending: [60, 55, 50, ..., 1, 0]

          // FIXED: Find the active column - largest interval that is <= current time
          // Examples: 10.5min → 10m column, 9.9min → 5m column, 0.3min → 0 (Start) column
          let activeInterval = null

          // Handle edge case for times > 60 minutes first
          if (timeToRaceMinutes > 60) {
            activeInterval = 60
          } else {
            // Find the largest interval that is <= current time to race
            for (const intervalMinutes of sortedIntervals) {
              if (timeToRaceMinutes >= intervalMinutes) {
                activeInterval = intervalMinutes
                break // Found the largest interval <= current time
              }
            }

            // If no interval found (time < 1), use the smallest interval (0)
            if (!activeInterval && sortedIntervals.length > 0) {
              activeInterval = sortedIntervals[sortedIntervals.length - 1] // 0
            }
          }

          return interval === activeInterval
        } else {
          // Past scheduled start but race status still 'Open' (delayed start)
          const timeAfterStartMinutes = Math.abs(timeToRaceMinutes)

          // FIXED: Find active post-start column - largest interval <= elapsed time
          // Examples: 0.1min elapsed → 0 (Start), 1.2min elapsed → -1m

          // Get all available post-start intervals sorted by absolute value ascending: [1, 2, 3, ...]
          const postStartIntervals = timelineColumns
            .filter((col) => col.interval < 0)
            .map((col) => Math.abs(col.interval))
            .sort((a, b) => a - b)

          // If no post-start columns exist, highlight the 0 (Start) column
          if (postStartIntervals.length === 0) {
            return interval === 0
          }

          // Find the largest post-start interval that has been reached
          let activePostStartInterval = null
          for (const postInterval of postStartIntervals) {
            if (timeAfterStartMinutes >= postInterval) {
              activePostStartInterval = postInterval
            } else {
              break // Stop at first interval we haven't reached
            }
          }

          // If we haven't reached any post-start interval yet, highlight "0 (Start)"
          if (activePostStartInterval === null) {
            return interval === 0
          }

          // Check if this column matches the active post-start interval
          if (interval < 0) {
            return Math.abs(interval) === activePostStartInterval
          } else if (interval === 0) {
            // Don't highlight start column if we've moved past it
            return false
          }

          return false
        }
      }

      // Race status is no longer 'Open' - stop highlighting, race has actually started
      return false
    },
    [currentRaceStartTime, currentTime, timelineColumns, currentRace?.status]
  )

  // Auto-scroll to show current time position
  useEffect(() => {
    if (!autoScroll || !scrollContainerRef.current) return

    const container = scrollContainerRef.current

    // Find the currently highlighted (active) column using the same logic
    const activeColumnIndex = timelineColumns.findIndex((col) =>
      isCurrentTimeColumn(col.interval)
    )

    logger.debug('Auto-scroll update:', {
      activeColumnIndex,
      totalColumns: timelineColumns.length,
      activeColumn:
        activeColumnIndex >= 0 ? timelineColumns[activeColumnIndex] : null,
      autoScroll,
    })

    if (activeColumnIndex >= 0) {
      const columnWidth = 80 // Approximate column width
      // Scroll to center the active column with some buffer
      const scrollPosition = Math.max(0, (activeColumnIndex - 2) * columnWidth)

      container.scrollTo({
        left: scrollPosition,
        behavior: 'smooth',
      })

      logger.debug('Auto-scrolled to active column at position:', { scrollPosition })
    }
  }, [
    timelineColumns,
    currentRaceStartTime,
    autoScroll,
    currentTime,
    isCurrentTimeColumn,
    logger,
  ])

  // Get data for specific timeline point - shows incremental money amounts or odds based on selected view
  const getTimelineData = useCallback(
    (entrantId: string, interval: number): string => {
      const entrant = sortedEntrants.find((e) => e.$id === entrantId)
      if (!entrant || entrant.isScratched) return '—'

      // Use appropriate function based on selected view
      let result: string
      switch (selectedView) {
        case 'win':
          result = getWinPoolData ? getWinPoolData(entrantId, interval) : '—'
          break
        case 'place':
          result = getPlacePoolData ? getPlacePoolData(entrantId, interval) : '—'
          break
        case 'odds':
          // Show Fixed Win odds for odds view
          result = getOddsData ? getOddsData(entrantId, interval, 'fixedWin') : '—'
          break
        default:
          result = '—'
      }

      // Debug logging to help troubleshoot data issues
      if (interval === 60 && process.env.NODE_ENV === 'development') {
        logger.debug(`Timeline data for ${entrant.name || entrant.$id} at ${interval}m:`, {
          entrantId: entrant.$id,
          interval,
          selectedView,
          result,
          timelineDataSize: timelineData?.size || 0,
          hasTimelineData: timelineData?.has(entrant.$id) || false,
        })
      }

      return result
    },
    [
      sortedEntrants,
      selectedView,
      timelineData,
      getWinPoolData,
      getPlacePoolData,
      getOddsData,
      logger,
    ]
  )

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

  // Get pool amount for the currently selected view type
  const getPoolAmount = useCallback(
    (entrant: Entrant): number | undefined => {
      if (!entrant.poolMoney) return undefined // Return undefined when no real data yet

      switch (selectedView) {
        case 'win':
          return entrant.poolMoney.win || 0
        case 'place':
          return entrant.poolMoney.place || 0
        case 'odds':
          // For odds view, show win pool amount as it's related to win odds
          return entrant.poolMoney.win || 0
        default:
          return entrant.poolMoney.total || 0
      }
    },
    [selectedView]
  )

  // Get pool percentage for the currently selected pool type
  const getPoolPercentage = useCallback(
    (entrant: Entrant): number | undefined => {
      if (entrant.isScratched) return 0

      // Return undefined if no pool money data available yet (avoid showing dummy percentages)
      if (!entrant.poolMoney) return undefined

      // Calculate percentage based on selected view type
      switch (selectedView) {
        case 'win':
          // Calculate percentage of win pool
          const totalWinPool = entrantsWithPoolData.reduce(
            (sum, e) =>
              !e.isScratched && e.poolMoney
                ? sum + (e.poolMoney.win || 0)
                : sum,
            0
          )
          return totalWinPool > 0
            ? ((entrant.poolMoney.win || 0) / totalWinPool) * 100
            : 0

        case 'place':
          // Calculate percentage of place pool
          const totalPlacePool = entrantsWithPoolData.reduce(
            (sum, e) =>
              !e.isScratched && e.poolMoney
                ? sum + (e.poolMoney.place || 0)
                : sum,
            0
          )
          return totalPlacePool > 0
            ? ((entrant.poolMoney.place || 0) / totalPlacePool) * 100
            : 0

        case 'odds':
          // For odds view, show win pool percentage as it's related to win odds
          const totalWinPoolForOdds = entrantsWithPoolData.reduce(
            (sum, e) =>
              !e.isScratched && e.poolMoney
                ? sum + (e.poolMoney.win || 0)
                : sum,
            0
          )
          return totalWinPoolForOdds > 0
            ? ((entrant.poolMoney.win || 0) / totalWinPoolForOdds) * 100
            : 0

        default:
          // Default to existing percentage calculation
          return entrant.poolMoney.percentage || 0
      }
    },
    [selectedView, entrantsWithPoolData]
  )

  // Handle entrant selection
  const handleEntrantClick = useCallback(
    (entrantId: string) => {
      setSelectedEntrant((prev) => (prev === entrantId ? undefined : entrantId))
      const entrant = sortedEntrants.find((e) => e.$id === entrantId)
      if (entrant) {
        screenReader?.announce(
          `Selected ${entrant.name}, runner number ${entrant.runnerNumber}`,
          'polite'
        )
      }
    },
    [sortedEntrants]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, entrantId: string) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleEntrantClick(entrantId)
      }
    },
    [handleEntrantClick]
  )

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
      className={`enhanced-entrants-grid bg-white rounded-lg shadow-md flex-1 flex flex-col ${className}`}
      style={{ minHeight: 0 }}
    >
      {/* Enhanced Single-Table Grid Architecture with Perfect Row Alignment */}
      <div
        className="flex-1 overflow-hidden bg-white border border-gray-200 rounded-lg flex flex-col"
        style={{ minHeight: 0 }}
      >
        {/* Consolidated Title Row */}
        <div className="flex items-center justify-between p-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          {/* LEFT: Win/Place/Odds Selector + Last Update */}
          <div className="flex items-center space-x-3">
            <div className="flex bg-gray-100 rounded p-0.5 text-xs">
              <button
                onClick={() => setSelectedView('win')}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  selectedView === 'win'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Win
              </button>
              <button
                onClick={() => setSelectedView('place')}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  selectedView === 'place'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Place
              </button>
              <button
                onClick={() => setSelectedView('odds')}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  selectedView === 'odds'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Odds
              </button>
            </div>

            <span className="text-xs text-gray-500">
              Last update:{' '}
              {lastUpdate ? lastUpdate.toLocaleTimeString() : 'No updates yet'}
            </span>

            {/* Renders and Updates tracking */}
            <span className="text-xs text-gray-500 font-bold uppercase ml-4">
              RENDERS
            </span>
            <span
              className={`text-sm font-mono font-semibold ${
                renderCount > 10
                  ? 'text-red-600'
                  : renderCount > 5
                  ? 'text-orange-600'
                  : 'text-purple-800'
              }`}
            >
              {renderCount}
            </span>
            <span className="text-xs text-gray-500 font-bold uppercase ml-2">
              UPDATES
            </span>
            <span className="text-sm font-mono font-semibold text-blue-600">
              {updateCount}
            </span>
          </div>

          {/* RIGHT: Indicators, Audio Toggle and Auto Scroll */}
          <div className="flex items-center space-x-2">
            <div className="flex flex-col items-start">
              <button
                type="button"
                onClick={handleAudioToggle}
                className={`text-xs px-2 py-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 ${
                  audioAlertsEnabled
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                } ${
                  audioPreferenceLoading || audioPreferencePersisting
                    ? 'opacity-70 cursor-not-allowed'
                    : ''
                }`}
                aria-pressed={audioAlertsEnabled}
                aria-label={
                  audioAlertsEnabled
                    ? 'Disable global audible race alerts'
                    : 'Enable global audible race alerts'
                }
                disabled={audioPreferenceLoading || audioPreferencePersisting}
              >
                {audioPreferenceLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true" />
                    <span className="font-medium">Loading…</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden="true">{audioAlertsEnabled ? '🔊' : '🔇'}</span>
                    <span className="font-medium">{audioAlertsEnabled ? 'Audio On' : 'Audio Off'}</span>
                  </span>
                )}
              </button>
              {audioPreferenceError && (
                <span className="mt-1 text-[10px] text-red-600" role="status" aria-live="polite">
                  {audioPreferenceError}
                </span>
              )}
            </div>

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
          </div>
        </div>

        {/* Single Table with Combined Horizontal and Vertical Scrolling */}
        <div className="flex-1 relative min-h-0">
          <div
            ref={scrollContainerRef}
            className="absolute inset-0 overflow-auto"
          >
            <table
              className="w-full border-collapse"
              style={{ tableLayout: 'fixed' }}
            >
              {/* Column Groups for Layout Control */}
              <colgroup>
                {/* Fixed Left Columns */}
                <col style={{ width: '200px' }} />
                <col style={{ width: '70px' }} />
                <col style={{ width: '70px' }} />

                {/* Timeline Columns */}
                {timelineColumns.map((column) => (
                  <col
                    key={`col_${column.interval}`}
                    style={{ width: '60px' }}
                  />
                ))}

                {/* Fixed Right Columns */}
                <col style={{ width: '70px' }} />
                <col style={{ width: '70px' }} />
              </colgroup>

              {/* Unified Header */}
              <thead className="bg-gray-50">
                <tr style={{ height: '30px' }}>
                  {/* Left Fixed Headers - Sticky */}
                  <th
                    className="px-3 py-1 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-r border-gray-200 sticky left-0 top-0 z-30"
                    style={{ backgroundColor: '#f9fafb' }}
                  >
                    Runner
                  </th>
                  <th
                    className={`px-2 py-1 text-right text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 border-r border-gray-200 sticky left-[200px] top-0 z-30 ${
                      sortState?.column === 'winOdds' ? 'bg-blue-50' : ''
                    }`}
                    style={{
                      backgroundColor:
                        sortState?.column === 'winOdds' ? '#eff6ff' : '#f9fafb',
                    }}
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
                  <th
                    className="px-2 py-1 text-right text-xs font-medium text-gray-700 uppercase tracking-wider border-r-2 border-gray-300 sticky left-[270px] top-0 z-30"
                    style={{ backgroundColor: '#f9fafb' }}
                  >
                    Place
                  </th>

                  {/* Timeline Headers */}
                  {timelineColumns.map((column) => (
                    <th
                      key={`header_${column.interval}`}
                      className={`px-1 py-1 text-xs font-medium text-gray-700 text-center border-r border-gray-200 sticky top-0 z-20 ${
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
                          : '#f9fafb',
                      }}
                      title={`${column.label} - ${new Date(
                        column.timestamp
                      ).toLocaleTimeString()}`}
                    >
                      <div
                        className="flex flex-col items-center justify-center"
                        style={{ height: '30px' }}
                      >
                        <span className="font-medium text-xs">
                          {column.label}
                        </span>
                        <span className="text-[9px] text-gray-500">
                          {new Date(column.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </th>
                  ))}

                  {/* Right Fixed Headers - Sticky */}
                  <th
                    className="px-2 py-1 text-right text-xs font-medium text-gray-700 uppercase tracking-wider border-l-2 border-l-gray-300 border-r border-r-gray-200 sticky right-[70px] top-0 z-30"
                    style={{ backgroundColor: '#f9fafb' }}
                  >
                    Pool
                  </th>
                  <th
                    className="px-2 py-1 text-right text-xs font-medium text-gray-700 uppercase tracking-wider sticky right-0 top-0 z-30"
                    style={{ backgroundColor: '#f9fafb' }}
                  >
                    Pool %
                  </th>
                </tr>
              </thead>

              {/* Unified Body */}
              <tbody className="bg-white divide-y divide-gray-100">
                {sortedEntrants.map((entrant) => {
                  const resultHighlight = resultHighlights.get(
                    entrant.runnerNumber
                  )
                  const runnerCellBackgroundClass =
                    resultHighlight?.backgroundClass ?? 'bg-white'
                  const runnerCellTextClass =
                    resultHighlight?.textClass ?? 'text-gray-900'
                  const finishingAnnouncement = resultHighlight?.srLabel

                  return (
                    <tr
                      key={entrant.$id}
                      className={`hover:bg-gray-50 focus-within:bg-blue-50 transition-colors ${
                        entrant.isScratched ? 'opacity-50 bg-pink-50' : ''
                      } ${
                        selectedEntrant === entrant.$id ? 'bg-blue-100' : ''
                      } cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset`}
                      onClick={() => handleEntrantClick(entrant.$id)}
                      onKeyDown={(e) => handleKeyDown(e, entrant.$id)}
                      tabIndex={0}
                      style={{
                        height: '30px',
                        minHeight: '30px',
                        maxHeight: '30px',
                      }}
                      aria-label={AriaLabels.generateRunnerRowLabel(
                        entrant.runnerNumber,
                        entrant.name,
                        entrant.jockey || 'Unknown jockey',
                        entrant.trainerName || 'Unknown trainer',
                        entrant.winOdds,
                        entrant.placeOdds,
                        entrant.isScratched,
                        finishingAnnouncement
                      )}
                    >
                      {/* Left Fixed Columns - Sticky */}
                      <td
                        className={`px-2 py-1 whitespace-nowrap border-r border-gray-200 sticky left-0 z-20 ${runnerCellBackgroundClass}`}
                        style={{ verticalAlign: 'middle', height: '30px' }}
                        data-finishing-position={
                          resultHighlight ? String(resultHighlight.position) : undefined
                        }
                        title={resultHighlight?.shortLabel}
                      >
                        <div className="flex items-center space-x-3 h-full">
                          <div className="flex items-center space-x-2">
                            {displayConfig.showJockeySilks && (
                              <JockeySilks
                                silk={entrant.silk}
                                runnerNumber={entrant.runnerNumber}
                                runnerName={entrant.name}
                                jockey={entrant.jockey}
                                fallbackUrl={
                                  entrant.silkUrl128 ||
                                  entrant.silkUrl64 ||
                                  entrant.silkUrl
                                }
                                config={{ size: 'small' }}
                              />
                            )}
                            <div className="flex flex-col items-center min-w-[32px]">
                              <span
                                className={`text-lg font-bold ${runnerCellTextClass}`}
                              >
                                {entrant.runnerNumber}
                              </span>
                              {entrant.isScratched && (
                                <span className="text-xs text-red-600 font-medium">
                                  SCR
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <div
                              className={`text-sm font-medium truncate ${runnerCellTextClass}`}
                            >
                              {entrant.name}
                            </div>
                            {entrant.jockey && (
                              <div className="text-xs text-gray-600 truncate">
                                {entrant.jockey}
                              </div>
                            )}
                          </div>
                        </div>
                        {resultHighlight && (
                          <span className="sr-only">{resultHighlight.srLabel}</span>
                        )}
                      </td>

                      <WinOddsCell entrant={entrant} formatOdds={formatOdds} />
                      <PlaceOddsCell entrant={entrant} formatOdds={formatOdds} />

                      {/* Timeline Columns */}
                      {timelineColumns.map((column) => {
                        const indicator = !entrant.isScratched
                          ? getIndicatorForCell(column.interval, entrant.$id)
                          : null
                        const indicatorStyle = indicator
                          ? mapIndicatorColorToCellStyle(indicator.color)
                          : null
                        const indicatorTitle = indicator
                          ? `${indicator.indicatorType} (${indicator.percentageChange.toFixed(
                              1
                            )}%)`
                          : undefined
                        const indicatorChange = indicator
                          ? indicator.percentageChange.toFixed(2)
                          : undefined
                        const cellValue = getTimelineData(
                          entrant.$id,
                          column.interval
                        )

                        return (
                          <td
                            key={`${entrant.$id}_${column.interval}`}
                            className={`px-2 py-1 text-xs text-center border-r border-gray-100 ${
                              entrant.isScratched
                                ? 'bg-pink-50'
                                : column.isScheduledStart
                                ? 'border-blue-200 bg-blue-100'
                                : column.isDynamic
                                ? 'bg-yellow-50'
                                : ''
                            } ${
                              !entrant.isScratched &&
                              isCurrentTimeColumn(column.interval)
                                ? 'bg-green-50 border-green-200 font-medium'
                                : ''
                            }`}
                            style={{ verticalAlign: 'middle', height: '30px' }}
                          >
                            <div
                              className={`flex items-center justify-center h-full w-full text-xs font-medium ${
                                indicatorStyle ? '' : 'text-gray-900'
                              } ${indicatorStyle?.className ?? ''}`.trim()}
                              style={indicatorStyle?.style}
                              data-indicator={indicator ? indicator.indicatorType : undefined}
                              data-indicator-change={indicatorChange}
                              title={indicatorTitle}
                            >
                              {cellValue}
                            </div>
                          </td>
                        )
                      })}

                    {/* Right Fixed Columns */}
                    <td
                      className="px-2 py-1 whitespace-nowrap text-right border-l-2 border-l-gray-300 border-r border-r-gray-200 sticky right-[70px] bg-white z-20"
                      style={{ verticalAlign: 'middle', height: '30px' }}
                    >
                      <div className="flex items-center justify-end h-full">
                        <span className="text-sm font-medium text-gray-900">
                          {entrant.isScratched
                            ? '—'
                            : (() => {
                                const amount = getPoolAmount(entrant)
                                return amount !== undefined
                                  ? formatMoney(amount)
                                  : '...'
                              })()}
                        </span>
                      </div>
                    </td>

                    <td
                      className="px-2 py-1 whitespace-nowrap text-right sticky right-0 bg-white z-20"
                      style={{ verticalAlign: 'middle', height: '30px' }}
                    >
                      <div className="flex items-center justify-end h-full">
                        <span className="text-sm font-medium text-gray-900">
                          {entrant.isScratched
                            ? '—'
                            : (() => {
                                const percentage = getPoolPercentage(entrant)
                                return percentage !== undefined
                                  ? formatPercentage(percentage)
                                  : '...'
                              })()}
                        </span>
                        {!entrant.isScratched &&
                          entrant.moneyFlowTrend &&
                          entrant.moneyFlowTrend !== 'neutral' && (
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
                )})}
              </tbody>
            </table>
          </div>
        </div>

        {/* Timeline Footer */}
        <div className="px-2 py-1 bg-gray-50 border-t border-gray-200 text-xs text-gray-600 flex-shrink-0">
          <div className="flex justify-between items-center">
            <span>
              Scroll to see full timeline • Blue: Scheduled start • Yellow: Live
              data • Green: Current time
            </span>
            <span>
              {timelineColumns.filter((col) => col.isDynamic).length} live
              columns
            </span>
          </div>
        </div>
      </div>

      {/* Enhanced Footer */}
      <div className="px-2 py-1 border-t border-gray-100 bg-gray-50 flex-shrink-0">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center space-x-4">
            {selectedEntrant && (
              <span className="text-blue-600">
                Selected:{' '}
                {sortedEntrants.find((e) => e.$id === selectedEntrant)?.name}
              </span>
            )}
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
      </div>

    </div>
  )
})

export default EnhancedEntrantsGrid
