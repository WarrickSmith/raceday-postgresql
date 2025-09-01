'use client';

import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { useRace } from '@/contexts/RaceContext';
import { useRealtimeRace } from '@/hooks/useRealtimeRace';
import { getStatusConfig, getStatusBadgeClasses } from '@/utils/raceStatusConfig';
import type { RaceStatus } from '@/types/racePools';

interface RaceStatusSectionProps {
  className?: string;
}

export const RaceStatusSection = memo(function RaceStatusSection({ 
  className = '' 
}: RaceStatusSectionProps) {
  const { raceData } = useRace();
  
  const { race: liveRace } = useRealtimeRace({ 
    initialRace: raceData?.race || {
      $id: '',
      $createdAt: '',
      $updatedAt: '',
      raceId: '',
      raceNumber: 0,
      name: '',
      startTime: '',
      meeting: '',
      status: 'open' as const,
      distance: 0,
      trackCondition: ''
    } 
  });

  const [timeToStart, setTimeToStart] = useState<string | null>(null);

  const updateCountdown = useCallback(() => {
    if (!liveRace) return;

    try {
      const status = liveRace.status?.toLowerCase();
      if (status === 'abandoned' || status === 'final' || status === 'finalized') {
        setTimeToStart(null);
        return;
      }
      
      const now = new Date();
      const raceTime = new Date(liveRace.startTime);
      if (isNaN(raceTime.getTime())) {
        setTimeToStart(null);
        return;
      }
      
      const diff = raceTime.getTime() - now.getTime();
      
      if (diff <= 0) {
        const delayDiff = Math.abs(diff);
        const delayMinutes = Math.floor(delayDiff / (1000 * 60));
        const delaySeconds = Math.floor((delayDiff % (1000 * 60)) / 1000);
        
        if (liveRace.status === 'Open' && delayDiff > 30000) {
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
      setTimeToStart(null);
    }
  }, [liveRace?.startTime, liveRace?.status]);

  useEffect(() => {
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [updateCountdown]);

  const statusConfig = useMemo(() => {
    if (!liveRace?.status) return getStatusConfig('open');
    return getStatusConfig(liveRace.status.toLowerCase() as RaceStatus);
  }, [liveRace?.status]);

  if (!liveRace) {
    return (
      <div className={`${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-24 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-16"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-end space-y-2 ${className}`}>
      <span className={getStatusBadgeClasses(liveRace.status)}>
        {statusConfig.label}
      </span>
      
      {timeToStart && (
        <div className="text-right">
          <div className="text-xs text-gray-500 mb-1">
            {timeToStart === 'Started' ? 'Status' : 'Starts in'}
          </div>
          <div className={`text-sm font-mono font-bold ${
            timeToStart === 'Started' 
              ? 'text-green-600' 
              : timeToStart.includes('Delayed') 
              ? 'text-red-600' 
              : 'text-blue-600'
          }`}>
            {timeToStart}
          </div>
        </div>
      )}
    </div>
  );
});