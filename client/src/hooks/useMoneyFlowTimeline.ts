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
  poolType: 'win' | 'place' | 'quinella' | 'trifecta' | 'exacta' | 'first4' = 'win',
  raceStatus?: string // Add race status to control post-race behavior
): UseMoneyFlowTimelineResult {
  const [timelineData, setTimelineData] = useState<Map<string, EntrantMoneyFlowTimeline>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [forceRefresh, setForceRefresh] = useState(0);

  // Fetch money flow timeline data for all entrants
  const fetchTimelineData = useCallback(async () => {
    if (!raceId || entrantIds.length === 0) return;

    // Check race status to avoid unnecessary polling for completed races
    const isRaceComplete = raceStatus && ['Final', 'Finalized', 'Abandoned', 'Cancelled'].includes(raceStatus);
    
    if (isRaceComplete && timelineData.size > 0) {
      console.log(`🏁 Race ${raceId} is complete (status: ${raceStatus}), skipping timeline data fetch to preserve final state`);
      return;
    }

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
      
      // Log interval coverage analysis if available
      if (data.intervalCoverage) {
        console.log('📊 Timeline interval coverage:', data.intervalCoverage);
        if (data.intervalCoverage.criticalPeriodGaps.length > 0) {
          console.warn('⚠️ Gaps detected in critical 5m-0s period:', data.intervalCoverage.criticalPeriodGaps);
        }
      }

      // Log the API response for debugging
      if (data.message) {
        console.log('📊 API Message:', data.message);
      }

      // Handle empty data gracefully
      if (documents.length === 0) {
        console.log('📊 No timeline data available - displaying empty state');
        setTimelineData(new Map());
        setLastUpdate(new Date());
        return;
      }

      // Use unified processing for both bucketed and legacy data
      console.log('📊 Processing money flow data with unified algorithm');
      const entrantDataMap = processTimelineData(documents, entrantIds, poolType, data.bucketedData);
      setTimelineData(entrantDataMap);
      setLastUpdate(new Date());
      
      console.log('📊 Money flow timeline data processed:', {
        raceId,
        totalDocuments: documents.length,
        entrantsRequested: entrantIds.length,
        entrantsWithData: Array.from(entrantDataMap.values()).filter(d => d.dataPoints.length > 0).length,
        dataType: data.bucketedData ? 'bucketed' : 'legacy',
        optimizations: data.queryOptimizations || []
      });
      
      return;
      // This code path should no longer be reached due to unified processing above
      console.warn('⚠️ Fallback legacy processing path reached - this should not happen');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch timeline data');
      console.error('Error fetching money flow timeline:', err);
    } finally {
      setIsLoading(false);
    }
  }, [raceId, entrantIds.join(','), poolType, raceStatus, timelineData.size]);

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
        
        // Use timeInterval if available (bucketed data), otherwise timeToStart (legacy)
        // This ensures compatibility with both data structures
        const interval = (dataPoint as any).timeInterval ?? dataPoint.timeToStart;
        
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
    // Handle empty timeline data gracefully
    if (!timelineData || timelineData.size === 0) {
      return '—';
    }
    
    // Get entrant's timeline data directly
    const entrantTimeline = timelineData.get(entrantId);
    if (!entrantTimeline || entrantTimeline.dataPoints.length === 0) {
      return '—';
    }
    
    // Find data point for this specific interval
    const dataPoint = entrantTimeline.dataPoints.find(point => {
      const pointInterval = (point.timeInterval ?? point.timeToStart ?? -999);
      return pointInterval === interval;
    });
    
    if (!dataPoint) {
      return '—';
    }
    
    // SIMPLIFIED: Server pre-calculated everything in incrementalWinAmount/incrementalPlaceAmount
    // For 60m: server stored absolute total in incrementalWinAmount
    // For others: server stored true increment in incrementalWinAmount
    const displayAmount = requestedPoolType === 'win' ? 
      (dataPoint.incrementalWinAmount || dataPoint.incrementalAmount || 0) : 
      (dataPoint.incrementalPlaceAmount || dataPoint.incrementalAmount || 0);
    
    // Convert cents to dollars for display
    const amountInDollars = Math.round(displayAmount / 100);
    
    // Debug logging to verify server calculations
    console.log(`💰 SIMPLIFIED display for entrant ${entrantId}, interval ${interval}:`, {
      displayAmount,
      amountInDollars,
      incrementalWinAmount: dataPoint.incrementalWinAmount,
      incrementalPlaceAmount: dataPoint.incrementalPlaceAmount,
      requestedPoolType,
      timeInterval: dataPoint.timeInterval
    });
    
    // Format for display: 60m shows baseline ($2,341), others show increment (+$344)
    if (amountInDollars <= 0) {
      return '—'; // No data or zero amount
    }
    
    if (interval === 60) {
      // 60m column: baseline amount (server stored absolute total)
      return `$${amountInDollars.toLocaleString()}`;
    } else {
      // All other columns: incremental change (server calculated increment)
      return `+$${amountInDollars.toLocaleString()}`;
    }
  }, [timelineData]);

  // Set up real-time subscription for money flow updates
  useEffect(() => {
    if (!raceId || entrantIds.length === 0) return;

    // Initial fetch
    fetchTimelineData();

    // Skip real-time subscriptions for completed races to preserve final state
    const isRaceComplete = raceStatus && ['Final', 'Finalized', 'Abandoned', 'Cancelled'].includes(raceStatus);
    if (isRaceComplete) {
      console.log(`🏁 Race ${raceId} is complete (status: ${raceStatus}), skipping real-time subscription`);
      return;
    }

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
  }, [raceId, entrantIds.join(','), raceStatus, fetchTimelineData]); // Use entrantIds.join(',') to avoid array reference issues

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
 * Unified processing function for all timeline data (bucketed or legacy)
 * Standardizes incremental calculation logic to eliminate inconsistencies
 */
