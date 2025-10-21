/* eslint-disable @typescript-eslint/naming-convention */

import { Router, type Request, type Response } from 'express'
import type { PoolClient } from 'pg'
import { pool } from '../../database/pool.js'
import { logger } from '../../shared/logger.js'
import {
  analyzeIntervalCoverage,
  castTimelineRow,
  getNextCursorMetadata,
  getPoolTypeOptimizations,
  sortTimelineDocuments,
  toIntervalCoverageApi,
  toTimelineApiDocument,
  VALID_POOL_TYPES,
  type MoneyFlowDocument,
  type MoneyFlowRow,
  type PoolType,
} from './money-flow-utils.js'
import { DEFAULT_INDICATORS, DEFAULT_USER_ID } from './user-alert-defaults.js'

interface AlertConfigRow {
  indicatorId: string
  userId: string
  indicatorType: string | null
  percentageRangeMin: number | string | null | undefined
  percentageRangeMax: number | string | null | undefined
  color: string | null | undefined
  isDefault: boolean | null | undefined
  enabled: boolean | null | undefined
  displayOrder: number | string | null | undefined
  audibleAlertsEnabled: boolean | null | undefined
  createdAt: Date | string | null | undefined
  updatedAt: Date | string | null | undefined
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null
  }
  const numberValue = Number(value)
  return Number.isNaN(numberValue) ? null : numberValue
}

const toIsoString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null
  }

  let date: Date
  if (value instanceof Date) {
    date = value
  } else {
    const parsed = new Date(value as string)
    if (Number.isNaN(parsed.getTime())) {
      return null
    }
    date = parsed
  }

  // Format with Pacific/Auckland timezone offset instead of UTC (Z)
  // NZTAB API returns NZ local time, stored as-is in DB
  // We need to return ISO 8601 format with Pacific/Auckland offset (+12:00 or +13:00 for NZDT)
  const nzFormatter = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = nzFormatter.formatToParts(date)
  const partsMap = new Map(parts.map((part) => [part.type, part.value]))

  const year = partsMap.get('year') ?? ''
  const month = partsMap.get('month') ?? ''
  const day = partsMap.get('day') ?? ''
  const hour = partsMap.get('hour') ?? ''
  const minute = partsMap.get('minute') ?? ''
  const second = partsMap.get('second') ?? ''
  const milliseconds = date.getMilliseconds().toString().padStart(3, '0')

  // Calculate Pacific/Auckland offset for this date (handles NZST/NZDT)
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
  const nzDate = new Date(date.toLocaleString('en-US', { timeZone: 'Pacific/Auckland' }))
  const offsetMinutes = Math.round((nzDate.getTime() - utcDate.getTime()) / 60_000)
  const offsetHours = Math.floor(offsetMinutes / 60)
  const offsetMins = Math.abs(offsetMinutes % 60)
  const offsetSign = offsetMinutes >= 0 ? '+' : '-'
  const offsetString = `${offsetSign}${String(Math.abs(offsetHours)).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds}${offsetString}`
}

const VALID_POOL_TYPES_SET = new Set<PoolType>(VALID_POOL_TYPES)

const parsePoolTypeParam = (value: unknown): PoolType | null => {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim().toLowerCase()
  return VALID_POOL_TYPES_SET.has(normalized as PoolType)
    ? (normalized as PoolType)
    : null
}

const parseEntrantIdsParam = (value: unknown): string[] => {
  if (typeof value !== 'string') {
    return []
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

const parseIntegerParam = (
  value: unknown,
  defaultValue: number,
  min: number,
  max: number
): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const clamped = Math.min(Math.max(Math.floor(value), min), max)
    return clamped
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(Math.max(Math.floor(parsed), min), max)
      return clamped
    }
  }

  return defaultValue
}

const parseCursorParam = (value: unknown): number | null => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  const cursor = Math.floor(parsed)
  return cursor > 0 ? cursor : null
}

const sumNumbers = (...values: (number | null)[]): number => {
  let total = 0
  for (const value of values) {
    if (typeof value === 'number') {
      total += value
    }
  }
  return total
}

const HEX_COLOR_REGEX = /^#[0-9A-F]{6}$/i

const sanitizeHexColor = (value: string): string => {
  const trimmed = value.trim()
  if (!HEX_COLOR_REGEX.test(trimmed)) {
    throw new Error(`Invalid hex colour value: ${value}`)
  }
  return trimmed.toUpperCase()
}

const parseJsonb = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'object') {
    return value
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as unknown
    } catch {
      return null
    }
  }

  return null
}

const mapAlertRow = (row: AlertConfigRow) => {
  const rawColor = typeof row.color === 'string' ? row.color : '#FFFFFF'
  const normalisedColor = sanitizeHexColor(rawColor)

  return {
    indicator_id: row.indicatorId,
    user_id: row.userId,
    indicator_type: row.indicatorType ?? 'percentage_range',
    percentage_range_min: Number(row.percentageRangeMin ?? 0),
    percentage_range_max:
      row.percentageRangeMax === null || row.percentageRangeMax === undefined
        ? null
        : Number(row.percentageRangeMax),
    color: normalisedColor,
    is_default: row.isDefault ?? true,
    enabled: row.enabled ?? true,
    display_order: Number(row.displayOrder ?? 0),
    audible_alerts_enabled: row.audibleAlertsEnabled ?? true,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  }
}

type AlertConfigApiRow = ReturnType<typeof mapAlertRow>

