'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { client } from '@/lib/appwrite-client';
import { Entrant, Race, EntrantSubscriptionResponse, MoneyFlowSubscriptionResponse, OddsHistorySubscriptionResponse, OddsHistoryData } from '@/types/meetings';

interface RealtimeConnectionState {
  isConnected: boolean;
  connectionAttempts: number;
  lastConnected: Date | null;
  subscriptionCount: number;
  averageLatency: number;
}

interface RealtimeUpdate {
  type: 'entrant' | 'race' | 'moneyFlow' | 'oddsHistory';
  entrantId?: string;
  timestamp: Date;
  data: Record<string, unknown>;
  acknowledged: boolean;
}

export interface UseComprehensiveRealtimeProps {
  initialEntrants: Entrant[];
  initialRace?: Race;
  raceId: string;
  dataFreshness?: {
    lastUpdated: string;
    entrantsDataAge: number;
    oddsHistoryCount: number;
    moneyFlowHistoryCount: number;
  };
}

export interface ComprehensiveRealtimeResult {
  entrants: Entrant[];
  race?: Race;
  connectionState: RealtimeConnectionState;
  recentUpdates: RealtimeUpdate[];
  updateCounts: {
    entrants: number;
    race: number;
    moneyFlow: number;
    oddsHistory: number;
  };
  performance: {
    averageUpdateLatency: number;
    updatesPerMinute: number;
    batchEfficiency: number;
    memoryUsage: number;
  };
  triggerReconnect: () => void;
  acknowledgUpdate: (updateId: string) => void;
  clearUpdateHistory: () => void;
}

