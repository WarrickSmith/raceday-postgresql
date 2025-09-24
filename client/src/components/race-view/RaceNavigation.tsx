'use client'

import React, { memo } from 'react'
import { RaceNavigationData } from '@/types/meetings'
import { useRaceNavigation } from '@/hooks/useRaceNavigation'
import { useLogger } from '@/utils/logging'

interface RaceNavigationProps {
  navigationData: RaceNavigationData
  currentRaceId?: string
}

export const RaceNavigation = memo(function RaceNavigation({
  navigationData,
  currentRaceId,
}: RaceNavigationProps) {
  const logger = useLogger('RaceNavigation');

  // Debug navigation data
  logger.debug('RaceNavigation rendered', {
    currentRaceId,
    hasNavigationData: !!navigationData,
    navigationData: navigationData ? {
      hasPrevious: !!navigationData.previousRace,
      hasNext: !!navigationData.nextRace,
      hasNextScheduled: !!navigationData.nextScheduledRace
    } : null
  });
  
  const {
    navigateToMeetings,
    navigateToNextScheduled,
    navigateToPrevious,
    navigateToNext,
    canNavigateToNextScheduled,
    canNavigateToPrevious,
    canNavigateToNext,
    navigationState,
  } = useRaceNavigation({
    navigationData,
    currentRaceId: currentRaceId || '',
    onError: (error) => {
      logger.error('Navigation error:', error)
    },
  })



  // Enhanced button classes with consistent sizing, improved styling, and responsive scaling
  const getButtonClasses = (isNavigating: boolean = false, isDisabled: boolean = false) => {
    const baseClasses = 'flex items-center justify-center gap-2 px-3 py-2.5 w-full h-10 text-sm font-medium transition-all duration-200 ease-in-out overflow-hidden whitespace-nowrap rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-opacity-50'
    
    if (isNavigating) {
      return `${baseClasses} text-blue-700 bg-blue-50 border border-blue-200 cursor-wait`
    }
    
    if (isDisabled) {
      return `${baseClasses} text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed opacity-50`
    }
    
    return `${baseClasses} text-gray-700 bg-gradient-to-b from-white to-gray-50 border border-gray-200 hover:shadow-md hover:bg-gradient-to-b hover:from-gray-50 hover:to-gray-100 hover:border-gray-300 focus:border-blue-300`
  }

  return (
    <div
      className="grid grid-cols-4 gap-2 sm:gap-3 w-full"
      role="navigation"
      aria-label="Race navigation"
    >
      {/* Meetings Button */}
      <button
        className={getButtonClasses(
          navigationState.isNavigating && navigationState.navigationTarget === 'meetings'
        )}
        onClick={navigateToMeetings}
        disabled={navigationState.isNavigating}
        aria-label="Navigate back to meetings list"
      >
        {navigationState.isNavigating && navigationState.navigationTarget === 'meetings' ? (
          <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        ) : (
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z"
            />
          </svg>
        )}
        <span className="truncate">Meetings</span>
      </button>

      {/* Next Scheduled Button */}
      <button
        className={getButtonClasses(
          navigationState.isNavigating && navigationState.navigationTarget === 'next-scheduled',
          !canNavigateToNextScheduled
        )}
        onClick={navigateToNextScheduled}
        disabled={navigationState.isNavigating || !canNavigateToNextScheduled}
        aria-label={
          canNavigateToNextScheduled 
            ? `Navigate to next scheduled race: ${navigationData.nextScheduledRace?.name}` 
            : "No next scheduled race available"
        }
        title={
          navigationData.nextScheduledRace
            ? `${navigationData.nextScheduledRace.name} at ${navigationData.nextScheduledRace.meetingName}`
            : "No upcoming races scheduled"
        }
      >
        {navigationState.isNavigating && navigationState.navigationTarget === 'next-scheduled' ? (
          <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        ) : (
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
        <span className="truncate">Next Scheduled</span>
      </button>

      {/* Previous Race Button */}
      <button
        className={getButtonClasses(
          navigationState.isNavigating && navigationState.navigationTarget === 'previous',
          !canNavigateToPrevious
        )}
        onClick={navigateToPrevious}
        disabled={navigationState.isNavigating || !canNavigateToPrevious}
        aria-label={
          canNavigateToPrevious 
            ? `Navigate to previous race: ${navigationData.previousRace?.name}` 
            : "No previous race available"
        }
        title={
          navigationData.previousRace
            ? `${navigationData.previousRace.name} at ${navigationData.previousRace.meetingName}`
            : "No previous race available"
        }
      >
        {navigationState.isNavigating && navigationState.navigationTarget === 'previous' ? (
          <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        ) : (
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        )}
        <span className="truncate">Previous</span>
      </button>

      {/* Next Race Button */}
      <button
        className={getButtonClasses(
          navigationState.isNavigating && navigationState.navigationTarget === 'next',
          !canNavigateToNext
        )}
        onClick={navigateToNext}
        disabled={navigationState.isNavigating || !canNavigateToNext}
        aria-label={
          canNavigateToNext 
            ? `Navigate to next race: ${navigationData.nextRace?.name}` 
            : "No next race available"
        }
        title={
          navigationData.nextRace
            ? `${navigationData.nextRace.name} at ${navigationData.nextRace.meetingName}`
            : "No next race available"
        }
      >
        <span className="truncate">Next</span>
        {navigationState.isNavigating && navigationState.navigationTarget === 'next' ? (
          <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        ) : (
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        )}
      </button>

    </div>
  )
})
