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
    // APPWRITE BEST PRACTICE: Use single subscription with multiple channels to avoid connection recreation
    const raceChannel = `databases.raceday-db.collections.races.documents.${initialRace.$id}`;
    const raceResultsChannel = `databases.raceday-db.collections.race-results.documents`;
    const channels = [raceChannel, raceResultsChannel];
    
    console.log('🏁 Realtime setup (optimized):', { 
      raceId: initialRace.raceId, 
      status: initialRace.status,
      channels: channels.length
    });

    let unsubscribe: (() => void) | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;

    // Extracted race data change handler for better organization
    const handleRaceDataChange = (changes: Partial<Race>) => {
      // Only log meaningful status changes to reduce noise
      if (changes.status && changes.status !== initialRace.status) {
        console.log('🔄 Status update:', { from: initialRace.status, to: changes.status });
      }
      
      // Only update if this is our specific race and has meaningful changes
      if (changes.$id === initialRace.$id) {
        // Only trigger updates for significant changes by comparing current race state
        setRace(currentRace => {
          const hasSignificantChange = (
            changes.status && changes.status !== currentRace.status ||
            changes.startTime && changes.startTime !== currentRace.startTime ||
            changes.actualStart && changes.actualStart !== currentRace.actualStart ||
            changes.distance && changes.distance !== currentRace.distance ||
            changes.trackCondition && changes.trackCondition !== currentRace.trackCondition
          );
              
          if (hasSignificantChange) {
            const updatedRace = { ...currentRace, ...changes };
            
            console.log('🏁 Applying race changes:', { 
              raceId: currentRace.raceId, 
              oldStatus: currentRace.status,
              newStatus: changes.status
            });

            // Force a lastUpdate when race status changes to important result states
            // This helps trigger re-renders that may fetch fresh results data
            const shouldForceUpdate = changes.status && [
              'Closed', 'Interim', 'Final', 'Finalized'
            ].includes(changes.status);
            
            if (shouldForceUpdate) {
              console.log('🔄 Force updating due to important status change:', changes.status);
              
              // ENHANCED FALLBACK: If race status changed to a results state but we don't have results data yet,
              // trigger multiple strategies to get the latest race data including results
              if (changes.status && ['Interim', 'Final', 'Finalized'].includes(changes.status) && 
                  !updatedRace.resultsData && !updatedRace.dividendsData) {
                console.log('🔄 Status suggests results should be available, triggering enhanced fallback fetch');
                
                // Strategy 1: Query race-results collection directly using race relationship
                // Strategy 2: Fallback to full race API if race-results query fails
                setTimeout(async () => {
                  try {
                    console.log('🔄 Attempting direct race-results fetch for race:', initialRace.$id);
                    
                    // Import Appwrite client and Query for direct race-results query
                    const { client, databases } = await import('@/lib/appwrite-client');
                    const { Query } = await import('appwrite');
                    
                    // Query race-results collection by race relationship
                    const raceResultsResponse = await databases.listDocuments(
                      'raceday-db',
                      'race-results',
                      [Query.equal('race', initialRace.$id)]
                    );
                    
                    if (raceResultsResponse.documents.length > 0) {
                      const raceResults = raceResultsResponse.documents[0];
                      console.log('🔄 Direct race-results query found results:', {
                        documentId: raceResults.$id,
                        resultsAvailable: raceResults.resultsAvailable,
                        resultStatus: raceResults.resultStatus,
                        hasResults: !!raceResults.resultsData,
                        hasDividends: !!raceResults.dividendsData
                      });
                      
                      // Apply race-results data to race state
                      setRace(currentRace => ({
                        ...currentRace,
                        resultsAvailable: raceResults.resultsAvailable || false,
                        resultsData: raceResults.resultsData ? JSON.parse(raceResults.resultsData) : null,
                        dividendsData: raceResults.dividendsData ? JSON.parse(raceResults.dividendsData) : null,
                        fixedOddsData: raceResults.fixedOddsData ? JSON.parse(raceResults.fixedOddsData) : null,
                        resultStatus: raceResults.resultStatus,
                        photoFinish: raceResults.photoFinish || false,
                        stewardsInquiry: raceResults.stewardsInquiry || false,
                        protestLodged: raceResults.protestLodged || false,
                        resultTime: raceResults.resultTime
                      }));
                      setLastUpdate(new Date());
                      return; // Success - no need for API fallback
                    }
                    
                    console.log('🔄 No race-results found in collection, falling back to race API');
                  } catch (dbError) {
                    console.error('🔄 Direct race-results query failed, falling back to race API:', dbError);
                  }
                  
                  // Fallback Strategy: Full race API fetch
                  try {
                    const response = await fetch(`/api/race/${currentRace.raceId}`);
                    if (response.ok) {
                      const freshData = await response.json();
                      if (freshData.race && (freshData.race.resultsData || freshData.race.dividendsData)) {
                        console.log('🔄 API fallback found results data, updating race');
                        setRace(currentRace => ({
                          ...currentRace,
                          resultsAvailable: freshData.race.resultsAvailable,
                          resultsData: freshData.race.resultsData,
                          dividendsData: freshData.race.dividendsData,
                          fixedOddsData: freshData.race.fixedOddsData,
                          resultStatus: freshData.race.resultStatus,
                          photoFinish: freshData.race.photoFinish,
                          stewardsInquiry: freshData.race.stewardsInquiry,
                          protestLodged: freshData.race.protestLodged,
                          resultTime: freshData.race.resultTime
                        }));
                        setLastUpdate(new Date());
                      } else {
                        console.log('🔄 API fallback did not find results data yet');
                      }
                    }
                  } catch (apiError) {
                    console.error('🔄 API fallback race data fetch failed:', apiError);
                  }
                }, 1500); // Wait 1.5 seconds to allow race-results subscription to potentially arrive first
              }
            }

            setLastUpdate(new Date());
            return updatedRace;
          }
          
          return currentRace;
        });
        setIsConnected(true);
      }
    };

    // Extracted race-results change handler for better organization
    const handleRaceResultsChange = (resultsChanges: Partial<RaceResults>) => {
      console.log('📊 Processing race-results changes:', {
        raceId: initialRace.raceId,
        payloadRace: resultsChanges.race,
        expectedRace: initialRace.$id,
        isForThisRace: resultsChanges.race === initialRace.$id,
        // Enhanced matching diagnostics
        matchStrategy1: resultsChanges.race === initialRace.$id ? 'RACE_RELATIONSHIP' : null,
        matchStrategy2: ((resultsChanges as any).raceId === initialRace.raceId) ? 'RACE_ID_FIELD' : null,
        matchStrategy3: (resultsChanges.resultsData && !resultsChanges.race && !((resultsChanges as any).raceId)) ? 'PERMISSIVE_FALLBACK' : null,
        resultsAvailable: resultsChanges.resultsAvailable,
        hasResultsData: !!resultsChanges.resultsData,
        hasDividendsData: !!resultsChanges.dividendsData,
        hasFixedOddsData: !!(resultsChanges as any).fixedOddsData,
        resultStatus: resultsChanges.resultStatus,
        // ENHANCED DEBUG: Show complete payload structure
        fullPayload: resultsChanges,
        payloadKeys: Object.keys(resultsChanges),
        raceFieldType: typeof resultsChanges.race,
        raceFieldValue: resultsChanges.race
      });

      // ENHANCED APPWRITE FILTERING: Multiple strategies to match race-results to current race
      const isForThisRace = 
        // Strategy 1: Direct race relationship match (race field contains races document $id)
        resultsChanges.race === initialRace.$id ||
        
        // Strategy 2: Check if race-results has raceId field that matches our race's raceId
        // (In case race-results documents also store raceId string for reference)
        ((resultsChanges as any).raceId === initialRace.raceId) ||
        
        // Strategy 3: If we have results data and are in race context, be permissive
        // This handles cases where subscription payload doesn't include race relationship properly
        (resultsChanges.resultsData && !resultsChanges.race && !((resultsChanges as any).raceId));

      if (isForThisRace) {
        setRace(currentRace => {
          // APPWRITE BEST PRACTICE: More permissive results change detection
          const hasResultsChange = (
            resultsChanges.resultsAvailable !== undefined ||
            resultsChanges.resultsData ||
            resultsChanges.dividendsData ||
            (resultsChanges as any).fixedOddsData ||
            resultsChanges.resultStatus ||
            resultsChanges.photoFinish !== undefined ||
            resultsChanges.stewardsInquiry !== undefined ||
            resultsChanges.protestLodged !== undefined ||
            resultsChanges.resultTime
          );
          
          console.log('📊 Results change analysis:', {
            raceId: currentRace.raceId,
            hasResultsChange,
            currentResultsAvailable: currentRace.resultsAvailable,
            newResultsAvailable: resultsChanges.resultsAvailable,
            currentHasResults: !!currentRace.resultsData,
            newHasResults: !!resultsChanges.resultsData
          });
          
          if (hasResultsChange) {
            const updatedRace = { ...currentRace };
            
            // Update results fields from race-results collection
            if (resultsChanges.resultsAvailable !== undefined) {
              updatedRace.resultsAvailable = resultsChanges.resultsAvailable;
            }
            if (resultsChanges.resultsData) {
              try {
                updatedRace.resultsData = JSON.parse(resultsChanges.resultsData);
                console.log('📊 Parsed results data:', updatedRace.resultsData?.length, 'positions');
              } catch (error) {
                console.error('Failed to parse results data:', error);
              }
            }
            if (resultsChanges.dividendsData) {
              try {
                updatedRace.dividendsData = JSON.parse(resultsChanges.dividendsData);
                console.log('📊 Parsed dividends data:', updatedRace.dividendsData?.length, 'dividends');
              } catch (error) {
                console.error('Failed to parse dividends data:', error);
              }
            }
            if ((resultsChanges as any).fixedOddsData) {
              try {
                updatedRace.fixedOddsData = JSON.parse((resultsChanges as any).fixedOddsData);
                console.log('📊 Parsed fixed odds data:', Object.keys(updatedRace.fixedOddsData || {}).length, 'runners');
              } catch (error) {
                console.error('Failed to parse fixed odds data:', error);
              }
            }
            if (resultsChanges.resultStatus) updatedRace.resultStatus = resultsChanges.resultStatus;
            if (resultsChanges.photoFinish !== undefined) updatedRace.photoFinish = resultsChanges.photoFinish;
            if (resultsChanges.stewardsInquiry !== undefined) updatedRace.stewardsInquiry = resultsChanges.stewardsInquiry;
            if (resultsChanges.protestLodged !== undefined) updatedRace.protestLodged = resultsChanges.protestLodged;
            if (resultsChanges.resultTime) updatedRace.resultTime = resultsChanges.resultTime;
            
            console.log('📊 Applying results changes:', { 
              raceId: currentRace.raceId, 
              hasResults: !!updatedRace.resultsData,
              resultsCount: updatedRace.resultsData?.length || 0,
              hasDividends: !!updatedRace.dividendsData,
              dividendsCount: updatedRace.dividendsData?.length || 0,
              hasFixedOdds: !!updatedRace.fixedOddsData,
              fixedOddsCount: Object.keys(updatedRace.fixedOddsData || {}).length,
              resultStatus: updatedRace.resultStatus
            });
            setLastUpdate(new Date());
            return updatedRace;
          } else {
            console.log('📊 No significant results changes detected, skipping update');
            return currentRace;
          }
        });
        setIsConnected(true);
      } else {
        console.log('🔔 Race-results event not for this race, ignoring');
      }
    };

    const setupSubscriptions = async () => {
      try {
        // APPWRITE BEST PRACTICE: Single subscription with multiple channels
        unsubscribe = client.subscribe(channels, (response: { 
          payload?: Partial<Race> | Partial<RaceResults>, 
          events?: string[], 
          channels?: string[] 
        }) => {
          console.log('🔔 Unified subscription event received:', {
            raceId: initialRace.raceId,
            hasPayload: !!response.payload,
            events: response.events,
            channels: response.channels,
            payloadKeys: response.payload ? Object.keys(response.payload) : []
          });

          // APPWRITE BEST PRACTICE: Use events array to determine data type and processing
          const isRaceEvent = response.events?.some(event => event.includes(`races.${initialRace.$id}`));
          const isRaceResultsEvent = response.events?.some(event => event.includes('race-results'));

          if (isRaceEvent && response.payload) {
            // Handle race data changes
            handleRaceDataChange(response.payload as Partial<Race>);
          } else if (isRaceResultsEvent && response.payload) {
            // Handle race-results data changes
            handleRaceResultsChange(response.payload as Partial<RaceResults>);
          } else {
            console.log('🔔 Event not relevant to current race, ignoring');
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

    // APPWRITE BEST PRACTICE: Cleanup single unified subscription on unmount
    return () => {
      if (unsubscribe) {
        console.log('🏁 Cleaning up unified real-time subscription');
        unsubscribe();
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