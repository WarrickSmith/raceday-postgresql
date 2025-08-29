'use client';

import { memo, useMemo, useCallback, useState, useEffect } from 'react';
import type { 
  RacePoolData, 
  RaceResultsData, 
  PoolType, 
  RaceStatus,
  RaceStatusDisplay 
} from '@/types/racePools';
import { useRace } from '@/contexts/RaceContext';
import { useRealtimeRace } from '@/hooks/useRealtimeRace';
import { useRacePoolData } from '@/hooks/useRacePoolData';
import { screenReader } from '@/utils/accessibility';
import { STATUS_CONFIG, getStatusConfig } from '@/utils/raceStatusConfig';

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


// Countdown timer component
const CountdownTimer = memo(function CountdownTimer({
  targetTime,
  raceStatus,
  onTimeExpired
}: {
  targetTime: string;
  raceStatus?: RaceStatus;
  onTimeExpired?: () => void;
}) {
  const [timeRemaining, setTimeRemaining] = useState<{
    total: number;
    hours: number;
    minutes: number;
    seconds: number;
  }>({ total: 0, hours: 0, minutes: 0, seconds: 0 });

  const calculateTimeRemaining = useCallback(() => {
    const now = new Date().getTime();
    const target = new Date(targetTime).getTime();
    const difference = target - now;

    if (difference <= 0) {
      setTimeRemaining({ total: 0, hours: 0, minutes: 0, seconds: 0 });
      if (onTimeExpired) {
        onTimeExpired();
      }
      return;
    }

    const hours = Math.floor(difference / (1000 * 60 * 60));
    const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((difference % (1000 * 60)) / 1000);

    setTimeRemaining({ total: difference, hours, minutes, seconds });
  }, [targetTime, onTimeExpired]);

  useEffect(() => {
    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);
    
    return () => clearInterval(interval);
  }, [calculateTimeRemaining]);

  const formatTime = useMemo(() => {
    const { hours, minutes, seconds } = timeRemaining;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [timeRemaining]);

  const urgencyClass = useMemo(() => {
    const { total } = timeRemaining;
    
    if (total <= 60000) return 'text-red-600 font-bold animate-pulse'; // 1 minute
    if (total <= 300000) return 'text-orange-600 font-semibold'; // 5 minutes
    if (total <= 900000) return 'text-yellow-600'; // 15 minutes
    
    return 'text-gray-700';
  }, [timeRemaining]);

  // Show race status instead of "Race Started" when time expires
  if (timeRemaining.total <= 0) {
    const statusConfig = getStatusConfig(raceStatus);
    return (
      <span className={`font-bold ${statusConfig.color}`}>
        {statusConfig.label}
      </span>
    );
  }

  return (
    <span className="text-inherit" aria-live="polite">
      {formatTime}
    </span>
  );
});


