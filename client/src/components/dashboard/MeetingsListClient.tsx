'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { MeetingCard } from './MeetingCard';
import { MeetingsListSkeleton } from '../skeletons/MeetingCardSkeleton';
import { useRealtimeMeetings } from '@/hooks/useRealtimeMeetings';
import { useRacePollingIntegration } from '@/hooks/useRacePollingIntegration';
import { Meeting, Race } from '@/types/meetings';
// import { getAllRacesFromMeetings } from '@/utils/raceUtils';

interface MeetingsListClientProps {
  initialData: Meeting[];
}

export function MeetingsListClient({ initialData }: MeetingsListClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);

  const handleError = useCallback((error: Error) => {
    console.error('Real-time connection error:', error);
    setError('Connection issue - trying to reconnect...');
    
    // Clear error after 5 seconds
    setTimeout(() => setError(null), 5000);
  }, []);

  const handlePollingError = useCallback((raceId: string, error: string) => {
    console.error(`Polling error for race ${raceId}:`, error);
    setPollingError(`Polling issue: ${error}`);
    
    // Clear polling error after 8 seconds
    setTimeout(() => setPollingError(null), 8000);
  }, []);

  const handlePerformanceAlert = useCallback((raceId: string, latency: number) => {
    console.warn(`High latency detected for race ${raceId}: ${latency}ms`);
    if (latency > 5000) { // Only show user alert for very high latency
      setPollingError(`Slow response detected (${Math.round(latency)}ms)`);
      setTimeout(() => setPollingError(null), 10000);
    }
  }, []);

  // Handle race click navigation
  const handleRaceClick = useCallback((raceId: string) => {
    router.push(`/race/${raceId}`);
  }, [router]);

  const { meetings, isConnected, connectionAttempts, retry } = useRealtimeMeetings({
    initialData,
    onError: handleError,
  });

  // Track expanded meetings and their races for polling integration
  const [expandedMeetings, setExpandedMeetings] = useState<Set<string>>(new Set());
  const [racesForPolling, setRacesForPolling] = useState<Race[]>([]);

  // Update races available for polling when meetings expand/collapse
  const handleMeetingExpand = useCallback((meetingId: string, races: Race[]) => {
    setExpandedMeetings(prev => new Set(prev).add(meetingId));
    setRacesForPolling(prev => {
      // Remove races from this meeting and add the new ones
      const filtered = prev.filter(race => race.meeting !== meetingId);
      return [...filtered, ...races];
    });
  }, []);

  const handleMeetingCollapse = useCallback((meetingId: string) => {
    setExpandedMeetings(prev => {
      const newSet = new Set(prev);
      newSet.delete(meetingId);
      return newSet;
    });
    setRacesForPolling(prev => prev.filter(race => race.meeting !== meetingId));
  }, []);

  // Initialize polling integration for races
  const {
    pollingStates,
    performanceMetrics,
    triggerManualPoll,
    isPerformanceWithinThreshold
  } = useRacePollingIntegration({
    races: racesForPolling,
    isConnected,
    onPerformanceAlert: handlePerformanceAlert,
    onPollingError: handlePollingError,
    enableAutoPolling: true,
  });

  // Memoize the meetings list to prevent unnecessary re-renders
  const meetingsList = useMemo(() => {
    return meetings.map((meeting) => (
      <MeetingCard 
        key={meeting.$id} 
        meeting={meeting}
        onRaceClick={handleRaceClick}
        onExpand={handleMeetingExpand as (meetingId: string, races: unknown[]) => void}
        onCollapse={handleMeetingCollapse}
        pollingInfo={{
          triggerManualPoll,
          pollingStates,
          performanceMetrics: performanceMetrics as unknown as Record<string, unknown>,
        }}
      />
    ));
  }, [meetings, handleRaceClick, handleMeetingExpand, handleMeetingCollapse, triggerManualPoll, pollingStates, performanceMetrics]);

  // Show loading state only if we have no data
  if (!meetings.length && connectionAttempts === 0) {
    return <MeetingsListSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* Connection and polling status indicator */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          Today&apos;s Race Meetings
        </h2>
        
        <div className="flex items-center space-x-4">
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

          {/* Polling status */}
          {expandedMeetings.size > 0 && (
            <div className="flex items-center space-x-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isPerformanceWithinThreshold ? 'bg-blue-400' : 'bg-orange-400'
                }`}
                aria-label={`Polling performance: ${
                  isPerformanceWithinThreshold ? 'Good' : 'Slow'
                }`}
              />
              <span className="text-sm text-gray-500">
                {racesForPolling.length} race{racesForPolling.length !== 1 ? 's' : ''} monitored
              </span>
              {process.env.NODE_ENV === 'development' && performanceMetrics.totalPolls > 0 && (
                <span className="text-xs text-gray-400">
                  ({Math.round(performanceMetrics.averageLatency)}ms avg)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error banners */}
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
      
      {pollingError && (
        <div className="bg-orange-50 border border-orange-200 rounded-md p-4">
          <div className="flex items-center justify-between">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-orange-700">Race Data Update Issue</p>
                <p className="text-sm text-orange-700">{pollingError}</p>
              </div>
            </div>
            <button
              onClick={() => setPollingError(null)}
              className="text-sm text-orange-700 hover:text-orange-600 underline"
            >
              Dismiss
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