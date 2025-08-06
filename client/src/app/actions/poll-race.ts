'use server';

import { createServerClient } from '@/lib/appwrite-server';
import { Race } from '@/types/meetings';
import { RACE_STATUS } from '@/services/races';

// Types for the polling response
export interface PollRaceResponse {
  success: boolean;
  message: string;
  raceId: string;
  raceName?: string;
  status?: string;
  pollingTriggered: boolean;
  expectedLatency?: string;
  nextPollRecommended?: string;
  error?: string;
}

export interface PollRaceError {
  success: false;
  error: string;
  raceId: string;
  pollingTriggered: false;
}

/**
 * Determine if a race needs high-frequency polling based on timing
 * High-frequency polling window: T-10m to T+60m (race start time)
 * @param startTime - Race start time as ISO string
 * @returns boolean - True if race is in high-frequency polling window
 */
function isInHighFrequencyWindow(startTime: string): boolean {
  try {
    const raceStart = new Date(startTime);
    const now = new Date();
    const diffMinutes = (raceStart.getTime() - now.getTime()) / (1000 * 60);
    
    // High-frequency window: 10 minutes before to 60 minutes after start
    return diffMinutes >= -60 && diffMinutes <= 10;
  } catch (error) {
    console.error('Error parsing race start time:', startTime, error);
    return false;
  }
}

/**
 * Determine polling urgency and expected latency based on race timing
 * @param startTime - Race start time as ISO string
 * @param status - Current race status
 * @returns object with urgency level and expected latency
 */
function getPollingUrgency(startTime: string, _status: string) {
  try {
    const raceStart = new Date(startTime);
    const now = new Date();
    const diffMinutes = (raceStart.getTime() - now.getTime()) / (1000 * 60);
    
    // Critical window: T-2m to T+15m (race about to start or just started)
    if (diffMinutes >= -15 && diffMinutes <= 2) {
      return {
        urgency: 'critical' as const,
        expectedLatency: '<30 seconds',
        nextPollRecommended: '30-60 seconds',
      };
    }
    
    // High urgency: T-10m to T+60m
    if (diffMinutes >= -60 && diffMinutes <= 10) {
      return {
        urgency: 'high' as const,
        expectedLatency: '<2 minutes', 
        nextPollRecommended: '2-5 minutes',
      };
    }
    
    // Normal urgency: Outside critical windows
    return {
      urgency: 'normal' as const,
      expectedLatency: '<5 minutes',
      nextPollRecommended: '10-15 minutes',
    };
  } catch (error) {
    console.error('Error calculating polling urgency:', error);
    return {
      urgency: 'normal' as const,
      expectedLatency: '<5 minutes',
      nextPollRecommended: '10-15 minutes',
    };
  }
}

/**
 * Validate race data and determine if polling is appropriate
 * @param race - Race object from database
 * @returns object with validation result and recommendation
 */
function validateRaceForPolling(race: Race): {
  shouldPoll: boolean;
  reason?: string;
  skipPolling?: boolean;
} {
  // Don't poll finalized races
  if (race.status === RACE_STATUS.FINALIZED) {
    return {
      shouldPoll: false,
      reason: 'Race is already finalized',
      skipPolling: true,
    };
  }
  
  // Always allow polling for Running races
  if (race.status === RACE_STATUS.RUNNING) {
    return { shouldPoll: true };
  }
  
  // Check if race is in high-frequency window
  const inHighFreqWindow = isInHighFrequencyWindow(race.startTime);
  
  if (!inHighFreqWindow) {
    return {
      shouldPoll: false,
      reason: 'Race is outside high-frequency polling window (T-10m to T+60m)',
      skipPolling: false,
    };
  }
  
  return { shouldPoll: true };
}

/**
 * Trigger high-frequency polling for a specific race
 * Server Action to execute single-race-poller function via Appwrite Functions
 * 
 * @param raceId - The race ID to poll
 * @returns Promise<PollRaceResponse | PollRaceError>
 */
