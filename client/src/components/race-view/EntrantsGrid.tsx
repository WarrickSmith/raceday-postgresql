'use client';

import { memo, useMemo, useState, useCallback } from 'react';
import { Entrant } from '@/types/meetings';
import { useComprehensiveRealtime } from '@/hooks/useComprehensiveRealtimeFixed';
import { SparklineChart } from './SparklineChart';

// Memoized EntrantRow component to prevent unnecessary re-renders
const EntrantRow = memo(function EntrantRow({ 
  entrant,
  getTrendIndicator,
  formatOdds,
  formatMoneyFlow,
  moneyFlowTrend
}: {
  entrant: Entrant;
  getTrendIndicator: (entrantId: string, type: 'win' | 'place') => React.ReactNode;
  formatOdds: (odds?: number) => string;
  formatMoneyFlow: (percentage?: number) => string;
  moneyFlowTrend: React.ReactNode;
}) {
  return (
    <tr 
      role="row"
      className={`hover:bg-gray-50 ${
        entrant.isScratched ? 'opacity-50 bg-red-50' : ''
      }`}
    >
      {/* Saddlecloth Number */}
      <td 
        role="gridcell"
        className="px-3 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-center"
      >
        <span aria-label={`Runner number ${entrant.runnerNumber}`}>
          {entrant.runnerNumber}
        </span>
        {entrant.isScratched && (
          <span className="block text-xs text-red-600 font-normal" aria-label="Scratched">
            SCR
          </span>
        )}
      </td>
      
      {/* Runner/Jockey/Trainer Column */}
      <td role="gridcell" className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900 font-medium" aria-label={`Runner name: ${entrant.name}`}>
          {entrant.name}
        </div>
        {entrant.jockey && (
          <div className="text-sm text-gray-500" aria-label={`Jockey: ${entrant.jockey}`}>
            <span className="text-xs font-medium text-gray-400">J:</span> {entrant.jockey}
          </div>
        )}
        {entrant.trainerName && (
          <div className="text-sm text-gray-500" aria-label={`Trainer: ${entrant.trainerName}`}>
            <span className="text-xs font-medium text-gray-400">T:</span> {entrant.trainerName}
          </div>
        )}
      </td>
      
      {/* Win Odds */}
      <td 
        role="gridcell"
        className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right text-gray-900"
        aria-label={entrant.isScratched ? 'Win odds: Not available (scratched)' : `Win odds: ${formatOdds(entrant.winOdds)}`}
      >
        <div className="flex items-center justify-end">
          <span>{entrant.isScratched ? '—' : formatOdds(entrant.winOdds)}</span>
          {!entrant.isScratched && getTrendIndicator(entrant.$id, 'win')}
        </div>
      </td>
      
      {/* Place Odds */}
      <td 
        role="gridcell"
        className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right text-gray-900"
        aria-label={entrant.isScratched ? 'Place odds: Not available (scratched)' : `Place odds: ${formatOdds(entrant.placeOdds)}`}
      >
        <div className="flex items-center justify-end">
          <span>{entrant.isScratched ? '—' : formatOdds(entrant.placeOdds)}</span>
          {!entrant.isScratched && getTrendIndicator(entrant.$id, 'place')}
        </div>
      </td>
      
      {/* Money Flow */}
      <td 
        role="gridcell"
        className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right text-gray-900"
        aria-describedby="money-flow-description"
      >
        <div className="flex items-center justify-end">
          <span>{entrant.isScratched ? '—' : formatMoneyFlow(entrant.holdPercentage)}</span>
          {moneyFlowTrend}
        </div>
      </td>
      
      {/* Trend (Sparkline) */}
      <td 
        role="gridcell"
        className="px-6 py-4 whitespace-nowrap text-sm text-center"
        aria-describedby="trend-description"
      >
        <div className="flex items-center justify-center space-x-2">
          {entrant.isScratched || !entrant.oddsHistory?.length ? (
            <span className="text-gray-400 text-xs">—</span>
          ) : (
            <SparklineChart
              data={entrant.oddsHistory}
              width={80}
              height={24}
              className="mx-auto"
              data-testid={`sparkline-${entrant.$id}`}
              aria-label={`Odds trend for ${entrant.name}`}
            />
          )}
        </div>
      </td>
    </tr>
  );
});

interface EntrantsGridProps {
  initialEntrants: Entrant[];
  raceId: string;
  dataFreshness?: {
    lastUpdated: string;
    entrantsDataAge: number;
    oddsHistoryCount: number;
    moneyFlowHistoryCount: number;
  };
}

