'use client';

import { memo, useRef, useEffect, useState } from 'react';
import { Race } from '@/types/meetings';
import { 
  getRaceStatusBadgeStyles, 
  shouldAnnounceStatusChange,
  getRaceStatusDescription 
} from '@/services/races';

interface RaceCardProps {
  race: Race;
  onClick?: (race_id: string) => void;
}

function RaceCardComponent({ race, onClick }: RaceCardProps) {
  const [previousStatus, setPreviousStatus] = useState<string>('');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const liveRegionRef = useRef<HTMLDivElement>(null);
  const statusAnnouncementRef = useRef<HTMLDivElement>(null);

  // Handle status change announcements for accessibility
  useEffect(() => {
    if (previousStatus && shouldAnnounceStatusChange(previousStatus, race.status)) {
      // Announce status change to screen readers
      if (statusAnnouncementRef.current) {
        statusAnnouncementRef.current.textContent = 
          `Race ${race.race_number} status changed from ${previousStatus} to ${race.status}. ${getRaceStatusDescription(race.status)}`;
      }
      
      // Trigger visual transition animation
      setIsTransitioning(true);
      const timer = setTimeout(() => setIsTransitioning(false), 300);
      return () => clearTimeout(timer);
    }
    setPreviousStatus(race.status);
  }, [race.status, previousStatus, race.race_number]);

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
      onClick(race.race_id);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if ((event.key === 'Enter' || event.key === ' ') && onClick) {
      event.preventDefault();
      onClick(race.race_id);
    }
  };

  const renderEnhancedStatusBadge = (status: string) => {
    const styles = getRaceStatusBadgeStyles(status);
    
    // Use sanitized status for display and validation
    const displayStatus = styles.status;
    const isStatusValid = styles.isValid;
    
    return (
      <div className="relative">
        <span 
          className={`${
            styles.containerClass
          } ${isTransitioning ? 'race-status-transition' : ''} ${
            !isStatusValid ? 'border-dashed opacity-90' : ''
          }`}
          role="status"
          aria-label={`${styles.ariaLabel}${!isStatusValid ? '. Status was corrected from invalid value.' : ''}`}
          title={`${getRaceStatusDescription(displayStatus)}${!isStatusValid ? ' (Status was automatically corrected)' : ''}`}
        >
          {/* Status icon with appropriate animation */}
          {displayStatus === 'Running' && (
            <span className="status-icon status-icon-running" aria-hidden="true"></span>
          )}
          {displayStatus === 'Closed' && (
            <span className="status-icon status-icon-closed" aria-hidden="true"></span>
          )}
          
          {/* Validation warning icon for invalid statuses */}
          {!isStatusValid && (
            <span 
              className="w-2 h-2 bg-orange-400 rounded-full mr-1.5 flex-shrink-0" 
              aria-hidden="true"
              title="Status was automatically corrected"
            ></span>
          )}
          
          {/* Status text */}
          <span className="font-medium">{displayStatus}</span>
          
          {/* Emoji indicator for color-blind users */}
          <span 
            className="ml-1.5" 
            aria-hidden="true"
            role="img"
          >
            {styles.icon}
          </span>
        </span>
        
        {/* Live region for status change announcements */}
        <div 
          ref={statusAnnouncementRef}
          className="sr-only"
          aria-live={styles.urgency}
          aria-atomic="true"
        ></div>
        
        {/* Live region for status validation warnings (development only) */}
        {process.env.NODE_ENV === 'development' && !isStatusValid && (
          <div 
            className="sr-only"
            aria-live="polite"
            role="status"
          >
            Warning: Race status was corrected from &quot;{status}&quot; to &quot;{displayStatus}&quot;
          </div>
        )}
      </div>
    );
  };

  // Get status configuration for background coloring - matches raceStatusConfig.ts
  const normalizedStatus = (typeof race.status === 'string' ? race.status : 'unknown').toLowerCase();
  
  // Map statuses to colors that match the race page status configuration
  const getStatusColors = (status: string) => {
    switch (status) {
      case 'open':
        return {
          border: 'border-green-400',
          bg: 'bg-green-50',
          hover: 'hover:bg-green-100'
        };
      case 'closed':
      case 'started':
      case 'running':
        return {
          border: 'border-yellow-400',
          bg: 'bg-yellow-50',
          hover: 'hover:bg-yellow-100'
        };
      case 'interim':
        return {
          border: 'border-blue-400',
          bg: 'bg-blue-50',
          hover: 'hover:bg-blue-100'
        };
      case 'final':
      case 'finalized':
      case 'finished':
      case 'complete':
      case 'completed':
        return {
          border: 'border-purple-400',
          bg: 'bg-purple-50',
          hover: 'hover:bg-purple-100'
        };
      case 'abandoned':
        return {
          border: 'border-red-400',
          bg: 'bg-red-50',
          hover: 'hover:bg-red-100'
        };
      case 'postponed':
        return {
          border: 'border-orange-400',
          bg: 'bg-orange-50',
          hover: 'hover:bg-orange-100'
        };
      default:
        return {
          border: 'border-gray-300',
          bg: 'bg-slate-50',
          hover: 'hover:bg-slate-100'
        };
    }
  };

  const statusColors = getStatusColors(normalizedStatus);

  return (
    <div 
      className={`border-l-4 ${statusColors.border} ${statusColors.bg} p-4 ${statusColors.hover} transition-colors rounded-lg border border-slate-200/50 shadow-sm ${
        onClick ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50' : ''
      }`}
      role={onClick ? 'button' : 'article'}
      tabIndex={onClick ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-labelledby={`race-${race.race_id}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <span 
              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-800 text-sm font-bold"
              aria-label={`Race number ${race.race_number}`}
            >
              {race.race_number}
            </span>
          </div>
          
          <div className="flex-1 min-w-0">
            <h4
              id={`race-${race.race_id}`}
              className="text-sm font-medium text-gray-900 truncate"
            >
              {race.name}
            </h4>
          </div>
        </div>
        
        <div className="flex-shrink-0">
          {renderEnhancedStatusBadge(race.status)}
        </div>
      </div>
      
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 min-w-0 flex-1">
          <span className="font-medium text-gray-600">
            ID: {race.race_id}
          </span>
          {race.distance && (
            <span className="flex items-center">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              {race.distance}m
            </span>
          )}
          {race.runner_count && (
            <span className="flex items-center">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {race.runner_count} runners
            </span>
          )}
          {race.track_condition && (
            <span className="flex items-center">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.002 4.002 0 003 15z" />
              </svg>
              Track: {race.track_condition}
            </span>
          )}
        </div>
        
        <time 
          dateTime={race.start_time}
          className="font-medium text-gray-700 ml-3 flex-shrink-0"
          aria-label={`Race starts at ${formatTime(race.start_time)}`}
        >
          {formatTime(race.start_time)}
        </time>
      </div>
      
      {/* Global live region for accessibility announcements */}
      <div 
        ref={liveRegionRef}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      ></div>
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders
// Enhanced comparison for real-time status updates
export const RaceCard = memo(RaceCardComponent, (prevProps, nextProps) => {
  // Custom comparison function optimized for status changes and real-time updates
  const raceFieldsEqual = (
    prevProps.race.race_id === nextProps.race.race_id &&
    prevProps.race.updated_at === nextProps.race.updated_at &&
    prevProps.race.status === nextProps.race.status &&
    prevProps.race.start_time === nextProps.race.start_time &&
    prevProps.race.name === nextProps.race.name &&
    prevProps.race.race_number === nextProps.race.race_number
  );
  
  const propsEqual = prevProps.onClick === nextProps.onClick;
  
  // Only re-render if race data or onClick handler changed
  return raceFieldsEqual && propsEqual;
});