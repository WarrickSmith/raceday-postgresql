'use client';

import { memo, useMemo, useState, useEffect } from 'react';
import { Race, Meeting } from '@/types/meetings';
import { useRealtimeRace } from '@/hooks/useRealtimeRace';
import { formatDistance, formatRaceTime, formatCategory } from '@/utils/raceFormatters';
import { useRace } from '@/contexts/RaceContext';

interface RaceDataHeaderProps {
  // No props needed - will get all data from context
  // Placeholder to avoid empty interface lint error
  className?: string;
}

export const RaceDataHeader = memo(function RaceDataHeader({}: RaceDataHeaderProps) {
  const { raceData } = useRace();
  
  // Debug logging for header updates (can be removed in production)
  // console.log('📋 RaceDataHeader render:', {
  //   raceDataExists: !!raceData,
  //   raceId: raceData?.race.raceId,
  //   raceName: raceData?.race.name,
  //   raceNumber: raceData?.race.raceNumber
  // });
  
  // Initialize hooks before conditional returns
  const { race: liveRace, isConnected } = useRealtimeRace({ initialRace: raceData?.race });
  const formattedTime = useMemo(() => 
    liveRace ? formatRaceTime(liveRace.startTime) : '', 
    [liveRace?.startTime]
  );

  const [timeToStart, setTimeToStart] = useState<string | null>(null);

  // Dynamic countdown that updates every second
  useEffect(() => {
    if (!liveRace) return;

    const updateCountdown = () => {
      try {
        const now = new Date();
        const raceTime = new Date(liveRace.startTime);
        if (isNaN(raceTime.getTime())) {
          setTimeToStart(null);
          return;
        }
        
        const diff = raceTime.getTime() - now.getTime();
        
        if (diff <= 0) {
          // Race should have started - check if it's delayed
          const delayDiff = Math.abs(diff);
          const delayMinutes = Math.floor(delayDiff / (1000 * 60));
          const delaySeconds = Math.floor((delayDiff % (1000 * 60)) / 1000);
          
          if (liveRace.status === 'Open' && delayDiff > 30000) { // More than 30 seconds late
            if (delayMinutes > 0) {
              setTimeToStart(`Delayed: ${delayMinutes}:${delaySeconds.toString().padStart(2, '0')}`);
            } else {
              setTimeToStart(`Delayed: 0:${delaySeconds.toString().padStart(2, '0')}`);
            }
          } else {
            setTimeToStart('Started');
          }
          return;
        }

        // Calculate time remaining
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        if (hours > 0) {
          setTimeToStart(`${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        } else if (minutes > 0) {
          setTimeToStart(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        } else {
          setTimeToStart(`0:${seconds.toString().padStart(2, '0')}`);
        }
      } catch (error) {
        console.error('Error calculating countdown:', error);
        setTimeToStart(null);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [liveRace?.startTime, liveRace?.status]);

  const formattedDistance = useMemo(() => {
    return liveRace?.distance ? formatDistance(liveRace.distance) : null;
  }, [liveRace?.distance]);
  
  if (!raceData) {
    return (
      <header className="bg-white rounded-lg shadow-md p-6 mb-6" role="banner">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-full"></div>
        </div>
      </header>
    );
  }

  const { race, meeting } = raceData;

  return (
    <header className="bg-white rounded-lg shadow-md p-6 mb-6" role="banner">
      {/* Screen reader announcement for race updates */}
      <div 
        aria-live="assertive" 
        aria-atomic="true" 
        className="sr-only"
      >
        Race {liveRace.raceNumber} {liveRace.name} status: {liveRace.status}
        Race type: {meeting.raceType} Category: {formatCategory(meeting.category)}
        {formattedDistance && ` Distance: ${formattedDistance}`}
        {liveRace.trackCondition && ` Track condition: ${liveRace.trackCondition}`}
        {timeToStart && ` Time to start: ${timeToStart}`}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Race Information */}
        <div>
          {/* Connection Status */}
          <div className="flex items-center justify-between mb-4">
            <span className={`text-xs px-2 py-1 rounded-full transition-colors ${
              isConnected 
                ? 'bg-green-100 text-green-700' 
                : 'bg-red-100 text-red-700'
            }`}>
              {isConnected ? '🔄 Live' : '📶 Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
            <span>{meeting.country}</span>
            <span>•</span>
            <span>{meeting.meetingName}</span>
            <span>•</span>
            <time dateTime={liveRace.startTime}>
              {formattedTime}
            </time>
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            Race {liveRace.raceNumber}: {liveRace.name}
          </h1>
          
          <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              liveRace.status === 'Open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}>
              {liveRace.status}
            </span>
            {formattedDistance && <span>{formattedDistance}</span>}
            {liveRace.trackCondition && <span>{liveRace.trackCondition}</span>}
          </div>
        </div>

        {/* Race Details and Countdown */}
        <div className="flex flex-col justify-between">
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            {formattedDistance && (
              <div className="flex items-center">
                <span className="text-sm text-gray-500">Distance:</span>
                <span className="ml-2 text-sm font-semibold text-gray-800">{formattedDistance}</span>
              </div>
            )}
            
            <div className="flex items-center">
              <span className="text-sm text-gray-500">Type:</span>
              <span className="ml-2 text-sm font-semibold text-gray-800">{meeting.raceType}</span>
            </div>
            
            <div className="flex items-center">
              <span className="text-sm text-gray-500">Category:</span>
              <span className="ml-2 text-sm font-semibold text-gray-800">{formatCategory(meeting.category)}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap">
            {liveRace.trackCondition && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Track:</span>
                <span className="text-sm font-medium text-gray-700">{liveRace.trackCondition}</span>
              </div>
            )}
            
            {timeToStart && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {timeToStart === 'Started' ? 'Status:' : 'Starts in:'}
                </span>
                <span className={`text-sm font-mono font-bold ${
                  timeToStart === 'Started' 
                    ? 'text-green-600' 
                    : timeToStart.includes('Delayed') 
                    ? 'text-red-600' 
                    : 'text-blue-600'
                }`}>
                  {timeToStart}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
});