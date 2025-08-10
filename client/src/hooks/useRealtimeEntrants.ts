'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { client } from '@/lib/appwrite-client';
import { Entrant } from '@/types/meetings';

interface UseRealtimeEntrantsProps {
  initialEntrants: Entrant[];
  raceId: string;
}

export function useRealtimeEntrants({ initialEntrants, raceId }: UseRealtimeEntrantsProps) {
  const [entrants, setEntrants] = useState<Entrant[]>(initialEntrants);
  const [isConnected, setIsConnected] = useState(false);
  const [oddsUpdates, setOddsUpdates] = useState<Record<string, { win?: number; place?: number; timestamp: Date }>>({});
  
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
    
    let entrantsUnsubscribe: (() => void) | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;

    const setupEntrantsSubscription = async () => {
      try {
        entrantsUnsubscribe = client.subscribe(entrantsChannel, (response: { 
          payload?: Partial<Entrant> & { $id: string };
          events?: string[];
        }) => {
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
        
        setIsConnected(true);
      } catch (error) {
        console.error('Failed to setup entrants subscription:', error);
        setIsConnected(false);
        
        // Retry connection after 5 seconds
        retryTimeout = setTimeout(() => {
          setupEntrantsSubscription();
        }, 5000);
      }
    };

    setupEntrantsSubscription();

    // Cleanup subscription on unmount
    return () => {
      if (entrantsUnsubscribe) {
        entrantsUnsubscribe();
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [raceId, updateEntrant, addEntrant, removeEntrant]);

  // Clean up old odds updates after 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const thirtySecondsAgo = new Date(Date.now() - 30000);
      setOddsUpdates(prev => {
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
  };
}