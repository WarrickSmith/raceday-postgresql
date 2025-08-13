'use client';

import { memo, useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Meeting } from '@/types/meetings';
import { getRaceTypeDisplay } from '@/constants/raceTypes';
import { getCountryInfo, normalizeCountryCode } from '@/constants/countries';
import { RaceCardListSkeleton } from '@/components/skeletons/RaceCardSkeleton';

// Lazy load RacesList component with next/dynamic for performance
const RacesList = dynamic(() => import('./RacesList').then(mod => ({ default: mod.RacesList })), {
  loading: () => <RaceCardListSkeleton count={5} />,
  ssr: false, // Client-side only for interactive expansion
});

interface MeetingCardProps {
  meeting: Meeting;
  onRaceClick?: (raceId: string) => void;
}

function MeetingCardComponent({ meeting, onRaceClick }: MeetingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCompleted, setIsCompleted] = useState<boolean | null>(null);
  

  // Check if meeting is completed on mount with lightweight query
  useEffect(() => {
    const checkMeetingCompletion = async () => {
      try {
        // Make a lightweight API call to check race statuses
        const response = await fetch(`/api/meetings/${meeting.meetingId}/status`);
        if (response.ok) {
          const data = await response.json();
          setIsCompleted(data.isCompleted);
        }
      } catch (error) {
        console.log('Failed to check meeting completion status:', error);
        // Fallback to time-based heuristic for old meetings
        if (meeting.firstRaceTime) {
          const now = new Date();
          const firstRaceTime = new Date(meeting.firstRaceTime);
          const hoursSinceFirstRace = (now.getTime() - firstRaceTime.getTime()) / (1000 * 60 * 60);
          // Assume meeting is completed if it started more than 6 hours ago
          setIsCompleted(hoursSinceFirstRace > 6);
        }
      }
    };

    checkMeetingCompletion();
  }, [meeting.meetingId, meeting.firstRaceTime]);

  // Toggle expand/collapse state
  const toggleExpanded = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleExpanded();
    }
  }, [toggleExpanded]);
  const formatTime = (dateTimeString: string) => {
    try {
      const date = new Date(dateTimeString);
      return date.toLocaleTimeString('en-AU', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return 'TBA';
    }
  };

  const getCountryFlag = (country: string) => {
    const countryInfo = getCountryInfo(country);
    const normalizedCode = normalizeCountryCode(country);
    
    if (countryInfo) {
      const FlagComponent = countryInfo.flag;
      return (
        <span className="flex items-center space-x-2">
          <FlagComponent 
            className="w-8 h-6 rounded border border-gray-200 shadow-sm" 
            title={countryInfo.name}
            aria-label={`${countryInfo.name} flag`}
          />
          <span className={`text-sm font-bold ${countryInfo.textColor}`}>
            {normalizedCode}
          </span>
        </span>
      );
    }
    
    return (
      <span className="text-xs font-semibold text-gray-600 bg-gray-200 px-2 py-1 rounded">
        {normalizedCode || 'Unknown'}
      </span>
    );
  };

  const getDisplayRaceType = (meeting: Meeting): string => {
    // Use category code for consistent display, fallback to raceType for legacy data
    return meeting.category ? getRaceTypeDisplay(meeting.category) : meeting.raceType;
  };

  const getMeetingStatus = (races?: unknown[]) => {
    if (!meeting.firstRaceTime) return 'upcoming';
    
    const now = new Date();
    const firstRaceTime = new Date(meeting.firstRaceTime);
    
    // Check completion status from multiple sources in priority order:
    
    // 1. If we have expanded race data, check if all races are finalized
    if (races && Array.isArray(races) && races.length > 0) {
      const allRacesFinalized = races.every((race) => {
        const raceData = race as { status: string };
        return raceData.status === 'Final' || raceData.status === 'Abandoned';
      });
      
      if (allRacesFinalized) {
        return 'completed';
      }
    }
    
    // 2. If we have completion status from API/heuristic check
    if (isCompleted === true) {
      return 'completed';
    }
    
    // 3. Fallback to time-based logic
    if (firstRaceTime > now) return 'upcoming';
    if (firstRaceTime <= now) return 'live';
    
    return 'upcoming';
  };

  const status = getMeetingStatus([]);
  const statusColors = {
    upcoming: 'border-blue-200 bg-blue-50',
    live: 'border-green-200 bg-green-50',
    completed: 'border-gray-200 bg-gray-50',
  };

  return (
    <article 
      className={`border rounded-lg p-6 transition-colors hover:shadow-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-opacity-50 ${statusColors[status]}`}
      role="article"
      aria-labelledby={`meeting-${meeting.$id}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 
            id={`meeting-${meeting.$id}`}
            className="text-lg font-semibold text-gray-900 truncate"
          >
            {meeting.meetingName}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {getDisplayRaceType(meeting)}
          </p>
        </div>
        
        <div 
          className="flex-shrink-0 ml-4 text-2xl"
          aria-label={`Country: ${meeting.country}`}
          title={`Country: ${meeting.country}`}
        >
          {getCountryFlag(meeting.country)}
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span 
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              status === 'live' 
                ? 'bg-green-100 text-green-800' 
                : status === 'upcoming'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-800'
            }`}
            aria-label={`Status: ${status}`}
          >
            {status === 'live' && <span className="w-2 h-2 bg-green-400 rounded-full mr-1 animate-pulse"></span>}
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
          
          <span className="text-sm text-gray-500">
            ID: {meeting.meetingId}
          </span>
        </div>
        
        <div className="flex items-center space-x-3">
          <time 
            dateTime={meeting.firstRaceTime}
            className="text-sm font-medium text-gray-900"
            aria-label={`First race at ${formatTime(meeting.firstRaceTime || meeting.$createdAt)}`}
          >
            {formatTime(meeting.firstRaceTime || meeting.$createdAt)}
          </time>
          
          {/* Expand/Collapse Button */}
          <button
            type="button"
            onClick={toggleExpanded}
            onKeyDown={handleKeyDown}
            className="p-2 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse races' : 'Expand to show races'}
            title={isExpanded ? 'Hide races' : 'Show races'}
            tabIndex={0}
          >
            <svg 
              className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : 'rotate-0'
              }`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M19 9l-7 7-7-7" 
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Races List - Only render when expanded */}
      {isExpanded && (
        <div className="mt-4 transition-all duration-300 ease-in-out">
          <RacesList 
            meetingId={meeting.meetingId}
            onRaceClick={onRaceClick}
          />
        </div>
      )}
    </article>
  );
}

// Memoize component to prevent unnecessary re-renders
export const MeetingCard = memo(MeetingCardComponent, (prevProps, nextProps) => {
  // Custom comparison function for optimization
  const meetingEqual = (
    prevProps.meeting.$id === nextProps.meeting.$id &&
    prevProps.meeting.$updatedAt === nextProps.meeting.$updatedAt &&
    prevProps.meeting.firstRaceTime === nextProps.meeting.firstRaceTime
  );
  
  const callbacksEqual = (
    prevProps.onRaceClick === nextProps.onRaceClick
  );
  
  return meetingEqual && callbacksEqual;
});