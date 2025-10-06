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

describe('Database Connection Tests', () => {
  let pool: Pool

  beforeAll(() => {
    pool = new Pool({
      connectionString: buildDatabaseUrl(),
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
    const result = await pool.query<{
      // eslint-disable-next-line @typescript-eslint/naming-convention
      server_version: string
    }>('SHOW server_version')
    const version = result.rows[0]?.server_version
    expect(version).toMatch(/^18\./)
  })

  it('should verify pgAgent extension is installed', async () => {
    const result = await pool.query<{
      // eslint-disable-next-line @typescript-eslint/naming-convention
      pgagent_installed: boolean
    }>(
      "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pgagent') as pgagent_installed"
    )
    expect(result.rows[0]?.pgagent_installed).toBe(true)
  })

  it('should successfully execute queries with parameters', async () => {
    const testValue = 'test-race-123'
    const result = await pool.query<{
      // eslint-disable-next-line @typescript-eslint/naming-convention
      race_id: string
    }>('SELECT $1::text as race_id', [testValue])
    expect(result.rows[0]?.race_id).toBe(testValue)
  })

  it('should handle connection pool correctly', async () => {
    const queries = Array.from({ length: 5 }, (_item: unknown, i: number) =>
      pool.query<{ number: number }>('SELECT $1::int as number', [i])
    )
    const results = await Promise.all(queries)

    expect(results).toHaveLength(5)
    results.forEach((result, index) => {
      expect(result.rows[0]?.number).toBe(index)
    })
  })

  it('should verify database accepts UTF-8 encoding', async () => {
    const result = await pool.query<{
      // eslint-disable-next-line @typescript-eslint/naming-convention
      server_encoding: string
    }>('SHOW server_encoding')
    expect(result.rows[0]?.server_encoding).toBe('UTF8')
  })

  it('should verify timezone is set', async () => {
    const result = await pool.query<{
      timezone?: string
      // eslint-disable-next-line @typescript-eslint/naming-convention
      TimeZone?: string
    }>('SHOW timezone')
    const timezone = result.rows[0]?.timezone ?? result.rows[0]?.TimeZone
    expect(timezone).toBeTruthy()
  })
})