const createDefaultIndicatorsForUser = async (
  client: PoolClient,
  user_id_param: string
) => {
  for (const defaultConfig of DEFAULT_INDICATORS) {
    await client.query(
      `
        INSERT INTO user_alert_configs (
          user_id,
          indicator_type,
          percentage_range_min,
          percentage_range_max,
          color,
          is_default,
          enabled,
          display_order,
          audible_alerts_enabled
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
        ON CONFLICT (user_id, display_order) DO NOTHING
      `,
      [
        user_id_param,
        defaultConfig.indicator_type,
        defaultConfig.percentage_range_min,
        defaultConfig.percentage_range_max,
        defaultConfig.color,
        defaultConfig.is_default,
        defaultConfig.enabled,
        defaultConfig.display_order,
      ]
    )
  }
}

const ensureAllDisplayOrders = async (
  client: PoolClient,
  user_id_param: string,
  existingOrders: number[]
) => {
  const missingOrders = [1, 2, 3, 4, 5, 6].filter(
    (order) => !existingOrders.includes(order)
  )

  if (missingOrders.length === 0) {
    return
  }

  for (const order of missingOrders) {
    const defaultConfig = DEFAULT_INDICATORS[order - 1]
    if (defaultConfig === undefined) {
      throw new Error(`Missing default indicator configuration for order ${String(order)}`)
    }
    await client.query(
      `
        INSERT INTO user_alert_configs (
          user_id,
          indicator_type,
          percentage_range_min,
          percentage_range_max,
          color,
          is_default,
          enabled,
          display_order,
          audible_alerts_enabled
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
        ON CONFLICT (user_id, display_order) DO NOTHING
      `,
      [
        user_id_param,
        defaultConfig.indicator_type,
        defaultConfig.percentage_range_min,
        defaultConfig.percentage_range_max,
        defaultConfig.color,
        defaultConfig.is_default,
        defaultConfig.enabled,
        defaultConfig.display_order,
      ]
    )
  }
}

interface IndicatorInput {
  indicator_id: string | null
  user_id: string
  indicator_type: 'percentage_range'
  percentage_range_min: number
  percentage_range_max: number | null
  color: string
  is_default: boolean
  enabled: boolean
  display_order: number
}

const parseIndicatorInput = (
  value: unknown,
  defaultUserId: string
): IndicatorInput => {
  if (value === null || typeof value !== 'object') {
    throw new Error('Indicator payload must be an object')
  }

  const raw = value as Record<string, unknown>
  const indicatorIdRaw = (raw.indicator_id ?? raw.$id) as string | undefined
  const indicator_id =
    typeof indicatorIdRaw === 'string' && indicatorIdRaw.trim().length > 0
      ? indicatorIdRaw.trim()
      : null

  const indicatorTypeRaw = raw.indicator_type ?? raw.indicatorType
  const normalisedIndicatorType =
    typeof indicatorTypeRaw === 'string'
      ? indicatorTypeRaw.trim().toLowerCase()
      : ''

  if (normalisedIndicatorType !== 'percentage_range') {
    throw new Error('indicator_type must be percentage_range')
  }

  const indicator_type = 'percentage_range' as const

  const userIdRaw = raw.user_id ?? raw.userId
  const user_id =
    typeof userIdRaw === 'string' && userIdRaw.trim().length > 0
      ? userIdRaw.trim()
      : defaultUserId

  const minRaw = raw.percentage_range_min ?? raw.percentageRangeMin
  const percentage_range_min = Number(minRaw)
  if (!Number.isFinite(percentage_range_min)) {
    throw new Error('percentage_range_min must be a number')
  }

  const maxRaw = raw.percentage_range_max ?? raw.percentageRangeMax
  const percentage_range_max =
    maxRaw === null || maxRaw === undefined ? null : Number(maxRaw)
  if (percentage_range_max !== null && !Number.isFinite(percentage_range_max)) {
    throw new Error('percentage_range_max must be a number or null')
  }

  const colorRaw = raw.color
  if (typeof colorRaw !== 'string' || colorRaw.trim().length === 0) {
    throw new Error('color is required')
  }
  const color = sanitizeHexColor(colorRaw)

  const is_default = Boolean(raw.is_default ?? raw.isDefault ?? false)
  const enabled = Boolean(raw.enabled ?? true)

  const displayOrderRaw = raw.display_order ?? raw.displayOrder
  const display_order = Number(displayOrderRaw)
  if (!Number.isInteger(display_order) || display_order < 1 || display_order > 6) {
    throw new Error('display_order must be an integer between 1 and 6')
  }

  if (percentage_range_min < 0 || percentage_range_min > 100) {
    throw new Error('percentage_range_min must be between 0 and 100')
  }

  if (
    percentage_range_max !== null &&
    (percentage_range_max < 0 ||
      percentage_range_max > 100 ||
      percentage_range_max <= percentage_range_min)
  ) {
    throw new Error(
      'percentage_range_max must be between 0 and 100 and greater than min'
    )
  }

  return {
    indicator_id,
    user_id,
    indicator_type,
    percentage_range_min,
    percentage_range_max,
    color,
    is_default,
    enabled,
    display_order,
  }
}

const selectUserAlertConfigs = async (
  client: PoolClient,
  user_id_param: string
): Promise<AlertConfigRow[]> => {
  const result = await client.query<AlertConfigRow>(
    `
      SELECT
        indicator_id AS "indicatorId",
        user_id AS "userId",
        indicator_type AS "indicatorType",
        percentage_range_min AS "percentageRangeMin",
        percentage_range_max AS "percentageRangeMax",
        color,
        is_default AS "isDefault",
        enabled,
        display_order AS "displayOrder",
        audible_alerts_enabled AS "audibleAlertsEnabled",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM user_alert_configs
      WHERE user_id = $1
      ORDER BY display_order ASC
    `,
    [user_id_param]
  )

  return result.rows
}

export const clientCompatibilityRouter = Router()

