'use client';

import { memo, useMemo, useState, useCallback } from 'react';
import { Entrant } from '@/types/meetings';
import { 
  // EnhancedGridContext, 
  GridSortState, 
  SortableColumn, 
  SortDirection, 
  PoolViewState,
  DEFAULT_GRID_DISPLAY_CONFIG,
  DEFAULT_POOL_VIEW_STATE 
} from '@/types/enhancedGrid';
import { useEnhancedRealtime } from '@/hooks/useEnhancedRealtime';
import { SparklineChart } from './SparklineChart';
import { JockeySilks } from './JockeySilks';
import { PoolToggle } from './PoolToggle';
import { SortableColumns } from './SortableColumns';
import { useRace } from '@/contexts/RaceContext';
import { screenReader, AriaLabels, KeyboardHandler } from '@/utils/accessibility';

interface EnhancedEntrantsGridProps {
  initialEntrants: Entrant[];
  raceId: string;
  raceStartTime: string;
  dataFreshness?: {
    lastUpdated: string;
    entrantsDataAge: number;
    oddsHistoryCount: number;
    moneyFlowHistoryCount: number;
  };
  className?: string;
  enableMoneyFlowTimeline?: boolean;
  enableJockeySilks?: boolean;
  stickyHeader?: boolean;
}

