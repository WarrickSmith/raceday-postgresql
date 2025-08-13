'use client';

import React, { memo, useMemo, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RaceNavigationData, NavigationButtonState } from '@/types/meetings';

interface RaceNavigationProps {
  navigationData: RaceNavigationData;
  currentRaceId?: string; // Optional for future use
}

export const RaceNavigation = memo(function RaceNavigation({ 
  navigationData 
}: RaceNavigationProps) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  // Memoize navigation button states for performance
  const navigationStates = useMemo((): {
    previous: NavigationButtonState;
    next: NavigationButtonState;
    nextScheduled: NavigationButtonState;
    backToMeetings: NavigationButtonState;
  } => {
    return {
      previous: {
        isLoading: isNavigating,
        disabled: !navigationData.previousRace || isNavigating,
        disabledReason: !navigationData.previousRace ? 'No previous race available' : undefined
      },
      next: {
        isLoading: isNavigating,
        disabled: !navigationData.nextRace || isNavigating,
        disabledReason: !navigationData.nextRace ? 'No more scheduled races' : undefined
      },
      nextScheduled: {
        isLoading: isNavigating,
        disabled: !navigationData.nextScheduledRace || isNavigating,
        disabledReason: !navigationData.nextScheduledRace ? 'No upcoming races available' : undefined
      },
      backToMeetings: {
        isLoading: isNavigating,
        disabled: isNavigating,
        disabledReason: undefined
      }
    };
  }, [navigationData, isNavigating]);

  // Navigation handler with error handling and data preservation
  const handleNavigation = useCallback(async (direction: 'previous' | 'next' | 'nextScheduled' | 'backToMeetings') => {
    if (isNavigating) return;

    let targetPath: string;

    switch (direction) {
      case 'previous':
        if (!navigationData.previousRace) return;
        targetPath = `/race/${navigationData.previousRace.raceId}`;
        break;
      case 'next':
        if (!navigationData.nextRace) return;
        targetPath = `/race/${navigationData.nextRace.raceId}`;
        break;
      case 'nextScheduled':
        if (!navigationData.nextScheduledRace) return;
        targetPath = `/race/${navigationData.nextScheduledRace.raceId}`;
        break;
      case 'backToMeetings':
        targetPath = '/';
        break;
      default:
        return;
    }

    try {
      setIsNavigating(true);
      
      // Use client-side navigation to preserve component state and historical data
      await router.push(targetPath);
    } catch (error) {
      console.error(`Navigation to ${direction} failed:`, error);
      setIsNavigating(false);
    }
  }, [navigationData, router, isNavigating]);

  const handlePreviousClick = useCallback(() => {
    handleNavigation('previous');
  }, [handleNavigation]);

  const handleNextClick = useCallback(() => {
    handleNavigation('next');
  }, [handleNavigation]);

  const handleNextScheduledClick = useCallback(() => {
    handleNavigation('nextScheduled');
  }, [handleNavigation]);

  const handleBackToMeetingsClick = useCallback(() => {
    handleNavigation('backToMeetings');
  }, [handleNavigation]);

  // Common button classes for consistent sizing
  const buttonClasses = "flex items-center justify-center gap-2 px-4 py-2 min-w-[120px] text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

  return (
    <div className="flex items-center gap-3 flex-wrap" role="navigation" aria-label="Race navigation">
      {/* Back to Meetings Button */}
      <button
        onClick={handleBackToMeetingsClick}
        disabled={navigationStates.backToMeetings.disabled}
        className={buttonClasses}
        aria-label="Navigate back to meetings list"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
        <span>Meetings</span>
        {navigationStates.backToMeetings.isLoading && (
          <svg className="animate-spin w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        )}
      </button>

      {/* Previous Race Button */}
      <button
        onClick={handlePreviousClick}
        disabled={navigationStates.previous.disabled}
        className={buttonClasses}
        aria-label="Navigate to previous race"
        title={navigationStates.previous.disabledReason}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span>Previous</span>
        {navigationStates.previous.isLoading && (
          <svg className="animate-spin w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        )}
      </button>

      {/* Next Race Button */}
      <button
        onClick={handleNextClick}
        disabled={navigationStates.next.disabled}
        className={buttonClasses}
        aria-label="Navigate to next race"
        title={navigationStates.next.disabledReason}
      >
        <span>Next</span>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {navigationStates.next.isLoading && (
          <svg className="animate-spin w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        )}
      </button>

      {/* Next Scheduled Button */}
      <button
        onClick={handleNextScheduledClick}
        disabled={navigationStates.nextScheduled.disabled}
        className={buttonClasses}
        aria-label="Navigate to next scheduled race (nearest to start time)"
        title={navigationStates.nextScheduled.disabledReason}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Next Scheduled</span>
        {navigationStates.nextScheduled.isLoading && (
          <svg className="animate-spin w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        )}
      </button>
    </div>
  );
});