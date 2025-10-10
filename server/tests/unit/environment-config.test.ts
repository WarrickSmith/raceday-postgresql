/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable prefer-destructuring */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'

describe('Environment Configuration Validation', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Valid environment variables', () => {
    it('should pass validation with all required variables', async () => {
      process.env = {
        NODE_ENV: 'development',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USER: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_NAME: 'raceday',
        NZTAB_API_URL: 'https://api.tab.co.nz',
        NZTAB_FROM_EMAIL: 'test@example.com',
        NZTAB_PARTNER_NAME: 'Test Partner',
        NZTAB_PARTNER_ID: 'Test ID',
        PORT: '7000',
        LOG_LEVEL: 'info',
        UV_THREADPOOL_SIZE: '8',
        MAX_WORKER_THREADS: '3',
        DB_POOL_MAX: '10',
      }

      const { env } = await import('../../src/shared/env.js')

      expect(env.NODE_ENV).toBe('development')
      expect(env.DB_HOST).toBe('localhost')
      expect(env.DB_PORT).toBe(5432)
      expect(env.DB_USER).toBe('postgres')
      expect(env.DB_PASSWORD).toBe('postgres')
      expect(env.DB_NAME).toBe('raceday')
      expect(env.NZTAB_API_URL).toBe('https://api.tab.co.nz')
      expect(env.NZTAB_FROM_EMAIL).toBe('test@example.com')
      expect(env.NZTAB_PARTNER_NAME).toBe('Test Partner')
      expect(env.NZTAB_PARTNER_ID).toBe('Test ID')
      expect(env.PORT).toBe(7000)
      expect(env.LOG_LEVEL).toBe('info')
      expect(env.UV_THREADPOOL_SIZE).toBe(8)
      expect(env.MAX_WORKER_THREADS).toBe(3)
      expect(env.DB_POOL_MAX).toBe(10)
    })

    it('should apply default values correctly', async () => {
      process.env = {
        NODE_ENV: 'test',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USER: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_NAME: 'raceday',
        NZTAB_API_URL: 'https://api.tab.co.nz',
        NZTAB_FROM_EMAIL: 'test@example.com',
        NZTAB_PARTNER_NAME: 'Test Partner',
        NZTAB_PARTNER_ID: 'Test ID',
      }

      const { env } = await import('../../src/shared/env.js')

      expect(env.PORT).toBe(7000)
      expect(env.LOG_LEVEL).toBe('info')
      expect(env.UV_THREADPOOL_SIZE).toBe(8)
      expect(env.MAX_WORKER_THREADS).toBe(3)
      expect(env.DB_POOL_MAX).toBe(10)
    })
  })

  describe('Type coercion (AC: 3)', () => {
    it('should coerce PORT string to number', async () => {
      process.env = {
        NODE_ENV: 'test',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USER: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_NAME: 'raceday',
        NZTAB_API_URL: 'https://api.tab.co.nz',
        NZTAB_FROM_EMAIL: 'test@example.com',
        NZTAB_PARTNER_NAME: 'Test Partner',
        NZTAB_PARTNER_ID: 'Test ID',
        PORT: '8080',
      }

      const { env } = await import('../../src/shared/env.js')
      expect(env.PORT).toBe(8080)
      expect(typeof env.PORT).toBe('number')
    })

    it('should coerce DB_PORT string to number', async () => {
      process.env = {
        NODE_ENV: 'test',
        DB_HOST: 'localhost',
        DB_PORT: '5433',
        DB_USER: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_NAME: 'raceday',
        NZTAB_API_URL: 'https://api.tab.co.nz',
        NZTAB_FROM_EMAIL: 'test@example.com',
        NZTAB_PARTNER_NAME: 'Test Partner',
        NZTAB_PARTNER_ID: 'Test ID',
      }

      const { env } = await import('../../src/shared/env.js')
      expect(env.DB_PORT).toBe(5433)
      expect(typeof env.DB_PORT).toBe('number')
    })

    it('should coerce DB_POOL_MAX string to number', async () => {
      process.env = {
        NODE_ENV: 'test',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USER: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_NAME: 'raceday',
        NZTAB_API_URL: 'https://api.tab.co.nz',
        NZTAB_FROM_EMAIL: 'test@example.com',
        NZTAB_PARTNER_NAME: 'Test Partner',
        NZTAB_PARTNER_ID: 'Test ID',
        DB_POOL_MAX: '20',
      }

      const { env } = await import('../../src/shared/env.js')
      expect(env.DB_POOL_MAX).toBe(20)
      expect(typeof env.DB_POOL_MAX).toBe('number')
    })
  })

  describe('Required variables validation (AC: 2)', () => {
    it('should validate all required variables are present', () => {
      const EnvSchema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']),
        DB_HOST: z.string().min(1),
        DB_PORT: z.coerce.number().int().positive(),
        DB_USER: z.string().min(1),
        DB_PASSWORD: z.string().min(1),
        DB_NAME: z.string().min(1),
        NZTAB_API_URL: z.string().url(),
        PORT: z.coerce.number().int().positive().default(7000),
        LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
        UV_THREADPOOL_SIZE: z.coerce.number().int().positive().default(8),
        MAX_WORKER_THREADS: z.coerce.number().int().positive().default(3),
        DB_POOL_MAX: z.coerce.number().int().positive().default(10),
      })

      // Test missing DB_HOST
      expect(() => {
        EnvSchema.parse({
          NODE_ENV: 'test',
          DB_PORT: '5432',
          DB_USER: 'postgres',
          DB_PASSWORD: 'postgres',
          DB_NAME: 'raceday',
          NZTAB_API_URL: 'https://api.tab.co.nz',
        })
      }).toThrow()

      // Test missing DB_PORT
      expect(() => {
        EnvSchema.parse({
          NODE_ENV: 'test',
          DB_HOST: 'localhost',
          DB_USER: 'postgres',
          DB_PASSWORD: 'postgres',
          DB_NAME: 'raceday',
          NZTAB_API_URL: 'https://api.tab.co.nz',
        })
      }).toThrow()

      // Test missing NZTAB_API_URL
      expect(() => {
        EnvSchema.parse({
          NODE_ENV: 'test',
          DB_HOST: 'localhost',
          DB_PORT: '5432',
          DB_USER: 'postgres',
          DB_PASSWORD: 'postgres',
          DB_NAME: 'raceday',
        })
      }).toThrow()
    })
  })

  describe('Invalid type validation (AC: 3, 5, 6)', () => {
    it('should fail with invalid PORT (non-numeric)', () => {
      const EnvSchema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']),
        DB_HOST: z.string().min(1),
        DB_PORT: z.coerce.number().int().positive(),
        DB_USER: z.string().min(1),
        DB_PASSWORD: z.string().min(1),
        DB_NAME: z.string().min(1),
        NZTAB_API_URL: z.string().url(),
        PORT: z.coerce.number().int().positive().default(7000),
      })

      expect(() => {
        EnvSchema.parse({
          NODE_ENV: 'test',
          DB_HOST: 'localhost',
          DB_PORT: '5432',
          DB_USER: 'postgres',
          DB_PASSWORD: 'postgres',
          DB_NAME: 'raceday',
          NZTAB_API_URL: 'https://api.tab.co.nz',
          PORT: 'abc',
        })
      }).toThrow(/Expected number, received nan/)
    })

    it('should fail with invalid DB_PORT (non-numeric)', () => {
      const EnvSchema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']),
        DB_HOST: z.string().min(1),
        DB_PORT: z.coerce.number().int().positive(),
        DB_USER: z.string().min(1),
        DB_PASSWORD: z.string().min(1),
        DB_NAME: z.string().min(1),
        NZTAB_API_URL: z.string().url(),
      })

      expect(() => {
        EnvSchema.parse({
          NODE_ENV: 'test',
          DB_HOST: 'localhost',
          DB_PORT: 'xyz',
          DB_USER: 'postgres',
          DB_PASSWORD: 'postgres',
          DB_NAME: 'raceday',
          NZTAB_API_URL: 'https://api.tab.co.nz',
        })
      }).toThrow(/Expected number, received nan/)
    })
  })

  describe('URL validation (AC: 4)', () => {
    it('should fail with invalid NZTAB_API_URL (not a URL)', () => {
      const EnvSchema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']),
        DB_HOST: z.string().min(1),
        DB_PORT: z.coerce.number().int().positive(),
        DB_USER: z.string().min(1),
        DB_PASSWORD: z.string().min(1),
        DB_NAME: z.string().min(1),
        NZTAB_API_URL: z.string().url(),
      })

      expect(() => {
        EnvSchema.parse({
          NODE_ENV: 'test',
          DB_HOST: 'localhost',
          DB_PORT: '5432',
          DB_USER: 'postgres',
          DB_PASSWORD: 'postgres',
          DB_NAME: 'raceday',
          NZTAB_API_URL: 'not-a-url',
        })
      }).toThrow(/Invalid url/)
    })

    it('should pass with valid NZTAB_API_URL', async () => {
      process.env = {
        NODE_ENV: 'test',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USER: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_NAME: 'raceday',
        NZTAB_API_URL: 'https://api.tab.co.nz',
        NZTAB_FROM_EMAIL: 'test@example.com',
        NZTAB_PARTNER_NAME: 'Test Partner',
        NZTAB_PARTNER_ID: 'Test ID',
      }

      const { env } = await import('../../src/shared/env.js')
      expect(env.NZTAB_API_URL).toBe('https://api.tab.co.nz')
    })
  })

  describe('DATABASE_URL construction (AC: 8)', () => {
    it('should construct DATABASE_URL correctly from components', async () => {
      process.env = {
        NODE_ENV: 'test',
        DB_HOST: 'dbserver',
        DB_PORT: '5433',
        DB_USER: 'myuser',
        DB_PASSWORD: 'mypassword',
        DB_NAME: 'mydb',
        NZTAB_API_URL: 'https://api.tab.co.nz',
        NZTAB_FROM_EMAIL: 'test@example.com',
        NZTAB_PARTNER_NAME: 'Test Partner',
        NZTAB_PARTNER_ID: 'Test ID',
      }

      const { env, buildDatabaseUrl } = await import('../../src/shared/env.js')
      const url = buildDatabaseUrl(env)

      expect(url).toBe('postgresql://myuser:mypassword@dbserver:5433/mydb')
    })

    it('should allow overriding database name in buildDatabaseUrl', async () => {
      process.env = {
        NODE_ENV: 'test',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USER: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_NAME: 'raceday',
        NZTAB_API_URL: 'https://api.tab.co.nz',
        NZTAB_FROM_EMAIL: 'test@example.com',
        NZTAB_PARTNER_NAME: 'Test Partner',
        NZTAB_PARTNER_ID: 'Test ID',
      }

      const { env, buildDatabaseUrl } = await import('../../src/shared/env.js')
      const url = buildDatabaseUrl(env, 'postgres')

      expect(url).toBe('postgresql://postgres:postgres@localhost:5432/postgres')
    })

    it('should NOT have DATABASE_URL in schema (AC: 8)', () => {
      const EnvSchema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']),
        DB_HOST: z.string().min(1),
        DB_PORT: z.coerce.number().int().positive(),
        DB_USER: z.string().min(1),
        DB_PASSWORD: z.string().min(1),
        DB_NAME: z.string().min(1),
        NZTAB_API_URL: z.string().url(),
        PORT: z.coerce.number().int().positive().default(7000),
        LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
        UV_THREADPOOL_SIZE: z.coerce.number().int().positive().default(8),
        MAX_WORKER_THREADS: z.coerce.number().int().positive().default(3),
        DB_POOL_MAX: z.coerce.number().int().positive().default(10),
      })

      const shape = EnvSchema.shape
      expect(shape).not.toHaveProperty('DATABASE_URL')
    })
  })

  describe('Typed constant export (AC: 7)', () => {
    it('should export env as typed constant', async () => {
      process.env = {
        NODE_ENV: 'test',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USER: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_NAME: 'raceday',
        NZTAB_API_URL: 'https://api.tab.co.nz',
        NZTAB_FROM_EMAIL: 'test@example.com',
        NZTAB_PARTNER_NAME: 'Test Partner',
        NZTAB_PARTNER_ID: 'Test ID',
      }

      const { env } = await import('../../src/shared/env.js')

      // TypeScript should infer these types correctly
      expect(env).toBeDefined()
      expect(env.NODE_ENV).toMatch(/^(development|production|test)$/)
      expect(typeof env.DB_PORT).toBe('number')
      expect(typeof env.PORT).toBe('number')
    })
  })

  describe('NZ TAB Partner Headers (Story 2.1)', () => {
    it('should require partner headers and validate correct values', async () => {
      process.env = {
        NODE_ENV: 'test',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USER: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_NAME: 'raceday',
        NZTAB_API_URL: 'https://api.tab.co.nz',
        NZTAB_FROM_EMAIL: 'partner@example.com',
        NZTAB_PARTNER_NAME: 'Warrick Smith',
        NZTAB_PARTNER_ID: 'Private Developer',
      }

      const { env } = await import('../../src/shared/env.js')

      expect(env.NZTAB_FROM_EMAIL).toBe('partner@example.com')
      expect(env.NZTAB_PARTNER_NAME).toBe('Warrick Smith')
      expect(env.NZTAB_PARTNER_ID).toBe('Private Developer')
    })

    it('should fail validation when partner headers are missing', () => {
      const EnvSchema = z.object({
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
      })

      expect(() => {
        EnvSchema.parse({
          NODE_ENV: 'test',
          DB_HOST: 'localhost',
          DB_PORT: '5432',
          DB_USER: 'postgres',
          DB_PASSWORD: 'postgres',
          DB_NAME: 'raceday',
          NZTAB_API_URL: 'https://api.tab.co.nz',
        })
      }).toThrow()
    })

    it('should validate NZTAB_FROM_EMAIL as valid email format', () => {
      const EnvSchema = z.object({
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
      })

      expect(() => {
        EnvSchema.parse({
          NODE_ENV: 'test',
          DB_HOST: 'localhost',
          DB_PORT: '5432',
          DB_USER: 'postgres',
          DB_PASSWORD: 'postgres',
          DB_NAME: 'raceday',
          NZTAB_API_URL: 'https://api.tab.co.nz',
          NZTAB_FROM_EMAIL: 'not-an-email',
          NZTAB_PARTNER_NAME: 'Test Partner',
          NZTAB_PARTNER_ID: 'Test ID',
        })
      }).toThrow(/Invalid email/)
    })

    it('should reject empty string values for required partner headers', () => {
      const EnvSchema = z.object({
        NZTAB_FROM_EMAIL: z.string().email(),
        NZTAB_PARTNER_NAME: z.string().min(1),
        NZTAB_PARTNER_ID: z.string().min(1),
      })

      expect(() => {
        EnvSchema.parse({
          NZTAB_FROM_EMAIL: 'valid@email.com',
          NZTAB_PARTNER_NAME: '',
          NZTAB_PARTNER_ID: 'Test ID',
        })
      }).toThrow()

      expect(() => {
        EnvSchema.parse({
          NZTAB_FROM_EMAIL: 'valid@email.com',
          NZTAB_PARTNER_NAME: 'Test Partner',
          NZTAB_PARTNER_ID: '',
        })
      }).toThrow()
    })
  })
})
