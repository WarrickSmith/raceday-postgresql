/**
 * Race Pools Processing Utilities
 * Extracts and processes tote_pools data from NZTAB API
 * Based on enhanced-race-poller/src/database-utils.js implementation
 */

import { logger } from '../shared/logger.js'

/**
 * Race pool totals extracted from NZTAB API tote_pools data
 */
export interface RacePoolData {
  raceId: string
  winPoolTotal: number // in cents
  placePoolTotal: number // in cents
  quinellaPoolTotal: number // in cents
  trifectaPoolTotal: number // in cents
  exactaPoolTotal: number // in cents
  first4PoolTotal: number // in cents
  totalRacePool: number // in cents
  currency: string
  dataQualityScore: number
  extractedPools: number
}

/**
 * NZTAB API pool type interface
 */
interface NzTabPool {
  product_type: string
  total?: number
  amount?: number
}

/**
 * Extract pool totals from NZTAB API tote_pools data (Task 3.2)
 * Implements pool extraction with validation based on enhanced implementation
 *
 * @param apiData - Raw API response data containing tote_pools array
 * @param raceId - Race ID for logging and association
 * @returns RacePoolData or null if no pools found
 */
export function extractPoolTotals(apiData: any, raceId: string): RacePoolData | null {
  if (!apiData || !apiData.tote_pools || !Array.isArray(apiData.tote_pools)) {
    logger.debug('No tote_pools array found in API data', { raceId })
    return null
  }

  const pools: RacePoolData = {
    raceId,
    winPoolTotal: 0,
    placePoolTotal: 0,
    quinellaPoolTotal: 0,
    trifectaPoolTotal: 0,
    exactaPoolTotal: 0,
    first4PoolTotal: 0,
    totalRacePool: 0,
    currency: '$',
    dataQualityScore: 100,
    extractedPools: 0
  }

  const totePools: NzTabPool[] = apiData.tote_pools

  logger.debug('Processing tote_pools data', {
    raceId,
    poolCount: totePools.length,
    productTypes: totePools.map(p => p.product_type)
  })

  totePools.forEach((pool) => {
    const total = pool.total || pool.amount || 0
    pools.totalRacePool += total
    pools.extractedPools++

    const productType = pool.product_type?.toLowerCase()

    switch (productType) {
      case 'win':
        pools.winPoolTotal = total
        break
      case 'place':
        pools.placePoolTotal = total
        break
      case 'quinella':
        pools.quinellaPoolTotal = total
        break
      case 'trifecta':
        pools.trifectaPoolTotal = total
        break
      case 'exacta':
        pools.exactaPoolTotal = total
        break
      case 'first 4':
      case 'first four':
      case 'first4':
      case 'firstfour':
        pools.first4PoolTotal = total
        break
      default:
        logger.debug('Unknown pool product_type', {
          raceId,
          productType: pool.product_type,
          total
        })
        pools.dataQualityScore -= 5 // Reduce score for unknown types
    }
  })

  // Validate minimum expected pools (Win and Place)
  if (pools.winPoolTotal === 0 || pools.placePoolTotal === 0) {
    pools.dataQualityScore -= 30
    logger.debug('Missing expected pools (Win/Place)', {
      raceId,
      winPoolTotal: pools.winPoolTotal,
      placePoolTotal: pools.placePoolTotal
    })
  }

  // Convert dollar amounts to cents for database storage
  pools.winPoolTotal = Math.round(pools.winPoolTotal * 100)
  pools.placePoolTotal = Math.round(pools.placePoolTotal * 100)
  pools.quinellaPoolTotal = Math.round(pools.quinellaPoolTotal * 100)
  pools.trifectaPoolTotal = Math.round(pools.trifectaPoolTotal * 100)
  pools.exactaPoolTotal = Math.round(pools.exactaPoolTotal * 100)
  pools.first4PoolTotal = Math.round(pools.first4PoolTotal * 100)
  pools.totalRacePool = Math.round(pools.totalRacePool * 100)

  logger.info('Extracted race pool totals', {
    raceId,
    totalRacePool: pools.totalRacePool,
    winPoolTotal: pools.winPoolTotal,
    placePoolTotal: pools.placePoolTotal,
    quinellaPoolTotal: pools.quinellaPoolTotal,
    trifectaPoolTotal: pools.trifectaPoolTotal,
    exactaPoolTotal: pools.exactaPoolTotal,
    first4PoolTotal: pools.first4PoolTotal,
    validationScore: pools.dataQualityScore,
    extractedPools: pools.extractedPools,
    currency: pools.currency
  })

  return pools
}

/**
 * Validate race pool data for consistency and completeness
 * Based on enhanced implementation validation logic
 */
export function validateRacePoolData(poolData: RacePoolData): {
  isValid: boolean
  warnings: string[]
  errors: string[]
  consistencyScore: number
} {
  const result = {
    isValid: true,
    warnings: [] as string[],
    errors: [] as string[],
    consistencyScore: poolData.dataQualityScore
  }

  // Check if we have any pool data
  if (poolData.totalRacePool === 0) {
    result.warnings.push('No pool data available - race may be too early or abandoned')
    result.consistencyScore = 50
  }

  // Validate Win and Place pools are present
  if (poolData.winPoolTotal === 0 && poolData.placePoolTotal === 0) {
    result.errors.push('Both Win and Place pools are empty')
    result.isValid = false
    result.consistencyScore = 0
  }

  // Check for reasonable pool amounts
  if (poolData.winPoolTotal > 0 && poolData.placePoolTotal > 0) {
    // Win pool should generally be larger than place pool
    if (poolData.placePoolTotal > poolData.winPoolTotal * 2) {
      result.warnings.push('Place pool unusually large compared to Win pool')
      result.consistencyScore -= 10
    }
  }

  // Validate data quality score
  if (poolData.dataQualityScore < 70) {
    result.warnings.push('Low data quality score detected')
  }

  logger.debug('Race pool validation completed', {
    raceId: poolData.raceId,
    isValid: result.isValid,
    consistencyScore: result.consistencyScore,
    errorsCount: result.errors.length,
    warningsCount: result.warnings.length
  })

  return result
}