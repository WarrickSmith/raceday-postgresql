'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RaceNavigationData } from '@/types/meetings';

interface UseRaceNavigationOptions {
  navigationData: RaceNavigationData | null;
  currentRaceId: string;
  onNavigationStart?: (target: string) => void | Promise<void>;
  onNavigationComplete?: () => void;
  onError?: (error: Error) => void;
}

interface NavigationState {
  isNavigating: boolean;
  navigationTarget: string | null;
  error: string | null;
}

export function useRaceNavigation({
  navigationData,
  currentRaceId,
  onNavigationStart,
  onNavigationComplete,
  onError,
}: UseRaceNavigationOptions) {
  const [navigationState, setNavigationState] = useState<NavigationState>({
    isNavigating: false,
    navigationTarget: null,
    error: null,
  });
  
  const router = useRouter();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Reset navigation state when currentRaceId changes
  useEffect(() => {
    console.log('🔄 Race navigation: currentRaceId changed to', currentRaceId);
    setNavigationState({
      isNavigating: false,
      navigationTarget: null,
      error: null,
    });
  }, [currentRaceId]);

  // Navigation helper function with timeout protection and fallbacks
  const navigateToRace = useCallback(
    async (raceId: string, navigationTarget: string) => {
      const startTime = Date.now();
      console.log(`🚀 [${new Date().toISOString()}] Starting navigation to race ${raceId} (${navigationTarget})`);
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setNavigationState({
        isNavigating: true,
        navigationTarget,
        error: null,
      });

      try {
        await onNavigationStart?.(navigationTarget);
        
        // Navigate immediately - cleanup is non-blocking
        router.push(`/race/${raceId}`);
        
        // Set timeout protection - if navigation doesn't complete in 3 seconds, try fallback
        timeoutRef.current = setTimeout(() => {
          const elapsed = Date.now() - startTime;
          console.warn(`⚠️ Navigation timeout after ${elapsed}ms, trying fallback for race ${raceId}`);
          
          // Fallback: use window.location for more reliable navigation
          try {
            window.location.href = `/race/${raceId}`;
          } catch (fallbackError) {
            console.error('❌ Fallback navigation also failed:', fallbackError);
            setNavigationState({
              isNavigating: false,
              navigationTarget: null,
              error: 'Navigation failed - please refresh the page',
            });
            onError?.(new Error('Navigation timeout - please refresh the page'));
          }
        }, 3000);
        
      } catch (error) {
        const elapsed = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Navigation failed';
        console.error(`❌ [${elapsed}ms] Navigation to ${navigationTarget} failed:`, error);
        
        setNavigationState({
          isNavigating: false,
          navigationTarget: null,
          error: errorMessage,
        });
        
        onError?.(error instanceof Error ? error : new Error(errorMessage));
      }
    },
    [router, onNavigationStart, onError]
  );

  // Navigation handlers for each button type
  const navigateToMeetings = useCallback(async () => {
    const startTime = Date.now();
    console.log(`🏠 [${new Date().toISOString()}] Starting navigation to meetings`);
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setNavigationState({
      isNavigating: true,
      navigationTarget: 'meetings',
      error: null,
    });

    try {
      await onNavigationStart?.('meetings');
      router.push('/');
      
      // Set a timeout to reset state in case the meetings page doesn't unmount this component
      timeoutRef.current = setTimeout(() => {
        const elapsed = Date.now() - startTime;
        
        if (elapsed > 2000) {
          console.warn(`⚠️ Meetings navigation timeout after ${elapsed}ms, trying fallback`);
          // Fallback for meetings page
          try {
            window.location.href = '/';
          } catch (fallbackError) {
            console.error('❌ Meetings fallback navigation failed:', fallbackError);
            onError?.(new Error('Navigation to meetings failed - please refresh the page'));
          }
        }
        
        setNavigationState({
          isNavigating: false,
          navigationTarget: null,
          error: null,
        });
      onNavigationComplete?.();
      }, 3000);
    } catch (error) {
      const elapsed = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Navigation to meetings failed';
      console.error(`❌ [${elapsed}ms] Navigation to meetings failed:`, error);
      
      setNavigationState({
        isNavigating: false,
        navigationTarget: null,
        error: errorMessage,
      });
      
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  }, [router, onNavigationStart, onNavigationComplete, onError]);

  const navigateToNextScheduled = useCallback(() => {
    console.log('🎯 Navigate to next scheduled clicked', { navigationData: !!navigationData, nextScheduledRace: !!navigationData?.nextScheduledRace });
    if (!navigationData?.nextScheduledRace) {
      console.log('❌ No next scheduled race available');
      onError?.(new Error('No next scheduled race available'));
      return;
    }
    
    navigateToRace(navigationData.nextScheduledRace.raceId, 'next-scheduled');
  }, [navigationData, navigateToRace, onError]);

  const navigateToPrevious = useCallback(() => {
    console.log('🎯 Navigate to previous clicked', { navigationData: !!navigationData, previousRace: !!navigationData?.previousRace });
    if (!navigationData?.previousRace) {
      console.log('❌ No previous race available');
      onError?.(new Error('No previous race available'));
      return;
    }
    
    navigateToRace(navigationData.previousRace.raceId, 'previous');
  }, [navigationData, navigateToRace, onError]);

  const navigateToNext = useCallback(() => {
    console.log('🎯 Navigate to next clicked', { navigationData: !!navigationData, nextRace: !!navigationData?.nextRace });
    if (!navigationData?.nextRace) {
      console.log('❌ No next race available');
      onError?.(new Error('No next race available'));
      return;
    }
    
    navigateToRace(navigationData.nextRace.raceId, 'next');
  }, [navigationData, navigateToRace, onError]);

  // Button availability checks
  const canNavigateToNextScheduled = Boolean(navigationData?.nextScheduledRace);
  const canNavigateToPrevious = Boolean(navigationData?.previousRace);
  const canNavigateToNext = Boolean(navigationData?.nextRace);

  return {
    navigationState,
    
    // Navigation methods
    navigateToMeetings,
    navigateToNextScheduled,
    navigateToPrevious,
    navigateToNext,
    
    // Button states
    canNavigateToNextScheduled,
    canNavigateToPrevious,
    canNavigateToNext,
  };
}
