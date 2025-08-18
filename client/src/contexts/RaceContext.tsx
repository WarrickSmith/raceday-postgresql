'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Race, Meeting, Entrant, RaceNavigationData } from '@/types/meetings';
import { raceCache, cacheInvalidation } from '@/lib/cache';
import { racePrefetchService } from '@/services/racePrefetchService';
import { useMemoryOptimization } from '@/utils/performance';

interface RaceContextData {
  race: Race;
  meeting: Meeting;
  entrants: Entrant[];
  navigationData: RaceNavigationData;
  dataFreshness: {
    lastUpdated: string;
    entrantsDataAge: number;
    oddsHistoryCount: number;
    moneyFlowHistoryCount: number;
  };
}

interface RaceContextValue {
  raceData: RaceContextData | null;
  isLoading: boolean;
  error: string | null;
  updateRaceData: (data: RaceContextData) => void;
  navigateToRace: (raceId: string, options?: { skipUrlUpdate?: boolean }) => Promise<void>;
  invalidateRaceCache: (raceId: string) => void;
  isNavigationInProgress: () => boolean;
}

const RaceContext = createContext<RaceContextValue | undefined>(undefined);

interface RaceProviderProps {
  children: ReactNode;
  initialData: RaceContextData | null;
}

export function RaceProvider({ children, initialData }: RaceProviderProps) {
  const router = useRouter();
  const [raceData, setRaceDataInternal] = useState<RaceContextData | null>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigationInProgress = useRef<string | null>(null);
  
  // Memory optimization for RaceContext
  const { triggerCleanup } = useMemoryOptimization();

  // Wrapper to log setRaceData calls
  const setRaceData = useCallback((data: RaceContextData | null) => {
    console.log('📝 setRaceData called:', {
      from: raceData?.race?.raceId || 'null',
      to: data?.race?.raceId || 'null',
      stackTrace: new Error().stack?.split('\n')[2]
    });
    setRaceDataInternal(data);
  }, [raceData]);

  const updateRaceData = useCallback((data: RaceContextData) => {
    console.log('🔄 updateRaceData called with:', data?.race?.raceId);
    setRaceData(data);
  }, []);

  const navigateToRace = useCallback(async (raceId: string, options?: { skipUrlUpdate?: boolean }) => {
    // Prevent duplicate navigation calls
    if (navigationInProgress.current === raceId) {
      console.log('🔄 Navigation already in progress for raceId:', raceId);
      return;
    }

    // If we already have data for this race, just update URL without refetching
    if (raceData && raceData.race.raceId === raceId) {
      console.log('✅ Race data already loaded for:', raceId, 'just updating URL');
      if (!options?.skipUrlUpdate) {
        router.replace(`/race/${raceId}`);
      }
      return;
    }

    const startTime = Date.now();
    console.log('🚀 NavigateToRace called with raceId:', raceId, 'current race:', raceData?.race?.raceId, 'skipUrlUpdate:', options?.skipUrlUpdate);
    
    navigationInProgress.current = raceId;
    setIsLoading(true);
    setError(null);

    try {
      // First check for pre-fetched basic data for immediate rendering
      console.log('🔍 Checking for pre-fetched basic data...');
      const cachedBasicData = await racePrefetchService.getCachedRaceData(raceId);
      
      if (cachedBasicData) {
        console.log('⚡ Found pre-fetched basic data - immediate render!');
        
        // Create minimal race data for immediate rendering
        const immediateRaceData = {
          race: cachedBasicData.race,
          meeting: {
            ...cachedBasicData.meeting,
            $createdAt: '',
            $updatedAt: ''
          },
          entrants: [], // Will be populated by background fetch
          navigationData: {
            previousRace: null,
            nextRace: null,
            nextScheduledRace: null
          },
          dataFreshness: {
            lastUpdated: new Date().toISOString(),
            entrantsDataAge: 0,
            oddsHistoryCount: 0,
            moneyFlowHistoryCount: 0
          }
        };
        
        // Set immediate data and clear loading
        setRaceData(immediateRaceData);
        setIsLoading(false);
        
        // Only update URL if not explicitly skipped
        if (!options?.skipUrlUpdate) {
          router.replace(`/race/${raceId}`);
          console.log('🔗 URL updated to:', `/race/${raceId}`, '(immediate mode)');
        }
        
        // Continue fetching complete data in background
        console.log('📋 Fetching complete data in background...');
      }

      console.log('🗄️ Checking cache for complete race data...');
      // Use cache-first strategy for complete navigation
      const newRaceData = await raceCache.get(
        `race:${raceId}:full`,
        async () => {
          console.log('🌐 Cache miss - fetching complete race data from API...');
          const response = await fetch(`/api/race/${raceId}`);
          
          console.log('📡 API Response status:', response.status, response.statusText);
          
          if (!response.ok) {
            throw new Error(`Failed to fetch race data: ${response.statusText}`);
          }

          return response.json();
        },
        15000 // 15 second cache for live data
      );

      console.log('📦 Complete race data received after', Date.now() - startTime, 'ms:', {
        raceId: newRaceData.race?.raceId,
        raceName: newRaceData.race?.name,
        meetingName: newRaceData.meeting?.meetingName,
        entrantsCount: newRaceData.entrants?.length,
        cached: Date.now() - startTime < 50 // Likely cached if under 50ms
      });
      
      // Only update if we're still navigating to the same race (prevent race conditions)
      if (navigationInProgress.current === raceId) {
        setRaceData(newRaceData);
        console.log('✅ Complete race data updated in context for race:', raceId);
        
        // Only update URL if not already done and not explicitly skipped
        if (!options?.skipUrlUpdate && !cachedBasicData) {
          router.replace(`/race/${raceId}`);
          console.log('🔗 URL updated to:', `/race/${raceId}`, '(complete mode)');
        }
      } else {
        console.log('⚠️ Navigation was cancelled or changed, not updating data');
      }
      
    } catch (err) {
      console.error('❌ Error navigating to race:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      // Only clear navigation if we're still on the same race
      if (navigationInProgress.current === raceId) {
        navigationInProgress.current = null;
      }
      setIsLoading(false);
      console.log('🏁 Navigation completed for:', raceId);
    }
  }, [raceData, router]);

  const invalidateRaceCache = useCallback((raceId: string) => {
    console.log('🗄️ Invalidating cache for race:', raceId);
    cacheInvalidation.onRaceUpdate(raceId);
    
    // Trigger memory cleanup when invalidating cache
    triggerCleanup();
  }, [triggerCleanup]);

  const isNavigationInProgress = useCallback(() => {
    return navigationInProgress.current !== null;
  }, []);

  const value: RaceContextValue = {
    raceData,
    isLoading,
    error,
    updateRaceData,
    navigateToRace,
    invalidateRaceCache,
    isNavigationInProgress
  };

  return (
    <RaceContext.Provider value={value}>
      {children}
    </RaceContext.Provider>
  );
}

export function useRace() {
  const context = useContext(RaceContext);
  if (context === undefined) {
    throw new Error('useRace must be used within a RaceProvider');
  }
  return context;
}