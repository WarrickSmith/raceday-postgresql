import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 60000, // 60 seconds (database tests can be slow under load)
    hookTimeout: 60000, // 60 seconds for setup/teardown hooks
    globals: true,
    environment: 'node',
    setupFiles: [],
    pool: 'forks', // Use forks instead of threads for better isolation
    poolOptions: {
      forks: {
        singleFork: false, // Allow parallel execution
        isolate: true, // Isolate test files
      },
    },
    // Run tests sequentially to avoid database connection pool exhaustion
    fileParallelism: false,
  },
})
