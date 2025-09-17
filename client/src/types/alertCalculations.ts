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
  entrantId: string
}

// Input data for odds calculations
export interface OddsCalculationInput {
  currentOdds: number
  previousOdds: number
  entrantId: string
}

// Result of percentage change calculation
export interface PercentageChangeResult {
  entrantId: string
  percentageChange: number
  changeType: 'money_increase' | 'odds_shortening'
  hasChange: boolean // true if change meets minimum threshold
}

// Mapped indicator result after threshold matching
export interface IndicatorResult {
  entrantId: string
  percentageChange: number
  indicatorType: string // e.g. '10-15%'
  color: string // hex color from user configuration
  enabled: boolean // based on user alert preferences
  changeType: 'money_increase' | 'odds_shortening'
}

// Threshold range definition for mapping
export interface ThresholdRange {
  min: number
  max: number | null // null for 50%+
  label: string // e.g. '5-10%'
  defaultColor: string
}

// Complete calculation context including user preferences
export interface CalculationContext {
  userIndicators: IndicatorConfig[]
  enabledOnly: boolean // filter to only enabled indicators
}

// Batch calculation input for multiple entrants
export interface BatchCalculationInput {
  moneyFlowData: {
    currentTimeframe: MoneyFlowDataPoint[]
    previousTimeframe: MoneyFlowDataPoint[]
  }
  oddsData: {
    entrantId: string
    currentOdds: number
    previousOdds: number
  }[]
  context: CalculationContext
}

// Batch calculation result
export interface BatchCalculationResult {
  moneyIndicators: IndicatorResult[]
  oddsIndicators: IndicatorResult[]
  calculationTimestamp: string
  totalEntrants: number
}

// Validation result for calculation inputs
export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

// Standard threshold ranges matching the 6-tier system
export const STANDARD_THRESHOLD_RANGES: ThresholdRange[] = [
  { min: 5, max: 10, label: '5-10%', defaultColor: '#E5E7EB' },
  { min: 10, max: 15, label: '10-15%', defaultColor: '#BFDBFE' },
  { min: 15, max: 20, label: '15-20%', defaultColor: '#FEF3C7' },
  { min: 20, max: 25, label: '20-25%', defaultColor: '#BBF7D0' },
  { min: 25, max: 50, label: '25-50%', defaultColor: '#FECACA' },
  { min: 50, max: null, label: '50%+', defaultColor: '#F3E8FF' },
]
