'use client';

import { memo, useMemo } from 'react';
import { Entrant } from '@/types/meetings';
import { useRealtimeEntrants } from '@/hooks/useRealtimeEntrants';

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
    </tr>
  );
});

interface EntrantsGridProps {
  initialEntrants: Entrant[];
  raceId: string;
}

export const EntrantsGrid = memo(function EntrantsGrid({ initialEntrants, raceId }: EntrantsGridProps) {
  const { entrants, isConnected, oddsUpdates, moneyFlowUpdates } = useRealtimeEntrants({
    initialEntrants,
    raceId,
  });
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
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">
            Race Entrants ({sortedEntrants.length})
          </h2>
          <span 
            className={`text-xs px-2 py-1 rounded-full ${
              isConnected 
                ? 'bg-green-100 text-green-700' 
                : 'bg-red-100 text-red-700'
            }`}
            aria-live="polite"
            aria-label={isConnected ? 'Connected to live odds' : 'Disconnected from live odds'}
          >
            {isConnected ? '🔄 Live' : '📶 Disconnected'}
          </span>
        </div>
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
        Data grid showing race entrants with saddlecloth numbers, runner names, jockey and trainer information, current win and place odds, and money flow percentages. Odds and money flow are updated in real-time and include trend indicators showing whether values have increased or decreased.
      </div>
      
      {/* Money flow column description for screen readers */}
      <div id="money-flow-description" className="sr-only">
        Money flow percentage shows the current hold percentage for each entrant, representing market interest and betting volume.
      </div>
      
      {/* Live region for real-time updates */}
      <div 
        aria-live="polite" 
        aria-atomic="false" 
        className="sr-only"
        id="entrants-updates"
        aria-label="Live entrant updates"
      >
        {Object.keys(oddsUpdates).length > 0 && (
          `Odds updated for ${Object.keys(oddsUpdates).length} entrant${Object.keys(oddsUpdates).length === 1 ? '' : 's'}`
        )}
        {Object.keys(moneyFlowUpdates).length > 0 && (
          ` Money flow updated for ${Object.keys(moneyFlowUpdates).length} entrant${Object.keys(moneyFlowUpdates).length === 1 ? '' : 's'}`
        )}
      </div>
    </div>
  );
});