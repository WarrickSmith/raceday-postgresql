import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/appwrite-server'
import { Query } from 'node-appwrite'
import { jsonWithCompression } from '@/lib/http/compression'

const TIMELINE_SELECT_FIELDS = [
  '$id',
  '$createdAt',
  '$updatedAt',
  'race_id',
  'entrant_id',
  'type',
  'time_interval',
  'time_to_start',
  'interval_type',
  'hold_percentage',
  'incremental_win_amount',
  'incremental_place_amount',
  'winPoolAmount',
  'placePoolAmount',
  'winPoolPercentage',
  'placePoolPercentage',
  'fixed_win_odds',
  'fixed_place_odds',
  'pool_win_odds',
  'pool_place_odds',
  'eventTimestamp',
  'polling_timestamp',
]

const DEFAULT_TIMELINE_LIMIT = 200
const MAX_TIMELINE_LIMIT = 2000

// Valid pool types for API filtering
const VALID_POOL_TYPES = ['win', 'place', 'odds'] as const
type PoolType = typeof VALID_POOL_TYPES[number]

type EntrantValue = string | { entrant_id?: string; $id?: string; id?: string | number }

interface MoneyFlowDocument {
  entrant?: EntrantValue
  entrant_id?: string
  time_interval?: number
  time_to_start?: number
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(request.url)
  const entrant_ids = searchParams.get('entrants')?.split(',') || []
  const poolTypeParam = searchParams.get('poolType') || 'win'
  const { id: race_id } = await params
  
  try {

    // Validate poolType parameter
    if (!VALID_POOL_TYPES.includes(poolTypeParam as PoolType)) {
      return jsonWithCompression(
        request,
        {
          error: 'Invalid poolType parameter',
          message: `poolType must be one of: ${VALID_POOL_TYPES.join(', ')}`,
          received: poolTypeParam,
        },
        { status: 400 }
      )
    }

    const poolType = poolTypeParam as PoolType

    if (!race_id) {
      return jsonWithCompression(
        request,
        { error: 'Race ID is required' },
        { status: 400 }
      )
    }

    if (entrant_ids.length === 0) {
      return jsonWithCompression(
        request,
        { error: 'Entrant IDs are required' },
        { status: 400 }
      )
    }

    const { databases } = await createServerClient()
    const databaseId = 'raceday-db'

    const cursorAfter = searchParams.get('cursorAfter') || undefined
    const createdAfterParam = searchParams.get('createdAfter') || undefined
    const limitParam = searchParams.get('limit')
    const parsedLimit = limitParam ? Number(limitParam) : DEFAULT_TIMELINE_LIMIT
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.floor(parsedLimit), 1), MAX_TIMELINE_LIMIT)
      : DEFAULT_TIMELINE_LIMIT

    const buildBaseQueries = () => {
      const queries = [
        Query.equal('race_id', race_id),
        Query.equal('entrant_id', entrant_ids),
        Query.select(TIMELINE_SELECT_FIELDS),
        Query.orderAsc('$createdAt'),
        Query.limit(limit),
      ]

      if (cursorAfter) {
        queries.push(Query.cursorAfter(cursorAfter))
      }

      if (createdAfterParam) {
        queries.push(Query.greaterThan('$createdAt', createdAfterParam))
      }

      return queries
    }

    // Try bucketed data first (with time_interval field)
    let response
    try {
      response = await databases.listDocuments(
        databaseId,
        'money-flow-history',
        [
          ...buildBaseQueries(),
          Query.equal('type', 'bucketed_aggregation'),
          Query.isNotNull('time_interval'),
          Query.greaterThan('time_interval', -65),
          Query.lessThan('time_interval', 66),
        ]
      )
    } catch (error) {
      console.log(
        '📊 Error querying bucketed data (likely no data exists yet):',
        error
      )
      response = { documents: [], total: 0 }
    }

    // If no bucketed data found, fall back to legacy time_to_start data
    if (response.documents.length === 0) {
      console.log(
        '📊 No bucketed data found, falling back to legacy time_to_start data'
      )

      try {
        const broadResponse = await databases.listDocuments(
          databaseId,
          'money-flow-history',
          [
            Query.equal('race_id', race_id),
            Query.equal('entrant_id', entrant_ids),
            Query.limit(10),
          ]
        )

        console.log(
          `📊 Broad query found ${broadResponse.documents.length} total documents for entrants`
        )
        if (broadResponse.documents.length > 0) {
          console.log(
            '📊 Sample document fields:',
            Object.keys(broadResponse.documents[0]).filter(
              (k) => !k.startsWith('$')
            )
          )
          console.log(
            '📊 Sample document time_to_start values:',
            broadResponse.documents.map((d) => d.time_to_start).slice(0, 5)
          )
        }

        response = await databases.listDocuments(
          databaseId,
          'money-flow-history',
          [
            ...buildBaseQueries(),
            Query.isNotNull('time_to_start'),
            Query.greaterThan('time_to_start', -65),
            Query.lessThan('time_to_start', 66),
          ]
        )
      } catch (legacyError) {
        console.log(
          '📊 Error querying legacy data (likely collection is empty):',
          legacyError
        )
        response = { documents: [], total: 0 }
      }

      const sortedDocuments = sortTimelineDocuments(
        response.documents as MoneyFlowDocument[]
      )
      const { nextCursor, nextCreatedAt } = getNextCursorMetadata(
        response.documents
      )

      return jsonWithCompression(request, {
        success: true,
        documents: sortedDocuments,
        total: response.total,
        race_id,
        entrant_ids,
        poolType, // Include requested pool type in response
        bucketedData: false, // Indicate this is legacy data
        nextCursor,
        nextCreatedAt,
        limit,
        createdAfter: createdAfterParam ?? null,
        message:
          response.documents.length === 0
            ? 'No timeline data available yet - collection may be empty after reinitialization'
            : undefined,
        queryOptimizations: getPoolTypeOptimizations(poolType, false),
      })
    }

    // Add interval coverage analysis for debugging
    const sortedDocuments = sortTimelineDocuments(
      response.documents as MoneyFlowDocument[]
    )
    const intervalCoverage = analyzeIntervalCoverage(
      sortedDocuments,
      entrant_ids
    )
    const { nextCursor, nextCreatedAt } = getNextCursorMetadata(
      response.documents
    )

    console.log('📊 Timeline interval coverage analysis:', intervalCoverage)

    return jsonWithCompression(request, {
      success: true,
      documents: sortedDocuments,
      total: response.total,
      race_id,
      entrant_ids,
      poolType, // Include requested pool type in response
      bucketedData: true,
      intervalCoverage,
      nextCursor,
      nextCreatedAt,
      limit,
      createdAfter: createdAfterParam ?? null,
      message:
        response.documents.length === 0
          ? 'No timeline data available yet - collection may be empty after reinitialization'
          : undefined,
      queryOptimizations: getPoolTypeOptimizations(poolType, true),
    })
  } catch (error) {
    console.error('Error fetching money flow timeline:', error)
    
    // Enhanced error handling with context
    const errorResponse = {
      error: 'Failed to fetch money flow timeline data',
      details: error instanceof Error ? error.message : 'Unknown error',
      context: {
        race_id: race_id || 'unknown',
        poolType: poolTypeParam || 'unknown',
        entrantCount: entrant_ids?.length || 0
      }
    }

    // Check for specific error types
    if (error instanceof Error) {
      // Database connection errors
      if (error.message.includes('database') || error.message.includes('connection')) {
        errorResponse.error = 'Database connection error'
        errorResponse.details = 'Unable to connect to race data database'
      }
      // Query errors (possibly related to poolType filtering)
      else if (error.message.includes('query') || error.message.includes('filter')) {
        errorResponse.error = 'Data query error'
        errorResponse.details = 'Error processing timeline data request'
      }
    }

    return jsonWithCompression(request, errorResponse, { status: 500 })
  }
}

