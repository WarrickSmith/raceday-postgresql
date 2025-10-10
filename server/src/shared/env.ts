import { config } from 'dotenv'
import { z } from 'zod'

// Load environment variables from .env file
config()

// Zod schema for environment variable validation
/* eslint-disable @typescript-eslint/naming-convention */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  NZTAB_API_URL: z.string().url(),
  NZTAB_FROM_EMAIL: z.string().email(),
  NZTAB_PARTNER_NAME: z.string().min(1),
  NZTAB_PARTNER_ID: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(7000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  UV_THREADPOOL_SIZE: z.coerce.number().int().positive().default(8),
  MAX_WORKER_THREADS: z.coerce.number().int().positive().default(3),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
})
/* eslint-enable @typescript-eslint/naming-convention */

// Infer TypeScript type from schema
export type Env = z.infer<typeof envSchema>

// Validate environment variables using safeParse for better error handling
const result = envSchema.safeParse(process.env)

if (!result.success) {
  // Cannot use logger here due to circular dependency (logger depends on env)
  // Use console.error for environment validation failures
  console.error('Environment validation failed:')
  result.error.errors.forEach((err) => {
    console.error(`  - ${err.path.join('.')}: ${err.message}`)
  })
  process.exit(1)
}

// Export validated environment constant
export const env = result.data

// Build DATABASE_URL from validated components (pure function)
export const buildDatabaseUrl = (envConfig: Env, database?: string): string => {
  const dbName = database ?? envConfig.DB_NAME
  return `postgresql://${envConfig.DB_USER}:${envConfig.DB_PASSWORD}@${envConfig.DB_HOST}:${String(envConfig.DB_PORT)}/${dbName}`
}
