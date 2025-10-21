export type PoolType = 'win' | 'place' | 'odds'

export const VALID_POOL_TYPES: readonly PoolType[] = ['win', 'place', 'odds'] as const

export interface MoneyFlowRow {
  id: number | string
  raceId: string
  entrantId: string
  type: string | null
  timeInterval: number | string | null
  timeToStart: number | string | null
  intervalType: string | null
  holdPercentage: number | string | null
  incrementalWinAmount: number | string | null
  incrementalPlaceAmount: number | string | null
  winPoolAmount: number | string | null
  placePoolAmount: number | string | null
  winPoolPercentage: number | string | null
  placePoolPercentage: number | string | null
  fixedWinOdds: number | string | null
  fixedPlaceOdds: number | string | null
  poolWinOdds: number | string | null
  poolPlaceOdds: number | string | null
  eventTimestamp: string | Date | null
  pollingTimestamp: string | Date | null
  createdAt: string | Date | null
}

export interface MoneyFlowDocument {
  id: number
  raceId: string
  entrantId: string
  type: string | null
  timeInterval: number | null
  timeToStart: number | null
  intervalType: string | null
  holdPercentage: number | null
  incrementalWinAmount: number | null
  incrementalPlaceAmount: number | null
  winPoolAmount: number | null
  placePoolAmount: number | null
  winPoolPercentage: number | null
  placePoolPercentage: number | null
  fixedWinOdds: number | null
  fixedPlaceOdds: number | null
  poolWinOdds: number | null
  poolPlaceOdds: number | null
  eventTimestamp: string | null
  pollingTimestamp: string | null
  createdAt: string | null
}

const parseDateOrNull = (value: Date | string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null
  }
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

export const castTimelineRow = (row: MoneyFlowRow): MoneyFlowDocument => ({
  id: Number(row.id),
  raceId: row.raceId,
  entrantId: row.entrantId,
  type: row.type,
  timeInterval: numberOrNull(row.timeInterval),
  timeToStart: numberOrNull(row.timeToStart),
  intervalType: row.intervalType,
  holdPercentage: numberOrNull(row.holdPercentage),
  incrementalWinAmount: numberOrNull(row.incrementalWinAmount),
  incrementalPlaceAmount: numberOrNull(row.incrementalPlaceAmount),
  winPoolAmount: numberOrNull(row.winPoolAmount),
  placePoolAmount: numberOrNull(row.placePoolAmount),
  winPoolPercentage: numberOrNull(row.winPoolPercentage),
  placePoolPercentage: numberOrNull(row.placePoolPercentage),
  fixedWinOdds: numberOrNull(row.fixedWinOdds),
  fixedPlaceOdds: numberOrNull(row.fixedPlaceOdds),
  poolWinOdds: numberOrNull(row.poolWinOdds),
  poolPlaceOdds: numberOrNull(row.poolPlaceOdds),
  eventTimestamp: parseDateOrNull(row.eventTimestamp),
  pollingTimestamp: parseDateOrNull(row.pollingTimestamp),
  createdAt: parseDateOrNull(row.createdAt),
})

export const sortTimelineDocuments = (
  documents: MoneyFlowDocument[]
): MoneyFlowDocument[] => {
  const getIntervalValue = (doc: MoneyFlowDocument): number => {
    if (typeof doc.timeInterval === 'number') {
      return doc.timeInterval
    }

    if (typeof doc.timeToStart === 'number') {
      return doc.timeToStart
    }

    return Number.MAX_SAFE_INTEGER
  }

  const getCreatedAt = (doc: MoneyFlowDocument): number => {
    if (doc.createdAt === null) {
      return 0
    }
    const parsed = Date.parse(doc.createdAt)
    return Number.isNaN(parsed) ? 0 : parsed
  }

  return [...documents].sort((a, b) => {
    const intervalDelta = getIntervalValue(a) - getIntervalValue(b)
    if (intervalDelta !== 0) {
      return intervalDelta
    }

    return getCreatedAt(a) - getCreatedAt(b)
  })
}

