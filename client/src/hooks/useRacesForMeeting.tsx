'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Race } from '@/types/meetings';
import { fetchRacesForMeeting, validateRaceData } from '@/services/races';

interface UseRacesForMeetingOptions {
  meetingId: string;
  enabled?: boolean;
  onError?: (error: Error) => void;
}

interface UseRacesForMeetingResult {
  races: Race[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Cache to store races per meeting to avoid re-fetching on expand/collapse
const racesCache = new Map<string, { races: Race[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useRacesForMeeting({ 
  meetingId, 
  enabled = true,
  onError 
}: UseRacesForMeetingOptions): UseRacesForMeetingResult {
  const [races, setRaces] = useState<Race[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchAttemptRef = useRef(0);

  // Check cache for existing races
  const getCachedRaces = useCallback((meetingId: string): Race[] | null => {
    const cached = racesCache.get(meetingId);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.races;
    }
    return null;
  }, []);

  // Cache races for future use
  const setCachedRaces = useCallback((meetingId: string, races: Race[]) => {
    racesCache.set(meetingId, { races, timestamp: Date.now() });
  }, []);

  // Fetch races with error handling and caching
  const fetchRaces = useCallback(async (meetingId: string, retryAttempt = 0): Promise<void> => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Check cache first
    const cachedRaces = getCachedRaces(meetingId);
    if (cachedRaces) {
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

    try {
      const fetchedRaces = await fetchRacesForMeeting(meetingId);
      
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
      const sortedRaces = validRaces.sort((a, b) => a.raceNumber - b.raceNumber);

      setRaces(sortedRaces);
      setCachedRaces(meetingId, sortedRaces);
      setIsLoading(false);
      setError(null);
      
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
            fetchRaces(meetingId, retryAttempt + 1);
          }
        }, delay);
        return;
      }

      setError(errorMessage);
      setIsLoading(false);
      
      if (onError) {
        onError(err instanceof Error ? err : new Error(errorMessage));
      }
    }
  }, [getCachedRaces, setCachedRaces, onError]);

  // Refetch function for manual refresh
  const refetch = useCallback(async () => {
    if (!enabled || !meetingId) return;
    
    // Clear cache for this meeting to force fresh fetch
    racesCache.delete(meetingId);
    await fetchRaces(meetingId);
  }, [enabled, meetingId, fetchRaces]);

  // Effect to fetch races when meetingId changes or component mounts
  useEffect(() => {
    if (!enabled || !meetingId) {
      setRaces([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Only add debugging in development
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Hook: Starting race fetch for meetingId:', meetingId);
    }
    
    fetchAttemptRef.current += 1;
    
    fetchRaces(meetingId).catch(() => {
      // Error handling is done in fetchRaces
    });

    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, meetingId, fetchRaces]);

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
  };
}

// Update races in existing cache when real-time updates occur
export function updateRaceInCache(meetingId: string, updatedRace: Race): void {
  const cached = racesCache.get(meetingId);
  if (cached) {
    const updatedRaces = cached.races.map(race => 
      race.$id === updatedRace.$id ? updatedRace : race
    );
    racesCache.set(meetingId, { 
      races: updatedRaces, 
      timestamp: cached.timestamp 
    });
  }
}

// Clear cache for a specific meeting
export function clearRaceCache(meetingId?: string): void {
  if (meetingId) {
    racesCache.delete(meetingId);
  } else {
    racesCache.clear();
  }
}