/**
 * Data Quality Validation Module
 * Implements mathematical consistency checks and quality scoring for transformed race data
 * Story 2.10C - Task 4 (AC4)
 */

import { logger } from '../shared/logger.js'
import type { TransformedRace, TransformedEntrant, MoneyFlowRecord } from '../workers/messages.js'
import type { RacePoolData } from '../utils/race-pools.js'

/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Data quality validation result
 */
export interface DataQualityResult {
  is_valid: boolean
  quality_score: number // 0-100
  warnings: string[]
  errors: string[]
  metrics: {
    total_checks: number
    passed_checks: number
    failed_checks: number
  }
}

/**
 * Validation thresholds and constants
 */
const QUALITY_THRESHOLDS = {
  MIN_ACCEPTABLE_SCORE: 80,
  PERCENTAGE_TOLERANCE: 0.5, // Allow 0.5% deviation for rounding
  POOL_RATIO_MAX: 3.0, // Place pool should not exceed win pool by more than 3x
  MIN_ENTRANT_COUNT: 2,
  MAX_ENTRANT_COUNT: 30,
} as const

/**
 * Validate mathematical consistency of pool percentages (AC4)
 * Ensures all entrant percentages sum to approximately 100%
 */
const validatePoolPercentageSum = (
  entrants: TransformedEntrant[],
  poolType: 'win' | 'place'
): { valid: boolean; actual: number; deviation: number } => {
  const percentages = entrants
    .map((e) =>
      poolType === 'win' ? e.win_pool_percentage : e.place_pool_percentage
    )
    .filter((p): p is number => p !== null)

  if (percentages.length === 0) {
    return { valid: false, actual: 0, deviation: 100 }
  }

  const sum = percentages.reduce((acc, p) => acc + p, 0)
  const deviation = Math.abs(100 - sum)
  const valid = deviation <= QUALITY_THRESHOLDS.PERCENTAGE_TOLERANCE

  return { valid, actual: sum, deviation }
}

/**
 * Validate race pool data consistency (AC4)
 * Checks that pool amounts are reasonable and internally consistent
 */
const validateRacePoolConsistency = (
  poolData: RacePoolData | null
): { valid: boolean; warnings: string[] } => {
  const warnings: string[] = []

  if (poolData === null) {
    warnings.push('No race pool data available')
    return { valid: false, warnings }
  }

  // Validate minimum pools present
  if (poolData.win_pool_total === 0 && poolData.place_pool_total === 0) {
    warnings.push('Both win and place pools are zero - race may be too early or abandoned')
    return { valid: false, warnings }
  }

  // Validate place pool ratio
  if (
    poolData.win_pool_total > 0 &&
    poolData.place_pool_total > poolData.win_pool_total * QUALITY_THRESHOLDS.POOL_RATIO_MAX
  ) {
    warnings.push(
      `Place pool (${String(poolData.place_pool_total)}) unusually large compared to win pool (${String(poolData.win_pool_total)})`
    )
  }

  // Validate extracted pools count
  if (poolData.extracted_pools === 0) {
    warnings.push('No pools were extracted from API data')
    return { valid: false, warnings }
  }

  return { valid: true, warnings }
}

/**
 * Validate entrant count against race expectations (AC4)
 */
const validateEntrantCount = (
  entrantCount: number
): { valid: boolean; warning?: string } => {
  if (entrantCount < QUALITY_THRESHOLDS.MIN_ENTRANT_COUNT) {
    return {
      valid: false,
      warning: `Entrant count (${String(entrantCount)}) below minimum threshold (${String(QUALITY_THRESHOLDS.MIN_ENTRANT_COUNT)})`,
    }
  }

  if (entrantCount > QUALITY_THRESHOLDS.MAX_ENTRANT_COUNT) {
    return {
      valid: false,
      warning: `Entrant count (${String(entrantCount)}) exceeds maximum threshold (${String(QUALITY_THRESHOLDS.MAX_ENTRANT_COUNT)})`,
    }
  }

  return { valid: true }
}

/**
 * Validate money flow record consistency (AC4)
 * Ensures incremental amounts don't exceed total pool amounts
 */
const validateMoneyFlowConsistency = (
  records: MoneyFlowRecord[]
): { valid: boolean; warnings: string[] } => {
  const warnings: string[] = []

  for (const record of records) {
    // Validate incremental amounts don't exceed total amounts
    if (
      record.incremental_win_amount > record.win_pool_amount &&
      record.incremental_win_amount > 0
    ) {
      warnings.push(
        `Entrant ${record.entrant_id}: Incremental win amount (${String(record.incremental_win_amount)}) exceeds total pool amount (${String(record.win_pool_amount)})`
      )
    }

    if (
      record.incremental_place_amount > record.place_pool_amount &&
      record.incremental_place_amount > 0
    ) {
      warnings.push(
        `Entrant ${record.entrant_id}: Incremental place amount (${String(record.incremental_place_amount)}) exceeds total pool amount (${String(record.place_pool_amount)})`
      )
    }

    // Validate time interval consistency
    if (
      record.interval_type === 'live' &&
      record.time_to_start >= 0
    ) {
      warnings.push(
        `Entrant ${record.entrant_id}: interval_type is 'live' but time_to_start is ${String(record.time_to_start)} (expected negative)`
      )
    }
  }

  return { valid: warnings.length === 0, warnings }
}

/**
 * Calculate overall data quality score (AC4)
 * Scoring based on completeness and consistency checks
 */
