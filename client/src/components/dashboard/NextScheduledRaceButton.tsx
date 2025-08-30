'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Meeting, Race } from '@/types/meetings';

interface NextScheduledRaceButtonProps {
  meetings: Meeting[];
}

interface NextScheduledRace {
  raceId: string;
  name: string;
  startTime: string;
  meetingName: string;
  raceNumber: number;
}

export function NextScheduledRaceButton({ meetings }: NextScheduledRaceButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [nextScheduledRace, setNextScheduledRace] = useState<NextScheduledRace | null>(null);

  // Fetch the next scheduled race from the API
  useEffect(() => {
    const fetchNextScheduledRace = async () => {
      try {
        const response = await fetch('/api/next-scheduled-race');
        if (response.ok) {
          const data = await response.json();
          setNextScheduledRace(data.nextScheduledRace);
        } else {
          setNextScheduledRace(null);
        }
      } catch (error) {
        console.error('Failed to fetch next scheduled race:', error);
        setNextScheduledRace(null);
      }
    };

    fetchNextScheduledRace();
    
    // Refresh every minute to keep the data current
    const interval = setInterval(fetchNextScheduledRace, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // Handle navigation to next scheduled race
  const handleNavigateToNextRace = useCallback(async () => {
    if (!nextScheduledRace || isLoading) return;

    setIsLoading(true);
    
    try {
      console.log('🎯 Navigating to next scheduled race:', nextScheduledRace.raceId);
      router.push(`/race/${nextScheduledRace.raceId}`);
    } catch (error) {
      console.error('❌ Failed to navigate to next scheduled race:', error);
    } finally {
      setIsLoading(false);
    }
  }, [nextScheduledRace, isLoading, router]);

  // Show button always, but disable when no next race is available
  const isDisabled = !nextScheduledRace || isLoading;

  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <button
      onClick={handleNavigateToNextRace}
      disabled={isDisabled}
      className={`inline-flex items-center gap-3 px-6 py-3 text-base font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 ease-in-out shadow-md whitespace-nowrap ${
        isDisabled
          ? 'text-gray-400 bg-gray-50 border border-gray-200 cursor-not-allowed shadow-none'
          : 'text-white bg-blue-600 border border-blue-700 hover:bg-blue-700 focus:ring-blue-500 hover:shadow-lg transform hover:scale-105'
      }`}
      aria-label={
        nextScheduledRace
          ? `Jump to next scheduled race: ${nextScheduledRace.name} at ${nextScheduledRace.meetingName} starting at ${formatTime(nextScheduledRace.startTime)}`
          : 'No upcoming races available'
      }
    >
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      
      {nextScheduledRace ? (
        <div className="flex flex-col items-start min-w-0">
          {/* Top row: Next Race text, time, and meeting name */}
          <div className="flex items-center gap-2">
            <span className="font-semibold">Next Race</span>
            <span className={`text-sm font-medium ${isDisabled ? 'text-gray-400' : 'text-blue-100'}`}>
              {formatTime(nextScheduledRace.startTime)}
            </span>
            <span className={`text-sm font-normal ${isDisabled ? 'text-gray-400' : 'text-blue-100'}`}>
              @ {nextScheduledRace.meetingName}
            </span>
          </div>
          {/* Bottom row: Race number and name */}
          <span className={`text-sm font-normal leading-tight ${isDisabled ? 'text-gray-400' : 'text-blue-100'}`}>
            Race {nextScheduledRace.raceNumber} - {nextScheduledRace.name}
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-start">
          <span className="font-semibold">Next Race</span>
          <span className="text-sm text-gray-400">No races available</span>
        </div>
      )}

      {isLoading && (
        <svg className="animate-spin w-5 h-5 ml-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      )}
    </button>
  );
}