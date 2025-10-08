import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import 'dotenv/config'

const buildDatabaseUrl = (): string => {
  const dbHost = process.env.DB_HOST ?? 'localhost'
  const dbPort = process.env.DB_PORT ?? '5432'
  const dbUser = process.env.DB_USER ?? 'postgres'
  const dbPassword = process.env.DB_PASSWORD ?? 'postgres'
  const dbName = process.env.DB_NAME ?? 'raceday'
  return `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`
}

describe('Database Schema Tests', () => {
  let pool: Pool

  beforeAll(() => {
    pool = new Pool({
      connectionString: buildDatabaseUrl(),
    })
  })

  afterAll(async () => {
    await pool.end()
  })

  describe('Table Existence', () => {
    it('should create meetings table', async () => {
      const result = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'meetings'
      `)
      expect(result.rows.length).toBe(1)
    })

    it('should create races table', async () => {
      const result = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'races'
      `)
      expect(result.rows.length).toBe(1)
    })

    it('should create entrants table', async () => {
      const result = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'entrants'
      `)
      expect(result.rows.length).toBe(1)
    })

    it('should create race_pools table', async () => {
      const result = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'race_pools'
      `)
      expect(result.rows.length).toBe(1)
    })
  })

  describe('Primary Key Constraints', () => {
    it('should enforce meeting_id primary key', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(`
          INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
          VALUES ('TEST-PK-01', 'Test Meeting', 'NZ', 'thoroughbred', '2025-10-06', 'active')
        `)
        await expect(
          client.query(`
            INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
            VALUES ('TEST-PK-01', 'Duplicate', 'NZ', 'thoroughbred', '2025-10-06', 'active')
          `)
        ).rejects.toThrow()
        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    })
  })

  describe('Foreign Key Constraints', () => {
    it('should enforce meeting_id foreign key on races', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await expect(
          client.query(`
            INSERT INTO races (race_id, meeting_id, name, race_number, start_time, status)
            VALUES ('TEST-RACE-01', 'INVALID-MEETING', 'Test Race', 1, NOW(), 'open')
          `)
        ).rejects.toThrow()
        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    })

    it('should cascade delete races when meeting is deleted', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(`
          INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
          VALUES ('TEST-CASCADE-01', 'Test Meeting', 'NZ', 'thoroughbred', '2025-10-06', 'active')
        `)
        await client.query(`
          INSERT INTO races (race_id, meeting_id, name, race_number, start_time, status)
          VALUES ('TEST-RACE-CASCADE', 'TEST-CASCADE-01', 'Test Race', 1, NOW(), 'open')
        `)
        await client.query(`DELETE FROM meetings WHERE meeting_id = 'TEST-CASCADE-01'`)
        const result = await client.query(
          `SELECT * FROM races WHERE race_id = 'TEST-RACE-CASCADE'`
        )
        expect(result.rows.length).toBe(0)
        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    })
  })

  describe('CHECK Constraints', () => {
    it('should enforce race_type CHECK constraint', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await expect(
          client.query(`
            INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
            VALUES ('TEST-CHECK-01', 'Test', 'NZ', 'invalid_type', '2025-10-06', 'active')
          `)
        ).rejects.toThrow()
        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    })

    it('should enforce status CHECK constraint on meetings', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await expect(
          client.query(`
            INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
            VALUES ('TEST-CHECK-02', 'Test', 'NZ', 'thoroughbred', '2025-10-06', 'invalid_status')
          `)
        ).rejects.toThrow()
        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    })
  })

  describe('Timestamp Fields', () => {
    it('should use TIMESTAMPTZ for timestamp fields', async () => {
      const result = await pool.query<{
        // eslint-disable-next-line @typescript-eslint/naming-convention
        column_name: string
        // eslint-disable-next-line @typescript-eslint/naming-convention
        data_type: string
      }>(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'meetings'
        AND column_name IN ('created_at', 'updated_at')
      `)
      expect(result.rows).toHaveLength(2)
      result.rows.forEach((row) => {
        expect(row.data_type).toBe('timestamp with time zone')
      })
    })

    it('should auto-populate created_at and updated_at', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(`
          INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
          VALUES ('TEST-TS-01', 'Test', 'NZ', 'thoroughbred', '2025-10-06', 'active')
        `)
        const result = await client.query<{
          // eslint-disable-next-line @typescript-eslint/naming-convention
          created_at: Date
          // eslint-disable-next-line @typescript-eslint/naming-convention
          updated_at: Date
        }>(
          `SELECT created_at, updated_at FROM meetings WHERE meeting_id = 'TEST-TS-01'`
        )
        expect(result.rows[0]?.created_at).toBeTruthy()
        expect(result.rows[0]?.updated_at).toBeTruthy()
        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    })
  })

  describe('Update Triggers', () => {
    it('should auto-update updated_at timestamp on meetings', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // Insert with explicit created_at in the past
        await client.query(`
          INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status, created_at, updated_at)
          VALUES ('TEST-TRIGGER-01', 'Test', 'NZ', 'thoroughbred', '2025-10-06', 'active',
                  NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour')
        `)

        // Update the record - trigger should set updated_at to NOW()
        await client.query(
          `UPDATE meetings SET status = 'completed' WHERE meeting_id = 'TEST-TRIGGER-01'`
        )

        const result = await client.query<{
          // eslint-disable-next-line @typescript-eslint/naming-convention
          created_at: Date
          // eslint-disable-next-line @typescript-eslint/naming-convention
          updated_at: Date
        }>(
          `SELECT created_at, updated_at FROM meetings WHERE meeting_id = 'TEST-TRIGGER-01'`
        )
        const createdAt = new Date(result.rows[0]?.created_at ?? '')
        const updatedAt = new Date(result.rows[0]?.updated_at ?? '')
        expect(updatedAt.getTime()).toBeGreaterThan(createdAt.getTime())
        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    })

    it('should auto-update last_updated timestamp on race_pools', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // Create test meeting and race first
        await client.query(`
          INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
          VALUES ('TEST-POOL-01', 'Test', 'NZ', 'thoroughbred', '2025-10-06', 'active')
        `)
        await client.query(`
          INSERT INTO races (race_id, meeting_id, name, race_number, start_time, status)
          VALUES ('TEST-RACE-POOL-01', 'TEST-POOL-01', 'Test Race', 1, NOW(), 'open')
        `)

        // Insert race_pool with last_updated in the past
        await client.query(`
          INSERT INTO race_pools (race_id, win_pool_total, place_pool_total, quinella_pool_total, trifecta_pool_total, last_updated)
          VALUES ('TEST-RACE-POOL-01', 1000.00, 500.00, 300.00, 200.00, NOW() - INTERVAL '1 hour')
        `)

        // Update the record - trigger should set last_updated to NOW()
        await client.query(
          `UPDATE race_pools SET win_pool_total = 2000.00 WHERE race_id = 'TEST-RACE-POOL-01'`
        )

        const result = await client.query<{
          // eslint-disable-next-line @typescript-eslint/naming-convention
          last_updated: Date
          // eslint-disable-next-line @typescript-eslint/naming-convention
          win_pool_total: string
        }>(
          `SELECT last_updated, win_pool_total FROM race_pools WHERE race_id = 'TEST-RACE-POOL-01'`
        )

        // Verify the trigger updated last_updated
        const lastUpdated = new Date(result.rows[0]?.last_updated ?? '')
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
        expect(lastUpdated.getTime()).toBeGreaterThan(oneHourAgo.getTime())
        expect(result.rows[0]?.win_pool_total).toBe('2000.00')
        await client.query('ROLLBACK')
      } finally {
        client.release()
      }
    })
  })
})