export interface IntervalCoverageGap {
  entrantIdSuffix: string
  missingIntervals: number[]
}

export interface IntervalCoverageSummary {
  totalDocuments: number
  entrantsCovered: number
  intervalsCovered: number[]
  criticalPeriodGaps: IntervalCoverageGap[]
  coverageReport: string
}

export interface IntervalCoverageMeta {
  entrantId: string
  documentCount: number
  intervalsCovered: number[]
  criticalPeriodCoverage: number[]
  missingCriticalIntervals: number[]
}

export interface IntervalCoverageResult {
  summary: IntervalCoverageSummary
  entrants: IntervalCoverageMeta[]
}

export const analyzeIntervalCoverage = (
  documents: MoneyFlowDocument[],
  entrantIds: string[]
): IntervalCoverageResult => {
  if (documents.length === 0) {
    return {
      summary: {
        totalDocuments: 0,
        entrantsCovered: 0,
        intervalsCovered: [],
        criticalPeriodGaps: [],
        coverageReport: 'No documents to analyze',
      },
      entrants: [],
    }
  }

  const criticalIntervals: number[] = [
    60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 4, 3, 2, 1, 0,
  ]

  const entrantCoverage = new Map<string, IntervalCoverageMeta>()

  entrantIds.forEach((entrantId) => {
    const entrantDocs = documents.filter((doc) => doc.entrantId === entrantId)

    const intervals: number[] = entrantDocs
      .map((doc) =>
        typeof doc.timeInterval === 'number'
          ? doc.timeInterval
          : typeof doc.timeToStart === 'number'
          ? doc.timeToStart
          : Number.NaN
      )
      .filter((interval) => Number.isFinite(interval))

    const uniqueIntervals = [...new Set(intervals)].sort((a, b) => b - a)
    const criticalCoverage = criticalIntervals.filter((interval) =>
      uniqueIntervals.includes(interval)
    )
    const missingCritical = criticalIntervals.filter(
      (interval) => !uniqueIntervals.includes(interval)
    )

    entrantCoverage.set(entrantId, {
      entrantId,
      documentCount: entrantDocs.length,
      intervalsCovered: uniqueIntervals,
      criticalPeriodCoverage: criticalCoverage,
      missingCriticalIntervals: missingCritical,
    })
  })

  const criticalGaps: IntervalCoverageGap[] = []
  entrantCoverage.forEach((coverage, entrantId) => {
    const missingIntervals = coverage.missingCriticalIntervals.filter(
      (interval) => interval >= 0 && interval <= 5
    )
    if (missingIntervals.length > 0) {
      criticalGaps.push({
        entrantIdSuffix: entrantId.slice(-8),
        missingIntervals,
      })
    }
  })

  const summary: IntervalCoverageSummary = {
    totalDocuments: documents.length,
    entrantsCovered: entrantCoverage.size,
    intervalsCovered: [
      ...new Set(
        [...entrantCoverage.values()].flatMap((meta) => meta.intervalsCovered)
      ),
    ].sort((a, b) => b - a),
    criticalPeriodGaps: criticalGaps,
    coverageReport:
      criticalGaps.length === 0
        ? 'Full coverage of critical 5-minute window'
        : 'Missing coverage in critical 5-minute window',
  }

  return {
    summary,
    entrants: [...entrantCoverage.values()],
  }
}

export const getNextCursorMetadata = (
  documents: MoneyFlowDocument[]
): { nextCursor: string | null; nextCreatedAt: string | null } => {
  const lastDocument = documents.at(-1)

  if (lastDocument === undefined) {
    return { nextCursor: null, nextCreatedAt: null }
  }

  return {
    nextCursor: String(lastDocument.id),
    nextCreatedAt: lastDocument.createdAt ?? null,
  }
}

