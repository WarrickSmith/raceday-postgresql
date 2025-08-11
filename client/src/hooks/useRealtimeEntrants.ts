'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { client } from '@/lib/appwrite-client';
import { Entrant, EntrantSubscriptionResponse, MoneyFlowSubscriptionResponse, OddsHistorySubscriptionResponse, OddsHistoryData } from '@/types/meetings';

interface UseRealtimeEntrantsProps {
  initialEntrants: Entrant[];
  raceId: string;
}

export function useRealtimeEntrants({ initialEntrants, raceId }: UseRealtimeEntrantsProps) {
  const [entrants, setEntrants] = useState<Entrant[]>(initialEntrants);
  const [isConnected, setIsConnected] = useState(false);
  const [oddsUpdates, setOddsUpdates] = useState<Record<string, { win?: number; place?: number; timestamp: Date }>>({});
  const [moneyFlowUpdates, setMoneyFlowUpdates] = useState<Record<string, { holdPercentage?: number; trend?: 'up' | 'down' | 'neutral'; timestamp: Date }>>({});
  const [oddsHistoryUpdates, setOddsHistoryUpdates] = useState<Record<string, { newEntry?: OddsHistoryData; timestamp: Date }>>({});
  
  // Memoize entrants to prevent unnecessary re-renders
  const memoizedEntrants = useMemo(() => entrants, [entrants]);
  
  const updateEntrant = useCallback((updatedEntrant: Partial<Entrant> & { $id: string }) => {
    setEntrants(currentEntrants => {
      const updatedEntrants = currentEntrants.map(entrant => 
        entrant.$id === updatedEntrant.$id 
          ? { ...entrant, ...updatedEntrant }
          : entrant
      );
      
      // Track odds changes for trend indicators
      if (updatedEntrant.winOdds !== undefined || updatedEntrant.placeOdds !== undefined) {
        setOddsUpdates(prev => ({
          ...prev,
          [updatedEntrant.$id]: {
            win: updatedEntrant.winOdds,
            place: updatedEntrant.placeOdds,
            timestamp: new Date()
          }
        }));
      }
      
      // Track money flow changes for trend indicators
      if (updatedEntrant.holdPercentage !== undefined || updatedEntrant.moneyFlowTrend !== undefined) {
        setMoneyFlowUpdates(prev => ({
          ...prev,
          [updatedEntrant.$id]: {
            holdPercentage: updatedEntrant.holdPercentage,
            trend: updatedEntrant.moneyFlowTrend,
            timestamp: new Date()
          }
        }));
      }
      
      return updatedEntrants;
    });
  }, []);

  const addEntrant = useCallback((newEntrant: Entrant) => {
    setEntrants(currentEntrants => [...currentEntrants, newEntrant]);
  }, []);

  const removeEntrant = useCallback((entrantId: string) => {
    setEntrants(currentEntrants => 
      currentEntrants.filter(entrant => entrant.$id !== entrantId)
    );
  }, []);

  useEffect(() => {
    // Subscribe to entrants collection for this race
    const entrantsChannel = `databases.raceday-db.collections.entrants.documents`;
    const moneyFlowChannel = `databases.raceday-db.collections.money-flow-history.documents`;
    const oddsHistoryChannel = `databases.raceday-db.collections.odds-history.documents`;
    
    let entrantsUnsubscribe: (() => void) | null = null;
    let moneyFlowUnsubscribe: (() => void) | null = null;
    let oddsHistoryUnsubscribe: (() => void) | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;

    const setupSubscriptions = async () => {
      try {
        // Subscribe to entrants updates
        entrantsUnsubscribe = client.subscribe(entrantsChannel, (response: EntrantSubscriptionResponse) => {
          if (!response.payload || response.payload.race !== raceId) {
            return; // Only process updates for our race
          }

          const eventType = response.events?.[0];
          
          if (eventType?.includes('create')) {
            addEntrant(response.payload as Entrant);
          } else if (eventType?.includes('update')) {
            updateEntrant(response.payload);
          } else if (eventType?.includes('delete')) {
            removeEntrant(response.payload.$id);
          }
          
          setIsConnected(true);
        });
        
        // Subscribe to money flow updates
        moneyFlowUnsubscribe = client.subscribe(moneyFlowChannel, (response: MoneyFlowSubscriptionResponse) => {
          if (!response.payload || !response.payload.entrant) {
            return;
          }

          const eventType = response.events?.[0];
          
          if (eventType?.includes('create') || eventType?.includes('update')) {
            // Update the corresponding entrant with new money flow data
            const entrantId = response.payload.entrant;
            const holdPercentage = response.payload.holdPercentage;
            
            if (holdPercentage === undefined) {
              return;
            }
            
            // Calculate trend by comparing with current entrant data
            setEntrants(currentEntrants => {
              return currentEntrants.map(entrant => {
                if (entrant.$id === entrantId) {
                  let trend: 'up' | 'down' | 'neutral' = 'neutral';
                  if (entrant.holdPercentage !== undefined && holdPercentage !== entrant.holdPercentage) {
                    trend = holdPercentage > entrant.holdPercentage ? 'up' : 'down';
                  }
                  
                  return {
                    ...entrant,
                    previousHoldPercentage: entrant.holdPercentage,
                    holdPercentage: holdPercentage,
                    moneyFlowTrend: trend
                  };
                }
                return entrant;
              });
            });
            
            // Track money flow updates for live region announcements
            setMoneyFlowUpdates(prev => ({
              ...prev,
              [entrantId]: {
                holdPercentage: holdPercentage,
                timestamp: new Date()
              }
            }));
          }
        });
        
        // Subscribe to odds history updates
        oddsHistoryUnsubscribe = client.subscribe(oddsHistoryChannel, (response: OddsHistorySubscriptionResponse) => {
          if (!response.payload || !response.payload.entrant) {
            return;
          }

          const eventType = response.events?.[0];
          
          if (eventType?.includes('create')) {
            // Add new odds history entry to the corresponding entrant
            const entrantId = response.payload.entrant;
            const newOddsEntry = response.payload as OddsHistoryData;
            
            setEntrants(currentEntrants => {
              return currentEntrants.map(entrant => {
                if (entrant.$id === entrantId) {
                  const updatedOddsHistory = [...(entrant.oddsHistory || []), newOddsEntry]
                    .sort((a, b) => new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime());
                  
                  return {
                    ...entrant,
                    oddsHistory: updatedOddsHistory
                  };
                }
                return entrant;
              });
            });
            
            // Track odds history updates for batching and performance
            setOddsHistoryUpdates(prev => ({
              ...prev,
              [entrantId]: {
                newEntry: newOddsEntry,
                timestamp: new Date()
              }
            }));
          }
        });
        
        setIsConnected(true);
      } catch (error) {
        console.error('Failed to setup subscriptions:', error);
        setIsConnected(false);
        
        // Retry connection after 5 seconds
        retryTimeout = setTimeout(() => {
          setupSubscriptions();
        }, 5000);
      }
    };

    setupSubscriptions();

    // Cleanup subscriptions on unmount
    return () => {
      if (entrantsUnsubscribe) {
        entrantsUnsubscribe();
      }
      if (moneyFlowUnsubscribe) {
        moneyFlowUnsubscribe();
      }
      if (oddsHistoryUnsubscribe) {
        oddsHistoryUnsubscribe();
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [raceId, updateEntrant, addEntrant, removeEntrant]);

  // Clean up old updates after 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const thirtySecondsAgo = new Date(Date.now() - 30000);
      
      // Clean up odds updates
      setOddsUpdates(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          if (updated[key].timestamp < thirtySecondsAgo) {
            delete updated[key];
          }
        });
        return updated;
      });
      
      // Clean up money flow updates
      setMoneyFlowUpdates(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          if (updated[key].timestamp < thirtySecondsAgo) {
            delete updated[key];
          }
        });
        return updated;
      });
      
      // Clean up odds history updates
      setOddsHistoryUpdates(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          if (updated[key].timestamp < thirtySecondsAgo) {
            delete updated[key];
          }
        });
        return updated;
      });
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    entrants: memoizedEntrants,
    isConnected,
    oddsUpdates,
    moneyFlowUpdates,
    oddsHistoryUpdates,
  };
}