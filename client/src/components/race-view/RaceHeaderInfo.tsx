'use client';

import { memo } from 'react';
import { useRace } from '@/contexts/RaceContext';
import { formatDistance, formatRaceTime, formatCategory } from '@/utils/raceFormatters';

interface RaceHeaderInfoProps {
  className?: string;
}

export const RaceHeaderInfo = memo(function RaceHeaderInfo({ 
  className = '' 
}: RaceHeaderInfoProps) {
  const { raceData } = useRace();
  
  if (!raceData) {
    return (
      <div className={`${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  const { race, meeting } = raceData;
  const formattedTime = formatRaceTime(race.startTime);
  const formattedDistance = race.distance ? formatDistance(race.distance) : null;

  return (
    <div className={`${className}`}>
      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
        <span>{meeting.country}</span>
        <span>•</span>
        <span>{meeting.meetingName}</span>
        <span>•</span>
        <time dateTime={race.startTime}>
          {formattedTime}
        </time>
      </div>
      
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        Race {race.raceNumber}: {race.name}
      </h1>
      
      <div className="flex items-center gap-4 text-sm text-gray-600">
        {formattedDistance && <span>{formattedDistance}</span>}
        <span>{meeting.raceType}</span>
        <span>{formatCategory(meeting.category)}</span>
        {race.trackCondition && <span>{race.trackCondition}</span>}
      </div>
    </div>
  );
});