'use client';

import { memo } from 'react';
import { useRace } from '@/contexts/RaceContext';
import { NavigationHeader } from '@/components/race-view/NavigationHeader';
import { RaceHeaderInfo } from '@/components/race-view/RaceHeaderInfo';
import { RaceStatusSection } from '@/components/race-view/RaceStatusSection';
import { DataConnectionStatus } from '@/components/race-view/DataConnectionStatus';

interface RaceDataHeaderProps {
  className?: string;
}

export const RaceDataHeader = memo(function RaceDataHeader({ 
  className = '' 
}: RaceDataHeaderProps) {
  const { raceData } = useRace();
  
  if (!raceData) {
    return (
      <div className={`bg-white rounded-lg shadow-md ${className}`} role="banner">
        <div className="animate-pulse p-6">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    );
  }

  const { race, navigationData } = raceData;

  return (
    <div className={`bg-white rounded-lg shadow-md ${className}`} role="banner">
      {/* Navigation Section */}
      <div className="border-b border-gray-200 px-6 py-4">
        <NavigationHeader 
          navigationData={navigationData}
          currentRaceId={race.raceId}
        />
      </div>
      
      {/* Race Information Section */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Race Info Group - Left */}
          <div className="lg:col-span-2">
            <RaceHeaderInfo />
          </div>
          
          {/* Status and Connection Group - Right */}
          <div className="flex flex-col space-y-4">
            <RaceStatusSection />
            <DataConnectionStatus />
          </div>
        </div>
      </div>
    </div>
  );
});