import { Meeting, Race, MeetingWithRaces } from '@/types/meetings';
import { calculateDstAwareMinutesToStart } from './timezoneUtils';

/**
 * Extract all races from a list of meetings with races
 * This is used to provide a unified view of races for polling integration
 * @param meetings - Array of meetings that may have expanded races
 * @returns Array of all races across meetings
 */
export function getAllRacesFromMeetings(meetings: MeetingWithRaces[]): Race[] {
  const allRaces: Race[] = [];
  
  for (const meeting of meetings) {
    // Check if the meeting has expanded races available
    if (meeting.races && Array.isArray(meeting.races)) {
      allRaces.push(...meeting.races);
    }
  }
  
  return allRaces;
}

/**
 * Extract races that are currently loaded/cached for polling purposes
 * This works with the existing cache system in useRacesForMeeting
 * @param meetings - Array of meetings
 * @param getRacesForMeeting - Function to get cached races for a meeting
 * @returns Array of cached races available for polling
 */
export function getCachedRacesFromMeetings(
  meetings: Meeting[], 
  getRacesForMeeting: (meetingId: string) => Race[] | null
): Race[] {
  const allRaces: Race[] = [];
  
  for (const meeting of meetings) {
    const cachedRaces = getRacesForMeeting(meeting.meetingId);
    if (cachedRaces) {
      // Add meeting context to races for polling integration
      const racesWithMeetingId = cachedRaces.map(race => ({
        ...race,
        meetingId: meeting.meetingId,
        meetingName: meeting.meetingName,
      }));
      allRaces.push(...racesWithMeetingId);
    }
  }
  
  return allRaces;
}

/**
 * Filter races that need active monitoring (not finalized, within time window)
 * Uses DST-aware calculations for accurate race timing
 * @param races - Array of races to filter
 * @returns Array of races that should be actively monitored
 */
export function getActiveRacesForPolling(races: Race[]): Race[] {
  return races.filter(race => {
    // Skip finalized races
    if (race.status === 'Finalized') {
      return false;
    }

    try {
      // Use DST-aware calculation instead of naive date arithmetic
      const diffMinutes = calculateDstAwareMinutesToStart(race.startTime, race.status);

      if (diffMinutes === null) {
        return false;
      }

      // Include races from 2 hours before to 1 hour after start time
      // This gives a buffer for races that might need monitoring
      return diffMinutes >= -120 && diffMinutes <= 60;
    } catch (error) {
      console.warn('Invalid race start time:', race.startTime, error);
      return false;
    }
  });
}

/**
 * Group races by their polling urgency for performance optimization
 * Uses DST-aware calculations that match server-side categorization
 * @param races - Array of races to categorize
 * @returns Object with races grouped by urgency level
 */
export function groupRacesByPollingUrgency(races: Race[]): {
  critical: Race[];
  high: Race[];
  normal: Race[];
  inactive: Race[];
} {
  const groups = {
    critical: [] as Race[],
    high: [] as Race[],
    normal: [] as Race[],
    inactive: [] as Race[],
  };

  for (const race of races) {
    if (race.status === 'Finalized') {
      groups.inactive.push(race);
      continue;
    }

    if (race.status === 'Running') {
      groups.critical.push(race);
      continue;
    }

    try {
      // Use DST-aware calculation instead of naive date arithmetic
      const diffMinutes = calculateDstAwareMinutesToStart(race.startTime, race.status);

      if (diffMinutes === null) {
        groups.inactive.push(race);
        continue;
      }

      // Match server-side categorization for consistency:
      // Critical: -15 to +2 minutes (races about to start or just started)
      // High: -60 to +10 minutes (races starting soon)
      // Normal: -120 to +60 minutes (races within monitoring window)
      if (diffMinutes >= -15 && diffMinutes <= 2) {
        groups.critical.push(race);
      } else if (diffMinutes >= -60 && diffMinutes <= 10) {
        groups.high.push(race);
      } else if (diffMinutes >= -120 && diffMinutes <= 60) {
        groups.normal.push(race);
      } else {
        groups.inactive.push(race);
      }
    } catch {
      groups.inactive.push(race);
    }
  }

  return groups;
}