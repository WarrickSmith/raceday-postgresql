'use client';

import { useEffect, useState } from 'react';
import { notFound } from 'next/navigation';
import { useRace } from '@/contexts/RaceContext';
import { RacePageContent } from '@/components/race-view/RacePageContent';
import { Race, Meeting, Entrant, RaceNavigationData } from '@/types/meetings';

interface ClientRaceViewProps {
  raceId: string;
}

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

export function ClientRaceView({ raceId }: ClientRaceViewProps) {
  const { raceData, isLoading: contextLoading, navigateToRace, isNavigationInProgress } = useRace();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!raceId) return;

    const currentRaceId = raceData?.race?.raceId;
    const navInProgress = isNavigationInProgress();
    
    console.log('📍 ClientRaceView effect - URL raceId:', raceId, 'current race:', currentRaceId, 'loading:', contextLoading, 'navInProgress:', navInProgress);

    // Only load race data if:
    // 1. We don't have any race data at all, OR
    // 2. The race ID in context doesn't match the URL AND we're not currently loading/navigating
    if (!raceData || (currentRaceId !== raceId && !contextLoading && !navInProgress)) {
      console.log('🔄 ClientRaceView triggering navigation to:', raceId, 'from:', currentRaceId);
      setError(null);

      // Skip URL update since this is triggered by URL change already
      navigateToRace(raceId, { skipUrlUpdate: true }).catch((err) => {
        console.error('❌ Failed to load race data in ClientRaceView:', err);
        setError(err instanceof Error ? err.message : 'Failed to load race data');
      });
    } else if (currentRaceId === raceId) {
      console.log('✅ ClientRaceView - race data already matches URL, no action needed');
    } else if (contextLoading || navInProgress) {
      console.log('⏳ ClientRaceView - navigation already in progress, waiting...');
    }
  }, [raceId, raceData?.race?.raceId, contextLoading, navigateToRace, isNavigationInProgress]);

  // Handle errors
  if (error) {
    return (
      <div className="w-full px-4 py-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <h2 className="text-lg font-medium text-red-800 mb-2">Error Loading Race</h2>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // If we have race data and it matches the requested race, render the page content
  if (raceData && raceData.race.raceId === raceId) {
    return <RacePageContent />;
  }

  // While loading or if race data doesn't match, return null - the Suspense fallback will show
  return null;
}