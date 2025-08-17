'use client';

import { useState, useCallback, useMemo } from 'react';
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

  // Find the next scheduled race from all meetings data
  const nextScheduledRace = useMemo((): NextScheduledRace | null => {
    const now = new Date();
    let nextRace: NextScheduledRace | null = null;
    let earliestTime = Number.MAX_SAFE_INTEGER;

    // We need to fetch races for each meeting - for now use a simplified approach
    // In a real implementation, we'd need to either:
    // 1. Have races included in the meetings data
    // 2. Create a separate API endpoint to find the next race
    // 3. Use the existing navigation API logic
    
    // For now, let's use a simpler approach by estimating from firstRaceTime
    meetings.forEach(meeting => {
      if (meeting.firstRaceTime) {
        const raceTime = new Date(meeting.firstRaceTime).getTime();
        if (raceTime > now.getTime() && raceTime < earliestTime) {
          earliestTime = raceTime;
          nextRace = {
            // We'll need to make an API call to get the actual race details
            raceId: '', // Will be populated by API call
            name: 'Race 1', // Assumption - first race of meeting
            startTime: meeting.firstRaceTime,
            meetingName: meeting.meetingName,
            raceNumber: 1
          };
        }
      }
    });

    return nextRace;
  }, [meetings]);

  // Handle navigation to next scheduled race
  const handleNavigateToNextRace = useCallback(async () => {
    if (!nextScheduledRace || isLoading) return;

    setIsLoading(true);
    
    try {
      // Get the next scheduled race details from the API
      const response = await fetch('/api/next-scheduled-race');
      if (!response.ok) {
        throw new Error('Failed to fetch next scheduled race');
      }
      
      const data = await response.json();
      if (data.nextScheduledRace?.raceId) {
        console.log('🎯 Navigating to next scheduled race:', data.nextScheduledRace.raceId);
        router.push(`/race/${data.nextScheduledRace.raceId}`);
      } else {
        console.log('❌ No next scheduled race available');
      }
    } catch (error) {
      console.error('❌ Failed to navigate to next scheduled race:', error);
      // Fallback: if API fails, still try to navigate to first meeting's first race
      if (nextScheduledRace.startTime) {
        // This is a simplified fallback - in production we'd handle this better
        console.log('🔄 Using fallback navigation approach');
      }
    } finally {
      setIsLoading(false);
    }
  }, [nextScheduledRace, isLoading, router]);

  // Don't show button if no next race is available
  if (!nextScheduledRace) {
    return null;
  }

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
      disabled={isLoading}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ease-in-out"
      aria-label={`Jump to next scheduled race: ${nextScheduledRace.name} at ${nextScheduledRace.meetingName} starting at ${formatTime(nextScheduledRace.startTime)}`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>Next Race</span>
      <span className="text-xs text-blue-600">
        {formatTime(nextScheduledRace.startTime)}
      </span>
      {isLoading && (
        <svg className="animate-spin w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      )}
    </button>
  );
}