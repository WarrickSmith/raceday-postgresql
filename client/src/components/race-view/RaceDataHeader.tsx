'use client'

import { memo, useState, useEffect, useMemo } from 'react'
import { useRace } from '@/contexts/RaceContext'
import { formatDistance, formatRaceTime } from '@/utils/raceFormatters'
import { RaceNavigation } from './RaceNavigation'
import { useRenderTracking } from '@/utils/performance'
import type {
  Race,
  Entrant,
  Meeting,
  RaceNavigationData,
} from '@/types/meetings'

interface RaceDataHeaderProps {
  className?: string
  race?: Race | null
  entrants?: Entrant[]
  meeting?: Meeting | null
  navigationData?: RaceNavigationData | null
  connectionHealth?: {
    isHealthy: boolean
    avgLatency: number | null
    uptime: number
  }
  lastUpdate?: Date | null
}

export const RaceDataHeader = memo(function RaceDataHeader({
  className = '',
  race: propRace,
  entrants: propEntrants,
  meeting: propMeeting,
  navigationData: propNavigationData,
  connectionHealth,
  lastUpdate,
}: RaceDataHeaderProps) {
  const { raceData } = useRace()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [updateCount, setUpdateCount] = useState(0)

  // Track renders for performance monitoring
  const renderCount = useRenderTracking('RaceDataHeader')

  // Use props data if provided (from unified subscription), otherwise fall back to context
  const race = propRace || raceData?.race
  const entrants = propEntrants || raceData?.entrants || []
  const meeting = propMeeting || raceData?.meeting
  const navigationData = propNavigationData || raceData?.navigationData

  // Track MoneyFlow grid data updates
  useEffect(() => {
    setUpdateCount((prev) => prev + 1)
  }, [entrants])

  // Real-time clock update
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Format last update timestamp for display
  const formatLastUpdate = useMemo(() => {
    if (!lastUpdate) return null
    return lastUpdate.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }, [lastUpdate])

  // Get connection health status
  const healthStatus = useMemo(() => {
    if (!connectionHealth) return { status: 'unknown', color: 'gray' }

    if (connectionHealth.isHealthy) return { status: 'Live', color: 'green' }
    if (connectionHealth.avgLatency && connectionHealth.avgLatency > 0)
      return { status: 'Slow', color: 'yellow' }
    return { status: 'Offline', color: 'red' }
  }, [connectionHealth])

  // Memoized calculations to reduce re-renders (move before early return to avoid hook call errors)
  const formattedTime = useMemo(
    () => (race?.startTime ? formatRaceTime(race.startTime) : ''),
    [race?.startTime]
  )
  const formattedDistance = useMemo(
    () => (race?.distance ? formatDistance(race.distance) : null),
    [race?.distance]
  )
  const runnersCount = useMemo(
    () => entrants.length || race?.runnerCount || 0,
    [entrants.length, race?.runnerCount]
  )
  const scratchedCount = useMemo(
    () => entrants.filter((e) => e.isScratched).length || 0,
    [entrants]
  )
  const avgLatency = useMemo(
    () => connectionHealth?.avgLatency || null,
    [connectionHealth]
  )

  if (!race || !meeting) {
    return (
      <div
        className={`bg-white rounded-lg border border-gray-200 ${className}`}
        role="banner"
      >
        <div className="animate-pulse p-6">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`bg-white rounded-lg shadow-md ${className}`}
      role="banner"
      style={{ border: '1px solid rgba(209, 213, 219, 0.6)' }}
    >
      {/* 3x4 grid matching target image layout */}
      <div
        className="grid grid-cols-4 gap-2 p-3 min-h-[120px]"
        style={{ gridTemplateColumns: '2fr 200px 200px 200px' }}
      >
        {/* Row 1, Col 1: Navigation */}
        <div className="flex items-start justify-start">
          <div className="flex flex-wrap items-center gap-2">
            {navigationData && (
              <RaceNavigation
                navigationData={navigationData}
                currentRaceId={race.raceId}
              />
            )}
          </div>
        </div>

        {/* Row 1, Col 2: Date */}
        <div className="flex items-center justify-start">
          <div className="text-sm text-gray-600">
            {currentTime.toLocaleDateString('en-NZ', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>

        {/* Row 1, Col 3: Time */}
        <div className="flex items-center justify-start">
          <div className="text-lg font-bold text-gray-900 font-mono">
            {currentTime.toLocaleTimeString('en-US', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </div>
        </div>

        {/* Row 1, Col 4: Logo (centered) */}
        <div className="flex items-center justify-center">
          <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg px-2 py-1 text-center text-gray-500 font-bold text-xs">
            LOGO Image
            <br />
            Placeholder
          </div>
        </div>

        {/* Row 2, Col 1: Race Title */}
        <div className="flex flex-col justify-start overflow-hidden">
          <h1 className="text-2xl font-bold text-gray-900 mb-1 leading-tight truncate whitespace-nowrap">
            Race {race.raceNumber}: {race.name}
          </h1>
        </div>

        {/* Row 2, Col 2: Weather */}
        <div className="flex items-center justify-start gap-2">
          <div className="text-xs text-gray-500 font-bold uppercase">
            WEATHER
          </div>
          <div className="text-sm font-semibold text-gray-800">
            {race.weather || 'overcast'}
          </div>
        </div>

        {/* Row 2, Col 3: Track Condition */}
        <div className="flex items-center justify-start gap-2">
          <div className="text-xs text-gray-500 font-bold uppercase">
            TRACK COND
          </div>
          <div className="text-sm font-semibold text-green-800">
            {race.trackCondition || 'Synthetic'}
          </div>
        </div>

        {/* Row 2, Col 4: Status with Real-time Health */}
        <div className="flex items-center justify-start gap-2">
          <div className="text-xs text-gray-500 font-bold uppercase">
            STATUS
          </div>
          <div className="flex items-center gap-1">
            <div
              className={`w-2 h-2 rounded-full bg-${healthStatus.color}-500`}
            ></div>
            <span
              className={`text-sm font-semibold text-${healthStatus.color}-800`}
            >
              {healthStatus.status}
            </span>
            {formatLastUpdate && (
              <span className="text-xs text-gray-500 ml-1">
                @{formatLastUpdate}
              </span>
            )}
          </div>
        </div>

        {/* Row 3, Col 1: Meeting info with inline RENDERS */}
        <div className="flex items-center gap-1 text-sm text-gray-700 flex-wrap">
          <span className="font-medium">{meeting.meetingName}</span>
          <span>•</span>
          <span>{meeting.country}</span>
          <span>•</span>
          <time dateTime={race.startTime} className="font-mono">
            {formattedTime}
          </time>
          <span className="text-purple-800 font-medium">
            {meeting.raceType}
          </span>
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

        {/* Row 3, Col 2: Race Distance */}
        <div className="flex items-center justify-start gap-2">
          <div className="text-xs text-gray-500 font-bold uppercase">
            RACE DISTANCE
          </div>
          <div className="text-sm font-semibold text-blue-800">
            {formattedDistance || '2.1km'}
          </div>
        </div>

        {/* Row 3, Col 3: Runners (SCR) */}
        <div className="flex items-center justify-start gap-2">
          <div className="text-xs text-gray-500 font-bold uppercase">
            RUNNERS (SCR)
          </div>
          <div className="text-sm font-semibold">
            <span className="text-blue-800">
              {runnersCount > 0
                ? scratchedCount > 0
                  ? `${runnersCount - scratchedCount}`
                  : runnersCount
                : '8'}
            </span>
            <span className="text-blue-800">
              {scratchedCount > 0 ? ` (${scratchedCount})` : ' (2)'}
            </span>
          </div>
        </div>

        {/* Row 3, Col 4: Real-time Connection Latency */}
        <div className="flex items-center justify-start gap-2">
          <div className="text-xs text-gray-500 font-bold uppercase">
            LATENCY
          </div>
          <div
            className={`text-sm font-semibold ${
              avgLatency === null
                ? 'text-gray-600'
                : avgLatency > 200
                ? 'text-red-800'
                : avgLatency > 100
                ? 'text-yellow-800'
                : 'text-green-800'
            }`}
          >
            {avgLatency === null ? '—' : `${avgLatency.toFixed(2)}ms`}
          </div>
        </div>
      </div>
    </div>
  )
})
