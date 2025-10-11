/**
 * Money Flow Calculation Utilities
 *
 * Pure functions for calculating money flow analytics per AC3, AC4, AC5.
 * Extracted from server-old and refactored to TypeScript with strict types.
 *
 * All functions are pure (deterministic, no side effects) per AC10.
 * Zero `any` types enforced per AC8.
 *
 * @see {@link ../../server-old/enhanced-race-poller/src/database-utils.js} - Legacy calculation source
 * @see {@link docs/tech-spec-epic-2.md#L169} - AC6 money flow calculation requirements
 */

/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Pool data required for money flow calculations
 */
export interface PoolData {
  winPoolTotal: number
  placePoolTotal: number
  totalRacePool: number
}

/**
 * Entrant money flow percentages from NZ TAB API
 */
export interface EntrantPercentages {
  hold_percentage: number
  bet_percentage: number
}

/**
 * Calculated pool amounts for an entrant
 */
export interface PoolAmounts {
  winPoolAmount: number // Amount in cents
  placePoolAmount: number // Amount in cents
  totalPoolAmount: number // Amount in cents
}

/**
 * Calculated pool percentages for an entrant
 */
export interface PoolPercentages {
  win_pool_percentage: number | null
  place_pool_percentage: number | null
}

/**
 * Time-based metadata for interval analytics
 */
export interface TimeMetadata {
  time_to_start: number // Minutes until race start (negative = race started)
  time_interval: number // Bucketed interval for aggregation
  interval_type: '5m' | '2m' | '30s' | 'live' | 'unknown'
}

/**
 * Previous bucket data for incremental delta calculation
 */
export interface PreviousBucketData {
  winPoolAmount: number
  placePoolAmount: number
}

/**
 * Incremental delta amounts between polling cycles
 */
export interface IncrementalDelta {
  incrementalWinAmount: number
  incrementalPlaceAmount: number
}

/**
 * Calculate pool amounts from entrant hold percentage and race pool totals (AC3, AC4)
 *
 * Formula: poolAmount = (poolTotal * (hold_percentage / 100)) * 100
 * - Divide hold_percentage by 100 to convert to decimal (e.g., 15% → 0.15)
 * - Multiply by poolTotal to get dollar amount
 * - Multiply by 100 to convert to cents for storage
 *
 * @param holdPercentage - Entrant's hold percentage from API (e.g., 15.5)
 * @param poolData - Race pool totals from tote_pools
 * @returns Pool amounts in cents
 *
 * @example
 * ```typescript
 * const poolData = { winPoolTotal: 50000, placePoolTotal: 30000, totalRacePool: 80000 }
 * const amounts = calculatePoolAmounts(15.5, poolData)
 * // amounts = { winPoolAmount: 775000, placePoolAmount: 465000, totalPoolAmount: 1240000 }
 * // (15.5% of $50,000 = $7,750 = 775,000 cents win pool)
 * ```
 */
export function calculatePoolAmounts(
  holdPercentage: number,
  poolData: PoolData
): PoolAmounts {
  const holdPercent = holdPercentage / 100

  const winPoolAmount = Math.round(poolData.winPoolTotal * holdPercent * 100)
  const placePoolAmount = Math.round(
    poolData.placePoolTotal * holdPercent * 100
  )
  const totalPoolAmount = Math.round(
    (poolData.winPoolTotal + poolData.placePoolTotal) * holdPercent * 100
  )

  return {
    winPoolAmount,
    placePoolAmount,
    totalPoolAmount,
  }
}

/**
 * Calculate pool percentages from entrant pool amounts (AC3)
 *
 * Formula: pool_percentage = (entrantPoolAmount / (totalPoolAmount * 100)) * 100
 * - entrantPoolAmount is in cents
 * - totalPoolAmount is in dollars, multiply by 100 to convert to cents
 * - Result is percentage of total pool
 *
 * Returns null if pool total is zero (avoid division by zero)
 *
 * @param poolAmounts - Entrant's calculated pool amounts in cents
 * @param poolData - Race pool totals in dollars
 * @returns Pool percentages or null if pool total is zero
 *
 * @example
 * ```typescript
 * const poolAmounts = { winPoolAmount: 775000, placePoolAmount: 465000, totalPoolAmount: 1240000 }
 * const poolData = { winPoolTotal: 50000, placePoolTotal: 30000, totalRacePool: 80000 }
 * const percentages = calculatePoolPercentages(poolAmounts, poolData)
 * // percentages = { win_pool_percentage: 15.5, place_pool_percentage: 15.5 }
 * ```
 */
export function calculatePoolPercentages(
  poolAmounts: PoolAmounts,
  poolData: PoolData
): PoolPercentages {
  const win_pool_percentage =
    poolData.winPoolTotal > 0
      ? (poolAmounts.winPoolAmount / (poolData.winPoolTotal * 100)) * 100
      : null

  const place_pool_percentage =
    poolData.placePoolTotal > 0
      ? (poolAmounts.placePoolAmount / (poolData.placePoolTotal * 100)) * 100
      : null

  return {
    win_pool_percentage,
    place_pool_percentage,
  }
}

/**
 * Calculate incremental delta amounts between current and previous polling cycles (AC4)
 *
 * Formula: incrementalAmount = currentPoolAmount - previousPoolAmount
 * - Positive delta = money flowing in (increasing pool)
 * - Negative delta = money withdrawn (decreasing pool - rare)
 * - Zero delta = no change
 *
 * If no previous bucket exists (first poll), return current amounts as baseline
 *
 * @param currentAmounts - Current polling cycle pool amounts
 * @param previousBucket - Previous bucket data (null if first bucket)
 * @returns Incremental delta amounts in cents
 *
 * @example
 * ```typescript
 * const current = { winPoolAmount: 1000000, placePoolAmount: 600000, totalPoolAmount: 1600000 }
 * const previous = { winPoolAmount: 900000, placePoolAmount: 550000 }
 * const delta = calculateIncrementalDelta(current, previous)
 * // delta = { incrementalWinAmount: 100000, incrementalPlaceAmount: 50000 }
 * // ($1000 and $500 flowed into win and place pools respectively)
 * ```
 */
