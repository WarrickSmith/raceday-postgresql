'use client';

import { useState, useEffect } from 'react';
import { getPollingStatus } from '@/app/actions/race-polling';

interface PollingStatus {
  totalActiveRaces: number;
  racesNeedingPolling: number;
  recommendedStrategy: {
    strategy: 'batch' | 'individual' | 'none';
    raceCount: number;
    functionToCall: string | null;
    reason: string;
    urgency: 'critical' | 'high' | 'normal';
    expectedLatency: string;
  };
  raceBreakdown: {
    critical: number;
    high: number;
    normal: number;
  };
  nextRecommendedPoll: string;
}

export function PollingStatusIndicator() {
  const [status, setStatus] = useState<PollingStatus | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchStatus = async () => {
      try {
        const pollingStatus = await getPollingStatus();
        setStatus(pollingStatus);
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Failed to fetch polling status:', error);
      }
    };

    // Initial fetch
    fetchStatus();

    // Poll every 30 seconds for status updates
    interval = setInterval(fetchStatus, 30000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  if (!status) {
    return (
      <div className="fixed bottom-4 right-4 bg-gray-100 text-gray-600 px-3 py-2 rounded-lg shadow-md text-xs">
        🔄 Loading polling status...
      </div>
    );
  }

  const getStatusColor = () => {
    if (status.raceBreakdown.critical > 0) return 'bg-red-100 text-red-700 border-red-200';
    if (status.raceBreakdown.high > 0) return 'bg-orange-100 text-orange-700 border-orange-200';
    if (status.racesNeedingPolling > 0) return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-green-100 text-green-700 border-green-200';
  };

  const getStatusIcon = () => {
    if (status.raceBreakdown.critical > 0) return '🔴';
    if (status.raceBreakdown.high > 0) return '🟠';
    if (status.racesNeedingPolling > 0) return '🔵';
    return '🟢';
  };

  return (
    <div className={`fixed bottom-4 right-4 ${getStatusColor()} px-3 py-2 rounded-lg shadow-md text-xs border cursor-pointer transition-all`}
         onClick={() => setIsExpanded(!isExpanded)}>
      
      {/* Compact View */}
      <div className="flex items-center space-x-2">
        <span>{getStatusIcon()}</span>
        <span className="font-medium">
          Polling: {status.racesNeedingPolling}/{status.totalActiveRaces}
        </span>
        <span className="text-xs opacity-75">
          {isExpanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Expanded View */}
      {isExpanded && (
        <div className="mt-2 pt-2 border-t border-current/20 space-y-1">
          <div className="flex justify-between">
            <span>Strategy:</span>
            <span className="font-medium capitalize">{status.recommendedStrategy.strategy}</span>
          </div>
          
          {status.raceBreakdown.critical > 0 && (
            <div className="flex justify-between text-red-700">
              <span>Critical:</span>
              <span className="font-medium">{status.raceBreakdown.critical}</span>
            </div>
          )}
          
          {status.raceBreakdown.high > 0 && (
            <div className="flex justify-between text-orange-700">
              <span>High:</span>
              <span className="font-medium">{status.raceBreakdown.high}</span>
            </div>
          )}
          
          <div className="flex justify-between">
            <span>Next poll:</span>
            <span className="font-medium">{status.nextRecommendedPoll}</span>
          </div>
          
          <div className="text-xs opacity-75 pt-1 border-t border-current/20">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </div>
          
          {status.recommendedStrategy.reason && (
            <div className="text-xs opacity-90 max-w-48">
              {status.recommendedStrategy.reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}