'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MeetingCard } from './MeetingCard';
import { RacesForMeetingClient } from './RacesForMeetingClient';
import { MeetingsListSkeleton } from '../skeletons/MeetingCardSkeleton';
import { NextScheduledRaceButton } from './NextScheduledRaceButton';
import { useRealtimeMeetings } from '@/hooks/useRealtimeMeetings';
import { Meeting } from '@/types/meetings';
import { racePrefetchService } from '@/services/racePrefetchService';

interface MeetingsListClientProps {
  initialData: Meeting[];
}

export function MeetingsListClient({ initialData }: MeetingsListClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  const handleError = useCallback((error: Error) => {
    console.error('Real-time connection error:', error);
    setError('Connection issue - trying to reconnect...');
    
    // Clear error after 5 seconds
    setTimeout(() => setError(null), 5000);
  }, []);

  // Enhanced race click handler with pre-fetching for immediate rendering
  const handleRaceClick = useCallback(async (raceId: string) => {
    console.log('🎯 Race click - pre-fetching basic data for:', raceId);
    
    try {
      // Pre-fetch basic race data for immediate rendering
      await racePrefetchService.prefetchForNavigation(raceId);
      console.log('✅ Pre-fetch completed, navigating to:', raceId);
    } catch (error) {
      console.warn('⚠️ Pre-fetch failed, proceeding with navigation:', error);
    }
    
    // Navigate to race page - will use cached data if available
    router.push(`/race/${raceId}`);
  }, [router]);

  const { meetings, isConnected, connectionAttempts, retry } = useRealtimeMeetings({
    initialData,
    onError: handleError,
  });

  // Auto-select the first meeting on initial load
  useEffect(() => {
    if (meetings.length > 0 && !selectedMeeting) {
      // Select first meeting by default
      setSelectedMeeting(meetings[0]);
    }
  }, [meetings, selectedMeeting]);

  // Handle meeting card click
  const handleMeetingClick = useCallback((meeting: Meeting) => {
    setSelectedMeeting(meeting);
  }, []);

  // Memoize the meetings list to prevent unnecessary re-renders
  const meetingsList = useMemo(() => {
    return meetings.map((meeting) => (
      <div
        key={meeting.$id}
        className={`cursor-pointer transition-all duration-200 rounded-lg ${
          selectedMeeting?.$id === meeting.$id 
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
        aria-pressed={selectedMeeting?.$id === meeting.$id}
        aria-label={`Select ${meeting.meetingName} meeting`}
      >
        <MeetingCard 
          meeting={meeting}
        />
      </div>
    ));
  }, [meetings, handleRaceClick, selectedMeeting, handleMeetingClick]);

  // Show loading state only if we have no data
  if (!meetings.length && connectionAttempts === 0) {
    return <MeetingsListSkeleton />;
  }

  return (
    <>
      {/* Header with connection status and next race button */}
      <div className="col-span-1 lg:col-span-2 flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <NextScheduledRaceButton meetings={meetings} />
        </div>
        
        {/* Real-time connection status */}
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-400' : 'bg-red-400'
            }`}
            aria-label={isConnected ? 'Connected' : 'Disconnected'}
          />
          <span className="text-sm text-gray-500">
            {isConnected ? 'Live' : 'Reconnecting...'}
          </span>
        </div>
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
              onClick={retry}
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
            <div className="text-center py-12">
              <div className="mx-auto h-12 w-12 text-gray-400">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3a4 4 0 118 0v4m-4 8a4 4 0 11-8 0V7a4 4 0 114 0v4" />
                </svg>
              </div>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No meetings today</h3>
              <p className="mt-1 text-sm text-gray-500">
                There are no race meetings scheduled for today.
              </p>
            </div>
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