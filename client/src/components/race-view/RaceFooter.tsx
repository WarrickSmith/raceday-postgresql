'use client'

import { memo, useEffect } from 'react'
import type {
  RacePoolData,
  RaceResultsData,
  RaceStatus,
} from '@/types/racePools'
import type { Race } from '@/types/meetings'
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
  raceStartTime: string
  raceStatus: RaceStatus
  poolData?: RacePoolData
  resultsData?: RaceResultsData
  entrants?: Array<{
    $id: string
    runnerNumber: number
    name: string
    winOdds?: number
    placeOdds?: number
  }>
  className?: string
  showCountdown?: boolean
  showResults?: boolean
  lastPoolUpdate?: Date | null
  lastResultsUpdate?: Date | null
  connectionHealth?: {
    isHealthy: boolean
    avgLatency: number | null
    uptime: number
  }
  // Real-time race data from unified subscription
  race?: Race | null
}

export const RaceFooter = memo(function RaceFooter({
  raceStartTime,
  raceStatus,
  poolData,
  resultsData,
  entrants = [],
  className = '',
  showCountdown = true,
  showResults = true,
  lastPoolUpdate,
  lastResultsUpdate,
  race = null,
}: RaceFooterProps) {
  // Use real-time data from props (from unified subscription) with context fallbacks
  const currentRaceStartTime = race?.startTime || raceStartTime
  const currentRaceStatus =
    (race?.status?.toLowerCase() as RaceStatus) || raceStatus
  const currentPoolData = poolData
  const currentResultsData = resultsData

  // Announce results availability when they become available
  useEffect(() => {
    if (
      currentResultsData &&
      currentResultsData.results.length > 0 &&
      showResults
    ) {
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
      className={`race-footer bg-white border-2 border-gray-300 shadow-lg rounded-lg h-40 ${className}`}
    >
      {/* Enhanced Three-Column Footer Layout: Pools | Results | Timing/Status */}
      <div className="flex h-full p-4">
        {/* Column 1: Pools Section */}
        <div className="w-96 flex-shrink-0 pr-4">
          <RacePoolsSection
            poolData={currentPoolData}
            lastUpdate={lastPoolUpdate}
          />
        </div>

        {/* Column 2: Results Section */}
        <div className="w-[470px] flex-shrink-0 pr-4">
          <RaceResultsSection
            resultsData={currentResultsData}
            lastUpdate={lastResultsUpdate}
          />
        </div>

        {/* Column 3: Timing/Status Section (Right) */}
        <div className="flex-grow flex items-center justify-end">
          <RaceTimingSection
            raceStartTime={currentRaceStartTime}
            raceStatus={currentRaceStatus}
            showCountdown={showCountdown}
            race={race}
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
