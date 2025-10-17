/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/prefer-reduce-type-parameter */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import { pool } from '../../src/database/pool.js'

describe('Story 2.10 Database Schema Integration', () => {
  beforeAll(async () => {
    // Ensure we're working with a clean test environment
    // The migration 007_story_2_10_missing_schema_fields.sql should already be applied
  })

  afterAll(async () => {
    // No cleanup needed - we're just validating schema
  })

  describe('Entrants Table Schema', () => {
    it('has new silk URL fields', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'entrants'
          AND column_name IN ('silk_url_64x64', 'silk_url_128x128')
        ORDER BY column_name
      `)

      expect(result.rows).toHaveLength(2)

      const silk64x64 = result.rows.find(row => row.column_name === 'silk_url_64x64')
      const silk128x128 = result.rows.find(row => row.column_name === 'silk_url_128x128')

      expect(silk64x64).toMatchObject({
        column_name: 'silk_url_64x64',
        data_type: 'text',
        is_nullable: 'YES',
      })

      expect(silk128x128).toMatchObject({
        column_name: 'silk_url_128x128',
        data_type: 'text',
        is_nullable: 'YES',
      })
    })

    it('has new scratching-related fields', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'entrants'
          AND column_name IN ('scratch_time', 'runner_change', 'mover', 'favourite')
        ORDER BY column_name
      `)

      expect(result.rows).toHaveLength(4)

      const fields = result.rows.reduce((acc, row) => {
        acc[row.column_name] = row
        return acc
      }, {} as Record<string, any>)

      expect(fields.scratch_time).toMatchObject({
        column_name: 'scratch_time',
        data_type: 'integer',
        is_nullable: 'YES',
      })

      expect(fields.runner_change).toMatchObject({
        column_name: 'runner_change',
        data_type: 'text',
        is_nullable: 'YES',
      })

      expect(fields.mover).toMatchObject({
        column_name: 'mover',
        data_type: 'boolean',
        is_nullable: 'YES',
      })

      expect(fields.favourite).toMatchObject({
        column_name: 'favourite',
        data_type: 'boolean',
        is_nullable: 'YES',
      })
    })
  })

  describe('Races Table Schema', () => {
    it('has new timing and metadata fields', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'races'
          AND column_name IN (
            'actual_start', 'tote_start_time', 'distance', 'track_condition',
            'track_surface', 'weather', 'type', 'total_prize_money',
            'entrant_count', 'field_size', 'positions_paid'
          )
        ORDER BY column_name
      `)

      expect(result.rows.length).toBeGreaterThanOrEqual(10)

      const fields = result.rows.reduce((acc, row) => {
        acc[row.column_name] = row
        return acc
      }, {} as Record<string, any>)

      // Check key fields
      expect(fields.actual_start).toMatchObject({
        column_name: 'actual_start',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
      })

      expect(fields.distance).toMatchObject({
        column_name: 'distance',
        data_type: 'integer',
        is_nullable: 'YES',
      })

      expect(fields.total_prize_money).toMatchObject({
        column_name: 'total_prize_money',
        data_type: 'numeric',
        is_nullable: 'YES',
      })
    })

    it('has new silk and video fields', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'races'
          AND column_name IN ('silk_url', 'silk_base_url', 'video_channels')
        ORDER BY column_name
      `)

      expect(result.rows).toHaveLength(3)

      const fields = result.rows.reduce((acc, row) => {
        acc[row.column_name] = row
        return acc
      }, {} as Record<string, any>)

      expect(fields.silk_url).toMatchObject({
        column_name: 'silk_url',
        data_type: 'text',
        is_nullable: 'YES',
      })

      expect(fields.silk_base_url).toMatchObject({
        column_name: 'silk_base_url',
        data_type: 'text',
        is_nullable: 'YES',
      })

      expect(fields.video_channels).toMatchObject({
        column_name: 'video_channels',
        data_type: 'text',
        is_nullable: 'YES',
      })
    })
  })

  describe('Meetings Table Schema', () => {
    it('has new meeting identifier fields', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'meetings'
          AND column_name IN ('meeting', 'category_name')
        ORDER BY column_name
      `)

      expect(result.rows).toHaveLength(2)

      const fields = result.rows.reduce((acc, row) => {
        acc[row.column_name] = row
        return acc
      }, {} as Record<string, any>)

      expect(fields.meeting).toMatchObject({
        column_name: 'meeting',
        data_type: 'text',
        is_nullable: 'YES',
      })

      expect(fields.category_name).toMatchObject({
        column_name: 'category_name',
        data_type: 'text',
        is_nullable: 'YES',
      })
    })
  })

  describe('Race Pools Table Schema', () => {
    it('has additional pool types and metadata', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'race_pools'
          AND column_name IN (
            'exacta_pool_total', 'first4_pool_total', 'currency',
            'data_quality_score', 'extracted_pools'
          )
        ORDER BY column_name
      `)

      expect(result.rows).toHaveLength(5)

      const fields = result.rows.reduce((acc, row) => {
        acc[row.column_name] = row
        return acc
      }, {} as Record<string, any>)

      expect(fields.exacta_pool_total).toMatchObject({
        column_name: 'exacta_pool_total',
        data_type: 'numeric',
        is_nullable: 'NO',
        column_default: '0',
      })

      expect(fields.first4_pool_total).toMatchObject({
        column_name: 'first4_pool_total',
        data_type: 'numeric',
        is_nullable: 'NO',
        column_default: '0',
      })

      expect(fields.currency).toMatchObject({
        column_name: 'currency',
        data_type: 'text',
        is_nullable: 'NO',
        column_default: "'$'::text",
      })

      expect(fields.data_quality_score).toMatchObject({
        column_name: 'data_quality_score',
        data_type: 'integer',
        is_nullable: 'YES',
        column_default: '100',
      })

      expect(fields.extracted_pools).toMatchObject({
        column_name: 'extracted_pools',
        data_type: 'integer',
        is_nullable: 'YES',
        column_default: '0',
      })
    })
  })

  describe('Performance Indexes', () => {
    it('has new performance indexes for Story 2.10 fields', async () => {
      const expectedIndexes = [
        'idx_entrants_silk_urls',
        'idx_entrants_scratching',
        'idx_races_metadata',
        'idx_races_prize_money',
        'idx_race_pools_comprehensive',
        'idx_meetings_status_category',
      ]

      for (const indexName of expectedIndexes) {
        const result = await pool.query(`
          SELECT indexname, tablename
          FROM pg_indexes
          WHERE indexname = $1
        `, [indexName])

        expect(result.rows).toHaveLength(1)
        expect(result.rows[0]?.indexname).toBe(indexName)
      }
    })

    it('has conditional index for prize money', async () => {
      const result = await pool.query(`
        SELECT indexdef
        FROM pg_indexes
        WHERE indexname = 'idx_races_prize_money'
      `)

      expect(result.rows).toHaveLength(1)
      const indexDef = result.rows[0]?.indexdef
      expect(indexDef).toContain('WHERE')
      expect(indexDef).toContain('total_prize_money IS NOT NULL')
    })
  })

  describe('Column Comments', () => {
    it('has descriptive comments for new fields', async () => {
      // Test a few key fields to ensure comments were added in migration
      const commentFields = [
        { table: 'entrants', column: 'silk_url_64x64' },
        { table: 'entrants', column: 'scratch_time' },
        { table: 'entrants', column: 'favourite' },
        { table: 'races', column: 'total_prize_money' },
        { table: 'race_pools', column: 'data_quality_score' }
      ]

      let commentCount = 0
      for (const field of commentFields) {
        const result = await pool.query(`
          SELECT obj_description(c.oid, 'pg_class') as table_comment,
                 col_description(c.oid, a.attnum) as column_comment
          FROM pg_class c
          JOIN pg_namespace n ON c.relnamespace = n.oid
          JOIN pg_attribute a ON a.attrelid = c.oid
          WHERE c.relname = $1
            AND a.attname = $2
            AND n.nspname = 'public'
            AND a.attnum > 0
        `, [field.table, field.column])

        if (result.rows.length > 0 && result.rows[0] !== undefined && result.rows[0].column_comment !== null && result.rows[0].column_comment !== undefined) {
          commentCount++
        }
      }

      expect(commentCount).toBeGreaterThan(0) // At least some comments should exist
    })
  })

  describe('Table Structure Validation', () => {
    it('has all expected tables with correct structure', async () => {
      const tables = ['entrants', 'races', 'meetings', 'race_pools']

      for (const tableName of tables) {
        const result = await pool.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position
        `, [tableName])

        expect(result.rows.length).toBeGreaterThan(0)

        // Verify table has primary key
        const pkResult = await pool.query(`
          SELECT column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_name = $1
            AND tc.constraint_type = 'PRIMARY KEY'
        `, [tableName])

        expect(pkResult.rows.length).toBe(1)
      }
    })
  })
})