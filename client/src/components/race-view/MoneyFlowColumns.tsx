'use client';

import { memo, useMemo, useCallback, useRef, useEffect, useState } from 'react';
import type { 
  MoneyFlowTimePeriod, 
  MoneyFlowDataPoint, 
  EntrantMoneyFlowTimeline,
  MoneyFlowVisualIndicator 
} from '@/types/moneyFlow';
import type { Entrant } from '@/types/meetings';

interface MoneyFlowColumnsProps {
  entrants: Entrant[];
  raceStartTime: string;
  className?: string;
  stickyRunnerColumn?: boolean;
  showIncrementalOnly?: boolean;
  onScroll?: (scrollPosition: number) => void;
}

// Utility functions for money flow calculations
const MoneyFlowUtils = {
  generateTimePeriods: (raceStartTime: string, currentTime: string = new Date().toISOString()): MoneyFlowTimePeriod[] => {
    const raceStart = new Date(raceStartTime);
    const current = new Date(currentTime);
    const timeToRace = Math.floor((raceStart.getTime() - current.getTime()) / (1000 * 60)); // minutes
    
    // Standard polling intervals based on time to start
    const intervals = [-60, -40, -20, -10, -5, -2, -1, 0]; // minutes before start
    
    return intervals
      .filter(interval => timeToRace > interval || interval === 0) // Only show relevant periods
      .map(interval => ({
        label: interval === 0 ? 'Start' : `T${Math.abs(interval)}m`,
        timeToStart: Math.abs(interval),
        timestamp: new Date(raceStart.getTime() + (interval * 60 * 1000)).toISOString()
      }));
  },

  calculateIncremental: (current: MoneyFlowDataPoint, previous?: MoneyFlowDataPoint): number => {
    if (!previous) return current.totalPoolAmount;
    return current.totalPoolAmount - previous.totalPoolAmount;
  },

  determineTrend: (dataPoints: MoneyFlowDataPoint[]): 'up' | 'down' | 'neutral' => {
    if (dataPoints.length < 2) return 'neutral';
    
    const recent = dataPoints.slice(-3); // Last 3 data points
    let upCount = 0;
    let downCount = 0;
    
    for (let i = 1; i < recent.length; i++) {
      const change = recent[i].poolPercentage - recent[i-1].poolPercentage;
      if (change > 0.1) upCount++; // > 0.1% increase
      else if (change < -0.1) downCount++; // > 0.1% decrease
    }
    
    if (upCount > downCount) return 'up';
    if (downCount > upCount) return 'down';
    return 'neutral';
  },

  getVisualIndicator: (dataPoint: MoneyFlowDataPoint, trend: 'up' | 'down' | 'neutral'): MoneyFlowVisualIndicator => {
    const isRecent = new Date().getTime() - new Date(dataPoint.pollingTimestamp).getTime() < 300000; // 5 minutes
    const isSignificant = Math.abs(dataPoint.incrementalAmount) > 1000; // $1000+ change
    
    if (isRecent && isSignificant) {
      return {
        type: 'recent',
        color: trend === 'up' ? 'red' : trend === 'down' ? 'blue' : 'yellow',
        icon: '⚡',
        description: 'Recent significant change'
      };
    }
    
    if (isSignificant) {
      return {
        type: 'significant',
        color: trend === 'up' ? 'red' : 'blue',
        icon: trend === 'up' ? '📈' : '📉',
        description: 'Significant change'
      };
    }
    
    if (trend === 'up') {
      return {
        type: 'increase',
        color: 'green',
        description: 'Increasing'
      };
    }
    
    if (trend === 'down') {
      return {
        type: 'decrease',
        color: 'blue',
        description: 'Decreasing'
      };
    }
    
    return {
      type: 'increase',
      color: 'yellow',
      description: 'Neutral'
    };
  }
};

