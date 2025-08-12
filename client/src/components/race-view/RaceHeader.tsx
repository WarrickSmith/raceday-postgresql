'use client';

import { memo, useMemo, useState, useEffect } from 'react';
import { Race, Meeting } from '@/types/meetings';
import { useRealtimeRace } from '@/hooks/useRealtimeRace';
import { formatDistance, formatRaceTime, formatCategory } from '@/utils/raceFormatters';

interface RaceHeaderProps {
  initialRace: Race;
  meeting: Meeting;
}

export const RaceHeader = memo(function RaceHeader({ initialRace, meeting }: RaceHeaderProps) {
  const { race, isConnected } = useRealtimeRace({ initialRace });
  const formattedTime = useMemo(() => formatRaceTime(race.startTime), [race.startTime]);

  const [timeToStart, setTimeToStart] = useState<string | null>(null);

  // Dynamic countdown that updates every second
  useEffect(() => {
    const updateCountdown = () => {
      try {
        const now = new Date();
        const raceTime = new Date(race.startTime);
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
          
          if (race.status === 'Open' && delayDiff > 30000) { // More than 30 seconds late
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
        
        const totalMinutes = Math.floor(diff / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        const hours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;
        
        if (hours > 0) {
          setTimeToStart(`${hours}h ${remainingMinutes}m`);
        } else if (totalMinutes > 5) {
          setTimeToStart(`${totalMinutes}m`);
        } else if (totalMinutes > 0) {
          // Show minutes and seconds when less than 5 minutes
          setTimeToStart(`${totalMinutes}:${seconds.toString().padStart(2, '0')}`);
        } else {
          // Show just seconds when less than a minute
          setTimeToStart(`${seconds}s`);
        }
      } catch {
        setTimeToStart(null);
      }
    };

    // Initial call
    updateCountdown();
    
    // Update every second
    const interval = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(interval);
  }, [race.startTime, race.status]);

  const statusColor = useMemo(() => {
    const status = race.status?.toLowerCase();
    
    if (status === 'open') {
      return 'bg-green-100 text-green-800';
    } else if (status === 'closed' || status === 'soon') {
      return 'bg-yellow-100 text-yellow-800';
    } else if (status === 'running' || status === 'finalized') {
      return 'bg-red-100 text-red-800';
    } else {
      return 'bg-gray-100 text-gray-600';
    }
  }, [race.status]);

  const formattedDistance = useMemo(() => formatDistance(race.distance), [race.distance]);

  return (
    <header className="bg-white rounded-lg shadow-md p-6 mb-6" role="banner">
      {/* Screen reader announcement for race updates */}
      <div 
        aria-live="assertive" 
        aria-atomic="true" 
        className="sr-only"
      >
        Race {race.raceNumber} {race.name} status: {race.status}
        Race type: {meeting.raceType} Category: {formatCategory(meeting.category)}
        {formattedDistance && ` Distance: ${formattedDistance}`}
        {race.trackCondition && ` Track condition: ${race.trackCondition}`}
        {timeToStart && ` Time to start: ${timeToStart}`}
      </div>
      <div className="mb-4">
        {/* Connection Status Indicator */}
        <div className="flex justify-end mb-2">
          <span 
            className={`text-xs px-2 py-1 rounded-full ${
              isConnected 
                ? 'bg-green-100 text-green-700' 
                : 'bg-red-100 text-red-700'
            }`}
            aria-live="polite"
            aria-label={isConnected ? 'Connected to live data' : 'Disconnected from live data'}
          >
            {isConnected ? '🔄 Live' : '📶 Disconnected'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <span>{meeting.country}</span>
          <span>•</span>
          <span>{meeting.meetingName}</span>
          <span>•</span>
          <time dateTime={race.startTime}>
            {formattedTime}
          </time>
        </div>
        
        <h1 
          className="text-2xl font-bold text-gray-900 mb-2 font-inter leading-tight"
          id="race-title"
          aria-describedby="race-meta"
        >
          Race {race.raceNumber}: {race.name}
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="race-meta" role="group" aria-labelledby="race-title">
          <div className="flex items-center gap-4 flex-wrap">
            {formattedDistance && (
              <div className="flex items-center">
                <span className="text-sm text-gray-500">Distance:</span>
                <span className="ml-2 text-sm font-semibold text-gray-800">{formattedDistance}</span>
              </div>
            )}
            
            {race.trackCondition && (
              <div className="flex items-center">
                <span className="text-sm text-gray-500">Track:</span>
                <span className="ml-2 text-sm font-semibold text-gray-800">{race.trackCondition}</span>
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
            <div className="flex items-center">
              <span className="text-sm text-gray-500">Status:</span>
              <span 
                className={`ml-2 px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}
                role="status"
                aria-label={`Race status: ${race.status}`}
              >
                {race.status}
              </span>
            </div>

            {timeToStart && (
              <div className="flex items-center">
                <span className="text-sm text-gray-500" id="time-to-start-label">Time to start:</span>
                <span 
                  className={`ml-2 text-sm font-semibold ${
                    timeToStart.startsWith('Delayed:') ? 'text-red-600' : 'text-gray-800'
                  }`}
                  aria-live="polite"
                  aria-labelledby="time-to-start-label"
                  aria-describedby="countdown-description"
                >
                  {timeToStart}
                </span>
                <span id="countdown-description" className="sr-only">
                  This countdown updates every second and announces when the race is about to start
                </span>
              </div>
            )}
            
            <div className="flex items-center">
              <span className="text-sm text-gray-500">Race ID:</span>
              <span className="ml-2 text-sm font-mono text-gray-700">{race.raceId}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
});