'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { client, databases, Query } from '@/lib/appwrite-client';
import { Meeting, Race } from '@/types/meetings';
import { SUPPORTED_RACE_TYPE_CODES } from '@/constants/raceTypes';
import { isSupportedCountry } from '@/constants/countries';
import { useLogger } from '@/utils/logging';
import {
  NAVIGATION_DRAIN_DELAY,
  useSubscriptionCleanup,
} from '@/contexts/SubscriptionCleanupContext';

// Connection state machine for graceful transitions
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting'

const MAX_MEETING_SUBSCRIPTIONS = 60;

export interface RaceUpdateEvent {
  meetingId: string;
  eventType: 'create' | 'update';
  meetingName: string;
  firstRaceTime?: string;
  timestamp: number;
}

interface UseRealtimeMeetingsOptions {
  initialData: Meeting[];
  onError?: (error: Error) => void;
  onRaceUpdate?: (event: RaceUpdateEvent) => void;
}

export function useRealtimeMeetings({ initialData, onError, onRaceUpdate }: UseRealtimeMeetingsOptions) {
  const logger = useLogger('useRealtimeMeetings');
  const loggerRef = useRef(logger);
  const [meetings, setMeetings] = useState<Meeting[]>(initialData);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isConnected, setIsConnected] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [isInitialDataReady, setIsInitialDataReady] = useState(initialData.length > 0);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasWarnedChannelLimitRef = useRef(false);
  const meetingsRef = useRef(meetings);
  const onRaceUpdateRef = useRef(onRaceUpdate);
  const { signal: cleanupSignal, isCleanupInProgress } = useSubscriptionCleanup();
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const lastCleanupSignalRef = useRef(0);
  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { channels: meetingChannels, trimmedCount, totalMeetings } = useMemo(() => {
    if (meetings.length === 0) {
      return { channels: [] as string[], trimmedCount: 0, totalMeetings: 0 };
    }

    const limitedMeetings = meetings.slice(0, MAX_MEETING_SUBSCRIPTIONS);
    const ids = new Set<string>();
    const channels = limitedMeetings.reduce<string[]>((acc, meeting) => {
      const documentId = meeting.$id || meeting.meetingId;
      if (documentId && !ids.has(documentId)) {
        ids.add(documentId);
        acc.push(`databases.raceday-db.collections.meetings.documents.${documentId}`);
      }
      return acc;
    }, []);

    const trimmed = meetings.length > limitedMeetings.length
      ? meetings.length - limitedMeetings.length
      : 0;

    return {
      channels,
      trimmedCount: trimmed,
      totalMeetings: meetings.length
    };
  }, [meetings]);

  const meetingChannelsRef = useRef<string[]>(meetingChannels);
  const meetingChannelsKey = useMemo(() => meetingChannels.join('|'), [meetingChannels]);

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
      loggerRef.current.error(`Error fetching first race for meeting ${meetingId}`, error);
      return null;
    }
  }, []);

  // Setup real-time subscriptions with connection management
  const setupSubscriptions = useCallback(async () => {
    if (isCleaningUp || isCleanupInProgress) {
      loggerRef.current.debug('Skipping subscription setup during coordinated cleanup');
      return;
    }

    const connectionDrainDelay = NAVIGATION_DRAIN_DELAY; // Coordinated drain period

    try {
      // Set connecting state
      setConnectionState('connecting');
      setIsConnected(false);

      const channels = meetingChannelsRef.current;

      if (channels.length === 0) {
        loggerRef.current.warn('No meeting IDs available for meeting-specific subscription');
        setConnectionState('disconnected');
        setIsConnected(false);
        return;
      }

      const continueSetup = async () => {
        const unsubscribe = client.subscribe(channels, async (response) => {
          try {
            const { events, payload } = response;

            // Handle meeting updates
            if (events.some(e => e.includes('meetings.documents'))) {
              const meeting = payload as Meeting;

              // Filter for today's meetings only
              if (
                meeting.date === today &&
                isSupportedCountry(meeting.country) &&
                SUPPORTED_RACE_TYPE_CODES.includes(meeting.category)
              ) {
                // Prefer existing first race time data before hitting database
                let firstRaceTime = meeting.firstRaceTime;
                if (!firstRaceTime) {
                  const existingMeeting = meetingsRef.current.find(
                    (item) => item.meetingId === meeting.meetingId
                  );
                  firstRaceTime = existingMeeting?.firstRaceTime;
                }

                if (!firstRaceTime) {
                  firstRaceTime = await fetchFirstRaceTime(meeting.meetingId) || undefined;
                }

                const updatedMeeting = {
                  ...meeting,
                  firstRaceTime: firstRaceTime || meeting.$createdAt
                };

                let eventType: RaceUpdateEvent['eventType'] | null = null;

                if (events.some(e => e.includes('.create'))) {
                  updateMeetings(updatedMeeting);
                  eventType = 'create';
                } else if (events.some(e => e.includes('.update'))) {
                  updateMeetings(updatedMeeting);
                  eventType = 'update';
                } else if (events.some(e => e.includes('.delete'))) {
                  removeMeeting(meeting.$id);
                }

                if (eventType) {
                  onRaceUpdateRef.current?.({
                    meetingId: updatedMeeting.meetingId,
                    eventType,
                    meetingName: updatedMeeting.meetingName,
                    firstRaceTime: updatedMeeting.firstRaceTime,
                    timestamp: Date.now(),
                  });
                }
              }
            }
          } catch (error) {
            loggerRef.current.error('Error processing real-time update', error);
            onError?.(error as Error);
          }
        });

        unsubscribeRef.current = unsubscribe;
        setConnectionState('connected');
        setIsConnected(true);
        setConnectionAttempts(0);
        
        // Clear any pending retry
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
      };

      // Clear any existing subscription with drain period
      if (unsubscribeRef.current) {
        setConnectionState('disconnecting');
        
        unsubscribeRef.current();
        unsubscribeRef.current = null;
        
        // Allow connection drain period before new connection
        setTimeout(() => {
          continueSetup();
        }, connectionDrainDelay);
      } else {
        continueSetup();
      }
    } catch (error) {
      loggerRef.current.error('Failed to setup real-time subscriptions', error);
      setConnectionState('disconnected');
      setIsConnected(false);
      onError?.(error as Error);
      
      // Retry with exponential backoff
      const attempts = connectionAttempts + 1;
      setConnectionAttempts(attempts);
      
      retryTimeoutRef.current = setTimeout(() => {
        setupSubscriptions();
      }, getRetryDelay(attempts));
    }
  }, [
    connectionAttempts,
    fetchFirstRaceTime,
    getRetryDelay,
    isCleanupInProgress,
    isCleaningUp,
    onError,
    removeMeeting,
    today,
    updateMeetings,
  ]);

  // Effect to mark initial data as ready
  useEffect(() => {
    setIsInitialDataReady(initialData.length > 0);
  }, [initialData.length]);

  useEffect(() => {
    loggerRef.current = logger;
  }, [logger]);

  useEffect(() => {
    meetingChannelsRef.current = meetingChannels;
  }, [meetingChannels]);

  useEffect(() => {
    meetingsRef.current = meetings;
  }, [meetings]);

  useEffect(() => {
    onRaceUpdateRef.current = onRaceUpdate;
  }, [onRaceUpdate]);

  useEffect(() => {
    if (trimmedCount > 0) {
      if (!hasWarnedChannelLimitRef.current) {
        loggerRef.current.warn('Trimming meeting realtime subscriptions to stay under channel limit', {
          totalMeetings,
          subscribed: meetingChannels.length,
          trimmed: trimmedCount,
          maxSubscriptions: MAX_MEETING_SUBSCRIPTIONS
        });
        hasWarnedChannelLimitRef.current = true;
      }
    } else if (hasWarnedChannelLimitRef.current) {
      hasWarnedChannelLimitRef.current = false;
    }
  }, [meetingChannels.length, totalMeetings, trimmedCount]);

  // Initialize subscriptions - follow hybrid architecture: only subscribe after initial data is ready
  useEffect(() => {
    if (!isInitialDataReady || isCleaningUp || isCleanupInProgress) {
      loggerRef.current.debug('Waiting for initial meetings data to be ready before subscription');
      return;
    }

    loggerRef.current.info('Initial meetings data ready, setting up real-time subscription');
    setupSubscriptions();

    return () => {
      if (unsubscribeRef.current) {
        setConnectionState('disconnecting');
        unsubscribeRef.current();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [
    isCleaningUp,
    isCleanupInProgress,
    isInitialDataReady,
    meetingChannelsKey,
    setupSubscriptions,
  ]);

  // Respond to coordinated cleanup signals
  useEffect(() => {
    if (cleanupSignal === 0 || cleanupSignal === lastCleanupSignalRef.current) {
      return;
    }

    lastCleanupSignalRef.current = cleanupSignal;
    loggerRef.current.info('Received coordinated cleanup signal - draining meetings subscriptions', {
      cleanupSignal,
    });

    setIsCleaningUp(true);
    setConnectionState('disconnecting');
    setIsConnected(false);

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (unsubscribeRef.current) {
      try {
        unsubscribeRef.current();
      } catch (error) {
        loggerRef.current.error('Error while cleaning up meeting subscription', error);
      }
      unsubscribeRef.current = null;
    }

    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
    }

    cleanupTimeoutRef.current = setTimeout(() => {
      setIsCleaningUp(false);
      setConnectionState('disconnected');
      cleanupTimeoutRef.current = null;
    }, NAVIGATION_DRAIN_DELAY);
  }, [cleanupSignal]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = null;
      }
    };
  }, []);

  return {
    meetings,
    isConnected,
    connectionState,
    connectionAttempts,
    isInitialDataReady,
    retry: setupSubscriptions
  };
}
