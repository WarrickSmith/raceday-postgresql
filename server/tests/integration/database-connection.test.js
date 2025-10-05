import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import 'dotenv/config'

const { Pool } = pg

describe('Database Connection Tests', () => {
  let pool

  beforeAll(() => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    })
  })

  afterAll(async () => {
    await pool.end()
  })

  it('should connect to PostgreSQL database', async () => {
    const result = await pool.query('SELECT 1 as test')
    expect(result.rows[0]).toEqual({ test: 1 })
  })

  it('should verify PostgreSQL version is 18', async () => {
    const result = await pool.query('SHOW server_version')
    const version = result.rows[0].server_version
    expect(version).toMatch(/^18\./)
  })

  it('should verify pgAgent extension is installed', async () => {
    const result = await pool.query(
      "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pgagent') as pgagent_installed"
    )
    expect(result.rows[0].pgagent_installed).toBe(true)
  })

  it('should successfully execute queries with parameters', async () => {
    const testValue = 'test-race-123'
    const result = await pool.query('SELECT $1::text as race_id', [testValue])
    expect(result.rows[0].race_id).toBe(testValue)
  })

  it('should handle connection pool correctly', async () => {
    const queries = Array.from({ length: 5 }, (_, i) =>
      pool.query('SELECT $1::int as number', [i])
    )
    const results = await Promise.all(queries)

    expect(results).toHaveLength(5)
    results.forEach((result, index) => {
      expect(result.rows[0].number).toBe(index)
    })
  })

  it('should verify database accepts UTF-8 encoding', async () => {
    const result = await pool.query('SHOW server_encoding')
    expect(result.rows[0].server_encoding).toBe('UTF8')
  })

  it('should verify timezone is set', async () => {
    const result = await pool.query('SHOW timezone')
    const timezone = result.rows[0]?.timezone || result.rows[0]?.TimeZone
    expect(timezone).toBeTruthy()
  })
})
