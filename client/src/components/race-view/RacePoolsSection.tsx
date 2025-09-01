'use client';

import { memo } from 'react';
import { useRacePoolData } from '@/hooks/useRacePoolData';
import type { RacePoolData } from '@/types/racePools';

interface RacePoolsSectionProps {
  raceId: string;
  poolData?: RacePoolData;
  className?: string;
}

const formatPoolAmount = (cents: number): string => {
  const dollars = Math.round(cents / 100);
  return dollars.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
};

export const RacePoolsSection = memo(function RacePoolsSection({ 
  raceId, 
  poolData,
  className = '' 
}: RacePoolsSectionProps) {
  const { poolData: livePoolData, isLoading, error } = useRacePoolData(raceId);
  
  const currentPoolData = livePoolData || poolData;

  if (isLoading) {
    return (
      <div className={`${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-16 mb-2"></div>
          <div className="h-6 bg-gray-200 rounded w-24 mb-4"></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-red-600 text-sm ${className}`}>
        <div className="text-xs text-gray-500 mb-1">Pool Data</div>
        <div>Error loading pool data</div>
      </div>
    );
  }

  if (!currentPoolData) {
    return (
      <div className={`${className}`}>
        <div className="text-xs text-gray-500 mb-1">Pool Data</div>
        <div className="text-sm text-gray-400">No pool data available</div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
        Pool Breakdown
      </div>
      
      {/* Total Pool */}
      <div className="text-center mb-4">
        <div className="text-2xl font-bold text-gray-900">
          {currentPoolData.currency}{formatPoolAmount(currentPoolData.totalRacePool)}
        </div>
        <div className="text-xs text-gray-500">Total Pool</div>
      </div>

      {/* Individual Pool Breakdown */}
      <div className="space-y-2">
        {currentPoolData.winPoolTotal > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500 uppercase">Win</span>
            <span className="text-sm font-bold text-gray-900">
              ${formatPoolAmount(currentPoolData.winPoolTotal)}
            </span>
          </div>
        )}
        
        {currentPoolData.placePoolTotal > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500 uppercase">Place</span>
            <span className="text-sm font-bold text-gray-900">
              ${formatPoolAmount(currentPoolData.placePoolTotal)}
            </span>
          </div>
        )}
        
        {currentPoolData.quinellaPoolTotal > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500 uppercase">Quinella</span>
            <span className="text-sm font-bold text-gray-900">
              ${formatPoolAmount(currentPoolData.quinellaPoolTotal)}
            </span>
          </div>
        )}
        
        {currentPoolData.trifectaPoolTotal > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500 uppercase">Trifecta</span>
            <span className="text-sm font-bold text-gray-900">
              ${formatPoolAmount(currentPoolData.trifectaPoolTotal)}
            </span>
          </div>
        )}
        
        {currentPoolData.exactaPoolTotal > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500 uppercase">Exacta</span>
            <span className="text-sm font-bold text-gray-900">
              ${formatPoolAmount(currentPoolData.exactaPoolTotal)}
            </span>
          </div>
        )}
        
        {currentPoolData.first4PoolTotal > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-gray-500 uppercase">First4</span>
            <span className="text-sm font-bold text-gray-900">
              ${formatPoolAmount(currentPoolData.first4PoolTotal)}
            </span>
          </div>
        )}
      </div>

      {/* Last Updated */}
      <div className="text-xs text-gray-500 text-center mt-3 pt-3 border-t border-gray-200">
        Last updated: {new Date(currentPoolData.lastUpdated).toLocaleTimeString('en-US', { 
          hour12: true, 
          hour: 'numeric', 
          minute: '2-digit', 
          second: '2-digit' 
        })}
      </div>
    </div>
  );
});