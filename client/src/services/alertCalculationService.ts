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
  const { currentTimeframe, previousTimeframe, entrantId } = input

  // Find entrant data in both timeframes
  const currentEntrant = currentTimeframe.find(dp => dp.entrant === entrantId)
  const previousEntrant = previousTimeframe.find(dp => dp.entrant === entrantId)

  if (!currentEntrant || !previousEntrant) {
    return {
      entrantId,
      percentageChange: 0,
      changeType: 'money_increase',
      hasChange: false,
    }
  }

  // Calculate timeframe totals (sum of all entrants' incremental amounts)
  const currentTotal = currentTimeframe.reduce((sum, dp) => sum + (dp.incrementalAmount || 0), 0)
  const previousTotal = previousTimeframe.reduce((sum, dp) => sum + (dp.incrementalAmount || 0), 0)

  if (currentTotal === 0 || previousTotal === 0) {
    return {
      entrantId,
      percentageChange: 0,
      changeType: 'money_increase',
      hasChange: false,
    }
  }

  // Calculate percentages of timeframe totals
  const currentPercentage = (currentEntrant.incrementalAmount / currentTotal) * 100
  const previousPercentage = (previousEntrant.incrementalAmount / previousTotal) * 100

  // Calculate change - only positive changes (increases)
  const percentageChange = currentPercentage - previousPercentage

  return {
    entrantId,
    percentageChange: Math.max(0, percentageChange), // Only increases
    changeType: 'money_increase',
    hasChange: percentageChange > 0 && percentageChange >= 5, // Minimum 5% threshold
  }
}

/**
 * Calculate odds percentage change for an entrant (Win Odds only)
 * Logic: Calculate percentage decrease (shortening) from previous timeframe
 * Only interested in odds shortening (decreases) indicating increased confidence
 */
export const calculateOddsChangePercentage = (input: OddsCalculationInput): PercentageChangeResult => {
  const { currentOdds, previousOdds, entrantId } = input

  if (!currentOdds || !previousOdds || previousOdds === 0) {
    return {
      entrantId,
      percentageChange: 0,
      changeType: 'odds_shortening',
      hasChange: false,
    }
  }

  // Calculate percentage decrease (shortening)
  // Example: 12.00 to 7.00 = (12-7)/12 = 42% decrease
  const percentageDecrease = ((previousOdds - currentOdds) / previousOdds) * 100

  // Only interested in odds shortening (positive percentage decrease)
  const shorteningPercentage = Math.max(0, percentageDecrease)

  return {
    entrantId,
    percentageChange: shorteningPercentage,
    changeType: 'odds_shortening',
    hasChange: shorteningPercentage > 0 && shorteningPercentage >= 5, // Minimum 5% threshold
  }
}

/**
 * Map percentage change to indicator based on 6-tier threshold system
 * Returns indicator type and color based on user configuration
 */
export const mapPercentageToIndicator = (
  percentageChange: number,
  userIndicators: IndicatorConfig[],
  changeType: 'money_increase' | 'odds_shortening'
): IndicatorResult | null => {
  if (percentageChange < 5) {
    return null // Below minimum threshold
  }

  // Find matching threshold range
  const matchingIndicator = userIndicators.find(indicator => {
    const { percentageRangeMin, percentageRangeMax } = indicator
    if (percentageRangeMax === null) {
      // 50%+ range
      return percentageChange >= percentageRangeMin
    }
    return percentageChange >= percentageRangeMin && percentageChange < percentageRangeMax
  })

  if (!matchingIndicator) {
    return null
  }

  return {
    entrantId: '', // Will be set by caller
    percentageChange,
    indicatorType: formatPercentageRange(matchingIndicator),
    color: matchingIndicator.color,
    enabled: matchingIndicator.enabled,
    changeType,
  }
}

/**
 * Format percentage range for display
 */
