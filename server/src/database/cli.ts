import { executeMigrations } from './run-migrations.js'

// CLI wrapper for migration execution
// Handles process.exit for command-line usage
const main = async (): Promise<void> => {
  try {
    await executeMigrations()
    process.exit(0)
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

await main()
