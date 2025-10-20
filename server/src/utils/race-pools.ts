/**
 * Race Pools Processing Utilities
 * Extracts and processes tote_pools data from NZTAB API
 * Based on enhanced-race-poller/src/database-utils.js implementation
 */

import { logger } from '../shared/logger.js'

/**
 * Race pool totals extracted from NZTAB API tote_pools data
 * Uses PostgreSQL snake_case naming convention for direct DB compatibility
 */
/* eslint-disable @typescript-eslint/naming-convention */
export interface RacePoolData {
  race_id: string
  win_pool_total: number // in cents
  place_pool_total: number // in cents
  quinella_pool_total: number // in cents
  trifecta_pool_total: number // in cents
  exacta_pool_total: number // in cents
  first4_pool_total: number // in cents
  total_race_pool: number // in cents
  currency: string
  data_quality_score: number
  extracted_pools: number
}
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * NZTAB API pool type interface
 */
/* eslint-disable @typescript-eslint/naming-convention */
interface NzTabPool {
  product_type: string
  total?: number
  amount?: number
}

/**
 * Extract pool totals from NZTAB API tote_pools data (Task 3.2)
 * Implements pool extraction with validation based on enhanced implementation
 *
 * @param apiData - Raw API response data containing tote_pools or dividends array
 * @param raceId - Race ID for logging and association
 * @returns RacePoolData or null if no pools found
 */
interface ApiDataWithPools {
  tote_pools?: unknown
  dividends?: unknown
}
/* eslint-enable @typescript-eslint/naming-convention */

/* eslint-disable @typescript-eslint/naming-convention */
export function extractPoolTotals(apiData: ApiDataWithPools, raceId: string): RacePoolData | null {
  // Try tote_pools first (available for Open/Interim races)
  if (
    apiData.tote_pools !== undefined &&
    apiData.tote_pools !== null &&
    Array.isArray(apiData.tote_pools)
  ) {
    return extractFromTotePools(apiData.tote_pools as NzTabPool[], raceId)
  }

  // Fallback to dividends (available for Final races)
  if (
    apiData.dividends !== undefined &&
    apiData.dividends !== null &&
    Array.isArray(apiData.dividends) &&
    apiData.dividends.length > 0
  ) {
    logger.debug({ raceId }, 'No tote_pools found, extracting from dividends (Final race)')
    return extractFromDividends(apiData.dividends as unknown[], raceId)
  }

  logger.debug({ raceId }, 'No tote_pools or dividends array found in API data')
  return null
}

/**
 * Extract pool totals from tote_pools array (Open/Interim races)
 */
function extractFromTotePools(totePools: NzTabPool[], raceId: string): RacePoolData {
  const pools: RacePoolData = {
    race_id: raceId,
    win_pool_total: 0,
    place_pool_total: 0,
    quinella_pool_total: 0,
    trifecta_pool_total: 0,
    exacta_pool_total: 0,
    first4_pool_total: 0,
    total_race_pool: 0,
    currency: '$',
    data_quality_score: 100,
    extracted_pools: 0
  }

  logger.debug({
    raceId,
    poolCount: totePools.length,
    productTypes: totePools.map(p => p.product_type)
  }, 'Processing tote_pools data')

  totePools.forEach((pool) => {
    const total = pool.total ?? pool.amount ?? 0
    pools.total_race_pool += total
    pools.extracted_pools++

    const productType = pool.product_type.toLowerCase()

    switch (productType) {
      case 'win':
        pools.win_pool_total = total
        break
      case 'place':
        pools.place_pool_total = total
        break
      case 'quinella':
        pools.quinella_pool_total = total
        break
      case 'trifecta':
        pools.trifecta_pool_total = total
        break
      case 'exacta':
        pools.exacta_pool_total = total
        break
      case 'first 4':
      case 'first four':
      case 'first4':
      case 'firstfour':
        pools.first4_pool_total = total
        break
      default:
        logger.debug({
          raceId,
          productType: pool.product_type,
          total
        }, 'Unknown pool product_type')
        pools.data_quality_score -= 5 // Reduce score for unknown types
    }
  })

  // Validate minimum expected pools (Win and Place)
  if (pools.win_pool_total === 0 || pools.place_pool_total === 0) {
    pools.data_quality_score -= 30
    logger.debug({
      raceId,
      win_pool_total: pools.win_pool_total,
      place_pool_total: pools.place_pool_total
    }, 'Missing expected pools (Win/Place)')
  }

  // Convert dollar amounts to cents for database storage
  pools.win_pool_total = Math.round(pools.win_pool_total * 100)
  pools.place_pool_total = Math.round(pools.place_pool_total * 100)
  pools.quinella_pool_total = Math.round(pools.quinella_pool_total * 100)
  pools.trifecta_pool_total = Math.round(pools.trifecta_pool_total * 100)
  pools.exacta_pool_total = Math.round(pools.exacta_pool_total * 100)
  pools.first4_pool_total = Math.round(pools.first4_pool_total * 100)
  pools.total_race_pool = Math.round(pools.total_race_pool * 100)

  logger.info({
    raceId,
    source: 'tote_pools',
    total_race_pool: pools.total_race_pool,
    win_pool_total: pools.win_pool_total,
    place_pool_total: pools.place_pool_total,
    quinella_pool_total: pools.quinella_pool_total,
    trifecta_pool_total: pools.trifecta_pool_total,
    exacta_pool_total: pools.exacta_pool_total,
    first4_pool_total: pools.first4_pool_total,
    data_quality_score: pools.data_quality_score,
    extracted_pools: pools.extracted_pools,
    currency: pools.currency
  }, 'Extracted race pool totals')

  return pools
}

