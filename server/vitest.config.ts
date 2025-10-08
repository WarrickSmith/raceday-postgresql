import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 60000, // 60 seconds (database tests can be slow under load)
    hookTimeout: 60000, // 60 seconds for setup/teardown hooks
    globals: true,
    environment: 'node',
    setupFiles: [],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true, // Enforce a single worker when running in threads mode
      },
    },
    maxWorkers: 1, // Run using a single worker to keep DB usage predictable
    minWorkers: 1,
    // Run tests sequentially to avoid database connection pool exhaustion
    fileParallelism: false,
  },
})
