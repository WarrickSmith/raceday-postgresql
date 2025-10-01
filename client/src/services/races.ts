import { Race } from '@/types/meetings';

// Type declaration for debug function on window
declare global {
  interface Window {
    debugRaceFetch?: (meetingId?: string) => Promise<Race[]>;
  }
}

// Service migrated to use Next.js API routes instead of direct Appwrite calls
// This eliminates CORS issues and keeps API keys server-side

/**
 * Race data service functions for client-side operations
 */

// Debug helper - only available in development
if (process.env.NODE_ENV === 'development') {
  if (typeof window !== 'undefined') {
    window.debugRaceFetch = async (meetingId = '44f3707e-49a3-4b16-b6c3-456b8a1f9e9d') => {
      try {
        console.log('🔍 Debug: Testing race fetch for meetingId:', meetingId);
        const result = await fetchRacesForMeeting(meetingId);
        console.log('🔍 Debug: Race fetch result:', result.length, 'races');
        return result;
      } catch (error) {
        console.error('🔍 Debug: Race fetch failed:', error);
        return [];
      }
    };
  }
}

export interface RaceServiceError {
  message: string;
  meetingId?: string;
  code?: string;
}

/**
 * Fetch races for a specific meeting
 * @param meetingId - The meeting ID to fetch races for
 * @returns Promise<Race[]> - Array of races ordered by race number
 */
export async function fetchRacesForMeeting(meetingId: string): Promise<Race[]> {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('🏁 Fetching races for meetingId:', meetingId);
    }

    // Call Next.js API route instead of Appwrite directly
    const response = await fetch(`/api/meetings/${meetingId}/races`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch races: ${response.statusText}`);
    }

    const data = await response.json() as { races: Race[]; total: number; timestamp: string };

    if (process.env.NODE_ENV === 'development') {
      console.log('🏁 API response:', data.races.length, 'races found');
    }

    return data.races;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('🚨 Error fetching races:', error);
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to fetch races: ${errorMessage}`);
  }
}

/**
 * Validate race data structure
 * @param race - Race object to validate
 * @returns boolean - True if valid race object
 */
export function validateRaceData(race: unknown): race is Race {
  return (
    typeof race === 'object' &&
    race !== null &&
    '$id' in race &&
    'raceId' in race &&
    'raceNumber' in race &&
    'name' in race &&
    'startTime' in race &&
    'meeting' in race &&
    'status' in race &&
    typeof (race as Record<string, unknown>).$id === 'string' &&
    typeof (race as Record<string, unknown>).raceId === 'string' &&
    typeof (race as Record<string, unknown>).raceNumber === 'number' &&
    typeof (race as Record<string, unknown>).name === 'string' &&
    typeof (race as Record<string, unknown>).startTime === 'string' &&
    typeof (race as Record<string, unknown>).meeting === 'object' &&
    typeof (race as Record<string, unknown>).status === 'string'
  );
}

/**
 * Race status enum values
 */
export const RACE_STATUS = {
  OPEN: 'Open',
  CLOSED: 'Closed',
  RUNNING: 'Running',
  INTERIM: 'Interim',
  FINALIZED: 'Finalized',
  ABANDONED: 'Abandoned',
} as const;

export type RaceStatus = typeof RACE_STATUS[keyof typeof RACE_STATUS];

/**
 * Sanitize status value for safe logging to prevent XSS/information disclosure
 * @param status - Raw status value to sanitize
 * @returns string - Safe version for logging
 */
