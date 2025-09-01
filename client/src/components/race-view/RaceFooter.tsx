'use client';

import { memo, useEffect } from 'react';
import type { 
  RacePoolData, 
  RaceResultsData, 
  RaceStatus
} from '@/types/racePools';
import { useRace } from '@/contexts/RaceContext';
import { useRealtimeRace } from '@/hooks/useRealtimeRace';
import { useRacePoolData } from '@/hooks/useRacePoolData';
import { screenReader } from '@/utils/accessibility';
import { STATUS_CONFIG, getStatusConfig } from '@/utils/raceStatusConfig';
import { RaceTimingSection } from '@/components/race-view/RaceTimingSection';
import { RacePoolsSection } from '@/components/race-view/RacePoolsSection';
import { RaceResultsSection } from '@/components/race-view/RaceResultsSection';

// Utility function to convert cents to dollars for display (rounded to nearest dollar)
const formatPoolAmount = (cents: number): string => {
  const dollars = Math.round(cents / 100); // Round to nearest dollar
  return dollars.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
};

interface RaceFooterProps {
  raceId: string;
  raceStartTime: string;
  raceStatus: RaceStatus;
  poolData?: RacePoolData;
  resultsData?: RaceResultsData;
  className?: string;
  showCountdown?: boolean;
  showPoolBreakdown?: boolean;
  showResults?: boolean;
}



export const RaceFooter = memo(function RaceFooter({
  raceId,
  raceStartTime,
  raceStatus,
  poolData,
  resultsData,
  className = '',
  showCountdown = true,
  showPoolBreakdown = true,
  showResults = true
}: RaceFooterProps) {
  const { raceData } = useRace();
  
  // Use the same approach as RaceDataHeader - useRealtimeRace with proper fallback
  const { race: liveRace, isConnected } = useRealtimeRace({ 
    initialRace: raceData?.race || {
      $id: raceId || 'fallback',
      raceId: raceId || 'fallback', 
      startTime: raceStartTime,
      status: raceStatus,
      name: '',
      raceNumber: 0,
      meeting: '',
      distance: undefined,
      trackCondition: undefined,
      $createdAt: '',
      $updatedAt: ''
    }
  });
  
  // Get real-time pool data for synchronization with header and entrants
  const { poolData: livePoolData, isLoading: poolLoading, error: poolError } = useRacePoolData(
    liveRace?.raceId || raceId
  );
  
  // Use live race data (same as header)
  const currentRaceId = liveRace?.raceId || raceId;
  const currentRaceStartTime = liveRace?.startTime || raceStartTime;
  
  // Use live race status with proper type validation (case-insensitive)
  const validStatuses: RaceStatus[] = ['open', 'closed', 'interim', 'final', 'abandoned', 'postponed'];
  const liveRaceStatus = liveRace?.status;
  const currentRaceStatus: RaceStatus = 
    liveRaceStatus && validStatuses.includes(liveRaceStatus.toLowerCase() as RaceStatus)
      ? liveRaceStatus.toLowerCase() as RaceStatus
      : raceStatus;
  
  // Use live pool data with fallback to prop for compatibility
  const currentPoolData = livePoolData || poolData;
  
  // Announce results availability when they become available
  useEffect(() => {
    if (resultsData && resultsData.results.length > 0 && showResults) {
      // Announce results availability
      screenReader?.announce(
        `Race results are now available with ${resultsData.results.length} positions`,
        'assertive'
      );
    }
  }, [resultsData, showResults]);

  // Announce race status changes
  useEffect(() => {
    const statusConfig = getStatusConfig(currentRaceStatus);
    if (statusConfig) {
      screenReader?.announceRaceStatusChange(statusConfig.description);
    }
  }, [currentRaceStatus]);



  return (
    <div className={`race-footer bg-white border-2 border-gray-300 shadow-lg rounded-lg ${className}`}>
      {/* Three-Section Footer Layout: Pool Data | Controls | Results/Timing/Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
        
        {/* Left Section: Pool Data */}
        <div className="flex justify-center lg:justify-start">
          <RacePoolsSection 
            raceId={currentRaceId}
            poolData={currentPoolData}
          />
        </div>
        
        {/* Center Section: Controls above Results */}
        <div className="flex flex-col justify-center space-y-2">
          <div className="flex justify-center">
            <div className="text-center text-gray-500">
              {/* Controls section - to be implemented */}
              <div className="text-sm">Controls</div>
            </div>
          </div>
          <div className="flex justify-center">
            <RaceResultsSection 
              resultsData={resultsData}
              showWinPlaceSelector={true}
            />
          </div>
        </div>
        
        {/* Right Section: Timing/Status */}
        <div className="flex justify-center lg:justify-end">
          <RaceTimingSection 
            raceStartTime={currentRaceStartTime}
            raceStatus={currentRaceStatus}
            showCountdown={showCountdown}
          />
        </div>
        
      </div>

      {/* Accessibility announcements */}
      <div className="sr-only" aria-live="polite">
        Race status: {STATUS_CONFIG[currentRaceStatus]?.description}.
        {currentPoolData && ` Total pool: ${currentPoolData.currency}${formatPoolAmount(currentPoolData.totalRacePool)}.`}
        {resultsData && resultsData.results.length > 0 && ` Results available with ${resultsData.results.length} positions.`}
      </div>
    </div>
  );
});

export default RaceFooter;