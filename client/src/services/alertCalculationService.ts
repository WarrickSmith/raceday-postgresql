/**
 * Alert Calculation Service
 * Story 5.2: Implement Visual Alert Calculation Engine
 *
 * Calculation engine for visual alert indicators that computes percentage changes
 * in money amounts and odds based on indicator-logic.txt specifications
 */

import type {
  MoneyCalculationInput,
  OddsCalculationInput,
  PercentageChangeResult,
  IndicatorResult,
  CalculationContext,
  BatchCalculationInput,
  BatchCalculationResult,
  ValidationResult,
} from '@/types/alertCalculations'
import type { IndicatorConfig } from '@/types/alerts'
import { loadUserAlertConfig } from './alertConfigService'

/**
 * Calculate money percentage change for an entrant
 * Logic: Compare entrant's percentage of timeframe total vs previous timeframe
 * Only returns positive changes (increases only)
 */
export const calculateMoneyChangePercentage = (input: MoneyCalculationInput): PercentageChangeResult => {
  const { currentTimeframe, previousTimeframe, entrant_id } = input

  // Find entrant data in both timeframes
  const currentEntrant = currentTimeframe.find(
    (dp) => dp.entrant_id === entrant_id
  )
  const previousEntrant = previousTimeframe.find(
    (dp) => dp.entrant_id === entrant_id
  )

  if (!currentEntrant || !previousEntrant) {
    return {
      entrant_id,
      percentage_change: 0,
      change_type: 'money_increase',
      has_change: false,
    }
  }

  // Calculate timeframe totals (sum of all entrants' incremental amounts)
  const currentTotal = currentTimeframe.reduce((sum, dp) => sum + (dp.incremental_amount || 0), 0)
  const previousTotal = previousTimeframe.reduce((sum, dp) => sum + (dp.incremental_amount || 0), 0)

  if (currentTotal === 0 || previousTotal === 0) {
    return {
      entrant_id,
      percentage_change: 0,
      change_type: 'money_increase',
      has_change: false,
    }
  }

  // Calculate percentages of timeframe totals
  const currentPercentage =
    ((currentEntrant.incremental_amount ?? 0) / currentTotal) * 100
  const previousPercentage =
    ((previousEntrant.incremental_amount ?? 0) / previousTotal) * 100

  // Calculate change - only positive changes (increases)
  const percentageChange = currentPercentage - previousPercentage

  return {
    entrant_id,
    percentage_change: Math.max(0, percentageChange), // Only increases
    change_type: 'money_increase',
    has_change: percentageChange > 0 && percentageChange >= 5, // Minimum 5% threshold
  }
}

/**
 * Calculate odds percentage change for an entrant (Win Odds only)
 * Logic: Calculate percentage decrease (shortening) from previous timeframe
 * Only interested in odds shortening (decreases) indicating increased confidence
 */
export const calculateOddsChangePercentage = (input: OddsCalculationInput): PercentageChangeResult => {
  const { currentOdds, previousOdds, entrant_id } = input

  if (!currentOdds || !previousOdds || previousOdds === 0) {
    return {
      entrant_id,
      percentage_change: 0,
      change_type: 'odds_shortening',
      has_change: false,
    }
  }

  // Calculate percentage decrease (shortening)
  // Example: 12.00 to 7.00 = (12-7)/12 = 42% decrease
  const percentageDecrease = ((previousOdds - currentOdds) / previousOdds) * 100

  // Only interested in odds shortening (positive percentage decrease)
  const shorteningPercentage = Math.max(0, percentageDecrease)

  return {
    entrant_id,
    percentage_change: shorteningPercentage,
    change_type: 'odds_shortening',
    has_change: shorteningPercentage > 0 && shorteningPercentage >= 5, // Minimum 5% threshold
  }
}

/**
 * Map percentage change to indicator based on 6-tier threshold system
 * Returns indicator type and color based on user configuration
 */
export const mapPercentageToIndicator = (
  percentage_change: number,
  user_indicators: IndicatorConfig[],
  change_type: 'money_increase' | 'odds_shortening'
): IndicatorResult | null => {
  if (percentage_change < 5) {
    return null // Below minimum threshold
  }

  // Find matching threshold range
  const matchingIndicator = user_indicators.find(indicator => {
    const { percentage_range_min, percentage_range_max } = indicator
    if (percentage_range_max === null) {
      // 50%+ range
      return percentage_change >= percentage_range_min
    }
    return percentage_change >= percentage_range_min && percentage_change < percentage_range_max
  })

  if (!matchingIndicator) {
    return null
  }

  return {
    entrant_id: '', // Will be set by caller
    percentage_change,
    indicator_type: formatPercentageRange(matchingIndicator),
    color: matchingIndicator.color,
    enabled: matchingIndicator.enabled,
    change_type,
  }
}

/**
 * Format percentage range for display
 */
