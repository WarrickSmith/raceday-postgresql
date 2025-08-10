'use client';

import { useState, useEffect, useCallback } from 'react';
import { client } from '@/lib/appwrite-client';
import { Race } from '@/types/meetings';

interface UseRealtimeRaceProps {
  initialRace: Race;
}

export function useRealtimeRace({ initialRace }: UseRealtimeRaceProps) {
  const [race, setRace] = useState<Race>(initialRace);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const updateRace = useCallback((updatedRace: Partial<Race>) => {
    setRace(prevRace => ({ ...prevRace, ...updatedRace }));
    setLastUpdate(new Date());
  }, []);

  useEffect(() => {
    // Subscribe only to this specific race to minimize network overhead
    const channel = `databases.raceday-db.collections.races.documents.${initialRace.$id}`;

    let unsubscribe: (() => void) | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;

    const setupSubscription = async () => {
      try {
        unsubscribe = client.subscribe(channel, (response: { payload?: Partial<Race> }) => {
          // Only update if this is our specific race and has meaningful changes
          if (response.payload && response.payload.$id === initialRace.$id) {
            const changes = response.payload;
            
            // Only trigger updates for significant changes
            const hasSignificantChange = (
              changes.status !== race.status ||
              changes.startTime !== race.startTime ||
              changes.distance !== race.distance ||
              changes.trackCondition !== race.trackCondition
            );
            
            if (hasSignificantChange) {
              updateRace(changes);
            }
            setIsConnected(true);
          }
        });
        
        setIsConnected(true);
      } catch (error) {
        console.error('Failed to setup race subscription:', error);
        setIsConnected(false);
        
        // Retry connection after 5 seconds
        retryTimeout = setTimeout(() => {
          setupSubscription();
        }, 5000);
      }
    };

    setupSubscription();

    // Cleanup subscription on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [initialRace.$id, updateRace, race.status, race.startTime, race.distance, race.trackCondition]);

  // Update countdown every second, but only if race hasn't started
  useEffect(() => {
    const now = new Date();
    const raceTime = new Date(race.startTime);
    
    // Only run countdown if race is in the future and not finalized
    if (raceTime > now && race.status !== 'Finalized' && race.status !== 'Running') {
      const interval = setInterval(() => {
        setLastUpdate(new Date());
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [race.startTime, race.status]);

  return {
    race,
    isConnected,
    lastUpdate,
  };
}