clientCompatibilityRouter.get(
  '/meetings',
  async (req: Request, res: Response): Promise<void> => {
    const { date, race_type } = req.query

    const conditions: string[] = []
    const values: unknown[] = []

    if (date !== undefined) {
      const parameterIndex = conditions.length + 1
      conditions.push(`date = $${parameterIndex.toString()}::date`)
      values.push(date)
    }

    if (race_type !== undefined) {
      const parameterIndex = conditions.length + 1
      conditions.push(`race_type = $${parameterIndex.toString()}`)
      values.push(race_type)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    try {
      const result = await pool.query<{
        meetingId: string
        meetingName: string
        country: string
        raceType: string
        date: string
        status: string
      }>(
        `
          SELECT
            meeting_id AS "meetingId",
            meeting_name AS "meetingName",
            country,
            race_type AS "raceType",
            date::text AS "date",
            status
          FROM meetings
          ${whereClause}
          ORDER BY date ASC, meeting_name ASC
        `,
        values
      )

      const payload = result.rows.map((row) => ({
        meeting_id: row.meetingId,
        meeting_name: row.meetingName,
        country: row.country,
        race_type: row.raceType,
        date: row.date,
        status: row.status,
      }))

      res.json(payload)
    } catch (error) {
      logger.error({ error }, 'Failed to fetch meetings')
      res.status(500).json({ error: 'Failed to fetch meetings' })
    }
  }
)

clientCompatibilityRouter.get(
  '/meetings/:meetingId',
  async (req: Request, res: Response): Promise<void> => {
    const { meetingId } = req.params

    if (typeof meetingId !== 'string' || meetingId.trim().length === 0) {
      res.status(400).json({ error: 'meetingId path parameter is required' })
      return
    }

    try {
      const result = await pool.query<{
        meetingId: string
        meetingName: string
        country: string | null
        raceType: string | null
        date: string
        status: string | null
        trackCondition: string | null
        weather: string | null
        createdAt: Date | null
        updatedAt: Date | null
      }>(
        `
          SELECT
            meeting_id AS "meetingId",
            meeting_name AS "meetingName",
            country,
            race_type AS "raceType",
            date::text AS "date",
            status,
            track_condition AS "trackCondition",
            weather,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM meetings
          WHERE meeting_id = $1
          LIMIT 1
        `,
        [meetingId]
      )

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Meeting not found' })
        return
      }

      const [row] = result.rows
      if (row === undefined) {
        res.status(404).json({ error: 'Meeting not found' })
        return
      }

      res.json({
        meeting_id: row.meetingId,
        meeting_name: row.meetingName,
        country: row.country,
        race_type: row.raceType,
        date: row.date,
        status: row.status,
        track_condition: row.trackCondition,
        weather: row.weather,
        created_at: row.createdAt !== null ? toIsoString(row.createdAt) : null,
        updated_at: row.updatedAt !== null ? toIsoString(row.updatedAt) : null,
      })
    } catch (error) {
      logger.error({ error }, 'Failed to fetch meeting by ID')
      res.status(500).json({ error: 'Failed to fetch meeting' })
    }
  }
)

clientCompatibilityRouter.get(
  '/races',
  async (req: Request, res: Response): Promise<void> => {
    const { meeting_id } = req.query

    if (meeting_id === undefined || meeting_id === '') {
      res.status(400).json({ error: 'meeting_id query parameter is required' })
      return
    }

    try {
      const result = await pool.query<{
        raceId: string
        name: string
        raceNumber: number
        startTime: Date
        status: string
        meetingId: string
      }>(
        `
          SELECT
            race_id AS "raceId",
            name,
            race_number AS "raceNumber",
            start_time AS "startTime",
            status,
            meeting_id AS "meetingId"
          FROM races
          WHERE meeting_id = $1
          ORDER BY race_number ASC
        `,
        [meeting_id]
      )

      const payload = result.rows.map((row) => ({
        race_id: row.raceId,
        name: row.name,
        race_number: row.raceNumber,
        start_time: toIsoString(row.startTime),
        status: row.status,
        meeting_id: row.meetingId,
      }))

      res.json(payload)
    } catch (error) {
      logger.error({ error }, 'Failed to fetch races')
      res.status(500).json({ error: 'Failed to fetch races' })
    }
  }
)

clientCompatibilityRouter.get(
  '/races/navigation',
  async (req: Request, res: Response): Promise<void> => {
    const { race_id } = req.query

    if (typeof race_id !== 'string' || race_id.trim().length === 0) {
      res.status(400).json({ error: 'race_id query parameter is required' })
      return
    }

    try {
      const raceResult = await pool.query<{
        raceId: string
        startTime: Date
      }>(
        `
          SELECT race_id AS "raceId", start_time AS "startTime"
          FROM races
          WHERE race_id = $1
          LIMIT 1
        `,
        [race_id]
      )

      if (raceResult.rows.length === 0) {
        res.status(404).json({ error: 'Race not found' })
        return
      }

      const [raceRow] = raceResult.rows
      if (raceRow === undefined) {
        res.status(404).json({ error: 'Race not found' })
        return
      }

      const { startTime } = raceRow
      const now = new Date()

      const previousRaceQuery = await pool.query<{
        raceId: string
        name: string | null
        startTime: Date
        meetingName: string | null
      }>(
        `
          SELECT
            r.race_id AS "raceId",
            r.name,
            r.start_time AS "startTime",
            m.meeting_name AS "meetingName"
          FROM races r
          LEFT JOIN meetings m ON m.meeting_id = r.meeting_id
          WHERE r.start_time < $1
          ORDER BY r.start_time DESC
          LIMIT 1
        `,
        [startTime]
      )

      const nextRaceQuery = await pool.query<{
        raceId: string
        name: string | null
        startTime: Date
        meetingName: string | null
      }>(
        `
          SELECT
            r.race_id AS "raceId",
            r.name,
            r.start_time AS "startTime",
            m.meeting_name AS "meetingName"
          FROM races r
          LEFT JOIN meetings m ON m.meeting_id = r.meeting_id
          WHERE r.start_time > $1
          ORDER BY r.start_time ASC
          LIMIT 1
        `,
        [startTime]
      )

      const nextScheduledQuery = await pool.query<{
        raceId: string
        name: string | null
        startTime: Date
        meetingName: string | null
      }>(
        `
          SELECT
            r.race_id AS "raceId",
            r.name,
            r.start_time AS "startTime",
            m.meeting_name AS "meetingName"
          FROM races r
          LEFT JOIN meetings m ON m.meeting_id = r.meeting_id
          WHERE r.start_time > $1
            AND LOWER(r.status) NOT IN ('abandoned', 'final', 'finalized')
          ORDER BY r.start_time ASC
          LIMIT 1
        `,
        [now]
      )

      const mapNavigationEntry = (
        rows: typeof previousRaceQuery.rows
      ): {
        race_id: string
        name: string
        start_time: string | null
        meeting_name: string
      } | null => {
        const [row] = rows
        if (row === undefined) {
          return null
        }

        return {
          race_id: row.raceId,
          name: row.name ?? 'Unknown Race',
          start_time: toIsoString(row.startTime),
          meeting_name: row.meetingName ?? 'Unknown Meeting',
        }
      }

      res.json({
        previousRace: mapNavigationEntry(previousRaceQuery.rows),
        nextRace: mapNavigationEntry(nextRaceQuery.rows),
        nextScheduledRace: mapNavigationEntry(nextScheduledQuery.rows),
      })
    } catch (error) {
      logger.error({ error }, 'Failed to fetch race navigation data')
      res.status(500).json({ error: 'Failed to fetch race navigation data' })
    }
  }
)