function processTimelineData(documents: ServerMoneyFlowPoint[], entrantIds: string[], poolType: string, isBucketed: boolean = false): Map<string, EntrantMoneyFlowTimeline> {
  console.log('📊 Processing timeline data (unified approach):', {
    documentsCount: documents.length,
    entrantIds: entrantIds.length,
    poolType,
    isBucketed,
    sampleDoc: documents[0] ? {
      entrant: documents[0].entrant,
      timeInterval: (documents[0] as any).timeInterval,
      timeToStart: documents[0].timeToStart,
      winPoolAmount: documents[0].winPoolAmount,
      incrementalWinAmount: (documents[0] as any).incrementalWinAmount
    } : null
  });
  
  // Enhanced debugging: analyze document distribution by time interval
  if (documents.length > 0) {
    const intervalDistribution = documents.reduce((acc, doc) => {
      const interval = (doc as any).timeInterval ?? doc.timeToStart ?? 'unknown';
      acc[interval] = (acc[interval] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('📊 Document distribution by interval:', intervalDistribution);
    
    // Identify critical period coverage
    const criticalIntervals = [5, 4, 3, 2, 1, 0];
    const criticalCoverage = criticalIntervals.filter(interval => intervalDistribution[interval]);
    const missingCritical = criticalIntervals.filter(interval => !intervalDistribution[interval]);
    
    if (missingCritical.length > 0) {
      console.warn('⚠️ Missing critical intervals (5m-0s period):', missingCritical);
    }
    
    console.log('🎯 Critical period (5m-0s) coverage:', {
      covered: criticalCoverage,
      missing: missingCritical,
      coveragePercent: Math.round((criticalCoverage.length / criticalIntervals.length) * 100)
    });
  }
  
  const entrantDataMap = new Map<string, EntrantMoneyFlowTimeline>();
  
  for (const entrantId of entrantIds) {
    // Extract entrant ID consistently across all data formats
    const entrantDocs = documents.filter(doc => {
      const docEntrantId = extractEntrantId(doc.entrant);
      return docEntrantId === entrantId;
    });
    
    if (entrantDocs.length === 0) {
      console.log(`⚠️ No documents found for entrant ${entrantId}`);
      // Create empty entry to maintain consistency
      entrantDataMap.set(entrantId, {
        entrantId,
        dataPoints: [],
        latestPercentage: 0,
        trend: 'neutral',
        significantChange: false
      });
      continue;
    }
    
    console.log(`📊 Processing entrant ${entrantId}: ${entrantDocs.length} documents`);
    
    // Group documents by time interval to handle duplicates
    const intervalMap = new Map<number, ServerMoneyFlowPoint[]>();
    
    entrantDocs.forEach(doc => {
      // Use timeInterval if available (bucketed), otherwise timeToStart (legacy)
      const interval = (doc as any).timeInterval ?? doc.timeToStart ?? -999;
      if (interval === -999) {
        console.warn(`⚠️ Document missing time information for entrant ${entrantId}`);
        return;
      }
      
      if (!intervalMap.has(interval)) {
        intervalMap.set(interval, []);
      }
      intervalMap.get(interval)!.push(doc);
    });
    
    // Use server pre-calculated timeline points directly (no client consolidation)
    // Per Implementation Guide: Server provides clean bucket data with pre-calculated increments
    const timelinePoints: MoneyFlowDataPoint[] = [];
    
    for (const [interval, intervalDocs] of intervalMap) {
      // Use the latest document for this interval (server should provide one clean bucket per interval)
      const doc = intervalDocs[intervalDocs.length - 1]; // Get most recent if multiple
      
      // Trust server pre-calculated data - no client processing needed
      const timelinePoint: MoneyFlowDataPoint = {
        $id: doc.$id,
        $createdAt: doc.$createdAt,
        $updatedAt: doc.$updatedAt,
        entrant: entrantId,
        pollingTimestamp: doc.pollingTimestamp || doc.$createdAt,
        timeToStart: doc.timeToStart || 0,
        timeInterval: (doc as any).timeInterval || interval,
        intervalType: (doc as any).intervalType || '5m',
        winPoolAmount: doc.winPoolAmount || 0,
        placePoolAmount: doc.placePoolAmount || 0,
        totalPoolAmount: (doc.winPoolAmount || 0) + (doc.placePoolAmount || 0),
        poolPercentage: doc.holdPercentage || doc.betPercentage || 0,
        // Use server pre-calculated incremental amounts directly
        incrementalAmount: (doc as any).incrementalWinAmount || (doc as any).incrementalAmount || 0,
        incrementalWinAmount: (doc as any).incrementalWinAmount || 0,
        incrementalPlaceAmount: (doc as any).incrementalPlaceAmount || 0,
        pollingInterval: getPollingIntervalFromType((doc as any).intervalType)
      };
      
      timelinePoints.push(timelinePoint);
    }
    
    // Sort by time interval descending (60, 55, 50... 0, -0.5, -1)
    timelinePoints.sort((a, b) => {
      const aInterval = (a.timeInterval ?? a.timeToStart ?? -Infinity);
      const bInterval = (b.timeInterval ?? b.timeToStart ?? -Infinity);
      return bInterval - aInterval;
    });
    
    // Server pre-calculated incremental amounts - no client calculation needed
    // Per Implementation Guide: "Server pre-calculated everything in incrementalWinAmount/incrementalPlaceAmount"
    
    // Calculate trend and metadata
    const latestPoint = timelinePoints[timelinePoints.length - 1];
    const secondLatestPoint = timelinePoints.length > 1 ? timelinePoints[timelinePoints.length - 2] : null;
    
    let trend: 'up' | 'down' | 'neutral' = 'neutral';
    let significantChange = false;
    
    if (latestPoint && secondLatestPoint) {
      const percentageChange = latestPoint.poolPercentage - secondLatestPoint.poolPercentage;
      trend = percentageChange > 0.5 ? 'up' : percentageChange < -0.5 ? 'down' : 'neutral';
      significantChange = Math.abs(percentageChange) >= 1.0; // Reduced threshold for more sensitivity
    }

    entrantDataMap.set(entrantId, {
      entrantId,
      dataPoints: timelinePoints,
      latestPercentage: latestPoint?.poolPercentage || 0,
      trend,
      significantChange
    });
    
    console.log(`✅ Processed entrant ${entrantId}: ${timelinePoints.length} timeline points using server pre-calculated data`);
  }
  
  console.log('📊 Timeline processing complete:', {
    entrantsProcessed: entrantDataMap.size,
    totalDataPoints: Array.from(entrantDataMap.values()).reduce((sum, data) => sum + data.dataPoints.length, 0)
  });
  
  return entrantDataMap;
}

/**
 * Extract entrant ID consistently from various data formats
 */
function extractEntrantId(entrant: any): string {
  if (typeof entrant === 'string') {
    return entrant;
  }
  if (entrant && typeof entrant === 'object') {
    return entrant.entrantId || entrant.$id || entrant.id || 'unknown';
  }
  return 'unknown';
}

/**
 * Get polling interval from interval type string
 */
function getPollingIntervalFromType(intervalType?: string): number {
  switch (intervalType) {
    case '30s': return 0.5;
    case '1m': return 1;
    case '5m': return 5;
    default: return 5;
  }
}