/* eslint-disable @typescript-eslint/naming-convention */
export interface TimelineApiDocument {
  id: number
  race_id: string
  entrant_id: string
  type: string | null
  time_interval: number | null
  time_to_start: number | null
  interval_type: string | null
  hold_percentage: number | null
  incremental_win_amount: number | null
  incremental_place_amount: number | null
  win_pool_amount: number | null
  place_pool_amount: number | null
  win_pool_percentage: number | null
  place_pool_percentage: number | null
  fixed_win_odds: number | null
  fixed_place_odds: number | null
  pool_win_odds: number | null
  pool_place_odds: number | null
  event_timestamp: string | null
  polling_timestamp: string | null
  created_at: string | null
}

export const toTimelineApiDocument = (
  document: MoneyFlowDocument
): TimelineApiDocument => ({
  id: document.id,
  race_id: document.raceId,
  entrant_id: document.entrantId,
  type: document.type,
  time_interval: document.timeInterval,
  time_to_start: document.timeToStart,
  interval_type: document.intervalType,
  hold_percentage: document.holdPercentage,
  incremental_win_amount: document.incrementalWinAmount,
  incremental_place_amount: document.incrementalPlaceAmount,
  win_pool_amount: document.winPoolAmount,
  place_pool_amount: document.placePoolAmount,
  win_pool_percentage: document.winPoolPercentage,
  place_pool_percentage: document.placePoolPercentage,
  fixed_win_odds: document.fixedWinOdds,
  fixed_place_odds: document.fixedPlaceOdds,
  pool_win_odds: document.poolWinOdds,
  pool_place_odds: document.poolPlaceOdds,
  event_timestamp: document.eventTimestamp,
  polling_timestamp: document.pollingTimestamp,
  created_at: document.createdAt,
})

export interface IntervalCoverageApi {
  summary: {
    total_documents: number
    entrants_covered: number
    intervals_covered: number[]
    critical_period_gaps: { entrant_id: string; missing_intervals: number[] }[]
    coverage_report: string
  }
  entrants: {
    entrant_id: string
    document_count: number
    intervals_covered: number[]
    critical_period_coverage: number[]
    missing_critical_intervals: number[]
  }[]
}

export const toIntervalCoverageApi = (
  coverage: IntervalCoverageResult
): IntervalCoverageApi => ({
  summary: {
    total_documents: coverage.summary.totalDocuments,
    entrants_covered: coverage.summary.entrantsCovered,
    intervals_covered: coverage.summary.intervalsCovered,
    critical_period_gaps: coverage.summary.criticalPeriodGaps.map((gap) => ({
      entrant_id: gap.entrantIdSuffix,
      missing_intervals: gap.missingIntervals,
    })),
    coverage_report: coverage.summary.coverageReport,
  },
  entrants: coverage.entrants.map((entry) => ({
    entrant_id: entry.entrantId,
    document_count: entry.documentCount,
    intervals_covered: entry.intervalsCovered,
    critical_period_coverage: entry.criticalPeriodCoverage,
    missing_critical_intervals: entry.missingCriticalIntervals,
  })),
})
/* eslint-enable @typescript-eslint/naming-convention */

export const getPoolTypeOptimizations = (
  poolType: PoolType,
  bucketedData: boolean
): string[] => {
  const baseOptimizations = [
    'Scalar filters on race_id and entrant_id',
    'Time interval filtering',
    bucketedData ? 'Bucketed storage' : 'Legacy time_to_start data',
    bucketedData ? 'Pre-calculated incrementals' : 'Raw data fallback',
    'Cursor-based incremental retrieval (id & created_at)',
    'Extended range (-65 to +66)',
  ]

  const poolSpecificOptimizations: Record<PoolType, string[]> = {
    win: [
      'Includes Win pool incrementals and totals',
      'Includes fixed win odds snapshots',
      'Includes pool win odds snapshots',
      'Client can filter for Win view',
    ],
    place: [
      'Includes Place pool incrementals and totals',
      'Includes fixed place odds snapshots',
      'Includes pool place odds snapshots',
      'Client can filter for Place view',
    ],
    odds: [
      'Contains all odds fields (fixed and pool)',
      'Includes Win pool references for comparison',
      'Client can filter for Odds timeline view',
    ],
  }

  return [...baseOptimizations, ...poolSpecificOptimizations[poolType]]
}
