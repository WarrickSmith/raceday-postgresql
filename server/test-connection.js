import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const testConnection = async () => {
  try {
    // Test basic connectivity
    const result = await pool.query('SELECT 1 as test')
    console.log('✅ Database connection successful:', result.rows[0])

    // Verify PostgreSQL version
    const versionResult = await pool.query('SELECT version()')
    console.log('✅ PostgreSQL version:', versionResult.rows[0].version)

    // Check for pgAgent extension
    const pgAgentCheck = await pool.query(
      "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pgagent') as pgagent_installed"
    )
    console.log('✅ pgAgent installed:', pgAgentCheck.rows[0].pgagent_installed)

    await pool.end()
    process.exit(0)
  } catch (error) {
    console.error('❌ Database connection failed:', error.message)
    process.exit(1)
  }
}

testConnection()
