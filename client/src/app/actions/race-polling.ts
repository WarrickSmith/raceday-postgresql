'use server';

import { createServerClient } from '@/lib/appwrite-server';
import { Race } from '@/types/meetings';
import { RACE_STATUS } from '@/services/races';
import { Query } from 'appwrite';

// Types for intelligent polling coordination
export interface PollingStrategy {
  strategy: 'batch' | 'individual' | 'none';
  raceCount: number;
  functionToCall: 'batch-race-poller' | 'single-race-poller' | null;
  reason: string;
  urgency: 'critical' | 'high' | 'normal';
  expectedLatency: string;
}

export interface PollingCoordinationResponse {
  success: boolean;
  message: string;
  strategy: PollingStrategy;
  racesProcessed: string[];
  racesSkipped: Array<{
    raceId: string;
    reason: string;
  }>;
  executionId?: string;
  error?: string;
}

export interface RaceAnalysis {
  raceId: string;
  name: string;
  status: string;
  startTime: string;
  minutesToStart: number;
  needsPolling: boolean;
  urgency: 'critical' | 'high' | 'normal';
  skipReason?: string;
}

/**
 * Calculate minutes until race start
 * @param startTime - Race start time as ISO string
 * @returns number - Minutes until start (negative if race has started)
 */
function minutesToRaceStart(startTime: string): number {
  try {
    const raceStart = new Date(startTime);
    const now = new Date();
    return (raceStart.getTime() - now.getTime()) / (1000 * 60);
  } catch (error) {
    console.error('Error calculating minutes to race start:', error);
    return Infinity; // Return large number to deprioritize
  }
}

/**
 * Determine polling urgency based on race timing
 * @param minutesToStart - Minutes until race start
 * @param status - Current race status
 * @returns urgency level
 */
function determinePollingUrgency(minutesToStart: number, status: string): 'critical' | 'high' | 'normal' {
  if (status === RACE_STATUS.RUNNING) {
    return 'critical';
  }
  
  // Critical: Within 1 minute of start or just started
  if (minutesToStart >= -15 && minutesToStart <= 1) {
    return 'critical';
  }
  
  // High: Within 5 minutes of start
  if (minutesToStart >= -60 && minutesToStart <= 5) {
    return 'high';
  }
  
  return 'normal';
}

/**
 * Analyze current race schedule to identify races needing polling
 * @returns Promise<RaceAnalysis[]> - Array of race analysis results
 */
export async function analyzeRaceSchedule(): Promise<RaceAnalysis[]> {
  try {
    const { databases } = await createServerClient();
    const databaseId = 'raceday-db';
    
    // Get current time and calculate analysis window
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    
    // Query races that might need polling (broad window for analysis)
    const races = await databases.listDocuments(databaseId, 'races', [
      Query.greaterThan('startTime', now.toISOString()),
      Query.lessThan('startTime', oneHourFromNow.toISOString()),
      Query.notEqual('status', RACE_STATUS.FINALIZED),
      Query.limit(50) // Reasonable limit for analysis
    ]);
    
    const analyses: RaceAnalysis[] = [];
    
    for (const race of races.documents) {
      const raceData = race as unknown as Race;
      const minutesToStart = minutesToRaceStart(raceData.startTime);
      const urgency = determinePollingUrgency(minutesToStart, raceData.status);
      
      // Determine if race needs polling based on timing
      let needsPolling = false;
      let skipReason: string | undefined;
      
      if (raceData.status === RACE_STATUS.FINALIZED) {
        skipReason = 'Race already finalized';
      } else if (raceData.status === RACE_STATUS.RUNNING) {
        needsPolling = true; // Always poll running races
      } else if (minutesToStart <= 5 && minutesToStart >= -60) {
        needsPolling = true; // Poll races starting within 5 minutes or started within last hour
      } else if (minutesToStart > 5) {
        skipReason = `Race starts in ${Math.round(minutesToStart)} minutes (outside 5-minute window)`;
      } else if (minutesToStart < -60) {
        skipReason = `Race started ${Math.abs(Math.round(minutesToStart))} minutes ago (outside 1-hour window)`;
      }
      
      analyses.push({
        raceId: raceData.$id,
        name: raceData.name,
        status: raceData.status,
        startTime: raceData.startTime,
        minutesToStart,
        needsPolling,
        urgency,
        skipReason
      });
    }
    
    // Sort by urgency and time to start
    analyses.sort((a, b) => {
      // First by urgency (critical > high > normal)
      const urgencyOrder = { critical: 3, high: 2, normal: 1 };
      const urgencyDiff = urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;
      
      // Then by time to start (sooner first)
      return a.minutesToStart - b.minutesToStart;
    });
    
    console.log('Race schedule analysis completed', {
      totalRaces: races.documents.length,
      needsPolling: analyses.filter(a => a.needsPolling).length,
      criticalRaces: analyses.filter(a => a.urgency === 'critical').length,
      highRaces: analyses.filter(a => a.urgency === 'high').length
    });
    
    return analyses;
    
  } catch (error) {
    console.error('Race schedule analysis failed:', error);
    return [];
  }
}

