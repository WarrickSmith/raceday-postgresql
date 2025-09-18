'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Meeting } from '@/types/meetings';
import { useSubscriptionCleanup } from '@/contexts/SubscriptionCleanupContext';

interface NextScheduledRaceButtonProps {
  meetings: Meeting[];
  isRealtimeConnected: boolean;
  raceUpdateSignal: number;
}

interface NextScheduledRace {
  raceId: string;
  name: string;
  startTime: string;
  meetingName: string;
  raceNumber: number;
}

export function NextScheduledRaceButton({ meetings, isRealtimeConnected, raceUpdateSignal }: NextScheduledRaceButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [nextScheduledRace, setNextScheduledRace] = useState<NextScheduledRace | null>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { requestCleanup } = useSubscriptionCleanup();

  // Fetch the next scheduled race from the API
  const fetchNextScheduledRace = useCallback(async () => {
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
  }, []);

  // Setup intelligent polling based on race timing
  const setupIntelligentPolling = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    let pollInterval = 60000; // Default 1 minute
    
    if (nextScheduledRace) {
      const now = new Date();
      const raceTime = new Date(nextScheduledRace.startTime);
      const minutesUntilRace = (raceTime.getTime() - now.getTime()) / (1000 * 60);
      
      // Increase polling frequency as race approaches
      if (minutesUntilRace <= 1) {
        pollInterval = 10000; // 10 seconds when race is within 1 minute
      } else if (minutesUntilRace <= 5) {
        pollInterval = 30000; // 30 seconds when race is within 5 minutes
      } else if (minutesUntilRace <= 15) {
        pollInterval = 60000; // 1 minute when race is within 15 minutes
      }
    }

    fetchTimeoutRef.current = setTimeout(() => {
      fetchNextScheduledRace().then(() => {
        setupIntelligentPolling(); // Schedule next poll
      });
    }, pollInterval);
  }, [nextScheduledRace, fetchNextScheduledRace]);

  // Initial fetch and intelligent polling bootstrap
  useEffect(() => {
    let isActive = true;

    fetchNextScheduledRace().then(() => {
      if (isActive) {
        setupIntelligentPolling();
      }
    });

    return () => {
      isActive = false;
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = null;
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    };
  }, [fetchNextScheduledRace, setupIntelligentPolling]);

  // Update polling when race changes
  useEffect(() => {
    setupIntelligentPolling();
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [setupIntelligentPolling]);

  // React to shared real-time update signals from meetings subscription
  useEffect(() => {
    if (!raceUpdateSignal) {
      return;
    }

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      fetchNextScheduledRace().finally(() => {
        debounceTimeoutRef.current = null;
      });
    }, 2000);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    };
  }, [raceUpdateSignal, fetchNextScheduledRace]);

  // Reset next race when meetings data clears
  useEffect(() => {
    if (meetings.length === 0) {
      setNextScheduledRace(null);
    }
  }, [meetings.length]);

  // Handle real-time countdown updates and race transitions
  useEffect(() => {
    if (!nextScheduledRace) return;

    let hasTriggeredNextFetch = false;
    const updateInterval = setInterval(() => {
      const now = new Date();
      const raceTime = new Date(nextScheduledRace.startTime);
      const diff = raceTime.getTime() - now.getTime();
      
      // If race has started (passed start time), fetch updated next race ONLY ONCE
      if (diff <= 0 && !hasTriggeredNextFetch) {
        console.log('🏁 Race has started, fetching next scheduled race');
        hasTriggeredNextFetch = true;
        fetchNextScheduledRace();
        return;
      }
      
      // Force re-render to update countdown display
      // This is handled by the state update in getTimeUntilRace
    }, 1000); // Update every second for countdown

    return () => clearInterval(updateInterval);
  }, [nextScheduledRace, fetchNextScheduledRace]);

  // Handle navigation to next scheduled race
  const handleNavigateToNextRace = useCallback(async () => {
    if (!nextScheduledRace || isLoading) return;

    setIsLoading(true);
    
    try {
      console.log('🎯 Navigating to next scheduled race:', nextScheduledRace.raceId);
      await requestCleanup({ reason: 'next-scheduled-button' });
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

  // Calculate time until race for dynamic display
  const getTimeUntilRace = (raceTime: string) => {
    const now = new Date();
    const race = new Date(raceTime);
    const diff = race.getTime() - now.getTime();
    
    if (diff <= 0) return 'Starting now';
    
    const totalMinutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    if (totalMinutes < 1) {
      return `${seconds}s`;
    } else if (totalMinutes < 60) {
      return `${totalMinutes}m`;
    } else {
      const hours = Math.floor(totalMinutes / 60);
      const remainingMinutes = totalMinutes % 60;
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }
  };

  // Handle edge cases for race status
  const getRaceStatusIndicator = () => {
    if (!nextScheduledRace) return null;
    
    const now = new Date();
    const raceTime = new Date(nextScheduledRace.startTime);
    const diff = raceTime.getTime() - now.getTime();
    
    if (diff <= 0) {
      return (
        <span className="text-xs font-medium text-yellow-200 animate-pulse">
          • Starting
        </span>
      );
    }
    
    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes <= 5) {
      return (
        <span className="text-xs font-medium text-green-200">
          • Soon
        </span>
      );
    }
    
    return null;
  };

  return (
    <button
      onClick={handleNavigateToNextRace}
      disabled={isDisabled}
      className={`inline-flex items-center gap-3 px-6 py-3 text-base font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 ease-in-out shadow-md ${
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
      <div className="relative">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {/* Real-time connection indicator */}
        {!isDisabled && (
          <div className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
            isRealtimeConnected ? 'bg-green-400' : 'bg-red-400'
          }`} title={isRealtimeConnected ? 'Real-time connected' : 'Offline mode'} />
        )}
      </div>
      
      {nextScheduledRace ? (
        <div className="flex flex-col items-start">
          {/* Top row: Next Race text, countdown, time, and meeting name - all on one line */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">Next Race</span>
            <span className={`text-sm font-medium ${isDisabled ? 'text-gray-400' : 'text-blue-100'}`}>
              in {getTimeUntilRace(nextScheduledRace.startTime)}
            </span>
            {getRaceStatusIndicator()}
            <span className={`text-xs font-normal ${isDisabled ? 'text-gray-400' : 'text-blue-200'}`}>
              @ {formatTime(nextScheduledRace.startTime)}
            </span>
            <span className={`text-sm font-normal ${isDisabled ? 'text-gray-400' : 'text-blue-100'}`}>
              in {nextScheduledRace.meetingName}
            </span>
          </div>
          {/* Race details row */}
          <span className={`text-sm font-normal leading-tight ${isDisabled ? 'text-gray-400' : 'text-blue-100'}`}>
            R{nextScheduledRace.raceNumber} - {nextScheduledRace.name}
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
