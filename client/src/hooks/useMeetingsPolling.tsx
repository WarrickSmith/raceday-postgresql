'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ConnectionState } from '@/state/connectionState';
import { setConnectionState as setGlobalConnectionState } from '@/state/connectionState';
import { Meeting } from '@/types/meetings';
import { useLogger } from '@/utils/logging';

const AUTO_RETRY_INTERVAL_MS = 60_000;

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

export type { ConnectionState } from '@/state/connectionState';

export function useMeetingsPolling({ initialData, onError, onRaceUpdate }: UseMeetingsPollingOptions) {
  const logger = useLogger('useMeetingsPolling');
  const loggerRef = useRef(logger);
  const [meetings, setMeetings] = useState<Meeting[]>(initialData);
  const initialConnectionState: ConnectionState = initialData.length > 0 ? 'connected' : 'connecting';
  const [connectionState, setLocalConnectionState] = useState<ConnectionState>(() => {
    setGlobalConnectionState(initialConnectionState);
    return initialConnectionState;
  });
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [isInitialDataReady, setIsInitialDataReady] = useState(initialData.length > 0);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const previousMeetingsRef = useRef<Meeting[]>(initialData);
  const onRaceUpdateRef = useRef<((event: RaceUpdateEvent) => void) | undefined>(onRaceUpdate);
  const onErrorRef = useRef<((error: Error) => void) | undefined>(onError);
  const isFetchingRef = useRef(false);
  const connectionStateRef = useRef<ConnectionState>(initialConnectionState);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateConnectionState = useCallback((state: ConnectionState) => {
    connectionStateRef.current = state;
    setLocalConnectionState(state);
    setGlobalConnectionState(state);
  }, []);

  const clearRetryTimers = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    if (autoRetryTimeoutRef.current) {
      clearTimeout(autoRetryTimeoutRef.current);
      autoRetryTimeoutRef.current = null;
    }
  }, []);

  const handleConnectionSuccess = useCallback(() => {
    updateConnectionState('connected');
    setConnectionAttempts(0);
    setRetryCountdown(null);
  }, [updateConnectionState]);

  const handleConnectionFailure = useCallback(() => {
    updateConnectionState('disconnected');
    setConnectionAttempts(prev => prev + 1);
  }, [updateConnectionState]);

  const fetchMeetings = useCallback(async (): Promise<void> => {
    if (isFetchingRef.current) {
      return;
    }

    if (connectionStateRef.current !== 'connected') {
      loggerRef.current.info('Skipping meetings fetch while connection is not established');
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
      handleConnectionSuccess(); // This calls setGlobalConnectionState('connected')
      setIsInitialDataReady(true);

      loggerRef.current.debug(`Fetched ${newMeetings.length} meetings from API`);

    } catch (error) {
      loggerRef.current.error('Failed to fetch meetings data', error);
      handleConnectionFailure();
      onErrorRef.current?.(error as Error);
    } finally {
      isFetchingRef.current = false;
    }
  }, [handleConnectionFailure, handleConnectionSuccess]);

  const checkConnectionHealth = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });

      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
      }

      const body: { status: 'healthy' | 'unconfigured' | 'unhealthy' } = await response.json();

      if (body.status === 'healthy') {
        handleConnectionSuccess();
        return true;
      }

      loggerRef.current.debug('Health check returned non-healthy status', body);
      handleConnectionFailure();
      return false;
    } catch (error) {
      // Use debug level for expected connection failures (not an error condition)
      loggerRef.current.debug('Connection health check failed', error);
      handleConnectionFailure();
      return false;
    }
  }, [handleConnectionFailure, handleConnectionSuccess]);

  const attemptReconnect = useCallback(async (): Promise<boolean> => {
    updateConnectionState('connecting');

    const isHealthy = await checkConnectionHealth();

    if (isHealthy) {
      await fetchMeetings();
      return true;
    }

    return false;
  }, [checkConnectionHealth, fetchMeetings, updateConnectionState]);

  const refreshMeetings = useCallback(async (): Promise<void> => {
    if (connectionStateRef.current !== 'connected') {
      await attemptReconnect();
      return;
    }

    await fetchMeetings();
  }, [attemptReconnect, fetchMeetings]);

  const retry = useCallback(() => {
    void attemptReconnect();
  }, [attemptReconnect]);

  // Update refs
  useEffect(() => {
    loggerRef.current = logger;
    onRaceUpdateRef.current = onRaceUpdate;
    onErrorRef.current = onError;
  }, [logger, onRaceUpdate, onError]);

  // Mark initial data as ready
  useEffect(() => {
    if (initialData.length > 0) {
      setIsInitialDataReady(true);
    }
  }, [initialData.length]);

  // Keep local state in sync with updated initial data from the server
  useEffect(() => {
    previousMeetingsRef.current = initialData;
    setMeetings(initialData);
  }, [initialData]);

  useEffect(() => {
    void attemptReconnect();
  }, [attemptReconnect]);

  useEffect(() => {
    if (connectionState !== 'disconnected') {
      setRetryCountdown(null);
      clearRetryTimers();
      return () => {
        clearRetryTimers();
      };
    }

    setRetryCountdown(Math.ceil(AUTO_RETRY_INTERVAL_MS / 1000));

    countdownIntervalRef.current = setInterval(() => {
      setRetryCountdown(prev => {
        if (prev === null) {
          return prev;
        }

        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    autoRetryTimeoutRef.current = setTimeout(() => {
      void attemptReconnect();
    }, AUTO_RETRY_INTERVAL_MS);

    return () => {
      clearRetryTimers();
    };
  }, [attemptReconnect, clearRetryTimers, connectionState]);

  useEffect(() => {
    return () => {
      clearRetryTimers();
    };
  }, [clearRetryTimers]);

  return {
    meetings,
    isConnected: connectionState === 'connected',
    connectionState,
    connectionAttempts,
    isInitialDataReady,
    retry,
    retryConnection: attemptReconnect,
    refreshMeetings,
    retryCountdown,
  };
}