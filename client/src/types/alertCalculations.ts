/**
 * Alert Calculation Types
 * Story 5.2: Implement Visual Alert Calculation Engine
 *
 * Type definitions for calculation engine that computes percentage changes
 * in money amounts and odds for visual alert indicators
 */

import type { IndicatorConfig } from './alerts'
import type { MoneyFlowDataPoint } from './moneyFlow'

// Input data for money percentage calculations
export interface MoneyCalculationInput {
  currentTimeframe: MoneyFlowDataPoint[]
  previousTimeframe: MoneyFlowDataPoint[]
  entrant_id: string
}

// Input data for odds calculations
export interface OddsCalculationInput {
  currentOdds: number
  previousOdds: number
  entrant_id: string
}

// Result of percentage change calculation
export interface PercentageChangeResult {
  entrant_id: string
  percentage_change: number
  change_type: 'money_increase' | 'odds_shortening'
  has_change: boolean // true if change meets minimum threshold
}

// Mapped indicator result after threshold matching
export interface IndicatorResult {
  entrant_id: string
  percentage_change: number
  indicator_type: string // e.g. '10-15%'
  color: string // hex color from user configuration
  enabled: boolean // based on user alert preferences
  change_type: 'money_increase' | 'odds_shortening'
}

// Threshold range definition for mapping
export interface ThresholdRange {
  min: number
  max: number | null // null for 50%+
  label: string // e.g. '5-10%'
  default_color: string
}

// Complete calculation context including user preferences
export interface CalculationContext {
  user_indicators: IndicatorConfig[]
  enabled_only: boolean // filter to only enabled indicators
}

// Batch calculation input for multiple entrants
export interface BatchCalculationInput {
  money_flow_data: {
    current_timeframe: MoneyFlowDataPoint[]
    previous_timeframe: MoneyFlowDataPoint[]
  }
  odds_data: {
    entrant_id: string
    current_odds: number
    previous_odds: number
  }[]
  context: CalculationContext
}

// Batch calculation result
export interface BatchCalculationResult {
  money_indicators: IndicatorResult[]
  odds_indicators: IndicatorResult[]
  calculation_timestamp: string
  total_entrants: number
}

// Validation result for calculation inputs
export interface ValidationResult {
  is_valid: boolean
  errors: string[]
}

// Standard threshold ranges matching the 6-tier system
export const STANDARD_THRESHOLD_RANGES: ThresholdRange[] = [
  { min: 5, max: 10, label: '5-10%', default_color: '#E5E7EB' },
  { min: 10, max: 15, label: '10-15%', default_color: '#BFDBFE' },
  { min: 15, max: 20, label: '15-20%', default_color: '#FEF3C7' },
  { min: 20, max: 25, label: '20-25%', default_color: '#BBF7D0' },
  { min: 25, max: 50, label: '25-50%', default_color: '#FECACA' },
  { min: 50, max: null, label: '50%+', default_color: '#F3E8FF' },
]