const formatPercentageRange = (indicator: IndicatorConfig): string => {
  if (indicator.percentageRangeMax === null) {
    return `${indicator.percentageRangeMin}%+`
  }
  return `${indicator.percentageRangeMin}-${indicator.percentageRangeMax}%`
}

/**
 * Load user alert configuration and create calculation context
 */
export const createCalculationContext = async (
  userId?: string,
  enabledOnly = true
): Promise<CalculationContext> => {
  const alertsConfig = await loadUserAlertConfig(userId)

  return {
    userIndicators: alertsConfig.indicators,
    enabledOnly,
  }
}

/**
 * Process batch calculations for multiple entrants with money and odds data
 */
export const calculateBatchIndicators = async (
  input: BatchCalculationInput
): Promise<BatchCalculationResult> => {
  const { moneyFlowData, oddsData, context } = input
  const { userIndicators, enabledOnly } = context

  const moneyIndicators: IndicatorResult[] = []
  const oddsIndicators: IndicatorResult[] = []

  // Get unique entrant IDs from money flow data
  const entrantIds = new Set([
    ...moneyFlowData.currentTimeframe.map(dp => dp.entrant),
    ...moneyFlowData.previousTimeframe.map(dp => dp.entrant),
  ])

  // Calculate money indicators
  for (const entrantId of entrantIds) {
    const moneyResult = calculateMoneyChangePercentage({
      currentTimeframe: moneyFlowData.currentTimeframe,
      previousTimeframe: moneyFlowData.previousTimeframe,
      entrantId,
    })

    if (moneyResult.hasChange) {
      const indicator = mapPercentageToIndicator(
        moneyResult.percentageChange,
        userIndicators,
        'money_increase'
      )

      if (indicator && (!enabledOnly || indicator.enabled)) {
        moneyIndicators.push({
          ...indicator,
          entrantId,
        })
      }
    }
  }

  // Calculate odds indicators
  for (const oddsEntry of oddsData) {
    const oddsResult = calculateOddsChangePercentage(oddsEntry)

    if (oddsResult.hasChange) {
      const indicator = mapPercentageToIndicator(
        oddsResult.percentageChange,
        userIndicators,
        'odds_shortening'
      )

      if (indicator && (!enabledOnly || indicator.enabled)) {
        oddsIndicators.push({
          ...indicator,
          entrantId: oddsEntry.entrantId,
        })
      }
    }
  }

  return {
    moneyIndicators,
    oddsIndicators,
    calculationTimestamp: new Date().toISOString(),
    totalEntrants: entrantIds.size,
  }
}

/**
 * Validate calculation inputs
 */
export const validateMoneyCalculationInput = (input: MoneyCalculationInput): ValidationResult => {
  const errors: string[] = []

  if (!input.entrantId?.trim()) {
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
    if (typeof dp.incrementalAmount !== 'number') {
      errors.push(`Current timeframe data point ${index} missing incrementalAmount`)
    }
    if (!dp.entrant?.trim()) {
      errors.push(`Current timeframe data point ${index} missing entrant ID`)
    }
  })

  input.previousTimeframe?.forEach((dp, index) => {
    if (typeof dp.incrementalAmount !== 'number') {
      errors.push(`Previous timeframe data point ${index} missing incrementalAmount`)
    }
    if (!dp.entrant?.trim()) {
      errors.push(`Previous timeframe data point ${index} missing entrant ID`)
    }
  })

  return {
    isValid: errors.length === 0,
    errors,
  }
}

export const validateOddsCalculationInput = (input: OddsCalculationInput): ValidationResult => {
  const errors: string[] = []

  if (!input.entrantId?.trim()) {
    errors.push('Entrant ID is required')
  }

  if (typeof input.currentOdds !== 'number' || input.currentOdds <= 0) {
    errors.push('Valid current odds value is required')
  }

  if (typeof input.previousOdds !== 'number' || input.previousOdds <= 0) {
    errors.push('Valid previous odds value is required')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}