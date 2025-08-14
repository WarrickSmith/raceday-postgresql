'use client';

import React, { memo, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RaceNavigationData, NavigationButtonState } from '@/types/meetings';
import { useRace } from '@/contexts/RaceContext';
import { screenReader, AriaLabels, KeyboardHandler } from '@/utils/accessibility';

interface RaceNavigationProps {
  navigationData: RaceNavigationData;
  currentRaceId?: string; // Optional for future use
}

export const RaceNavigation = memo(function RaceNavigation({ 
  navigationData 
}: RaceNavigationProps) {
  const router = useRouter();
  const { isLoading: isNavigating, navigateToRace } = useRace();

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

  // Navigation handler with error handling and accessibility announcements
  const handleNavigation = useCallback(async (direction: 'previous' | 'next' | 'nextScheduled' | 'backToMeetings') => {
    if (isNavigating) return;

    switch (direction) {
      case 'previous':
        if (!navigationData.previousRace) return;
        await navigateToRace(navigationData.previousRace.raceId);
        // Announce navigation for screen readers
        screenReader?.announceRaceNavigation(
          navigationData.previousRace.name,
          navigationData.previousRace.meetingName
        );
        break;
      case 'next':
        if (!navigationData.nextRace) return;
        await navigateToRace(navigationData.nextRace.raceId);
        screenReader?.announceRaceNavigation(
          navigationData.nextRace.name,
          navigationData.nextRace.meetingName
        );
        break;
      case 'nextScheduled':
        if (!navigationData.nextScheduledRace) return;
        await navigateToRace(navigationData.nextScheduledRace.raceId);
        screenReader?.announceRaceNavigation(
          navigationData.nextScheduledRace.name,
          navigationData.nextScheduledRace.meetingName
        );
        break;
      case 'backToMeetings':
        // For meetings, still use router navigation as it's a different page structure
        router.push('/');
        screenReader?.announce('Navigated back to meetings list', 'assertive');
        break;
      default:
        return;
    }
  }, [navigationData, router, isNavigating, navigateToRace]);

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

  // Keyboard navigation handler for the navigation container
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll('button:not([disabled])')) as HTMLElement[];
    const currentIndex = buttons.findIndex(button => button === document.activeElement);
    
    if (currentIndex !== -1) {
      KeyboardHandler.handleTabNavigation(
        event.nativeEvent,
        buttons,
        currentIndex,
        (newIndex) => {
          buttons[newIndex]?.focus();
        }
      );
    }
  }, []);

  // Enhanced button classes with better focus indicators
  const buttonClasses = "flex items-center justify-center gap-2 px-4 py-2 min-w-[120px] text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-opacity-75 focus:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ease-in-out";

  return (
    <div 
      className="flex items-center gap-3 flex-wrap" 
      role="navigation" 
      aria-label="Race navigation"
      onKeyDown={handleKeyDown}
    >
      {/* Back to Meetings Button */}
      <button
        onClick={handleBackToMeetingsClick}
        disabled={navigationStates.backToMeetings.disabled}
        className={buttonClasses}
        aria-label="Navigate back to meetings list"
        aria-describedby={navigationStates.backToMeetings.disabledReason ? 'back-to-meetings-desc' : undefined}
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
        aria-label={AriaLabels.generateNavigationLabel(
          'previous',
          navigationData.previousRace?.name,
          navigationData.previousRace?.meetingName,
          navigationData.previousRace?.startTime
        )}
        title={navigationStates.previous.disabledReason}
        aria-describedby={navigationStates.previous.disabledReason ? 'previous-race-desc' : undefined}
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
        aria-label={AriaLabels.generateNavigationLabel(
          'next',
          navigationData.nextRace?.name,
          navigationData.nextRace?.meetingName,
          navigationData.nextRace?.startTime
        )}
        title={navigationStates.next.disabledReason}
        aria-describedby={navigationStates.next.disabledReason ? 'next-race-desc' : undefined}
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
        aria-label={AriaLabels.generateNavigationLabel(
          'next scheduled',
          navigationData.nextScheduledRace?.name,
          navigationData.nextScheduledRace?.meetingName,
          navigationData.nextScheduledRace?.startTime
        )}
        title={navigationStates.nextScheduled.disabledReason}
        aria-describedby={navigationStates.nextScheduled.disabledReason ? 'next-scheduled-desc' : undefined}
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
      
      {/* Hidden descriptions for screen readers */}
      {navigationStates.previous.disabledReason && (
        <div id="previous-race-desc" className="sr-only">
          {navigationStates.previous.disabledReason}
        </div>
      )}
      {navigationStates.next.disabledReason && (
        <div id="next-race-desc" className="sr-only">
          {navigationStates.next.disabledReason}
        </div>
      )}
      {navigationStates.nextScheduled.disabledReason && (
        <div id="next-scheduled-desc" className="sr-only">
          {navigationStates.nextScheduled.disabledReason}
        </div>
      )}
      {navigationStates.backToMeetings.disabledReason && (
        <div id="back-to-meetings-desc" className="sr-only">
          {navigationStates.backToMeetings.disabledReason}
        </div>
      )}
      
      {/* Navigation instructions for keyboard users */}
      <div className="sr-only" aria-hidden="true">
        Use left and right arrow keys to navigate between buttons. Press Enter or Space to activate.
      </div>
    </div>
  );
});