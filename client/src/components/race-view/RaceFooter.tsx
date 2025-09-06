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
  raceId: string
  raceStartTime: string
  raceStatus: RaceStatus
  poolData?: RacePoolData
  resultsData?: RaceResultsData
  className?: string
  showCountdown?: boolean
  showResults?: boolean
  lastPoolUpdate?: Date | null
  lastResultsUpdate?: Date | null
  connectionHealth?: {
    isHealthy: boolean
    avgLatency: number
    uptime: number
  }
  // Real-time race data from unified subscription
  race?: Race | null
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
  lastPoolUpdate,
  lastResultsUpdate,
  race = null,
}: RaceFooterProps) {
  // Use real-time data from props (from unified subscription) with context fallbacks
  const currentRaceStartTime = raceStartTime
  const currentRaceStatus = raceStatus
  const currentPoolData = poolData
  const currentResultsData = resultsData

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
            <RacePoolsSection 
              raceId={raceId} 
              poolData={currentPoolData} 
              lastUpdate={lastPoolUpdate}
            />
            <RaceResultsSection 
              resultsData={currentResultsData} 
              lastUpdate={lastResultsUpdate}
            />
          </div>
        </div>

        {/* Column 3: Timing/Status Section (Right) */}
        <div className="flex flex-col justify-center items-end">
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
