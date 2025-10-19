/* eslint-disable @typescript-eslint/naming-convention */

import { Router, type Request, type Response } from 'express'
import { pool } from '../../database/pool.js'
import { logger } from '../../shared/logger.js'

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

export const clientCompatibilityRouter = Router()

clientCompatibilityRouter.get(
  '/meetings',
  async (req: Request, res: Response): Promise<void> => {
    const { date, raceType } = req.query

    const conditions: string[] = []
    const values: unknown[] = []

    if (date !== undefined) {
      const parameterIndex = conditions.length + 1
      conditions.push(`date = $${parameterIndex.toString()}::date`)
      values.push(date)
    }

    if (raceType !== undefined) {
      const parameterIndex = conditions.length + 1
      conditions.push(`race_type = $${parameterIndex.toString()}`)
      values.push(raceType)
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
  '/races',
  async (req: Request, res: Response): Promise<void> => {
    const { meetingId } = req.query

    if (meetingId === undefined || meetingId === '') {
      res.status(400).json({ error: 'meetingId query parameter is required' })
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
        [meetingId]
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
  '/entrants',
  async (req: Request, res: Response): Promise<void> => {
    const { raceId } = req.query

    if (raceId === undefined || raceId === '') {
      res.status(400).json({ error: 'raceId query parameter is required' })
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
        [raceId]
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

/* eslint-enable @typescript-eslint/naming-convention */