const calculateQualityScore = (
  transformed: TransformedRace,
  checks: {
    winPoolPercentageValid: boolean
    placePoolPercentageValid: boolean
    racePoolValid: boolean
    entrantCountValid: boolean
    moneyFlowValid: boolean
  }
): number => {
  let score = 100

  // Deduct points for failed checks (20 points each)
  if (!checks.winPoolPercentageValid) score -= 20
  if (!checks.placePoolPercentageValid) score -= 20
  if (!checks.racePoolValid) score -= 15
  if (!checks.entrantCountValid) score -= 15
  if (!checks.moneyFlowValid) score -= 10

  // Deduct points for missing data
  if (transformed.meeting === null) score -= 5
  if (transformed.entrants.length === 0) score -= 10
  if (transformed.moneyFlowRecords.length === 0) score -= 10
  if (transformed.racePools === null || transformed.racePools === undefined || transformed.racePools.length === 0) {
    score -= 10
  }

  return Math.max(0, score)
}

/**
 * Validate transformed race data for mathematical consistency and completeness (AC4)
 *
 * Performs comprehensive data quality checks:
 * - Pool percentage summation (should total ~100%)
 * - Race pool consistency (reasonable amounts)
 * - Entrant count validation
 * - Money flow incremental delta validation
 * - Data completeness scoring
 *
 * @param transformed - Transformed race data from worker
 * @returns Data quality validation result with score and warnings
 *
 * @example
 * ```typescript
 * const result = validateTransformedRaceData(transformedRace)
 * if (result.quality_score < 80) {
 *   logger.warn({ score: result.quality_score, warnings: result.warnings }, 'Low quality data')
 * }
 * ```
 */
export function validateTransformedRaceData(
  transformed: TransformedRace
): DataQualityResult {
  const warnings: string[] = []
  const errors: string[] = []
  let totalChecks = 0
  let passedChecks = 0

  // Check 1: Win pool percentages sum to 100%
  totalChecks++
  const winPoolCheck = validatePoolPercentageSum(
    transformed.entrants,
    'win'
  )
  if (!winPoolCheck.valid) {
    warnings.push(
      `Win pool percentages sum to ${winPoolCheck.actual.toFixed(2)}% (deviation: ${winPoolCheck.deviation.toFixed(2)}%)`
    )
  } else {
    passedChecks++
  }

  // Check 2: Place pool percentages sum to 100%
  totalChecks++
  const placePoolCheck = validatePoolPercentageSum(
    transformed.entrants,
    'place'
  )
  if (!placePoolCheck.valid) {
    warnings.push(
      `Place pool percentages sum to ${placePoolCheck.actual.toFixed(2)}% (deviation: ${placePoolCheck.deviation.toFixed(2)}%)`
    )
  } else {
    passedChecks++
  }

  // Check 3: Race pool consistency
  totalChecks++
  const poolData = (transformed.racePools !== null && transformed.racePools !== undefined && transformed.racePools.length > 0)
    ? (transformed.racePools[0] ?? null)
    : null
  const racePoolCheck = validateRacePoolConsistency(poolData)
  if (!racePoolCheck.valid) {
    warnings.push(...racePoolCheck.warnings)
  } else {
    passedChecks++
  }
  if (racePoolCheck.warnings.length > 0) {
    warnings.push(...racePoolCheck.warnings)
  }

  // Check 4: Entrant count
  totalChecks++
  const entrantCountCheck = validateEntrantCount(transformed.entrants.length)
  if (!entrantCountCheck.valid && entrantCountCheck.warning !== undefined) {
    warnings.push(entrantCountCheck.warning)
  } else {
    passedChecks++
  }

  // Check 5: Money flow consistency
  totalChecks++
  const moneyFlowCheck = validateMoneyFlowConsistency(
    transformed.moneyFlowRecords
  )
  if (!moneyFlowCheck.valid) {
    warnings.push(...moneyFlowCheck.warnings)
  } else {
    passedChecks++
  }

  // Calculate overall quality score
  const qualityScore = calculateQualityScore(transformed, {
    winPoolPercentageValid: winPoolCheck.valid,
    placePoolPercentageValid: placePoolCheck.valid,
    racePoolValid: racePoolCheck.valid,
    entrantCountValid: entrantCountCheck.valid,
    moneyFlowValid: moneyFlowCheck.valid,
  })

  // Determine if data is valid (no critical errors)
  const isValid = errors.length === 0 && qualityScore >= QUALITY_THRESHOLDS.MIN_ACCEPTABLE_SCORE

  // Log quality warnings if score below threshold
  if (qualityScore < QUALITY_THRESHOLDS.MIN_ACCEPTABLE_SCORE) {
    logger.warn(
      {
        raceId: transformed.raceId,
        quality_score: qualityScore,
        warnings,
        passed_checks: passedChecks,
        total_checks: totalChecks,
      },
      'Low data quality score detected'
    )
  }

  logger.debug(
    {
      raceId: transformed.raceId,
      quality_score: qualityScore,
      is_valid: isValid,
      warnings_count: warnings.length,
      errors_count: errors.length,
    },
    'Data quality validation completed'
  )

  return {
    is_valid: isValid,
    quality_score: qualityScore,
    warnings,
    errors,
    metrics: {
      total_checks: totalChecks,
      passed_checks: passedChecks,
      failed_checks: totalChecks - passedChecks,
    },
  }
}

/**
 * Validate data quality and return score only (lightweight version)
 */
export function getDataQualityScore(transformed: TransformedRace): number {
  const result = validateTransformedRaceData(transformed)
  return result.quality_score
}

/* eslint-enable @typescript-eslint/naming-convention */
