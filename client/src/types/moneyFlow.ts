/**
 * Enhanced Money Flow Types for v4.7 Race Interface
 * Supports timeline visualization and incremental money flow display
 */

// Time periods for money flow timeline columns
export interface MoneyFlowTimePeriod {
  label: string; // e.g., 'T-60m', 'T-40m', 'T-20m', etc.
  timeToStart: number; // minutes until race start
  timestamp: string; // actual timestamp of this period
}

// Individual money flow data point for timeline
export interface MoneyFlowDataPoint {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  entrant: string;
  pollingTimestamp: string;
  timeToStart: number; // minutes until race start
  winPoolAmount: number;
  placePoolAmount: number;
  totalPoolAmount: number;
  poolPercentage: number;
  incrementalAmount: number; // change since previous polling
  pollingInterval: number; // minutes since last poll
}

// Money flow timeline data for an entrant (all time periods)
export interface EntrantMoneyFlowTimeline {
  entrantId: string;
  dataPoints: MoneyFlowDataPoint[];
  latestPercentage: number;
  trend: 'up' | 'down' | 'neutral';
  significantChange: boolean; // true if change > 5%
}

// Visual indicators for money flow changes
export interface MoneyFlowVisualIndicator {
  type: 'increase' | 'decrease' | 'significant' | 'recent';
  color: 'green' | 'yellow' | 'red' | 'blue';
  icon?: '⚡' | '🔥' | '📈' | '📉';
  description: string;
}

// Complete money flow timeline for all entrants
export interface MoneyFlowTimelineData {
  timePeriods: MoneyFlowTimePeriod[];
  entrantTimelines: Map<string, EntrantMoneyFlowTimeline>;
  lastUpdated: string;
  pollingActive: boolean;
}

// Money flow subscription callback interface
export interface MoneyFlowTimelineSubscriptionResponse {
  payload?: {
    entrant?: string;
    pollingTimestamp?: string;
    winPoolAmount?: number;
    placePoolAmount?: number;
    totalPoolAmount?: number;
    poolPercentage?: number;
    incrementalAmount?: number;
  };
  events?: string[];
}

// Money flow processing utilities
export interface MoneyFlowCalculations {
  calculateIncremental: (current: MoneyFlowDataPoint, previous?: MoneyFlowDataPoint) => number;
  determineTrend: (dataPoints: MoneyFlowDataPoint[]) => 'up' | 'down' | 'neutral';
  getVisualIndicator: (dataPoint: MoneyFlowDataPoint, trend: string) => MoneyFlowVisualIndicator;
  generateTimePeriods: (raceStartTime: string, currentTime: string) => MoneyFlowTimePeriod[];
}