/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { PoolClient } from 'pg'
import {
  shouldInsertOddsRecord,
  filterSignificantOddsChanges,
  populateOddsSnapshotFromDatabase,
  clearOddsSnapshot,
  getOddsSnapshotStats,
} from '../../../src/utils/odds-change-detection.js'
import type { OddsRecord } from '../../../src/database/time-series.js'

// Mock logger
vi.mock('../../../src/shared/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Odds Change Detection', () => {
  beforeEach(() => {
    clearOddsSnapshot()
    vi.clearAllMocks()
  })

  describe('shouldInsertOddsRecord', () => {
    it('inserts first record for new entrant/odds_type combination', () => {
      const record: OddsRecord = {
        entrant_id: 'entrant-1',
        odds: 2.5,
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:00:00.000Z',
      }

      expect(shouldInsertOddsRecord(record)).toBe(true)
    })

    it('inserts record when odds change exceeds threshold', () => {
      const record1: OddsRecord = {
        entrant_id: 'entrant-1',
        odds: 2.5,
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:00:00.000Z',
      }

      const record2: OddsRecord = {
        entrant_id: 'entrant-1',
        odds: 2.52, // 0.02 change > 0.01 threshold
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:05:00.000Z',
      }

      // First record should be inserted
      expect(shouldInsertOddsRecord(record1)).toBe(true)

      // Second record should also be inserted due to significant change
      expect(shouldInsertOddsRecord(record2)).toBe(true)
    })

    it('skips record when odds change is below threshold', () => {
      const record1: OddsRecord = {
        entrant_id: 'entrant-1',
        odds: 2.5,
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:00:00.000Z',
      }

      const record2: OddsRecord = {
        entrant_id: 'entrant-1',
        odds: 2.505, // 0.005 change < 0.01 threshold
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:05:00.000Z',
      }

      // First record should be inserted
      expect(shouldInsertOddsRecord(record1)).toBe(true)

      // Second record should be skipped
      expect(shouldInsertOddsRecord(record2)).toBe(false)
    })

    it('handles different odds types independently', () => {
      const fixedWinRecord: OddsRecord = {
        entrant_id: 'entrant-1',
        odds: 2.5,
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:00:00.000Z',
      }

      const poolWinRecord: OddsRecord = {
        entrant_id: 'entrant-1',
        odds: 3.1,
        type: 'pool_win',
        event_timestamp: '2025-10-14T12:00:00.000Z',
      }

      // Both records should be inserted (different odds types)
      expect(shouldInsertOddsRecord(fixedWinRecord)).toBe(true)
      expect(shouldInsertOddsRecord(poolWinRecord)).toBe(true)
    })

    it('handles different entrants independently', () => {
      const entrant1Record: OddsRecord = {
        entrant_id: 'entrant-1',
        odds: 2.5,
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:00:00.000Z',
      }

      const entrant2Record: OddsRecord = {
        entrant_id: 'entrant-2',
        odds: 2.5,
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:00:00.000Z',
      }

      // Both records should be inserted (different entrants)
      expect(shouldInsertOddsRecord(entrant1Record)).toBe(true)
      expect(shouldInsertOddsRecord(entrant2Record)).toBe(true)
    })

    it('respects custom minimum change threshold', () => {
      const record1: OddsRecord = {
        entrant_id: 'entrant-1',
        odds: 2.5,
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:00:00.000Z',
      }

      const record2: OddsRecord = {
        entrant_id: 'entrant-1',
        odds: 2.55, // 0.05 change
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:05:00.000Z',
      }

      // First record should be inserted
      expect(shouldInsertOddsRecord(record1, 0.1)).toBe(true)

      // Second record should be skipped with higher threshold
      expect(shouldInsertOddsRecord(record2, 0.1)).toBe(false)

      // Second record should be inserted with lower threshold
      expect(shouldInsertOddsRecord(record2, 0.01)).toBe(true)
    })

    it('updates snapshot with latest record when inserted', () => {
      const record1: OddsRecord = {
        entrant_id: 'entrant-1',
        odds: 2.5,
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:00:00.000Z',
      }

      const record2: OddsRecord = {
        entrant_id: 'entrant-1',
        odds: 2.6,
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:05:00.000Z',
      }

      expect(shouldInsertOddsRecord(record1)).toBe(true)
      expect(shouldInsertOddsRecord(record2)).toBe(true)

      const stats = getOddsSnapshotStats()
      expect(stats.totalEntries).toBe(1)
      expect(stats.entrantCount).toBe(1)
      expect(stats.oddsTypes).toEqual(['fixed_win'])
    })
  })

  describe('filterSignificantOddsChanges', () => {
    it('filters records based on change detection', () => {
      const records: OddsRecord[] = [
        {
          entrant_id: 'entrant-1',
          odds: 2.5,
          type: 'fixed_win',
          event_timestamp: '2025-10-14T12:00:00.000Z',
        },
        {
          entrant_id: 'entrant-1',
          odds: 2.505, // Small change
          type: 'fixed_win',
          event_timestamp: '2025-10-14T12:05:00.000Z',
        },
        {
          entrant_id: 'entrant-1',
          odds: 2.52, // Significant change
          type: 'fixed_win',
          event_timestamp: '2025-10-14T12:10:00.000Z',
        },
      ]

      const filtered = filterSignificantOddsChanges(records)

      // Should only include first and third records
      expect(filtered).toHaveLength(2)
      expect(filtered[0]?.odds).toBe(2.5)
      expect(filtered[1]?.odds).toBe(2.52)
    })

    it('returns empty array when no records', () => {
      const filtered = filterSignificantOddsChanges([])
      expect(filtered).toHaveLength(0)
    })

    it('handles multiple entrants and odds types', () => {
      const records: OddsRecord[] = [
        {
          entrant_id: 'entrant-1',
          odds: 2.5,
          type: 'fixed_win',
          event_timestamp: '2025-10-14T12:00:00.000Z',
        },
        {
          entrant_id: 'entrant-1',
          odds: 3.1,
          type: 'pool_win',
          event_timestamp: '2025-10-14T12:00:00.000Z',
        },
        {
          entrant_id: 'entrant-2',
          odds: 4.2,
          type: 'fixed_win',
          event_timestamp: '2025-10-14T12:00:00.000Z',
        },
      ]

      const filtered = filterSignificantOddsChanges(records)

      // All should be included (first records for each combination)
      expect(filtered).toHaveLength(3)
    })
  })

  describe('populateOddsSnapshotFromDatabase', () => {
    it('populates snapshot from database query results', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              entrant_id: 'entrant-1',
              odds: 2.5,
              type: 'fixed_win',
              event_timestamp: '2025-10-14T12:00:00.000Z',
            },
            {
              entrant_id: 'entrant-1',
              odds: 3.1,
              type: 'pool_win',
              event_timestamp: '2025-10-14T12:00:00.000Z',
            },
          ],
        }),
      } as unknown as PoolClient

      await populateOddsSnapshotFromDatabase(
        mockClient,
        ['entrant-1'],
        '2025-10-14T12:00:00.000Z'
      )

      const stats = getOddsSnapshotStats()
      expect(stats.totalEntries).toBe(2)
      expect(stats.entrantCount).toBe(1)
      expect(stats.oddsTypes).toEqual(['fixed_win', 'pool_win'])
    })

    it('handles empty entrant IDs array', async () => {
      const mockClient = {
        query: vi.fn(),
      } as unknown as PoolClient

      await populateOddsSnapshotFromDatabase(
        mockClient,
        [],
        '2025-10-14T12:00:00.000Z'
      )

      expect(mockClient.query).not.toHaveBeenCalled()
    })

    it('handles database query errors gracefully', async () => {
      const mockClient = {
        query: vi.fn().mockRejectedValue(new Error('Database error')),
      } as unknown as PoolClient

      await populateOddsSnapshotFromDatabase(
        mockClient,
        ['entrant-1'],
        '2025-10-14T12:00:00.000Z'
      )

      // Should not throw error
      expect(mockClient.query).toHaveBeenCalled()
    })

    it('uses correct partition name based on event timestamp', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      } as unknown as PoolClient

      await populateOddsSnapshotFromDatabase(
        mockClient,
        ['entrant-1'],
        '2025-10-14T12:00:00.000Z'
      )

      // The function creates a Date object from the timestamp
      // 2025-10-14T12:00:00.000Z creates a Date object, then extracts date parts in UTC
      // Based on the test output, this results in odds_history_2025_10_15
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM odds_history_2025_10_15'),
        [['entrant-1'], '2025-10-14T12:00:00.000Z']
      )
    })
  })

  describe('getOddsSnapshotStats', () => {
    it('returns correct statistics for empty snapshot', () => {
      const stats = getOddsSnapshotStats()
      expect(stats.totalEntries).toBe(0)
      expect(stats.entrantCount).toBe(0)
      expect(stats.oddsTypes).toEqual([])
    })

    it('returns correct statistics for populated snapshot', () => {
      // Add some records to snapshot
      shouldInsertOddsRecord({
        entrant_id: 'entrant-1',
        odds: 2.5,
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:00:00.000Z',
      })

      shouldInsertOddsRecord({
        entrant_id: 'entrant-1',
        odds: 3.1,
        type: 'pool_win',
        event_timestamp: '2025-10-14T12:00:00.000Z',
      })

      shouldInsertOddsRecord({
        entrant_id: 'entrant-2',
        odds: 4.2,
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:00:00.000Z',
      })

      const stats = getOddsSnapshotStats()
      expect(stats.totalEntries).toBe(3)
      expect(stats.entrantCount).toBe(2)
      expect(stats.oddsTypes).toEqual(['fixed_win', 'pool_win'])
    })
  })

  describe('clearOddsSnapshot', () => {
    it('clears all snapshot entries', () => {
      // Add some records
      shouldInsertOddsRecord({
        entrant_id: 'entrant-1',
        odds: 2.5,
        type: 'fixed_win',
        event_timestamp: '2025-10-14T12:00:00.000Z',
      })

      expect(getOddsSnapshotStats().totalEntries).toBe(1)

      clearOddsSnapshot()

      expect(getOddsSnapshotStats().totalEntries).toBe(0)
    })
  })
})