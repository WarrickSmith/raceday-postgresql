import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { getTomorrowNzDate } from '../../src/shared/timezone.js'

type PartitionModule = typeof import('../../src/database/partitions.js')

const ensureTestEnv = (): void => {
  process.env.NODE_ENV ??= 'test'
  process.env.DB_HOST ??= 'localhost'
  process.env.DB_PORT ??= '5432'
  process.env.DB_USER ??= 'postgres'
  process.env.DB_PASSWORD ??= 'postgres'
  process.env.DB_NAME ??= 'raceday'
  process.env.NZTAB_API_URL ??= 'https://api.tab.co.nz'
  process.env.LOG_LEVEL ??= 'info'
}

let getPartitionName: PartitionModule['getPartitionName']
let createTomorrowPartitions: PartitionModule['createTomorrowPartitions']

beforeAll(async () => {
  ensureTestEnv()
  const partitionModule: PartitionModule = await import('../../src/database/partitions.js')
  ;({ getPartitionName, createTomorrowPartitions } = partitionModule)
})

const buildDatabaseUrl = (): string => {
  const dbHost = process.env.DB_HOST ?? 'localhost'
  const dbPort = process.env.DB_PORT ?? '5432'
  const dbUser = process.env.DB_USER ?? 'postgres'
  const dbPassword = process.env.DB_PASSWORD ?? 'postgres'
  const dbName = process.env.DB_NAME ?? 'raceday'
  return `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`
}

describe('Partition Utility Functions', () => {
  describe('getPartitionName', () => {
    it('should generate correct partition name for single-digit month and day', () => {
      const date = new Date('2025-01-05')
      const result = getPartitionName('money_flow_history', date)
      expect(result).toBe('money_flow_history_2025_01_05')
    })

    it('should generate correct partition name for double-digit month and day', () => {
      const date = new Date('2025-12-25')
      const result = getPartitionName('money_flow_history', date)
      expect(result).toBe('money_flow_history_2025_12_25')
    })

    it('should handle different table names', () => {
      const date = new Date('2025-10-06')
      const result1 = getPartitionName('money_flow_history', date)
      const result2 = getPartitionName('odds_history', date)

      expect(result1).toBe('money_flow_history_2025_10_06')
      expect(result2).toBe('odds_history_2025_10_06')
    })

    it('should pad month and day with leading zeros', () => {
      const date = new Date('2025-03-07')
      const result = getPartitionName('odds_history', date)
      expect(result).toBe('odds_history_2025_03_07')
    })

    it('should handle year boundary correctly', () => {
      const date = new Date('2024-12-31')
      const result = getPartitionName('money_flow_history', date)
      expect(result).toBe('money_flow_history_2024_12_31')
    })

    it('should handle leap year date', () => {
      const date = new Date('2024-02-29')
      const result = getPartitionName('money_flow_history', date)
      expect(result).toBe('money_flow_history_2024_02_29')
    })
  })

  const skipDbTests = process.env.SKIP_DB_TESTS === 'true'
  const describeDb = skipDbTests ? describe.skip : describe

  describeDb('createTomorrowPartitions', () => {
    let pool: Pool

    beforeAll(() => {
      pool = new Pool({
        connectionString: buildDatabaseUrl(),
      })

      pool.on('error', (err) => {
        console.error('Unexpected pool error:', err)
      })
    })

    afterAll(async () => {
      await pool.end()
    })

    // Clean up tomorrow's partitions before each test to ensure idempotent test execution
    beforeEach(async () => {
      const tomorrow = getTomorrowNzDate()
      const tomorrowPartitionMoney = getPartitionName('money_flow_history', tomorrow)
      const tomorrowPartitionOdds = getPartitionName('odds_history', tomorrow)

      // Drop tomorrow's partitions if they exist (from previous test runs or other stories)
      await pool.query(`DROP TABLE IF EXISTS ${tomorrowPartitionMoney}`)
      await pool.query(`DROP TABLE IF EXISTS ${tomorrowPartitionOdds}`)
    })

    it('should create partitions for tomorrow for both tables', async () => {
      const result = await createTomorrowPartitions(pool)

      expect(result.length).toBe(2)

      const hasMoneyFlowPartition = result.some((name) => name.startsWith('money_flow_history_'))
      const hasOddsPartition = result.some((name) => name.startsWith('odds_history_'))

      expect(hasMoneyFlowPartition).toBe(true)
      expect(hasOddsPartition).toBe(true)
    })

    it('should create partitions with correct naming format YYYY_MM_DD', async () => {
      const result = await createTomorrowPartitions(pool)

      result.forEach((partitionName) => {
        expect(partitionName).toMatch(/^(money_flow_history|odds_history)_\d{4}_\d{2}_\d{2}$/)
      })
    })

    it('should be idempotent (safe to run multiple times)', async () => {
      // First call
      const result1 = await createTomorrowPartitions(pool)
      expect(result1.length).toBe(2)

      // Second call should not throw error
      const result2 = await createTomorrowPartitions(pool)
      expect(result2.length).toBe(2)

      // Both calls should return same partition names
      expect(result1.sort()).toEqual(result2.sort())
    })

    it('should create partition for correct date (tomorrow in NZ timezone)', async () => {
      const tomorrow = getTomorrowNzDate()

      const expectedMoneyFlowPartition = getPartitionName('money_flow_history', tomorrow)
      const expectedOddsPartition = getPartitionName('odds_history', tomorrow)

      const result = await createTomorrowPartitions(pool)

      expect(result).toContain(expectedMoneyFlowPartition)
      expect(result).toContain(expectedOddsPartition)
    })

    it('should verify partitions exist in database after creation', async () => {
      await createTomorrowPartitions(pool)

      const tomorrow = getTomorrowNzDate()
      const expectedPartition = getPartitionName('money_flow_history', tomorrow)

      const result = await pool.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = $1
      `, [expectedPartition])

      expect(result.rows.length).toBe(1)
      expect(result.rows[0]?.tablename).toBe(expectedPartition)
    })
  })
})
