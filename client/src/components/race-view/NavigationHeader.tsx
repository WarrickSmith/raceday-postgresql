'use client';

import { memo } from 'react';
import { RaceNavigationData } from '@/types/meetings';
import { RaceNavigation } from './RaceNavigation';
import { useRace } from '@/contexts/RaceContext';

interface NavigationHeaderProps {
  navigationData: RaceNavigationData;
  currentRaceId?: string;
}

export const NavigationHeader = memo(function NavigationHeader({ 
  navigationData, 
  currentRaceId 
}: NavigationHeaderProps) {
  const { raceData } = useRace();
  
  // Use context navigation data if available and has content, fallback to props for initial render
  const hasValidContextNavigation = raceData?.navigationData && (
    raceData.navigationData.previousRace || 
    raceData.navigationData.nextRace || 
    raceData.navigationData.nextScheduledRace
  );
  const currentNavigationData = hasValidContextNavigation ? raceData.navigationData : navigationData;
  const currentRaceIdFromContext = raceData?.race.raceId || currentRaceId;

  return (
    <header className="bg-white rounded-lg shadow-md p-6" role="banner">
      {/* Race Navigation - Updates navigation options based on current race */}
      <div className="pb-4 border-b border-gray-200">
        <RaceNavigation 
          navigationData={currentNavigationData}
          currentRaceId={currentRaceIdFromContext}
        />
      </div>
    </header>
  );
});