function sanitizeStatusForLogging(status: unknown): string {
  if (status === null) return '[null]';
  if (status === undefined) return '[undefined]';
  if (typeof status === 'string') {
    // Limit length and remove potentially dangerous characters
    return status.slice(0, 50).replace(/[<>&"']/g, '');
  }
  if (typeof status === 'number') return String(status);
  if (typeof status === 'boolean') return String(status);
  return '[object]';
}

/**
 * Validate if a status string is a valid race status
 * @param status - Status string to validate
 * @returns boolean - True if status is valid
 */
export function isValidRaceStatus(status: unknown): status is RaceStatus {
  return typeof status === 'string' && 
         Object.values(RACE_STATUS).includes(status as RaceStatus);
}

/**
 * Sanitize and validate race status with fallback
 * @param status - Status to validate and sanitize
 * @param fallback - Fallback status if invalid (default: 'Open')
 * @returns RaceStatus - Valid race status
 */
export function sanitizeRaceStatus(
  status: unknown, 
  fallback: RaceStatus = RACE_STATUS.OPEN
): RaceStatus {
  // Handle null, undefined, or empty strings
  if (!status || (typeof status === 'string' && status.trim() === '')) {
    console.warn('Empty or null race status provided, using fallback:', fallback);
    return fallback;
  }
  
  // Convert to string and normalize
  const normalizedStatus = String(status).trim();
  
  // Check if it's a valid status
  if (isValidRaceStatus(normalizedStatus)) {
    return normalizedStatus;
  }
  
  // Try case-insensitive matching
  const upperStatus = normalizedStatus.toUpperCase();
  for (const validStatus of Object.values(RACE_STATUS)) {
    if (validStatus.toUpperCase() === upperStatus) {
      console.warn(`Race status case mismatch: "${sanitizeStatusForLogging(status)}" corrected to "${validStatus}"`);
      return validStatus;
    }
  }
  
  // Try partial matching for common variations
  const statusMappings: Record<string, RaceStatus> = {
    'final': RACE_STATUS.FINALIZED,
    'finished': RACE_STATUS.FINALIZED,
    'complete': RACE_STATUS.FINALIZED,
    'completed': RACE_STATUS.FINALIZED,
    'ended': RACE_STATUS.FINALIZED,
    'provisional': RACE_STATUS.INTERIM,
    'preliminary': RACE_STATUS.INTERIM,
    'temp': RACE_STATUS.INTERIM,
    'temporary': RACE_STATUS.INTERIM,
    'live': RACE_STATUS.RUNNING,
    'active': RACE_STATUS.RUNNING,
    'racing': RACE_STATUS.RUNNING,
    'inprogress': RACE_STATUS.RUNNING,
    'in-progress': RACE_STATUS.RUNNING,
    'in_progress': RACE_STATUS.RUNNING,
    'started': RACE_STATUS.RUNNING,
    'pending': RACE_STATUS.OPEN,
    'available': RACE_STATUS.OPEN,
    'betting': RACE_STATUS.OPEN,
    'soon': RACE_STATUS.CLOSED,
    'imminent': RACE_STATUS.CLOSED,
    'starting': RACE_STATUS.CLOSED,
    'cancelled': RACE_STATUS.ABANDONED,
    'canceled': RACE_STATUS.ABANDONED,
    'called off': RACE_STATUS.ABANDONED,
    'calledoff': RACE_STATUS.ABANDONED,
    'postponed': RACE_STATUS.ABANDONED,
    'void': RACE_STATUS.ABANDONED,
  };
  
  const mappedStatus = statusMappings[normalizedStatus.toLowerCase().replace(/\s+/g, '')];
  if (mappedStatus) {
    console.warn(`Race status mapped: "${sanitizeStatusForLogging(status)}" -> "${mappedStatus}"`);
    return mappedStatus;
  }
  
  // If all else fails, use fallback and log error
  console.error(`Invalid race status provided: "${sanitizeStatusForLogging(status)}", using fallback: "${fallback}"`);
  return fallback;
}

/**
 * Validate race status transition
 * @param fromStatus - Current status
 * @param toStatus - New status
 * @returns object with validation result and warnings
 */
export function validateStatusTransition(fromStatus: string, toStatus: string): {
  isValid: boolean;
  warnings: string[];
  errors: string[];
} {
  const result = {
    isValid: true,
    warnings: [] as string[],
    errors: [] as string[],
  };
  
  // Validate both statuses
  if (!isValidRaceStatus(fromStatus)) {
    result.errors.push(`Invalid source status: "${fromStatus}"`);
    result.isValid = false;
  }
  
  if (!isValidRaceStatus(toStatus)) {
    result.errors.push(`Invalid target status: "${toStatus}"`);
    result.isValid = false;
  }
  
  // If either status is invalid, can't validate transition
  if (!result.isValid) {
    return result;
  }
  
  // Same status transition
  if (fromStatus === toStatus) {
    result.warnings.push('Status transition to same status');
    return result;
  }
  
  // Define valid transitions
  const validTransitions: Record<RaceStatus, RaceStatus[]> = {
    [RACE_STATUS.OPEN]: [RACE_STATUS.CLOSED, RACE_STATUS.RUNNING, RACE_STATUS.INTERIM, RACE_STATUS.FINALIZED, RACE_STATUS.ABANDONED],
    [RACE_STATUS.CLOSED]: [RACE_STATUS.RUNNING, RACE_STATUS.INTERIM, RACE_STATUS.FINALIZED, RACE_STATUS.OPEN, RACE_STATUS.ABANDONED], // Can reopen or be abandoned
    [RACE_STATUS.RUNNING]: [RACE_STATUS.INTERIM, RACE_STATUS.FINALIZED, RACE_STATUS.ABANDONED],
    [RACE_STATUS.INTERIM]: [RACE_STATUS.FINALIZED, RACE_STATUS.ABANDONED], // Interim results become final or abandoned
    [RACE_STATUS.FINALIZED]: [], // Final state - no transitions allowed
    [RACE_STATUS.ABANDONED]: [], // Abandoned state - no transitions allowed
  };
  
  const allowedTransitions = validTransitions[fromStatus as RaceStatus] || [];
  
  if (!allowedTransitions.includes(toStatus as RaceStatus)) {
    // Check for unusual but potentially valid transitions
    const unusualTransitions: Record<string, string[]> = {
      [`${RACE_STATUS.FINALIZED}`]: [RACE_STATUS.OPEN], // Race restart (very unusual)
      [`${RACE_STATUS.RUNNING}`]: [RACE_STATUS.OPEN, RACE_STATUS.CLOSED], // Race restart/delay
    };
    
    const key = fromStatus as RaceStatus;
    if (unusualTransitions[key]?.includes(toStatus)) {
      result.warnings.push(`Unusual status transition: ${fromStatus} -> ${toStatus}`);
    } else {
      result.errors.push(`Invalid status transition: ${fromStatus} -> ${toStatus}`);
      result.isValid = false;
    }
  }
  
  return result;
}

/**
 * Get status color for race status
 * @param status - Race status
 * @returns string - Tailwind color class
 */
export function getRaceStatusColor(status: string): string {
  switch (status) {
    case RACE_STATUS.OPEN:
      return 'text-green-600';
    case RACE_STATUS.CLOSED:
      return 'text-yellow-600';
    case RACE_STATUS.RUNNING:
      return 'text-blue-600';
    case RACE_STATUS.INTERIM:
      return 'text-purple-600';
    case RACE_STATUS.FINALIZED:
      return 'text-gray-600';
    default:
      return 'text-gray-400';
  }
}

/**
 * Get comprehensive status badge styling for race status
 * @param status - Race status (will be sanitized if invalid)
 * @returns object - Complete styling configuration for status badges
 */
export function getRaceStatusBadgeStyles(status: string) {
  // Sanitize the status first to handle invalid values
  const sanitizedStatus = sanitizeRaceStatus(status);
  
  switch (sanitizedStatus) {
    case RACE_STATUS.OPEN:
      return {
        status: sanitizedStatus,
        containerClass: 'race-status-badge race-status-open',
        textClass: 'text-green-800',
        bgClass: 'bg-green-100',
        borderClass: 'border-green-200',
        icon: '🟢',
        ariaLabel: 'Race is open for betting',
        urgency: 'polite' as const,
        isValid: isValidRaceStatus(status),
      };
    case RACE_STATUS.CLOSED:
      return {
        status: sanitizedStatus,
        containerClass: 'race-status-badge race-status-closed',
        textClass: 'text-yellow-800',
        bgClass: 'bg-yellow-100',
        borderClass: 'border-yellow-200',
        icon: '🟡',
        ariaLabel: 'Race betting is closed, race about to start',
        urgency: 'assertive' as const,
        isValid: isValidRaceStatus(status),
      };
    case RACE_STATUS.RUNNING:
      return {
        status: sanitizedStatus,
        containerClass: 'race-status-badge race-status-running',
        textClass: 'text-blue-800',
        bgClass: 'bg-blue-100',
        borderClass: 'border-blue-200',
        icon: '🔵',
        ariaLabel: 'Race is currently in progress',
        urgency: 'assertive' as const,
        isValid: isValidRaceStatus(status),
      };
    case RACE_STATUS.INTERIM:
      return {
        status: sanitizedStatus,
        containerClass: 'race-status-badge race-status-interim',
        textClass: 'text-purple-800',
        bgClass: 'bg-purple-100',
        borderClass: 'border-purple-200',
        icon: '🟣',
        ariaLabel: 'Race finished with provisional results',
        urgency: 'assertive' as const,
        isValid: isValidRaceStatus(status),
      };
    case RACE_STATUS.FINALIZED:
      return {
        status: sanitizedStatus,
        containerClass: 'race-status-badge race-status-finalized',
        textClass: 'text-gray-800',
        bgClass: 'bg-gray-100',
        borderClass: 'border-gray-200',
        icon: '⚪',
        ariaLabel: 'Race has been completed',
        urgency: 'polite' as const,
        isValid: isValidRaceStatus(status),
      };
    case RACE_STATUS.ABANDONED:
      return {
        status: sanitizedStatus,
        containerClass: 'race-status-badge race-status-abandoned',
        textClass: 'text-red-800',
        bgClass: 'bg-red-100',
        borderClass: 'border-red-200',
        icon: '⛔',
        ariaLabel: 'Race has been abandoned',
        urgency: 'assertive' as const,
        isValid: isValidRaceStatus(status),
      };
    default:
      return {
        status: sanitizedStatus,
        containerClass: 'race-status-badge race-status-unknown',
        textClass: 'text-gray-600',
        bgClass: 'bg-gray-50',
        borderClass: 'border-gray-100',
        icon: '❓',
        ariaLabel: 'Race status unknown or invalid',
        urgency: 'polite' as const,
        isValid: false,
      };
  }
}

/**
 * Check if a race status change warrants a status announcement
 * @param oldStatus - Previous race status
 * @param newStatus - New race status
 * @returns boolean - True if status change should be announced
 */
export function shouldAnnounceStatusChange(oldStatus: string, newStatus: string): boolean {
  // Announce all status changes except when initializing (from undefined/null)
  if (!oldStatus) return false;
  
  // Always announce transitions to/from Running status
  if (oldStatus === RACE_STATUS.RUNNING || newStatus === RACE_STATUS.RUNNING) {
    return true;
  }
  
  // Announce other significant transitions
  const significantTransitions = [
    [RACE_STATUS.OPEN, RACE_STATUS.CLOSED],
    [RACE_STATUS.CLOSED, RACE_STATUS.RUNNING],
    [RACE_STATUS.RUNNING, RACE_STATUS.FINALIZED],
    [RACE_STATUS.OPEN, RACE_STATUS.ABANDONED],
    [RACE_STATUS.CLOSED, RACE_STATUS.ABANDONED],
    [RACE_STATUS.RUNNING, RACE_STATUS.ABANDONED],
  ];
  
  return significantTransitions.some(
    ([from, to]) => (oldStatus === from && newStatus === to) || (oldStatus === to && newStatus === from)
  );
}

/**
 * Get status description for screen readers
 * @param status - Race status
 * @returns string - Detailed description of the status
 */
export function getRaceStatusDescription(status: string): string {
  switch (status) {
    case RACE_STATUS.OPEN:
      return 'Race is open for betting. You can place bets on this race.';
    case RACE_STATUS.CLOSED:
      return 'Betting is closed for this race. The race is about to start.';
    case RACE_STATUS.RUNNING:
      return 'This race is currently in progress. Betting is not available.';
    case RACE_STATUS.INTERIM:
      return 'This race has finished with provisional results. Final results pending confirmation.';
    case RACE_STATUS.FINALIZED:
      return 'This race has been completed. Results are available.';
    case RACE_STATUS.ABANDONED:
      return 'This race has been abandoned or cancelled. All bets are void.';
    default:
      return 'Race status is not available or unknown.';
  }
}