'use client'

import { memo, useState, useEffect, useMemo } from 'react'
import { useRace } from '@/contexts/RaceContext'
import { formatDistance, formatRaceTime } from '@/utils/raceFormatters'
import { getStatusConfig } from '@/utils/raceStatusConfig'
import { RaceNavigation } from './RaceNavigation'
import { getRaceTypeDisplay } from '@/constants/race_types'
import { ConnectionStatusBadge } from '@/components/dashboard/ConnectionStatusBadge'
import {
  getConnectionState,
  subscribeToConnectionState,
  type ConnectionState,
} from '@/state/connectionState'
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
  onConfigureAlerts?: () => void
}

export const RaceDataHeader = memo(function RaceDataHeader({
  className = '',
  race: propRace,
  entrants: propEntrants,
  meeting: propMeeting,
  navigationData: propNavigationData,
  onConfigureAlerts,
}: RaceDataHeaderProps) {
  const { raceData } = useRace()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [connectionState, setConnectionState] = useState<ConnectionState>(() =>
    getConnectionState()
  )

  // Use props data if provided (from unified subscription), otherwise fall back to context
  const race = propRace || raceData?.race
  const entrants = useMemo(
    () => propEntrants || raceData?.entrants || [],
    [propEntrants, raceData?.entrants]
  )
  const meeting = propMeeting || raceData?.meeting

  // Use navigation data from props or context (no real-time hook)
  const navigationData = propNavigationData || raceData?.navigationData

  // Real-time clock update
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Subscribe to connection state changes
  useEffect(() => {
    const unsubscribe = subscribeToConnectionState((state) => {
      setConnectionState(state)
    })

    return unsubscribe
  }, [])

  const statusConfig = useMemo(
    () => getStatusConfig(race?.status),
    [race?.status]
  )

  // Memoized calculations to reduce re-renders (move before early return to avoid hook call errors)
  const formattedTime = useMemo(
    () => (race?.start_time ? formatRaceTime(race.start_time) : ''),
    [race?.start_time]
  )
  const formattedDistance = useMemo(
    () => (race?.distance ? formatDistance(race.distance) : null),
    [race?.distance]
  )
  const runnersCount = useMemo(
    () => entrants.length || race?.runner_count || 0,
    [entrants.length, race?.runner_count]
  )
  const scratchedCount = useMemo(
    () => entrants.filter((e) => e.is_scratched).length || 0,
    [entrants]
  )
  const formattedRaceType = useMemo(() => {
    if (!meeting) return ''

    // Priority 1: Use category code for abbreviated display
    if (meeting.category) {
      const abbreviated = getRaceTypeDisplay(meeting.category)
      if (abbreviated && abbreviated !== meeting.category) {
        return abbreviated
      }
    }

    // Priority 2: Fallback to full race type (will be truncated by CSS)
    return meeting.race_type || ''
  }, [meeting])

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
                currentRaceId={race.race_id}
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
            Race {race.race_number}: {race.name}
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
            {race.track_condition || 'Synthetic'}
          </div>
        </div>

        {/* Row 2, Col 4: Race Status and Alerts Config */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500 font-bold uppercase">
              RACE STATUS
            </div>
            <div className="flex items-center gap-1">
              {/* Use a text dot with status color to avoid dynamic Tailwind class names */}
              <span className={`${statusConfig.color} text-base leading-none`}>
                ●
              </span>
              <span className={`text-sm font-semibold ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Alerts Configuration Button */}
            {onConfigureAlerts && (
              <button
                onClick={onConfigureAlerts}
                className="text-xs px-2 py-1 rounded transition-colors bg-gray-400 text-gray-800 hover:bg-gray-300 hover:text-gray-700"
                title="Configure indicators"
                aria-label="Open indicators configuration"
              >
                ⚙️
              </button>
            )}
          </div>
        </div>

        {/* Row 3, Col 1: Meeting info */}
        <div className="flex items-center gap-1 text-sm text-gray-700 overflow-hidden">
          <span className="font-medium">{meeting.meeting_name}</span>
          <span>•</span>
          <span>{meeting.country}</span>
          <span>•</span>
          <time dateTime={race.start_time} className="font-mono">
            {formattedTime}
          </time>
          <span>•</span>
          <span className="text-purple-800 font-medium max-w-24 whitespace-nowrap">
            {formattedRaceType}
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

        {/* Row 3, Col 4: Connection Status */}
        <div className="flex items-center justify-start gap-2">
          <div className="text-xs text-gray-500 font-bold uppercase">
            CONNECTION STATUS
          </div>
          <ConnectionStatusBadge state={connectionState} />
        </div>
      </div>
    </div>
  )
})
