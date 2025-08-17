'use client';

import { memo, useMemo, useCallback, useState, useEffect } from 'react';
import type { 
  RacePoolData, 
  RaceResultsData, 
  PoolTotal, 
  PoolType, 
  RaceStatus,
  RaceStatusDisplay 
} from '@/types/racePools';
import { useRace } from '@/contexts/RaceContext';
import { useRealtimeRace } from '@/hooks/useRealtimeRace';
import { useRacePoolData } from '@/hooks/useRacePoolData';
import { screenReader, KeyboardHandler } from '@/utils/accessibility';

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

// Status configuration
const STATUS_CONFIG: Record<RaceStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
  description: string;
}> = {
  open: {
    label: 'Open',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: '🟢',
    description: 'Betting is open'
  },
  closed: {
    label: 'Closed',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    icon: '🟡',
    description: 'Betting has closed'
  },
  interim: {
    label: 'Interim',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: '🔵',
    description: 'Interim results available'
  },
  final: {
    label: 'Final',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    icon: '🏁',
    description: 'Final results confirmed'
  },
  abandoned: {
    label: 'Abandoned',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: '🔴',
    description: 'Race has been abandoned'
  },
  postponed: {
    label: 'Postponed',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    icon: '⏸️',
    description: 'Race has been postponed'
  }
};

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
    const statusConfig = STATUS_CONFIG[raceStatus || 'open'];
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

