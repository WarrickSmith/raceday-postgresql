'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Race } from '@/types/meetings';
import { fetchRacesForMeeting, validateRaceData } from '@/services/races';

interface UseRacesForMeetingOptions {
  meeting_id: string;
  enabled?: boolean;
  onError?: (error: Error) => void;
}

interface UseRacesForMeetingResult {
  races: Race[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isConnected: boolean;
}

// Cache to store races per meeting to avoid re-fetching on expand/collapse
const racesCache = new Map<string, { races: Race[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Event emitter for cache updates
class CacheEventEmitter extends EventTarget {
  emit(meeting_id: string, races: Race[]) {
    this.dispatchEvent(new CustomEvent('cache-update', { detail: { meeting_id, races } }));
  }
}
const cacheEmitter = new CacheEventEmitter();

export function useRacesForMeeting({ 
  meeting_id, 
  enabled = true,
  onError 
}: UseRacesForMeetingOptions): UseRacesForMeetingResult {
  const [races, setRaces] = useState<Race[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchAttemptRef = useRef(0);
  const pendingRequestRef = useRef<Promise<void> | null>(null);
  const pendingForMeetingIdRef = useRef<string | null>(null);
  const pendingRequestMarkerRef = useRef<symbol | null>(null);

  // Check cache for existing races
  const getCachedRaces = useCallback((meeting_id: string): Race[] | null => {
    const cached = racesCache.get(meeting_id);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.races;
    }
    return null;
  }, []);

  // Cache races for future use
  const setCachedRaces = useCallback((meeting_id: string, races: Race[]) => {
    racesCache.set(meeting_id, { races, timestamp: Date.now() });
  }, []);

  // Fetch races with error handling and caching
  const fetchRaces = useCallback(async (meeting_id: string, retryAttempt = 0): Promise<void> => {
    // If the same meeting_id request is already in-flight, reuse it
    if (pendingRequestRef.current && pendingForMeetingIdRef.current === meeting_id) {
      return pendingRequestRef.current
    }

    // Cancel any existing request for previous meeting_id
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Check cache first
    const cachedRaces = getCachedRaces(meeting_id);
    if (cachedRaces) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 Hook: Using cached races for meeting_id:', meeting_id, 'count:', cachedRaces.length);
      }
      setRaces(cachedRaces);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    // Create new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const requestMarker = Symbol('races-request');
    pendingRequestMarkerRef.current = requestMarker;

    const requestPromise = (async () => {
      try {
        const fetchedRaces = await fetchRacesForMeeting(meeting_id);
      
        // Check if request was aborted
        if (abortController.signal.aborted) {
          return;
        }

        // Validate race data
        const validRaces = fetchedRaces.filter(race => {
          const isValid = validateRaceData(race);
          if (!isValid && process.env.NODE_ENV === 'development') {
            console.warn('Invalid race data:', race);
          }
          return isValid;
        });

        // Sort races by race number
        const sortedRaces = validRaces.sort((a, b) => a.race_number - b.race_number);

        setRaces(sortedRaces);
        setCachedRaces(meeting_id, sortedRaces);
        setIsLoading(false);
        setError(null);

        if (process.env.NODE_ENV === 'development') {
          console.log('✅ Hook: Successfully fetched and set races for meeting_id:', meeting_id, 'count:', sortedRaces.length);
        }
      } catch (err) {
        // Don't update state if request was aborted
        if (abortController.signal.aborted) {
          return;
        }

        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch races';
        
        // Retry logic with exponential backoff
        if (retryAttempt < 2) {
          const delay = Math.min(1000 * Math.pow(2, retryAttempt), 5000);
          setTimeout(() => {
            if (!abortController.signal.aborted) {
              void fetchRaces(meeting_id, retryAttempt + 1);
            }
          }, delay);
          return;
        }

        setError(errorMessage);
        setIsLoading(false);
        
        if (onError) {
          onError(err instanceof Error ? err : new Error(errorMessage));
        }
      } finally {
        // Clear pending pointer if it matches this request
        if (pendingRequestMarkerRef.current === requestMarker) {
          pendingRequestRef.current = null;
          pendingForMeetingIdRef.current = null;
          pendingRequestMarkerRef.current = null;
        }
      }
    })()

    pendingRequestRef.current = requestPromise
    pendingForMeetingIdRef.current = meeting_id
    return requestPromise
  }, [getCachedRaces, setCachedRaces, onError]);

  // Setup cache event listening for polling-based updates from meetings data
  const setupCacheEventListening = useCallback(() => {
    if (!enabled || !meeting_id) return;

    const handleCacheUpdate = (event: CustomEvent<{ meeting_id: string; races: Race[] }>) => {
      const { meeting_id: updatedMeetingId, races: updatedRaces } = event.detail;
      
      // Only update if this is for our meeting and we have races loaded
      if (updatedMeetingId === meeting_id && races.length > 0) {
        console.log('🔄 Updating races from polling cache update for meeting:', meeting_id);
        setRaces(updatedRaces);
        setIsConnected(true);
      }
    };

    cacheEmitter.addEventListener('cache-update', handleCacheUpdate as EventListener);
    
    return () => {
      cacheEmitter.removeEventListener('cache-update', handleCacheUpdate as EventListener);
    };
  }, [enabled, meeting_id, races.length]);

  // Refetch function for manual refresh
  const refetch = useCallback(async () => {
    if (!enabled || !meeting_id) return;
    
    // Clear cache for this meeting to force fresh fetch
    racesCache.delete(meeting_id);
    await fetchRaces(meeting_id);
  }, [enabled, meeting_id, fetchRaces]);

  // Effect to fetch races when meeting_id changes or component mounts
  useEffect(() => {
    if (!enabled || !meeting_id) {
      setRaces([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Only add debugging in development
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Hook: Starting race fetch for meeting_id:', meeting_id, 'attempt:', fetchAttemptRef.current + 1);
    }

    fetchAttemptRef.current += 1;
    const currentAttempt = fetchAttemptRef.current;

    // Add a small delay to prevent rapid successive calls during initial load
    const timeoutId = setTimeout(() => {
      // Only proceed if this is still the latest request
      if (currentAttempt === fetchAttemptRef.current) {
        void fetchRaces(meeting_id).catch(() => {
          // Error handling is done in fetchRaces
        });
      } else if (process.env.NODE_ENV === 'development') {
        console.log('🔍 Hook: Skipping race fetch for meeting_id:', meeting_id, 'due to newer request');
      }
    }, 10); // Small delay to allow rapid state changes to settle

    // Cleanup function
    return () => {
      clearTimeout(timeoutId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, meeting_id, fetchRaces]);

  // Setup cache event listening for polling-based updates after races are loaded
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    if (races.length > 0) {
      cleanup = setupCacheEventListening();
      setIsConnected(true); // Connected through meetings polling system
    }
    
    return () => {
      if (cleanup) cleanup();
      setIsConnected(false);
    };
  }, [races.length, setupCacheEventListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    races,
    isLoading,
    error,
    refetch,
    isConnected,
  };
}

// Update races in existing cache when polling updates occur
export function updateRaceInCache(meeting_id: string, updatedRace: Race): void {
  const cached = racesCache.get(meeting_id);
  if (cached) {
    const updatedRaces = cached.races.map(race =>
      race.race_id === updatedRace.race_id ? updatedRace : race
    );
    racesCache.set(meeting_id, { 
      races: updatedRaces, 
      timestamp: cached.timestamp 
    });
    
    // Emit event to notify active useRacesForMeeting hooks
    cacheEmitter.emit(meeting_id, updatedRaces);
  }
}

// Clear cache for a specific meeting
export function clearRaceCache(meeting_id?: string): void {
  if (meeting_id) {
    racesCache.delete(meeting_id);
  } else {
    racesCache.clear();
  }
}