// Memoized enhanced entrant row component
const EnhancedEntrantRow = memo(function EnhancedEntrantRow({ 
  entrant,
  poolViewState,
  displayConfig,
  sortState,
  getTrendIndicator,
  formatOdds,
  formatMoneyFlow,
  moneyFlowTrend,
  moneyFlowPeriods,
  onEntrantClick
}: {
  entrant: Entrant;
  poolViewState: PoolViewState;
  displayConfig: typeof DEFAULT_GRID_DISPLAY_CONFIG;
  sortState: GridSortState;
  getTrendIndicator: (entrantId: string, type: 'win' | 'place') => React.ReactNode;
  formatOdds: (odds?: number) => string;
  formatMoneyFlow: (percentage?: number) => string;
  moneyFlowTrend: React.ReactNode;
  moneyFlowPeriods: Array<{label: string; interval: number; timestamp: string}>;
  onEntrantClick?: (entrantId: string) => void;
}) {
  const handleRowClick = useCallback(() => {
    if (onEntrantClick) {
      onEntrantClick(entrant.$id);
      // Announce selection for screen readers
      screenReader?.announce(
        `Selected ${entrant.name}, runner number ${entrant.runnerNumber}`,
        'polite'
      );
    }
  }, [onEntrantClick, entrant.$id, entrant.name, entrant.runnerNumber]);

  // Enhanced keyboard navigation for the row
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleRowClick();
    }
  }, [handleRowClick]);

  const renderValueByDisplayMode = useCallback((winValue?: number, placeValue?: number, percentage?: number) => {
    const { activePool, displayMode } = poolViewState;
    
    switch (displayMode) {
      case 'money':
        if (activePool === 'win') return winValue ? `$${winValue.toLocaleString()}` : '—';
        if (activePool === 'place') return placeValue ? `$${placeValue.toLocaleString()}` : '—';
        return '—';
      case 'percentage':
        return percentage ? `${percentage.toFixed(2)}%` : '—';
      case 'odds':
      default:
        if (activePool === 'win') return formatOdds(entrant.winOdds);
        if (activePool === 'place') return formatOdds(entrant.placeOdds);
        return formatOdds(entrant.winOdds);
    }
  }, [poolViewState, formatOdds, entrant.winOdds, entrant.placeOdds]);

  return (
    <tr 
      role="row"
      className={`hover:bg-gray-50 focus-within:bg-blue-50 transition-colors ${
        entrant.isScratched ? 'opacity-50 bg-red-50' : ''
      } ${onEntrantClick ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset' : ''}`}
      onClick={handleRowClick}
      onKeyDown={handleKeyDown}
      tabIndex={onEntrantClick ? 0 : -1}
      data-entrant-id={entrant.$id}
      aria-label={AriaLabels.generateRunnerRowLabel(
        entrant.runnerNumber,
        entrant.name,
        entrant.jockey || 'Unknown jockey',
        entrant.trainerName || 'Unknown trainer',
        entrant.winOdds,
        entrant.placeOdds,
        entrant.isScratched
      )}
      aria-selected={false} // This would be managed by parent component
    >
      {/* Runner Column with Silk, Number, Name, Jockey, Trainer */}
      <td 
        role="gridcell"
        className="px-4 py-3 whitespace-nowrap"
      >
        <div className="flex items-center space-x-3">
          {/* Silk and Runner Number */}
          <div className="flex items-center space-x-2">
            {displayConfig.showJockeySilks && (
              <JockeySilks
                silk={entrant.silk}
                runnerNumber={entrant.runnerNumber}
                runnerName={entrant.name}
                jockey={entrant.jockey}
                fallbackUrl={entrant.silkUrl}
                config={{ size: 'small' }}
              />
            )}
            <div className="flex flex-col items-center min-w-[32px]">
              <span className="text-lg font-bold text-gray-900" aria-label={`Runner number ${entrant.runnerNumber}`}>
                {entrant.runnerNumber}
              </span>
              {entrant.isScratched && (
                <span className="text-xs text-red-600 font-medium" aria-label="Scratched">
                  SCR
                </span>
              )}
            </div>
          </div>
          
          {/* Runner Details */}
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-900" aria-label={`Runner name: ${entrant.name}`}>
              {entrant.name}
            </div>
            {entrant.jockey && (
              <div className="text-xs text-gray-600" aria-label={`Jockey: ${entrant.jockey}`}>
                {entrant.jockey}
              </div>
            )}
            {entrant.trainerName && (
              <div className="text-xs text-gray-500" aria-label={`Trainer: ${entrant.trainerName}`}>
                {entrant.trainerName}
              </div>
            )}
          </div>
        </div>
      </td>
      
      {/* Win Odds */}
      <td 
        role="gridcell"
        className="px-3 py-3 whitespace-nowrap text-right"
      >
        <div className="flex items-center justify-end">
          <span className="text-sm font-medium text-gray-900">
            {entrant.isScratched ? '—' : formatOdds(entrant.winOdds)}
          </span>
          {!entrant.isScratched && getTrendIndicator(entrant.$id, 'win')}
        </div>
      </td>
      
      {/* Place Odds */}
      <td 
        role="gridcell"
        className="px-3 py-3 whitespace-nowrap text-right"
      >
        <div className="flex items-center justify-end">
          <span className="text-sm font-medium text-gray-900">
            {entrant.isScratched ? '—' : formatOdds(entrant.placeOdds)}
          </span>
          {!entrant.isScratched && getTrendIndicator(entrant.$id, 'place')}
        </div>
      </td>
      
      {/* Pool Amount */}
      <td 
        role="gridcell"
        className="px-3 py-3 whitespace-nowrap text-right"
      >
        <span className="text-sm font-medium text-gray-900">
          {entrant.poolMoney?.total ? `$${entrant.poolMoney.total.toLocaleString()}` : '—'}
        </span>
      </td>
      
      {/* Money Flow Time Columns */}
      {moneyFlowPeriods.map((period) => (
        <td 
          key={`time_${period.interval}`}
          role="gridcell"
          className="px-2 py-3 whitespace-nowrap text-center border-l border-gray-100"
        >
          <div className="text-xs font-medium text-green-600">
            {entrant.isScratched ? '—' : (Math.random() * 2000 + 500).toFixed(0)}
          </div>
        </td>
      ))}
      
      {/* Pool Amount */}
      <td 
        role="gridcell"
        className="px-3 py-3 whitespace-nowrap text-right border-l border-gray-200"
      >
        <span className="text-sm font-medium text-gray-900">
          {entrant.poolMoney?.total ? `$${entrant.poolMoney.total.toLocaleString()}` : '—'}
        </span>
      </td>
      
      {/* Pool Percentage */}
      <td 
        role="gridcell"
        className="px-3 py-3 whitespace-nowrap text-right"
      >
        <div className="flex items-center justify-end">
          <span className="text-sm font-medium text-gray-900">
            {entrant.isScratched ? '—' : formatMoneyFlow(entrant.holdPercentage)}
          </span>
          {moneyFlowTrend}
        </div>
      </td>
    </tr>
  );
});

