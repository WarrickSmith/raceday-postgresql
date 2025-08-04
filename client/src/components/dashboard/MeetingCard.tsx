'use client';

import { memo } from 'react';
import { Meeting } from '@/types/meetings';
import { getRaceTypeDisplay } from '@/constants/raceTypes';
import { getCountryInfo, normalizeCountryCode } from '@/constants/countries';

interface MeetingCardProps {
  meeting: Meeting;
}

function MeetingCardComponent({ meeting }: MeetingCardProps) {
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

  const getMeetingStatus = () => {
    if (!meeting.firstRaceTime) return 'upcoming';
    
    const now = new Date();
    const firstRaceTime = new Date(meeting.firstRaceTime);
    
    if (firstRaceTime > now) return 'upcoming';
    if (firstRaceTime <= now) return 'live';
    
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
        
        <time 
          dateTime={meeting.firstRaceTime}
          className="text-sm font-medium text-gray-900"
          aria-label={`First race at ${formatTime(meeting.firstRaceTime || meeting.$createdAt)}`}
        >
          {formatTime(meeting.firstRaceTime || meeting.$createdAt)}
        </time>
      </div>
    </article>
  );
}

// Memoize component to prevent unnecessary re-renders
export const MeetingCard = memo(MeetingCardComponent, (prevProps, nextProps) => {
  // Custom comparison function for optimization
  return (
    prevProps.meeting.$id === nextProps.meeting.$id &&
    prevProps.meeting.$updatedAt === nextProps.meeting.$updatedAt &&
    prevProps.meeting.firstRaceTime === nextProps.meeting.firstRaceTime
  );
});