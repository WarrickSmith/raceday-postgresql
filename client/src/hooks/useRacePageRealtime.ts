/**
 * Unified Race Page Real-time Subscription Hook
 * 
 * Implements Appwrite real-time best practices with a single main subscription
 * and multiple channels to replace scattered subscription patterns.
 * 
 * Key Features:
 * - Single WebSocket connection for all race page data
 * - Connection health monitoring with automatic reconnection
 * - Data persistence with initial fetch + real-time updates
 * - Performance optimized with throttling and batching
 * - Comprehensive logging for debugging subscription issues
 * 
 * Replaces: useAppwriteRealtime.ts, useRealtimeRace.ts, useRacePoolData.ts patterns
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { client, databases } from '@/lib/appwrite-client';
import { Race, Entrant, Meeting, RaceNavigationData } from '@/types/meetings';
import type { RacePoolData, RaceResultsData } from '@/types/racePools';
import { Query } from 'appwrite';

// Debug logging control
const DEBUG = process.env.NODE_ENV === 'development';

const debugLog = (message: string, data?: any) => {
  if (DEBUG) {
    console.log(`[RacePageRealtime] ${message}`, data);
  }
};

const errorLog = (message: string, error: any) => {
  console.error(`[RacePageRealtime] ${message}`, error);
};

const performanceLog = (operation: string, startTime: number) => {
  const duration = Date.now() - startTime;
  if (duration > 1000) {
    console.warn(`[RacePageRealtime] ${operation} took ${duration}ms`);
  }
};

// Appwrite subscription message interface
interface AppwriteRealtimeMessage {
  events: string[];
  channels: string[];
  timestamp: string;
  payload: any;
}

// Hook props interface
interface UseRacePageRealtimeProps {
  raceId: string;
  initialRace?: Race | null;
  initialEntrants?: Entrant[];
  initialMeeting?: Meeting | null;
  initialNavigationData?: RaceNavigationData | null;
}

// Unified state interface
interface RacePageRealtimeState {
  // Core race data
  race: Race | null;
  raceDocumentId: string | null; // Race document ID for real-time subscriptions
  raceResultsDocumentId: string | null; // Race-results document ID for specific subscriptions
  entrants: Entrant[];
  meeting: Meeting | null;
  navigationData: RaceNavigationData | null;
  
  // Real-time data
  poolData: RacePoolData | null;
  resultsData: RaceResultsData | null;
  
  // Connection and freshness
  isConnected: boolean;
  connectionAttempts: number;
  lastUpdate: Date | null;
  updateLatency: number;
  totalUpdates: number;
  
  // Data freshness indicators
  lastRaceUpdate: Date | null;
  lastPoolUpdate: Date | null;
  lastResultsUpdate: Date | null;
  lastEntrantsUpdate: Date | null;
}

// Hook actions interface
interface RacePageRealtimeActions {
  reconnect: () => void;
  clearHistory: () => void;
  getConnectionHealth: () => {
    isHealthy: boolean;
    avgLatency: number;
    uptime: number;
  };
}

export function useRacePageRealtime({
  raceId,
  initialRace = null,
  initialEntrants = [],
  initialMeeting = null,
  initialNavigationData = null,
}: UseRacePageRealtimeProps): RacePageRealtimeState & RacePageRealtimeActions {

  const [state, setState] = useState<RacePageRealtimeState>({
    race: initialRace,
    raceDocumentId: initialRace?.$id || null,
    raceResultsDocumentId: null,
    entrants: initialEntrants,
    meeting: initialMeeting,
    navigationData: initialNavigationData,
    poolData: null,
    resultsData: null,
    isConnected: false,
    connectionAttempts: 0,
    lastUpdate: null,
    updateLatency: 0,
    totalUpdates: 0,
    lastRaceUpdate: null,
    lastPoolUpdate: null,
    lastResultsUpdate: null,
    lastEntrantsUpdate: null,
  });

  // Performance and connection tracking
  const updateStartTime = useRef<number>(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const unsubscribeFunction = useRef<(() => void) | null>(null);
  const connectionStartTime = useRef<number>(Date.now());
  const latencySamples = useRef<number[]>([]);
  const initialDataFetched = useRef<boolean>(false);

  // Throttling for performance optimization during high-frequency updates
  const pendingUpdates = useRef<AppwriteRealtimeMessage[]>([]);
  const updateThrottleTimer = useRef<NodeJS.Timeout | null>(null);
  const THROTTLE_DELAY = 100; // 100ms for critical periods as per requirements

  // Fetch initial data if not provided - use API endpoint for complete race data
  const fetchInitialData = useCallback(async () => {
    if (!raceId || initialDataFetched.current) return;
    
    debugLog('Fetching complete initial data for race', { raceId });
    
    try {
      // Use the comprehensive API endpoint that fetches all race data
      const response = await fetch(`/api/race/${raceId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch race data: ${response.statusText}`);
      }
      
      const raceData = await response.json();
      debugLog('Complete race data fetched from API', { 
        hasRace: !!raceData.race,
        hasEntrants: !!raceData.entrants?.length,
        hasMeeting: !!raceData.meeting 
      });
      
      // Set complete initial state from API data
      setState(prev => ({
        ...prev,
        race: raceData.race || null,
        raceDocumentId: raceData.race?.$id || null, // Store race document ID for real-time subscriptions
        entrants: raceData.entrants || [],
        meeting: raceData.meeting || null,
        navigationData: raceData.navigationData || null,
        lastUpdate: new Date(),
        lastRaceUpdate: new Date(),
        lastEntrantsUpdate: new Date(),
      }));
      
      // Separately fetch pool data since API might not include it
      try {
        const poolDataResponse = await databases.listDocuments(
          'raceday-db',
          'race-pools',
          [Query.equal('raceId', raceId), Query.limit(1)]
        );
        
        if (poolDataResponse.documents.length > 0) {
          const poolDoc = poolDataResponse.documents[0];
          setState(prev => ({
            ...prev,
            poolData: {
              raceId: poolDoc.raceId,
              winPoolTotal: poolDoc.winPoolTotal || 0,
              placePoolTotal: poolDoc.placePoolTotal || 0,
              quinellaPoolTotal: poolDoc.quinellaPoolTotal || 0,
              trifectaPoolTotal: poolDoc.trifectaPoolTotal || 0,
              exactaPoolTotal: poolDoc.exactaPoolTotal || 0,
              first4PoolTotal: poolDoc.first4PoolTotal || 0,
              totalRacePool: poolDoc.totalRacePool || 0,
              currency: poolDoc.currency || '$',
              lastUpdated: poolDoc.$updatedAt,
            }
          }));
          debugLog('Initial pool data loaded', { totalPool: poolDoc.totalRacePool });
        }
      } catch (poolError) {
        errorLog('Failed to fetch pool data', poolError);
      }

      // Fetch race-results document ID for specific subscriptions
      if (raceData.race?.$id) {
        try {
          const raceResultsResponse = await databases.listDocuments(
            'raceday-db',
            'race-results',
            [Query.equal('race', raceData.race.$id), Query.limit(1)]
          );
          
          if (raceResultsResponse.documents.length > 0) {
            const raceResultsDoc = raceResultsResponse.documents[0];
            const raceResultsDocId = raceResultsDoc.$id;
            
            // Parse fixedOddsData from race-results document
            let parsedFixedOddsData = {};
            if (raceResultsDoc.fixedOddsData) {
              try {
                parsedFixedOddsData = typeof raceResultsDoc.fixedOddsData === 'string' 
                  ? JSON.parse(raceResultsDoc.fixedOddsData) 
                  : (raceResultsDoc.fixedOddsData || {});
              } catch (error) {
                errorLog('Failed to parse initial fixedOddsData', error);
                parsedFixedOddsData = {};
              }
            }
            
            const initialResultsData = raceResultsDoc.resultsAvailable ? {
              raceId,
              results: typeof raceResultsDoc.resultsData === 'string' 
                ? JSON.parse(raceResultsDoc.resultsData) 
                : (raceResultsDoc.resultsData || []),
              dividends: typeof raceResultsDoc.dividendsData === 'string' 
                ? JSON.parse(raceResultsDoc.dividendsData) 
                : (raceResultsDoc.dividendsData || []),
              fixedOddsData: parsedFixedOddsData,
              status: (raceResultsDoc.resultStatus?.toLowerCase() || 'interim') as 'interim' | 'final',
              photoFinish: raceResultsDoc.photoFinish || false,
              stewardsInquiry: raceResultsDoc.stewardsInquiry || false,
              protestLodged: raceResultsDoc.protestLodged || false,
              resultTime: raceResultsDoc.resultTime || new Date().toISOString(),
            } : null;

            setState(prev => ({
              ...prev,
              raceResultsDocumentId: raceResultsDocId,
              resultsData: initialResultsData
            }));
          }
        } catch (resultsError) {
          errorLog('Failed to fetch race-results document ID', resultsError);
          // Continue without race-results document ID - not critical for basic functionality
        }
      }

      // Set results data if included in race data
      if (raceData.race?.resultsAvailable && raceData.race?.resultsData) {
        setState(prev => ({
          ...prev,
          resultsData: {
            raceId,
            results: raceData.race.resultsData,
            dividends: raceData.race.dividendsData || [],
            status: raceData.race.resultStatus || 'final',
            photoFinish: raceData.race.photoFinish || false,
            stewardsInquiry: raceData.race.stewardsInquiry || false,
            protestLodged: raceData.race.protestLodged || false,
            resultTime: raceData.race.resultTime || new Date().toISOString(),
          }
        }));
        debugLog('Initial results data loaded from race data');
      }

      initialDataFetched.current = true;
      debugLog('Initial data fetch completed successfully');
    } catch (error) {
      errorLog('Failed to fetch initial data', error);
      // Don't mark as fetched on error, allow retry
    }
  }, [raceId]);

  // Reset fetch flag when race ID changes to allow fresh data fetching
  useEffect(() => {
    initialDataFetched.current = false;
    debugLog('Race ID changed, reset fetch flag', { raceId });
  }, [raceId]);

  // Fetch initial data when race ID changes or when we don't have essential data
  useEffect(() => {
    // Always fetch initial data when raceId changes, unless we already have complete data
    if (raceId && (!state.race || !state.entrants.length)) {
      debugLog('Triggering initial data fetch', { 
        raceId, 
        hasRace: !!state.race, 
        entrantCount: state.entrants.length,
        fetched: initialDataFetched.current 
      });
      fetchInitialData();
    }
  }, [raceId, state.race, state.entrants, fetchInitialData]);

  // Apply batched updates to state with detailed update tracking
  const applyPendingUpdates = useCallback(() => {
    if (pendingUpdates.current.length === 0) return;

    const updates = [...pendingUpdates.current];
    pendingUpdates.current = [];
    
    debugLog(`Processing ${updates.length} batched updates`);

    setState(prevState => {
      const newState = { ...prevState };
      const now = new Date();
      let hasUpdates = false;

      // Process all pending updates in batch
      for (const message of updates) {
        const { channels, payload, events } = message;
        
        // Determine update type based on channel
        if (channels.some(ch => ch.includes('collections.races.documents'))) {
          if (payload && payload.raceId === raceId) {
            debugLog('Race data update received', { raceId: payload.raceId, status: payload.status });
            
            // Update race data with server field mapping including results fields
            const updatedRace: Race = {
              ...newState.race,
              ...payload,
              // Map server fields to client fields if needed
              $id: payload.$id || newState.race?.$id || raceId,
              raceId: payload.raceId || newState.race?.raceId || raceId,
              status: payload.status || newState.race?.status || 'open',
              startTime: payload.startTime || newState.race?.startTime || new Date().toISOString(),
              // Include results-related fields that were previously ignored
              resultsAvailable: payload.resultsAvailable || newState.race?.resultsAvailable || false,
              resultsData: payload.resultsData || newState.race?.resultsData || undefined,
              dividendsData: payload.dividendsData || newState.race?.dividendsData || undefined,
              fixedOddsData: payload.fixedOddsData || newState.race?.fixedOddsData || undefined,
              resultStatus: payload.resultStatus || newState.race?.resultStatus || undefined,
              resultTime: payload.resultTime || newState.race?.resultTime || undefined,
              photoFinish: payload.photoFinish || newState.race?.photoFinish || false,
              stewardsInquiry: payload.stewardsInquiry || newState.race?.stewardsInquiry || false,
              protestLodged: payload.protestLodged || newState.race?.protestLodged || false,
            } as Race;

            newState.race = updatedRace;
            newState.lastRaceUpdate = now;
            hasUpdates = true;

            // CRITICAL: If race status changed to 'Interim' or 'Final', trigger race-results lookup
            if (payload.status && ['Interim', 'Final', 'Finalized'].includes(payload.status) && 
                (!newState.resultsData || newState.resultsData.results.length === 0)) {
              debugLog('🔄 Race status indicates results available, triggering race-results lookup', {
                newStatus: payload.status,
                hasExistingResults: !!newState.resultsData
              });

              // Query race-results collection directly
              setTimeout(async () => {
                try {
                  const { databases } = await import('@/lib/appwrite-client');
                  const { Query } = await import('appwrite');
                  
                  const raceResultsResponse = await databases.listDocuments(
                    'raceday-db',
                    'race-results',
                    [Query.equal('race', newState.raceDocumentId || raceId)]
                  );
                  
                  if (raceResultsResponse.documents.length > 0) {
                    const raceResults = raceResultsResponse.documents[0];
                    debugLog('🏆 Found race-results via status-triggered lookup', {
                      documentId: raceResults.$id,
                      resultStatus: raceResults.resultStatus,
                      hasResults: !!raceResults.resultsData
                    });

                    // Process the race-results data as if received via subscription
                    setState(prevState => {
                      const updatedState = { ...prevState };
                      if (raceResults.resultsData) {
                        const results = JSON.parse(raceResults.resultsData);
                        const dividends = raceResults.dividendsData ? JSON.parse(raceResults.dividendsData) : [];
                        const fixedOddsData = raceResults.fixedOddsData ? JSON.parse(raceResults.fixedOddsData) : {};

                        updatedState.resultsData = {
                          raceId,
                          results,
                          dividends,
                          fixedOddsData,
                          status: raceResults.resultStatus?.toLowerCase() || 'interim',
                          photoFinish: raceResults.photoFinish || false,
                          stewardsInquiry: raceResults.stewardsInquiry || false,
                          protestLodged: raceResults.protestLodged || false,
                          resultTime: raceResults.resultTime || new Date().toISOString(),
                        };
                        
                        // Also update race object for consistency
                        if (updatedState.race) {
                          updatedState.race = {
                            ...updatedState.race,
                            resultsAvailable: true,
                            resultsData: results,
                            dividendsData: dividends,
                            fixedOddsData,
                            resultStatus: raceResults.resultStatus?.toLowerCase() || 'interim'
                          };
                        }

                        updatedState.lastResultsUpdate = new Date();
                      }
                      return updatedState;
                    });
                  }
                } catch (error) {
                  errorLog('Status-triggered race-results lookup failed', error);
                }
              }, 500); // Short delay to allow subscription to arrive first
            }

            // Build results data from race document when results become available
            if (payload.resultsAvailable && payload.resultsData) {
              try {
                // Parse results data if it's a JSON string
                const results = typeof payload.resultsData === 'string' 
                  ? JSON.parse(payload.resultsData) 
                  : payload.resultsData;
                
                // Parse dividends data if available
                const dividends = payload.dividendsData 
                  ? (typeof payload.dividendsData === 'string' 
                      ? JSON.parse(payload.dividendsData) 
                      : payload.dividendsData)
                  : [];

                // Parse fixed odds data (critical for win/place display)
                let fixedOddsData = {};
                if (payload.fixedOddsData) {
                  try {
                    fixedOddsData = typeof payload.fixedOddsData === 'string' 
                      ? JSON.parse(payload.fixedOddsData) 
                      : payload.fixedOddsData;
                  } catch (error) {
                    errorLog('Failed to parse race document fixedOddsData', error);
                    fixedOddsData = {};
                  }
                }

                // Create results data object for real-time display
                if (Array.isArray(results) && results.length > 0) {
                  newState.resultsData = {
                    raceId,
                    results,
                    dividends,
                    fixedOddsData,
                    status: (payload.resultStatus?.toLowerCase() || 'interim') as 'interim' | 'final',
                    photoFinish: payload.photoFinish || false,
                    stewardsInquiry: payload.stewardsInquiry || false,
                    protestLodged: payload.protestLodged || false,
                    resultTime: payload.resultTime || now.toISOString(),
                  };
                  newState.lastResultsUpdate = now;
                }
              } catch (error) {
                errorLog('Failed to parse results data from race document', error);
              }
            }
          }
        }
        
        else if (channels.some(ch => ch.includes('collections.entrants.documents'))) {
          // Fix: Use raceDocumentId instead of raceId for entrants relation
          if (payload && payload.race === newState.raceDocumentId) {
            debugLog('Entrant data update received', { 
              entrantId: payload.$id, 
              name: payload.name,
              raceDocumentId: newState.raceDocumentId,
              payloadRace: payload.race
            });
            
            // Update specific entrant in list
            newState.entrants = updateEntrantInList(newState.entrants, payload);
            newState.lastEntrantsUpdate = now;
            hasUpdates = true;
          } else if (payload) {
            // Debug logging when entrant update doesn't match
            debugLog('Entrant update skipped - race mismatch', { 
              payloadRace: payload.race,
              expectedRaceDocumentId: newState.raceDocumentId,
              raceId: raceId 
            });
          }
        }
        
        else if (channels.some(ch => ch.includes('collections.money-flow-history.documents'))) {
          // ENHANCED FILTERING: Check both raceId field and entrant relationship
          const isForThisRace = (payload?.raceId === raceId) || 
            (payload?.entrant && newState.entrants.some(e => e.$id === payload.entrant));
            
          if (payload && isForThisRace) {
            debugLog('Money flow update received for current race', { 
              entrant: payload.entrant, 
              raceId: payload.raceId,
              type: payload.type,
              timeInterval: payload.timeInterval,
              matchedBy: payload.raceId === raceId ? 'raceId' : 'entrant'
            });
            
            newState.entrants = updateEntrantMoneyFlow(newState.entrants, payload);
            hasUpdates = true;
          } else if (payload) {
            // Debug: Log why money flow update was skipped
            debugLog('Money flow update skipped - not for current race', {
              payloadRaceId: payload.raceId,
              currentRaceId: raceId,
              payloadEntrant: payload.entrant,
              hasMatchingEntrant: payload.entrant ? newState.entrants.some(e => e.$id === payload.entrant) : false
            });
          }
        }
        
        else if (channels.some(ch => ch.includes('collections.race-pools.documents'))) {
          if (payload && payload.raceId === raceId) {
            debugLog('Pool data update received', { raceId: payload.raceId, totalRacePool: payload.totalRacePool });
            
            // Update pool data
            newState.poolData = {
              raceId: payload.raceId,
              winPoolTotal: payload.winPoolTotal || 0,
              placePoolTotal: payload.placePoolTotal || 0,
              quinellaPoolTotal: payload.quinellaPoolTotal || 0,
              trifectaPoolTotal: payload.trifectaPoolTotal || 0,
              exactaPoolTotal: payload.exactaPoolTotal || 0,
              first4PoolTotal: payload.first4PoolTotal || 0,
              totalRacePool: payload.totalRacePool || 0,
              currency: payload.currency || '$',
              lastUpdated: payload.lastUpdated || now.toISOString(),
            };
            newState.lastPoolUpdate = now;
            hasUpdates = true;
          }
        }
        
        else if (channels.some(ch => ch.includes('collections.race-results.documents'))) {
          // ENHANCED DEBUG: Detailed race-results event analysis
          debugLog('Race-results event received', {
            channels: channels,
            raceId: raceId,
            currentRaceDocumentId: newState.raceDocumentId,
            currentRaceResultsDocumentId: newState.raceResultsDocumentId,
            payloadRace: payload?.race,
            payloadRaceId: payload?.raceId,
            payloadDocumentId: payload?.$id,
            payloadResultStatus: payload?.resultStatus,
            payloadResultsAvailable: payload?.resultsAvailable,
            hasResultsData: !!payload?.resultsData,
            hasDividendsData: !!payload?.dividendsData,
            payloadKeys: payload ? Object.keys(payload) : []
          });
          
          // Determine if this is a specific race-results document update or generic collection update
          const isSpecificDocumentUpdate = channels.some(ch => 
            ch.includes(`collections.race-results.documents.${newState.raceResultsDocumentId}`)
          );
          
          // Enhanced race-results filtering with fallback matching
          const isMatchingRace = isSpecificDocumentUpdate || (payload && (
            payload.race === newState.raceDocumentId || // Primary match: race document ID
            payload.race === raceId ||                   // Fallback 1: race ID string (shouldn't happen but kept for safety)
            payload.raceId === raceId ||                 // Fallback 2: raceId field (shouldn't happen but kept for safety)
            payload.raceId === newState.raceDocumentId   // Fallback 3: raceId to document ID (shouldn't happen but kept for safety)
          ));

          debugLog('Race-results matching analysis', {
            isSpecificDocumentUpdate,
            isMatchingRace,
            matchingStrategy: isSpecificDocumentUpdate ? 'SPECIFIC_DOCUMENT' : 
              payload?.race === newState.raceDocumentId ? 'RACE_DOCUMENT_ID' :
              payload?.race === raceId ? 'RACE_ID_STRING' :
              payload?.raceId === raceId ? 'RACE_ID_FIELD' :
              payload?.raceId === newState.raceDocumentId ? 'RACE_ID_TO_DOC_ID' : 'NO_MATCH'
          });

          if (isMatchingRace) {
            // Check if this is a new race-results document creation
            if (!newState.raceResultsDocumentId && payload.$id && payload.race === newState.raceDocumentId) {
              // Update state with new document ID to enable specific subscriptions
              newState.raceResultsDocumentId = payload.$id;
              hasUpdates = true;
            }
            
            // Enhanced results processing - handle interim results without requiring all data
            if (payload.resultsAvailable || payload.resultsData || payload.resultStatus) {
              try {
                // Parse results data if available
                let results = [];
                if (payload.resultsData) {
                  results = typeof payload.resultsData === 'string' 
                    ? JSON.parse(payload.resultsData) 
                    : payload.resultsData;
                }
                
                // Parse dividends data if available (optional for interim results)
                let dividends = [];
                if (payload.dividendsData) {
                  dividends = typeof payload.dividendsData === 'string' 
                    ? JSON.parse(payload.dividendsData) 
                    : payload.dividendsData;
                }

                // Parse fixed odds data (critical for win/place display)
                let fixedOddsData = {};
                if (payload.fixedOddsData) {
                  try {
                    fixedOddsData = typeof payload.fixedOddsData === 'string' 
                      ? JSON.parse(payload.fixedOddsData) 
                      : payload.fixedOddsData;
                  } catch (error) {
                    errorLog('Failed to parse real-time fixedOddsData', error);
                    fixedOddsData = {};
                  }
                }

                // Create results data if we have results or if status indicates results should be available
                const hasValidResults = Array.isArray(results) && results.length > 0;
                const isResultStatus = payload.resultStatus && ['interim', 'final'].includes(payload.resultStatus.toLowerCase());
                
                if (hasValidResults || (isResultStatus && payload.resultsAvailable)) {
                  // Use existing results if no new results provided but status updated
                  const finalResults = hasValidResults ? results : (newState.resultsData?.results || []);
                  
                  // CRITICAL: Preserve existing fixedOddsData if not provided in real-time update
                  const finalFixedOddsData = Object.keys(fixedOddsData).length > 0 
                    ? fixedOddsData 
                    : (newState.resultsData?.fixedOddsData || {});
                  
                  const newResultsData = {
                    raceId,
                    results: finalResults,
                    dividends,
                    fixedOddsData: finalFixedOddsData,
                    status: payload.resultStatus?.toLowerCase() || 'interim',
                    photoFinish: payload.photoFinish || false,
                    stewardsInquiry: payload.stewardsInquiry || false,
                    protestLodged: payload.protestLodged || false,
                    resultTime: payload.resultTime || now.toISOString(),
                  };
                  
                  debugLog('🏆 CREATING RESULTS DATA for UI', {
                    raceId,
                    resultsCount: finalResults.length,
                    dividendsCount: dividends.length,
                    fixedOddsCount: Object.keys(finalFixedOddsData).length,
                    status: newResultsData.status,
                    resultTime: newResultsData.resultTime,
                    previousResultsData: !!newState.resultsData
                  });
                  
                  newState.resultsData = newResultsData;
                  newState.lastResultsUpdate = now;
                  hasUpdates = true;

                  // CRITICAL: Also update the race object with results flags for UI consistency
                  if (newState.race) {
                    newState.race = {
                      ...newState.race,
                      resultsAvailable: true,
                      resultsData: finalResults,
                      dividendsData: dividends,
                      fixedOddsData: finalFixedOddsData,
                      resultStatus: payload.resultStatus?.toLowerCase() || 'interim',
                      photoFinish: payload.photoFinish || false,
                      stewardsInquiry: payload.stewardsInquiry || false,
                      protestLodged: payload.protestLodged || false,
                      resultTime: payload.resultTime || now.toISOString(),
                    };
                    
                    debugLog('🏁 RACE OBJECT UPDATED with results data for consistency', {
                      raceId: newState.race.raceId,
                      resultsAvailable: newState.race.resultsAvailable,
                      resultStatus: newState.race.resultStatus
                    });
                  }
                }
              } catch (error) {
                errorLog('Failed to parse results data', error);
                // Don't prevent other processing on parse error
              }
            }
          }
        }
        
        else if (channels.some(ch => ch.includes('collections.odds-history.documents'))) {
          if (payload && payload.entrant) {
            // Only process odds updates for entrants in this race
            const isRelevantEntrant = newState.entrants.some(e => e.$id === payload.entrant);
            if (isRelevantEntrant) {
              debugLog('Odds history update received', { 
                entrant: payload.entrant, 
                type: payload.type,
                odds: payload.odds 
              });
              
              newState.entrants = updateEntrantOddsHistory(newState.entrants, payload);
              hasUpdates = true;
            }
          }
        }
      }

      // Track latency for ALL real-time messages (not just updates that change state)
      const latency = performance.now() - updateStartTime.current;
      latencySamples.current = [latency, ...latencySamples.current.slice(0, 9)]; // Keep last 10 samples
      
      // Update connection metrics if any updates processed
      if (hasUpdates) {
        newState.lastUpdate = now;
        newState.updateLatency = latency;
        newState.totalUpdates = prevState.totalUpdates + updates.length;
      }
      
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
      errorLog('Error processing real-time message', error);
    }
  }, [applyPendingUpdates]);

  // Setup unified Appwrite real-time subscription
  useEffect(() => {
    if (!raceId) return;

    let connectionRetries = 0;
    const maxRetries = 5;

    const setupUnifiedSubscription = () => {
      try {
        // Clear any existing subscription
        if (unsubscribeFunction.current) {
          unsubscribeFunction.current();
          unsubscribeFunction.current = null;
        }

        debugLog('Setting up unified real-time subscription', { 
          raceId,
          raceDocumentId: state.raceDocumentId,
          raceResultsDocumentId: state.raceResultsDocumentId,
          entrantCount: state.entrants?.length || 0
        });

        // CRITICAL: Ensure we have the correct race document ID for subscription
        if (!state.raceDocumentId) {
          debugLog('WARNING: No race document ID available for subscription, using raceId as fallback');
        }

        // OPTIMIZED CHANNELS: Use document-specific subscriptions where possible
        const channels = [
          // Race document - specific document subscription using race document $id
          `databases.raceday-db.collections.races.documents.${state.raceDocumentId || raceId}`,
          
          // Race pools - specific to this race by raceId (but using collection-level for document creation detection)
          'databases.raceday-db.collections.race-pools.documents',
          
          // Race results - collection-level for document creation detection, plus specific document if available
          'databases.raceday-db.collections.race-results.documents',
        ];

        // Add entrant-specific subscriptions if we have entrant data
        if (state.entrants && state.entrants.length > 0) {
          debugLog('Adding entrant-specific subscriptions', { entrantCount: state.entrants.length });
          
          // Subscribe to individual entrant documents instead of entire collection
          state.entrants.forEach(entrant => {
            if (entrant.$id) {
              channels.push(`databases.raceday-db.collections.entrants.documents.${entrant.$id}`);
            }
          });
          
          debugLog('Entrant channels added', { totalChannels: channels.length });
        } else {
          // Fallback: Collection-level subscription with client-side filtering
          // This will be less efficient but handles race initialization
          debugLog('Using collection-level entrants subscription (fallback)');
          channels.push('databases.raceday-db.collections.entrants.documents');
        }

        // Money flow and odds history: Still need collection-level due to complex relationships
        // but we'll improve client-side filtering
        channels.push('databases.raceday-db.collections.money-flow-history.documents');
        channels.push('databases.raceday-db.collections.odds-history.documents');

        // Add specific race-results document subscription if available
        if (state.raceResultsDocumentId) {
          channels.push(`databases.raceday-db.collections.race-results.documents.${state.raceResultsDocumentId}`);
        }

        debugLog('Final subscription channels', { 
          channelCount: channels.length,
          channels,
          hasEntrantSpecificChannels: channels.some(c => c.includes('entrants.documents.') && c.split('.').length > 6),
          hasRaceResultsSpecific: !!state.raceResultsDocumentId
        });

        // Create single subscription with all channels
        unsubscribeFunction.current = client.subscribe(
          channels,
          (response: any) => {
            debugLog('Unified subscription update received', { 
              channels: response.channels, 
              events: response.events 
            });
            // Debug: Always log message receipt for latency testing
            if (process.env.NODE_ENV === 'development') {
              console.log('📡 Real-time message received:', {
                timestamp: new Date().toISOString(),
                channels: response.channels?.length || 0,
                events: response.events?.length || 0
              });
            }
            processRealtimeMessage(response);
          }
        );

        // Update connection state
        setState(prev => ({
          ...prev,
          isConnected: true,
          connectionAttempts: connectionRetries,
        }));

        connectionStartTime.current = Date.now();
        debugLog('Unified real-time subscription established', { channels: channels.length });

      } catch (error) {
        errorLog('Failed to setup unified subscription', error);
        
        setState(prev => ({
          ...prev,
          isConnected: false,
          connectionAttempts: connectionRetries + 1,
        }));

        // Retry connection with exponential backoff
        if (connectionRetries < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, connectionRetries), 30000);
          debugLog(`Retrying subscription in ${delay}ms (attempt ${connectionRetries + 1}/${maxRetries})`);
          
          reconnectTimeout.current = setTimeout(() => {
            connectionRetries++;
            setupUnifiedSubscription();
          }, delay);
        } else {
          errorLog('Max subscription retry attempts reached', { maxRetries });
        }
      }
    };

    setupUnifiedSubscription();

    // Cleanup function
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      
      if (updateThrottleTimer.current) {
        clearTimeout(updateThrottleTimer.current);
      }
      
      if (unsubscribeFunction.current) {
        try {
          unsubscribeFunction.current();
        } catch (error) {
          console.warn('Error unsubscribing from unified real-time:', error);
        }
        unsubscribeFunction.current = null;
      }
      
      setState(prev => ({
        ...prev,
        isConnected: false,
      }));

      debugLog('Unified subscription cleanup completed');
    };
  }, [raceId, state.raceResultsDocumentId, processRealtimeMessage]);

  // Manual reconnection function
  const reconnect = useCallback(() => {
    debugLog('Manual reconnection triggered');
    setState(prev => ({
      ...prev,
      isConnected: false,
      connectionAttempts: 0,
    }));
    
    // Reset connection tracking
    connectionStartTime.current = Date.now();
    
    // Clear existing subscription and reconnect will happen via useEffect
    if (unsubscribeFunction.current) {
      unsubscribeFunction.current();
      unsubscribeFunction.current = null;
    }
  }, []);

  // Clear update history
  const clearHistory = useCallback(() => {
    setState(prev => ({
      ...prev,
      totalUpdates: 0,
      lastUpdate: null,
      lastRaceUpdate: null,
      lastPoolUpdate: null,
      lastResultsUpdate: null,
      lastEntrantsUpdate: null,
    }));
    latencySamples.current = [];
    debugLog('Update history cleared');
  }, []);

  // Get connection health metrics
  const getConnectionHealth = useCallback(() => {
    const now = Date.now();
    const uptime = now - connectionStartTime.current;
    const avgLatency = latencySamples.current.length > 0 
      ? latencySamples.current.reduce((a, b) => a + b, 0) / latencySamples.current.length
      : 0;
    
    const isHealthy = state.isConnected && avgLatency < 500; // <500ms latency considered healthy
    
    // Debug logging for latency
    if (process.env.NODE_ENV === 'development') {
      console.log('🔗 Connection Health Debug:', {
        isConnected: state.isConnected,
        latencySamplesCount: latencySamples.current.length,
        latencySamples: latencySamples.current.slice(0, 3), // Show first 3 samples
        avgLatencyRaw: avgLatency,
        avgLatencyRounded: Math.round(avgLatency),
        totalUpdates: state.totalUpdates,
        uptime: Math.round(uptime / 1000), // uptime in seconds
        returnedAvgLatency: Math.round(avgLatency)
      });
    }
    
    return {
      isHealthy,
      avgLatency: Math.round(avgLatency),
      uptime,
    };
  }, [state.isConnected, state.totalUpdates]);

  return {
    ...state,
    reconnect,
    clearHistory,
    getConnectionHealth,
  };
}

// Helper function to update entrant in list with server field mapping
function updateEntrantInList(entrants: Entrant[], updatedEntrant: Partial<Entrant> & { $id: string }): Entrant[] {
  return entrants.map(entrant => {
    if (entrant.$id === updatedEntrant.$id) {
      // Map server field names to client field names for consistency
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

// Helper function to update entrant money flow data
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
      
      // Update bet percentage if available
      if (moneyFlowData.betPercentage !== undefined) {
        (updatedEntrant as any).betPercentage = moneyFlowData.betPercentage;
      }
      
      // Enhanced timeline data processing for money flow timeline integration
      if (moneyFlowData.eventTimestamp || moneyFlowData.pollingTimestamp) {
        // Initialize or update timeline data
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
        const timestamp = moneyFlowData.pollingTimestamp || moneyFlowData.eventTimestamp;
        const newDataPoint = {
          $id: moneyFlowData.$id || `flow-${Date.now()}`,
          $createdAt: timestamp,
          $updatedAt: timestamp,
          entrant: entrant.$id,
          pollingTimestamp: timestamp,
          timeToStart: moneyFlowData.timeToStart || 30,
          winPoolAmount: moneyFlowData.winPoolAmount || 0,
          placePoolAmount: moneyFlowData.placePoolAmount || 0,
          totalPoolAmount: moneyFlowData.totalPoolAmount || 0,
          poolPercentage: moneyFlowData.holdPercentage || entrant.holdPercentage || 0,
          incrementalAmount: moneyFlowData.incrementalAmount || 0,
          pollingInterval: moneyFlowData.pollingInterval || 5,
          timeInterval: moneyFlowData.timeInterval,
          intervalType: moneyFlowData.intervalType,
          incrementalWinAmount: moneyFlowData.incrementalWinAmount,
          incrementalPlaceAmount: moneyFlowData.incrementalPlaceAmount,
        };
        
        // Update timeline data with new point
        const existingPoints = updatedEntrant.moneyFlowTimeline.dataPoints || [];
        const updatedDataPoints = [...existingPoints, newDataPoint]
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

// Helper function to update entrant odds history
function updateEntrantOddsHistory(entrants: Entrant[], oddsData: any): Entrant[] {
  return entrants.map(entrant => {
    if (entrant.$id === oddsData.entrant) {
      const updatedOddsHistory = [...(entrant.oddsHistory || []), oddsData]
        .sort((a, b) => new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime())
        .slice(-50); // Keep last 50 entries for memory optimization

      // Update current odds based on the latest odds data
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