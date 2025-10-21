'use client';

import { memo, useEffect, useState } from 'react';
import { Meeting } from '@/types/meetings';
import { getRaceTypeDisplay } from '@/constants/raceTypes';
import { getCountryInfo, normalizeCountryCode } from '@/constants/countries';

interface MeetingCardProps {
  meeting: Meeting;
}

interface MeetingStatusResponse {
  isCompleted: boolean;
}

function MeetingCardComponent({ meeting }: MeetingCardProps) {
  const [isCompleted, setIsCompleted] = useState<boolean | null>(null);

  // Check if meeting is completed on mount with lightweight query
  useEffect(() => {
    const checkMeetingCompletion = async () => {
      try {
        // Make a lightweight API call to check race statuses
        const response = await fetch(`/api/meetings/${meeting.meeting_id}/status`);
        if (response.ok) {
          const data: MeetingStatusResponse = await response.json();
          setIsCompleted(data.isCompleted);
        }
      } catch (error) {
        console.log('Failed to check meeting completion status:', error);
        // Fallback to time-based heuristic for old meetings
        if (meeting.first_race_time) {
          const now = new Date();
          const first_race_time = new Date(meeting.first_race_time);
          const hoursSinceFirstRace = (now.getTime() - first_race_time.getTime()) / (1000 * 60 * 60);
          // Assume meeting is completed if it started more than 6 hours ago
          setIsCompleted(hoursSinceFirstRace > 6);
        }
      }
    };

    void checkMeetingCompletion();
  }, [meeting.meeting_id, meeting.first_race_time]);
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
    // Use category code for consistent display, fallback to race_type for legacy data
    return meeting.category ? getRaceTypeDisplay(meeting.category) : meeting.race_type;
  };

  const getMeetingStatus = () => {
    if (!meeting.first_race_time) return 'upcoming';
    
    const now = new Date();
    const first_race_time = new Date(meeting.first_race_time);
    
    // Check completion status from API/heuristic check
    if (isCompleted === true) {
      return 'completed';
    }
    
    // Fallback to time-based logic
    if (first_race_time > now) return 'upcoming';
    if (first_race_time <= now) return 'live';
    
    return 'upcoming';
  };

  const status = getMeetingStatus();
  const statusColors = {
    upcoming: 'border-blue-200 bg-blue-50',
    live: 'border-green-200 bg-green-50',
    completed: 'border-gray-200 bg-gray-50',
  };

  return (
    <article
      className={`border border-slate-200/50 rounded-lg p-4 shadow-sm transition-all duration-200 hover:shadow-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-opacity-50 ${statusColors[status]}`}
      role="article"
      aria-labelledby={`meeting-${meeting.meeting_id}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              id={`meeting-${meeting.meeting_id}`}
              className="text-lg font-semibold text-gray-900 truncate"
            >
              {meeting.meeting_name}
            </h3>

            <time
              dateTime={meeting.first_race_time}
              className="text-sm font-medium text-gray-900 flex-shrink-0"
              aria-label={`First race at ${formatTime(meeting.first_race_time || meeting.created_at)}`}
            >
              {formatTime(meeting.first_race_time || meeting.created_at)}
            </time>

            <span className="text-sm text-gray-600">
              {getDisplayRaceType(meeting)}
            </span>

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

            {meeting.weather && (
              <span className="text-xs text-gray-600">
                {meeting.weather}
              </span>
            )}

            {meeting.track_condition && (
              <span className="text-xs text-gray-600">
                Track: {meeting.track_condition}
              </span>
            )}
          </div>
        </div>

        <div
          className="flex-shrink-0 ml-4 text-2xl"
          aria-label={`Country: ${meeting.country}`}
          title={`Country: ${meeting.country}`}
        >
          {getCountryFlag(meeting.country)}
        </div>
      </div>
    </article>
  );
}

// Memoize component to prevent unnecessary re-renders
export const MeetingCard = memo(MeetingCardComponent, (prevProps, nextProps) => {
  // Custom comparison function for optimization
  return (
    prevProps.meeting.meeting_id === nextProps.meeting.meeting_id &&
    prevProps.meeting.updated_at === nextProps.meeting.updated_at &&
    prevProps.meeting.first_race_time === nextProps.meeting.first_race_time
  );
});