/**
 * Extract pool totals from dividends array (Final races)
 * Dividends contain pool_size which represents final pool totals
 */
interface Dividend {
  product_name?: string
  pool_size?: number
}

function extractFromDividends(dividends: unknown[], raceId: string): RacePoolData {
  const pools: RacePoolData = {
    race_id: raceId,
    win_pool_total: 0,
    place_pool_total: 0,
    quinella_pool_total: 0,
    trifecta_pool_total: 0,
    exacta_pool_total: 0,
    first4_pool_total: 0,
    total_race_pool: 0,
    currency: '$',
    data_quality_score: 90, // Slightly lower for fallback source
    extracted_pools: 0
  }

  const poolMap = new Map<string, number>()

  // Aggregate pool sizes by product type (dividends can have multiple entries per product)
  dividends.forEach((div) => {
    const dividend = div as Dividend
    const productName = dividend.product_name?.toLowerCase() ?? ''
    const poolSize = dividend.pool_size ?? 0

    if (poolSize > 0 && productName !== '') {
      // Use the max pool size if there are multiple entries (Final vs Interim)
      const currentMax = poolMap.get(productName) ?? 0
      poolMap.set(productName, Math.max(currentMax, poolSize))
    }
  })

  logger.debug({
    raceId,
    productTypes: Array.from(poolMap.keys()),
    dividendCount: dividends.length
  }, 'Processing dividends data')

  // Extract pools from aggregated map
  poolMap.forEach((poolSize, productName) => {
    pools.total_race_pool += poolSize
    pools.extracted_pools++

    if (productName.includes('win')) {
      pools.win_pool_total = Math.max(pools.win_pool_total, poolSize)
    } else if (productName.includes('place')) {
      pools.place_pool_total = Math.max(pools.place_pool_total, poolSize)
    } else if (productName.includes('quinella')) {
      pools.quinella_pool_total = Math.max(pools.quinella_pool_total, poolSize)
    } else if (productName.includes('trifecta')) {
      pools.trifecta_pool_total = Math.max(pools.trifecta_pool_total, poolSize)
    } else if (productName.includes('exacta')) {
      pools.exacta_pool_total = Math.max(pools.exacta_pool_total, poolSize)
    } else if (productName.includes('first') || productName.includes('first4')) {
      pools.first4_pool_total = Math.max(pools.first4_pool_total, poolSize)
    }
  })

  // Convert dollar amounts to cents for database storage
  pools.win_pool_total = Math.round(pools.win_pool_total * 100)
  pools.place_pool_total = Math.round(pools.place_pool_total * 100)
  pools.quinella_pool_total = Math.round(pools.quinella_pool_total * 100)
  pools.trifecta_pool_total = Math.round(pools.trifecta_pool_total * 100)
  pools.exacta_pool_total = Math.round(pools.exacta_pool_total * 100)
  pools.first4_pool_total = Math.round(pools.first4_pool_total * 100)
  pools.total_race_pool = Math.round(pools.total_race_pool * 100)

  // Validate minimum expected pools
  if (pools.win_pool_total === 0 || pools.place_pool_total === 0) {
    pools.data_quality_score -= 30
    logger.debug({
      raceId,
      win_pool_total: pools.win_pool_total,
      place_pool_total: pools.place_pool_total
    }, 'Missing expected pools (Win/Place) in dividends')
  }

  logger.info({
    raceId,
    source: 'dividends',
    total_race_pool: pools.total_race_pool,
    win_pool_total: pools.win_pool_total,
    place_pool_total: pools.place_pool_total,
    quinella_pool_total: pools.quinella_pool_total,
    trifecta_pool_total: pools.trifecta_pool_total,
    exacta_pool_total: pools.exacta_pool_total,
    first4_pool_total: pools.first4_pool_total,
    data_quality_score: pools.data_quality_score,
    extracted_pools: pools.extracted_pools,
    currency: pools.currency
  }, 'Extracted race pool totals from dividends')

  return pools
}
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Validate race pool data for consistency and completeness
 * Based on enhanced implementation validation logic
 */
/* eslint-disable @typescript-eslint/naming-convention */
export function validateRacePoolData(poolData: RacePoolData): {
  is_valid: boolean
  warnings: string[]
  errors: string[]
  consistency_score: number
} {
  const result = {
    is_valid: true,
    warnings: [] as string[],
    errors: [] as string[],
    consistency_score: poolData.data_quality_score
  }

  // Check if we have any pool data
  if (poolData.total_race_pool === 0) {
    result.warnings.push('No pool data available - race may be too early or abandoned')
    result.consistency_score = 50
  }

  // Validate Win and Place pools are present
  if (poolData.win_pool_total === 0 && poolData.place_pool_total === 0) {
    result.errors.push('Both Win and Place pools are empty')
    result.is_valid = false
    result.consistency_score = 0
  }

  // Check for reasonable pool amounts
  if (poolData.win_pool_total > 0 && poolData.place_pool_total > 0) {
    // Win pool should generally be larger than place pool
    if (poolData.place_pool_total > poolData.win_pool_total * 2) {
      result.warnings.push('Place pool unusually large compared to Win pool')
      result.consistency_score -= 10
    }
  }

  // Validate data quality score
  if (poolData.data_quality_score < 70) {
    result.warnings.push('Low data quality score detected')
  }

  logger.debug({
    race_id: poolData.race_id,
    is_valid: result.is_valid,
    consistency_score: result.consistency_score,
    errors_count: result.errors.length,
    warnings_count: result.warnings.length
  }, 'Race pool validation completed')

  return result
}
/* eslint-enable @typescript-eslint/naming-convention */