/**
 * Get poolType-specific query optimizations documentation
 */
function getPoolTypeOptimizations(
  poolType: PoolType,
  bucketedData: boolean
): string[] {
  const baseOptimizations = [
    'Scalar filters on race_id and entrant_id',
    'Time interval filtering',
    bucketedData ? 'Bucketed storage' : 'Legacy time_to_start data',
    bucketedData ? 'Pre-calculated incrementals' : 'Raw data fallback',
    'Cursor-based incremental retrieval ($createdAt + cursorAfter)',
    'Extended range (-65 to +66)',
  ]

  const poolSpecificOptimizations = {
    win: [
      'Consolidated data includes Win pool fields (incremental_win_amount, winPoolAmount, winPoolPercentage)',
      'Consolidated data includes Fixed Win odds (fixed_win_odds)',
      'Consolidated data includes Pool Win odds (pool_win_odds)',
      'Client-side filtering for Win pool view'
    ],
    place: [
      'Consolidated data includes Place pool fields (incremental_place_amount, placePoolAmount, placePoolPercentage)', 
      'Consolidated data includes Fixed Place odds (fixed_place_odds)',
      'Consolidated data includes Pool Place odds (pool_place_odds)',
      'Client-side filtering for Place pool view'
    ],
    odds: [
      'Consolidated data includes all odds types (fixed_win_odds, fixed_place_odds, pool_win_odds, pool_place_odds)',
      'Consolidated data includes Win pool reference fields (winPoolAmount, winPoolPercentage)',
      'Client-side filtering for Odds timeline view'
    ]
  }

  return [...baseOptimizations, ...poolSpecificOptimizations[poolType]]
}

/**
 * Analyze interval coverage to identify gaps in timeline data
 */
