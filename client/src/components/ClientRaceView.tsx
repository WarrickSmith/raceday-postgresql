'use client';

import { useEffect, useState } from 'react';
import { useRace } from '@/contexts/RaceContext';
import { RacePageContent } from '@/components/race-view/RacePageContent';
import { useLogger } from '@/utils/logging';

interface ClientRaceViewProps {
  raceId: string;
}

export function ClientRaceView({ raceId }: ClientRaceViewProps) {
  const logger = useLogger('ClientRaceView');
  const { raceData, isLoading: contextLoading, loadRaceData, error: contextError } = useRace();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!raceId) return;

    const currentRaceId = raceData?.race?.raceId;
    
    logger.debug('ClientRaceView effect - URL raceId:', { raceId, currentRaceId, contextLoading });

    // If we don't have race data or it doesn't match the requested race ID, load it
    if (!raceData || currentRaceId !== raceId) {
      logger.info('Loading race data for:', { raceId });
      setError(null);
      loadRaceData(raceId).catch((err) => {
        logger.error('Failed to load race data in ClientRaceView:', err);
        setError(err instanceof Error ? err.message : 'Failed to load race data');
      });
    } else if (raceData && currentRaceId === raceId) {
      logger.debug('Race data already matches URL, clearing any errors');
      setError(null);
    }
  }, [raceId, raceData, contextLoading, loadRaceData]);

  // Handle errors (prefer context error over local error)
  const displayError = contextError || error;
  if (displayError) {
    return (
      <div className="w-full px-4 py-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <h2 className="text-lg font-medium text-red-800 mb-2">Error Loading Race</h2>
            <p className="text-red-700">{displayError}</p>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state
  if (contextLoading) {
    return (
      <div className="w-full px-4 py-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex items-center justify-center space-x-3">
              <svg className="animate-spin w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <span className="text-blue-700 font-medium">Loading race data...</span>
            </div>
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