export async function pollRace(raceId: string): Promise<PollRaceResponse | PollRaceError> {
  const startTime = Date.now();
  
  try {
    // Validate input
    if (!raceId || typeof raceId !== 'string' || raceId.trim().length === 0) {
      return {
        success: false,
        error: 'Invalid race ID provided',
        raceId: raceId || 'undefined',
        pollingTriggered: false,
      };
    }

    // Initialize Appwrite client
    const { databases } = await createServerClient();
    const databaseId = 'raceday-db';

    // Fetch race data for validation
    let race: Race;
    try {
      race = await databases.getDocument(databaseId, 'races', raceId) as unknown as Race;
    } catch (error) {
      console.error('Race lookup failed:', { raceId, error });
      return {
        success: false,
        error: `Race not found: ${raceId}`,
        raceId,
        pollingTriggered: false,
      };
    }

    // Validate race for polling
    const validation = validateRaceForPolling(race);
    
    if (!validation.shouldPoll) {
      return {
        success: validation.skipPolling ? true : false,
        message: validation.reason || 'Polling not recommended for this race',
        raceId,
        raceName: race.name,
        status: race.status,
        pollingTriggered: false,
        expectedLatency: 'N/A - No polling triggered',
      };
    }

    // Get polling urgency and expected latency
    const { urgency, expectedLatency, nextPollRecommended } = getPollingUrgency(
      race.startTime, 
      race.status
    );

    // Trigger single-race-poller function via Appwrite Functions
    try {
      // Use the Appwrite Functions service to execute single-race-poller
      // Note: Since we don't have direct Functions import in current setup,
      // we'll use a direct HTTP call to the function endpoint as fallback
      const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
      const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
      const apiKey = process.env.APPWRITE_API_KEY;
      
      if (!endpoint || !projectId || !apiKey) {
        throw new Error('Missing Appwrite configuration');
      }

      // Construct function execution URL
      const functionUrl = `${endpoint}/functions/single-race-poller/executions`;
      
      const executionPayload = {
        body: JSON.stringify({ raceId }),
        async: true, // Execute asynchronously for better performance
      };

      // Execute with timeout based on urgency
      const timeoutMs = urgency === 'critical' ? 5000 : urgency === 'high' ? 10000 : 15000;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Appwrite-Project': projectId,
            'X-Appwrite-Key': apiKey,
          },
          body: JSON.stringify(executionPayload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Function execution failed: ${response.status} ${response.statusText}`);
        }

        const executionResult = await response.json();
        
        const processingTime = Date.now() - startTime;
        
        return {
          success: true,
          message: `High-frequency polling initiated for ${race.name}`,
          raceId,
          raceName: race.name,
          status: race.status,
          pollingTriggered: true,
          expectedLatency,
          nextPollRecommended,
          executionId: executionResult.$id,
          processingTime: `${processingTime}ms`,
          urgency,
        } as PollRaceResponse;

      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error(`Function execution timeout after ${timeoutMs}ms`);
        }
        
        throw fetchError;
      }

    } catch (executionError) {
      console.error('Function execution failed:', { 
        raceId, 
        error: executionError instanceof Error ? executionError.message : executionError 
      });
      
      return {
        success: false,
        error: `Failed to trigger polling: ${executionError instanceof Error ? executionError.message : 'Unknown error'}`,
        raceId,
        raceName: race.name,
        status: race.status,
        pollingTriggered: false,
      };
    }

  } catch (error) {
    console.error('Poll race action failed:', { 
      raceId, 
      error: error instanceof Error ? error.message : error 
    });
    
    return {
      success: false,
      error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      raceId,
      pollingTriggered: false,
    };
  }
}

/**
 * Get polling recommendation for a race without triggering polling
 * Useful for UI to determine if polling should be offered to the user
 * 
 * @param raceId - The race ID to check
 * @returns Promise<object> - Polling recommendation and race status
 */
export async function getPollRecommendation(raceId: string): Promise<{
  shouldShowPollOption: boolean;
  urgency?: 'normal' | 'high' | 'critical';
  reason?: string;
  race?: {
    name: string;
    status: string;
    startTime: string;
  };
}> {
  try {
    if (!raceId) {
      return {
        shouldShowPollOption: false,
        reason: 'Invalid race ID',
      };
    }

    const { databases } = await createServerClient();
    
    const race = await databases.getDocument('raceday-db', 'races', raceId) as unknown as Race;
    
    const validation = validateRaceForPolling(race);
    const { urgency } = getPollingUrgency(race.startTime, race.status);
    
    return {
      shouldShowPollOption: validation.shouldPoll,
      urgency: validation.shouldPoll ? urgency : undefined,
      reason: validation.reason,
      race: {
        name: race.name,
        status: race.status,
        startTime: race.startTime,
      },
    };

  } catch (error) {
    console.error('Get poll recommendation failed:', { raceId, error });
    return {
      shouldShowPollOption: false,
      reason: 'Unable to fetch race data',
    };
  }
}