export const EntrantsGrid = memo(function EntrantsGrid({ 
  initialEntrants, 
  raceId, 
  dataFreshness 
}: EntrantsGridProps) {
  const [showPerformancePanel, setShowPerformancePanel] = useState(false);
  const [updateNotifications, setUpdateNotifications] = useState(true);
  
  const realtimeResult = useComprehensiveRealtime({
    initialEntrants,
    raceId,
    dataFreshness
  });
  
  const { 
    entrants, 
    connectionState, 
    recentUpdates, 
    updateCounts, 
    performance, 
    triggerReconnect,
    clearUpdateHistory 
  } = realtimeResult;
  
  // Legacy compatibility for existing logic (commented out as not used)
  // const isConnected = connectionState.isConnected;
  const oddsUpdates = useMemo(() => {
    const recent = recentUpdates.filter(u => u.type === 'entrant' && u.timestamp > new Date(Date.now() - 10000));
    return recent.reduce((acc, update) => {
      if (update.entrantId && typeof update.data.winOdds === 'number') {
        acc[update.entrantId] = {
          win: update.data.winOdds as number,
          place: typeof update.data.placeOdds === 'number' ? update.data.placeOdds as number : undefined,
          timestamp: update.timestamp
        };
      }
      return acc;
    }, {} as Record<string, { win?: number; place?: number; timestamp: Date }>);
  }, [recentUpdates]);
  
  const moneyFlowUpdates = useMemo(() => {
    const recent = recentUpdates.filter(u => u.type === 'moneyFlow' && u.timestamp > new Date(Date.now() - 10000));
    return recent.reduce((acc, update) => {
      if (update.entrantId && typeof update.data.holdPercentage === 'number') {
        acc[update.entrantId] = {
          holdPercentage: update.data.holdPercentage as number,
          timestamp: update.timestamp
        };
      }
      return acc;
    }, {} as Record<string, { holdPercentage?: number; timestamp: Date }>);
  }, [recentUpdates]);
  
  const oddsHistoryUpdates = useMemo(() => {
    const recent = recentUpdates.filter(u => u.type === 'oddsHistory' && u.timestamp > new Date(Date.now() - 10000));
    return recent.reduce((acc, update) => {
      if (update.entrantId && update.data && typeof update.data === 'object') {
        acc[update.entrantId] = {
          newEntry: update.data as Record<string, unknown>,
          timestamp: update.timestamp
        };
      }
      return acc;
    }, {} as Record<string, { newEntry?: Record<string, unknown>; timestamp: Date }>);
  }, [recentUpdates]);
  
  const togglePerformancePanel = useCallback(() => {
    setShowPerformancePanel(prev => !prev);
  }, []);
  // Sort entrants by runner number for consistent display
  const sortedEntrants = useMemo(() => {
    return [...entrants].sort((a, b) => a.runnerNumber - b.runnerNumber);
  }, [entrants]);

  const formatOdds = useMemo(() => {
    const formatter = (odds?: number) => {
      if (odds === undefined || odds === null) return '—';
      return `${odds.toFixed(2)}`;
    };
    return formatter;
  }, []);
  
  // Memoized money flow formatting function
  const formatMoneyFlow = useMemo(() => {
    const formatter = (percentage?: number) => {
      if (percentage === undefined || percentage === null) return '—';
      return `${percentage.toFixed(2)}%`;
    };
    return formatter;
  }, []);
  
  // Memoized money flow trend calculations
  const moneyFlowTrends = useMemo(() => {
    const trends: Record<string, React.ReactNode> = {};
    
    sortedEntrants.forEach(entrant => {
      if (entrant.isScratched || !entrant.moneyFlowTrend || entrant.moneyFlowTrend === 'neutral') {
        trends[entrant.$id] = null;
        return;
      }
      
      trends[entrant.$id] = (
        <span 
          className={`ml-1 text-xs ${
            entrant.moneyFlowTrend === 'up' ? 'text-red-600' : 'text-blue-600'
          }`}
          aria-label={`Market interest ${entrant.moneyFlowTrend === 'up' ? 'increasing' : 'decreasing'}`}
        >
          {entrant.moneyFlowTrend === 'up' ? '↑' : '↓'}
        </span>
      );
    });
    
    return trends;
  }, [sortedEntrants]);

  // Create a memoized map of entrant odds for efficient lookups
  const entrantOddsMap = useMemo(() => {
    const oddsMap: Record<string, { winOdds?: number; placeOdds?: number }> = {};
    sortedEntrants.forEach(entrant => {
      oddsMap[entrant.$id] = {
        winOdds: entrant.winOdds,
        placeOdds: entrant.placeOdds
      };
    });
    return oddsMap;
  }, [sortedEntrants]);

  // Memoized trend calculation that only recalculates when specific entrant data changes
  const getTrendIndicator = useMemo(() => {
    const trendCache: Record<string, React.ReactNode> = {};
    
    const indicator = (entrantId: string, type: 'win' | 'place') => {
      const cacheKey = `${entrantId}-${type}`;
      
      // Return cached result if available
      if (cacheKey in trendCache) {
        return trendCache[cacheKey];
      }
      
      const update = oddsUpdates[entrantId];
      if (!update) {
        trendCache[cacheKey] = null;
        return null;
      }
      
      const currentOdds = type === 'win' ? 
        entrantOddsMap[entrantId]?.winOdds :
        entrantOddsMap[entrantId]?.placeOdds;
      const previousOdds = type === 'win' ? update.win : update.place;
      
      if (!currentOdds || !previousOdds || currentOdds === previousOdds) {
        trendCache[cacheKey] = null;
        return null;
      }
      
      const result = currentOdds > previousOdds ? 
        <span className="text-blue-600 ml-1 text-xs" aria-label="odds lengthened">↑</span> :
        <span className="text-red-600 ml-1 text-xs" aria-label="odds shortened">↓</span>;
      
      trendCache[cacheKey] = result;
      return result;
    };
    return indicator;
  }, [oddsUpdates, entrantOddsMap]);

  if (sortedEntrants.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-gray-600 text-sm text-center">
            No entrants found for this race.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Race Entrants ({sortedEntrants.length})
          </h2>
          <div className="flex items-center space-x-3">
            {/* Data Freshness Indicator */}
            {dataFreshness && (
              <div className="text-xs text-gray-500">
                Data: {Math.round(dataFreshness.entrantsDataAge / 60)}min ago
              </div>
            )}
            
            {/* Performance Toggle */}
            <button
              onClick={togglePerformancePanel}
              className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
              aria-label="Toggle performance monitoring panel"
            >
              📊 Stats
            </button>
            
            {/* Enhanced Connection Status */}
            <div className="flex items-center space-x-2">
              <span 
                className={`text-xs px-2 py-1 rounded-full transition-colors ${
                  connectionState.isConnected 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-red-100 text-red-700'
                }`}
                aria-live="polite"
                aria-label={connectionState.isConnected ? 'Connected to live data' : 'Disconnected from live data'}
              >
                {connectionState.isConnected ? '🔄 Live' : '📶 Disconnected'}
              </span>
              
              {!connectionState.isConnected && connectionState.connectionAttempts > 0 && (
                <button
                  onClick={triggerReconnect}
                  className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
                  aria-label="Retry connection"
                >
                  🔄 Retry
                </button>
              )}
            </div>
          </div>
        </div>
        
        {/* Performance Monitoring Panel */}
        {showPerformancePanel && (
          <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-3 border border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="font-medium text-gray-900">Real-time Performance</h3>
              <button
                onClick={clearUpdateHistory}
                className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
                aria-label="Clear update history"
              >
                Clear History
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-gray-500">Connection</div>
                <div className={`font-medium ${
                  connectionState.isConnected ? 'text-green-600' : 'text-red-600'
                }`}>
                  {connectionState.isConnected ? 'Connected' : 'Disconnected'}
                </div>
                <div className="text-xs text-gray-400">
                  {connectionState.subscriptionCount} channels
                </div>
              </div>
              
              <div>
                <div className="text-xs text-gray-500">Updates/min</div>
                <div className="font-medium text-blue-600">
                  {performance.updatesPerMinute}
                </div>
                <div className="text-xs text-gray-400">
                  Avg latency: {Math.round(performance.averageUpdateLatency)}ms
                </div>
              </div>
              
              <div>
                <div className="text-xs text-gray-500">Update Counts</div>
                <div className="font-medium text-purple-600">
                  E:{updateCounts.entrants} M:{updateCounts.moneyFlow} O:{updateCounts.oddsHistory}
                </div>
                <div className="text-xs text-gray-400">
                  Batch efficiency: {Math.round(performance.batchEfficiency)}%
                </div>
              </div>
              
              <div>
                <div className="text-xs text-gray-500">Memory Usage</div>
                <div className="font-medium text-indigo-600">
                  {Math.round(performance.memoryUsage / 1024)}KB
                </div>
                <div className="text-xs text-gray-400">
                  {recentUpdates.length} recent updates
                </div>
              </div>
            </div>
            
            {recentUpdates.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-2">Recent Updates</div>
                <div className="space-y-1 max-h-20 overflow-y-auto">
                  {recentUpdates.slice(-3).map((update, idx) => (
                    <div key={idx} className="text-xs text-gray-600 flex justify-between">
                      <span>{update.type} {update.entrantId ? `(${update.entrantId.slice(-4)})` : ''}</span>
                      <span>{update.timestamp.toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="overflow-x-auto">
        <table 
          className="min-w-full divide-y divide-gray-200"
          role="table"
          aria-label="Race entrants data grid"
          aria-describedby="entrants-description"
        >
          <thead className="bg-gray-50" role="rowgroup">
            <tr role="row">
              <th 
                scope="col" 
                className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                role="columnheader"
              >
                #
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                role="columnheader"
              >
                Runner / Jockey / Trainer
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider font-mono"
                role="columnheader"
              >
                Win Odds
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider font-mono"
                role="columnheader"
              >
                Place Odds
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider font-mono"
                role="columnheader"
                aria-describedby="money-flow-description"
              >
                Money%
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                role="columnheader"
                aria-describedby="trend-description"
              >
                Trend
              </th>
            </tr>
          </thead>
          <tbody 
            className="bg-white divide-y divide-gray-200" 
            role="rowgroup"
          >
            {sortedEntrants.map((entrant) => (
              <EntrantRow
                key={entrant.$id}
                entrant={entrant}
                getTrendIndicator={getTrendIndicator}
                formatOdds={formatOdds}
                formatMoneyFlow={formatMoneyFlow}
                moneyFlowTrend={moneyFlowTrends[entrant.$id]}
              />
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Description for screen readers */}
      <div id="entrants-description" className="sr-only">
        Data grid showing race entrants with saddlecloth numbers, runner names, jockey and trainer information, current win and place odds, money flow percentages, and trend sparkline charts. Odds and money flow are updated in real-time and include trend indicators showing whether values have increased or decreased.
      </div>
      
      {/* Money flow column description for screen readers */}
      <div id="money-flow-description" className="sr-only">
        Money flow percentage shows the current hold percentage for each entrant, representing market interest and betting volume.
      </div>
      
      {/* Trend column description for screen readers */}
      <div id="trend-description" className="sr-only">
        Trend column displays sparkline charts showing the recent history of Win odds for each entrant, allowing you to spot betting trends at a glance.
      </div>
      
      {/* Enhanced Live region for real-time updates with comprehensive notifications */}
      <div 
        aria-live="polite" 
        aria-atomic="false" 
        className="sr-only"
        id="entrants-updates"
        aria-label="Live entrant updates"
      >
        {updateNotifications && (
          <>
            {/* Connection status changes */}
            {connectionState.isConnected ? '' : 'Connection lost. Attempting to reconnect.'}
            
            {/* Update notifications with more detail */}
            {Object.keys(oddsUpdates).length > 0 && (
              `Odds updated for ${Object.keys(oddsUpdates).length} entrant${Object.keys(oddsUpdates).length === 1 ? '' : 's'}`
            )}
            {Object.keys(moneyFlowUpdates).length > 0 && (
              ` Money flow updated for ${Object.keys(moneyFlowUpdates).length} entrant${Object.keys(moneyFlowUpdates).length === 1 ? '' : 's'}`
            )}
            {Object.keys(oddsHistoryUpdates || {}).length > 0 && (
              ` Odds trend data updated for ${Object.keys(oddsHistoryUpdates || {}).length} entrant${Object.keys(oddsHistoryUpdates || {}).length === 1 ? '' : 's'}`
            )}
            
            {/* Performance alerts */}
            {performance.updatesPerMinute > 50 && (
              ' High update frequency detected. Data is very active.'
            )}
            {performance.averageUpdateLatency > 1000 && (
              ' Slower update speeds detected. Data may be delayed.'
            )}
          </>
        )}
      </div>
      
      {/* Update notification toggle */}
      <div className="p-3 border-t border-gray-100 bg-gray-50">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center space-x-4">
            <span className="text-gray-500">
              Last update: {recentUpdates.length > 0 
                ? recentUpdates[recentUpdates.length - 1].timestamp.toLocaleTimeString()
                : 'No updates yet'
              }
            </span>
            {connectionState.averageLatency > 0 && (
              <span className="text-gray-500">
                Avg latency: {Math.round(connectionState.averageLatency)}ms
              </span>
            )}
          </div>
          
          <button
            onClick={() => setUpdateNotifications(!updateNotifications)}
            className={`px-2 py-1 rounded text-xs transition-colors ${
              updateNotifications 
                ? 'bg-blue-100 text-blue-700' 
                : 'bg-gray-200 text-gray-600'
            }`}
            aria-label={updateNotifications ? 'Disable update announcements' : 'Enable update announcements'}
          >
            {updateNotifications ? '🔊 Announcements On' : '🔇 Announcements Off'}
          </button>
        </div>
      </div>
    </div>
  );
});