export function calculateIncrementalDelta(
  currentAmounts: PoolAmounts,
  previousBucket: PreviousBucketData | null
): IncrementalDelta {
  if (previousBucket === null) {
    // First bucket - use current amounts as baseline
    return {
      incrementalWinAmount: currentAmounts.winPoolAmount,
      incrementalPlaceAmount: currentAmounts.placePoolAmount,
    }
  }

  return {
    incrementalWinAmount:
      currentAmounts.winPoolAmount - previousBucket.winPoolAmount,
    incrementalPlaceAmount:
      currentAmounts.placePoolAmount - previousBucket.placePoolAmount,
  }
}

/**
 * Get timeline interval bucket for given time to start (AC5)
 *
 * Implements granular bucketing strategy:
 * - Pre-race: 60m, 55m, 50m, ..., 5m, 4m, 3m, 2m, 1m, 0m
 * - Post-race: -0.5m (-30s), -1m, -1.5m, ..., -5m, then 1-min intervals
 *
 * Used for time-series aggregation and interval-based analytics queries
 *
 * @param timeToStartMinutes - Minutes until race start (positive = before, negative = after)
 * @returns Timeline interval bucket
 *
 * @example
 * ```typescript
 * getTimelineInterval(12) // 10 (12 minutes before start → 10m bucket)
 * getTimelineInterval(3.5) // 3 (3.5 minutes before start → 3m bucket)
 * getTimelineInterval(-0.3) // -0.5 (18 seconds after start → -30s bucket)
 * getTimelineInterval(-7) // -7 (7 minutes after start → -7m bucket)
 * ```
 */
export function getTimelineInterval(timeToStartMinutes: number): number {
  // Pre-start intervals
  if (timeToStartMinutes >= 60) return 60
  if (timeToStartMinutes >= 55) return 55
  if (timeToStartMinutes >= 50) return 50
  if (timeToStartMinutes >= 45) return 45
  if (timeToStartMinutes >= 40) return 40
  if (timeToStartMinutes >= 35) return 35
  if (timeToStartMinutes >= 30) return 30
  if (timeToStartMinutes >= 25) return 25
  if (timeToStartMinutes >= 20) return 20
  if (timeToStartMinutes >= 15) return 15
  if (timeToStartMinutes >= 10) return 10
  if (timeToStartMinutes >= 5) return 5
  if (timeToStartMinutes >= 4) return 4
  if (timeToStartMinutes >= 3) return 3
  if (timeToStartMinutes >= 2) return 2
  if (timeToStartMinutes >= 1) return 1
  if (timeToStartMinutes >= 0) return 0 // Race scheduled start

  // Post-start intervals with enhanced precision
  if (timeToStartMinutes >= -0.5) return -0.5 // -30s
  if (timeToStartMinutes >= -1) return -1 // -1m
  if (timeToStartMinutes >= -1.5) return -1.5 // -1:30s
  if (timeToStartMinutes >= -2) return -2 // -2m
  if (timeToStartMinutes >= -2.5) return -2.5 // -2:30s
  if (timeToStartMinutes >= -3) return -3 // -3m
  if (timeToStartMinutes >= -3.5) return -3.5 // -3:30s
  if (timeToStartMinutes >= -4) return -4 // -4m
  if (timeToStartMinutes >= -4.5) return -4.5 // -4:30s
  if (timeToStartMinutes >= -5) return -5 // -5m

  // For longer delays, continue at 1-minute intervals
  return Math.ceil(timeToStartMinutes) // -6, -7, -8, etc.
}

/**
 * Calculate time metadata for interval-based analytics (AC5)
 *
 * Determines interval type based on time to start:
 * - >30 min: '5m' interval (5-minute bucket strategy)
 * - 5-30 min: '2m' interval (2-minute bucket strategy)
 * - 0-5 min: '30s' interval (30-second high-frequency polling)
 * - <0 min: 'live' interval (race in progress)
 *
 * @param raceStartTime - Race start time (ISO datetime or Date object)
 * @param currentTime - Current time (ISO datetime or Date object)
 * @returns Time metadata with bucketing information
 *
 * @example
 * ```typescript
 * const raceStart = new Date('2025-10-11T15:00:00Z')
 * const current = new Date('2025-10-11T14:45:00Z')
 * const metadata = calculateTimeMetadata(raceStart, current)
 * // metadata = { time_to_start: 15, time_interval: 15, interval_type: '2m' }
 * ```
 */
export function calculateTimeMetadata(
  raceStartTime: string | Date,
  currentTime: string | Date
): TimeMetadata {
  const raceStart =
    typeof raceStartTime === 'string'
      ? new Date(raceStartTime)
      : raceStartTime
  const current =
    typeof currentTime === 'string' ? new Date(currentTime) : currentTime

  const time_to_start = Math.round(
    (raceStart.getTime() - current.getTime()) / (1000 * 60)
  )
  const time_interval = getTimelineInterval(time_to_start)

  let interval_type: '5m' | '2m' | '30s' | 'live' | 'unknown' = 'unknown'

  if (time_to_start > 30) {
    interval_type = '5m'
  } else if (time_to_start > 5) {
    interval_type = '2m'
  } else if (time_to_start > 0) {
    interval_type = '30s'
  } else {
    interval_type = 'live'
  }

  return {
    time_to_start,
    time_interval,
    interval_type,
  }
}
