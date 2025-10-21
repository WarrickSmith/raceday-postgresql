/**
 * Alert Calculation Service Tests
 * Story 5.2: Implement Visual Alert Calculation Engine
 *
 * Tests for the alert calculation service covering money flow scenarios,
 * odds calculations, threshold mapping, and integration with user preferences
 */

import {
  calculateMoneyChangePercentage,
  calculateOddsChangePercentage,
  mapPercentageToIndicator,
  createCalculationContext,
  calculateBatchIndicators,
  validateMoneyCalculationInput,
  validateOddsCalculationInput,
} from '../alertCalculationService'
import * as alertConfigService from '../alertConfigService'
import { DEFAULT_INDICATORS } from '@/types/alerts'
import type { MoneyFlowDataPoint } from '@/types/moneyFlow'
import type { IndicatorConfig } from '@/types/alerts'

// Mock the alert config service
jest.mock('../alertConfigService')
const mockAlertConfigService = alertConfigService as jest.Mocked<typeof alertConfigService>

describe('AlertCalculationService', () => {
  const mockUserIndicators: IndicatorConfig[] = DEFAULT_INDICATORS.map((ind, index) => ({
    ...ind,
    $id: `indicator-${index}`,
    userId: 'test-user',
    last_updated: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }))

  beforeEach(() => {
    jest.clearAllMocks()
    mockAlertConfigService.loadUserAlertConfig.mockResolvedValue({
      userId: 'test-user',
      indicators: mockUserIndicators,
      toggleAll: true,
      audibleAlertsEnabled: true,
    })
  })

  describe('calculateMoneyChangePercentage', () => {
    it('calculates percentage change correctly - indicator-logic.txt T2 example', () => {
      // Example from indicator-logic.txt: Entrant 4 in T2 should show Blue (15%)
      const previousTimeframe: MoneyFlowDataPoint[] = [
        { entrant: '1', incremental_amount: 100 } as MoneyFlowDataPoint,
        { entrant: '2', incremental_amount: 80 } as MoneyFlowDataPoint,
        { entrant: '3', incremental_amount: 60 } as MoneyFlowDataPoint,
        { entrant: '4', incremental_amount: 40 } as MoneyFlowDataPoint, // 40/280 = 14%
      ]

      const currentTimeframe: MoneyFlowDataPoint[] = [
        { entrant: '1', incremental_amount: 100 } as MoneyFlowDataPoint,
        { entrant: '2', incremental_amount: 80 } as MoneyFlowDataPoint,
        { entrant: '3', incremental_amount: 60 } as MoneyFlowDataPoint,
        { entrant: '4', incremental_amount: 100 } as MoneyFlowDataPoint, // 100/340 = 29%
      ]

      const result = calculateMoneyChangePercentage({
        currentTimeframe,
        previousTimeframe,
        entrant_id: '4',
      })

      // Expected: 29% - 14% = 15% change
      expect(result.percentage_change).toBeCloseTo(15, 0)
      expect(result.change_type).toBe('money_increase')
      expect(result.has_change).toBe(true)
      expect(result.entrant_id).toBe('4')
    })

    it('only returns positive changes (increases)', () => {
      const previousTimeframe: MoneyFlowDataPoint[] = [
        { entrant: '1', incremental_amount: 100 } as MoneyFlowDataPoint,
        { entrant: '2', incremental_amount: 50 } as MoneyFlowDataPoint, // 50/150 = 33%
      ]

      const currentTimeframe: MoneyFlowDataPoint[] = [
        { entrant: '1', incremental_amount: 100 } as MoneyFlowDataPoint,
        { entrant: '2', incremental_amount: 20 } as MoneyFlowDataPoint, // 20/120 = 17% (decrease)
      ]

      const result = calculateMoneyChangePercentage({
        currentTimeframe,
        previousTimeframe,
        entrant_id: '2',
      })

      // Should return 0 for decreases
      expect(result.percentage_change).toBe(0)
      expect(result.has_change).toBe(false)
    })

    it('handles missing entrant data', () => {
      const timeframe: MoneyFlowDataPoint[] = [
        { entrant: '1', incremental_amount: 100 } as MoneyFlowDataPoint,
      ]

      const result = calculateMoneyChangePercentage({
        currentTimeframe: timeframe,
        previousTimeframe: timeframe,
        entrant_id: 'missing',
      })

      expect(result.percentage_change).toBe(0)
      expect(result.has_change).toBe(false)
    })

    it('handles zero total amounts', () => {
      const zeroTimeframe: MoneyFlowDataPoint[] = [
        { entrant: '1', incremental_amount: 0 } as MoneyFlowDataPoint,
      ]

      const normalTimeframe: MoneyFlowDataPoint[] = [
        { entrant: '1', incremental_amount: 100 } as MoneyFlowDataPoint,
      ]

      const result = calculateMoneyChangePercentage({
        currentTimeframe: zeroTimeframe,
        previousTimeframe: normalTimeframe,
        entrant_id: '1',
      })

      expect(result.percentage_change).toBe(0)
      expect(result.has_change).toBe(false)
    })

    it('applies minimum 5% threshold for hasChange', () => {
      const previousTimeframe: MoneyFlowDataPoint[] = [
        { entrant: '1', incremental_amount: 50 } as MoneyFlowDataPoint, // 50%
        { entrant: '2', incremental_amount: 50 } as MoneyFlowDataPoint, // 50%
      ]

      const currentTimeframe: MoneyFlowDataPoint[] = [
        { entrant: '1', incremental_amount: 52 } as MoneyFlowDataPoint, // 52% (2% increase)
        { entrant: '2', incremental_amount: 48 } as MoneyFlowDataPoint, // 48%
      ]

      const result = calculateMoneyChangePercentage({
        currentTimeframe,
        previousTimeframe,
        entrant_id: '1',
      })

      expect(result.percentage_change).toBeCloseTo(2, 1)
      expect(result.has_change).toBe(false) // Below 5% threshold
    })
  })

  describe('calculateOddsChangePercentage', () => {
    it('calculates odds shortening correctly - indicator-logic.txt example', () => {
      // Example from indicator-logic.txt: Entrant 3 odds 12.00 to 7.00 = 42% decrease
      const result = calculateOddsChangePercentage({
        currentOdds: 7.00,
        previousOdds: 12.00,
        entrant_id: '3',
      })

      // Expected: (12-7)/12 = 42% shortening
      expect(result.percentage_change).toBeCloseTo(41.67, 1)
      expect(result.change_type).toBe('odds_shortening')
      expect(result.has_change).toBe(true)
      expect(result.entrant_id).toBe('3')
    })

    it('only returns positive changes (shortening)', () => {
      // Odds lengthening (increase) should return 0
      const result = calculateOddsChangePercentage({
        currentOdds: 15.00, // Odds increased (lengthened)
        previousOdds: 10.00,
        entrant_id: '1',
      })

      expect(result.percentage_change).toBe(0)
      expect(result.has_change).toBe(false)
    })

    it('handles invalid odds values', () => {
      const result = calculateOddsChangePercentage({
        currentOdds: 0,
        previousOdds: 10.00,
        entrant_id: '1',
      })

      expect(result.percentage_change).toBe(0)
      expect(result.has_change).toBe(false)
    })

    it('applies minimum 5% threshold for hasChange', () => {
      // Small odds change below threshold
      const result = calculateOddsChangePercentage({
        currentOdds: 9.50,
        previousOdds: 10.00, // 5% shortening
        entrant_id: '1',
      })

      expect(result.percentage_change).toBe(5)
      expect(result.has_change).toBe(true) // Exactly at 5% threshold
    })
  })

  describe('mapPercentageToIndicator', () => {
    it('maps percentages to correct threshold ranges', () => {
      // Test 15% -> Yellow (15-20% range)
      const result = mapPercentageToIndicator(15, mockUserIndicators, 'money_increase')

      expect(result).toBeDefined()
      expect(result!.indicatorType).toBe('15-20%')
      expect(result!.color).toBe('#FEF3C7') // Pale Amber
      expect(result!.change_type).toBe('money_increase')
    })

    it('maps 50%+ range correctly', () => {
      const result = mapPercentageToIndicator(75, mockUserIndicators, 'odds_shortening')

      expect(result).toBeDefined()
      expect(result!.indicatorType).toBe('50%+')
      expect(result!.color).toBe('#F3E8FF') // Lavender
      expect(result!.change_type).toBe('odds_shortening')
    })

    it('returns null for percentages below minimum threshold', () => {
      const result = mapPercentageToIndicator(3, mockUserIndicators, 'money_increase')
      expect(result).toBeNull()
    })

    it('handles boundary conditions correctly', () => {
      // Test exact boundary at 10%
      const result10 = mapPercentageToIndicator(10, mockUserIndicators, 'money_increase')
      expect(result10!.indicatorType).toBe('10-15%')

      // Test just below boundary
      const result9_99 = mapPercentageToIndicator(9.99, mockUserIndicators, 'money_increase')
      expect(result9_99!.indicatorType).toBe('5-10%')
    })

    it('respects enabled/disabled indicators', () => {
      const disabledIndicators = mockUserIndicators.map(ind => ({
        ...ind,
        enabled: ind.displayOrder !== 3, // Disable 15-20% range
      }))

      const result = mapPercentageToIndicator(17, disabledIndicators, 'money_increase')

      expect(result).toBeDefined()
      expect(result!.enabled).toBe(false)
    })
  })

  describe('createCalculationContext', () => {
    it('loads user configuration successfully', async () => {
      const context = await createCalculationContext('test-user')

      expect(mockAlertConfigService.loadUserAlertConfig).toHaveBeenCalledWith('test-user')
      expect(context.userIndicators).toEqual(mockUserIndicators)
      expect(context.enabledOnly).toBe(true)
    })

    it('uses default enabledOnly setting', async () => {
      const context = await createCalculationContext('test-user', false)
      expect(context.enabledOnly).toBe(false)
    })
  })

  describe('calculateBatchIndicators', () => {
    it('processes multiple entrants with money and odds data', async () => {
      const moneyFlowData = {
        currentTimeframe: [
          { entrant: '1', incremental_amount: 100 } as MoneyFlowDataPoint,
          { entrant: '2', incremental_amount: 100 } as MoneyFlowDataPoint, // Will show increase
        ],
        previousTimeframe: [
          { entrant: '1', incremental_amount: 100 } as MoneyFlowDataPoint,
          { entrant: '2', incremental_amount: 50 } as MoneyFlowDataPoint, // 25% -> 50% = 25% increase
        ],
      }

      const oddsData = [
        { entrant_id: '1', currentOdds: 5.0, previousOdds: 10.0 }, // 50% shortening
        { entrant_id: '2', currentOdds: 8.0, previousOdds: 8.0 }, // No change
      ]

      const context = {
        userIndicators: mockUserIndicators,
        enabledOnly: true,
      }

      const result = await calculateBatchIndicators({
        moneyFlowData,
        oddsData,
        context,
      })

      expect(result.moneyIndicators).toHaveLength(1) // Only entrant 2 has money increase
      expect(result.oddsIndicators).toHaveLength(1) // Only entrant 1 has odds shortening
      expect(result.totalEntrants).toBe(2)
      expect(result.calculationTimestamp).toBeDefined()
    })

    it('filters out disabled indicators when enabledOnly is true', async () => {
      const disabledIndicators = mockUserIndicators.map(ind => ({
        ...ind,
        enabled: false, // All disabled
      }))

      const context = {
        userIndicators: disabledIndicators,
        enabledOnly: true,
      }

      const result = await calculateBatchIndicators({
        moneyFlowData: {
          currentTimeframe: [{ entrant: '1', incremental_amount: 100 } as MoneyFlowDataPoint],
          previousTimeframe: [{ entrant: '1', incremental_amount: 50 } as MoneyFlowDataPoint],
        },
        oddsData: [{ entrant_id: '1', currentOdds: 5.0, previousOdds: 10.0 }],
        context,
      })

      expect(result.moneyIndicators).toHaveLength(0)
      expect(result.oddsIndicators).toHaveLength(0)
    })
  })

  describe('validateMoneyCalculationInput', () => {
    it('validates correct input', () => {
      const validInput = {
        entrant_id: '1',
        currentTimeframe: [{ entrant: '1', incremental_amount: 100 } as MoneyFlowDataPoint],
        previousTimeframe: [{ entrant: '1', incremental_amount: 50 } as MoneyFlowDataPoint],
      }

      const result = validateMoneyCalculationInput(validInput)
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('validates missing entrant ID', () => {
      const invalidInput = {
        entrant_id: '',
        currentTimeframe: [{ entrant: '1', incremental_amount: 100 } as MoneyFlowDataPoint],
        previousTimeframe: [{ entrant: '1', incremental_amount: 50 } as MoneyFlowDataPoint],
      }

      const result = validateMoneyCalculationInput(invalidInput)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Entrant ID is required')
    })

    it('validates missing timeframe data', () => {
      const invalidInput = {
        entrant_id: '1',
        currentTimeframe: [],
        previousTimeframe: [],
      }

      const result = validateMoneyCalculationInput(invalidInput)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Current timeframe data is required')
      expect(result.errors).toContain('Previous timeframe data is required')
    })

    it('validates data point structure', () => {
      const invalidInput = {
        entrant_id: '1',
        currentTimeframe: [{ entrant: '', incremental_amount: 'invalid' as unknown as number } as MoneyFlowDataPoint],
        previousTimeframe: [{ entrant: '1', incremental_amount: 50 } as MoneyFlowDataPoint],
      }

      const result = validateMoneyCalculationInput(invalidInput)
      expect(result.isValid).toBe(false)
      expect(result.errors.some(err => err.includes('missing incremental_amount'))).toBe(true)
      expect(result.errors.some(err => err.includes('missing entrant ID'))).toBe(true)
    })
  })

  describe('validateOddsCalculationInput', () => {
    it('validates correct input', () => {
      const validInput = {
        entrant_id: '1',
        currentOdds: 5.0,
        previousOdds: 10.0,
      }

      const result = validateOddsCalculationInput(validInput)
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('validates missing entrant ID', () => {
      const invalidInput = {
        entrant_id: '',
        currentOdds: 5.0,
        previousOdds: 10.0,
      }

      const result = validateOddsCalculationInput(invalidInput)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Entrant ID is required')
    })

    it('validates invalid odds values', () => {
      const invalidInput = {
        entrant_id: '1',
        currentOdds: 0,
        previousOdds: -5,
      }

      const result = validateOddsCalculationInput(invalidInput)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Valid current odds value is required')
      expect(result.errors).toContain('Valid previous odds value is required')
    })
  })

  describe('Integration with indicator-logic.txt scenarios', () => {
    it('processes complete 3-timeframe money scenario', () => {
      // T1 data: 280 total
      const t1Data: MoneyFlowDataPoint[] = [
        { entrant: '1', incremental_amount: 100 } as MoneyFlowDataPoint,
        { entrant: '2', incremental_amount: 80 } as MoneyFlowDataPoint,
        { entrant: '3', incremental_amount: 60 } as MoneyFlowDataPoint,
        { entrant: '4', incremental_amount: 40 } as MoneyFlowDataPoint,
      ]

      // T2 data: 340 total
      const t2Data: MoneyFlowDataPoint[] = [
        { entrant: '1', incremental_amount: 100 } as MoneyFlowDataPoint,
        { entrant: '2', incremental_amount: 80 } as MoneyFlowDataPoint,
        { entrant: '3', incremental_amount: 60 } as MoneyFlowDataPoint,
        { entrant: '4', incremental_amount: 100 } as MoneyFlowDataPoint, // 100/340 = 29%
      ]

      // T3 data: 280 total (back to T1 pattern)
      const t3Data: MoneyFlowDataPoint[] = [
        { entrant: '1', incremental_amount: 100 } as MoneyFlowDataPoint,
        { entrant: '2', incremental_amount: 80 } as MoneyFlowDataPoint,
        { entrant: '3', incremental_amount: 60 } as MoneyFlowDataPoint,
        { entrant: '4', incremental_amount: 40 } as MoneyFlowDataPoint, // 40/280 = 14% (decrease, ignored)
      ]

      // T1->T2: Should show Blue for Entrant 4 (15% increase)
      const t1ToT2 = calculateMoneyChangePercentage({
        currentTimeframe: t2Data,
        previousTimeframe: t1Data,
        entrant_id: '4',
      })
      expect(t1ToT2.percentage_change).toBeCloseTo(15, 0)

      // T2->T3: Should show no change for Entrant 4 (decrease ignored)
      const t2ToT3 = calculateMoneyChangePercentage({
        currentTimeframe: t3Data,
        previousTimeframe: t2Data,
        entrant_id: '4',
      })
      expect(t2ToT3.percentage_change).toBe(0)
      expect(t2ToT3.has_change).toBe(false)
    })

    it('processes complete 3-timeframe odds scenario', () => {
      // T1->T2: Entrant 3 odds shorten from 12.00 to 7.00
      const t1ToT2 = calculateOddsChangePercentage({
        currentOdds: 7.00,
        previousOdds: 12.00,
        entrant_id: '3',
      })
      expect(t1ToT2.percentage_change).toBeCloseTo(41.67, 1)
      expect(t1ToT2.has_change).toBe(true)

      // Map to indicator - should be Red (25-50% range)
      const indicator = mapPercentageToIndicator(
        t1ToT2.percentage_change,
        mockUserIndicators,
        'odds_shortening'
      )
      expect(indicator!.indicatorType).toBe('25-50%')
      expect(indicator!.color).toBe('#FECACA') // Blush

      // T2->T3: Odds back to 12.00 (lengthening, ignored)
      const t2ToT3 = calculateOddsChangePercentage({
        currentOdds: 12.00,
        previousOdds: 7.00,
        entrant_id: '3',
      })
      expect(t2ToT3.percentage_change).toBe(0)
      expect(t2ToT3.has_change).toBe(false)
    })
  })
})
