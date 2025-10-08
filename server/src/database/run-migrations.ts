import { Pool } from 'pg'
import format from 'pg-format'
import { env, buildDatabaseUrl } from '../shared/env.js'
import { runMigrations } from './migrate.js'

const createDatabaseIfNotExists = async (): Promise<void> => {
  const dbName = env.DB_NAME

  // Connect to postgres database to check if target database exists
  const adminPool = new Pool({
    connectionString: buildDatabaseUrl(env, 'postgres'),
  })

  adminPool.on('error', (err) => {
    console.error('Unexpected admin pool error:', err)
    process.exit(1)
  })

  try {
    const result = await adminPool.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) as exists',
      [dbName]
    )

    if (result.rows[0]?.exists === false) {
      console.warn(`Creating database '${dbName}'...`)
      // Use pg-format to safely escape database identifier and prevent SQL injection
      await adminPool.query(format('CREATE DATABASE %I', dbName))
      console.warn(`✅ Database '${dbName}' created successfully`)
    } else {
      console.warn(`Database '${dbName}' already exists`)
    }
  } finally {
    await adminPool.end()
  }
}

export const executeMigrations = async (): Promise<void> => {
  // Create database if it doesn't exist
  await createDatabaseIfNotExists()

  const dbName = env.DB_NAME

  // Connect to the target database and run migrations
  const pool = new Pool({
    connectionString: buildDatabaseUrl(env, dbName),
  })

  pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err)
    throw new Error(`Database pool error: ${err.message}`)
  })

  try {
    console.warn('Starting database migrations...')
    const results = await runMigrations(pool)
    const successCount = results.filter((r) => r.success).length
    console.warn(
      `✅ Completed ${String(successCount)}/${String(results.length)} migrations successfully`
    )
  } finally {
    await pool.end()
  }
}
