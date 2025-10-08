import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import type { Pool } from 'pg'

interface MigrationResult {
  file: string
  success: boolean
  error?: string
}

export const runMigrations = async (
  pool: Pool
): Promise<MigrationResult[]> => {
  const migrationsDir = join(process.cwd(), 'database', 'migrations')
  const files = await readdir(migrationsDir)
  const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort()

  const results: MigrationResult[] = []

  for (const file of sqlFiles) {
    try {
      const sql = await readFile(join(migrationsDir, file), 'utf-8')
      await pool.query(sql)
      results.push({ file, success: true })
      console.warn(`✅ Migration ${file} executed successfully`)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      results.push({ file, success: false, error: errorMessage })
      console.error(`❌ Migration ${file} failed: ${errorMessage}`)
      throw error // Stop on first failure
    }
  }

  return results
}