/**
 * Determine optimal polling strategy based on race analysis
 * @param analyses - Array of race analysis results
 * @returns PollingStrategy - Recommended polling approach
 */
function determinePollingStrategy(analyses: RaceAnalysis[]): PollingStrategy {
  const racesNeedingPolling = analyses.filter(a => a.needsPolling);
  
  if (racesNeedingPolling.length === 0) {
    return {
      strategy: 'none',
      raceCount: 0,
      functionToCall: null,
      reason: 'No races currently need polling',
      urgency: 'normal',
      expectedLatency: 'N/A'
    };
  }
  
  // Get highest urgency level
  const highestUrgency = racesNeedingPolling.reduce((max, race) => {
    const urgencyOrder = { critical: 3, high: 2, normal: 1 };
    return urgencyOrder[race.urgency] > urgencyOrder[max] ? race.urgency : max;
  }, 'normal' as 'critical' | 'high' | 'normal');
  
  // Critical races (< 1 minute): Use individual polling for maximum speed
  const criticalRaces = racesNeedingPolling.filter(r => r.urgency === 'critical');
  if (criticalRaces.length > 0 && criticalRaces.length <= 2) {
    return {
      strategy: 'individual',
      raceCount: criticalRaces.length,
      functionToCall: 'single-race-poller',
      reason: `${criticalRaces.length} critical race(s) need immediate individual polling`,
      urgency: 'critical',
      expectedLatency: '<30 seconds per race'
    };
  }
  
  // Multiple races (3+): Use batch polling for efficiency
  if (racesNeedingPolling.length >= 3) {
    return {
      strategy: 'batch',
      raceCount: racesNeedingPolling.length,
      functionToCall: 'batch-race-poller',
      reason: `${racesNeedingPolling.length} races benefit from batch processing`,
      urgency: highestUrgency,
      expectedLatency: `<${Math.ceil(racesNeedingPolling.length * 1.5)} seconds total`
    };
  }
  
  // Few races (1-2): Use individual polling
  return {
    strategy: 'individual',
    raceCount: racesNeedingPolling.length,
    functionToCall: 'single-race-poller',
    reason: `${racesNeedingPolling.length} race(s) suitable for individual polling`,
    urgency: highestUrgency,
    expectedLatency: '<15 seconds per race'
  };
}

/**
 * Execute the determined polling strategy
 * @param strategy - Polling strategy to execute
 * @param racesToPoll - Array of race IDs to poll
 * @returns Promise<object> - Execution result
 */
