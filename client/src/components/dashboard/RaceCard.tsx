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
  onClick?: (raceId: string) => void;
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
          `Race ${race.raceNumber} status changed from ${previousStatus} to ${race.status}. ${getRaceStatusDescription(race.status)}`;
      }
      
      // Trigger visual transition animation
      setIsTransitioning(true);
      const timer = setTimeout(() => setIsTransitioning(false), 300);
      return () => clearTimeout(timer);
    }
    setPreviousStatus(race.status);
  }, [race.status, previousStatus, race.raceNumber]);

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
          {renderEnhancedStatusBadge(race.status)}
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
    prevProps.race.$id === nextProps.race.$id &&
    prevProps.race.$updatedAt === nextProps.race.$updatedAt &&
    prevProps.race.status === nextProps.race.status &&
    prevProps.race.startTime === nextProps.race.startTime &&
    prevProps.race.name === nextProps.race.name &&
    prevProps.race.raceNumber === nextProps.race.raceNumber
  );
  
  const propsEqual = prevProps.onClick === nextProps.onClick;
  
  // Only re-render if race data or onClick handler changed
  return raceFieldsEqual && propsEqual;
});