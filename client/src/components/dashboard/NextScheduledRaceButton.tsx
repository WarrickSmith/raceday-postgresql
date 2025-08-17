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
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 ease-in-out ${
        isDisabled
          ? 'text-gray-400 bg-gray-50 border border-gray-200 cursor-not-allowed'
          : 'text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 focus:ring-blue-500'
      }`}
      aria-label={
        nextScheduledRace
          ? `Jump to next scheduled race: ${nextScheduledRace.name} at ${nextScheduledRace.meetingName} starting at ${formatTime(nextScheduledRace.startTime)}`
          : 'No upcoming races available'
      }
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>Next Race</span>
      {nextScheduledRace ? (
        <span className={`text-xs ${isDisabled ? 'text-gray-400' : 'text-blue-600'}`}>
          {formatTime(nextScheduledRace.startTime)}
        </span>
      ) : (
        <span className="text-xs text-gray-400">No races</span>
      )}
      {isLoading && (
        <svg className="animate-spin w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      )}
    </button>
  );
}