// Race results component
const RaceResults = memo(function RaceResults({
  resultsData
}: {
  resultsData?: RaceResultsData;
}) {
  if (!resultsData || resultsData.results.length === 0) {
    return (
      <div className="text-center text-gray-500 py-4">
        <p>Results not yet available</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Results Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">Race Results</h3>
        <div className="flex items-center space-x-2">
          <span className={`text-xs px-2 py-1 rounded ${
            resultsData.status === 'final' 
              ? 'bg-green-100 text-green-700' 
              : 'bg-yellow-100 text-yellow-700'
          }`}>
            {resultsData.status}
          </span>
          {resultsData.photoFinish && (
            <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
              Photo Finish
            </span>
          )}
          {resultsData.stewardsInquiry && (
            <span className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700">
              Stewards Inquiry
            </span>
          )}
        </div>
      </div>

      {/* Results Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-1">Pos</th>
              <th className="text-left py-1">#</th>
              <th className="text-left py-1">Runner</th>
              <th className="text-left py-1">Jockey</th>
              <th className="text-right py-1">Odds</th>
              <th className="text-right py-1">Margin</th>
            </tr>
          </thead>
          <tbody>
            {resultsData.results.slice(0, 6).map((result) => (
              <tr key={result.position} className="border-b border-gray-100">
                <td className="py-1 font-medium">{result.position}</td>
                <td className="py-1">{result.runnerNumber}</td>
                <td className="py-1">{result.runnerName}</td>
                <td className="py-1 text-gray-600">{result.jockey}</td>
                <td className="py-1 text-right font-mono">{result.odds.toFixed(2)}</td>
                <td className="py-1 text-right">{result.margin || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dividends */}
      {resultsData.dividends.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <h4 className="text-xs font-medium text-gray-700 mb-2">Dividends</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            {resultsData.dividends.map((dividend) => (
              <div key={dividend.poolType} className="flex justify-between">
                <span className="text-gray-600 uppercase">{dividend.poolType}:</span>
                <span className="font-mono">{dividend.currency}{dividend.dividend.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

// Race status display component
const RaceStatusDisplay = memo(function RaceStatusDisplay({
  status,
  raceStartTime,
  showCountdown = true
}: {
  status: RaceStatus;
  raceStartTime: string;
  showCountdown?: boolean;
}) {
  // Get status configuration with fallback
  const statusConfig = getStatusConfig(status);
  const [timeExpired, setTimeExpired] = useState(false);
  
  // Log unknown status for debugging  
  if (!status || !STATUS_CONFIG[status.toLowerCase() as RaceStatus]) {
    console.warn(`Unknown race status: "${status}". Using fallback 'open' status.`);
  }

  const handleTimeExpired = useCallback(() => {
    setTimeExpired(true);
  }, []);

  const shouldShowCountdown = useMemo(() => {
    // Only show countdown for open races that haven't expired, and exclude abandoned/postponed races
    return showCountdown && status === 'open' && !timeExpired;
  }, [showCountdown, status, timeExpired]);

  return (
    <div className="flex flex-col items-end space-y-3">
      <div className={`flex items-center space-x-3 px-6 py-3 rounded-xl ${statusConfig.bgColor} shadow-md`}>
        <span className="text-2xl">{statusConfig.icon}</span>
        <span className={`text-2xl font-bold ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
      </div>
      
      {shouldShowCountdown && (
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Time to Start
          </div>
          <div className="text-4xl font-bold text-gray-900">
            <CountdownTimer 
              targetTime={raceStartTime}
              raceStatus={status}
              onTimeExpired={handleTimeExpired}
            />
          </div>
        </div>
      )}
    </div>
  );
});

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
  
  // Debug logging for race status changes in footer
  useEffect(() => {
    console.log('🦶 RaceFooter status update:', {
      raceId: currentRaceId,
      propStatus: raceStatus,
      liveStatus: liveRaceStatus,
      currentStatus: currentRaceStatus,
      isConnected,
      liveRaceExists: !!liveRace,
      liveRaceData: liveRace ? {
        $id: liveRace.$id,
        raceId: liveRace.raceId,
        status: liveRace.status,
        startTime: liveRace.startTime
      } : null
    });
  }, [currentRaceId, raceStatus, liveRaceStatus, currentRaceStatus, isConnected, liveRace]);

  // Debug logging for pool data changes in footer
  useEffect(() => {
    console.log('🦶 RaceFooter pool data update:', {
      raceId: currentRaceId,
      propPoolData: poolData ? {
        totalPool: poolData.totalRacePool,
        currency: poolData.currency,
        lastUpdated: poolData.lastUpdated
      } : null,
      livePoolData: livePoolData ? {
        totalPool: livePoolData.totalRacePool,
        currency: livePoolData.currency,
        lastUpdated: livePoolData.lastUpdated,
        isLive: livePoolData.isLive
      } : null,
      currentPoolData: currentPoolData ? {
        totalPool: currentPoolData.totalRacePool,
        currency: currentPoolData.currency,
        lastUpdated: currentPoolData.lastUpdated
      } : null,
      poolLoading,
      poolError
    });
  }, [currentRaceId, poolData, livePoolData, currentPoolData, poolLoading, poolError]);
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

  const shouldShowTabs = useMemo(() => {
    const hasResults = resultsData && resultsData.results.length > 0 && showResults;
    // Since pools are now in header, only show tabs if we have results
    return hasResults;
  }, [resultsData, showResults]);


  return (
    <div className={`race-footer bg-white border-2 border-gray-300 shadow-lg rounded-lg ${className}`}>
      {/* Race Status Header - Enhanced and Bigger */}
      <div className="px-8 py-6 bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-300 rounded-t-lg">
        <div className="flex justify-between items-center">
          {/* Consolidated Pool Summary on Left - All Pools Displayed */}
          {currentPoolData && (
            <div className="flex items-center space-x-6">
              {/* Total Pool */}
              <div className="text-center">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Total Pool
                </div>
                <div className="text-3xl font-bold text-gray-900">
                  {currentPoolData.currency}{formatPoolAmount(currentPoolData.totalRacePool)}
                </div>
              </div>
              
              {/* Individual Pool Breakdown - Horizontal Layout */}
              <div className="space-y-2">
                <div className="flex items-center space-x-4">
                  {/* Win Pool */}
                  {currentPoolData.winPoolTotal > 0 && (
                    <div className="text-center">
                      <div className="text-xs font-medium text-gray-500 uppercase">
                        Win
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                        ${formatPoolAmount(currentPoolData.winPoolTotal)}
                      </div>
                    </div>
                  )}
                  
                  {/* Place Pool */}
                  {currentPoolData.placePoolTotal > 0 && (
                    <div className="text-center">
                      <div className="text-xs font-medium text-gray-500 uppercase">
                        Place
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                        ${formatPoolAmount(currentPoolData.placePoolTotal)}
                      </div>
                    </div>
                  )}
                  
                  {/* Quinella Pool */}
                  {currentPoolData.quinellaPoolTotal > 0 && (
                    <div className="text-center">
                      <div className="text-xs font-medium text-gray-500 uppercase">
                        Quinella
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                        ${formatPoolAmount(currentPoolData.quinellaPoolTotal)}
                      </div>
                    </div>
                  )}
                  
                  {/* Trifecta Pool */}
                  {currentPoolData.trifectaPoolTotal > 0 && (
                    <div className="text-center">
                      <div className="text-xs font-medium text-gray-500 uppercase">
                        Trifecta
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                        ${formatPoolAmount(currentPoolData.trifectaPoolTotal)}
                      </div>
                    </div>
                  )}
                  
                  {/* Exacta Pool */}
                  {currentPoolData.exactaPoolTotal > 0 && (
                    <div className="text-center">
                      <div className="text-xs font-medium text-gray-500 uppercase">
                        Exacta
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                        ${formatPoolAmount(currentPoolData.exactaPoolTotal)}
                      </div>
                    </div>
                  )}
                  
                  {/* First4 Pool */}
                  {currentPoolData.first4PoolTotal > 0 && (
                    <div className="text-center">
                      <div className="text-xs font-medium text-gray-500 uppercase">
                        First4
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                        ${formatPoolAmount(currentPoolData.first4PoolTotal)}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Last Updated - moved here from tab content */}
                <div className="text-xs text-gray-500 text-center">
                  Last updated: {new Date(currentPoolData.lastUpdated).toLocaleTimeString('en-US', { 
                    hour12: true, 
                    hour: 'numeric', 
                    minute: '2-digit', 
                    second: '2-digit' 
                  })}
                </div>
              </div>
            </div>
          )}
          
          {/* Race Status on Right - Keep existing formatting */}
          <div className="text-right">
            <RaceStatusDisplay
              status={currentRaceStatus}
              raceStartTime={currentRaceStartTime}
              showCountdown={showCountdown}
            />
          </div>
        </div>
      </div>

      {/* Race Results Header - Only show when results are available */}
      {shouldShowTabs && (
        <div className="px-6 border-b border-gray-200">
          <div className="py-3">
            <h3 className="text-lg font-medium text-gray-900">Race Results</h3>
          </div>
        </div>
      )}

      {/* Content Area - Only show results when available */}
      {shouldShowTabs && (
        <div className="px-6 py-4">
          <RaceResults resultsData={resultsData} />
        </div>
      )}

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