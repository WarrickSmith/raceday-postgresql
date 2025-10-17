import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import type { Logger } from 'pino'

// Mock dependencies
vi.mock('node-cron', () => ({
  schedule: vi.fn(() => ({
    stop: vi.fn(),
    start: vi.fn(),
  })),
}))

vi.mock('../../src/database/partitions.js', () => ({
  createTomorrowPartitions: vi.fn(() =>
    Promise.resolve([
      'money_flow_history_2025_10_18',
      'odds_history_2025_10_18',
    ])
  ),
}))

vi.mock('../../src/shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}))

type PartitionSchedulerModule = typeof import('../../src/database/partition-scheduler.js')
type PartitionsModule = typeof import('../../src/database/partitions.js')

let startPartitionScheduler: PartitionSchedulerModule['startPartitionScheduler']
let createTomorrowPartitions: PartitionsModule['createTomorrowPartitions']

describe('Partition Scheduler', () => {
  let mockPool: Pool
  let mockLogger: Logger

  beforeEach(async () => {
    vi.clearAllMocks()

    // Create mock pool
    mockPool = {
      query: vi.fn(),
      connect: vi.fn(),
      end: vi.fn(),
    } as unknown as Pool

    // Create mock logger
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger

    // Import modules
    const schedulerModule: PartitionSchedulerModule = await import(
      '../../src/database/partition-scheduler.js'
    )
    const partitionsModule: PartitionsModule = await import(
      '../../src/database/partitions.js'
    )

    ;({ startPartitionScheduler } = schedulerModule)
    ;({ createTomorrowPartitions } = partitionsModule)
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('Initialization', () => {
    it('should start scheduler with default configuration', () => {
      const handle = startPartitionScheduler({
        pool: mockPool,
        runOnStartup: false,
      })

      expect(handle).toBeDefined()
      expect(handle.isRunning()).toBe(true)

      handle.stop()
    })

    it('should start scheduler with custom cron expression', () => {
      const handle = startPartitionScheduler({
        pool: mockPool,
        cronExpression: '0 1 * * *', // 1 AM instead of midnight
        runOnStartup: false,
      })

      expect(handle).toBeDefined()
      expect(handle.isRunning()).toBe(true)

      handle.stop()
    })

    it('should start scheduler with custom timezone', () => {
      const handle = startPartitionScheduler({
        pool: mockPool,
        timezone: 'UTC',
        runOnStartup: false,
      })

      expect(handle).toBeDefined()
      expect(handle.isRunning()).toBe(true)

      handle.stop()
    })

    it('should accept custom logger', () => {
      const handle = startPartitionScheduler({
        pool: mockPool,
        logger: mockLogger,
        runOnStartup: false,
      })

      expect(handle).toBeDefined()
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'partition_scheduler_started',
        }),
        'Partition scheduler started'
      )

      handle.stop()
    })
  })

  describe('Partition Creation', () => {
    it('should run partition creation on startup when enabled', async () => {
      const handle = startPartitionScheduler({
        pool: mockPool,
        runOnStartup: true,
      })

      expect(handle.initialRunPromise).toBeDefined()

      if (handle.initialRunPromise !== undefined) {
        const result = await handle.initialRunPromise
        expect(result).toEqual([
          'money_flow_history_2025_10_18',
          'odds_history_2025_10_18',
        ])
        expect(createTomorrowPartitions).toHaveBeenCalledWith(mockPool)
      }

      handle.stop()
    })

    it('should skip partition creation on startup when disabled', () => {
      const handle = startPartitionScheduler({
        pool: mockPool,
        runOnStartup: false,
      })

      expect(handle.initialRunPromise).toBeUndefined()
      expect(createTomorrowPartitions).not.toHaveBeenCalled()

      handle.stop()
    })

    it('should create partitions when runNow is called', async () => {
      const handle = startPartitionScheduler({
        pool: mockPool,
        runOnStartup: false,
      })

      const result = await handle.runNow()

      expect(result).toEqual([
        'money_flow_history_2025_10_18',
        'odds_history_2025_10_18',
      ])
      expect(createTomorrowPartitions).toHaveBeenCalledWith(mockPool)

      handle.stop()
    })

    it('should prevent concurrent partition creation runs', async () => {
      const handle = startPartitionScheduler({
        pool: mockPool,
        runOnStartup: false,
      })

      // Start two concurrent runs
      const run1 = handle.runNow()
      const run2 = handle.runNow()

      // Both should resolve to the same result
      const [result1, result2] = await Promise.all([run1, run2])

      expect(result1).toEqual(result2)
      // createTomorrowPartitions should only be called once
      expect(createTomorrowPartitions).toHaveBeenCalledTimes(1)

      handle.stop()
    })
  })

  describe('Error Handling', () => {
    it('should handle partition creation errors gracefully', async () => {
      const error = new Error('Database connection failed')
      vi.mocked(createTomorrowPartitions).mockRejectedValueOnce(error)

      const handle = startPartitionScheduler({
        pool: mockPool,
        logger: mockLogger,
        runOnStartup: false,
      })

      await expect(handle.runNow()).rejects.toThrow('Database connection failed')

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'partition_creation_failed',
        }),
        'Partition creation failed'
      )

      handle.stop()
    })

    it('should allow subsequent runs after an error', async () => {
      const error = new Error('Temporary failure')

      // First call fails
      vi.mocked(createTomorrowPartitions).mockRejectedValueOnce(error)

      // Second call succeeds
      vi.mocked(createTomorrowPartitions).mockResolvedValueOnce([
        'money_flow_history_2025_10_18',
        'odds_history_2025_10_18',
      ])

      const handle = startPartitionScheduler({
        pool: mockPool,
        runOnStartup: false,
      })

      // First run fails
      await expect(handle.runNow()).rejects.toThrow('Temporary failure')

      // Second run succeeds
      const result = await handle.runNow()
      expect(result).toEqual([
        'money_flow_history_2025_10_18',
        'odds_history_2025_10_18',
      ])

      handle.stop()
    })
  })

  describe('Lifecycle Management', () => {
    it('should stop the scheduler when stop is called', () => {
      const handle = startPartitionScheduler({
        pool: mockPool,
        logger: mockLogger,
        runOnStartup: false,
      })

      expect(handle.isRunning()).toBe(true)

      handle.stop()

      expect(handle.isRunning()).toBe(false)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'partition_scheduler_stopped',
        }),
        'Partition scheduler stopped'
      )
    })

    it('should be idempotent when stop is called multiple times', () => {
      const handle = startPartitionScheduler({
        pool: mockPool,
        logger: mockLogger,
        runOnStartup: false,
      })

      handle.stop()
      handle.stop() // Second call should not throw

      expect(handle.isRunning()).toBe(false)
    })
  })

  describe('Logging', () => {
    it('should log partition creation start', async () => {
      const handle = startPartitionScheduler({
        pool: mockPool,
        logger: mockLogger,
        runOnStartup: false,
      })

      await handle.runNow()

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'partition_creation_start',
          reason: 'manual',
        }),
        'Partition creation starting'
      )

      handle.stop()
    })

    it('should log partition creation completion with metrics', async () => {
      const handle = startPartitionScheduler({
        pool: mockPool,
        logger: mockLogger,
        runOnStartup: false,
      })

      await handle.runNow()

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'partition_creation_complete',
          partitionsCreated: 2,
          partitionNames: [
            'money_flow_history_2025_10_18',
            'odds_history_2025_10_18',
          ],
        }),
        'Partition creation completed successfully'
      )

      handle.stop()
    })
  })
})
