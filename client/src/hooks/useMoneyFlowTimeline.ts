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
  entrant: string | { entrantId: string; name: string; [key: string]: any }; // Can be string or nested object
  eventTimestamp?: string;
  pollingTimestamp?: string;
  timeToStart?: number;
  holdPercentage?: number;
  betPercentage?: number;
  winPoolAmount?: number;
  placePoolAmount?: number;
  type?: string;
  poolType?: string;
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
  const [forceRefresh, setForceRefresh] = useState(0);

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
        
        // Extract entrant ID - server stores as nested object with entrantId field
        const entrantId = typeof doc.entrant === 'string' ? doc.entrant : doc.entrant?.entrantId || 'unknown';
        
        const transformed = {
          $id: doc.$id,
          $createdAt: doc.$createdAt,
          $updatedAt: doc.$updatedAt,
          entrant: entrantId, // Use extracted entrant ID
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
          console.warn(`⚠️ Document missing timeToStart for entrant ${entrantId}`);
        }

        return transformed;
      });

      // Group and consolidate data points by entrant, handling duplicate timeToStart values
      const entrantDataMap = new Map<string, EntrantMoneyFlowTimeline>();
      
      for (const entrantId of entrantIds) {
        const entrantRawPoints = transformedPoints.filter(point => point.entrant === entrantId);
        
        // Group points by timeToStart to handle multiple records (hold_percentage + bet_percentage) at same time
        const timePointMap = new Map<number, MoneyFlowDataPoint[]>();
        
        entrantRawPoints.forEach(point => {
          const timeKey = point.timeToStart ?? -999; // Use -999 for undefined timeToStart
          if (!timePointMap.has(timeKey)) {
            timePointMap.set(timeKey, []);
          }
          timePointMap.get(timeKey)!.push(point);
        });
        
        // Create consolidated timeline points (one per unique timeToStart)
        const consolidatedPoints: MoneyFlowDataPoint[] = [];
        
        for (const [timeToStart, timePoints] of timePointMap) {
          if (timeToStart === -999) continue; // Skip undefined timeToStart values
          
          // Consolidate multiple records at the same timeToStart by summing pool amounts
          let totalWinPoolAmount = 0;
          let totalPlacePoolAmount = 0;
          let consolidatedPercentage = 0;
          let latestTimestamp = '';
          
          timePoints.forEach(point => {
            // Sum pool amounts (they're already individual amounts per record)
            totalWinPoolAmount = Math.max(totalWinPoolAmount, point.winPoolAmount || 0);
            totalPlacePoolAmount = Math.max(totalPlacePoolAmount, point.placePoolAmount || 0);
            consolidatedPercentage = Math.max(consolidatedPercentage, point.poolPercentage);
            if (point.pollingTimestamp > latestTimestamp) {
              latestTimestamp = point.pollingTimestamp;
            }
          });
          
          const consolidatedPoint: MoneyFlowDataPoint = {
            $id: timePoints[0].$id, // Use first point's ID
            $createdAt: timePoints[0].$createdAt,
            $updatedAt: timePoints[0].$updatedAt,
            entrant: entrantId,
            pollingTimestamp: latestTimestamp || timePoints[0].pollingTimestamp,
            timeToStart,
            winPoolAmount: totalWinPoolAmount,
            placePoolAmount: totalPlacePoolAmount,
            totalPoolAmount: totalWinPoolAmount + totalPlacePoolAmount,
            poolPercentage: consolidatedPercentage,
            incrementalAmount: 0, // Will be calculated below
            pollingInterval: 5
          };
          
          consolidatedPoints.push(consolidatedPoint);
        }
        
        // Sort by timeToStart descending (earlier times first: 60m, 55m, 50m, etc.)
        consolidatedPoints.sort((a, b) => {
          return (b.timeToStart || -Infinity) - (a.timeToStart || -Infinity);
        });
        
        // Calculate incremental amounts between unique time points
        for (let i = 0; i < consolidatedPoints.length; i++) {
          const current = consolidatedPoints[i];
          
          const getCurrentPoolAmount = () => {
            switch (poolType) {
              case 'win':
                return current.winPoolAmount;
              case 'place':
                return current.placePoolAmount;
              default:
                return current.totalPoolAmount;
            }
          };
          
          const currentPoolAmount = getCurrentPoolAmount();
          
          if (i === 0) {
            // First chronological point (earliest time) - show absolute amount
            current.incrementalAmount = currentPoolAmount;
          } else {
            // Calculate increment from previous time point
            const previous = consolidatedPoints[i - 1];
            
            const getPreviousPoolAmount = () => {
              switch (poolType) {
                case 'win':
                  return previous.winPoolAmount;
                case 'place':
                  return previous.placePoolAmount;
                default:
                  return previous.totalPoolAmount;
              }
            };
            
            const previousPoolAmount = getPreviousPoolAmount();
            const increment = currentPoolAmount - previousPoolAmount;
            
            // Only show increment if there's actually a change
            // If pool amount is the same as previous, show 0 instead of repeating the increment
            if (increment > 0) {
              current.incrementalAmount = increment;
            } else {
              current.incrementalAmount = 0; // No change = no increment to display
            }
          }
        }
        
        // Calculate trend and other metadata
        const latestPoint = consolidatedPoints[consolidatedPoints.length - 1];
        const secondLatestPoint = consolidatedPoints.length > 1 ? consolidatedPoints[consolidatedPoints.length - 2] : null;
        
        let trend: 'up' | 'down' | 'neutral' = 'neutral';
        let significantChange = false;
        
        if (latestPoint && secondLatestPoint) {
          const percentageChange = latestPoint.poolPercentage - secondLatestPoint.poolPercentage;
          trend = percentageChange > 0 ? 'up' : percentageChange < 0 ? 'down' : 'neutral';
          significantChange = Math.abs(percentageChange) >= 5; // 5% or more is significant
        }

        entrantDataMap.set(entrantId, {
          entrantId,
          dataPoints: consolidatedPoints, // Use consolidated points instead of raw points
          latestPercentage: latestPoint?.poolPercentage || 0,
          trend,
          significantChange
        });
      }

      setTimelineData(entrantDataMap);
      setLastUpdate(new Date());
      
      // Log summary of fetched data for debugging
      const entrantsWithData = Array.from(entrantDataMap.values()).filter(d => d.dataPoints.length > 0).length;
      console.log('📊 Money flow timeline data processed:', {
        raceId,
        totalDocuments: documents.length,
        entrantsRequested: entrantIds.length,
        entrantsWithData,
        sampleDocument: documents[0],
        sampleTransformed: transformedPoints[0]
      });
      
      if (entrantsWithData === 0 && documents.length > 0) {
        console.warn('⚠️ Money flow data fetched but no entrants matched. Check entrant ID format.');
      }

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
        
        // Use exact timeToStart as the interval key (no rounding for high-frequency data)
        // This preserves the granularity when polling frequency increases from 5m to 1m to 30s
        const interval = dataPoint.timeToStart;
        
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
    // Use exact interval for lookup (no rounding for high-frequency data)
    const intervalData = gridData[interval];
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
            // Force immediate recalculation
            setForceRefresh(prev => prev + 1);
            
            // Refetch timeline data to get latest
            fetchTimelineData();
          }
        }
      );

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
  }, [raceId, entrantIds, forceRefresh]);

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