export function useComprehensiveRealtime({
  initialEntrants,
  initialRace,
  raceId
}: UseComprehensiveRealtimeProps): ComprehensiveRealtimeResult {
  
  // Core data state
  const [entrants, setEntrants] = useState<Entrant[]>(initialEntrants);
  const [race] = useState<Race | undefined>(initialRace);
  
  // Connection management state
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>({
    isConnected: false,
    connectionAttempts: 0,
    lastConnected: null,
    subscriptionCount: 0,
    averageLatency: 0
  });
  
  // Updates tracking state
  const [recentUpdates, setRecentUpdates] = useState<RealtimeUpdate[]>([]);
  const [updateCounts, setUpdateCounts] = useState({
    entrants: 0,
    race: 0,
    moneyFlow: 0,
    oddsHistory: 0
  });
  
  // Performance tracking
  const [performance, setPerformance] = useState({
    averageUpdateLatency: 0,
    updatesPerMinute: 0,
    batchEfficiency: 0,
    memoryUsage: 0
  });
  
  // Refs for subscriptions
  const subscriptionsRef = useRef<{
    entrants?: () => void;
    race?: () => void;
    moneyFlow?: () => void;
    oddsHistory?: () => void;
  }>({});
  
  // Memoize entrants for performance
  const memoizedEntrants = useMemo(() => entrants, [entrants]);
  
  // Setup subscriptions
  const setupSubscriptions = useCallback(async () => {
    try {
      const channels = {
        entrants: `databases.raceday-db.collections.entrants.documents`,
        races: `databases.raceday-db.collections.races.documents`,
        moneyFlow: `databases.raceday-db.collections.money-flow-history.documents`,
        oddsHistory: `databases.raceday-db.collections.odds-history.documents`
      };
      
      let subscriptionCount = 0;
      
      // Entrants subscription
      subscriptionsRef.current.entrants = client.subscribe(channels.entrants, (response: EntrantSubscriptionResponse) => {
        if (!response.payload || response.payload.race !== raceId) return;
        
        const eventType = response.events?.[0] || '';
        
        if (eventType.includes('update') && response.payload) {
          setEntrants(current => current.map(entrant => 
            entrant.$id === response.payload!.$id 
              ? { ...entrant, ...response.payload! }
              : entrant
          ));
        }
        
        setRecentUpdates(prev => [...prev.slice(-50), {
          type: 'entrant' as const,
          entrantId: response.payload!.$id,
          data: response.payload! as Record<string, unknown>,
          timestamp: new Date(),
          acknowledged: false
        }].slice(-100));
        
        setUpdateCounts(prev => ({ ...prev, entrants: prev.entrants + 1 }));
      });
      subscriptionCount++;
      
      // Money flow subscription
      subscriptionsRef.current.moneyFlow = client.subscribe(channels.moneyFlow, (response: MoneyFlowSubscriptionResponse) => {
        if (!response.payload || !response.payload.entrant) return;
        
        const entrantRef = response.payload.entrant;
        // Handle both string IDs and document references
        const entrantId = typeof entrantRef === 'string' ? entrantRef : (entrantRef as any)?.$id || String(entrantRef);
        const holdPercentage = response.payload.holdPercentage;
        
        console.log('[DEBUG] Money flow update received:', {
          entrantRef,
          entrantId,
          holdPercentage,
          payload: response.payload
        });
        
        setEntrants(current => {
          console.log('[DEBUG] Current entrants:', current.map(e => ({ id: e.$id, name: e.name })));
          
          const updated = current.map(entrant => {
            if (entrant.$id === entrantId && holdPercentage !== undefined) {
              let trend: 'up' | 'down' | 'neutral' = 'neutral';
              if (entrant.holdPercentage !== undefined && holdPercentage !== entrant.holdPercentage) {
                trend = holdPercentage > entrant.holdPercentage ? 'up' : 'down';
              }
              
              console.log('[DEBUG] Updating entrant money flow:', {
                entrantId: entrant.$id,
                entrantName: entrant.name,
                oldHoldPercentage: entrant.holdPercentage,
                newHoldPercentage: holdPercentage,
                trend
              });
              
              return {
                ...entrant,
                previousHoldPercentage: entrant.holdPercentage,
                holdPercentage: holdPercentage,
                moneyFlowTrend: trend
              };
            }
            return entrant;
          });
          
          console.log('[DEBUG] Updated entrants with money flow:', updated.map(e => ({ 
            id: e.$id, 
            name: e.name, 
            holdPercentage: e.holdPercentage 
          })));
          
          return updated;
        });
        
        setRecentUpdates(prev => [...prev.slice(-50), {
          type: 'moneyFlow' as const,
          entrantId,
          data: response.payload as Record<string, unknown>,
          timestamp: new Date(),
          acknowledged: false
        }].slice(-100));
        
        setUpdateCounts(prev => ({ ...prev, moneyFlow: prev.moneyFlow + 1 }));
      });
      subscriptionCount++;
      
      // Odds history subscription
      subscriptionsRef.current.oddsHistory = client.subscribe(channels.oddsHistory, (response: OddsHistorySubscriptionResponse) => {
        if (!response.payload || !response.payload.entrant) return;
        
        const eventType = response.events?.[0] || '';
        if (!eventType.includes('create')) return;
        
        const entrantId = response.payload.entrant;
        const newOddsEntry = response.payload as OddsHistoryData;
        
        setEntrants(current => current.map(entrant => {
          if (entrant.$id === entrantId) {
            const updatedOddsHistory = [...(entrant.oddsHistory || []), newOddsEntry]
              .sort((a, b) => new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime());
            
            return {
              ...entrant,
              oddsHistory: updatedOddsHistory
            };
          }
          return entrant;
        }));
        
        setRecentUpdates(prev => [...prev.slice(-50), {
          type: 'oddsHistory' as const,
          entrantId,
          data: newOddsEntry as unknown as Record<string, unknown>,
          timestamp: new Date(),
          acknowledged: false
        }].slice(-100));
        
        setUpdateCounts(prev => ({ ...prev, oddsHistory: prev.oddsHistory + 1 }));
      });
      subscriptionCount++;
      
      // Update connection state
      setConnectionState(prev => ({
        ...prev,
        isConnected: true,
        lastConnected: new Date(),
        subscriptionCount,
        connectionAttempts: 0
      }));
      
    } catch (error) {
      console.error('Failed to setup real-time subscriptions:', error);
      
      setConnectionState(prev => ({
        ...prev,
        isConnected: false,
        connectionAttempts: prev.connectionAttempts + 1
      }));
    }
  }, [raceId]);
  
  // Cleanup subscriptions
  const cleanupSubscriptions = useCallback(() => {
    Object.values(subscriptionsRef.current).forEach(unsubscribe => {
      if (unsubscribe) unsubscribe();
    });
    subscriptionsRef.current = {};
  }, []);
  
  // Manual actions
  const triggerReconnect = useCallback(() => {
    cleanupSubscriptions();
    setConnectionState(prev => ({
      ...prev,
      isConnected: false,
      connectionAttempts: 0
    }));
    setTimeout(() => setupSubscriptions(), 1000);
  }, [cleanupSubscriptions, setupSubscriptions]);
  
  const acknowledgUpdate = useCallback((updateId: string) => {
    setRecentUpdates(prev => 
      prev.map(update => 
        update.timestamp.toISOString() === updateId 
          ? { ...update, acknowledged: true }
          : update
      )
    );
  }, []);
  
  const clearUpdateHistory = useCallback(() => {
    setRecentUpdates([]);
    setUpdateCounts({ entrants: 0, race: 0, moneyFlow: 0, oddsHistory: 0 });
  }, []);
  
  // Performance monitoring
  useEffect(() => {
    const interval = setInterval(() => {
      const oneMinuteAgo = new Date(Date.now() - 60000);
      const recentUpdateTimes = recentUpdates
        .filter(update => update.timestamp > oneMinuteAgo)
        .map(update => update.timestamp);
      
      const memoryUsage = entrants.length * 1000 + recentUpdates.length * 500;
      
      setPerformance({
        averageUpdateLatency: 0, // Simplified for now
        updatesPerMinute: recentUpdateTimes.length,
        batchEfficiency: 85, // Simplified for now
        memoryUsage
      });
    }, 10000);
    
    return () => clearInterval(interval);
  }, [entrants.length, recentUpdates]);
  
  // Setup and cleanup
  useEffect(() => {
    setupSubscriptions();
    return cleanupSubscriptions;
  }, [setupSubscriptions, cleanupSubscriptions]);
  
  // Cleanup old updates
  useEffect(() => {
    const interval = setInterval(() => {
      const fiveMinutesAgo = new Date(Date.now() - 300000);
      setRecentUpdates(prev => prev.filter(update => update.timestamp > fiveMinutesAgo));
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);
  
  return {
    entrants: memoizedEntrants,
    race,
    connectionState,
    recentUpdates,
    updateCounts,
    performance,
    triggerReconnect,
    acknowledgUpdate,
    clearUpdateHistory
  };
}