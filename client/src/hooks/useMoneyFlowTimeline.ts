/**
 * Hook for fetching and managing money flow timeline data for Enhanced Race Entrants
 * Story 4.9 implementation - provides real money flow history for timeline grid
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { client } from '@/lib/appwrite-client';
import type { MoneyFlowDataPoint, EntrantMoneyFlowTimeline } from '@/types/moneyFlow';


// Server response interface for raw database data
interface ServerMoneyFlowPoint {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  entrant: string;
  eventTimestamp: string;
  pollingTimestamp?: string;
  timeToStart?: number;
  holdPercentage?: number;
  betPercentage?: number;
  winPoolAmount?: number;
  placePoolAmount?: number;
  type: string;
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
  timelineData: Map<string, EntrantMoneyFlowTimeline>; // entrantId -> timeline data
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
  const [timelineData, setTimelineData] = useState<Map<string, EntrantMoneyFlowTimeline>>(new Map());
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

      // Transform server data points to MoneyFlowDataPoint format
      const transformedPoints: MoneyFlowDataPoint[] = documents.map((doc: ServerMoneyFlowPoint) => {
        const totalPoolAmount = (doc.winPoolAmount || 0) + (doc.placePoolAmount || 0);
        const poolPercentage = doc.holdPercentage || doc.betPercentage || 0;
        
        return {
          $id: doc.$id,
          $createdAt: doc.$createdAt,
          $updatedAt: doc.$updatedAt,
          entrant: doc.entrant,
          pollingTimestamp: doc.pollingTimestamp || doc.eventTimestamp,
          timeToStart: doc.timeToStart || 0,
          winPoolAmount: doc.winPoolAmount || 0,
          placePoolAmount: doc.placePoolAmount || 0,
          totalPoolAmount,
          poolPercentage,
          incrementalAmount: 0, // Will be calculated below
          pollingInterval: 5 // Default polling interval in minutes
        };
      });

      // Group transformed data points by entrant
      const entrantDataMap = new Map<string, EntrantMoneyFlowTimeline>();
      
      for (const entrantId of entrantIds) {
        const entrantPoints = transformedPoints
          .filter(point => point.entrant === entrantId)
          .sort((a, b) => {
            const timeA = new Date(a.pollingTimestamp).getTime();
            const timeB = new Date(b.pollingTimestamp).getTime();
            return timeA - timeB;
          });

        // Calculate incremental amounts
        for (let i = 1; i < entrantPoints.length; i++) {
          const current = entrantPoints[i];
          const previous = entrantPoints[i - 1];
          current.incrementalAmount = current.totalPoolAmount - previous.totalPoolAmount;
        }

        // Calculate trend and other metadata
        const latestPoint = entrantPoints[entrantPoints.length - 1];
        const secondLatestPoint = entrantPoints.length > 1 ? entrantPoints[entrantPoints.length - 2] : null;
        
        let trend: 'up' | 'down' | 'neutral' = 'neutral';
        let significantChange = false;
        
        if (latestPoint && secondLatestPoint) {
          const percentageChange = latestPoint.poolPercentage - secondLatestPoint.poolPercentage;
          trend = percentageChange > 0 ? 'up' : percentageChange < 0 ? 'down' : 'neutral';
          significantChange = Math.abs(percentageChange) >= 5; // 5% or more is significant
        }

        entrantDataMap.set(entrantId, {
          entrantId,
          dataPoints: entrantPoints,
          latestPercentage: latestPoint?.poolPercentage || 0,
          trend,
          significantChange
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