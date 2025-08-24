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

      // Check if server is providing bucketed data (optimized processing)
      if (data.bucketedData) {
        console.log('📊 Processing bucketed money flow data (server pre-processed)');
        const entrantDataMap = processBucketedTimelineData(documents, entrantIds);
        setTimelineData(entrantDataMap);
        setLastUpdate(new Date());
        
        console.log('📊 Bucketed money flow timeline data processed:', {
          raceId,
          totalDocuments: documents.length,
          entrantsRequested: entrantIds.length,
          entrantsWithData: Array.from(entrantDataMap.values()).filter(d => d.dataPoints.length > 0).length,
          optimizations: data.queryOptimizations || []
        });
        
        return;
      }

      // Fallback: Legacy processing for non-bucketed data
      console.log('📊 Processing legacy (non-bucketed) money flow data');
      const transformedPoints: MoneyFlowDataPoint[] = documents.map((doc: ServerMoneyFlowPoint) => {
        const totalPoolAmount = (doc.winPoolAmount || 0) + (doc.placePoolAmount || 0);
        const poolPercentage = doc.holdPercentage || doc.betPercentage || 0;
        
        // Extract entrant ID - server returns complex nested object structure
        let entrantId = 'unknown';
        if (typeof doc.entrant === 'string') {
          entrantId = doc.entrant;
        } else if (doc.entrant && typeof doc.entrant === 'object') {
          // Try multiple possible fields for entrant ID
          entrantId = doc.entrant.entrantId || doc.entrant.$id || doc.entrant.id || 'unknown';
        }
        
        console.log(`🔍 Processing document for entrant: ${entrantId}`, {
          docEntrant: typeof doc.entrant === 'object' ? Object.keys(doc.entrant).slice(0, 5) : doc.entrant,
          timeToStart: doc.timeToStart,
          winPoolAmount: doc.winPoolAmount
        });
        
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
        
        // Process ALL records for now to see what data we have
        const allRecords = entrantRawPoints;
        
        // Group records by timeToStart
        const timePointMap = new Map<number, MoneyFlowDataPoint[]>();
        
        allRecords.forEach(point => {
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
            // CORRECT: Sum pool amounts (multiple bet transactions should be summed)
            totalWinPoolAmount += (point.winPoolAmount || 0);
            totalPlacePoolAmount += (point.placePoolAmount || 0);
            consolidatedPercentage += (point.poolPercentage || 0);
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
        
        // Sort by timeToStart descending for proper chronological order (earlier times first)
        // CORRECTED: timeToStart format: 60, 50, 40... 2, 1, 0, -1, -2, -4... (positive=before, negative=after)
        // Higher positive = earlier in time, lower negative = later after start
        consolidatedPoints.sort((a, b) => {
          return (b.timeToStart || -Infinity) - (a.timeToStart || -Infinity);
        });
        
        // Calculate incremental amounts between chronological time points
        // CORRECTED: Iterate from latest to earliest, calculating increments properly
        for (let i = consolidatedPoints.length - 1; i >= 0; i--) {
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
          
          if (i === consolidatedPoints.length - 1) {
            // Latest chronological point (closest to race start) - show absolute amount as baseline
            current.incrementalAmount = currentPoolAmount;
          } else {
            // Calculate increment from next chronological time point (which is later in time)
            // Next point in array is later in time due to our sort order
            const nextInTime = consolidatedPoints[i + 1];
            
            const getNextPoolAmount = () => {
              switch (poolType) {
                case 'win':
                  return nextInTime.winPoolAmount;
                case 'place':
                  return nextInTime.placePoolAmount;
                default:
                  return nextInTime.totalPoolAmount;
              }
            };
            
            const nextPoolAmount = getNextPoolAmount();
            // Current amount minus next amount = increment that happened FROM this time TO next time
            // This gives us the change that occurred in this time interval
            const increment = nextPoolAmount - currentPoolAmount;
            
            // Store the actual increment (can be positive, negative, or zero)
            current.incrementalAmount = increment;
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
  }, [raceId, entrantIds.join(','), poolType]);

  // Generate timeline grid data optimized for component display
  const gridData = useMemo(() => {
    const grid: TimelineGridData = {};
    
    console.log('🔍 Grid generation - starting with:', {
      timelineDataSize: timelineData.size,
      poolType,
      sampleEntrantData: Array.from(timelineData.values())[0]
    });
    
    for (const [entrantId, entrantData] of timelineData) {
      // Skip if no data points
      if (entrantData.dataPoints.length === 0) {
        console.log(`⚠️ No data points for entrant ${entrantId}`);
        continue;
      }
      
      console.log(`📊 Processing entrant ${entrantId}: ${entrantData.dataPoints.length} data points`);
      
      // Use the already calculated incremental amounts from dataPoints
      // The data points are already sorted chronologically and have incremental amounts calculated
      for (let i = 0; i < entrantData.dataPoints.length; i++) {
        const dataPoint = entrantData.dataPoints[i];
        
        // Skip if no timeToStart data
        if (typeof dataPoint.timeToStart !== 'number') {
          console.log(`⚠️ Skipping data point - no timeToStart:`, dataPoint);
          continue;
        }
        
        // Use the incremental amount that was already calculated in the first processing loop
        // This ensures we maintain the correct chronological incremental calculations
        const incrementalAmount = dataPoint.incrementalAmount || 0;
        
        // Skip if this pool type doesn't match what we're displaying
        const hasValidPoolData = (poolType === 'win' && typeof dataPoint.winPoolAmount === 'number') ||
                                 (poolType === 'place' && typeof dataPoint.placePoolAmount === 'number');
        
        if (!hasValidPoolData && !dataPoint.poolPercentage) {
          console.log(`⚠️ Skipping data point - no valid pool data for ${poolType}:`, {
            winPoolAmount: dataPoint.winPoolAmount,
            placePoolAmount: dataPoint.placePoolAmount,
            poolPercentage: dataPoint.poolPercentage
          });
          continue;
        }
        
        // Use exact timeToStart as the interval key (no rounding for high-frequency data)
        // This preserves the granularity when polling frequency increases from 5m to 1m to 30s
        const interval = dataPoint.timeToStart;
        
        console.log(`✅ Adding grid data: entrant ${entrantId}, interval ${interval}, amount ${incrementalAmount}`);
        
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
    
    console.log('🔍 Grid generation complete:', {
      totalIntervals: Object.keys(grid).length,
      intervals: Object.keys(grid).sort((a, b) => Number(b) - Number(a)).slice(0, 5),
      sampleGridEntry: Object.values(grid)[0]
    });
    
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
    
    // Convert cents to dollars for display (NZ TAB stores amounts in cents)
    const amountInDollars = Math.round(amount / 100);
    
    if (Math.abs(amountInDollars) < 1) {
      return '$0';
    } else if (amountInDollars > 0) {
      return `+$${amountInDollars.toLocaleString()}`;
    } else {
      return `-$${Math.abs(amountInDollars).toLocaleString()}`;
    }
  }, [gridData]);

  // Set up real-time subscription for money flow updates
  useEffect(() => {
    if (!raceId || entrantIds.length === 0) return;

    // Initial fetch
    fetchTimelineData();

    // Set up real-time subscription with proper channel format
    let unsubscribe: (() => void) | null = null;

    try {
      // Subscribe to the money-flow-history collection with proper channel format
      const channels = [`databases.raceday-db.collections.money-flow-history.documents`];
      
      unsubscribe = client.subscribe(channels, (response: any) => {
        console.log('💰 Money flow real-time update received:', response);
        
        // Check if this update affects our entrants
        const updatedEntrant = response.payload?.entrant;
        const isRelevantUpdate = updatedEntrant && (
          typeof updatedEntrant === 'string' ? 
            entrantIds.includes(updatedEntrant) : 
            entrantIds.includes(updatedEntrant?.entrantId)
        );
        
        if (isRelevantUpdate) {
          console.log('📊 Relevant money flow update for entrant:', updatedEntrant);
          
          // Debounce rapid updates with a small delay
          setTimeout(() => {
            fetchTimelineData();
          }, 500);
        }
      });

      console.log('🔔 Money flow timeline subscription established for channels:', channels);

    } catch (subscriptionError) {
      console.error('❌ Failed to establish money flow timeline subscription:', subscriptionError);
      // Continue without real-time updates if subscription fails
    }

    return () => {
      if (unsubscribe) {
        try {
          unsubscribe();
          console.log('🔕 Money flow timeline subscription closed');
        } catch (error) {
          console.warn('Error unsubscribing from money flow timeline updates:', error);
        }
      }
    };
  }, [raceId, entrantIds.join(','), fetchTimelineData]); // Use entrantIds.join(',') to avoid array reference issues

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

/**
 * Process bucketed timeline data (much simpler since server does the heavy lifting)
 */
function processBucketedTimelineData(documents: ServerMoneyFlowPoint[], entrantIds: string[]): Map<string, EntrantMoneyFlowTimeline> {
  const entrantDataMap = new Map<string, EntrantMoneyFlowTimeline>();
  
  for (const entrantId of entrantIds) {
    // Filter documents for this entrant
    const entrantDocs = documents.filter(doc => {
      let docEntrantId = 'unknown';
      if (typeof doc.entrant === 'string') {
        docEntrantId = doc.entrant;
      } else if (doc.entrant && typeof doc.entrant === 'object') {
        docEntrantId = doc.entrant.entrantId || doc.entrant.$id || doc.entrant.id || 'unknown';
      }
      return docEntrantId === entrantId;
    });
    
    // Sort by time interval (server should handle this but ensure correct order)
    const sortedDocs = entrantDocs.sort((a, b) => ((b as any).timeInterval || 0) - ((a as any).timeInterval || 0));
    
    // Transform to timeline data points (server has pre-calculated incrementals)
    const dataPoints: MoneyFlowDataPoint[] = sortedDocs.map(doc => ({
      $id: doc.$id,
      $createdAt: doc.$createdAt,
      $updatedAt: doc.$updatedAt,
      entrant: entrantId,
      pollingTimestamp: doc.pollingTimestamp || doc.$createdAt,
      timeToStart: doc.timeToStart || 0,
      timeInterval: (doc as any).timeInterval || 0,
      intervalType: (doc as any).intervalType || '5m',
      winPoolAmount: doc.winPoolAmount || 0,
      placePoolAmount: doc.placePoolAmount || 0,
      totalPoolAmount: (doc.winPoolAmount || 0) + (doc.placePoolAmount || 0),
      poolPercentage: doc.holdPercentage || 0,
      incrementalAmount: (doc as any).incrementalAmount || 0, // Pre-calculated by server
      incrementalWinAmount: (doc as any).incrementalWinAmount || 0,
      incrementalPlaceAmount: (doc as any).incrementalPlaceAmount || 0,
      pollingInterval: (doc as any).intervalType === '30s' ? 0.5 : (doc as any).intervalType === '1m' ? 1 : 5
    }));
    
    // Calculate trend and metadata
    const latestPoint = dataPoints[dataPoints.length - 1];
    const secondLatestPoint = dataPoints.length > 1 ? dataPoints[dataPoints.length - 2] : null;
    
    let trend: 'up' | 'down' | 'neutral' = 'neutral';
    let significantChange = false;
    
    if (latestPoint && secondLatestPoint) {
      const percentageChange = latestPoint.poolPercentage - secondLatestPoint.poolPercentage;
      trend = percentageChange > 0.5 ? 'up' : percentageChange < -0.5 ? 'down' : 'neutral';
      significantChange = Math.abs(percentageChange) >= 5;
    }

    entrantDataMap.set(entrantId, {
      entrantId,
      dataPoints,
      latestPercentage: latestPoint?.poolPercentage || 0,
      trend,
      significantChange
    });
  }
  
  return entrantDataMap;
}