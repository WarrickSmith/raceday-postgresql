'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Meeting } from '@/types/meetings';
import { useLogger } from '@/utils/logging';

export interface RaceUpdateEvent {
  meetingId: string;
  eventType: 'create' | 'update';
  meetingName: string;
  firstRaceTime?: string;
  timestamp: number;
}

interface UseMeetingsPollingOptions {
  initialData: Meeting[];
  onError?: (error: Error) => void;
  onRaceUpdate?: (event: RaceUpdateEvent) => void;
}

interface MeetingsApiResponse {
  meetings: Meeting[];
  timestamp: string;
}

export function useMeetingsPolling({ initialData, onError, onRaceUpdate }: UseMeetingsPollingOptions) {
  const logger = useLogger('useMeetingsPolling');
  const loggerRef = useRef(logger);
  const [meetings, setMeetings] = useState<Meeting[]>(initialData);
  const [isConnected, setIsConnected] = useState(true);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [isInitialDataReady, setIsInitialDataReady] = useState(initialData.length > 0);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousMeetingsRef = useRef<Meeting[]>(initialData);
  const onRaceUpdateRef = useRef<((event: RaceUpdateEvent) => void) | undefined>(onRaceUpdate);
  const onErrorRef = useRef<((error: Error) => void) | undefined>(onError);

  // Get intelligent polling interval based on race timing
  const getPollInterval = (currentMeetings: Meeting[]): number => {
    if (currentMeetings.length === 0) {
      return 60000; // 1 minute when no meetings
    }

    const now = new Date();
    let shortestTimeToRace = Infinity;

    for (const meeting of currentMeetings) {
      if (meeting.firstRaceTime) {
        const raceTime = new Date(meeting.firstRaceTime);
        const minutesUntilRace = (raceTime.getTime() - now.getTime()) / (1000 * 60);

        if (minutesUntilRace > 0) {
          shortestTimeToRace = Math.min(shortestTimeToRace, minutesUntilRace);
        }
      }
    }

    // Use intelligent intervals based on proximity to next race
    if (shortestTimeToRace <= 5) {
      return 30000; // 30 seconds when race is within 5 minutes
    } else if (shortestTimeToRace <= 15) {
      return 60000; // 1 minute when race is within 15 minutes
    } else {
      return 120000; // 2 minutes otherwise
    }
  };

  // Self-contained polling function
  const pollMeetings = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/meetings');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: MeetingsApiResponse = await response.json();
      const newMeetings = data.meetings;

      // Compare with previous data to detect changes
      const prevMeetings = previousMeetingsRef.current;
      const prevMeetingMap = new Map(prevMeetings.map(m => [m.meetingId, m]));

      // Detect new or updated meetings
      for (const meeting of newMeetings) {
        const prevMeeting = prevMeetingMap.get(meeting.meetingId);

        if (!prevMeeting) {
          // New meeting
          onRaceUpdateRef.current?.({
            meetingId: meeting.meetingId,
            eventType: 'create',
            meetingName: meeting.meetingName,
            firstRaceTime: meeting.firstRaceTime,
            timestamp: Date.now(),
          });
        } else if (
          prevMeeting.firstRaceTime !== meeting.firstRaceTime ||
          prevMeeting.meetingName !== meeting.meetingName ||
          prevMeeting.$updatedAt !== meeting.$updatedAt
        ) {
          // Updated meeting
          onRaceUpdateRef.current?.({
            meetingId: meeting.meetingId,
            eventType: 'update',
            meetingName: meeting.meetingName,
            firstRaceTime: meeting.firstRaceTime,
            timestamp: Date.now(),
          });
        }
      }

      setMeetings(newMeetings);
      previousMeetingsRef.current = newMeetings;
      setIsConnected(true);
      setConnectionAttempts(0);

      loggerRef.current.debug(`Fetched ${newMeetings.length} meetings from API`);

      // Schedule next poll based on current data
      const interval = getPollInterval(newMeetings);
      loggerRef.current.debug(`Scheduling next poll in ${interval}ms`);

      pollTimeoutRef.current = setTimeout(() => {
        void pollMeetings();
      }, interval);

    } catch (error) {
      loggerRef.current.error('Failed to fetch meetings data', error);
      setIsConnected(false);
      setConnectionAttempts(prev => prev + 1);
      onErrorRef.current?.(error as Error);

      // Retry with backoff on error
      const retryDelay = Math.min(5000 * Math.pow(2, connectionAttempts), 30000);
      loggerRef.current.debug(`Retrying poll in ${retryDelay}ms due to error`);

      pollTimeoutRef.current = setTimeout(() => {
        void pollMeetings();
      }, retryDelay);
    }
  }, [connectionAttempts]); // Only depend on connectionAttempts for retry logic

  // Update refs
  useEffect(() => {
    loggerRef.current = logger;
    onRaceUpdateRef.current = onRaceUpdate;
    onErrorRef.current = onError;
  }, [logger, onRaceUpdate, onError]);

  // Mark initial data as ready
  useEffect(() => {
    setIsInitialDataReady(initialData.length > 0);
  }, [initialData.length]);

  // Start polling once initial data is ready
  useEffect(() => {
    if (!isInitialDataReady) {
      loggerRef.current.debug('Waiting for initial meetings data to be ready before polling');
      return;
    }

    loggerRef.current.info('Initial meetings data ready, starting polling');

    // Start polling immediately
    void pollMeetings();

    // Cleanup on unmount or when effect re-runs
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
        loggerRef.current.debug('Polling cleanup: cleared timeout');
      }
    };
  }, [isInitialDataReady, pollMeetings]); // Include pollMeetings dependency

  // Manual retry function
  const retry = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    void pollMeetings();
  }, [pollMeetings]);

  return {
    meetings,
    isConnected,
    connectionState: isConnected ? 'connected' : 'disconnected',
    connectionAttempts,
    isInitialDataReady,
    retry
  };
}