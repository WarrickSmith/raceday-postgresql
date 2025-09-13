/**
 * Enhanced Money Flow Types for v4.7 Race Interface
 * Supports timeline visualization and incremental money flow display
 */

// Time periods for money flow timeline columns
export interface MoneyFlowTimePeriod {
  label: string // e.g., 'T-60m', 'T-40m', 'T-20m', etc.
  timeToStart: number // minutes until race start
  timestamp: string // actual timestamp of this period
}

// Individual money flow data point for timeline
export interface MoneyFlowDataPoint {
  $id: string
  $createdAt: string
  $updatedAt: string
  entrant: string
  pollingTimestamp: string
  timeToStart: number // minutes until race start
  // Optional bucketed timeline fields (added for bucketed_aggregation documents)
  timeInterval?: number // bucketed interval (minutes or fractional)
  intervalType?: string // e.g. '5m', '1m', '30s'
  pollingInterval?: number // minutes since last poll (e.g. 0.5 for 30s)

  winPoolAmount: number
  placePoolAmount: number
  totalPoolAmount: number
  poolPercentage: number

  // Incremental deltas (server may pre-calculate separate fields)
  incrementalAmount: number // generic incremental amount (fallback)
  incrementalWinAmount?: number // optional pre-calculated win incremental (cents)
  incrementalPlaceAmount?: number // optional pre-calculated place incremental (cents)

  // CONSOLIDATED ODDS DATA (NEW in Story 4.9)
  fixedWinOdds?: number // Fixed Win odds at this time bucket
  fixedPlaceOdds?: number // Fixed Place odds at this time bucket  
  poolWinOdds?: number // Pool Win odds (tote) at this time bucket
  poolPlaceOdds?: number // Pool Place odds (tote) at this time bucket

  // Allow other optional properties that may appear on server docs
  [k: string]: any
}

// Money flow timeline data for an entrant (all time periods)
export interface EntrantMoneyFlowTimeline {
  entrantId: string
  dataPoints: MoneyFlowDataPoint[]
  latestPercentage: number
  trend: 'up' | 'down' | 'neutral'
  significantChange: boolean // true if change > 5%
  // Latest odds from timeline data (NEW in Story 4.9)
  latestWinOdds?: number // Latest Fixed Win odds from timeline
  latestPlaceOdds?: number // Latest Fixed Place odds from timeline
}

// Visual indicators for money flow changes
export interface MoneyFlowVisualIndicator {
  type: 'increase' | 'decrease' | 'significant' | 'recent'
  color: 'green' | 'yellow' | 'red' | 'blue'
  icon?: '⚡' | '🔥' | '📈' | '📉'
  description: string
}

// Complete money flow timeline for all entrants
export interface MoneyFlowTimelineData {
  timePeriods: MoneyFlowTimePeriod[]
  entrantTimelines: Map<string, EntrantMoneyFlowTimeline>
  lastUpdated: string
  pollingActive: boolean
}

// Money flow subscription callback interface
export interface MoneyFlowTimelineSubscriptionResponse {
  payload?: {
    entrant?: string
    pollingTimestamp?: string
    winPoolAmount?: number
    placePoolAmount?: number
    totalPoolAmount?: number
    poolPercentage?: number
    incrementalAmount?: number
  }
  events?: string[]
}

// Money flow processing utilities
export interface MoneyFlowCalculations {
  calculateIncremental: (
    current: MoneyFlowDataPoint,
    previous?: MoneyFlowDataPoint
  ) => number
  determineTrend: (
    dataPoints: MoneyFlowDataPoint[]
  ) => 'up' | 'down' | 'neutral'
  getVisualIndicator: (
    dataPoint: MoneyFlowDataPoint,
    trend: string
  ) => MoneyFlowVisualIndicator
  generateTimePeriods: (
    raceStartTime: string,
    currentTime: string
  ) => MoneyFlowTimePeriod[]
}
