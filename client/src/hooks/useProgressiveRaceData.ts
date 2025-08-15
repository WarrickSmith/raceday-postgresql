'use client';

import { useState, useEffect } from 'react';
import { raceCache, entrantsCache, navigationCache } from '@/lib/cache';
import { Race, Meeting, Entrant, RaceNavigationData } from '@/types/meetings';

interface RaceContextData {
  race: Race;
  meeting: Meeting;
  entrants: Entrant[];
  navigationData: RaceNavigationData;
  dataFreshness: {
    lastUpdated: string;
    entrantsDataAge: number;
    oddsHistoryCount: number;
    moneyFlowHistoryCount: number;
  };
}

interface ProgressiveLoadingState {
  data: RaceContextData | null;
  loading: {
    basic: boolean;
    entrants: boolean;
    navigation: boolean;
    historical: boolean;
  };
  error: string | null;
  loadingStage: 'basic' | 'entrants' | 'navigation' | 'historical' | 'complete';
}

export function useProgressiveRaceData(raceId: string) {
  const [state, setState] = useState<ProgressiveLoadingState>({
    data: null,
    loading: {
      basic: true,
      entrants: false,
      navigation: false,
      historical: false,
    },
    error: null,
    loadingStage: 'basic',
  });

  useEffect(() => {
    if (!raceId) return;

    let isCancelled = false;

    const loadProgressiveData = async () => {
      try {
        // Stage 1: Load basic race data (target: 50ms)
        setState(prev => ({ ...prev, loading: { ...prev.loading, basic: true }, loadingStage: 'basic' }));
        
        const basicData = await raceCache.get(
          `race:${raceId}:basic`,
          () => fetch(`/api/race/${raceId}/basic`).then(r => {
            if (!r.ok) {
              if (r.status === 404) throw new Error('Race not found');
              throw new Error(`Basic API error: ${r.status}`);
            }
            return r.json();
          }),
          15000 // 15 second cache for live data
        );

        if (isCancelled) return;
        if (!basicData || !basicData.race) {
          throw new Error('Race not found');
        }

        setState(prev => ({
          ...prev,
          data: {
            race: basicData.race,
            meeting: basicData.meeting,
            entrants: [], // Empty initially
            navigationData: {
              previousRace: null,
              nextRace: null,
              nextScheduledRace: null,
            },
            dataFreshness: {
              lastUpdated: new Date().toISOString(),
              entrantsDataAge: 0,
              oddsHistoryCount: 0,
              moneyFlowHistoryCount: 0,
            },
          },
          loading: { ...prev.loading, basic: false, entrants: true },
          loadingStage: 'entrants',
        }));

        // Stage 2: Load entrants data (target: 100ms after basic)
        try {
          const entrantsData = await entrantsCache.get(
            `entrants:${raceId}`,
            () => fetch(`/api/race/${raceId}/entrants`).then(r => {
              if (!r.ok) throw new Error(`Entrants API error: ${r.status}`);
              return r.json();
            }),
            60000 // 60 second cache for less volatile data
          );

          if (isCancelled) return;

          setState(prev => ({
            ...prev,
            data: prev.data ? {
              ...prev.data,
              entrants: entrantsData.entrants || [],
              dataFreshness: {
                ...prev.data.dataFreshness,
                entrantsDataAge: entrantsData.dataFreshness?.entrantsDataAge || 0,
              },
            } : prev.data,
            loading: { ...prev.loading, entrants: false, navigation: true },
            loadingStage: 'navigation',
          }));
        } catch (entrantsError) {
          console.warn('Entrants data loading failed, continuing with empty entrants:', entrantsError);
          // Fallback: Continue with empty entrants list
          if (!isCancelled) {
            setState(prev => ({
              ...prev,
              data: prev.data ? {
                ...prev.data,
                entrants: [], // Empty fallback
              } : prev.data,
              loading: { ...prev.loading, entrants: false, navigation: true },
              loadingStage: 'navigation',
            }));
          }
        }

        // Stage 3: Load navigation data (target: 150ms after basic)
        try {
          const navigationData = await navigationCache.get(
            `navigation:${raceId}`,
            () => fetch(`/api/race/${raceId}/navigation`).then(r => {
              if (!r.ok) throw new Error(`Navigation API error: ${r.status}`);
              return r.json();
            }),
            300000 // 5 minute cache for race relationships
          );

          if (isCancelled) return;

          setState(prev => ({
            ...prev,
            data: prev.data ? {
              ...prev.data,
              navigationData: navigationData.navigationData || {
                previousRace: null,
                nextRace: null,
                nextScheduledRace: null,
              },
            } : prev.data,
            loading: { ...prev.loading, navigation: false, historical: true },
            loadingStage: 'historical',
          }));
        } catch (navigationError) {
          console.warn('Navigation data loading failed, using empty navigation:', navigationError);
          // Fallback: Continue with empty navigation
          if (!isCancelled) {
            setState(prev => ({
              ...prev,
              data: prev.data ? {
                ...prev.data,
                navigationData: {
                  previousRace: null,
                  nextRace: null,
                  nextScheduledRace: null,
                },
              } : prev.data,
              loading: { ...prev.loading, navigation: false, historical: true },
              loadingStage: 'historical',
            }));
          }
        }

        // Stage 4: Load historical data in background (non-blocking)
        fetch(`/api/race/${raceId}/historical`)
          .then(r => r.json())
          .then(historicalData => {
            if (isCancelled) return;
            
            setState(prev => ({
              ...prev,
              data: prev.data ? {
                ...prev.data,
                entrants: prev.data.entrants.map(entrant => ({
                  ...entrant,
                  oddsHistory: historicalData.oddsHistory?.[entrant.$id] || entrant.oddsHistory || [],
                  ...historicalData.moneyFlow?.[entrant.$id] || {},
                })),
                dataFreshness: {
                  ...prev.data.dataFreshness,
                  oddsHistoryCount: historicalData.dataFreshness?.oddsHistoryCount || 0,
                  moneyFlowHistoryCount: historicalData.dataFreshness?.moneyFlowHistoryCount || 0,
                },
              } : prev.data,
              loading: { ...prev.loading, historical: false },
              loadingStage: 'complete',
            }));
          })
          .catch(error => {
            console.warn('Historical data loading failed (non-critical):', error);
            setState(prev => ({
              ...prev,
              loading: { ...prev.loading, historical: false },
              loadingStage: 'complete',
            }));
          });

      } catch (error) {
        if (isCancelled) return;
        
        console.error('Progressive race data loading failed:', error);
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to load race data',
          loading: {
            basic: false,
            entrants: false,
            navigation: false,
            historical: false,
          },
        }));
      }
    };

    loadProgressiveData();

    return () => {
      isCancelled = true;
    };
  }, [raceId]);

  return state;
}