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
  entrant: {
    entrantId: string;
    name: string;
    [key: string]: any; // Allow other entrant properties
  };
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
        
        const transformed = {
          $id: doc.$id,
          $createdAt: doc.$createdAt,
          $updatedAt: doc.$updatedAt,
          entrant: doc.entrant.entrantId, // Extract entrantId from entrant object
          pollingTimestamp: doc.pollingTimestamp || doc.$createdAt,
          timeToStart: doc.timeToStart || 0,
          winPoolAmount: doc.winPoolAmount || 0,
          placePoolAmount: doc.placePoolAmount || 0,
          totalPoolAmount,
          poolPercentage,
          incrementalAmount: 0, // Will be calculated below
          pollingInterval: 5 // Default polling interval in minutes
        };

        // Skip documents without timeToStart for timeline processing
        if (doc.timeToStart === undefined) {
          console.log(`⚠️ Skipping document without timeToStart for ${doc.entrant.name}`);
        }

        return transformed;
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

        // Calculate incremental amounts based on chronological order by timeToStart
        // Sort points by timeToStart descending (further from race start = earlier chronologically)
        const chronologicalPoints = [...entrantPoints].sort((a, b) => {
          const timeA = a.timeToStart !== undefined ? a.timeToStart : Infinity;
          const timeB = b.timeToStart !== undefined ? b.timeToStart : Infinity;
          return timeB - timeA; // Descending order
        });
        
        // Calculate incremental amounts chronologically
        for (let i = 1; i < chronologicalPoints.length; i++) {
          const current = chronologicalPoints[i];
          const previous = chronologicalPoints[i - 1]; // Previous in chronological order
          
          // Incremental amount is the increase from previous time point to current
          current.incrementalAmount = current.totalPoolAmount - previous.totalPoolAmount;
        }
        
        // Set first chronological point to have the total as incremental (initial amount)
        if (chronologicalPoints.length > 0) {
          chronologicalPoints[0].incrementalAmount = chronologicalPoints[0].totalPoolAmount;
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
        entrantsWithData: Array.from(entrantDataMap.values()).filter(d => d.dataPoints.length > 0).length,
        sampleDocument: documents[0] || null,
        sampleEntrantData: Array.from(entrantDataMap.values())[0] || null
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
      if (entrantData.dataPoints.length === 0) {
        continue;
      }
      
      // Use the already calculated incremental amounts from dataPoints
      // The data points are already sorted chronologically and have incremental amounts calculated
      for (let i = 0; i < entrantData.dataPoints.length; i++) {
        const dataPoint = entrantData.dataPoints[i];
        
        // Skip if no timeToStart data
        if (typeof dataPoint.timeToStart !== 'number') {
          continue;
        }
        
        // Use the incremental amount that was already calculated in the first processing loop
        // This ensures we maintain the correct chronological incremental calculations
        const incrementalAmount = dataPoint.incrementalAmount || 0;
        
        // Skip if this pool type doesn't match what we're displaying
        const hasValidPoolData = (poolType === 'win' && typeof dataPoint.winPoolAmount === 'number') ||
                                 (poolType === 'place' && typeof dataPoint.placePoolAmount === 'number');
        
        if (!hasValidPoolData && !dataPoint.poolPercentage) {
          continue;
        }
        
        // Use timeToStart as the interval key (rounded to nearest 5-minute interval)
        const interval = Math.round(dataPoint.timeToStart / 5) * 5;
        
        // Add grid data for this interval
        
        if (!grid[interval]) {
          grid[interval] = {};
        }
        
        grid[interval][entrantId] = {
          incrementalAmount,
          poolType,
          timestamp: dataPoint.pollingTimestamp
        };
      }
    }
    
    // Timeline grid generation complete
    
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