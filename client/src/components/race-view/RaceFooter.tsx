'use client'

import { memo, useEffect } from 'react'
import type {
  RacePoolData,
  RaceResultsData,
  RaceStatus,
} from '@/types/racePools'
import { useRace } from '@/contexts/RaceContext'
import { useRealtimeRace } from '@/hooks/useRealtimeRace'
import { useRacePoolData } from '@/hooks/useRacePoolData'
import { screenReader } from '@/utils/accessibility'
import { STATUS_CONFIG, getStatusConfig } from '@/utils/raceStatusConfig'
import { RaceTimingSection } from '@/components/race-view/RaceTimingSection'
import { RacePoolsSection } from '@/components/race-view/RacePoolsSection'
import { RaceResultsSection } from '@/components/race-view/RaceResultsSection'

// Utility function to convert cents to dollars for display (rounded to nearest dollar)
const formatPoolAmount = (cents: number): string => {
  const dollars = Math.round(cents / 100) // Round to nearest dollar
  return dollars.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

interface RaceFooterProps {
  raceId: string
  raceStartTime: string
  raceStatus: RaceStatus
  poolData?: RacePoolData
  resultsData?: RaceResultsData
  className?: string
  showCountdown?: boolean
  showResults?: boolean
}

export const RaceFooter = memo(function RaceFooter({
  raceId,
  raceStartTime,
  raceStatus,
  poolData,
  resultsData,
  className = '',
  showCountdown = true,
  showResults = true,
}: RaceFooterProps) {
  const { raceData } = useRace()

  // Use the same approach as RaceDataHeader - useRealtimeRace with proper fallback
  const { race: liveRace } = useRealtimeRace({
    initialRace: raceData?.race || {
      $id: raceId || 'fallback',
      raceId: raceId || 'fallback',
      startTime: raceStartTime,
      status: raceStatus,
      name: '',
      raceNumber: 0,
      meeting: '',
      distance: undefined,
      trackCondition: undefined,
      $createdAt: '',
      $updatedAt: '',
    },
  })

  // Get real-time pool data for synchronization with header and entrants
  const {
    poolData: livePoolData,
    isLoading: poolLoading,
    error: poolError,
  } = useRacePoolData(liveRace?.raceId || raceId)

  // Use live race data (same as header)
  const currentRaceStartTime = liveRace?.startTime || raceStartTime

  // Use live race status with proper type validation (case-insensitive)
  const validStatuses: RaceStatus[] = [
    'open',
    'closed',
    'interim',
    'final',
    'abandoned',
    'postponed',
  ]
  const liveRaceStatus = liveRace?.status
  const currentRaceStatus: RaceStatus =
    liveRaceStatus &&
    validStatuses.includes(liveRaceStatus.toLowerCase() as RaceStatus)
      ? (liveRaceStatus.toLowerCase() as RaceStatus)
      : raceStatus

  // Use live pool data with fallback to prop for compatibility
  const currentPoolData = livePoolData || poolData

  // Build results data from live race data if available
  const currentResultsData: RaceResultsData | undefined = 
    liveRace?.resultsData && liveRace?.dividendsData ? {
      results: liveRace.resultsData,
      dividends: liveRace.dividendsData,
      status: liveRace.resultStatus || 'final',
      photoFinish: liveRace.photoFinish || false,
      stewardsInquiry: liveRace.stewardsInquiry || false,
      protestLodged: liveRace.protestLodged || false,
      declaredAt: liveRace.resultTime || new Date().toISOString()
    } : resultsData

  // Get fixed odds data from live race if available
  const currentFixedOddsData = liveRace?.fixedOddsData || undefined

  // Announce results availability when they become available
  useEffect(() => {
    if (currentResultsData && currentResultsData.results.length > 0 && showResults) {
      // Announce results availability
      screenReader?.announce(
        `Race results are now available with ${currentResultsData.results.length} positions`,
        'assertive'
      )
    }
  }, [currentResultsData, showResults])

  // Announce race status changes
  useEffect(() => {
    const statusConfig = getStatusConfig(currentRaceStatus)
    if (statusConfig) {
      screenReader?.announceRaceStatusChange(statusConfig.description)
    }
  }, [currentRaceStatus])

  return (
    <div
      className={`race-footer bg-white border-2 border-gray-300 shadow-lg rounded-lg ${className}`}
    >
      {/* Enhanced Three-Column Footer Layout: Pools | Results | Timing/Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {/* Column 1-2: Separate Pools and Results sections restored */}
        <div className="flex flex-col justify-center col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <RacePoolsSection raceId={raceId} poolData={currentPoolData} />
            <RaceResultsSection resultsData={currentResultsData} fixedOddsData={currentFixedOddsData} />
          </div>
        </div>

        {/* Column 3: Timing/Status Section (Right) */}
        <div className="flex flex-col justify-center items-end">
          <RaceTimingSection
            raceStartTime={currentRaceStartTime}
            raceStatus={currentRaceStatus}
            showCountdown={showCountdown}
          />
        </div>
      </div>

      {/* Accessibility announcements */}
      <div className="sr-only" aria-live="polite">
        Race status: {STATUS_CONFIG[currentRaceStatus]?.description}.
        {currentPoolData &&
          ` Total pool: ${currentPoolData.currency}${formatPoolAmount(
            currentPoolData.totalRacePool
          )}.`}
        {currentResultsData &&
          currentResultsData.results.length > 0 &&
          ` Results available with ${currentResultsData.results.length} positions.`}
      </div>
    </div>
  )
})

export default RaceFooter
