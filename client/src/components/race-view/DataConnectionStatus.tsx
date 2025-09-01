'use client';

import { memo, useState, useEffect } from 'react';
import { useRealtimeRace } from '@/hooks/useRealtimeRace';
import { useRacePoolData } from '@/hooks/useRacePoolData';
import { useRace } from '@/contexts/RaceContext';

interface DataConnectionStatusProps {
  className?: string;
}

export const DataConnectionStatus = memo(function DataConnectionStatus({ 
  className = '' 
}: DataConnectionStatusProps) {
  const { raceData } = useRace();
  const { isConnected } = useRealtimeRace({ 
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
  
  const { isLoading: poolLoading } = useRacePoolData(
    raceData?.race?.raceId || ''
  );

  const [renderCount, setRenderCount] = useState(0);
  const [updateCount, setUpdateCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    setRenderCount(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (isConnected && !poolLoading) {
      setUpdateCount(prev => prev + 1);
      setLastUpdate(new Date());
    }
  }, [isConnected, poolLoading, raceData]);

  const formatTime = (date: Date | null) => {
    if (!date) return '--:--:--';
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  return (
    <div className={`flex items-center gap-4 text-xs text-gray-600 ${className}`}>
      {/* Connection Status */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`}></div>
        <span>{isConnected ? 'Live' : 'Disconnected'}</span>
      </div>

      {/* Last Update */}
      <div className="flex items-center gap-1">
        <span className="text-gray-500">Updated:</span>
        <span className="font-mono">{formatTime(lastUpdate)}</span>
      </div>

      {/* Render Count */}
      <div className="flex items-center gap-1">
        <span className="text-gray-500">Renders:</span>
        <span className="font-mono">{renderCount}</span>
      </div>

      {/* Update Count */}
      <div className="flex items-center gap-1">
        <span className="text-gray-500">Updates:</span>
        <span className="font-mono">{updateCount}</span>
      </div>

      {/* Loading Status */}
      {poolLoading && (
        <div className="flex items-center gap-1 text-orange-600">
          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          <span>Loading...</span>
        </div>
      )}
    </div>
  );
});