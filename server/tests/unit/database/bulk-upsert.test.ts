/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PoolClient } from 'pg'
import {
  bulkUpsertMeetings,
  bulkUpsertRaces,
  bulkUpsertEntrants,
  withTransaction,
} from '../../../src/database/bulk-upsert.js'
import type {
  TransformedMeeting,
  TransformedEntrant,
} from '../../../src/workers/messages.js'

// Mock the pool module
vi.mock('../../../src/database/pool.js', () => ({
  pool: {
    connect: vi.fn(),
  },
}))

// Mock the logger
vi.mock('../../../src/shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('bulk-upsert', () => {
  let mockClient: Partial<PoolClient>
  let mockQuery: ReturnType<typeof vi.fn>
  let mockRelease: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const { pool } = await import('../../../src/database/pool.js')

    mockQuery = vi.fn()
    mockRelease = vi.fn()

    mockClient = {
      query: mockQuery,
      release: mockRelease,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(pool.connect).mockResolvedValue(mockClient as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('withTransaction', () => {
    it('should execute work within BEGIN/COMMIT transaction', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const work = vi.fn().mockResolvedValue('success')
      const result = await withTransaction(work)

      expect(result).toBe('success')
      expect(mockQuery).toHaveBeenCalledWith('BEGIN')
      expect(mockQuery).toHaveBeenCalledWith('COMMIT')
      expect(work).toHaveBeenCalledWith(mockClient)
      expect(mockRelease).toHaveBeenCalled()
    })

    it('should rollback and release on error', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const work = vi.fn().mockRejectedValue(new Error('Test error'))

      await expect(withTransaction(work)).rejects.toThrow('Test error')

      expect(mockQuery).toHaveBeenCalledWith('BEGIN')
      expect(mockQuery).toHaveBeenCalledWith('ROLLBACK')
      expect(mockQuery).not.toHaveBeenCalledWith('COMMIT')
      expect(mockRelease).toHaveBeenCalled()
    })

    it('should release connection even if rollback fails', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockRejectedValueOnce(new Error('Rollback failed')) // ROLLBACK

      const work = vi.fn().mockRejectedValue(new Error('Work failed'))

      // When rollback fails, the rollback error is thrown instead
      await expect(withTransaction(work)).rejects.toThrow('Rollback failed')
      expect(mockRelease).toHaveBeenCalled()
    })
  })

  describe('bulkUpsertMeetings', () => {
    it('should return zero metrics for empty array', async () => {
      const result = await bulkUpsertMeetings([])
      expect(result).toEqual({ rowCount: 0, duration: 0 })
    })

    it('should generate correct multi-row INSERT SQL with parameterized values', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 2 })

      const meetings: TransformedMeeting[] = [
        {
          meeting_id: 'M1',
          name: 'Ellerslie',
          country: 'NZ',
          category: 'thoroughbred',
          date: '2025-10-12',
          track_condition: 'Good',
          tote_status: 'open',
        },
        {
          meeting_id: 'M2',
          name: 'Addington',
          country: 'NZ',
          category: 'harness',
          date: '2025-10-12',
          track_condition: null,
          tote_status: null,
        },
      ]

      await bulkUpsertMeetings(meetings)

      // Verify BEGIN, INSERT, COMMIT were called
      expect(mockQuery).toHaveBeenCalledWith('BEGIN')
      expect(mockQuery).toHaveBeenCalledWith('COMMIT')

      // Find the INSERT query call
      const insertCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('INSERT INTO meetings')
      )
      expect(insertCall).toBeDefined()

      const [sql, values] = insertCall ?? []

      // Verify SQL structure
      expect(sql).toContain('INSERT INTO meetings')
      expect(sql).toContain('ON CONFLICT (meeting_id) DO UPDATE SET')
      expect(sql).toContain('IS DISTINCT FROM')
      expect(sql).toMatch(/\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8/)
      expect(sql).toMatch(/\$9, \$10, \$11, \$12, \$13, \$14, \$15, \$16/)

      // Verify parameterized values (8 fields per meeting including status)
      expect(values).toEqual([
        'M1', 'Ellerslie', 'NZ', 'thoroughbred', '2025-10-12', 'Good', 'open', 'active',
        'M2', 'Addington', 'NZ', 'harness', '2025-10-12', null, null, 'active',
      ])
    })

    it('should use IS DISTINCT FROM for change detection (AC4)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const meetings: TransformedMeeting[] = [
        {
          meeting_id: 'M1',
          name: 'Ellerslie',
          country: 'NZ',
          category: 'thoroughbred',
          date: '2025-10-12',
          track_condition: 'Good',
          tote_status: 'open',
        },
      ]

      await bulkUpsertMeetings(meetings)

      const insertCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('INSERT INTO meetings')
      )
      const [sql] = insertCall ?? []

      // Verify WHERE clause with IS DISTINCT FROM predicates
      expect(sql).toContain('WHERE')
      expect(sql).toContain('meetings.meeting_name IS DISTINCT FROM EXCLUDED.meeting_name')
      expect(sql).toContain('meetings.country IS DISTINCT FROM EXCLUDED.country')
      expect(sql).toContain('meetings.track_condition IS DISTINCT FROM EXCLUDED.track_condition')
    })

    it('should return duration metrics and row count', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 3 })

      const meetings: TransformedMeeting[] = [
        {
          meeting_id: 'M1',
          name: 'Ellerslie',
          country: 'NZ',
          category: 'thoroughbred',
          date: '2025-10-12',
        },
      ]

      const result = await bulkUpsertMeetings(meetings)

      expect(result.rowCount).toBe(3)
      expect(result.duration).toBeGreaterThanOrEqual(0)
      expect(typeof result.duration).toBe('number')
    })
  })

  describe('bulkUpsertRaces', () => {
    it('should return zero metrics for empty array', async () => {
      const result = await bulkUpsertRaces([])
      expect(result).toEqual({ rowCount: 0, duration: 0 })
    })

    it('should generate correct multi-row INSERT SQL with timestamp handling', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 })

      const races = [
        {
          race_id: 'R1',
          name: 'Race 1',
          status: 'open' as const,
          race_number: 1,
          race_date_nz: '2025-10-12',
          start_time_nz: '14:30',
          meeting_id: 'M1',
        },
      ]

      await bulkUpsertRaces(races)

      const insertCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('INSERT INTO races')
      )
      expect(insertCall).toBeDefined()

      const [sql, values] = insertCall ?? []

      expect(sql).toContain('INSERT INTO races')
      expect(sql).toContain('ON CONFLICT (race_id) DO UPDATE SET')
      expect(sql).toContain('IS DISTINCT FROM')

      // Verify timestamp combination
      expect(values).toContain('2025-10-12T14:30:00Z')
    })

    it('should include IS DISTINCT FROM for all race fields (AC4)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const races = [
        {
          race_id: 'R1',
          name: 'Race 1',
          status: 'open' as const,
          race_number: 1,
          race_date_nz: '2025-10-12',
          start_time_nz: '14:30',
          meeting_id: 'M1',
        },
      ]

      await bulkUpsertRaces(races)

      const insertCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('INSERT INTO races')
      )
      const [sql] = insertCall ?? []

      expect(sql).toContain('races.status IS DISTINCT FROM EXCLUDED.status')
      expect(sql).toContain('races.race_number IS DISTINCT FROM EXCLUDED.race_number')
      expect(sql).toContain('races.start_time IS DISTINCT FROM EXCLUDED.start_time')
    })
  })

  describe('bulkUpsertEntrants', () => {
    it('should return zero metrics for empty array', async () => {
      const result = await bulkUpsertEntrants([])
      expect(result).toEqual({ rowCount: 0, duration: 0 })
    })

    it('should persist all Story 2.4 money-flow fields without loss (AC3)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 })

      const entrants: TransformedEntrant[] = [
        {
          entrant_id: 'E1',
          race_id: 'R1',
          runner_number: 1,
          name: 'Horse One',
          barrier: 3,
          is_scratched: false,
          is_late_scratched: false,
          fixed_win_odds: 3.50,
          fixed_place_odds: 1.80,
          pool_win_odds: 3.45,
          pool_place_odds: 1.75,
          hold_percentage: 15.5,
          bet_percentage: 12.3,
          win_pool_percentage: 22.1,
          place_pool_percentage: 18.5,
          win_pool_amount: 150000,
          place_pool_amount: 80000,
          jockey: 'J. Smith',
          trainer_name: 'T. Jones',
          silk_colours: 'Red, White',
          favourite: true,
          mover: false,
        },
      ]

      await bulkUpsertEntrants(entrants)

      const insertCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('INSERT INTO entrants')
      )
      expect(insertCall).toBeDefined()

      const [sql, values] = insertCall ?? []

      // Verify all money-flow fields are included in SQL
      expect(sql).toContain('hold_percentage')
      expect(sql).toContain('bet_percentage')
      expect(sql).toContain('win_pool_percentage')
      expect(sql).toContain('place_pool_percentage')
      expect(sql).toContain('win_pool_amount')
      expect(sql).toContain('place_pool_amount')

      // Verify all values are passed
      expect(values).toContain(15.5) // hold_percentage
      expect(values).toContain(12.3) // bet_percentage
      expect(values).toContain(22.1) // win_pool_percentage
      expect(values).toContain(18.5) // place_pool_percentage
      expect(values).toContain(150000) // win_pool_amount
      expect(values).toContain(80000) // place_pool_amount
    })

    it('should handle null money-flow fields gracefully', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 })

      const entrants: TransformedEntrant[] = [
        {
          entrant_id: 'E1',
          race_id: 'R1',
          runner_number: 1,
          name: 'Horse One',
          barrier: null,
          is_scratched: true,
          hold_percentage: null,
          bet_percentage: null,
          win_pool_percentage: null,
          place_pool_percentage: null,
          win_pool_amount: null,
          place_pool_amount: null,
        },
      ]

      await bulkUpsertEntrants(entrants)

      const insertCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('INSERT INTO entrants')
      )
      const [, values] = insertCall ?? []

      // Verify null values are preserved
      expect(values).toContain(null)
    })

    it('should use IS DISTINCT FROM for all entrant fields (AC4)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const entrants: TransformedEntrant[] = [
        {
          entrant_id: 'E1',
          race_id: 'R1',
          runner_number: 1,
          name: 'Horse One',
          is_scratched: false,
        },
      ]

      await bulkUpsertEntrants(entrants)

      const insertCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('INSERT INTO entrants')
      )
      const [sql] = insertCall ?? []

      // Verify comprehensive change detection
      expect(sql).toContain('entrants.hold_percentage IS DISTINCT FROM EXCLUDED.hold_percentage')
      expect(sql).toContain('entrants.win_pool_amount IS DISTINCT FROM EXCLUDED.win_pool_amount')
      expect(sql).toContain('entrants.is_scratched IS DISTINCT FROM EXCLUDED.is_scratched')
    })

    it('should build correct parameterized query for multiple entrants', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 2 })

      const entrants: TransformedEntrant[] = [
        {
          entrant_id: 'E1',
          race_id: 'R1',
          runner_number: 1,
          name: 'Horse One',
          is_scratched: false,
        },
        {
          entrant_id: 'E2',
          race_id: 'R1',
          runner_number: 2,
          name: 'Horse Two',
          is_scratched: false,
        },
      ]

      await bulkUpsertEntrants(entrants)

      const insertCall = mockQuery.mock.calls.find((call) =>
        String(call[0]).includes('INSERT INTO entrants')
      )
      const [sql, values] = insertCall ?? []

      // Verify multi-row VALUES clause
      expect(sql).toMatch(/VALUES.*,.*\(/) // Should have multiple value rows

      // Verify parameter indices increment correctly
      // First entrant uses $1-$21 (21 fields), second entrant starts at $22
      expect(sql).toContain('$1')
      expect(sql).toContain('$21') // First entrant last param
      expect(sql).toContain('$22') // Second entrant first param

      // Verify all entrant data is in values array
      expect(values).toContain('E1')
      expect(values).toContain('E2')
      expect(values).toContain('Horse One')
      expect(values).toContain('Horse Two')
    })
  })

  describe('Performance logging (AC7)', () => {
    it('should log duration metrics for all UPSERT operations', async () => {
      const { logger } = await import('../../../src/shared/logger.js')
      mockQuery.mockResolvedValue({ rows: [], rowCount: 5 })

      const meetings: TransformedMeeting[] = [
        {
          meeting_id: 'M1',
          name: 'Ellerslie',
          country: 'NZ',
          category: 'thoroughbred',
          date: '2025-10-12',
        },
      ]

      await bulkUpsertMeetings(meetings)

      // Verify structured log emitted with metrics
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'meetings',
          rowCount: 5,
          write_ms: expect.any(Number),
          overBudget: expect.any(Boolean),
        }),
        'Bulk UPSERT meetings completed'
      )
    })

    it('should emit warning when UPSERT duration >= 300ms (AC7)', async () => {
      const { logger } = await import('../../../src/shared/logger.js')

      // Mock slow query
      mockQuery.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350))
        return { rows: [], rowCount: 1 }
      })

      const meetings: TransformedMeeting[] = [
        {
          meeting_id: 'M1',
          name: 'Ellerslie',
          country: 'NZ',
          category: 'thoroughbred',
          date: '2025-10-12',
        },
      ]

      await bulkUpsertMeetings(meetings)

      // Verify warning log when threshold exceeded
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          duration: expect.any(Number),
          rowCount: 1,
        }),
        'Meetings UPSERT exceeded 300ms threshold'
      )
    })
  })
})
