'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { client, databases, Query } from '@/lib/appwrite-client';
import { Meeting, Race } from '@/types/meetings';
import { SUPPORTED_RACE_TYPE_CODES } from '@/constants/raceTypes';
import { isSupportedCountry } from '@/constants/countries';
import { updateRaceInCache } from './useRacesForMeeting';

interface UseRealtimeMeetingsOptions {
  initialData: Meeting[];
  onError?: (error: Error) => void;
}

export function useRealtimeMeetings({ initialData, onError }: UseRealtimeMeetingsOptions) {
  const [meetings, setMeetings] = useState<Meeting[]>(initialData);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Memoize today's date to avoid recalculation on every real-time update
  const today = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  // Exponential backoff for connection retry
  const getRetryDelay = useCallback((attempts: number) => {
    return Math.min(1000 * Math.pow(2, attempts), 30000); // Max 30 seconds
  }, []);

  // Update meetings with deduplication and chronological sorting
  const updateMeetings = useCallback((updatedMeeting: Meeting) => {
    setMeetings(prev => {
      const existingIndex = prev.findIndex(m => m.$id === updatedMeeting.$id);
      let updated: Meeting[];
      
      if (existingIndex >= 0) {
        // Update existing meeting
        updated = [...prev];
        updated[existingIndex] = updatedMeeting;
      } else {
        // Add new meeting
        updated = [...prev, updatedMeeting];
      }
      
      // Sort chronologically by first race time
      return updated.sort((a, b) => {
        const timeA = a.firstRaceTime || a.$createdAt;
        const timeB = b.firstRaceTime || b.$createdAt;
        return new Date(timeA).getTime() - new Date(timeB).getTime();
      });
    });
  }, []);

  // Remove meeting from list
  const removeMeeting = useCallback((meetingId: string) => {
    setMeetings(prev => prev.filter(m => m.$id !== meetingId));
  }, []);

  // Fetch first race time for a meeting
  const fetchFirstRaceTime = useCallback(async (meetingId: string): Promise<string | null> => {
    try {
      const racesResponse = await databases.listDocuments(
        'raceday-db',
        'races',
        [
          Query.equal('meeting', meetingId),
          Query.orderAsc('startTime'),
          Query.limit(1),
        ]
      );

      const races = racesResponse.documents as unknown as Race[];
      return races[0]?.startTime || null;
    } catch (error) {
      console.error(`Error fetching first race for meeting ${meetingId}:`, error);
      return null;
    }
  }, []);

  // Setup real-time subscriptions with connection management
  const setupSubscriptions = useCallback(async () => {
    try {
      // Clean up existing subscription
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }

      const unsubscribe = client.subscribe([
        'databases.raceday-db.collections.meetings.documents',
        'databases.raceday-db.collections.races.documents'
      ], async (response) => {
        try {
          const { events, payload } = response;
          
          // Handle meeting updates
          if (events.some(e => e.includes('meetings.documents'))) {
            const meeting = payload as Meeting;
            
            // Filter for today's meetings only
            if (meeting.date === today && 
                isSupportedCountry(meeting.country) &&
                // Use category codes for consistent filtering
                SUPPORTED_RACE_TYPE_CODES.includes(meeting.category)) {
              
              // Get first race time for chronological sorting
              const firstRaceTime = await fetchFirstRaceTime(meeting.meetingId);
              const updatedMeeting = {
                ...meeting,
                firstRaceTime: firstRaceTime || meeting.$createdAt
              };

              if (events.some(e => e.includes('.create'))) {
                updateMeetings(updatedMeeting);
              } else if (events.some(e => e.includes('.update'))) {
                updateMeetings(updatedMeeting);
              } else if (events.some(e => e.includes('.delete'))) {
                removeMeeting(meeting.$id);
              }
            }
          }
          
          // Handle race updates (for first race time changes and cache updates)
          if (events.some(e => e.includes('races.documents'))) {
            const race = payload as Race;
            
            // Update race cache for expanded meetings
            if (events.some(e => e.includes('.update'))) {
              updateRaceInCache(race.meeting, race);
            }
            
            // Update meeting's first race time if this affects it
            setMeetings(prev => {
              const meetingToUpdate = prev.find(m => m.meetingId === race.meeting);
              if (meetingToUpdate) {
                // Re-fetch first race time for this meeting
                fetchFirstRaceTime(race.meeting).then(firstRaceTime => {
                  if (firstRaceTime && firstRaceTime !== meetingToUpdate.firstRaceTime) {
                    updateMeetings({
                      ...meetingToUpdate,
                      firstRaceTime
                    });
                  }
                });
              }
              return prev;
            });
          }
        } catch (error) {
          console.error('Error processing real-time update:', error);
          onError?.(error as Error);
        }
      });

      unsubscribeRef.current = unsubscribe;
      setIsConnected(true);
      setConnectionAttempts(0);
      
      // Clear any pending retry
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    } catch (error) {
      console.error('Failed to setup real-time subscriptions:', error);
      setIsConnected(false);
      onError?.(error as Error);
      
      // Retry with exponential backoff
      const attempts = connectionAttempts + 1;
      setConnectionAttempts(attempts);
      
      retryTimeoutRef.current = setTimeout(() => {
        setupSubscriptions();
      }, getRetryDelay(attempts));
    }
  }, [connectionAttempts, getRetryDelay, updateMeetings, removeMeeting, fetchFirstRaceTime, onError, today]);

  // Initialize subscriptions
  useEffect(() => {
    setupSubscriptions();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [setupSubscriptions]);

  return {
    meetings,
    isConnected,
    connectionAttempts,
    retry: setupSubscriptions
  };
}