clientCompatibilityRouter.get(
  '/entrants',
  async (req: Request, res: Response): Promise<void> => {
    const { race_id } = req.query

    if (race_id === undefined || race_id === '') {
      res.status(400).json({ error: 'race_id query parameter is required' })
      return
    }

    const client = await pool.connect()

    try {
      const entrantsResult = await client.query<{
        entrantId: string
        name: string
        runnerNumber: number
        winOdds: string | null
        placeOdds: string | null
        holdPercentage: string | null
        isScratched: boolean
      }>(
        `
          SELECT
            entrant_id AS "entrantId",
            name,
            runner_number AS "runnerNumber",
            win_odds AS "winOdds",
            place_odds AS "placeOdds",
            hold_percentage AS "holdPercentage",
            is_scratched AS "isScratched"
          FROM entrants
          WHERE race_id = $1
          ORDER BY runner_number ASC
        `,
        [race_id]
      )

      const entrantIds = entrantsResult.rows.map((row) => row.entrantId)

      const oddsHistoryResult =
        entrantIds.length > 0
          ? await client.query<{
              entrantId: string
              odds: string | null
              type: string | null
              eventTimestamp: Date
            }>(
              `
                SELECT
                  entrant_id AS "entrantId",
                  odds,
                  type,
                  event_timestamp AS "eventTimestamp"
                FROM odds_history
                WHERE entrant_id = ANY($1)
                ORDER BY event_timestamp ASC
              `,
              [entrantIds]
            )
          : { rows: [] }

      const moneyFlowResult =
        entrantIds.length > 0
          ? await client.query<{
              entrantId: string
              holdPercentage: string | null
              winPoolAmount: string | null
              eventTimestamp: Date
            }>(
              `
                SELECT
                  entrant_id AS "entrantId",
                  hold_percentage AS "holdPercentage",
                  win_pool_amount AS "winPoolAmount",
                  event_timestamp AS "eventTimestamp"
                FROM money_flow_history
                WHERE entrant_id = ANY($1)
                ORDER BY event_timestamp ASC
              `,
              [entrantIds]
            )
          : { rows: [] }

      const oddsByEntrant = new Map<
        string,
        { odds: number | null; type: string | null; timestamp: string }[]
      >()
      for (const row of oddsHistoryResult.rows) {
        const list = oddsByEntrant.get(row.entrantId) ?? []
        list.push({
          odds: toNumber(row.odds),
          type: row.type ?? null,
          timestamp: toIsoString(row.eventTimestamp) ?? '',
        })
        oddsByEntrant.set(row.entrantId, list)
      }

      const moneyFlowByEntrant = new Map<
        string,
        {
          hold_percentage: number | null
          win_pool_amount: number | null
          timestamp: string
        }[]
      >()
      for (const row of moneyFlowResult.rows) {
        const list = moneyFlowByEntrant.get(row.entrantId) ?? []
        list.push({
          hold_percentage: toNumber(row.holdPercentage),
          win_pool_amount: toNumber(row.winPoolAmount),
          timestamp: toIsoString(row.eventTimestamp) ?? '',
        })
        moneyFlowByEntrant.set(row.entrantId, list)
      }

      const payload = entrantsResult.rows.map((row) => ({
        entrant_id: row.entrantId,
        name: row.name,
        runner_number: row.runnerNumber,
        win_odds: toNumber(row.winOdds),
        place_odds: toNumber(row.placeOdds),
        hold_percentage: toNumber(row.holdPercentage),
        is_scratched: row.isScratched,
        odds_history: oddsByEntrant.get(row.entrantId) ?? [],
        money_flow_history: moneyFlowByEntrant.get(row.entrantId) ?? [],
      }))

      res.json(payload)
    } catch (error) {
      logger.error({ error }, 'Failed to fetch entrants')
      res.status(500).json({ error: 'Failed to fetch entrants' })
    } finally {
      client.release()
    }
  }
)