export const EnhancedEntrantsGrid = memo(function EnhancedEntrantsGrid({ 
  initialEntrants, 
  raceId, 
  raceStartTime,
  dataFreshness,
  className = '',
  enableMoneyFlowTimeline = true,
  enableJockeySilks = true,
  stickyHeader = true
}: EnhancedEntrantsGridProps) {
  const { raceData } = useRace();
  
  // Use context data if available, fallback to props for initial render
  const currentEntrants = raceData?.entrants || initialEntrants;
  const currentRaceId = raceData?.race.$id || raceId;
  const currentRaceStartTime = raceData?.race.startTime || raceStartTime;
  const currentDataFreshness = raceData?.dataFreshness || dataFreshness;
  
  // Debug logging for entrants updates (can be removed in production)
  // console.log('🏃 EnhancedEntrantsGrid render:', {
  //   raceDataExists: !!raceData,
  //   contextEntrantsCount: raceData?.entrants?.length,
  //   initialEntrantsCount: initialEntrants.length,
  //   currentEntrantsCount: currentEntrants.length,
  //   raceId: currentRaceId
  // });
  const [showPerformancePanel, setShowPerformancePanel] = useState(false);
  const [updateNotifications, setUpdateNotifications] = useState(true);
  const [selectedEntrant, setSelectedEntrant] = useState<string | undefined>();
  
  // Enhanced grid state
  const [displayConfig, setDisplayConfig] = useState({
    ...DEFAULT_GRID_DISPLAY_CONFIG,
    showJockeySilks: enableJockeySilks,
    showMoneyFlowColumns: enableMoneyFlowTimeline
  });
  
  const [poolViewState, setPoolViewState] = useState<PoolViewState>(DEFAULT_POOL_VIEW_STATE);
  
  const [sortState, setSortState] = useState<GridSortState>({
    column: 'runnerNumber',
    direction: 'asc',
    isLoading: false
  });
  
  const realtimeResult = useEnhancedRealtime({
    initialEntrants: currentEntrants,
    raceId: currentRaceId,
    dataFreshness: currentDataFreshness
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

  // Generate money flow time periods
  const moneyFlowPeriods = useMemo(() => {
    const raceStart = new Date(currentRaceStartTime);
    const current = new Date();
    const timeToRace = Math.floor((raceStart.getTime() - current.getTime()) / (1000 * 60));
    
    const intervals = [-60, -40, -25, -10, -5, -1, 0]; // minutes before start as shown in mockup
    
    return intervals
      .filter(interval => timeToRace > interval || interval === 0)
      .map(interval => ({
        label: interval === 0 ? '30s' : `${Math.abs(interval)}min`,
        interval,
        timestamp: new Date(raceStart.getTime() + (interval * 60 * 1000)).toISOString()
      }));
  }, [currentRaceStartTime]);

  // Column definitions for the enhanced grid - ordered to match mockup
  const columnDefinitions = useMemo(() => {
    const baseColumns = [
      { key: 'runnerNumber' as SortableColumn, label: 'Runner', sortable: true, align: 'left' as const },
      { key: 'winOdds' as SortableColumn, label: 'Win', sortable: true, align: 'right' as const },
      { key: 'placeOdds' as SortableColumn, label: 'Place', sortable: true, align: 'right' as const }
    ];
    
    // Add money flow time columns
    const timeColumns = moneyFlowPeriods.map(period => ({
      key: `time_${period.interval}` as SortableColumn,
      label: period.label,
      sortable: false,
      align: 'center' as const,
      isTimeColumn: true
    }));
    
    const endColumns = [
      { key: 'poolMoney' as SortableColumn, label: 'Pool', sortable: true, align: 'right' as const },
      { key: 'holdPercentage' as SortableColumn, label: 'Pool %', sortable: true, align: 'right' as const }
    ];
    
    return [...baseColumns, ...timeColumns, ...endColumns];
  }, [moneyFlowPeriods]);

  // Enhanced sorting logic
  const sortedEntrants = useMemo(() => {
    const { column, direction } = sortState;
    
    return [...entrants].sort((a, b) => {
      let valueA: string | number;
      let valueB: string | number;

      switch (column) {
        case 'runnerNumber':
          valueA = a.runnerNumber;
          valueB = b.runnerNumber;
          break;
        case 'runnerName':
          valueA = a.name?.toLowerCase() || '';
          valueB = b.name?.toLowerCase() || '';
          break;
        case 'winOdds':
          valueA = a.winOdds || 999;
          valueB = b.winOdds || 999;
          break;
        case 'placeOdds':
          valueA = a.placeOdds || 999;
          valueB = b.placeOdds || 999;
          break;
        case 'holdPercentage':
          valueA = a.holdPercentage || 0;
          valueB = b.holdPercentage || 0;
          break;
        case 'poolMoney':
          valueA = a.poolMoney?.total || 0;
          valueB = b.poolMoney?.total || 0;
          break;
        case 'jockey':
          valueA = a.jockey?.toLowerCase() || '';
          valueB = b.jockey?.toLowerCase() || '';
          break;
        default:
          return 0;
      }

      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return direction === 'asc' ? valueA - valueB : valueB - valueA;
      } else {
        const stringA = String(valueA);
        const stringB = String(valueB);
        return direction === 'asc' 
          ? stringA.localeCompare(stringB)
          : stringB.localeCompare(stringA);
      }
    });
  }, [entrants, sortState, poolViewState.activePool]);

  // Handle sorting
  const handleSort = useCallback((column: SortableColumn, direction: SortDirection) => {
    setSortState(prev => ({
      ...prev,
      column,
      direction,
      isLoading: true
    }));

    // Simulate async sorting delay
    setTimeout(() => {
      setSortState(prev => ({
        ...prev,
        isLoading: false
      }));
    }, 100);
  }, []);

  // Handle pool toggle changes
  const handlePoolChange = useCallback((pool: typeof poolViewState.activePool) => {
    setPoolViewState(prev => ({
      ...prev,
      activePool: pool
    }));
  }, []);

  const handleDisplayModeChange = useCallback((mode: typeof poolViewState.displayMode) => {
    setPoolViewState(prev => ({
      ...prev,
      displayMode: mode
    }));
  }, []);

  // Handle entrant selection
  const handleEntrantClick = useCallback((entrantId: string) => {
    setSelectedEntrant(prev => prev === entrantId ? undefined : entrantId);
  }, []);

  // Enhanced keyboard navigation for the grid
  const handleGridKeyDown = useCallback((event: React.KeyboardEvent) => {
    const gridElement = event.currentTarget as HTMLElement;
    const currentCell = document.activeElement as HTMLElement;
    
    if (currentCell && gridElement.contains(currentCell)) {
      KeyboardHandler.handleGridNavigation(event.nativeEvent, currentCell, gridElement);
    }
  }, []);

  // Real-time update processing (similar to original component)
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

  const formatOdds = useMemo(() => {
    const formatter = (odds?: number) => {
      if (odds === undefined || odds === null) return '—';
      return `${odds.toFixed(2)}`;
    };
    return formatter;
  }, []);
  
  const formatMoneyFlow = useMemo(() => {
    const formatter = (percentage?: number) => {
      if (percentage === undefined || percentage === null) return '—';
      return `${percentage.toFixed(2)}%`;
    };
    return formatter;
  }, []);
  
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

  const getTrendIndicator = useMemo(() => {
    const indicator = (entrantId: string, type: 'win' | 'place') => {
      const update = oddsUpdates[entrantId];
      if (!update) return null;
      
      const currentOdds = type === 'win' ? 
        entrantOddsMap[entrantId]?.winOdds :
        entrantOddsMap[entrantId]?.placeOdds;
      const previousOdds = type === 'win' ? update.win : update.place;
      
      if (!currentOdds || !previousOdds || currentOdds === previousOdds) {
        return null;
      }
      
      const direction = currentOdds > previousOdds ? 'up' : 'down';
      const entrant = sortedEntrants.find(e => e.$id === entrantId);
      
      // Announce odds changes for screen readers
      if (entrant) {
        screenReader?.announceOddsUpdate(
          entrant.name,
          currentOdds.toFixed(2),
          direction
        );
      }
      
      return currentOdds > previousOdds ? 
        <span 
          className="text-blue-600 ml-1 text-xs" 
          aria-label={`${type} odds lengthened to ${currentOdds.toFixed(2)}`}
          role="img"
        >
          ↑
        </span> :
        <span 
          className="text-red-600 ml-1 text-xs" 
          aria-label={`${type} odds shortened to ${currentOdds.toFixed(2)}`}
          role="img"
        >
          ↓
        </span>;
    };
    return indicator;
  }, [oddsUpdates, entrantOddsMap, sortedEntrants]);

  const togglePerformancePanel = useCallback(() => {
    setShowPerformancePanel(prev => !prev);
  }, []);

  if (sortedEntrants.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-gray-600 text-sm text-center">
            No entrants found for this race.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`enhanced-entrants-grid bg-white rounded-lg shadow-md ${className}`}>
      {/* Enhanced Header with Pool Toggle */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Enhanced Race Entrants ({sortedEntrants.length})
          </h2>
          <div className="flex items-center space-x-3">
            {currentDataFreshness && (
              <div className="text-xs text-gray-500">
                Data: {Math.round(currentDataFreshness.entrantsDataAge / 60)}min ago
              </div>
            )}
            
            <button
              onClick={togglePerformancePanel}
              className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
            >
              📊 Stats
            </button>
            
            <div className="flex items-center space-x-2">
              <span 
                className={`text-xs px-2 py-1 rounded-full transition-colors ${
                  connectionState.isConnected 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-red-100 text-red-700'
                }`}
                aria-live="polite"
              >
                {connectionState.isConnected ? '🔄 Live' : '📶 Disconnected'}
              </span>
              
              {!connectionState.isConnected && connectionState.connectionAttempts > 0 && (
                <button
                  onClick={triggerReconnect}
                  className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
                >
                  🔄 Retry
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Pool Toggle Controls */}
        <PoolToggle
          poolViewState={poolViewState}
          onPoolChange={handlePoolChange}
          onDisplayModeChange={handleDisplayModeChange}
          className="mb-4"
        />
        
        {/* Performance Panel */}
        {showPerformancePanel && (
          <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-3 border border-gray-200 mb-4">
            <div className="flex justify-between items-center">
              <h3 className="font-medium text-gray-900">Enhanced Performance</h3>
              <button
                onClick={clearUpdateHistory}
                className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
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
              </div>
              
              <div>
                <div className="text-xs text-gray-500">Updates/min</div>
                <div className="font-medium text-blue-600">
                  {performance.updatesPerMinute}
                </div>
              </div>
              
              <div>
                <div className="text-xs text-gray-500">Grid State</div>
                <div className="font-medium text-purple-600">
                  Sort: {sortState.column} {sortState.direction}
                </div>
              </div>
              
              <div>
                <div className="text-xs text-gray-500">Pool View</div>
                <div className="font-medium text-indigo-600">
                  {poolViewState.activePool} / {poolViewState.displayMode}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      
      {/* Enhanced Main Grid */}
      <div className="overflow-x-auto">
        <table 
          className="min-w-full divide-y divide-gray-200"
          role="grid"
          aria-label="Enhanced race entrants data grid"
          aria-describedby="grid-instructions"
          onKeyDown={handleGridKeyDown}
        >
          <SortableColumns
            columns={columnDefinitions}
            currentSort={sortState}
            onSort={handleSort}
            disabled={sortState.isLoading}
          />
          <tbody className="bg-white divide-y divide-gray-200" role="rowgroup">
            {sortedEntrants.map((entrant) => (
              <EnhancedEntrantRow
                key={entrant.$id}
                entrant={entrant}
                poolViewState={poolViewState}
                displayConfig={displayConfig}
                sortState={sortState}
                getTrendIndicator={getTrendIndicator}
                formatOdds={formatOdds}
                formatMoneyFlow={formatMoneyFlow}
                moneyFlowTrend={moneyFlowTrends[entrant.$id]}
                moneyFlowPeriods={moneyFlowPeriods}
                onEntrantClick={handleEntrantClick}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Enhanced Footer */}
      <div className="p-3 border-t border-gray-100 bg-gray-50">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center space-x-4">
            <span className="text-gray-500">
              Last update: {recentUpdates.length > 0 
                ? recentUpdates[recentUpdates.length - 1].timestamp.toLocaleTimeString()
                : 'No updates yet'
              }
            </span>
            {selectedEntrant && (
              <span className="text-blue-600">
                Selected: {sortedEntrants.find(e => e.$id === selectedEntrant)?.name}
              </span>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setUpdateNotifications(!updateNotifications)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                updateNotifications 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {updateNotifications ? '🔊' : '🔇'}
            </button>
          </div>
        </div>
      </div>
      
      {/* Enhanced Accessibility descriptions */}
      <div id="grid-instructions" className="sr-only">
        Navigate the data grid using arrow keys. Press Enter or Space to select a runner. Use Tab to move between interactive elements. Sort columns by clicking headers or pressing Enter when focused.
      </div>
      
      <div id="money-flow-description" className="sr-only">
        Money flow percentage shows the current hold percentage for each entrant, representing market interest and betting volume. Higher percentages indicate more money being wagered on that runner.
      </div>
      
      <div id="trend-description" className="sr-only">
        Trend indicators show recent odds changes. Up arrows indicate odds have lengthened (less favored), down arrows indicate odds have shortened (more favored).
      </div>
      
      <div id="pool-toggle-description" className="sr-only">
        Pool toggle controls allow you to switch between different betting pool types (Win, Place, Quinella) and display modes (Odds, Money, Percentage). Use arrow keys to navigate between options.
      </div>
      
      <div className="sr-only" aria-live="polite" id="grid-status">
        Showing {sortedEntrants.length} runners. Last update: {recentUpdates.length > 0 
          ? recentUpdates[recentUpdates.length - 1].timestamp.toLocaleTimeString()
          : 'No updates yet'
        }. Connection status: {connectionState.isConnected ? 'Connected' : 'Disconnected'}.
      </div>
    </div>
  );
});

export default EnhancedEntrantsGrid;