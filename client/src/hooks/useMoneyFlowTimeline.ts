/**
 * Hook for fetching and managing money flow timeline data for Enhanced Race Entrants
 * Story 4.9 implementation - provides real money flow history for timeline grid
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { client } from '@/lib/appwrite-client';

export interface MoneyFlowTimelinePoint {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  entrant: string;
  eventTimestamp: string;
  pollingTimestamp?: string;
  timeToStart?: number; // Minutes to race start
  holdPercentage?: number;
  betPercentage?: number;
  winPoolAmount?: number;
  placePoolAmount?: number;
  incrementalAmount?: number;
  poolType?: string; // 'win', 'place', 'hold', 'bet'
  type: string; // 'hold_percentage' or 'bet_percentage'
}

export interface EntrantTimelineData {
  entrantId: string;
  dataPoints: MoneyFlowTimelinePoint[];
  lastUpdated: Date | null;
}

export interface TimelineGridData {
  [timeInterval: number]: {
    [entrantId: string]: {
      incrementalAmount: number;
      poolType: 'win' | 'place' | 'quinella' | 'trifecta' | 'exacta' | 'first4';
      timestamp: string;
    };
  };
}

interface UseMoneyFlowTimelineResult {
  timelineData: Map<string, EntrantTimelineData>; // entrantId -> timeline data
  gridData: TimelineGridData; // interval -> entrantId -> data
  isLoading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refetch: () => Promise<void>;
  getEntrantDataForInterval: (entrantId: string, interval: number, poolType: 'win' | 'place') => string;
}

export function useMoneyFlowTimeline(
  raceId: string,
  entrantIds: string[],
  poolType: 'win' | 'place' | 'quinella' | 'trifecta' | 'exacta' | 'first4' = 'win'
): UseMoneyFlowTimelineResult {
  const [timelineData, setTimelineData] = useState<Map<string, EntrantTimelineData>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch money flow timeline data for all entrants
  const fetchTimelineData = useCallback(async () => {
    if (!raceId || entrantIds.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      // Use API route to fetch money flow timeline data
      const response = await fetch(`/api/race/${raceId}/money-flow-timeline?entrants=${entrantIds.join(',')}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch timeline data: ${response.statusText}`);
      }

      const data = await response.json();
      const documents = data.documents || [];

      // Group data points by entrant
      const entrantDataMap = new Map<string, EntrantTimelineData>();
      
      for (const entrantId of entrantIds) {
        entrantDataMap.set(entrantId, {
          entrantId,
          dataPoints: [],
          lastUpdated: null
        });
      }

      // Process and group data points
      for (const document of documents) {
        const dataPoint = document as MoneyFlowTimelinePoint;
        const entrantId = dataPoint.entrant;
        
        if (entrantDataMap.has(entrantId)) {
          const entrantData = entrantDataMap.get(entrantId)!;
          entrantData.dataPoints.push(dataPoint);
          
          // Update last updated timestamp
          const pointTimestamp = new Date(dataPoint.pollingTimestamp || dataPoint.eventTimestamp);
          if (!entrantData.lastUpdated || pointTimestamp > entrantData.lastUpdated) {
            entrantData.lastUpdated = pointTimestamp;
          }
        }
      }

      // Sort data points by timestamp for each entrant (oldest first for incremental calculation)
      for (const [entrantId, entrantData] of entrantDataMap) {
        entrantData.dataPoints.sort((a, b) => {
          const timeA = new Date(a.pollingTimestamp || a.eventTimestamp).getTime();
          const timeB = new Date(b.pollingTimestamp || b.eventTimestamp).getTime();
          return timeA - timeB;
        });
      }

      setTimelineData(entrantDataMap);
      setLastUpdate(new Date());
      
      console.log('📊 Money flow timeline data fetched:', {
        raceId,
        entrantsCount: entrantIds.length,
        totalDataPoints: documents.length,
        entrantsWithData: Array.from(entrantDataMap.values()).filter(d => d.dataPoints.length > 0).length
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch timeline data');
      console.error('Error fetching money flow timeline:', err);
    } finally {
      setIsLoading(false);
    }
  }, [raceId, entrantIds]);

  // Generate timeline grid data optimized for component display
  const gridData = useMemo(() => {
    const grid: TimelineGridData = {};
    
    for (const [entrantId, entrantData] of timelineData) {
      // Skip if no data points
      if (entrantData.dataPoints.length === 0) continue;
      
      // Process data points to calculate incremental amounts
      let previousAmount = 0;
      
      for (let i = 0; i < entrantData.dataPoints.length; i++) {
        const dataPoint = entrantData.dataPoints[i];
        
        // Skip if no timeToStart data
        if (typeof dataPoint.timeToStart !== 'number') continue;
        
        // Get the appropriate pool amount based on poolType
        let currentAmount = 0;
        if (poolType === 'win' && typeof dataPoint.winPoolAmount === 'number') {
          currentAmount = dataPoint.winPoolAmount;
        } else if (poolType === 'place' && typeof dataPoint.placePoolAmount === 'number') {
          currentAmount = dataPoint.placePoolAmount;
        } else if (dataPoint.holdPercentage && dataPoint.type === 'hold_percentage') {
          // Fallback to percentage-based calculation if pool amounts not available
          currentAmount = dataPoint.holdPercentage * 1000; // Mock calculation for demo
        } else {
          // For unsupported pool types (quinella, trifecta, etc.), skip this data point
          continue;
        }
        
        // Calculate incremental amount since previous data point
        const incrementalAmount = currentAmount - previousAmount;
        
        // Use timeToStart as the interval key (rounded to nearest 5-minute interval)
        const interval = Math.round(dataPoint.timeToStart / 5) * 5;
        
        if (!grid[interval]) {
          grid[interval] = {};
        }
        
        grid[interval][entrantId] = {
          incrementalAmount,
          poolType,
          timestamp: dataPoint.pollingTimestamp || dataPoint.eventTimestamp
        };
        
        previousAmount = currentAmount;
      }
    }
    
    return grid;
  }, [timelineData, poolType]);

  // Get formatted data for specific entrant and time interval
  const getEntrantDataForInterval = useCallback((entrantId: string, interval: number, requestedPoolType: 'win' | 'place') => {
    // Round interval to nearest 5 minutes for lookup
    const roundedInterval = Math.round(interval / 5) * 5;
    
    const intervalData = gridData[roundedInterval];
    if (!intervalData || !intervalData[entrantId]) {
      return '—';
    }
    
    const entrantData = intervalData[entrantId];
    if (entrantData.poolType !== requestedPoolType) {
      return '—';
    }
    
    const amount = entrantData.incrementalAmount;
    
    if (amount === 0) {
      return '$0';
    } else if (amount > 0) {
      return `+$${amount.toLocaleString()}`;
    } else {
      return `-$${Math.abs(amount).toLocaleString()}`;
    }
  }, [gridData]);

  // Set up real-time subscription for money flow updates
  useEffect(() => {
    if (!raceId || entrantIds.length === 0) return;

    // Initial fetch
    fetchTimelineData();

    // Set up real-time subscription
    let unsubscribe: (() => void) | null = null;

    try {
      unsubscribe = client.subscribe(
        'databases.raceday-db.collections.money-flow-history.documents',
        (response: any) => {
          // Check if this update is for one of our entrants
          if (response.payload && entrantIds.includes(response.payload.entrant)) {
            console.log('💰 Money flow timeline update received:', response);
            
            // Refetch timeline data to get latest
            fetchTimelineData();
          }
        }
      );

      console.log('✅ Money flow timeline subscription established for race:', raceId);
    } catch (subscriptionError) {
      console.warn('Failed to establish money flow timeline subscription:', subscriptionError);
    }

    return () => {
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (error) {
          console.warn('Error unsubscribing from money flow timeline updates:', error);
        }
      }
    };
  }, [raceId, entrantIds, fetchTimelineData]);

  return {
    timelineData,
    gridData,
    isLoading,
    error,
    lastUpdate,
    refetch: fetchTimelineData,
    getEntrantDataForInterval
  };
}