clientCompatibilityRouter.get(
  '/race-pools',
  async (req: Request, res: Response): Promise<void> => {
    const { race_id } = req.query

    if (typeof race_id !== 'string' || race_id.trim().length === 0) {
      res.status(400).json({ error: 'race_id query parameter is required' })
      return
    }

    try {
      const result = await pool.query<{
        race_id: string
        win_pool_total: string | null
        place_pool_total: string | null
        quinella_pool_total: string | null
        trifecta_pool_total: string | null
        exacta_pool_total: string | null
        first4_pool_total: string | null
        currency: string | null
        data_quality_score: number | null
        extracted_pools: number | null
        last_updated: Date | null
      }>(
        `
          SELECT
            race_id,
            win_pool_total,
            place_pool_total,
            quinella_pool_total,
            trifecta_pool_total,
            exacta_pool_total,
            first4_pool_total,
            currency,
            data_quality_score,
            extracted_pools,
            last_updated
          FROM race_pools
          WHERE race_id = $1
        `,
        [race_id]
      )

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Pool data not found' })
        return
      }

      const [rowCandidate] = result.rows
      if (rowCandidate === undefined) {
        throw new Error('Race pools query returned no rows after presence check')
      }
      const row = rowCandidate
      const win_pool_total = toNumber(row.win_pool_total)
      const place_pool_total = toNumber(row.place_pool_total)
      const quinella_pool_total = toNumber(row.quinella_pool_total)
      const trifecta_pool_total = toNumber(row.trifecta_pool_total)
      const exacta_pool_total = toNumber(row.exacta_pool_total)
      const first4_pool_total = toNumber(row.first4_pool_total)

      res.json({
        race_id: row.race_id,
        win_pool_total,
        place_pool_total,
        quinella_pool_total,
        trifecta_pool_total,
        exacta_pool_total,
        first4_pool_total,
        total_race_pool: sumNumbers(
          win_pool_total,
          place_pool_total,
          quinella_pool_total,
          trifecta_pool_total,
          exacta_pool_total,
          first4_pool_total
        ),
        currency: row.currency ?? '$',
        data_quality_score: row.data_quality_score ?? null,
        extracted_pools: row.extracted_pools ?? null,
        last_updated: toIsoString(row.last_updated),
      })
    } catch (error) {
      logger.error({ error }, 'Failed to fetch race pools')
      res.status(500).json({ error: 'Failed to fetch race pools' })
    }
  }
)

clientCompatibilityRouter.get(
  '/race-results',
  async (req: Request, res: Response): Promise<void> => {
    const { race_id } = req.query

    if (typeof race_id !== 'string' || race_id.trim().length === 0) {
      res.status(400).json({ error: 'race_id query parameter is required' })
      return
    }

    try {
      const result = await pool.query<{
        race_id: string
        results_available: boolean
        results_data: unknown
        dividends_data: unknown
        fixed_odds_data: unknown
        result_status: string | null
        photo_finish: boolean
        stewards_inquiry: boolean
        protest_lodged: boolean
        result_time: Date | null
        created_at: Date | null
        updated_at: Date | null
      }>(
        `
          SELECT
            race_id,
            results_available,
            results_data,
            dividends_data,
            fixed_odds_data,
            result_status,
            photo_finish,
            stewards_inquiry,
            protest_lodged,
            result_time,
            created_at,
            updated_at
          FROM race_results
          WHERE race_id = $1
        `,
        [race_id]
      )

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Race results not found' })
        return
      }

      const [rowCandidate] = result.rows
      if (rowCandidate === undefined) {
        throw new Error('Race results query returned no rows after presence check')
      }
      const row = rowCandidate
      res.json({
        race_id: row.race_id,
        results_available: row.results_available,
        results_data: parseJsonb(row.results_data) as Record<string, unknown> | null,
        dividends_data: parseJsonb(row.dividends_data) as Record<string, unknown> | null,
        fixed_odds_data: parseJsonb(row.fixed_odds_data) as Record<string, unknown> | null,
        result_status: row.result_status,
        photo_finish: row.photo_finish,
        stewards_inquiry: row.stewards_inquiry,
        protest_lodged: row.protest_lodged,
        result_time: toIsoString(row.result_time),
        created_at: toIsoString(row.created_at),
        updated_at: toIsoString(row.updated_at),
      })
    } catch (error) {
      logger.error({ error }, 'Failed to fetch race results')
      res.status(500).json({ error: 'Failed to fetch race results' })
    }
  }
)

