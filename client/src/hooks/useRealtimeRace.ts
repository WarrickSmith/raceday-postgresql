'use client';

import { useState, useEffect } from 'react';
import { client } from '@/lib/appwrite-client';
import { Race, RaceResults } from '@/types/meetings';

interface UseRealtimeRaceProps {
  initialRace: Race;
}

export function useRealtimeRace({ initialRace }: UseRealtimeRaceProps) {
  const [race, setRace] = useState<Race>(initialRace);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());


  useEffect(() => {
    // Subscribe to both race data and race-results data
    const raceChannel = `databases.raceday-db.collections.races.documents.${initialRace.$id}`;
    const raceResultsChannel = `databases.raceday-db.collections.race-results.documents`;
    
    console.log('🏁 Realtime setup:', { raceId: initialRace.raceId, status: initialRace.status });

    let raceUnsubscribe: (() => void) | null = null;
    let resultsUnsubscribe: (() => void) | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;

    const setupSubscriptions = async () => {
      try {
        // Subscribe to race data changes
        raceUnsubscribe = client.subscribe(raceChannel, (response: { payload?: Partial<Race> }) => {
          // Only log meaningful status changes to reduce noise
          if (response.payload?.status && response.payload.status !== initialRace.status) {
            console.log('🔄 Status update:', { from: initialRace.status, to: response.payload.status });
          }
          
          // Only update if this is our specific race and has meaningful changes
          if (response.payload && response.payload.$id === initialRace.$id) {
            const changes = response.payload;
            
            // Only trigger updates for significant changes by comparing current race state
            setRace(currentRace => {
              const hasSignificantChange = (
                changes.status && changes.status !== currentRace.status ||
                changes.startTime && changes.startTime !== currentRace.startTime ||
                changes.distance && changes.distance !== currentRace.distance ||
                changes.trackCondition && changes.trackCondition !== currentRace.trackCondition
              );
              
              if (hasSignificantChange) {
                const updatedRace = { ...currentRace, ...changes };
                
                console.log('🏁 Applying race changes:', { 
                  raceId: currentRace.raceId, 
                  status: changes.status
                });
                setLastUpdate(new Date());
                return updatedRace;
              }
              
              return currentRace;
            });
            setIsConnected(true);
          }
        });

        // Subscribe to race-results data changes (filter by race relationship)
        resultsUnsubscribe = client.subscribe(raceResultsChannel, (response: { payload?: Partial<RaceResults> }) => {
          if (response.payload && response.payload.race === initialRace.$id) {
            const resultsChanges = response.payload;
            
            setRace(currentRace => {
              const hasResultsChange = (
                resultsChanges.resultsAvailable !== undefined && resultsChanges.resultsAvailable !== currentRace.resultsAvailable ||
                resultsChanges.resultsData && resultsChanges.resultsData !== JSON.stringify(currentRace.resultsData) ||
                resultsChanges.dividendsData && resultsChanges.dividendsData !== JSON.stringify(currentRace.dividendsData) ||
                resultsChanges.resultStatus && resultsChanges.resultStatus !== currentRace.resultStatus ||
                resultsChanges.photoFinish !== undefined && resultsChanges.photoFinish !== currentRace.photoFinish ||
                resultsChanges.stewardsInquiry !== undefined && resultsChanges.stewardsInquiry !== currentRace.stewardsInquiry ||
                resultsChanges.protestLodged !== undefined && resultsChanges.protestLodged !== currentRace.protestLodged
              );
              
              if (hasResultsChange) {
                const updatedRace = { ...currentRace };
                
                // Update results fields from race-results collection
                if (resultsChanges.resultsAvailable !== undefined) {
                  updatedRace.resultsAvailable = resultsChanges.resultsAvailable;
                }
                if (resultsChanges.resultsData) {
                  updatedRace.resultsData = JSON.parse(resultsChanges.resultsData);
                }
                if (resultsChanges.dividendsData) {
                  updatedRace.dividendsData = JSON.parse(resultsChanges.dividendsData);
                }
                if (resultsChanges.resultStatus) {
                  updatedRace.resultStatus = resultsChanges.resultStatus;
                }
                if (resultsChanges.photoFinish !== undefined) {
                  updatedRace.photoFinish = resultsChanges.photoFinish;
                }
                if (resultsChanges.stewardsInquiry !== undefined) {
                  updatedRace.stewardsInquiry = resultsChanges.stewardsInquiry;
                }
                if (resultsChanges.protestLodged !== undefined) {
                  updatedRace.protestLodged = resultsChanges.protestLodged;
                }
                if (resultsChanges.resultTime) {
                  updatedRace.resultTime = resultsChanges.resultTime;
                }
                
                console.log('📊 Applying results changes:', { 
                  raceId: currentRace.raceId, 
                  hasResults: !!updatedRace.resultsData,
                  hasDividends: !!updatedRace.dividendsData,
                  resultStatus: updatedRace.resultStatus
                });
                setLastUpdate(new Date());
                return updatedRace;
              }
              
              return currentRace;
            });
            setIsConnected(true);
          }
        });
        
        setIsConnected(true);
      } catch (error) {
        console.error('Failed to setup race subscriptions:', error);
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
      if (raceUnsubscribe) {
        raceUnsubscribe();
      }
      if (resultsUnsubscribe) {
        resultsUnsubscribe();
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [initialRace.$id]);

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