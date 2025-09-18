import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/appwrite-server'
import { Query } from 'node-appwrite'

// Valid pool types for API filtering
const VALID_POOL_TYPES = ['win', 'place', 'odds'] as const
type PoolType = typeof VALID_POOL_TYPES[number]

type EntrantValue = string | { entrantId?: string; $id?: string; id?: string | number }

interface MoneyFlowDocument {
  entrant?: EntrantValue
  timeInterval?: number
  timeToStart?: number
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(request.url)
  const entrantIds = searchParams.get('entrants')?.split(',') || []
  const poolTypeParam = searchParams.get('poolType') || 'win'
  const { id: raceId } = await params
  
  try {

    // Validate poolType parameter
    if (!VALID_POOL_TYPES.includes(poolTypeParam as PoolType)) {
      return NextResponse.json(
        { 
          error: 'Invalid poolType parameter',
          message: `poolType must be one of: ${VALID_POOL_TYPES.join(', ')}`,
          received: poolTypeParam
        },
        { status: 400 }
      )
    }

    const poolType = poolTypeParam as PoolType

    if (!raceId) {
      return NextResponse.json(
        { error: 'Race ID is required' },
        { status: 400 }
      )
    }

    if (entrantIds.length === 0) {
      return NextResponse.json(
        { error: 'Entrant IDs are required' },
        { status: 400 }
      )
    }

    const { databases } = await createServerClient()
    const databaseId = 'raceday-db'

    // Try bucketed data first (with timeInterval field)
    let response
    try {
      response = await databases.listDocuments(
        databaseId,
        'money-flow-history',
        [
          Query.equal('entrant', entrantIds),
          Query.equal('raceId', raceId), // CRITICAL FIX: Enable raceId filter now that field exists
          Query.equal('type', 'bucketed_aggregation'), // Only bucketed aggregation records with pre-calculated increments
          Query.isNotNull('timeInterval'), // Only records with timeInterval (bucketed data)
          Query.greaterThan('timeInterval', -65), // Extended range to capture more pre/post race data
          Query.lessThan('timeInterval', 66), // Include 65m baseline data (using lessThan with 66)
          Query.orderAsc('timeInterval'), // Order by time interval
          Query.limit(2000), // Enough for high-frequency data
        ]
      )
    } catch (error) {
      console.log(
        '📊 Error querying bucketed data (likely no data exists yet):',
        error
      )
      response = { documents: [], total: 0 }
    }

    // If no bucketed data found, fall back to legacy timeToStart data
    if (response.documents.length === 0) {
      console.log(
        '📊 No bucketed data found, falling back to legacy timeToStart data'
      )

      // Try a broader query first to see if any data exists at all
      try {
        const broadResponse = await databases.listDocuments(
          databaseId,
          'money-flow-history',
          [
            Query.equal('entrant', entrantIds),
            Query.limit(10), // Just get a few records to see what exists
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
            '📊 Sample document timeToStart values:',
            broadResponse.documents.map((d) => d.timeToStart).slice(0, 5)
          )
        }

        response = await databases.listDocuments(
          databaseId,
          'money-flow-history',
          [
            Query.equal('entrant', entrantIds),
            Query.equal('raceId', raceId), // CRITICAL FIX: Enable raceId filter now that field exists
            Query.isNotNull('timeToStart'), // Only records with timeToStart
            Query.greaterThan('timeToStart', -65), // Extended range to capture more pre/post race data
            Query.lessThan('timeToStart', 66), // Include 65m baseline data (using lessThan with 66)
            Query.orderAsc('timeToStart'), // Order by time to start
            Query.limit(2000), // Enough for high-frequency data
          ]
        )
      } catch (legacyError) {
        console.log(
          '📊 Error querying legacy data (likely collection is empty):',
          legacyError
        )
        response = { documents: [], total: 0 }
      }

      return NextResponse.json({
        success: true,
        documents: response.documents,
        total: response.total,
        raceId,
        entrantIds,
        poolType, // Include requested pool type in response
        bucketedData: false, // Indicate this is legacy data
        message:
          response.documents.length === 0
            ? 'No timeline data available yet - collection may be empty after reinitialization'
            : undefined,
        queryOptimizations: getPoolTypeOptimizations(poolType, false),
      })
    }

    // Add interval coverage analysis for debugging
    const intervalCoverage = analyzeIntervalCoverage(
      response.documents as MoneyFlowDocument[],
      entrantIds
    )

    console.log('📊 Timeline interval coverage analysis:', intervalCoverage)

    return NextResponse.json({
      success: true,
      documents: response.documents,
      total: response.total,
      raceId,
      entrantIds,
      poolType, // Include requested pool type in response
      bucketedData: true,
      intervalCoverage,
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
        raceId: raceId || 'unknown',
        poolType: poolTypeParam || 'unknown',
        entrantCount: entrantIds?.length || 0
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

    return NextResponse.json(errorResponse, { status: 500 })
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
    'Time interval filtering',
    bucketedData ? 'Bucketed storage' : 'Legacy timeToStart data',
    bucketedData ? 'Pre-calculated incrementals' : 'Raw data fallback',
    'Extended range (-65 to +66)',
  ]

  const poolSpecificOptimizations = {
    win: [
      'Consolidated data includes Win pool fields (incrementalWinAmount, winPoolAmount, winPoolPercentage)',
      'Consolidated data includes Fixed Win odds (fixedWinOdds)',
      'Consolidated data includes Pool Win odds (poolWinOdds)',
      'Client-side filtering for Win pool view'
    ],
    place: [
      'Consolidated data includes Place pool fields (incrementalPlaceAmount, placePoolAmount, placePoolPercentage)', 
      'Consolidated data includes Fixed Place odds (fixedPlaceOdds)',
      'Consolidated data includes Pool Place odds (poolPlaceOdds)',
      'Client-side filtering for Place pool view'
    ],
    odds: [
      'Consolidated data includes all odds types (fixedWinOdds, fixedPlaceOdds, poolWinOdds, poolPlaceOdds)',
      'Consolidated data includes Win pool reference fields (winPoolAmount, winPoolPercentage)',
      'Client-side filtering for Odds timeline view'
    ]
  }

  return [...baseOptimizations, ...poolSpecificOptimizations[poolType]]
}

/**
 * Analyze interval coverage to identify gaps in timeline data
 */
function analyzeIntervalCoverage(
  documents: MoneyFlowDocument[],
  entrantIds: string[]
) {
  if (!documents || documents.length === 0) {
    return {
      totalDocuments: 0,
      entrantsCovered: 0,
      intervalsCovered: [] as number[],
      criticalPeriodGaps: [] as {
        entrantId: string
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

  entrantIds.forEach((entrantId: string) => {
    const entrantDocs = documents.filter((doc) => {
      const docEntrantId = resolveEntrantId(doc.entrant)
      return docEntrantId === entrantId
    })

    const intervals: number[] = entrantDocs
      .map((doc) =>
        typeof doc.timeInterval === 'number'
          ? doc.timeInterval
          : typeof doc.timeToStart === 'number'
          ? doc.timeToStart
          : -999
      )
      .filter((interval) => interval !== -999)

    entrantCoverage.set(entrantId, {
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
  const criticalGaps: { entrantId: string; missingIntervals: number[] }[] = []
  entrantCoverage.forEach((coverage, entrantId) => {
    const missing5mTo0s = coverage.missingCriticalIntervals.filter(
      (interval: number) => interval >= 0 && interval <= 5
    )
    if (missing5mTo0s.length > 0) {
      criticalGaps.push({
        entrantId: entrantId.slice(-8), // Show last 8 chars for privacy
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
            typeof doc.timeInterval === 'number'
              ? doc.timeInterval
              : doc.timeToStart
          )
          .filter((interval): interval is number => typeof interval === 'number')
      ),
    ].sort((a, b) => b - a),
    criticalPeriodGaps: criticalGaps,
    entrantSampleCoverage: entrantIds.slice(0, 2).map((id) => ({
      entrantId: id.slice(-8),
      ...(entrantCoverage.get(id) || {
        documentCount: 0,
        intervalsCovered: [],
      }),
    })),
    coverageReport: `${entrantCoverage.size}/${entrantIds.length} entrants have timeline data, ${criticalGaps.length} have 5m-0s gaps`,
  }
}

function resolveEntrantId(entrant?: EntrantValue): string {
  if (typeof entrant === 'string') {
    return entrant
  }

  if (entrant && typeof entrant === 'object') {
    if (typeof entrant.entrantId === 'string') {
      return entrant.entrantId
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
