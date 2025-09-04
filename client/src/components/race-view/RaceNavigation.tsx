'use client';

import React, { memo, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RaceNavigationData, NavigationButtonState } from '@/types/meetings';
import { useRace } from '@/contexts/RaceContext';
import { screenReader, AriaLabels, KeyboardHandler } from '@/utils/accessibility';
import { raceCache } from '@/lib/cache';

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
    if (isNavigating) {
      console.log('🚫 Navigation blocked - already navigating');
      return;
    }

    console.log('🎯 Navigation button clicked:', direction, 'Available navigation data:', {
      previous: navigationData.previousRace?.raceId,
      next: navigationData.nextRace?.raceId,
      nextScheduled: navigationData.nextScheduledRace?.raceId
    });

    switch (direction) {
      case 'previous':
        if (!navigationData.previousRace) {
          console.log('❌ No previous race available');
          return;
        }
        console.log('⬅️ Navigating to previous race:', navigationData.previousRace.raceId);
        await navigateToRace(navigationData.previousRace.raceId);
        // Announce navigation for screen readers
        screenReader?.announceRaceNavigation(
          navigationData.previousRace.name,
          navigationData.previousRace.meetingName
        );
        break;
      case 'next':
        if (!navigationData.nextRace) {
          console.log('❌ No next race available');
          return;
        }
        console.log('➡️ Navigating to next race:', navigationData.nextRace.raceId);
        await navigateToRace(navigationData.nextRace.raceId);
        screenReader?.announceRaceNavigation(
          navigationData.nextRace.name,
          navigationData.nextRace.meetingName
        );
        break;
      case 'nextScheduled':
        if (!navigationData.nextScheduledRace) {
          console.log('❌ No next scheduled race available');
          return;
        }
        console.log('⏰ Navigating to next scheduled race:', navigationData.nextScheduledRace.raceId);
        await navigateToRace(navigationData.nextScheduledRace.raceId);
        screenReader?.announceRaceNavigation(
          navigationData.nextScheduledRace.name,
          navigationData.nextScheduledRace.meetingName
        );
        break;
      case 'backToMeetings':
        console.log('🏠 Navigating back to meetings');
        // For meetings, still use router navigation as it's a different page structure
        router.push('/');
        screenReader?.announce('Navigated back to meetings list', 'assertive');
        break;
      default:
        console.log('❓ Unknown navigation direction:', direction);
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

  // Pre-cache adjacent race data for instant navigation
  useEffect(() => {
    const preCacheAdjacentRaces = async () => {
      const promises = [];
      
      // Pre-cache previous race if available
      if (navigationData.previousRace) {
        promises.push(
          raceCache.get(
            `race:${navigationData.previousRace!.raceId}:navigation`,
            () => fetch(`/api/race/${navigationData.previousRace!.raceId}?nav=true`).then(r => r.json()),
            15000
          ).catch(error => console.warn('Failed to pre-cache previous race:', error))
        );
      }

      // Pre-cache next race if available  
      if (navigationData.nextRace) {
        promises.push(
          raceCache.get(
            `race:${navigationData.nextRace!.raceId}:navigation`,
            () => fetch(`/api/race/${navigationData.nextRace!.raceId}?nav=true`).then(r => r.json()),
            15000
          ).catch(error => console.warn('Failed to pre-cache next race:', error))
        );
      }

      // Pre-cache next scheduled race if available
      if (navigationData.nextScheduledRace) {
        promises.push(
          raceCache.get(
            `race:${navigationData.nextScheduledRace!.raceId}:navigation`,
            () => fetch(`/api/race/${navigationData.nextScheduledRace!.raceId}?nav=true`).then(r => r.json()),
            15000
          ).catch(error => console.warn('Failed to pre-cache next scheduled race:', error))
        );
      }

      // Execute pre-caching in background
      if (promises.length > 0) {
        Promise.all(promises).then(() => {
          console.log('✅ Pre-cached', promises.length, 'adjacent races for instant navigation');
        });
      }
    };

    preCacheAdjacentRaces();
  }, [navigationData]);

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

  // Enhanced button classes with consistent sizing, shadows, and better hover effects
  const buttonClasses = "flex items-center justify-center gap-2 px-4 py-2.5 min-w-[120px] h-10 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 hover:shadow-md hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-opacity-75 focus:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm disabled:hover:bg-white transition-all duration-200 ease-in-out";

  return (
    <div 
      className="flex items-center gap-3 flex-wrap" 
      role="navigation" 
      aria-label="Race navigation"
      onKeyDown={handleKeyDown}
    >
      {/* Meetings Button */}
      <button
        onClick={handleBackToMeetingsClick}
        disabled={navigationStates.backToMeetings.disabled}
        className={buttonClasses}
        aria-label="Navigate back to meetings list"
        aria-describedby={navigationStates.backToMeetings.disabledReason ? 'back-to-meetings-desc' : undefined}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
        </svg>
        <span>Meetings</span>
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
      </button>

      {/* Previous/Next Button Pair - wrappable as a unit with consistent gap */}
      <div className="flex items-center gap-3">
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
        </button>
      </div>
      
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