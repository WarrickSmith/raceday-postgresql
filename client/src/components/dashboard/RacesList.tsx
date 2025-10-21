'use client';

import React, { memo, useEffect } from 'react';
import { RaceCard } from './RaceCard';
import { RaceCardListSkeleton } from '@/components/skeletons/RaceCardSkeleton';
import { useRacesForMeeting } from '@/hooks/useRacesForMeeting';
import { racePrefetchService } from '@/services/racePrefetchService';

interface RacesListProps {
  meeting_id: string;
  onRaceClick?: (race_id: string) => void;
  onRacesLoaded?: (races: unknown) => void;
}

function RacesListComponent({ 
  meeting_id, 
  onRaceClick,
  onRacesLoaded 
}: RacesListProps) {
  // Only add debugging in development
  if (process.env.NODE_ENV === 'development') {
    console.log('📝 RacesList rendered with meeting_id:', meeting_id);
  }
  
  // Use the hook to fetch races for this meeting
  const { races, isLoading, error } = useRacesForMeeting({
    meeting_id,
    enabled: !!meeting_id,
  });

  // Call onRacesLoaded when races are loaded
  useEffect(() => {
    if (races.length > 0 && onRacesLoaded) {
      onRacesLoaded(races);
    }
  }, [races, onRacesLoaded]);

  // Background pre-fetching of race data when races are displayed
  useEffect(() => {
    if (races.length > 0) {
      const race_ids = races.map(race => race.race_id);
      console.log('📋 Starting background pre-fetch for', race_ids.length, 'races in meeting:', meeting_id);
      
      // Pre-fetch race data in background with low priority
      racePrefetchService.prefetchMultipleRaces(race_ids, { priority: 'low' })
        .then(() => {
          console.log('✅ Background pre-fetch completed for meeting:', meeting_id);
        })
        .catch(error => {
          console.warn('⚠️ Background pre-fetch failed for meeting:', meeting_id, error);
        });
    }
  }, [races, meeting_id]);
  
  if (process.env.NODE_ENV === 'development') {
    console.log('📝 RacesList hook result:', { racesCount: races.length, isLoading, error });
  }
  // Loading state
  if (isLoading) {
    return (
      <div 
        className="mt-4 pl-6 border-l-2 border-gray-100"
        aria-label="Loading races..."
        role="status"
      >
        <RaceCardListSkeleton count={5} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div 
        className="mt-4 pl-6 border-l-2 border-red-100 bg-red-50 rounded-r-lg p-4"
        role="alert"
        aria-labelledby={`races-error-${meeting_id}`}
      >
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg 
              className="h-5 w-5 text-red-400" 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 20 20" 
              fill="currentColor"
              aria-hidden="true"
            >
              <path 
                fillRule="evenodd" 
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" 
                clipRule="evenodd" 
              />
            </svg>
          </div>
          <div className="ml-3">
            <h4 
              id={`races-error-${meeting_id}`}
              className="text-sm font-medium text-red-800"
            >
              Failed to load races
            </h4>
            <div className="mt-1 text-sm text-red-700">
              {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (races.length === 0) {
    return (
      <div 
        className="mt-4 pl-6 border-l-2 border-gray-100 bg-gray-50 rounded-r-lg p-4"
        role="status"
        aria-labelledby={`races-empty-${meeting_id}`}
      >
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg 
              className="h-5 w-5 text-gray-400" 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
              aria-hidden="true"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
              />
            </svg>
          </div>
          <div className="ml-3">
            <h4 
              id={`races-empty-${meeting_id}`}
              className="text-sm font-medium text-gray-800"
            >
              No races available
            </h4>
            <div className="mt-1 text-sm text-gray-600">
              This meeting has no scheduled races.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sort races by race number to ensure correct order
  const sortedRaces = [...races].sort((a, b) => a.race_number - b.race_number);

  return (
    <div 
      className="mt-4 pl-6 border-l-2 border-blue-100"
      role="region"
      aria-labelledby={`races-list-${meeting_id}`}
      aria-describedby={`races-count-${meeting_id}`}
    >
      {/* Screen reader announcement */}
      <div className="sr-only">
        <h4 id={`races-list-${meeting_id}`}>Races for this meeting</h4>
        <p id={`races-count-${meeting_id}`}>
          {sortedRaces.length} race{sortedRaces.length !== 1 ? 's' : ''} scheduled
        </p>
      </div>

      {/* Races list */}
      <div className="space-y-2" data-testid={`races-list-${meeting_id}`}>
        {sortedRaces.map((race) => (
          <RaceCard
            key={race.race_id}
            race={race}
            onClick={onRaceClick}
          />
        ))}
      </div>
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders
export const RacesList = memo(RacesListComponent, (prevProps, nextProps) => {
  // Custom comparison function for optimization
  return (
    prevProps.meeting_id === nextProps.meeting_id &&
    prevProps.onRaceClick === nextProps.onRaceClick &&
    prevProps.onRacesLoaded === nextProps.onRacesLoaded
  );
});