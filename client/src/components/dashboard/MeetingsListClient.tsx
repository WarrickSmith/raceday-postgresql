'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { MeetingCard } from './MeetingCard';
import { MeetingsListSkeleton } from '../skeletons/MeetingCardSkeleton';
import { useRealtimeMeetings } from '@/hooks/useRealtimeMeetings';
import { Meeting } from '@/types/meetings';

interface MeetingsListClientProps {
  initialData: Meeting[];
}

export function MeetingsListClient({ initialData }: MeetingsListClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((error: Error) => {
    console.error('Real-time connection error:', error);
    setError('Connection issue - trying to reconnect...');
    
    // Clear error after 5 seconds
    setTimeout(() => setError(null), 5000);
  }, []);

  // Handle race click navigation
  const handleRaceClick = useCallback((raceId: string) => {
    router.push(`/race/${raceId}`);
  }, [router]);

  const { meetings, isConnected, connectionAttempts, retry } = useRealtimeMeetings({
    initialData,
    onError: handleError,
  });

  // Memoize the meetings list to prevent unnecessary re-renders
  const meetingsList = useMemo(() => {
    return meetings.map((meeting) => (
      <MeetingCard 
        key={meeting.$id} 
        meeting={meeting}
        onRaceClick={handleRaceClick}
      />
    ));
  }, [meetings, handleRaceClick]);

  // Show loading state only if we have no data
  if (!meetings.length && connectionAttempts === 0) {
    return <MeetingsListSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* Connection status indicator */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          Today&apos;s Race Meetings
        </h2>
        
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
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
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

      {/* Meetings list */}
      {meetings.length > 0 ? (
        <div 
          className="space-y-4"
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

      {/* Meetings count */}
      {meetings.length > 0 && (
        <div className="text-center pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Showing {meetings.length} meeting{meetings.length !== 1 ? 's' : ''} for today
          </p>
        </div>
      )}
    </div>
  );
}