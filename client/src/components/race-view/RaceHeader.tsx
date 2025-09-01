'use client'

import { memo, useMemo } from 'react'
import { Race, Meeting, RaceNavigationData } from '@/types/meetings'
import { useRealtimeRace } from '@/hooks/useRealtimeRace'
import {
  formatDistance,
  formatRaceTime,
  formatCategory,
} from '@/utils/raceFormatters'
import { RaceNavigation } from './RaceNavigation'
import { useRace } from '@/contexts/RaceContext'

interface RaceHeaderProps {
  initialRace: Race
  meeting: Meeting
  navigationData: RaceNavigationData
}

export const RaceHeader = memo(function RaceHeader({
  initialRace,
  meeting,
  navigationData,
}: RaceHeaderProps) {
  const { raceData } = useRace()

  // Use context data if available, fallback to props for initial render
  const currentRace = raceData?.race || initialRace
  const currentMeeting = raceData?.meeting || meeting
  const currentNavigationData = raceData?.navigationData || navigationData

  const { race, isConnected } = useRealtimeRace({ initialRace: currentRace })
  const formattedTime = useMemo(
    () => formatRaceTime(race.startTime),
    [race.startTime]
  )

  const formattedDistance = useMemo(
    () => formatDistance(race.distance),
    [race.distance]
  )

  return (
    <header className="bg-white rounded-lg shadow-md p-6 mb-6" role="banner">
      {/* Race Navigation */}
      <div className="mb-4 pb-4 border-b border-gray-200">
        <RaceNavigation
          navigationData={currentNavigationData}
          currentRaceId={race.raceId}
        />
      </div>
      {/* Screen reader announcement for race updates */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        Race {race.raceNumber} {race.name}
        Race type: {currentMeeting.raceType} Category:{' '}
        {formatCategory(currentMeeting.category)}
        {formattedDistance && ` Distance: ${formattedDistance}`}
        {race.trackCondition && ` Track condition: ${race.trackCondition}`}
      </div>
      <div className="mb-4">
        {/* Connection Status Indicator */}
        <div className="flex justify-end mb-2">
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              isConnected
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}
            aria-live="polite"
            aria-label={
              isConnected
                ? 'Connected to live data'
                : 'Disconnected from live data'
            }
          >
            {isConnected ? '🔄 Live' : '📶 Disconnected'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <span>{currentMeeting.country}</span>
          <span>•</span>
          <span>{currentMeeting.meetingName}</span>
          <span>•</span>
          <time dateTime={race.startTime}>{formattedTime}</time>
        </div>

        <h1
          className="text-2xl font-bold text-gray-900 mb-2 font-inter leading-tight"
          id="race-title"
          aria-describedby="race-meta"
        >
          Race {race.raceNumber}: {race.name}
        </h1>

        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
          id="race-meta"
          role="group"
          aria-labelledby="race-title"
        >
          <div className="flex items-center gap-4 flex-wrap">
            {formattedDistance && (
              <div className="flex items-center">
                <span className="text-sm text-gray-500">Distance:</span>
                <span className="ml-2 text-sm font-semibold text-gray-800">
                  {formattedDistance}
                </span>
              </div>
            )}

            {race.trackCondition && (
              <div className="flex items-center">
                <span className="text-sm text-gray-500">Track:</span>
                <span className="ml-2 text-sm font-semibold text-gray-800">
                  {race.trackCondition}
                </span>
              </div>
            )}

            <div className="flex items-center">
              <span className="text-sm text-gray-500">Type:</span>
              <span className="ml-2 text-sm font-semibold text-gray-800">
                {currentMeeting.raceType}
              </span>
            </div>

            <div className="flex items-center">
              <span className="text-sm text-gray-500">Category:</span>
              <span className="ml-2 text-sm font-semibold text-gray-800">
                {formatCategory(currentMeeting.category)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center">
              <span className="text-sm text-gray-500">Race ID:</span>
              <span className="ml-2 text-sm font-mono text-gray-700">
                {race.raceId}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
})
