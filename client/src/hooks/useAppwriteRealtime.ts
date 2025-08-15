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

  // Track update performance
  const updateStartTime = useRef<number>(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const unsubscribeFunctions = useRef<Array<() => void>>([]);

  // Process incoming Appwrite real-time messages
  const processRealtimeMessage = useCallback((message: AppwriteRealtimeMessage) => {
    updateStartTime.current = performance.now();
    
    try {
      const { events, channels, payload } = message;
      
      // Determine what type of update this is based on channels
      const updateType = determineUpdateType(channels);
      
      setState(prevState => {
        let newState = { ...prevState };
        
        switch (updateType) {
          case 'race':
            if (payload && payload.$id === raceId) {
              newState.race = payload.race ? { ...prevState.race, ...payload } : payload;
            }
            break;
            
          case 'entrant':
            if (payload && payload.race === raceId) {
              newState.entrants = updateEntrantInList(prevState.entrants, payload);
            }
            break;
            
          case 'moneyFlow':
            if (payload && payload.entrant) {
              newState.entrants = updateEntrantMoneyFlow(prevState.entrants, payload);
            }
            break;
            
          case 'oddsHistory':
            if (payload && payload.entrant) {
              newState.entrants = updateEntrantOddsHistory(prevState.entrants, payload);
            }
            break;
        }
        
        // Update connection metrics
        const latency = performance.now() - updateStartTime.current;
        newState.lastUpdate = new Date();
        newState.updateLatency = latency;
        newState.totalUpdates = prevState.totalUpdates + 1;
        
        return newState;
      });
      
    } catch (error) {
      console.error('Error processing Appwrite real-time message:', error);
    }
  }, [raceId]);

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

        // Subscribe to money flow updates
        const moneyFlowUnsubscribe = client.subscribe(
          'databases.raceday-db.collections.money-flow-history.documents',
          (response: any) => {
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
  return entrants.map(entrant =>
    entrant.$id === updatedEntrant.$id
      ? { ...entrant, ...updatedEntrant, $updatedAt: new Date().toISOString() }
      : entrant
  );
}

function updateEntrantMoneyFlow(entrants: Entrant[], moneyFlowData: any): Entrant[] {
  return entrants.map(entrant => {
    if (entrant.$id === moneyFlowData.entrant) {
      let trend: 'up' | 'down' | 'neutral' = 'neutral';
      if (entrant.holdPercentage !== undefined && moneyFlowData.holdPercentage !== entrant.holdPercentage) {
        trend = moneyFlowData.holdPercentage > entrant.holdPercentage ? 'up' : 'down';
      }

      return {
        ...entrant,
        previousHoldPercentage: entrant.holdPercentage,
        holdPercentage: moneyFlowData.holdPercentage,
        moneyFlowTrend: trend,
        $updatedAt: new Date().toISOString()
      };
    }
    return entrant;
  });
}

function updateEntrantOddsHistory(entrants: Entrant[], oddsData: any): Entrant[] {
  return entrants.map(entrant => {
    if (entrant.$id === oddsData.entrant) {
      const updatedOddsHistory = [...(entrant.oddsHistory || []), oddsData]
        .sort((a, b) => new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime())
        .slice(-50); // Keep last 50 entries for memory optimization

      return {
        ...entrant,
        oddsHistory: updatedOddsHistory,
        $updatedAt: new Date().toISOString()
      };
    }
    return entrant;
  });
}