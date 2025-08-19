/**
 * Proper Appwrite Real-time hook using client.subscribe()
 * 
 * This hook uses Appwrite's native real-time capabilities instead of a custom WebSocket service.
 * Based on Appwrite's official documentation for real-time subscriptions.
 * 
 * Performance targets:
 * - <50ms update latency from database change to UI update
 * - Single WebSocket connection managed by Appwrite SDK
 * - Optimized batching for rapid updates
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { client } from '@/lib/appwrite-client';
import { Race, Entrant } from '@/types/meetings';

interface AppwriteRealtimeMessage {
  events: string[];
  channels: string[];
  timestamp: string;
  payload: any;
}

interface UseAppwriteRealtimeProps {
  raceId: string;
  initialRace?: Race | null;
  initialEntrants?: Entrant[];
}

interface RealtimeState {
  race: Race | null;
  entrants: Entrant[];
  isConnected: boolean;
  connectionAttempts: number;
  lastUpdate: Date | null;
  updateLatency: number;
  totalUpdates: number;
}

interface RealtimeActions {
  reconnect: () => void;
  clearHistory: () => void;
}

export function useAppwriteRealtime({ 
  raceId, 
  initialRace = null, 
  initialEntrants = [] 
}: UseAppwriteRealtimeProps): RealtimeState & RealtimeActions {
  
  const [state, setState] = useState<RealtimeState>({
    race: initialRace,
    entrants: initialEntrants,
    isConnected: false,
    connectionAttempts: 0,
    lastUpdate: null,
    updateLatency: 0,
    totalUpdates: 0
  });

  // Update entrants when initialEntrants changes (e.g., from context updates)
  useEffect(() => {
    if (initialEntrants && initialEntrants.length > 0) {
      setState(prev => ({
        ...prev,
        entrants: initialEntrants
      }));
    }
  }, [initialEntrants]);

  // Track update performance
  const updateStartTime = useRef<number>(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const unsubscribeFunctions = useRef<Array<() => void>>([]);
  
  // Throttling for performance optimization
  const pendingUpdates = useRef<any[]>([]);
  const updateThrottleTimer = useRef<NodeJS.Timeout | null>(null);
  const THROTTLE_DELAY = 250; // 250ms throttle for batching

  // Apply throttled updates to state
  const applyPendingUpdates = useCallback(() => {
    if (pendingUpdates.current.length === 0) return;
    
    const updates = [...pendingUpdates.current];
    pendingUpdates.current = [];
    
    setState(prevState => {
      const newState = { ...prevState };
      
      // Process all pending updates in batch
      for (const message of updates) {
        const { channels, payload } = message;
        const updateType = determineUpdateType(channels);
        
        switch (updateType) {
          case 'race':
            if (payload && payload.$id === raceId) {
              newState.race = payload.race ? { ...newState.race, ...payload } : payload;
            }
            break;
            
          case 'entrant':
            if (payload && payload.race === raceId) {
              newState.entrants = updateEntrantInList(newState.entrants, payload);
            }
            break;
            
          case 'moneyFlow':
            if (payload && payload.entrant) {
              // Only process money flow updates for entrants in this race
              const isRelevantEntrant = newState.entrants.some(e => e.$id === payload.entrant);
              if (isRelevantEntrant) {
                newState.entrants = updateEntrantMoneyFlow(newState.entrants, payload);
              }
            }
            break;
            
          case 'oddsHistory':
            if (payload && payload.entrant) {
              newState.entrants = updateEntrantOddsHistory(newState.entrants, payload);
            }
            break;
        }
      }
      
      // Update connection metrics based on the most recent update
      const latency = performance.now() - updateStartTime.current;
      newState.lastUpdate = new Date();
      newState.updateLatency = latency;
      newState.totalUpdates = prevState.totalUpdates + updates.length;
      
      return newState;
    });
  }, [raceId]);

  // Process incoming Appwrite real-time messages with throttling
  const processRealtimeMessage = useCallback((message: AppwriteRealtimeMessage) => {
    updateStartTime.current = performance.now();
    
    try {
      // Add to pending updates
      pendingUpdates.current.push(message);
      
      // Clear existing timer and set new one for throttling
      if (updateThrottleTimer.current) {
        clearTimeout(updateThrottleTimer.current);
      }
      
      updateThrottleTimer.current = setTimeout(applyPendingUpdates, THROTTLE_DELAY);
      
    } catch (error) {
      console.error('Error processing Appwrite real-time message:', error);
    }
  }, [applyPendingUpdates]);

  // Setup Appwrite real-time subscriptions
  useEffect(() => {
    if (!raceId) return;

    let connectionRetries = 0;
    const maxRetries = 5;

    const setupSubscriptions = () => {
      try {
        // Clear any existing subscriptions
        unsubscribeFunctions.current.forEach(unsub => unsub());
        unsubscribeFunctions.current = [];

        console.log('🔄 Setting up Appwrite real-time subscriptions for race:', raceId);

        // Subscribe to race updates - specific race document
        const raceUnsubscribe = client.subscribe(
          `databases.raceday-db.collections.races.documents.${raceId}`,
          (response: any) => {
            console.log('📡 Race update received:', response);
            processRealtimeMessage({
              ...response,
              channels: [`databases.raceday-db.collections.races.documents.${raceId}`]
            });
          }
        );
        unsubscribeFunctions.current.push(raceUnsubscribe);

        // Subscribe to entrants updates - all entrants (will filter by race)
        const entrantsUnsubscribe = client.subscribe(
          'databases.raceday-db.collections.entrants.documents',
          (response: any) => {
            // Only process if it's for our race
            if (response.payload && response.payload.race === raceId) {
              console.log('📡 Entrant update received:', response);
              processRealtimeMessage({
                ...response,
                channels: ['databases.raceday-db.collections.entrants.documents']
              });
            }
          }
        );
        unsubscribeFunctions.current.push(entrantsUnsubscribe);

        // Subscribe to money flow updates - optimized for high-frequency data
        const moneyFlowUnsubscribe = client.subscribe(
          'databases.raceday-db.collections.money-flow-history.documents',
          (response: any) => {
            // Process all money flow updates - filtering will be done in the update handler
            // This ensures we don't miss updates due to timing issues with entrant loading
            console.log('📡 Money flow update received:', response);
            processRealtimeMessage({
              ...response,
              channels: ['databases.raceday-db.collections.money-flow-history.documents']
            });
          }
        );
        unsubscribeFunctions.current.push(moneyFlowUnsubscribe);

        // Subscribe to odds history updates
        const oddsHistoryUnsubscribe = client.subscribe(
          'databases.raceday-db.collections.odds-history.documents',
          (response: any) => {
            console.log('📡 Odds history update received:', response);
            processRealtimeMessage({
              ...response,
              channels: ['databases.raceday-db.collections.odds-history.documents']
            });
          }
        );
        unsubscribeFunctions.current.push(oddsHistoryUnsubscribe);

        // Update connection state
        setState(prev => ({
          ...prev,
          isConnected: true,
          connectionAttempts: connectionRetries
        }));

        console.log('✅ Appwrite real-time subscriptions established for race:', raceId);

      } catch (error) {
        console.error('❌ Failed to setup Appwrite subscriptions:', error);
        
        setState(prev => ({
          ...prev,
          isConnected: false,
          connectionAttempts: connectionRetries + 1
        }));

        // Retry connection with exponential backoff
        if (connectionRetries < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, connectionRetries), 30000);
          console.log(`🔄 Retrying Appwrite connection in ${delay}ms (attempt ${connectionRetries + 1}/${maxRetries})`);
          
          reconnectTimeout.current = setTimeout(() => {
            connectionRetries++;
            setupSubscriptions();
          }, delay);
        }
      }
    };

    setupSubscriptions();

    // Cleanup function
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      
      if (updateThrottleTimer.current) {
        clearTimeout(updateThrottleTimer.current);
      }
      
      unsubscribeFunctions.current.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn('Error unsubscribing from Appwrite real-time:', error);
        }
      });
      unsubscribeFunctions.current = [];
      
      setState(prev => ({
        ...prev,
        isConnected: false
      }));
    };
  }, [raceId, processRealtimeMessage]);

  // Manual reconnection function
  const reconnect = useCallback(() => {
    console.log('🔄 Manual reconnection triggered');
    setState(prev => ({
      ...prev,
      isConnected: false,
      connectionAttempts: 0
    }));
    
    // Clear existing subscriptions and reconnect
    unsubscribeFunctions.current.forEach(unsub => unsub());
    unsubscribeFunctions.current = [];
  }, []);

  // Clear update history
  const clearHistory = useCallback(() => {
    setState(prev => ({
      ...prev,
      totalUpdates: 0,
      lastUpdate: null
    }));
  }, []);

  return {
    ...state,
    reconnect,
    clearHistory
  };
}

// Helper functions
function determineUpdateType(channels: string[]): 'race' | 'entrant' | 'moneyFlow' | 'oddsHistory' {
  for (const channel of channels) {
    if (channel.includes('collections.races.documents')) return 'race';
    if (channel.includes('collections.entrants.documents')) return 'entrant';
    if (channel.includes('collections.money-flow-history.documents')) return 'moneyFlow';
    if (channel.includes('collections.odds-history.documents')) return 'oddsHistory';
  }
  return 'entrant'; // Default fallback
}

function updateEntrantInList(entrants: Entrant[], updatedEntrant: Partial<Entrant> & { $id: string }): Entrant[] {
  return entrants.map(entrant => {
    if (entrant.$id === updatedEntrant.$id) {
      // Map server field names to client field names for consistency with API
      const mappedEntrant = { ...updatedEntrant };
      
      // Map server odds fields to client fields (prioritize fixed odds over pool odds)
      if ('poolWinOdds' in mappedEntrant || 'fixedWinOdds' in mappedEntrant) {
        mappedEntrant.winOdds = (mappedEntrant as any).fixedWinOdds || (mappedEntrant as any).poolWinOdds;
      }
      if ('poolPlaceOdds' in mappedEntrant || 'fixedPlaceOdds' in mappedEntrant) {
        mappedEntrant.placeOdds = (mappedEntrant as any).fixedPlaceOdds || (mappedEntrant as any).poolPlaceOdds;
      }
      
      return { 
        ...entrant, 
        ...mappedEntrant, 
        $updatedAt: new Date().toISOString() 
      };
    }
    return entrant;
  });
}

function updateEntrantMoneyFlow(entrants: Entrant[], moneyFlowData: any): Entrant[] {
  return entrants.map(entrant => {
    if (entrant.$id === moneyFlowData.entrant) {
      let trend: 'up' | 'down' | 'neutral' = 'neutral';
      
      // Enhanced money flow processing for timeline data
      const updatedEntrant = { ...entrant };
      
      // Update hold percentage and calculate trend
      if (moneyFlowData.holdPercentage !== undefined) {
        if (entrant.holdPercentage !== undefined && moneyFlowData.holdPercentage !== entrant.holdPercentage) {
          trend = moneyFlowData.holdPercentage > entrant.holdPercentage ? 'up' : 'down';
        }
        updatedEntrant.previousHoldPercentage = entrant.holdPercentage;
        updatedEntrant.holdPercentage = moneyFlowData.holdPercentage;
      }
      
      // Update bet percentage if available (add to types later if needed)
      if (moneyFlowData.betPercentage !== undefined) {
        (updatedEntrant as any).betPercentage = moneyFlowData.betPercentage;
      }
      
      // Enhanced timeline data processing for incremental display
      if (moneyFlowData.eventTimestamp) {
        // Initialize timeline if not exists
        if (!updatedEntrant.moneyFlowTimeline) {
          updatedEntrant.moneyFlowTimeline = {
            entrantId: entrant.$id,
            dataPoints: [],
            latestPercentage: moneyFlowData.holdPercentage || entrant.holdPercentage || 0,
            trend,
            significantChange: Math.abs((moneyFlowData.holdPercentage || 0) - (entrant.holdPercentage || 0)) > 2
          };
        }
        
        // Add new data point for timeline display
        const newDataPoint = {
          $id: moneyFlowData.$id || `flow-${Date.now()}`,
          $createdAt: moneyFlowData.eventTimestamp,
          $updatedAt: moneyFlowData.eventTimestamp,
          entrant: entrant.$id,
          pollingTimestamp: moneyFlowData.eventTimestamp,
          timeToStart: calculateTimeToStart(moneyFlowData.eventTimestamp, entrant.race),
          winPoolAmount: estimatePoolAmount(moneyFlowData.holdPercentage || 0, 'win'),
          placePoolAmount: estimatePoolAmount(moneyFlowData.holdPercentage || 0, 'place'),
          totalPoolAmount: estimatePoolAmount(moneyFlowData.holdPercentage || 0, 'total'),
          poolPercentage: moneyFlowData.holdPercentage || entrant.holdPercentage || 0,
          incrementalAmount: calculateIncremental(updatedEntrant.moneyFlowTimeline.dataPoints, moneyFlowData.holdPercentage || 0),
          pollingInterval: 5 // Default polling interval
        };
        
        // Add to timeline and sort by timestamp
        const updatedDataPoints = [...updatedEntrant.moneyFlowTimeline.dataPoints, newDataPoint]
          .sort((a, b) => new Date(a.pollingTimestamp).getTime() - new Date(b.pollingTimestamp).getTime())
          .slice(-50); // Keep last 50 points for performance
        
        updatedEntrant.moneyFlowTimeline = {
          ...updatedEntrant.moneyFlowTimeline,
          dataPoints: updatedDataPoints,
          latestPercentage: moneyFlowData.holdPercentage || entrant.holdPercentage || 0,
          trend,
          significantChange: Math.abs((moneyFlowData.holdPercentage || 0) - (entrant.holdPercentage || 0)) > 2
        };
      }
      
      return {
        ...updatedEntrant,
        moneyFlowTrend: trend,
        $updatedAt: new Date().toISOString()
      };
    }
    return entrant;
  });
}

// Helper function to calculate time to start
function calculateTimeToStart(_timestamp: string, _raceId: string): number {
  // This would ideally get the race start time, for now return a mock value
  // In a real implementation, this would need access to race data
  return 30; // Mock: 30 minutes to start
}

// Helper function to estimate pool amounts based on percentage
function estimatePoolAmount(percentage: number, poolType: 'win' | 'place' | 'total'): number {
  const baseAmounts = {
    win: 50000,   // $50k base win pool
    place: 25000, // $25k base place pool
    total: 75000  // $75k total pool
  };
  
  return Math.round((percentage / 100) * baseAmounts[poolType]);
}

// Helper function to calculate incremental amount
function calculateIncremental(dataPoints: any[], currentPercentage: number): number {
  if (dataPoints.length === 0) return 0;
  
  const lastPoint = dataPoints[dataPoints.length - 1];
  const lastPercentage = lastPoint.poolPercentage || 0;
  const percentageChange = currentPercentage - lastPercentage;
  
  // Estimate incremental money based on percentage change
  return Math.round((percentageChange / 100) * 50000); // Assuming $50k average pool
}

function updateEntrantOddsHistory(entrants: Entrant[], oddsData: any): Entrant[] {
  return entrants.map(entrant => {
    if (entrant.$id === oddsData.entrant) {
      const updatedOddsHistory = [...(entrant.oddsHistory || []), oddsData]
        .sort((a, b) => new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime())
        .slice(-50); // Keep last 50 entries for memory optimization

      // 🔥 FIX: Update current odds based on the latest odds data
      const updatedEntrant = {
        ...entrant,
        oddsHistory: updatedOddsHistory,
        $updatedAt: new Date().toISOString()
      };

      // Update current winOdds and placeOdds based on odds type
      // Prioritize fixed odds over pool odds (to display fixed odds in UI)
      if (oddsData.type === 'fixed_win' && typeof oddsData.odds === 'number') {
        updatedEntrant.winOdds = oddsData.odds;
      } else if (oddsData.type === 'pool_win' && typeof oddsData.odds === 'number' && !updatedEntrant.winOdds) {
        // Only use pool odds if no fixed odds exist
        updatedEntrant.winOdds = oddsData.odds;
      } else if (oddsData.type === 'fixed_place' && typeof oddsData.odds === 'number') {
        updatedEntrant.placeOdds = oddsData.odds;
      } else if (oddsData.type === 'pool_place' && typeof oddsData.odds === 'number' && !updatedEntrant.placeOdds) {
        // Only use pool odds if no fixed odds exist
        updatedEntrant.placeOdds = oddsData.odds;
      }

      return updatedEntrant;
    }
    return entrant;
  });
}