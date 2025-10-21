'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MeetingCard } from './MeetingCard';
import { RacesForMeetingClient } from './RacesForMeetingClient';
import { MeetingsListSkeleton } from '../skeletons/MeetingCardSkeleton';
import { NextScheduledRaceButton } from './NextScheduledRaceButton';
import { ConnectionStatusPanel } from './ConnectionStatusPanel';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { NoMeetingsPlaceholder } from './NoMeetingsPlaceholder';
import { useMeetingsPolling, type RaceUpdateEvent } from '@/hooks/useMeetingsPolling';
import { Meeting } from '@/types/meetings';
import { racePrefetchService } from '@/services/racePrefetchService';
import { startHealthMonitoring, stopHealthMonitoring } from '@/state/connectionState';

interface MeetingsListClientProps {
  initialData: Meeting[];
}

export function MeetingsListClient({ initialData }: MeetingsListClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(() => initialData[0] ?? null);
  const [raceUpdateSignal, setRaceUpdateSignal] = useState(0);
  const [userHasSelectedMeeting, setUserHasSelectedMeeting] = useState(false);

  const handleError = useCallback((error: Error) => {
    console.error('Data polling error:', error);
    setError('Data update issue - trying to reconnect...');

    // Clear error after 5 seconds
    setTimeout(() => setError(null), 5000);
  }, []);

  // Enhanced race click handler with pre-fetching for immediate rendering
  const handleRaceClick = useCallback(async (race_id: string) => {
    console.log('🎯 Race click - pre-fetching basic data for:', race_id);
    try {
      await racePrefetchService.prefetchForNavigation(race_id);
      console.log('✅ Pre-fetch completed, navigating to:', race_id);
    } catch (error) {
      console.warn('⚠️ Pre-fetch failed, proceeding with navigation:', error);
    }
    router.push(`/race/${race_id}`);
  }, [router]);

  const handleRaceRealtimeUpdate = useCallback((event: RaceUpdateEvent) => {
    if (event.eventType === 'update' || event.eventType === 'create') {
      setRaceUpdateSignal((prev) => prev + 1);
    }
  }, []);

  const {
    meetings,
    isConnected,
    connectionState,
    connectionAttempts,
    isInitialDataReady,
    retryConnection,
    refreshMeetings,
    retryCountdown,
  } = useMeetingsPolling({
    initialData,
    onError: handleError,
    onRaceUpdate: handleRaceRealtimeUpdate,
  });

  const handleRetryConnection = useCallback(() => {
    void retryConnection();
  }, [retryConnection]);

  // Start health monitoring when component mounts
  useEffect(() => {
    startHealthMonitoring();

    return () => {
      stopHealthMonitoring();
    };
  }, []);

  // Keep the selected meeting in sync with the available meetings
  useEffect(() => {
    if (meetings.length === 0) {
      if (selectedMeeting !== null) {
        setSelectedMeeting(null);
        setUserHasSelectedMeeting(false);
      }
      return;
    }

    // If no meeting is selected, auto-select the first one
    if (!selectedMeeting) {
      setSelectedMeeting(meetings[0]);
      return;
    }

    // Check if the currently selected meeting still exists in the updated meetings list
    const matchingMeeting = meetings.find((meeting) => meeting.meeting_id === selectedMeeting.meeting_id);

    if (!matchingMeeting) {
      // Only reset to first meeting if user hasn't manually selected one
      // or if there's no other option
      if (!userHasSelectedMeeting || meetings.length === 1) {
        setSelectedMeeting(meetings[0]);
        setUserHasSelectedMeeting(false);
      }
      return;
    }

    // Update the selected meeting with fresh data only if there are actual changes
    // This prevents unnecessary re-renders that could interrupt race loading
    if (matchingMeeting.updated_at !== selectedMeeting.updated_at ||
        matchingMeeting.first_race_time !== selectedMeeting.first_race_time) {
      setSelectedMeeting(matchingMeeting);
    }
  }, [meetings, selectedMeeting, userHasSelectedMeeting]);

  // Handle meeting card click
  const handleMeetingClick = useCallback((meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setUserHasSelectedMeeting(true);
  }, []);

  // Memoize the meetings list to prevent unnecessary re-renders
  const meetingsList = useMemo(() => {
    return meetings.map((meeting) => (
      <div
        key={meeting.meeting_id}
        className={`cursor-pointer transition-all duration-200 rounded-lg ${
          selectedMeeting?.meeting_id === meeting.meeting_id
            ? 'ring-2 ring-blue-500 ring-opacity-50'
            : ''
        }`}
        onClick={() => handleMeetingClick(meeting)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleMeetingClick(meeting);
          }
        }}
        aria-pressed={selectedMeeting?.meeting_id === meeting.meeting_id}
        aria-label={`Select ${meeting.meeting_name} meeting`}
      >
        <MeetingCard 
          meeting={meeting}
        />
      </div>
    ));
  }, [meetings, selectedMeeting, handleMeetingClick]);

  // Show loading state while establishing a healthy connection
  if (connectionState === 'connected' && !isInitialDataReady && meetings.length === 0) {
    return <MeetingsListSkeleton />;
  }

  // Show connection status panel when not connected (with header above)
  if (connectionState !== 'connected') {
    return (
      <>
        {/* Header with connection status and next race button */}
        <div className="col-span-1 lg:col-span-2 flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <NextScheduledRaceButton
              meetings={meetings}
              isRealtimeConnected={isConnected}
              raceUpdateSignal={raceUpdateSignal}
            />
          </div>

          {/* Data polling status */}
          <ConnectionStatusBadge state={connectionState} />
        </div>

        {/* Centered ConnectionStatusPanel spanning full width */}
        <div className="col-span-1 lg:col-span-2 flex items-center justify-center">
          <div className="w-full max-w-4xl">
            <ConnectionStatusPanel
              state={connectionState}
              retryCountdown={retryCountdown}
              onRetry={handleRetryConnection}
              connectionAttempts={connectionAttempts}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Header with connection status and next race button */}
      <div className="col-span-1 lg:col-span-2 flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <NextScheduledRaceButton
            meetings={meetings}
            isRealtimeConnected={isConnected}
            raceUpdateSignal={raceUpdateSignal}
          />
        </div>

        {/* Data polling status */}
        <ConnectionStatusBadge state={connectionState} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="col-span-1 lg:col-span-2 bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-yellow-700">Connection Issue</p>
                <p className="text-sm text-yellow-700">{error}</p>
              </div>
            </div>
            <button
              onClick={handleRetryConnection}
              className="text-sm text-yellow-700 hover:text-yellow-600 underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Left Panel - Meetings List */}
      <div className="bg-slate-50 rounded-lg border border-slate-200 h-full flex flex-col min-h-0">
        <div className="p-4 border-b border-slate-200 flex-shrink-0 bg-slate-50">
          <h2 className="text-lg font-semibold text-gray-900">
            Today&apos;s Meetings
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {meetings.length} meeting{meetings.length !== 1 ? 's' : ''} available
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {meetings.length > 0 ? (
            <div
              className="space-y-3"
              role="list"
              aria-label="Race meetings"
            >
              {meetingsList}
            </div>
          ) : (
            <NoMeetingsPlaceholder onRefresh={refreshMeetings} />
          )}
        </div>
      </div>

      {/* Right Panel - Races for Selected Meeting */}
      <RacesForMeetingClient 
        selectedMeeting={selectedMeeting}
        onRaceClick={handleRaceClick}
      />
    </>
  );
}
