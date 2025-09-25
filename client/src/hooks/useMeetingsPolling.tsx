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
  const [isConnected, setIsConnected] = useState(initialData.length > 0);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [isInitialDataReady, setIsInitialDataReady] = useState(initialData.length > 0);
  const previousMeetingsRef = useRef<Meeting[]>(initialData);
  const onRaceUpdateRef = useRef<((event: RaceUpdateEvent) => void) | undefined>(onRaceUpdate);
  const onErrorRef = useRef<((error: Error) => void) | undefined>(onError);
  const isFetchingRef = useRef(false);

  const fetchMeetings = useCallback(async (): Promise<void> => {
    if (isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
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
      setIsInitialDataReady(newMeetings.length > 0);

      loggerRef.current.debug(`Fetched ${newMeetings.length} meetings from API`);

    } catch (error) {
      loggerRef.current.error('Failed to fetch meetings data', error);
      setIsConnected(false);
      setConnectionAttempts(prev => prev + 1);
      onErrorRef.current?.(error as Error);
    }
    finally {
      isFetchingRef.current = false;
    }
  }, []);

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

  // Keep local state in sync with updated initial data from the server
  useEffect(() => {
    previousMeetingsRef.current = initialData;
    setMeetings(initialData);
  }, [initialData]);

  // Perform a single fetch for the latest meetings data
  useEffect(() => {
    void fetchMeetings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual retry function
  const retry = useCallback(() => {
    void fetchMeetings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    meetings,
    isConnected,
    connectionState: isConnected ? 'connected' : 'disconnected',
    connectionAttempts,
    isInitialDataReady,
    retry
  };
}