async function executePollingStrategy(
  strategy: PollingStrategy,
  racesToPoll: string[]
): Promise<{
  success: boolean;
  executionId?: string;
  error?: string;
}> {
  try {
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;
    
    if (!endpoint || !projectId || !apiKey) {
      throw new Error('Missing Appwrite configuration');
    }
    
    if (strategy.strategy === 'batch') {
      // Execute batch race poller
      const functionUrl = `${endpoint}/functions/batch-race-poller/executions`;
      const functionPayload = {
        raceIds: racesToPoll,
        async: true
      };
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Appwrite-Project': projectId,
          'X-Appwrite-Key': apiKey,
        },
        body: JSON.stringify(functionPayload),
      });
      
      if (!response.ok) {
        throw new Error(`Batch function execution failed: ${response.status}`);
      }
      
      const result = await response.json();
      return {
        success: true,
        executionId: result.$id || 'batch-execution'
      };
      
    } else if (strategy.strategy === 'individual') {
      // Execute individual race pollers for each race
      const executions: string[] = [];
      
      for (const raceId of racesToPoll) {
        const functionUrl = `${endpoint}/functions/single-race-poller/executions`;
        const functionPayload = {
          raceId,
          async: true
        };
        
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Appwrite-Project': projectId,
            'X-Appwrite-Key': apiKey,
          },
          body: JSON.stringify(functionPayload),
        });
        
        if (response.ok) {
          const result = await response.json();
          executions.push(result.$id || `individual-${raceId}`);
        } else {
          console.error(`Individual polling failed for race ${raceId}:`, response.status);
        }
      }
      
      return {
        success: executions.length > 0,
        executionId: executions.join(',')
      };
    }
    
    return {
      success: false,
      error: 'Invalid polling strategy'
    };
    
  } catch (error) {
    console.error('Polling strategy execution failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Coordinate intelligent polling based on current race schedule
 * Main server action that analyzes races and chooses optimal polling strategy
 * 
 * @returns Promise<PollingCoordinationResponse> - Coordination result
 */
export async function coordinateIntelligentPolling(): Promise<PollingCoordinationResponse> {
  
  try {
    console.log('Starting intelligent polling coordination...');
    
    // Phase 1: Analyze current race schedule
    const analyses = await analyzeRaceSchedule();
    
    // Phase 2: Determine optimal polling strategy
    const strategy = determinePollingStrategy(analyses);
    
    // Phase 3: Filter races that need polling
    const racesNeedingPolling = analyses.filter(a => a.needsPolling);
    const racesToPoll = racesNeedingPolling.map(r => r.raceId);
    const racesSkipped = analyses
      .filter(a => !a.needsPolling)
      .map(r => ({
        raceId: r.raceId,
        reason: r.skipReason || 'Does not need polling'
      }));
    
    if (strategy.strategy === 'none') {
      return {
        success: true,
        message: 'No races currently need polling',
        strategy,
        racesProcessed: [],
        racesSkipped
      };
    }
    
    // Phase 4: Execute polling strategy
    console.log('Executing polling strategy:', {
      strategy: strategy.strategy,
      raceCount: strategy.raceCount,
      function: strategy.functionToCall
    });
    
    const execution = await executePollingStrategy(strategy, racesToPoll);
    
    if (execution.success) {
      return {
        success: true,
        message: `Successfully coordinated ${strategy.strategy} polling for ${strategy.raceCount} races`,
        strategy,
        racesProcessed: racesToPoll,
        racesSkipped,
        executionId: execution.executionId
      };
    } else {
      return {
        success: false,
        message: 'Failed to execute polling strategy',
        strategy,
        racesProcessed: [],
        racesSkipped,
        error: execution.error
      };
    }
    
  } catch (error) {
    console.error('Intelligent polling coordination failed:', error);
    
    return {
      success: false,
      message: 'Polling coordination failed',
      strategy: {
        strategy: 'none',
        raceCount: 0,
        functionToCall: null,
        reason: 'Coordination error',
        urgency: 'normal',
        expectedLatency: 'N/A'
      },
      racesProcessed: [],
      racesSkipped: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get current polling status and recommendations without triggering polling
 * Useful for dashboards and monitoring
 * 
 * @returns Promise<object> - Current polling status
 */
export async function getPollingStatus(): Promise<{
  totalActiveRaces: number;
  racesNeedingPolling: number;
  recommendedStrategy: PollingStrategy;
  raceBreakdown: {
    critical: number;
    high: number;
    normal: number;
  };
  nextRecommendedPoll: string;
}> {
  try {
    const analyses = await analyzeRaceSchedule();
    const strategy = determinePollingStrategy(analyses);
    const racesNeedingPolling = analyses.filter(a => a.needsPolling);
    
    // Calculate race breakdown by urgency
    const raceBreakdown = {
      critical: analyses.filter(r => r.urgency === 'critical' && r.needsPolling).length,
      high: analyses.filter(r => r.urgency === 'high' && r.needsPolling).length,
      normal: analyses.filter(r => r.urgency === 'normal' && r.needsPolling).length
    };
    
    // Determine next recommended poll timing
    let nextRecommendedPoll = '5-10 minutes';
    if (raceBreakdown.critical > 0) {
      nextRecommendedPoll = '30-60 seconds';
    } else if (raceBreakdown.high > 0) {
      nextRecommendedPoll = '2-3 minutes';
    }
    
    return {
      totalActiveRaces: analyses.length,
      racesNeedingPolling: racesNeedingPolling.length,
      recommendedStrategy: strategy,
      raceBreakdown,
      nextRecommendedPoll
    };
    
  } catch (error) {
    console.error('Get polling status failed:', error);
    
    return {
      totalActiveRaces: 0,
      racesNeedingPolling: 0,
      recommendedStrategy: {
        strategy: 'none',
        raceCount: 0,
        functionToCall: null,
        reason: 'Status check failed',
        urgency: 'normal',
        expectedLatency: 'N/A'
      },
      raceBreakdown: { critical: 0, high: 0, normal: 0 },
      nextRecommendedPoll: 'Unknown'
    };
  }
}