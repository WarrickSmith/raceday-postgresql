'use client';

import { memo, useMemo } from 'react';
import { RaceCard } from './RaceCard';
import { RaceCardListSkeleton } from '@/components/skeletons/RaceCardSkeleton';
import { useRacesForMeeting } from '@/hooks/useRacesForMeeting';
import { Meeting } from '@/types/meetings';

interface RacesForMeetingClientProps {
  selectedMeeting: Meeting | null;
  onRaceClick?: (race_id: string) => void;
}

function RacesForMeetingClientComponent({ 
  selectedMeeting, 
  onRaceClick 
}: RacesForMeetingClientProps) {
  const { races, isLoading, error, isConnected } = useRacesForMeeting({
    meeting_id: selectedMeeting?.meeting_id || '',
    enabled: !!selectedMeeting,
  });

  // Memoize the races list to prevent unnecessary re-renders
  const racesList = useMemo(() => {
    return races.map((race) => (
      <RaceCard 
        key={race.$id} 
        race={race}
        onClick={onRaceClick}
      />
    ));
  }, [races, onRaceClick]);

  // Show empty state if no meeting selected
  if (!selectedMeeting) {
    return (
      <div className="h-full bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center lg:block">
        <div className="text-center p-4">
          <div className="mx-auto h-12 w-12 text-gray-400">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M8 7V3a4 4 0 118 0v4m-4 8a4 4 0 11-8 0V7a4 4 0 114 0v4" />
            </svg>
          </div>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            <span className="lg:hidden">Scroll up to select a meeting</span>
            <span className="hidden lg:inline">Select a meeting</span>
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            <span className="lg:hidden">Tap on a meeting card above to view its races</span>
            <span className="hidden lg:inline">Click on a meeting card to view its races</span>
          </p>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="h-full bg-slate-50 rounded-lg border border-slate-200">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {selectedMeeting.meeting_name}
          </h2>
          <p className="text-sm text-gray-600 mt-1">Loading races...</p>
        </div>
        <div className="p-4">
          <RaceCardListSkeleton count={6} />
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="h-full bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-red-400">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="mt-2 text-sm font-medium text-gray-900">Error loading races</h3>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-50 rounded-lg border border-slate-200 flex flex-col min-h-0">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900">
          {selectedMeeting.meeting_name}
        </h2>
        <div className="flex items-center justify-between mt-1">
          <p className="text-sm text-gray-600">
            {races.length} race{races.length !== 1 ? 's' : ''}
          </p>
          {/* Real-time connection status */}
          <div className="flex items-center space-x-1">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? 'bg-green-400' : 'bg-gray-300'
              }`}
              aria-label={isConnected ? 'Race updates connected' : 'Race updates disconnected'}
            />
            <span className="text-xs text-gray-500">
              {isConnected ? 'Live' : 'Static'}
            </span>
          </div>
        </div>
      </div>

      {/* Races List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {races.length > 0 ? (
          <div 
            className="p-3 space-y-3"
            role="list"
            aria-label={`Races for ${selectedMeeting.meeting_name}`}
          >
            {racesList}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 text-gray-400">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M8 7V3a4 4 0 118 0v4m-4 8a4 4 0 11-8 0V7a4 4 0 114 0v4" />
                </svg>
              </div>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No races found</h3>
              <p className="mt-1 text-sm text-gray-500">
                This meeting has no races scheduled.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders
export const RacesForMeetingClient = memo(RacesForMeetingClientComponent, (prevProps, nextProps) => {
  const meetingEqual = (
    prevProps.selectedMeeting?.$id === nextProps.selectedMeeting?.$id &&
    prevProps.selectedMeeting?.$updatedAt === nextProps.selectedMeeting?.$updatedAt
  );
  
  const callbackEqual = prevProps.onRaceClick === nextProps.onRaceClick;
  
  return meetingEqual && callbackEqual;
});