function sortTimelineDocuments(documents: MoneyFlowDocument[]) {
  const getIntervalValue = (doc: MoneyFlowDocument) => {
    if (typeof doc.time_interval === 'number') {
      return doc.time_interval
    }

    if (typeof doc.time_to_start === 'number') {
      return doc.time_to_start
    }

    return Number.MAX_SAFE_INTEGER
  }

  const getCreatedAt = (doc: MoneyFlowDocument) => {
    const raw = (doc as { $createdAt?: string }).$createdAt
    const parsed = raw ? Date.parse(raw) : NaN
    return Number.isFinite(parsed) ? parsed : 0
  }

  return [...documents].sort((a, b) => {
    const intervalDelta = getIntervalValue(a) - getIntervalValue(b)
    if (intervalDelta !== 0) {
      return intervalDelta
    }

    return getCreatedAt(a) - getCreatedAt(b)
  })
}

function getNextCursorMetadata(
  documents: Array<{ $id?: string; $createdAt?: string }>
) {
  const lastDocument =
    documents.length > 0 ? documents[documents.length - 1] : undefined

  return {
    nextCursor: lastDocument?.$id ?? null,
    nextCreatedAt: lastDocument?.$createdAt ?? null,
  }
}

function analyzeIntervalCoverage(
  documents: MoneyFlowDocument[],
  entrant_ids: string[]
) {
  if (!documents || documents.length === 0) {
    return {
      totalDocuments: 0,
      entrantsCovered: 0,
      intervalsCovered: [] as number[],
      criticalPeriodGaps: [] as {
        entrant_id: string
        missingIntervals: number[]
      }[],
      coverageReport: 'No documents to analyze',
    }
  }

  // Expected critical timeline intervals (5m-0s period focus)
  const criticalIntervals: number[] = [
    60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 4, 3, 2, 1, 0,
  ]
  // Note: Post-start intervals like [-0.5, -1, -1.5, -2, -2.5, -3] handled dynamically

  // Analyze coverage per entrant
  type EntrantCoverage = {
    documentCount: number
    intervalsCovered: number[]
    criticalPeriodCoverage: number[]
    missingCriticalIntervals: number[]
  }
  const entrantCoverage = new Map<string, EntrantCoverage>()

  entrant_ids.forEach((entrant_id: string) => {
    const entrantDocs = documents.filter((doc) => {
      const docEntrantId = doc.entrant_id || resolveEntrantId(doc.entrant)
      return docEntrantId === entrant_id
    })

    const intervals: number[] = entrantDocs
      .map((doc) =>
        typeof doc.time_interval === 'number'
          ? doc.time_interval
          : typeof doc.time_to_start === 'number'
          ? doc.time_to_start
          : -999
      )
      .filter((interval) => interval !== -999)

    entrantCoverage.set(entrant_id, {
      documentCount: entrantDocs.length,
      intervalsCovered: [...new Set(intervals)].sort((a, b) => b - a),
      criticalPeriodCoverage: criticalIntervals.filter((interval) =>
        intervals.includes(interval)
      ),
      missingCriticalIntervals: criticalIntervals.filter(
        (interval) => !intervals.includes(interval)
      ),
    })
  })

  // Identify gaps in critical 5m-0s period
  const criticalGaps: { entrant_id: string; missingIntervals: number[] }[] = []
  entrantCoverage.forEach((coverage, entrant_id) => {
    const missing5mTo0s = coverage.missingCriticalIntervals.filter(
      (interval: number) => interval >= 0 && interval <= 5
    )
    if (missing5mTo0s.length > 0) {
      criticalGaps.push({
        entrant_id: entrant_id.slice(-8), // Show last 8 chars for privacy
        missingIntervals: missing5mTo0s,
      })
    }
  })

  return {
    totalDocuments: documents.length,
    entrantsCovered: entrantCoverage.size,
    intervalsCovered: [
      ...new Set(
        documents
          .map((doc) =>
            typeof doc.time_interval === 'number'
              ? doc.time_interval
              : doc.time_to_start
          )
          .filter((interval): interval is number => typeof interval === 'number')
      ),
    ].sort((a, b) => b - a),
    criticalPeriodGaps: criticalGaps,
    entrantSampleCoverage: entrant_ids.slice(0, 2).map((id) => ({
      entrant_id: id.slice(-8),
      ...(entrantCoverage.get(id) || {
        documentCount: 0,
        intervalsCovered: [],
      }),
    })),
    coverageReport: `${entrantCoverage.size}/${entrant_ids.length} entrants have timeline data, ${criticalGaps.length} have 5m-0s gaps`,
  }
}

function resolveEntrantId(entrant?: EntrantValue): string {
  if (typeof entrant === 'string') {
    return entrant
  }

  if (entrant && typeof entrant === 'object') {
    if (typeof entrant.entrant_id === 'string') {
      return entrant.entrant_id
    }
    if (typeof entrant.$id === 'string') {
      return entrant.$id
    }
    if (typeof entrant.id === 'string' || typeof entrant.id === 'number') {
      return String(entrant.id)
    }
  }

  return 'unknown'
}
