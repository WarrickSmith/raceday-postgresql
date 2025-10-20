/**
 * Enhanced Money Flow Types for v4.7 Race Interface
 * Supports timeline visualization and incremental money flow display
 */

// Time periods for money flow timeline columns
export interface MoneyFlowTimePeriod {
  label: string // e.g., 'T-60m', 'T-40m', 'T-20m', etc.
  time_to_start: number // minutes until race start
  timestamp: string // actual timestamp of this period
}

// Individual money flow data point for timeline
export interface MoneyFlowDataPoint {
  entry_id: string
  created_at: string
  updated_at: string
  entrant_id: string
  polling_timestamp: string
  time_to_start: number // minutes until race start
  // Optional bucketed timeline fields (added for bucketed_aggregation documents)
  time_interval?: number // bucketed interval (minutes or fractional)
  interval_type?: string // e.g. '5m', '1m', '30s'
  polling_interval?: number // minutes since last poll (e.g. 0.5 for 30s)

  win_pool_amount: number
  place_pool_amount: number
  total_pool_amount: number
  pool_percentage: number

  // Incremental deltas (server may pre-calculate separate fields)
  incremental_amount: number // generic incremental amount (fallback)
  incremental_win_amount?: number // optional pre-calculated win incremental (cents)
  incremental_place_amount?: number // optional pre-calculated place incremental (cents)

  // CONSOLIDATED ODDS DATA (NEW in Story 4.9)
  fixed_win_odds?: number // Fixed Win odds at this time bucket
  fixed_place_odds?: number // Fixed Place odds at this time bucket
  pool_win_odds?: number // Pool Win odds (tote) at this time bucket
  pool_place_odds?: number // Pool Place odds (tote) at this time bucket

  // Allow other optional properties that may appear on server docs
  [k: string]: unknown
}

// Money flow timeline data for an entrant (all time periods)
export interface EntrantMoneyFlowTimeline {
  entrant_id: string
  data_points: MoneyFlowDataPoint[]
  latest_percentage: number
  trend: 'up' | 'down' | 'neutral'
  significant_change: boolean // true if change > 5%
  // Latest odds from timeline data (NEW in Story 4.9)
  latest_win_odds?: number // Latest Fixed Win odds from timeline
  latest_place_odds?: number // Latest Fixed Place odds from timeline
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
  time_periods: MoneyFlowTimePeriod[]
  entrant_timelines: Map<string, EntrantMoneyFlowTimeline>
  last_updated: string
  polling_active: boolean
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