const formatPercentageRange = (indicator: IndicatorConfig): string => {
  if (indicator.percentage_range_max === null) {
    return `${indicator.percentage_range_min}%+`
  }
  return `${indicator.percentage_range_min}-${indicator.percentage_range_max}%`
}

/**
 * Load user alert configuration and create calculation context
 */
export const createCalculationContext = async (
  userId?: string,
  enabled_only = true
): Promise<CalculationContext> => {
  const alertsConfig = await loadUserAlertConfig(userId)

  return {
    user_indicators: alertsConfig.indicators,
    enabled_only,
  }
}

/**
 * Process batch calculations for multiple entrants with money and odds data
 */
export const calculateBatchIndicators = async (
  input: BatchCalculationInput
): Promise<BatchCalculationResult> => {
  const { money_flow_data, odds_data, context } = input
  const { user_indicators, enabled_only } = context

  const moneyIndicators: IndicatorResult[] = []
  const oddsIndicators: IndicatorResult[] = []

  // Get unique entrant IDs from money flow data
  const entrant_ids = new Set([
    ...money_flow_data.current_timeframe.map((dp) => dp.entrant_id),
    ...money_flow_data.previous_timeframe.map((dp) => dp.entrant_id),
  ])

  // Calculate money indicators
  for (const entrant of entrant_ids) {
    const entrant_id =
      typeof entrant === 'string' && entrant.length > 0
        ? entrant
        : String(entrant ?? '').trim()

    if (!entrant_id) {
      continue
    }
    const moneyResult = calculateMoneyChangePercentage({
      currentTimeframe: money_flow_data.current_timeframe,
      previousTimeframe: money_flow_data.previous_timeframe,
      entrant_id,
    })

    if (moneyResult.has_change) {
      const indicator = mapPercentageToIndicator(
        moneyResult.percentage_change,
        user_indicators,
        'money_increase'
      )

      if (indicator && (!enabled_only || indicator.enabled)) {
        moneyIndicators.push({
          ...indicator,
          entrant_id,
        })
      }
    }
  }

  // Calculate odds indicators
  for (const oddsEntry of odds_data) {
    const oddsResult = calculateOddsChangePercentage({
      currentOdds: oddsEntry.current_odds,
      previousOdds: oddsEntry.previous_odds,
      entrant_id: oddsEntry.entrant_id,
    })

    if (oddsResult.has_change) {
      const indicator = mapPercentageToIndicator(
        oddsResult.percentage_change,
        user_indicators,
        'odds_shortening'
      )

      if (indicator && (!enabled_only || indicator.enabled)) {
        oddsIndicators.push({
          ...indicator,
          entrant_id: oddsEntry.entrant_id,
        })
      }
    }
  }

  return {
    money_indicators: moneyIndicators,
    odds_indicators: oddsIndicators,
    calculation_timestamp: new Date().toISOString(),
    total_entrants: entrant_ids.size,
  }
}

/**
 * Validate calculation inputs
 */
export const validateMoneyCalculationInput = (input: MoneyCalculationInput): ValidationResult => {
  const errors: string[] = []

  if (!input.entrant_id?.trim()) {
    errors.push('Entrant ID is required')
  }

  if (!input.currentTimeframe || input.currentTimeframe.length === 0) {
    errors.push('Current timeframe data is required')
  }

  if (!input.previousTimeframe || input.previousTimeframe.length === 0) {
    errors.push('Previous timeframe data is required')
  }

  // Validate data structure
  input.currentTimeframe?.forEach((dp, index) => {
    if (typeof dp.incremental_amount !== 'number') {
      errors.push(`Current timeframe data point ${index} missing incremental_amount`)
    }
    const entrantIdValue =
      typeof dp.entrant_id === 'string'
        ? dp.entrant_id.trim()
        : String(dp.entrant_id ?? '').trim()
    if (!entrantIdValue) {
      errors.push(`Current timeframe data point ${index} missing entrant ID`)
    }
  })

  input.previousTimeframe?.forEach((dp, index) => {
    if (typeof dp.incremental_amount !== 'number') {
      errors.push(`Previous timeframe data point ${index} missing incremental_amount`)
    }
    const entrantIdValue =
      typeof dp.entrant_id === 'string'
        ? dp.entrant_id.trim()
        : String(dp.entrant_id ?? '').trim()
    if (!entrantIdValue) {
      errors.push(`Previous timeframe data point ${index} missing entrant ID`)
    }
  })

  return {
    is_valid: errors.length === 0,
    errors,
  }
}

export const validateOddsCalculationInput = (input: OddsCalculationInput): ValidationResult => {
  const errors: string[] = []

  if (!input.entrant_id?.trim()) {
    errors.push('Entrant ID is required')
  }

  if (typeof input.currentOdds !== 'number' || input.currentOdds <= 0) {
    errors.push('Valid current odds value is required')
  }

  if (typeof input.previousOdds !== 'number' || input.previousOdds <= 0) {
    errors.push('Valid previous odds value is required')
  }

  return {
    is_valid: errors.length === 0,
    errors,
  }
}
