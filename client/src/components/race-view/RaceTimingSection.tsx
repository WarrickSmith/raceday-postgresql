'use client';

import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { useRace } from '@/contexts/RaceContext';
import { useRealtimeRace } from '@/hooks/useRealtimeRace';
import { getStatusConfig } from '@/utils/raceStatusConfig';
import type { RaceStatus } from '@/types/racePools';

interface RaceTimingSectionProps {
  raceStartTime?: string;
  raceStatus?: RaceStatus;
  className?: string;
  showCountdown?: boolean;
}

export const RaceTimingSection = memo(function RaceTimingSection({ 
  raceStartTime,
  raceStatus,
  className = '',
  showCountdown = true
}: RaceTimingSectionProps) {
  const { raceData } = useRace();
  
  const { race: liveRace } = useRealtimeRace({ 
    initialRace: raceData?.race || {
      $id: '',
      $createdAt: '',
      $updatedAt: '',
      raceId: '',
      raceNumber: 0,
      name: '',
      startTime: raceStartTime || '',
      meeting: '',
      status: raceStatus || 'open' as const,
      distance: 0,
      trackCondition: ''
    } 
  });

  const [timeRemaining, setTimeRemaining] = useState<{
    total: number;
    hours: number;
    minutes: number;
    seconds: number;
  }>({ total: 0, hours: 0, minutes: 0, seconds: 0 });

  const [closedTime, setClosedTime] = useState<string | null>(null);

  const currentStartTime = liveRace?.startTime || raceStartTime;
  const currentStatus = liveRace?.status?.toLowerCase() as RaceStatus || raceStatus;

  const calculateTimeRemaining = useCallback(() => {
    if (!currentStartTime) return;

    try {
      const now = new Date();
      const target = new Date(currentStartTime);
      if (isNaN(target.getTime())) return;
      
      const difference = target.getTime() - now.getTime();

      if (difference <= 0) {
        setTimeRemaining({ total: 0, hours: 0, minutes: 0, seconds: 0 });
        
        // Set closed time if race should be closed
        if (currentStatus === 'closed' || currentStatus === 'interim' || currentStatus === 'final') {
          const closedAt = new Date(target.getTime() - (5 * 60 * 1000)); // 5 minutes before start
          setClosedTime(closedAt.toLocaleTimeString('en-US', { 
            hour12: true, 
            hour: 'numeric', 
            minute: '2-digit' 
          }));
        }
        return;
      }

      const hours = Math.floor(difference / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setTimeRemaining({ total: difference, hours, minutes, seconds });

      // Clear closed time if race is still open
      if (currentStatus === 'open') {
        setClosedTime(null);
      }
    } catch (error) {
      setTimeRemaining({ total: 0, hours: 0, minutes: 0, seconds: 0 });
    }
  }, [currentStartTime, currentStatus]);

  useEffect(() => {
    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [calculateTimeRemaining]);

  const formatTime = useMemo(() => {
    const { hours, minutes, seconds } = timeRemaining;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [timeRemaining]);

  const urgencyClass = useMemo(() => {
    const { total } = timeRemaining;
    
    if (total <= 60000) return 'text-red-600 font-bold animate-pulse'; // 1 minute
    if (total <= 300000) return 'text-orange-600 font-semibold'; // 5 minutes
    if (total <= 900000) return 'text-yellow-600'; // 15 minutes
    
    return 'text-gray-700';
  }, [timeRemaining]);

  const statusConfig = getStatusConfig(currentStatus || 'open');
  const showTimer = showCountdown && currentStatus === 'open' && timeRemaining.total > 0;

  return (
    <div className={`text-center space-y-3 ${className}`}>
      {/* Race Status */}
      <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-xl ${statusConfig.bgColor} shadow-md`}>
        <span className="text-xl">{statusConfig.icon}</span>
        <span className={`text-xl font-bold ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
      </div>
      
      {/* Countdown Timer */}
      {showTimer && (
        <div>
          <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Time to Start
          </div>
          <div className={`text-3xl font-bold ${urgencyClass}`}>
            {formatTime}
          </div>
        </div>
      )}

      {/* Closed Time */}
      {closedTime && (currentStatus === 'closed' || currentStatus === 'interim' || currentStatus === 'final') && (
        <div>
          <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Closed
          </div>
          <div className="text-lg font-bold text-gray-900">
            {closedTime}
          </div>
        </div>
      )}

      {/* Race Start Time */}
      {currentStartTime && (
        <div className="text-sm text-gray-600">
          <div className="text-xs text-gray-400 mb-1">Scheduled Start</div>
          <time dateTime={currentStartTime}>
            {new Date(currentStartTime).toLocaleTimeString('en-US', { 
              hour12: true, 
              hour: 'numeric', 
              minute: '2-digit' 
            })}
          </time>
        </div>
      )}
    </div>
  );
});