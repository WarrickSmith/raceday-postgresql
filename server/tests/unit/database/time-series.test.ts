/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PoolClient } from 'pg'
import {
  insertMoneyFlowHistory,
  insertOddsHistory,
  getPartitionTableName,
  verifyPartitionExists,
  ensurePartition,
  ensureUpcomingPartitions,
  validatePartitionBeforeWrite,
  PartitionNotFoundError,
  type OddsRecord,
} from '../../../src/database/time-series.js'
import type { MoneyFlowRecord } from '../../../src/workers/messages.js'

// Mock the pool module
vi.mock('../../../src/database/pool.js', () => ({
  pool: {
    connect: vi.fn(),
  },
}))

// Mock the logger
vi.mock('../../../src/shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('time-series', () => {
  let mockClient: Partial<PoolClient>
  let mockQuery: ReturnType<typeof vi.fn>
  let mockRelease: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const { pool } = await import('../../../src/database/pool.js')

    mockQuery = vi.fn()
    mockRelease = vi.fn()

    mockClient = {
      query: mockQuery,
      release: mockRelease,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(pool.connect).mockResolvedValue(mockClient as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getPartitionTableName', () => {
    it('should construct correct partition name from timestamp (AC5)', () => {
      const tableName = getPartitionTableName(
        'money_flow_history',
        '2025-10-13T14:30:00Z'
      )
      expect(tableName).toBe('money_flow_history_2025_10_13')
    })

    it('should handle different dates correctly', () => {
      expect(
        getPartitionTableName('odds_history', '2025-01-05T00:00:00Z')
      ).toBe('odds_history_2025_01_05')

      expect(
        getPartitionTableName('odds_history', '2025-12-31T23:59:59Z')
      ).toBe('odds_history_2025_12_31')
    })

    it('should pad month and day with leading zeros', () => {
      const tableName = getPartitionTableName(
        'money_flow_history',
        '2025-01-01T00:00:00Z'
      )
      expect(tableName).toBe('money_flow_history_2025_01_01')
    })
  })

  describe('verifyPartitionExists', () => {
    it('should return true when partition exists (AC5)', async () => {
      mockQuery.mockResolvedValue({ rows: [{ exists: true }] })

      const exists = await verifyPartitionExists(
        mockClient as PoolClient,
        'money_flow_history_2025_10_13'
      )

      expect(exists).toBe(true)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT EXISTS'),
        ['money_flow_history_2025_10_13']
      )
    })

    it('should return false when partition does not exist (AC5)', async () => {
      mockQuery.mockResolvedValue({ rows: [{ exists: false }] })

      const exists = await verifyPartitionExists(
        mockClient as PoolClient,
        'money_flow_history_2025_10_13'
      )

      expect(exists).toBe(false)
    })

    it('should query pg_class and pg_namespace system catalogs', async () => {
      mockQuery.mockResolvedValue({ rows: [{ exists: true }] })

      await verifyPartitionExists(
        mockClient as PoolClient,
        'test_partition'
      )

      const [sql] = mockQuery.mock.calls[0] ?? []
      expect(sql).toContain('pg_class')
      expect(sql).toContain('pg_namespace')
    })
  })

  describe('insertMoneyFlowHistory', () => {
    it('should return zero metrics for empty array', async () => {
      const result = await insertMoneyFlowHistory([])
      expect(result).toEqual({ rowCount: 0, duration: 0 })
    })

    it('should generate correct append-only INSERT SQL (AC3)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // Partition check
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // COMMIT

      const records: MoneyFlowRecord[] = [
        {
          entrant_id: 'E1',
          race_id: 'R1',
          time_to_start: -5,
          time_interval: 5,
          interval_type: '5m',
          polling_timestamp: '2025-10-13T14:30:00Z',
          hold_percentage: 15.5,
          bet_percentage: 12.3,
          win_pool_percentage: 22.1,
          place_pool_percentage: 18.5,
          win_pool_amount: 150000,
          place_pool_amount: 80000,
          total_pool_amount: 230000,
          incremental_win_amount: 5000,
          incremental_place_amount: 3000,
          fixed_win_odds: 3.5,
          fixed_place_odds: 1.8,
          pool_win_odds: 3.45,
          pool_place_odds: 1.75,
        },
      ]

      await insertMoneyFlowHistory(records)

      const insertCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('INSERT INTO money_flow_history_')
      )
      expect(insertCall).toBeDefined()

      const [sql] = insertCall ?? []

      // Verify append-only INSERT (no ON CONFLICT clause) - AC3
      expect(sql).toContain('INSERT INTO money_flow_history_2025_10_13')
      expect(sql).not.toContain('ON CONFLICT')
      expect(sql).not.toContain('DO UPDATE')
    })

    it('should verify partition exists before INSERT (AC5)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // Partition check
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // COMMIT

      const records: MoneyFlowRecord[] = [
        {
          entrant_id: 'E1',
          race_id: 'R1',
          time_to_start: -5,
          time_interval: 5,
          interval_type: '5m',
          polling_timestamp: '2025-10-13T14:30:00Z',
          hold_percentage: 15.5,
          win_pool_amount: 150000,
          place_pool_amount: 80000,
          total_pool_amount: 230000,
          incremental_win_amount: 5000,
          incremental_place_amount: 3000,
        },
      ]

      await insertMoneyFlowHistory(records)

      // Verify partition existence check
      const partitionCheckCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('SELECT EXISTS')
      )
      expect(partitionCheckCall).toBeDefined()
      const [, params] = partitionCheckCall ?? []
      expect(params).toEqual(['money_flow_history_2025_10_13'])
    })

    it('should auto-create partition if missing (Task 1.2)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // Partition check fails
        .mockResolvedValueOnce({ rows: [] }) // Partition creation
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // COMMIT

      const records: MoneyFlowRecord[] = [
        {
          entrant_id: 'E1',
          race_id: 'R1',
          time_to_start: -5,
          time_interval: 5,
          interval_type: '5m',
          polling_timestamp: '2025-10-13T14:30:00Z',
          hold_percentage: 15.5,
          win_pool_amount: 150000,
          place_pool_amount: 80000,
          total_pool_amount: 230000,
          incremental_win_amount: 5000,
          incremental_place_amount: 3000,
        },
      ]

      const result = await insertMoneyFlowHistory(records)

      // Verify partition existence check
      const partitionCheckCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('SELECT EXISTS')
      )
      expect(partitionCheckCall).toBeDefined()
      const [, params] = partitionCheckCall ?? []
      expect(params).toEqual(['money_flow_history_2025_10_13'])

      // Verify partition creation call
      const createCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('CREATE TABLE money_flow_history_2025_10_13 PARTITION OF money_flow_history')
      )
      expect(createCall).toBeDefined()

      // Verify INSERT was successful
      expect(result.rowCount).toBe(1)

      // Verify COMMIT was called (not ROLLBACK)
      expect(mockQuery).toHaveBeenCalledWith('COMMIT')
    })

    it('should handle multiple partitions across date boundaries (AC5)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // Partition check 1
        .mockResolvedValueOnce({ rows: [], rowCount: 2 }) // INSERT partition 1
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // Partition check 2
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT partition 2
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // COMMIT

      const records: MoneyFlowRecord[] = [
        {
          entrant_id: 'E1',
          race_id: 'R1',
          time_to_start: -5,
          time_interval: 5,
          interval_type: '5m',
          polling_timestamp: '2025-10-13T14:30:00Z',
          hold_percentage: 15.5,
          win_pool_amount: 150000,
          place_pool_amount: 80000,
          total_pool_amount: 230000,
          incremental_win_amount: 5000,
          incremental_place_amount: 3000,
        },
        {
          entrant_id: 'E2',
          race_id: 'R1',
          time_to_start: -5,
          time_interval: 5,
          interval_type: '5m',
          polling_timestamp: '2025-10-13T23:59:00Z',
          hold_percentage: 12.0,
          win_pool_amount: 100000,
          place_pool_amount: 50000,
          total_pool_amount: 150000,
          incremental_win_amount: 3000,
          incremental_place_amount: 2000,
        },
        {
          entrant_id: 'E3',
          race_id: 'R2',
          time_to_start: -5,
          time_interval: 5,
          interval_type: '5m',
          polling_timestamp: '2025-10-14T00:01:00Z', // Next day
          hold_percentage: 18.0,
          win_pool_amount: 200000,
          place_pool_amount: 100000,
          total_pool_amount: 300000,
          incremental_win_amount: 8000,
          incremental_place_amount: 5000,
        },
      ]

      const result = await insertMoneyFlowHistory(records)

      expect(result.rowCount).toBe(3)

      // Verify two separate INSERTs to different partitions
      const insertCalls = mockQuery.mock.calls.filter((call) =>
        String(call[0]).includes('INSERT INTO money_flow_history_')
      )
      expect(insertCalls.length).toBe(2)
    })

    it('should build correct parameterized query for batch sizes (AC4)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // Partition check
        .mockResolvedValueOnce({ rows: [], rowCount: 3 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // COMMIT

      const records: MoneyFlowRecord[] = Array.from({ length: 3 }, (_, i) => ({
        entrant_id: `E${String(i + 1)}`,
        race_id: 'R1',
        time_to_start: -5,
        time_interval: 5,
        interval_type: '5m' as const,
        polling_timestamp: '2025-10-13T14:30:00Z',
        hold_percentage: 15.5 + i,
        win_pool_amount: 150000,
        place_pool_amount: 80000,
        total_pool_amount: 230000,
        incremental_win_amount: 5000,
        incremental_place_amount: 3000,
      }))

      await insertMoneyFlowHistory(records)

      const insertCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('INSERT INTO money_flow_history_')
      )
      const [sql, values] = insertCall ?? []

      // Verify multi-row VALUES clause
      expect(sql).toMatch(/VALUES.*,.*\(/) // Multiple value rows

      // Verify parameter indices (15 fields per record)
      expect(sql).toContain('$1')
      expect(sql).toContain('$15') // First record last param
      expect(sql).toContain('$16') // Second record first param
      expect(sql).toContain('$30') // Second record last param
      expect(sql).toContain('$31') // Third record first param

      // Verify values array contains all data
      expect(values).toContain('E1')
      expect(values).toContain('E2')
      expect(values).toContain('E3')
      expect(values).toContain(15.5)
      expect(values).toContain(16.5)
      expect(values).toContain(17.5)
    })
  })

  describe('insertOddsHistory', () => {
    it('should return zero metrics for empty array', async () => {
      const result = await insertOddsHistory([])
      expect(result).toEqual({ rowCount: 0, duration: 0 })
    })

    it('should generate correct append-only INSERT SQL (AC2, AC3)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // Partition check
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // COMMIT

      const records: OddsRecord[] = [
        {
          entrant_id: 'E1',
          odds: 3.5,
          type: 'fixed_win',
          event_timestamp: '2025-10-13T14:30:00Z',
        },
      ]

      await insertOddsHistory(records)

      const insertCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('INSERT INTO odds_history_')
      )
      expect(insertCall).toBeDefined()

      const [sql] = insertCall ?? []

      // Verify append-only INSERT (no ON CONFLICT clause) - AC3
      expect(sql).toContain('INSERT INTO odds_history_2025_10_13')
      expect(sql).not.toContain('ON CONFLICT')
      expect(sql).not.toContain('DO UPDATE')
    })

    it('should mirror money flow partition routing behavior (AC2, AC5)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // Partition check
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // COMMIT

      const records: OddsRecord[] = [
        {
          entrant_id: 'E1',
          odds: 3.5,
          type: 'pool_win',
          event_timestamp: '2025-10-13T14:30:00Z',
        },
      ]

      await insertOddsHistory(records)

      // Verify partition check happens
      const partitionCheckCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('SELECT EXISTS')
      )
      expect(partitionCheckCall).toBeDefined()
      const [, params] = partitionCheckCall ?? []
      expect(params).toEqual(['odds_history_2025_10_13'])
    })

    it('should auto-create partition if missing (Task 1.2)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // Partition check fails
        .mockResolvedValueOnce({ rows: [] }) // Partition creation
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // COMMIT

      const records: OddsRecord[] = [
        {
          entrant_id: 'E1',
          odds: 3.5,
          type: 'fixed_win',
          event_timestamp: '2025-10-13T14:30:00Z',
        },
      ]

      const result = await insertOddsHistory(records)

      // Verify partition existence check
      const partitionCheckCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('SELECT EXISTS')
      )
      expect(partitionCheckCall).toBeDefined()

      // Verify partition creation call
      const createCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('CREATE TABLE odds_history_2025_10_13 PARTITION OF odds_history')
      )
      expect(createCall).toBeDefined()

      // Verify INSERT was successful
      expect(result.rowCount).toBe(1)

      // Verify COMMIT was called (not ROLLBACK)
      expect(mockQuery).toHaveBeenCalledWith('COMMIT')
    })

    it('should handle all odds types correctly', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // Partition check
        .mockResolvedValueOnce({ rows: [], rowCount: 4 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // COMMIT

      const records: OddsRecord[] = [
        {
          entrant_id: 'E1',
          odds: 3.5,
          type: 'fixed_win',
          event_timestamp: '2025-10-13T14:30:00Z',
        },
        {
          entrant_id: 'E1',
          odds: 1.8,
          type: 'fixed_place',
          event_timestamp: '2025-10-13T14:30:00Z',
        },
        {
          entrant_id: 'E1',
          odds: 3.45,
          type: 'pool_win',
          event_timestamp: '2025-10-13T14:30:00Z',
        },
        {
          entrant_id: 'E1',
          odds: 1.75,
          type: 'pool_place',
          event_timestamp: '2025-10-13T14:30:00Z',
        },
      ]

      await insertOddsHistory(records)

      const insertCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('INSERT INTO odds_history_')
      )
      const [, values] = insertCall ?? []

      expect(values).toContain('fixed_win')
      expect(values).toContain('fixed_place')
      expect(values).toContain('pool_win')
      expect(values).toContain('pool_place')
    })
  })

  describe('Performance logging (AC8)', () => {
    it('should log duration metrics for INSERT operations', async () => {
      const { logger } = await import('../../../src/shared/logger.js')
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // Partition check
        .mockResolvedValueOnce({ rows: [], rowCount: 5 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // COMMIT

      const records: MoneyFlowRecord[] = [
        {
          entrant_id: 'E1',
          race_id: 'R1',
          time_to_start: -5,
          time_interval: 5,
          interval_type: '5m',
          polling_timestamp: '2025-10-13T14:30:00Z',
          hold_percentage: 15.5,
          win_pool_amount: 150000,
          place_pool_amount: 80000,
          total_pool_amount: 230000,
          incremental_win_amount: 5000,
          incremental_place_amount: 3000,
        },
      ]

      await insertMoneyFlowHistory(records)

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'money_flow_history',
          partitions: expect.arrayContaining(['money_flow_history_2025_10_13']),
          rowCount: 5,
          insert_ms: expect.any(Number),
          overBudget: expect.any(Boolean),
        }),
        'Money flow history INSERT completed'
      )
    })

    it('should emit warning when INSERT duration >= 300ms (AC8)', async () => {
      const { logger } = await import('../../../src/shared/logger.js')

      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // Partition check
        .mockImplementationOnce(async () => {
          await new Promise((resolve) => setTimeout(resolve, 350))
          return { rows: [], rowCount: 100 }
        }) // Slow INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // COMMIT

      const records: MoneyFlowRecord[] = [
        {
          entrant_id: 'E1',
          race_id: 'R1',
          time_to_start: -5,
          time_interval: 5,
          interval_type: '5m',
          polling_timestamp: '2025-10-13T14:30:00Z',
          hold_percentage: 15.5,
          win_pool_amount: 150000,
          place_pool_amount: 80000,
          total_pool_amount: 230000,
          incremental_win_amount: 5000,
          incremental_place_amount: 3000,
        },
      ]

      await insertMoneyFlowHistory(records)

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          duration: expect.any(Number),
          rowCount: 100,
          partitions: expect.arrayContaining(['money_flow_history_2025_10_13']),
        }),
        'Money flow INSERT exceeded 300ms threshold'
      )
    })
  })

  describe('ensurePartition', () => {
    it('should create partition if it does not exist (Task 1.1)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // Partition check
        .mockResolvedValueOnce({ rows: [] }) // Partition creation

      const tableName = 'money_flow_history'
      const date = new Date('2025-10-13T00:00:00Z')

      await ensurePartition(tableName, date)

      // Verify partition existence check
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT EXISTS'),
        ['money_flow_history_2025_10_13']
      )

      // Verify partition creation
      const createCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('CREATE TABLE money_flow_history_2025_10_13 PARTITION OF money_flow_history')
      )
      expect(createCall).toBeDefined()
      expect(String(createCall?.[0])).toContain('FOR VALUES FROM (\'2025-10-13\') TO (\'2025-10-14\')')
    })

    it('should not create partition if it already exists (Task 1.1)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: true }] }) // Partition exists

      const tableName = 'odds_history'
      const date = new Date('2025-10-13T00:00:00Z')

      await ensurePartition(tableName, date)

      // Verify partition existence check only
      expect(mockQuery).toHaveBeenCalledTimes(1)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT EXISTS'),
        ['odds_history_2025_10_13']
      )

      // Verify no creation call
      const createCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('CREATE TABLE')
      )
      expect(createCall).toBeUndefined()
    })

    it('should throw error when partition creation fails (Task 1.1)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // Partition check
        .mockRejectedValueOnce(new Error('Database error')) // Creation fails

      const tableName = 'money_flow_history'
      const date = new Date('2025-10-13T00:00:00Z')

      await expect(ensurePartition(tableName, date)).rejects.toThrow(
        'Failed to create partition money_flow_history_2025_10_13: Database error'
      )
    })

    it('should handle different date scenarios correctly (Task 1.1)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // Today
        .mockResolvedValueOnce({ rows: [] }) // Create today
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // Tomorrow
        .mockResolvedValueOnce({ rows: [] }) // Create tomorrow

      // Test today
      const today = new Date('2025-10-13T14:30:00Z')
      await ensurePartition('money_flow_history', today)

      // Test tomorrow
      const tomorrow = new Date('2025-10-14T00:00:00Z')
      await ensurePartition('money_flow_history', tomorrow)

      // Verify both partitions were created with correct date ranges
      const createCalls = mockQuery.mock.calls.filter((call) =>
        String(call[0]).includes('CREATE TABLE')
      )
      expect(createCalls.length).toBe(2)

      expect(String(createCalls[0]?.[0])).toContain('FOR VALUES FROM (\'2025-10-13\') TO (\'2025-10-14\')')
      expect(String(createCalls[1]?.[0])).toContain('FOR VALUES FROM (\'2025-10-14\') TO (\'2025-10-15\')')
    })
  })

  describe('ensureUpcomingPartitions', () => {
    it('should ensure both today and tomorrow partitions exist (Task 1.3)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // Today check
        .mockResolvedValueOnce({ rows: [] }) // Today creation
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // Tomorrow check
        .mockResolvedValueOnce({ rows: [] }) // Tomorrow creation

      await ensureUpcomingPartitions('money_flow_history')

      // Verify 4 calls: 2 existence checks + 2 creation calls
      expect(mockQuery).toHaveBeenCalledTimes(4)

      // Verify partition creation calls
      const createCalls = mockQuery.mock.calls.filter((call) =>
        String(call[0]).includes('CREATE TABLE')
      )
      expect(createCalls.length).toBe(2)
    })

    it('should handle existing partitions gracefully (Task 1.3)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // Today exists
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // Tomorrow exists

      await ensureUpcomingPartitions('odds_history')

      // Verify 2 calls: existence checks only
      expect(mockQuery).toHaveBeenCalledTimes(2)

      // Verify no creation calls
      const createCalls = mockQuery.mock.calls.filter((call) =>
        String(call[0]).includes('CREATE TABLE')
      )
      expect(createCalls.length).toBe(0)
    })

    it('should throw error when partition creation fails (Task 1.3)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // Today check
        .mockRejectedValueOnce(new Error('Connection failed')) // Creation fails

      await expect(ensureUpcomingPartitions('money_flow_history')).rejects.toThrow(
        'Connection failed'
      )
    })
  })

  describe('validatePartitionBeforeWrite', () => {
    it('should auto-create missing partition before write (Task 1.2)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // Partition check
        .mockResolvedValueOnce({ rows: [] }) // Partition creation

      const tableName = 'money_flow_history'
      const eventTimestamp = '2025-10-13T14:30:00Z'

      await validatePartitionBeforeWrite(tableName, eventTimestamp)

      // Verify partition existence check
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT EXISTS'),
        ['money_flow_history_2025_10_13']
      )

      // Verify partition creation call
      const createCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('CREATE TABLE')
      )
      expect(createCall).toBeDefined()
    })

    it('should skip creation if partition exists (Task 1.2)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: true }] }) // Partition exists

      const tableName = 'odds_history'
      const eventTimestamp = '2025-10-13T14:30:00Z'

      await validatePartitionBeforeWrite(tableName, eventTimestamp)

      // Verify single existence check only
      expect(mockQuery).toHaveBeenCalledTimes(1)

      // Verify no creation call
      const createCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('CREATE TABLE')
      )
      expect(createCall).toBeUndefined()
    })

    it('should handle edge case date scenarios (Task 1.2)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // Partition check
        .mockResolvedValueOnce({ rows: [] }) // Partition creation

      // Test year boundary
      const tableName = 'money_flow_history'
      const eventTimestamp = '2025-12-31T23:59:59Z'

      await validatePartitionBeforeWrite(tableName, eventTimestamp)

      // Verify correct partition name and date range
      const createCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('CREATE TABLE')
      )
      expect(createCall).toBeDefined()
      expect(String(createCall?.[0])).toContain('money_flow_history_2025_12_31')
      expect(String(createCall?.[0])).toContain('FOR VALUES FROM (\'2025-12-31\') TO (\'2026-01-01\')')
    })
  })
})