clientCompatibilityRouter.get(
  '/money-flow-timeline',
  async (req: Request, res: Response): Promise<void> => {
    const { race_id, entrants, pool_type, limit, cursor_after, created_after } = req.query

    if (typeof race_id !== 'string' || race_id.trim().length === 0) {
      res.status(400).json({ error: 'race_id query parameter is required' })
      return
    }

    const entrantIds = Array.isArray(entrants)
      ? entrants.flatMap((value) => parseEntrantIdsParam(value))
      : parseEntrantIdsParam(entrants)

    if (entrantIds.length === 0) {
      res.status(400).json({ error: 'At least one entrant ID is required' })
      return
    }

    const poolTypeCandidate =
      typeof pool_type === 'string' ? pool_type : (pool_type as string | undefined) ?? 'win'
    const parsedPoolType = parsePoolTypeParam(poolTypeCandidate)
    if (parsedPoolType === null) {
      res.status(400).json({
        error: 'Invalid pool_type parameter',
        message: `pool_type must be one of: ${[...VALID_POOL_TYPES_SET].join(', ')}`,
        received: poolTypeCandidate,
      })
      return
    }

    const limitValue = parseIntegerParam(limit, 200, 1, 2000)
    const cursorValue = parseCursorParam(cursor_after)

    let createdAfterIso: string | null = null
    if (typeof created_after === 'string' && created_after.trim().length > 0) {
      const parsed = Date.parse(created_after)
      if (!Number.isNaN(parsed)) {
        createdAfterIso = new Date(parsed).toISOString()
      }
    }

    const client = await pool.connect()

    try {
      const baseValues: unknown[] = [race_id, entrantIds]
      const baseConditions: string[] = []

      if (cursorValue !== null) {
        const cursorParamIndex = baseValues.length + 1
        baseConditions.push(`id > $${String(cursorParamIndex)}`)
        baseValues.push(cursorValue)
      }

      if (createdAfterIso !== null) {
        const createdParamIndex = baseValues.length + 1
        baseConditions.push(`created_at > $${String(createdParamIndex)}`)
        baseValues.push(createdAfterIso)
      }

      baseValues.push(limitValue)
      const limitParamIndex = baseValues.length

      const whereSuffix =
        baseConditions.length > 0 ? ` AND ${baseConditions.join(' AND ')}` : ''

      const bucketedQuery = await client.query<MoneyFlowRow>(
        `
          SELECT
            id,
            race_id AS "raceId",
            entrant_id AS "entrantId",
            type,
            time_interval AS "timeInterval",
            time_to_start AS "timeToStart",
            interval_type AS "intervalType",
            hold_percentage AS "holdPercentage",
            incremental_win_amount AS "incrementalWinAmount",
            incremental_place_amount AS "incrementalPlaceAmount",
            win_pool_amount AS "winPoolAmount",
            place_pool_amount AS "placePoolAmount",
            win_pool_percentage AS "winPoolPercentage",
            place_pool_percentage AS "placePoolPercentage",
            NULL::numeric AS "fixedWinOdds",
            NULL::numeric AS "fixedPlaceOdds",
            NULL::numeric AS "poolWinOdds",
            NULL::numeric AS "poolPlaceOdds",
            event_timestamp AS "eventTimestamp",
            polling_timestamp AS "pollingTimestamp",
            created_at AS "createdAt"
          FROM money_flow_history
          WHERE race_id = $1
            AND entrant_id = ANY($2)
            AND type = 'bucketed_aggregation'
            AND time_interval IS NOT NULL
            AND time_interval > -65
            AND time_interval < 66
            ${whereSuffix}
          ORDER BY time_interval ASC, created_at ASC
          LIMIT $${limitParamIndex.toString()}
        `,
        baseValues
      )

      let documents: MoneyFlowDocument[] = bucketedQuery.rows.map((row) =>
        castTimelineRow(row)
      )
      let bucketedData = true

      if (documents.length === 0) {
        bucketedData = false
        const fallbackValues: unknown[] = [race_id, entrantIds]
        const fallbackConditions: string[] = []

        if (cursorValue !== null) {
          const cursorParamIndex = fallbackValues.length + 1
          fallbackConditions.push(`id > $${String(cursorParamIndex)}`)
          fallbackValues.push(cursorValue)
        }

        if (createdAfterIso !== null) {
          const createdParamIndex = fallbackValues.length + 1
          fallbackConditions.push(`created_at > $${String(createdParamIndex)}`)
          fallbackValues.push(createdAfterIso)
        }

        fallbackValues.push(limitValue)
        const fallbackLimitIndex = fallbackValues.length
        const fallbackWhere =
          fallbackConditions.length > 0
            ? ` AND ${fallbackConditions.join(' AND ')}`
            : ''

        const fallbackQuery = await client.query<MoneyFlowRow>(
          `
            SELECT
              id,
              race_id AS "raceId",
              entrant_id AS "entrantId",
              type,
              time_interval AS "timeInterval",
              time_to_start AS "timeToStart",
              interval_type AS "intervalType",
              hold_percentage AS "holdPercentage",
              incremental_win_amount AS "incrementalWinAmount",
              incremental_place_amount AS "incrementalPlaceAmount",
              win_pool_amount AS "winPoolAmount",
              place_pool_amount AS "placePoolAmount",
              win_pool_percentage AS "winPoolPercentage",
              place_pool_percentage AS "placePoolPercentage",
              NULL::numeric AS "fixedWinOdds",
              NULL::numeric AS "fixedPlaceOdds",
              NULL::numeric AS "poolWinOdds",
              NULL::numeric AS "poolPlaceOdds",
              event_timestamp AS "eventTimestamp",
              polling_timestamp AS "pollingTimestamp",
              created_at AS "createdAt"
            FROM money_flow_history
            WHERE race_id = $1
              AND entrant_id = ANY($2)
              AND time_to_start IS NOT NULL
              AND time_to_start > -65
              AND time_to_start < 66
              ${fallbackWhere}
            ORDER BY time_to_start ASC, created_at ASC
            LIMIT $${fallbackLimitIndex.toString()}
          `,
          fallbackValues
        )

        documents = fallbackQuery.rows.map((row) => castTimelineRow(row))
      }

      const sortedDocuments = sortTimelineDocuments(documents)
      const apiDocuments = sortedDocuments.map(toTimelineApiDocument)
      const coverageResult = analyzeIntervalCoverage(sortedDocuments, entrantIds)
      const coverage = toIntervalCoverageApi(coverageResult)
      const { nextCursor, nextCreatedAt } = getNextCursorMetadata(sortedDocuments)

      res.json({
        success: true,
        documents: apiDocuments,
        total: sortedDocuments.length,
        race_id,
        entrant_ids: entrantIds,
        pool_type: parsedPoolType,
        bucketed_data: bucketedData,
        interval_coverage: coverage,
        next_cursor: nextCursor,
        next_created_at: nextCreatedAt,
        limit: limitValue,
        created_after: createdAfterIso,
        message:
          sortedDocuments.length === 0
            ? 'No timeline data available yet'
            : undefined,
        query_optimizations: getPoolTypeOptimizations(parsedPoolType, bucketedData),
      })
    } catch (error) {
      logger.error({ error }, 'Failed to fetch money flow timeline')
      res.status(500).json({
        error: 'Failed to fetch money flow timeline data',
        details: error instanceof Error ? error.message : 'Unknown error',
        context: {
          race_id,
          pool_type: pool_type ?? 'win',
          entrant_count: entrantIds.length,
        },
      })
    } finally {
      client.release()
    }
  }
)