// Memoized individual time column component
const TimeColumn = memo(function TimeColumn({
  period,
  entrantData,
  showIncremental,
  isVisible
}: {
  period: MoneyFlowTimePeriod;
  entrantData: Map<string, MoneyFlowDataPoint>;
  showIncremental: boolean;
  isVisible: boolean;
}) {
  // Don't render content if not visible (virtualization optimization)
  if (!isVisible) {
    return <div className="w-24 flex-shrink-0" />;
  }

  return (
    <div className="w-24 flex-shrink-0 border-r border-gray-200">
      {/* Column Header */}
      <div className="sticky top-0 bg-gray-50 border-b border-gray-200 p-2 text-center">
        <div className="text-xs font-medium text-gray-700">{period.label}</div>
        <div className="text-xs text-gray-500">{new Date(period.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>
  );
});

// Memoized money flow cell component
const MoneyFlowCell = memo(function MoneyFlowCell({
  entrantId,
  dataPoint,
  previousDataPoint,
  showIncremental,
  trend
}: {
  entrantId: string;
  dataPoint?: MoneyFlowDataPoint;
  previousDataPoint?: MoneyFlowDataPoint;
  showIncremental: boolean;
  trend: 'up' | 'down' | 'neutral';
}) {
  const value = useMemo(() => {
    if (!dataPoint) return null;
    
    if (showIncremental) {
      const incremental = MoneyFlowUtils.calculateIncremental(dataPoint, previousDataPoint);
      return incremental > 0 ? `+$${incremental.toLocaleString()}` : '—';
    }
    
    return `${dataPoint.poolPercentage.toFixed(1)}%`;
  }, [dataPoint, previousDataPoint, showIncremental]);

  const indicator = useMemo(() => {
    if (!dataPoint) return null;
    return MoneyFlowUtils.getVisualIndicator(dataPoint, trend);
  }, [dataPoint, trend]);

  const cellClassName = useMemo(() => {
    if (!dataPoint) return 'p-2 text-center text-gray-300';
    
    const baseClasses = 'p-2 text-center text-xs font-mono transition-colors';
    
    if (indicator) {
      switch (indicator.color) {
        case 'red':
          return `${baseClasses} bg-red-50 text-red-700 border-red-200`;
        case 'green':
          return `${baseClasses} bg-green-50 text-green-700 border-green-200`;
        case 'blue':
          return `${baseClasses} bg-blue-50 text-blue-700 border-blue-200`;
        case 'yellow':
          return `${baseClasses} bg-yellow-50 text-yellow-700 border-yellow-200`;
        default:
          return `${baseClasses} text-gray-700`;
      }
    }
    
    return `${baseClasses} text-gray-700`;
  }, [dataPoint, indicator]);

  return (
    <div className={cellClassName}>
      <div className="flex items-center justify-center space-x-1">
        {indicator?.icon && (
          <span className="text-xs" title={indicator.description}>
            {indicator.icon}
          </span>
        )}
        <span>{value || '—'}</span>
      </div>
    </div>
  );
});

// Memoized entrant row component for money flow data
const EntrantMoneyFlowRow = memo(function EntrantMoneyFlowRow({
  entrant,
  timePeriods,
  entrantTimeline,
  showIncremental,
  visibleColumns
}: {
  entrant: Entrant;
  timePeriods: MoneyFlowTimePeriod[];
  entrantTimeline?: EntrantMoneyFlowTimeline;
  showIncremental: boolean;
  visibleColumns: Set<number>;
}) {
  const dataPointsByTime = useMemo(() => {
    if (!entrantTimeline) return new Map();
    
    const map = new Map<string, MoneyFlowDataPoint>();
    entrantTimeline.dataPoints.forEach(point => {
      map.set(point.pollingTimestamp, point);
    });
    return map;
  }, [entrantTimeline]);

  const sortedDataPoints = useMemo(() => {
    if (!entrantTimeline) return [];
    return [...entrantTimeline.dataPoints].sort((a, b) => 
      new Date(a.pollingTimestamp).getTime() - new Date(b.pollingTimestamp).getTime()
    );
  }, [entrantTimeline]);

  return (
    <div className="flex border-b border-gray-100">
      {timePeriods.map((period, index) => {
        const dataPoint = dataPointsByTime.get(period.timestamp);
        const previousDataPoint = index > 0 ? sortedDataPoints[index - 1] : undefined;
        const isVisible = visibleColumns.has(index);
        
        return (
          <MoneyFlowCell
            key={`${entrant.$id}-${period.timestamp}`}
            entrantId={entrant.$id}
            dataPoint={dataPoint}
            previousDataPoint={previousDataPoint}
            showIncremental={showIncremental}
            trend={entrantTimeline?.trend || 'neutral'}
          />
        );
      })}
    </div>
  );
});

export const MoneyFlowColumns = memo(function MoneyFlowColumns({
  entrants,
  raceStartTime,
  className = '',
  stickyRunnerColumn = true,
  showIncrementalOnly = false,
  onScroll
}: MoneyFlowColumnsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<number>>(new Set());
  
  // Generate time periods based on race start time
  const timePeriods = useMemo(() => {
    return MoneyFlowUtils.generateTimePeriods(raceStartTime);
  }, [raceStartTime]);

  // Mock entrant timelines (in real implementation, this would come from props or context)
  const entrantTimelines = useMemo(() => {
    const timelines = new Map<string, EntrantMoneyFlowTimeline>();
    
    entrants.forEach(entrant => {
      // Generate mock timeline data based on existing holdPercentage
      const mockDataPoints: MoneyFlowDataPoint[] = timePeriods.map((period, index) => ({
        $id: `mock-${entrant.$id}-${index}`,
        $createdAt: period.timestamp,
        $updatedAt: period.timestamp,
        entrant: entrant.$id,
        pollingTimestamp: period.timestamp,
        timeToStart: period.timeToStart,
        winPoolAmount: (entrant.holdPercentage || 5) * 100 * (index + 1),
        placePoolAmount: (entrant.holdPercentage || 5) * 50 * (index + 1),
        totalPoolAmount: (entrant.holdPercentage || 5) * 150 * (index + 1),
        poolPercentage: entrant.holdPercentage || 5,
        incrementalAmount: index > 0 ? Math.random() * 1000 - 500 : 0,
        pollingInterval: 5
      }));

      timelines.set(entrant.$id, {
        entrantId: entrant.$id,
        dataPoints: mockDataPoints,
        latestPercentage: entrant.holdPercentage || 5,
        trend: entrant.moneyFlowTrend || 'neutral',
        significantChange: Math.abs((entrant.holdPercentage || 5) - (entrant.previousHoldPercentage || 5)) > 2
      });
    });
    
    return timelines;
  }, [entrants, timePeriods]);

  // Virtualization: Calculate which columns are visible
  useEffect(() => {
    if (!scrollRef.current) return;
    
    const updateVisibleColumns = () => {
      if (!scrollRef.current) return;
      
      const container = scrollRef.current;
      const scrollLeft = container.scrollLeft;
      const containerWidth = container.clientWidth;
      const columnWidth = 96; // w-24 = 96px
      
      const startIndex = Math.floor(scrollLeft / columnWidth);
      const endIndex = Math.min(
        timePeriods.length - 1,
        Math.ceil((scrollLeft + containerWidth) / columnWidth)
      );
      
      const visible = new Set<number>();
      for (let i = Math.max(0, startIndex - 1); i <= endIndex + 1; i++) {
        visible.add(i);
      }
      
      setVisibleColumns(visible);
    };

    updateVisibleColumns();
    
    const container = scrollRef.current;
    container.addEventListener('scroll', updateVisibleColumns);
    
    return () => {
      container.removeEventListener('scroll', updateVisibleColumns);
    };
  }, [timePeriods.length]);

  // Handle scroll events
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (onScroll) {
      onScroll(event.currentTarget.scrollLeft);
    }
  }, [onScroll]);

  // Sorted entrants for consistent display
  const sortedEntrants = useMemo(() => {
    return [...entrants].sort((a, b) => a.runnerNumber - b.runnerNumber);
  }, [entrants]);

  if (timePeriods.length === 0) {
    return (
      <div className={`text-center p-4 text-gray-500 ${className}`}>
        No money flow timeline data available
      </div>
    );
  }

  return (
    <div className={`money-flow-columns ${className}`}>
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 p-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">
            Money Flow Timeline
          </h3>
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <span>Polling intervals: 5min</span>
            <span>|</span>
            <span>{timePeriods.length} periods</span>
          </div>
        </div>
      </div>

      {/* Horizontal scrolling container */}
      <div 
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden"
        onScroll={handleScroll}
        style={{ maxHeight: '400px' }}
      >
        <div className="flex">
          {/* Time period headers */}
          <div className="flex">
            {timePeriods.map((period, index) => (
              <TimeColumn
                key={period.timestamp}
                period={period}
                entrantData={new Map()} // Headers don't need data
                showIncremental={showIncrementalOnly}
                isVisible={visibleColumns.has(index)}
              />
            ))}
          </div>
        </div>

        {/* Entrant rows */}
        <div>
          {sortedEntrants.map((entrant) => (
            <EntrantMoneyFlowRow
              key={entrant.$id}
              entrant={entrant}
              timePeriods={timePeriods}
              entrantTimeline={entrantTimelines.get(entrant.$id)}
              showIncremental={showIncrementalOnly}
              visibleColumns={visibleColumns}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-gray-50 border-t border-gray-200 p-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1">
              <span className="text-red-600">⚡</span>
              <span className="text-gray-600">Recent significant change</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-green-600">📈</span>
              <span className="text-gray-600">Increasing money flow</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-blue-600">📉</span>
              <span className="text-gray-600">Decreasing money flow</span>
            </div>
          </div>
          <div className="text-gray-500">
            Scroll horizontally to view all time periods
          </div>
        </div>
      </div>

      {/* Accessibility announcements */}
      <div className="sr-only" aria-live="polite">
        Money flow timeline showing {timePeriods.length} time periods for {sortedEntrants.length} entrants. 
        Use arrow keys to navigate between time periods and entrants.
      </div>
    </div>
  );
});

export default MoneyFlowColumns;