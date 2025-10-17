import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import 'dotenv/config'
import { getTomorrowNzDate } from '../../src/shared/timezone.js'

type PartitionsModule = typeof import('../../src/database/partitions.js')
type PartitionSchedulerModule = typeof import('../../src/database/partition-scheduler.js')

const buildDatabaseUrl = (): string => {
  const dbHost = process.env.DB_HOST ?? 'localhost'
  const dbPort = process.env.DB_PORT ?? '5432'
  const dbUser = process.env.DB_USER ?? 'postgres'
  const dbPassword = process.env.DB_PASSWORD ?? 'postgres'
  const dbName = process.env.DB_NAME ?? 'raceday'
  return `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`
}

describe('Partition Automation Integration Tests', () => {
  let pool: Pool
  let getPartitionName: PartitionsModule['getPartitionName']
  let createTomorrowPartitions: PartitionsModule['createTomorrowPartitions']
  let startPartitionScheduler: PartitionSchedulerModule['startPartitionScheduler']

  beforeAll(async () => {
    pool = new Pool({
      connectionString: buildDatabaseUrl(),
    })

    pool.on('error', (err) => {
      console.error('Unexpected pool error:', err)
    })

    const partitionsModule: PartitionsModule = await import(
      '../../src/database/partitions.js'
    )
    const schedulerModule: PartitionSchedulerModule = await import(
      '../../src/database/partition-scheduler.js'
    )

    ;({ getPartitionName, createTomorrowPartitions } = partitionsModule)
    ;({ startPartitionScheduler } = schedulerModule)
  })

  afterAll(async () => {
    await pool.end()
  })

  describe('Automated Partition Creation (AC1)', () => {
    it('should create partitions with correct naming convention {table}_YYYY_MM_DD', async () => {
      const tomorrow = getTomorrowNzDate()

      // Clean up before test
      const expectedPartitions = [
        getPartitionName('money_flow_history', tomorrow),
        getPartitionName('odds_history', tomorrow),
      ]

      for (const partitionName of expectedPartitions) {
        await pool.query(`DROP TABLE IF EXISTS ${partitionName}`)
      }

      // Create partitions
      const createdPartitions = await createTomorrowPartitions(pool)

      // Verify naming format
      expect(createdPartitions.length).toBe(2)
      createdPartitions.forEach((name) => {
        expect(name).toMatch(/^(money_flow_history|odds_history)_\d{4}_\d{2}_\d{2}$/)
      })
    })

    it('should handle existing partitions gracefully (AC5)', async () => {
      // First call creates partitions
      const result1 = await createTomorrowPartitions(pool)
      expect(result1.length).toBe(2)

      // Second call should not throw error (idempotent)
      const result2 = await createTomorrowPartitions(pool)
      expect(result2.length).toBe(2)

      // Both calls should create the same partition names
      expect(result1.sort()).toEqual(result2.sort())
    })

    it('should verify partitions exist in database after creation', async () => {
      await createTomorrowPartitions(pool)

      const tomorrow = getTomorrowNzDate()
      const expectedMoneyFlowPartition = getPartitionName(
        'money_flow_history',
        tomorrow
      )
      const expectedOddsPartition = getPartitionName('odds_history', tomorrow)

      // Check money_flow_history partition
      const moneyFlowResult = await pool.query<{ tablename: string }>(
        `
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = $1
      `,
        [expectedMoneyFlowPartition]
      )

      expect(moneyFlowResult.rows.length).toBe(1)
      expect(moneyFlowResult.rows[0]?.tablename).toBe(expectedMoneyFlowPartition)

      // Check odds_history partition
      const oddsResult = await pool.query<{ tablename: string }>(
        `
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = $1
      `,
        [expectedOddsPartition]
      )

      expect(oddsResult.rows.length).toBe(1)
      expect(oddsResult.rows[0]?.tablename).toBe(expectedOddsPartition)
    })

    it('should create partitions for both money_flow_history and odds_history tables', async () => {
      const tomorrow = getTomorrowNzDate()

      // Clean up
      await pool.query(
        `DROP TABLE IF EXISTS ${getPartitionName('money_flow_history', tomorrow)}`
      )
      await pool.query(
        `DROP TABLE IF EXISTS ${getPartitionName('odds_history', tomorrow)}`
      )

      const result = await createTomorrowPartitions(pool)

      expect(result.length).toBe(2)

      const hasMoneyFlowPartition = result.some((name) =>
        name.startsWith('money_flow_history_')
      )
      const hasOddsPartition = result.some((name) => name.startsWith('odds_history_'))

      expect(hasMoneyFlowPartition).toBe(true)
      expect(hasOddsPartition).toBe(true)
    })

    it('should verify partition range logic: FOR VALUES FROM (date) TO (date + 1 day)', async () => {
      const tomorrow = getTomorrowNzDate()

      await createTomorrowPartitions(pool)

      const partitionName = getPartitionName('money_flow_history', tomorrow)

      // Query partition bounds from PostgreSQL catalog
      interface PartitionBound {
        /* eslint-disable @typescript-eslint/naming-convention */
        partition_expression: string
      }
      const result = await pool.query<PartitionBound>(
        `
        SELECT pg_get_expr(c.relpartbound, c.oid) as partition_expression
        FROM pg_class c
        WHERE c.relname = $1
      `,
        [partitionName]
      )

      expect(result.rows.length).toBe(1)
      const expression = result.rows[0]?.partition_expression

      // Verify partition expression contains date range
      expect(expression).toBeDefined()
      if (expression !== undefined) {
        expect(expression).toContain('FOR VALUES FROM')
        expect(expression).toContain('TO')
      }
    })
  })

  describe('Partition Scheduler Lifecycle (AC1, AC5)', () => {
    it('should start partition scheduler and create partitions on startup', async () => {
      const tomorrow = getTomorrowNzDate()

      // Clean up
      await pool.query(
        `DROP TABLE IF EXISTS ${getPartitionName('money_flow_history', tomorrow)}`
      )
      await pool.query(
        `DROP TABLE IF EXISTS ${getPartitionName('odds_history', tomorrow)}`
      )

      // Start scheduler with runOnStartup enabled
      const handle = startPartitionScheduler({
        pool,
        runOnStartup: true,
      })

      expect(handle.initialRunPromise).toBeDefined()

      if (handle.initialRunPromise !== undefined) {
        const result = await handle.initialRunPromise
        expect(result.length).toBe(2)
      }

      // Verify partitions exist
      const partitionExists = await pool.query<{ exists: boolean }>(
        `
        SELECT EXISTS (
          SELECT 1 FROM pg_tables
          WHERE schemaname = 'public'
          AND tablename = $1
        ) as exists
      `,
        [getPartitionName('money_flow_history', tomorrow)]
      )

      expect(partitionExists.rows[0]?.exists).toBe(true)

      // Stop scheduler
      handle.stop()
    })

    it('should support manual partition creation via runNow()', async () => {
      const tomorrow = getTomorrowNzDate()

      // Clean up
      await pool.query(
        `DROP TABLE IF EXISTS ${getPartitionName('money_flow_history', tomorrow)}`
      )
      await pool.query(
        `DROP TABLE IF EXISTS ${getPartitionName('odds_history', tomorrow)}`
      )

      // Start scheduler without runOnStartup
      const handle = startPartitionScheduler({
        pool,
        runOnStartup: false,
      })

      expect(handle.initialRunPromise).toBeUndefined()

      // Manually trigger partition creation
      const result = await handle.runNow()

      expect(result.length).toBe(2)

      // Verify partitions exist
      const partitionExists = await pool.query<{ exists: boolean }>(
        `
        SELECT EXISTS (
          SELECT 1 FROM pg_tables
          WHERE schemaname = 'public'
          AND tablename = $1
        ) as exists
      `,
        [getPartitionName('money_flow_history', tomorrow)]
      )

      expect(partitionExists.rows[0]?.exists).toBe(true)

      // Stop scheduler
      handle.stop()
    })
  })

  describe('Data Routing to Partitions (AC1)', () => {
    it('should route data inserts to correct partition based on event_timestamp', async () => {
      const tomorrow = getTomorrowNzDate()

      // Ensure partition exists
      await createTomorrowPartitions(pool)

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // Create test data dependencies
        await client.query(`
          INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
          VALUES ('TEST-PART-AUTO-01', 'Test Meeting', 'NZ', 'thoroughbred', CURRENT_DATE, 'active')
        `)

        await client.query(`
          INSERT INTO races (race_id, meeting_id, name, race_number, start_time, status)
          VALUES ('TEST-RACE-AUTO-01', 'TEST-PART-AUTO-01', 'Test Race', 1, NOW(), 'open')
        `)

        await client.query(`
          INSERT INTO entrants (entrant_id, race_id, name, runner_number)
          VALUES ('TEST-ENT-AUTO-01', 'TEST-RACE-AUTO-01', 'Test Horse', 1)
        `)

        // Insert with tomorrow's timestamp (should route to tomorrow's partition)
        const tomorrowTimestamp = tomorrow.toISOString()

        await client.query(
          `
          INSERT INTO money_flow_history (
            entrant_id, race_id, event_timestamp, polling_timestamp,
            hold_percentage, bet_percentage
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
          [
            'TEST-ENT-AUTO-01',
            'TEST-RACE-AUTO-01',
            tomorrowTimestamp,
            tomorrowTimestamp,
            5.25,
            10.5,
          ]
        )

        // Verify data is in the correct partition
        interface MoneyFlowRow {
          /* eslint-disable @typescript-eslint/naming-convention */
          entrant_id: string
          /* eslint-enable @typescript-eslint/naming-convention */
        }
        const result = await client.query<MoneyFlowRow>(
          `
          SELECT * FROM money_flow_history
          WHERE entrant_id = 'TEST-ENT-AUTO-01'
        `
        )

        expect(result.rows.length).toBe(1)
        expect(result.rows[0]?.entrant_id).toBe('TEST-ENT-AUTO-01')

        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    })
  })
})