// Pool summary component
const PoolSummary = memo(function PoolSummary({
  poolData,
  showBreakdown = true
}: {
  poolData?: RacePoolData;
  showBreakdown?: boolean;
}) {
  const poolTotals = useMemo((): PoolTotal[] => {
    if (!poolData) return [];

    const pools: PoolTotal[] = [
      {
        poolType: 'win',
        totalAmount: poolData.winPoolTotal,
        currency: poolData.currency,
        percentage: (poolData.winPoolTotal / poolData.totalRacePool) * 100,
        isActive: true
      },
      {
        poolType: 'place',
        totalAmount: poolData.placePoolTotal,
        currency: poolData.currency,
        percentage: (poolData.placePoolTotal / poolData.totalRacePool) * 100,
        isActive: true
      },
      {
        poolType: 'quinella',
        totalAmount: poolData.quinellaPoolTotal,
        currency: poolData.currency,
        percentage: (poolData.quinellaPoolTotal / poolData.totalRacePool) * 100,
        isActive: poolData.quinellaPoolTotal > 0
      },
      {
        poolType: 'trifecta',
        totalAmount: poolData.trifectaPoolTotal,
        currency: poolData.currency,
        percentage: (poolData.trifectaPoolTotal / poolData.totalRacePool) * 100,
        isActive: poolData.trifectaPoolTotal > 0
      },
      {
        poolType: 'exacta',
        totalAmount: poolData.exactaPoolTotal,
        currency: poolData.currency,
        percentage: (poolData.exactaPoolTotal / poolData.totalRacePool) * 100,
        isActive: poolData.exactaPoolTotal > 0
      },
      {
        poolType: 'first4',
        totalAmount: poolData.first4PoolTotal,
        currency: poolData.currency,
        percentage: (poolData.first4PoolTotal / poolData.totalRacePool) * 100,
        isActive: poolData.first4PoolTotal > 0
      }
    ];

    return pools.filter(pool => pool.isActive && pool.totalAmount > 0);
  }, [poolData]);

  if (!poolData || poolTotals.length === 0) {
    return (
      <div className="text-center text-gray-500 py-4">
        <p>Pool information not available</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Total Pool */}
      <div className="text-center border-b border-gray-200 pb-2">
        <div className="text-lg font-bold text-gray-900">
          Total Pool: {poolData.currency}{poolData.totalRacePool.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500">
          Last updated: {new Date(poolData.lastUpdated).toLocaleTimeString('en-US', { 
            hour12: true, 
            hour: 'numeric', 
            minute: '2-digit', 
            second: '2-digit' 
          })}
        </div>
      </div>

      {/* Pool Breakdown */}
      {showBreakdown && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {poolTotals.map((pool) => (
            <div key={pool.poolType} className="text-center">
              <div className="text-xs font-medium text-gray-500 uppercase">
                {pool.poolType}
              </div>
              <div className="text-sm font-semibold text-gray-900">
                {pool.currency}{pool.totalAmount.toLocaleString()}
              </div>
              <div className="text-xs text-gray-400">
                {pool.percentage.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
  // Fallback to 'open' if status is not found in our config
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG['open'];
  const [timeExpired, setTimeExpired] = useState(false);
  
  // Log unknown status for debugging
  if (!STATUS_CONFIG[status]) {
    console.warn(`Unknown race status: "${status}". Using fallback 'open' status.`);
  }

  const handleTimeExpired = useCallback(() => {
    setTimeExpired(true);
  }, []);

  const shouldShowCountdown = useMemo(() => {
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
  
  // Use live race status with proper type validation
  const validStatuses: RaceStatus[] = ['open', 'closed', 'interim', 'final', 'abandoned', 'postponed'];
  const liveRaceStatus = liveRace?.status;
  const currentRaceStatus: RaceStatus = 
    liveRaceStatus && validStatuses.includes(liveRaceStatus as RaceStatus)
      ? liveRaceStatus as RaceStatus
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
  const [activeTab, setActiveTab] = useState<'pools' | 'results'>('pools');

  // Determine which tab should be shown by default and announce status changes
  useEffect(() => {
    if (resultsData && resultsData.results.length > 0 && showResults) {
      setActiveTab('results');
      // Announce results availability
      screenReader?.announce(
        `Race results are now available with ${resultsData.results.length} positions`,
        'assertive'
      );
    } else if (currentPoolData && showPoolBreakdown) {
      setActiveTab('pools');
    }
  }, [resultsData, currentPoolData, showResults, showPoolBreakdown]);

  // Announce race status changes
  useEffect(() => {
    const statusConfig = STATUS_CONFIG[currentRaceStatus];
    if (statusConfig) {
      screenReader?.announceRaceStatusChange(statusConfig.description);
    }
  }, [currentRaceStatus]);

  const shouldShowTabs = useMemo(() => {
    const hasResults = resultsData && resultsData.results.length > 0 && showResults;
    const hasPools = currentPoolData && showPoolBreakdown;
    return hasResults && hasPools;
  }, [resultsData, currentPoolData, showResults, showPoolBreakdown]);

  // Enhanced tab navigation with keyboard support
  const handleTabClick = useCallback((tab: 'pools' | 'results') => {
    setActiveTab(tab);
    screenReader?.announce(
      `Switched to ${tab === 'pools' ? 'Pool Summary' : 'Race Results'} tab`,
      'polite'
    );
  }, []);

  const handleTabKeyDown = useCallback((event: React.KeyboardEvent) => {
    const tabs = ['pools', 'results'];
    const currentIndex = tabs.indexOf(activeTab);
    
    KeyboardHandler.handleTabNavigation(
      event.nativeEvent,
      Array.from(event.currentTarget.querySelectorAll('button')) as HTMLElement[],
      currentIndex,
      (newIndex) => {
        const newTab = tabs[newIndex] as 'pools' | 'results';
        handleTabClick(newTab);
      }
    );
  }, [activeTab, handleTabClick]);

  return (
    <div className={`race-footer bg-white border-t-2 border-gray-300 ${className}`}>
      {/* Race Status Header - Enhanced and Bigger */}
      <div className="px-8 py-6 bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-300">
        <div className="flex justify-between items-center">
          {/* Pool Summary on Left - Big and Bold */}
          {currentPoolData && (
            <div className="flex items-center space-x-8">
              <div className="text-center">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Total Pool
                </div>
                <div className="text-3xl font-bold text-gray-900">
                  {currentPoolData.currency}{currentPoolData.totalRacePool.toLocaleString()}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Race Starts
                </div>
                <div className="text-xl font-bold text-blue-600">
                  <CountdownTimer 
                    targetTime={currentRaceStartTime}
                    raceStatus={currentRaceStatus}
                    onTimeExpired={() => {}}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Race Status on Right - Big and Bold */}
          <div className="text-right">
            <RaceStatusDisplay
              status={currentRaceStatus}
              raceStartTime={currentRaceStartTime}
              showCountdown={showCountdown}
            />
          </div>
        </div>
      </div>

      {/* Enhanced Tab Navigation with accessibility */}
      {shouldShowTabs && (
        <div className="px-6 border-b border-gray-200">
          <nav 
            className="flex space-x-8" 
            role="tablist" 
            aria-label="Race information tabs"
            onKeyDown={handleTabKeyDown}
          >
            <button
              onClick={() => handleTabClick('pools')}
              role="tab"
              aria-selected={activeTab === 'pools'}
              aria-controls="pools-panel"
              id="pools-tab"
              tabIndex={activeTab === 'pools' ? 0 : -1}
              className={`py-3 px-1 border-b-2 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                activeTab === 'pools'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Pool Summary
            </button>
            <button
              onClick={() => handleTabClick('results')}
              role="tab"
              aria-selected={activeTab === 'results'}
              aria-controls="results-panel"
              id="results-tab"
              tabIndex={activeTab === 'results' ? 0 : -1}
              className={`py-3 px-1 border-b-2 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                activeTab === 'results'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Race Results
            </button>
          </nav>
        </div>
      )}

      {/* Content Area */}
      <div className="px-6 py-4">
        {shouldShowTabs ? (
          // Tabbed content with proper ARIA
          <>
            {activeTab === 'pools' && (
              <div 
                role="tabpanel" 
                id="pools-panel" 
                aria-labelledby="pools-tab"
                tabIndex={0}
              >
                <PoolSummary poolData={currentPoolData} showBreakdown={showPoolBreakdown} />
              </div>
            )}
            {activeTab === 'results' && (
              <div 
                role="tabpanel" 
                id="results-panel" 
                aria-labelledby="results-tab"
                tabIndex={0}
              >
                <RaceResults resultsData={resultsData} />
              </div>
            )}
          </>
        ) : (
          // Single content area
          <>
            {currentPoolData && showPoolBreakdown && (
              <PoolSummary poolData={currentPoolData} showBreakdown={showPoolBreakdown} />
            )}
            {resultsData && resultsData.results.length > 0 && showResults && (
              <RaceResults resultsData={resultsData} />
            )}
            {!currentPoolData && !resultsData && (
              <div className="text-center text-gray-500 py-8">
                <p>Race information will be displayed here when available</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Accessibility announcements */}
      <div className="sr-only" aria-live="polite">
        Race status: {STATUS_CONFIG[currentRaceStatus]?.description}.
        {currentPoolData && ` Total pool: ${currentPoolData.currency}${currentPoolData.totalRacePool.toLocaleString()}.`}
        {resultsData && resultsData.results.length > 0 && ` Results available with ${resultsData.results.length} positions.`}
      </div>
    </div>
  );
});

export default RaceFooter;