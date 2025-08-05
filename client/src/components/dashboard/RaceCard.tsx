'use client';

import { memo } from 'react';
import { Race } from '@/types/meetings';
import { getRaceStatusColor } from '@/services/races';

interface RaceCardProps {
  race: Race;
  onClick?: (raceId: string) => void;
}

function RaceCardComponent({ race, onClick }: RaceCardProps) {
  const formatTime = (dateTimeString: string) => {
    try {
      const date = new Date(dateTimeString);
      if (isNaN(date.getTime())) {
        return 'TBA';
      }
      return date.toLocaleTimeString('en-AU', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return 'TBA';
    }
  };

  const handleClick = () => {
    if (onClick) {
      onClick(race.raceId);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if ((event.key === 'Enter' || event.key === ' ') && onClick) {
      event.preventDefault();
      onClick(race.raceId);
    }
  };

  const getRaceStatusDisplay = (status: string) => {
    const statusColorClass = getRaceStatusColor(status);
    const bgColorClass = status === 'Running' ? 'bg-blue-50' : 
                        status === 'Open' ? 'bg-green-50' :
                        status === 'Closed' ? 'bg-yellow-50' : 'bg-gray-50';
    
    return (
      <span 
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bgColorClass} ${statusColorClass}`}
        aria-label={`Race status: ${status}`}
      >
        {status === 'Running' && <span className="w-2 h-2 bg-blue-400 rounded-full mr-1 animate-pulse"></span>}
        {status}
      </span>
    );
  };

  return (
    <div 
      className={`border-l-4 border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors ${
        onClick ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50' : ''
      }`}
      role={onClick ? 'button' : 'article'}
      tabIndex={onClick ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-labelledby={`race-${race.$id}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <span 
              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-800 text-sm font-bold"
              aria-label={`Race number ${race.raceNumber}`}
            >
              {race.raceNumber}
            </span>
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 
              id={`race-${race.$id}`}
              className="text-sm font-medium text-gray-900 truncate"
            >
              {race.name}
            </h4>
          </div>
        </div>
        
        <div className="flex-shrink-0">
          {getRaceStatusDisplay(race.status)}
        </div>
      </div>
      
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="truncate">
          ID: {race.raceId}
        </span>
        
        <time 
          dateTime={race.startTime}
          className="font-medium text-gray-700 ml-2"
          aria-label={`Race starts at ${formatTime(race.startTime)}`}
        >
          {formatTime(race.startTime)}
        </time>
      </div>
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders
export const RaceCard = memo(RaceCardComponent, (prevProps, nextProps) => {
  // Custom comparison function for optimization
  return (
    prevProps.race.$id === nextProps.race.$id &&
    prevProps.race.$updatedAt === nextProps.race.$updatedAt &&
    prevProps.race.status === nextProps.race.status &&
    prevProps.race.startTime === nextProps.race.startTime &&
    prevProps.onClick === nextProps.onClick
  );
});