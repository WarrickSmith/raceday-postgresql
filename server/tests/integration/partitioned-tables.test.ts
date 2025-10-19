import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import 'dotenv/config'
import { ensurePartition } from '../../src/database/time-series.js'

const buildDatabaseUrl = (): string => {
  const dbHost = process.env.DB_HOST ?? 'localhost'
  const dbPort = process.env.DB_PORT ?? '5432'
  const dbUser = process.env.DB_USER ?? 'postgres'
  const dbPassword = process.env.DB_PASSWORD ?? 'postgres'
  const dbName = process.env.DB_NAME ?? 'raceday'
  return `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`
}

describe('Partitioned Tables Tests', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = new Pool({
      connectionString: buildDatabaseUrl(),
    })

    pool.on('error', (err) => {
      console.error('Unexpected pool error:', err)
    })

    const today = new Date()
    await ensurePartition('money_flow_history', today)
    await ensurePartition('odds_history', today)
  })

  afterAll(async () => {
    await pool.end()
  })

  describe('Table Existence', () => {
    it('should create money_flow_history partitioned table', async () => {
      const result = await pool.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'money_flow_history'
      `)
      expect(result.rows.length).toBe(1)
    })

    it('should create odds_history partitioned table', async () => {
      const result = await pool.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'odds_history'
      `)
      expect(result.rows.length).toBe(1)
    })
  })

  describe('Partition Existence', () => {
    it('should create initial partition for money_flow_history with correct naming', async () => {
      // Check for any money_flow_history partitions (should be at least one)
      const result = await pool.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename LIKE 'money_flow_history_%'
        AND tablename != 'money_flow_history'
      `)

      expect(result.rows.length).toBeGreaterThan(0)

      // Verify naming format YYYY_MM_DD
      result.rows.forEach((row) => {
        expect(row.tablename).toMatch(/^money_flow_history_\d{4}_\d{2}_\d{2}$/)
      })
    })

    it('should create initial partition for odds_history with correct naming', async () => {
      // Check for any odds_history partitions (should be at least one)
      const result = await pool.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename LIKE 'odds_history_%'
        AND tablename != 'odds_history'
      `)

      expect(result.rows.length).toBeGreaterThan(0)

      // Verify naming format YYYY_MM_DD
      result.rows.forEach((row) => {
        expect(row.tablename).toMatch(/^odds_history_\d{4}_\d{2}_\d{2}$/)
      })
    })
  })

  describe('Partition Naming Convention', () => {
    it('should follow YYYY_MM_DD naming format for partitions', async () => {
      const result = await pool.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND (tablename LIKE 'money_flow_history_%' OR tablename LIKE 'odds_history_%')
        AND tablename NOT IN ('money_flow_history', 'odds_history')
      `)

      result.rows.forEach((row) => {
        // Match pattern: {table_name}_YYYY_MM_DD
        expect(row.tablename).toMatch(/^(money_flow_history|odds_history)_\d{4}_\d{2}_\d{2}$/)
      })
    })
  })

  describe('Data Insertion to Correct Partition', () => {
    it('should insert money_flow_history data to correct partition based on event_timestamp', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // Create test data dependencies
        await client.query(`
          INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
          VALUES ('TEST-PART-01', 'Test Meeting', 'NZ', 'thoroughbred', CURRENT_DATE, 'active')
        `)
        await client.query(`
          INSERT INTO races (race_id, meeting_id, name, race_number, start_time, status)
          VALUES ('TEST-RACE-PART-01', 'TEST-PART-01', 'Test Race', 1, NOW(), 'open')
        `)
        await client.query(`
          INSERT INTO entrants (entrant_id, race_id, name, runner_number)
          VALUES ('TEST-ENT-PART-01', 'TEST-RACE-PART-01', 'Test Horse', 1)
        `)

        // Insert into partitioned table with today's timestamp
        await client.query(`
          INSERT INTO money_flow_history (
            entrant_id, race_id, event_timestamp, polling_timestamp,
            hold_percentage, bet_percentage
          )
          VALUES (
            'TEST-ENT-PART-01', 'TEST-RACE-PART-01', NOW(), NOW(),
            5.25, 10.50
          )
        `)

        interface MoneyFlowRow {
          /* eslint-disable-next-line @typescript-eslint/naming-convention */
          entrant_id: string
        }
        const result = await client.query<MoneyFlowRow>(`
          SELECT * FROM money_flow_history
          WHERE entrant_id = 'TEST-ENT-PART-01'
        `)

        expect(result.rows.length).toBe(1)
        expect(result.rows[0]?.entrant_id).toBe('TEST-ENT-PART-01')

        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    })

    it('should insert odds_history data to correct partition based on event_timestamp', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // Create test data dependencies
        await client.query(`
          INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
          VALUES ('TEST-PART-02', 'Test Meeting', 'NZ', 'thoroughbred', CURRENT_DATE, 'active')
        `)
        await client.query(`
          INSERT INTO races (race_id, meeting_id, name, race_number, start_time, status)
          VALUES ('TEST-RACE-PART-02', 'TEST-PART-02', 'Test Race', 1, NOW(), 'open')
        `)
        await client.query(`
          INSERT INTO entrants (entrant_id, race_id, name, runner_number)
          VALUES ('TEST-ENT-PART-02', 'TEST-RACE-PART-02', 'Test Horse', 1)
        `)

        // Insert into partitioned table with today's timestamp
        await client.query(`
          INSERT INTO odds_history (entrant_id, event_timestamp, odds, type)
          VALUES ('TEST-ENT-PART-02', NOW(), 3.50, 'win')
        `)

        interface OddsHistoryRow {
          /* eslint-disable-next-line @typescript-eslint/naming-convention */
          entrant_id: string
        }
        const result = await client.query<OddsHistoryRow>(`
          SELECT * FROM odds_history
          WHERE entrant_id = 'TEST-ENT-PART-02'
        `)

        expect(result.rows.length).toBe(1)
        expect(result.rows[0]?.entrant_id).toBe('TEST-ENT-PART-02')

        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    })
  })

  describe('Foreign Key Constraints', () => {
    it('should enforce entrant_id foreign key on money_flow_history', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        await expect(
          client.query(`
            INSERT INTO money_flow_history (entrant_id, race_id, event_timestamp, polling_timestamp)
            VALUES ('INVALID-ENTRANT', 'SOME-RACE', NOW(), NOW())
          `)
        ).rejects.toThrow()

        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    })

    it('should enforce entrant_id foreign key on odds_history', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        await expect(
          client.query(`
            INSERT INTO odds_history (entrant_id, event_timestamp, odds)
            VALUES ('INVALID-ENTRANT', NOW(), 3.50)
          `)
        ).rejects.toThrow()

        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    })
  })

  describe('Index Usage and Partition Pruning', () => {
    it('should create index on money_flow_history (entrant_id, event_timestamp DESC)', async () => {
      const result = await pool.query<{ indexname: string }>(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
        AND tablename = 'money_flow_history'
        AND indexname = 'idx_money_flow_entrant_time'
      `)

      expect(result.rows.length).toBe(1)
    })

    it('should create index on odds_history (entrant_id, event_timestamp DESC)', async () => {
      const result = await pool.query<{ indexname: string }>(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
        AND tablename = 'odds_history'
        AND indexname = 'idx_odds_entrant_time'
      `)

      expect(result.rows.length).toBe(1)
    })

    it('should demonstrate partition pruning with EXPLAIN', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // Create test data
        await client.query(`
          INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
          VALUES ('TEST-PRUNE-01', 'Test', 'NZ', 'thoroughbred', CURRENT_DATE, 'active')
        `)
        await client.query(`
          INSERT INTO races (race_id, meeting_id, name, race_number, start_time, status)
          VALUES ('TEST-RACE-PRUNE-01', 'TEST-PRUNE-01', 'Test', 1, NOW(), 'open')
        `)
        await client.query(`
          INSERT INTO entrants (entrant_id, race_id, name, runner_number)
          VALUES ('TEST-ENT-PRUNE-01', 'TEST-RACE-PRUNE-01', 'Test', 1)
        `)
        await client.query(`
          INSERT INTO money_flow_history (entrant_id, race_id, event_timestamp, polling_timestamp)
          VALUES ('TEST-ENT-PRUNE-01', 'TEST-RACE-PRUNE-01', NOW(), NOW())
        `)

        // EXPLAIN query to verify partition pruning
        interface QueryPlanRow {
          /* eslint-disable-next-line @typescript-eslint/naming-convention */
          'QUERY PLAN': string
        }
        const explainResult = await client.query<QueryPlanRow>(`
          EXPLAIN SELECT * FROM money_flow_history
          WHERE entrant_id = 'TEST-ENT-PRUNE-01'
          AND event_timestamp > NOW() - INTERVAL '1 day'
        `)

        // Verify plan includes partition name (partition pruning active)
        const plan = explainResult.rows.map((row) => row['QUERY PLAN']).join('\n')
        const today = new Date()
        const year = String(today.getFullYear())
        const month = String(today.getMonth() + 1).padStart(2, '0')
        const day = String(today.getDate()).padStart(2, '0')

        // Check if any partition for today's date is being used (accounting for adjacent dates)
        const todayDate = `${year}_${month}_${day}`
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayDate = `${String(yesterday.getFullYear())}_${String(yesterday.getMonth() + 1).padStart(2, '0')}_${String(yesterday.getDate()).padStart(2, '0')}`

        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const tomorrowDate = `${String(tomorrow.getFullYear())}_${String(tomorrow.getMonth() + 1).padStart(2, '0')}_${String(tomorrow.getDate()).padStart(2, '0')}`

        // Check that some partition is being used (could be today, yesterday, or tomorrow based on partitioning strategy)
        const hasPartitionPruning = plan.includes(todayDate) || plan.includes(yesterdayDate) || plan.includes(tomorrowDate)
        expect(hasPartitionPruning).toBe(true)

        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    })
  })
})