clientCompatibilityRouter.get(
  '/user-alert-configs',
  async (req: Request, res: Response): Promise<void> => {
    const { user_id } = req.query
    const user_id_param =
      typeof user_id === 'string' && user_id.trim().length > 0
        ? user_id.trim()
        : DEFAULT_USER_ID

    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      let rows = await selectUserAlertConfigs(client, user_id_param)

      if (rows.length === 0) {
        await createDefaultIndicatorsForUser(client, user_id_param)
        rows = await selectUserAlertConfigs(client, user_id_param)
      } else {
        await ensureAllDisplayOrders(
          client,
          user_id_param,
          rows.map((row) => Number(row.displayOrder ?? 0))
        )
        rows = await selectUserAlertConfigs(client, user_id_param)
      }

      await client.query('COMMIT')

      const indicators: AlertConfigApiRow[] = rows.map(mapAlertRow)
      const toggle_all = indicators.every((indicator) => indicator.enabled)
      const audible_alerts_enabled =
        indicators[0]?.audible_alerts_enabled ?? true

      res.json({
        user_id,
        indicators,
        toggle_all,
        audible_alerts_enabled,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      logger.error({ error }, 'Failed to load user alert configs')
      res.status(500).json({ error: 'Failed to load user alert configuration' })
    } finally {
      client.release()
    }
  }
)

clientCompatibilityRouter.post(
  '/user-alert-configs',
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Record<string, unknown> | undefined

    if (body === undefined) {
      res.status(400).json({ error: 'Request body is required' })
      return
    }

    const userIdRaw = body.user_id ?? body.userId
    const fallbackUserId =
      typeof userIdRaw === 'string' && userIdRaw.trim().length > 0
        ? userIdRaw.trim()
        : DEFAULT_USER_ID

    const audibleRaw = body.audible_alerts_enabled ?? body.audibleAlertsEnabled
    const audible_alerts_enabled =
      typeof audibleRaw === 'boolean'
        ? audibleRaw
        : typeof audibleRaw === 'string'
        ? audibleRaw.toLowerCase() !== 'false'
        : true

    const rawIndicators = body.indicators
    if (!Array.isArray(rawIndicators) || rawIndicators.length === 0) {
      res.status(400).json({ error: 'indicators array is required' })
      return
    }

    let parsedIndicators: IndicatorInput[]
    try {
      parsedIndicators = rawIndicators.map((item) =>
        parseIndicatorInput(item, fallbackUserId)
      )
    } catch (error) {
      res.status(400).json({
        error: 'Invalid indicator payload',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
      return
    }

    const user_id = parsedIndicators[0]?.user_id ?? fallbackUserId
    const inconsistentUser = parsedIndicators.some(
      (indicator) => indicator.user_id !== user_id
    )
    if (inconsistentUser) {
      res.status(400).json({
        error: 'All indicators must target the same user_id',
      })
      return
    }

    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      for (const indicator of parsedIndicators) {
        if (indicator.indicator_id !== null) {
          await client.query(
            `
              INSERT INTO user_alert_configs (
                indicator_id,
                user_id,
                indicator_type,
                percentage_range_min,
                percentage_range_max,
                color,
                is_default,
                enabled,
                display_order,
                audible_alerts_enabled
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              ON CONFLICT (indicator_id) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                indicator_type = EXCLUDED.indicator_type,
                percentage_range_min = EXCLUDED.percentage_range_min,
                percentage_range_max = EXCLUDED.percentage_range_max,
                color = EXCLUDED.color,
                is_default = EXCLUDED.is_default,
                enabled = EXCLUDED.enabled,
                display_order = EXCLUDED.display_order,
                audible_alerts_enabled = EXCLUDED.audible_alerts_enabled
            `,
            [
              indicator.indicator_id,
              user_id,
              indicator.indicator_type,
              indicator.percentage_range_min,
              indicator.percentage_range_max,
              indicator.color,
              indicator.is_default,
              indicator.enabled,
              indicator.display_order,
              audible_alerts_enabled,
            ]
          )
        } else {
          await client.query(
            `
              INSERT INTO user_alert_configs (
                user_id,
                indicator_type,
                percentage_range_min,
                percentage_range_max,
                color,
                is_default,
                enabled,
                display_order,
                audible_alerts_enabled
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT (user_id, display_order) DO UPDATE SET
                indicator_type = EXCLUDED.indicator_type,
                percentage_range_min = EXCLUDED.percentage_range_min,
                percentage_range_max = EXCLUDED.percentage_range_max,
                color = EXCLUDED.color,
                is_default = EXCLUDED.is_default,
                enabled = EXCLUDED.enabled,
                audible_alerts_enabled = EXCLUDED.audible_alerts_enabled
            `,
            [
              user_id,
              indicator.indicator_type,
              indicator.percentage_range_min,
              indicator.percentage_range_max,
              indicator.color,
              indicator.is_default,
              indicator.enabled,
              indicator.display_order,
              audible_alerts_enabled,
            ]
          )
        }
      }

      await ensureAllDisplayOrders(
        client,
        user_id,
        parsedIndicators.map((indicator) => indicator.display_order)
      )

      await client.query('COMMIT')

      const refreshedRows = await selectUserAlertConfigs(client, user_id)
      const indicators: AlertConfigApiRow[] = refreshedRows.map(mapAlertRow)
      const toggle_all = indicators.every((indicator) => indicator.enabled)

      res.json({
        success: true,
        user_id,
        indicators,
        toggle_all,
        audible_alerts_enabled,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      logger.error({ error }, 'Failed to update user alert configs')
      res.status(500).json({
        error: 'Failed to update user alert configuration',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      client.release()
    }
  }
)

clientCompatibilityRouter.get(
  '/races/upcoming',
  async (req: Request, res: Response): Promise<void> => {
    const { window_minutes, lookback_minutes, limit } = req.query

    const window_minutes_val = parseIntegerParam(window_minutes, 120, 0, 480)
    const lookback_minutes_val = parseIntegerParam(lookback_minutes, 5, 0, 120)
    const limit_value = parseIntegerParam(limit, 50, 1, 100)

    const now = Date.now()
    const lowerBound = new Date(now - lookback_minutes_val * 60_000).toISOString()
    const upperBound = new Date(now + window_minutes_val * 60_000).toISOString()

    try {
      const result = await pool.query<{
        race_id: string
        meeting_id: string
        name: string
        race_number: number
        start_time: Date
        status: string
        actual_start: Date | null
        created_at: Date | null
        updated_at: Date | null
      }>(
        `
          SELECT
            race_id,
            meeting_id,
            name,
            race_number,
            start_time,
            status,
            actual_start,
            created_at,
            updated_at
          FROM races
          WHERE start_time > $1
            AND start_time <= $2
            AND LOWER(status) NOT IN ('abandoned', 'final', 'finalized')
          ORDER BY start_time ASC
          LIMIT $3
        `,
        [lowerBound, upperBound, limit_value]
      )

      const races = result.rows.map((row) => ({
        race_id: row.race_id,
        meeting_id: row.meeting_id,
        name: row.name,
        race_number: row.race_number,
        start_time: toIsoString(row.start_time),
        status: row.status,
        actual_start: toIsoString(row.actual_start),
        created_at: toIsoString(row.created_at),
        updated_at: toIsoString(row.updated_at),
      }))

      res.json({
        races,
        total: result.rowCount,
        timestamp: new Date().toISOString(),
        window: {
          lower_bound: lowerBound,
          upper_bound: upperBound,
          window_minutes: window_minutes_val,
          lookback_minutes: lookback_minutes_val,
        },
      })
    } catch (error) {
      logger.error({ error }, 'Failed to fetch upcoming races')
      res.status(500).json({
        error: 'Failed to fetch upcoming races',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
)

clientCompatibilityRouter.get(
  '/races/next-scheduled',
  async (_req: Request, res: Response): Promise<void> => {
    const nowIso = new Date().toISOString()

    try {
      const result = await pool.query<{
        race_id: string
        meeting_id: string
        name: string
        race_number: number
        start_time: Date
        status: string
        actual_start: Date | null
        created_at: Date | null
        updated_at: Date | null
      }>(
        `
          SELECT
            race_id,
            meeting_id,
            name,
            race_number,
            start_time,
            status,
            actual_start,
            created_at,
            updated_at
          FROM races
          WHERE start_time > $1
            AND LOWER(status) NOT IN ('abandoned', 'final', 'finalized')
          ORDER BY start_time ASC
          LIMIT 1
        `,
        [nowIso]
      )

      if (result.rows.length === 0) {
        res.json(null)
        return
      }

      const [rowCandidate] = result.rows
      if (rowCandidate === undefined) {
        throw new Error('Next scheduled race query returned no rows after presence check')
      }
      const row = rowCandidate
      res.json({
        race_id: row.race_id,
        meeting_id: row.meeting_id,
        name: row.name,
        race_number: row.race_number,
        start_time: toIsoString(row.start_time),
        status: row.status,
        actual_start: toIsoString(row.actual_start),
        created_at: toIsoString(row.created_at),
        updated_at: toIsoString(row.updated_at),
      })
    } catch (error) {
      logger.error({ error }, 'Failed to fetch next scheduled race')
      res.status(500).json({
        error: 'Failed to fetch next scheduled race',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
)

clientCompatibilityRouter.get(
  '/races/:race_id',
  async (req: Request, res: Response): Promise<void> => {
    const { race_id } = req.params

    if (typeof race_id !== 'string' || race_id.trim().length === 0) {
      res.status(400).json({ error: 'race_id path parameter is required' })
      return
    }

    try {
      const result = await pool.query<{
        raceId: string
        name: string | null
        raceNumber: number | null
        startTime: Date | null
        actualStart: Date | null
        status: string | null
        distance: number | null
        trackCondition: string | null
        weather: string | null
        type: string | null
        meetingId: string
        createdAt: Date | null
        updatedAt: Date | null
      }>(
        `
          SELECT
            race_id AS "raceId",
            name,
            race_number AS "raceNumber",
            start_time AS "startTime",
            actual_start AS "actualStart",
            status,
            distance,
            track_condition AS "trackCondition",
            weather,
            type,
            meeting_id AS "meetingId",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM races
          WHERE race_id = $1
          LIMIT 1
        `,
        [race_id]
      )

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Race not found' })
        return
      }

      const [row] = result.rows
      if (row === undefined) {
        res.status(404).json({ error: 'Race not found' })
        return
      }

      res.json({
        race_id: row.raceId,
        meeting_id: row.meetingId,
        name: row.name,
        race_number: row.raceNumber,
        start_time: row.startTime !== null ? toIsoString(row.startTime) : null,
        actual_start: row.actualStart !== null ? toIsoString(row.actualStart) : null,
        status: row.status,
        distance: row.distance,
        track_condition: row.trackCondition,
        weather: row.weather,
        type: row.type,
        created_at: row.createdAt !== null ? toIsoString(row.createdAt) : null,
        updated_at: row.updatedAt !== null ? toIsoString(row.updatedAt) : null,
      })
    } catch (error) {
      logger.error({ error }, 'Failed to fetch race by ID')
      res.status(500).json({ error: 'Failed to fetch race' })
    }
  }
)

/* eslint-enable @typescript-eslint/naming-convention */
