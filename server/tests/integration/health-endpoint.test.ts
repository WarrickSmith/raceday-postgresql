import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Server } from 'node:http'
import type { Express } from 'express'
import { createServer } from '../../src/api/server.js'
import { pool } from '../../src/database/pool.js'

describe('Health Endpoint Integration Tests', () => {
  let app: Express
  let server: Server
  const testPort = 7001 // Use different port to avoid conflicts

  beforeAll(() => {
    app = createServer()
    server = app.listen(testPort)
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err?: Error | null) => {
        if (err != null) {
          reject(err)
          return
        }
        resolve()
      })
    })
    await pool.end()
  })

  describe('GET /health - Success Path', () => {
    it('should return 200 OK with correct JSON structure when database is connected', async () => {
      const response = await fetch(`http://localhost:${String(testPort)}/health`)
      const data = (await response.json()) as {
        status: string
        timestamp: string
        database: string
        workers: string
      }

      expect(response.status).toBe(200)
      expect(data.status).toBe('healthy')
      expect(data.database).toBe('connected')
      expect(data.workers).toBe('operational')
      expect(data.timestamp).toBeTruthy()

      // Verify timestamp is valid ISO8601 format
      const timestamp = new Date(data.timestamp)
      expect(timestamp.toISOString()).toBe(data.timestamp)
    })

    it('should include all required fields in response', async () => {
      const response = await fetch(`http://localhost:${String(testPort)}/health`)
      const data = (await response.json()) as Record<string, unknown>

      expect(data).toHaveProperty('status')
      expect(data).toHaveProperty('timestamp')
      expect(data).toHaveProperty('database')
      expect(data).toHaveProperty('workers')
    })

    it('should verify workers field is hardcoded to operational', async () => {
      const response = await fetch(`http://localhost:${String(testPort)}/health`)
      const data = (await response.json()) as { workers: string }

      expect(data.workers).toBe('operational')
    })
  })

  describe('GET /health - Database Connectivity', () => {
    it('should verify database connectivity via pool query', async () => {
      // This test verifies the health check uses the shared pool
      const response = await fetch(`http://localhost:${String(testPort)}/health`)
      const data = (await response.json()) as { database: string }

      expect(response.status).toBe(200)
      expect(data.database).toBe('connected')

      // Verify we can query the database directly using the same pool
      const result = await pool.query<{ test: number }>('SELECT 1 as test')
      expect(result.rows[0]?.test).toBe(1)
    })
  })

  describe('GET /health - Failure Path', () => {
    it('should return 503 when database query fails', async () => {
      // Mock pool.query to simulate database failure
      const originalQuery = pool.query.bind(pool)
      pool.query = vi.fn().mockRejectedValue(new Error('Connection refused'))

      const response = await fetch(`http://localhost:${String(testPort)}/health`)
      const data = (await response.json()) as {
        status: string
        timestamp: string
        error: string
      }

      expect(response.status).toBe(503)
      expect(data.status).toBe('unhealthy')
      expect(data.error).toBeTruthy()
      expect(data.timestamp).toBeTruthy()

      // Verify timestamp is valid ISO8601 format
      const timestamp = new Date(data.timestamp)
      expect(timestamp.toISOString()).toBe(data.timestamp)

      // Restore original query function
      pool.query = originalQuery
    })
  })

  describe('GET /health - Security and Compression', () => {
    it('should include security headers from helmet middleware', async () => {
      const response = await fetch(`http://localhost:${String(testPort)}/health`)

      // Helmet adds several security headers
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(response.headers.get('x-frame-options')).toBeTruthy()
    })

    it('should return JSON content-type', async () => {
      const response = await fetch(`http://localhost:${String(testPort)}/health`)

      expect(response.headers.get('content-type')).toContain('application/json')
    })
  })
})
