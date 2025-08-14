'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Race, Meeting, Entrant, RaceNavigationData } from '@/types/meetings';

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
  navigateToRace: (raceId: string) => Promise<void>;
}

const RaceContext = createContext<RaceContextValue | undefined>(undefined);

interface RaceProviderProps {
  children: ReactNode;
  initialData: RaceContextData;
}

export function RaceProvider({ children, initialData }: RaceProviderProps) {
  const [raceData, setRaceData] = useState<RaceContextData>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRaceData = useCallback((data: RaceContextData) => {
    setRaceData(data);
  }, []);

  const navigateToRace = useCallback(async (raceId: string) => {
    const startTime = Date.now();
    console.log('🚀 NavigateToRace called with raceId:', raceId);
    setIsLoading(true);
    setError(null);

    try {
      console.log('🌐 Fetching race data from API...');
      // Fetch new race data via client-side API route (use fast navigation mode)
      const response = await fetch(`/api/race/${raceId}?nav=true`);
      
      console.log('📡 API Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch race data: ${response.statusText}`);
      }

      const newRaceData = await response.json();
      console.log('📦 New race data received after', Date.now() - startTime, 'ms:', {
        raceId: newRaceData.race?.raceId,
        raceName: newRaceData.race?.name,
        meetingName: newRaceData.meeting?.meetingName,
        entrantsCount: newRaceData.entrants?.length
      });
      
      setRaceData(newRaceData);
      console.log('✅ Race data updated in context');
      
      // Update the URL without causing a page refresh
      window.history.pushState({}, '', `/race/${raceId}`);
      console.log('🔗 URL updated to:', `/race/${raceId}`);
      
    } catch (err) {
      console.error('❌ Error navigating to race:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
      console.log('🏁 Navigation completed');
    }
  }, []);

  const value: RaceContextValue = {
    raceData,
    isLoading,
    error,
    updateRaceData,
    navigateToRace
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