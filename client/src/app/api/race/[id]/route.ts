import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, Query } from '@/lib/appwrite-server'
import {
  Race,
  Meeting,
  Entrant,
  MoneyFlowHistory,
  OddsHistoryData,
  RaceNavigationData,
} from '@/types/meetings'

const ODDS_HISTORY_QUERY_LIMIT = 500

/**
 * API route for client-side race data fetching
 * Reuses the same comprehensive data fetching logic as the page component
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raceId } = await params

    if (!raceId) {
      return NextResponse.json(
        { error: 'Race ID is required' },
        { status: 400 }
      )
    }

    // Check if this is a navigation request (fast mode)
    const url = new URL(request.url)
    const isNavigation = url.searchParams.get('nav') === 'true'

    const raceData = isNavigation
      ? await getNavigationRaceData(raceId)
      : await getComprehensiveRaceData(raceId)

    if (!raceData) {
      return NextResponse.json({ error: 'Race not found' }, { status: 404 })
    }

    // Set cache headers based on mode
    const response = NextResponse.json(raceData)

    if (isNavigation) {
      // Navigation mode: shorter cache for live data but still allow stale-while-revalidate
      response.headers.set(
        'Cache-Control',
        'public, max-age=15, stale-while-revalidate=60'
      )
    } else {
      // Comprehensive mode: balanced cache for full data
      response.headers.set(
        'Cache-Control',
        'public, max-age=30, stale-while-revalidate=120'
      )
    }

    // Add performance headers
    response.headers.set(
      'X-Race-Data-Mode',
      isNavigation ? 'navigation' : 'comprehensive'
    )
    response.headers.set('X-Race-ID', raceId)

    return response
  } catch (error) {
    console.error('API Error fetching race data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Comprehensive data fetching with batch optimization for race ecosystem
 * Identical to the server-side function in the page component
 */
async function getComprehensiveRaceData(raceId: string): Promise<{
  race: Race
  meeting: Meeting
  entrants: Entrant[]
  navigationData: RaceNavigationData
  dataFreshness: {
    lastUpdated: string
    entrantsDataAge: number
    oddsHistoryCount: number
    moneyFlowHistoryCount: number
  }
} | null> {
  try {
    const { databases } = await createServerClient()

    // Fetch race by raceId field (not $id)
    const raceQuery = await databases.listDocuments('raceday-db', 'races', [
      Query.equal('raceId', raceId),
      Query.limit(1),
    ])

    // Fetch race-results data for this race if it exists
    let raceResultsData = null
    if (raceQuery.documents.length > 0) {
      const raceDocumentId = raceQuery.documents[0].$id
      try {
        const raceResultsQuery = await databases.listDocuments('raceday-db', 'race-results', [
          Query.equal('race', raceDocumentId),
          Query.limit(1),
        ])
        
        if (raceResultsQuery.documents.length > 0) {
          raceResultsData = raceResultsQuery.documents[0]
        }
      } catch (error) {
        console.error('Error fetching race results:', error)
        // Continue without results data - not critical for race display
      }
    }

    if (!raceQuery.documents.length) {
      return null
    }

    const raceData = raceQuery.documents[0]

    // Validate that meeting data is populated
    if (!raceData.meeting || !raceData.meeting.meetingId) {
      return null
    }

    // The race already has the meeting data populated as a nested object
    // Convert to our expected format
    const race: Race = {
      $id: raceData.$id,
      $createdAt: raceData.$createdAt,
      $updatedAt: raceData.$updatedAt,
      raceId: raceData.raceId,
      raceNumber: raceData.raceNumber,
      name: raceData.name,
      startTime: raceData.startTime,
      actualStart: raceData.actualStart, // Include actual start time from database
      meeting: raceData.meeting.meetingId, // Extract the meetingId for the Race interface
      status: raceData.status,
      distance: raceData.distance,
      trackCondition: raceData.trackCondition,
      weather: raceData.weather,
      type: raceData.type, // Race type code (T, H, G) for category display
      // Results data fields from race-results collection
      resultsAvailable: raceResultsData?.resultsAvailable || false,
      resultsData: raceResultsData?.resultsData ? JSON.parse(raceResultsData.resultsData) : undefined,
      dividendsData: raceResultsData?.dividendsData ? JSON.parse(raceResultsData.dividendsData) : undefined,
      fixedOddsData: raceResultsData?.fixedOddsData ? JSON.parse(raceResultsData.fixedOddsData) : undefined,
      resultStatus: raceResultsData?.resultStatus,
      photoFinish: raceResultsData?.photoFinish || false,
      stewardsInquiry: raceResultsData?.stewardsInquiry || false,
      protestLodged: raceResultsData?.protestLodged || false,
      resultTime: raceResultsData?.resultTime,
    }

    const meeting: Meeting = {
      $id: raceData.meeting.$id,
      $createdAt: raceData.meeting.$createdAt,
      $updatedAt: raceData.meeting.$updatedAt,
      meetingId: raceData.meeting.meetingId,
      meetingName: raceData.meeting.meetingName,
      country: raceData.meeting.country,
      raceType: raceData.meeting.raceType,
      category: raceData.meeting.category,
      date: raceData.meeting.date,
      // Include weather if present in the Appwrite meeting document so client header can use it
      weather: raceData.meeting.weather ?? undefined,
    }

    // Fetch entrants for this race with batch optimization
    const entrantsQuery = await databases.listDocuments(
      'raceday-db',
      'entrants',
      [
        Query.equal('race', raceData.$id),
        Query.orderAsc('runnerNumber'), // Order by runner number for consistent display
      ]
    )

    // Calculate data freshness metrics
    const now = new Date()
    const entrantsDataAge =
      entrantsQuery.documents.length > 0
        ? Math.round(
            (now.getTime() -
              new Date(entrantsQuery.documents[0].$updatedAt).getTime()) /
              1000
          )
        : 0

    // Fetch money flow data for all entrants efficiently using batch query
    const entrantIds = entrantsQuery.documents.map((doc) => doc.$id)

    // Fetch navigation data - previous, next, and next scheduled races
    // Only exclude abandoned races from Next Scheduled query, not Previous/Next chronological navigation
    const [previousRaceQuery, nextRaceQuery, nextScheduledRaceQuery] =
      await Promise.all([
        // Previous race query - chronological navigation, includes all races
        databases.listDocuments('raceday-db', 'races', [
          Query.lessThan('startTime', raceData.startTime),
          Query.orderDesc('startTime'),
          Query.limit(1),
        ]),
        // Next race query - chronological navigation, includes all races
        databases.listDocuments('raceday-db', 'races', [
          Query.greaterThan('startTime', raceData.startTime),
          Query.orderAsc('startTime'),
          Query.limit(1),
        ]),
        // Next scheduled race query - exclude abandoned races (for "Next Scheduled" button)
        databases.listDocuments('raceday-db', 'races', [
          Query.greaterThan('startTime', now.toISOString()),
          Query.notEqual('status', 'Abandoned'),
          Query.orderAsc('startTime'),
          Query.limit(1),
        ]),
      ])

    // Only fetch history data if there are entrants (avoid empty Query.equal calls)
    const [moneyFlowQuery, oddsHistoryQuery] =
      entrantIds.length > 0
        ? await Promise.all([
            // Money flow history batch query
            databases.listDocuments('raceday-db', 'money-flow-history', [
              Query.equal('entrant', entrantIds), // Batch query for all entrants at once
              Query.orderDesc('$createdAt'),
              Query.limit(200), // Increased limit for comprehensive data
            ]),
            // Odds history batch query
            databases.listDocuments('raceday-db', 'odds-history', [
              Query.equal('entrant', entrantIds), // Batch query for all entrants at once
              Query.orderDesc('$createdAt'),
              Query.limit(ODDS_HISTORY_QUERY_LIMIT),
            ]),
          ])
        : [{ documents: [] }, { documents: [] }] // Return empty results if no entrants

    // Group results by entrant for processing with enhanced data structure
    const moneyFlowByEntrant = new Map<string, MoneyFlowHistory[]>()
    moneyFlowQuery.documents.forEach((doc) => {
      const moneyFlowDoc = doc as unknown as MoneyFlowHistory
      const entrantId = moneyFlowDoc.entrant
      if (!moneyFlowByEntrant.has(entrantId)) {
        moneyFlowByEntrant.set(entrantId, [])
      }
      moneyFlowByEntrant.get(entrantId)!.push(moneyFlowDoc)
    })

    // Group odds history results by entrant for processing and map to correct format
    const oddsHistoryByEntrant = new Map<string, OddsHistoryData[]>()
    oddsHistoryQuery.documents.forEach((doc) => {
      const rawDoc = doc as unknown as {
        entrant: string
        type: string
        [key: string]: unknown
      }
      const entrantId = rawDoc.entrant

      // Only include win odds for sparklines (pool_win preferred, fixed_win as fallback)
      if (rawDoc.type !== 'pool_win' && rawDoc.type !== 'fixed_win') {
        return
      }

      // Map the database fields to the expected interface format
      const oddsHistoryDoc: OddsHistoryData = {
        $id: rawDoc.$id as string,
        $createdAt: rawDoc.$createdAt as string,
        $updatedAt: rawDoc.$updatedAt as string,
        entrant: rawDoc.entrant,
        winOdds: rawDoc.odds as number, // Map 'odds' field to 'winOdds'
        timestamp: (rawDoc.eventTimestamp || rawDoc.$createdAt) as string,
      }

      if (!oddsHistoryByEntrant.has(entrantId)) {
        oddsHistoryByEntrant.set(entrantId, [])
      }
      oddsHistoryByEntrant.get(entrantId)!.push(oddsHistoryDoc)
    })

    // Process money flow data for trend calculation
    const moneyFlowResults = entrantIds.map((entrantId) => {
      const histories = moneyFlowByEntrant.get(entrantId) || []
      // Sort by creation date descending and take only the 2 most recent
      histories.sort(
        (a, b) =>
          new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime()
      )
      return { documents: histories.slice(0, 2) }
    })
    const moneyFlowMap = new Map()

    moneyFlowResults.forEach((result, index) => {
      const entrantId = entrantIds[index]
      const histories = result.documents

      if (histories.length > 0) {
        const current = histories[0]
        const previous = histories[1]

        let trend: 'up' | 'down' | 'neutral' = 'neutral'
        if (previous && current.holdPercentage !== previous.holdPercentage) {
          trend =
            current.holdPercentage > previous.holdPercentage ? 'up' : 'down'
        }

        moneyFlowMap.set(entrantId, {
          holdPercentage: current.holdPercentage,
          previousHoldPercentage: previous?.holdPercentage,
          moneyFlowTrend: trend,
        })
      }
    })

    const entrants: Entrant[] = entrantsQuery.documents.map((doc) => {
      const moneyFlowData = moneyFlowMap.get(doc.$id) || {}

      // Get odds history data for this entrant, sorted by creation date ascending for sparkline
      const oddsHistory = oddsHistoryByEntrant.get(doc.$id) || []
      oddsHistory.sort(
        (a, b) =>
          new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime()
      )

      return {
        $id: doc.$id,
        $createdAt: doc.$createdAt,
        $updatedAt: doc.$updatedAt,
        entrantId: doc.entrantId,
        name: doc.name,
        runnerNumber: doc.runnerNumber,
        jockey: doc.jockey,
        trainerName: doc.trainerName,
        weight: doc.weight,
        silkUrl: doc.silkUrl,
        silkColours: doc.silkColours,
        silkUrl64: doc.silkUrl64,
        silkUrl128: doc.silkUrl128,
        isScratched: doc.isScratched,
        race: doc.race,
        winOdds: doc.fixedWinOdds || doc.poolWinOdds,
        placeOdds: doc.fixedPlaceOdds || doc.poolPlaceOdds,
        oddsHistory: oddsHistory, // Add odds history data for sparkline
        ...moneyFlowData,
      }
    })

    // Process navigation data with meeting information
    const navigationData: RaceNavigationData = {
      previousRace:
        previousRaceQuery.documents.length > 0
          ? {
              raceId: previousRaceQuery.documents[0].raceId,
              name: previousRaceQuery.documents[0].name,
              startTime: previousRaceQuery.documents[0].startTime,
              meetingName:
                previousRaceQuery.documents[0].meeting?.meetingName ||
                'Unknown Meeting',
            }
          : null,
      nextRace:
        nextRaceQuery.documents.length > 0
          ? {
              raceId: nextRaceQuery.documents[0].raceId,
              name: nextRaceQuery.documents[0].name,
              startTime: nextRaceQuery.documents[0].startTime,
              meetingName:
                nextRaceQuery.documents[0].meeting?.meetingName ||
                'Unknown Meeting',
            }
          : null,
      nextScheduledRace:
        nextScheduledRaceQuery.documents.length > 0
          ? {
              raceId: nextScheduledRaceQuery.documents[0].raceId,
              name: nextScheduledRaceQuery.documents[0].name,
              startTime: nextScheduledRaceQuery.documents[0].startTime,
              meetingName:
                nextScheduledRaceQuery.documents[0].meeting?.meetingName ||
                'Unknown Meeting',
            }
          : null,
    }

    // Calculate comprehensive data freshness metrics
    const dataFreshness = {
      lastUpdated: now.toISOString(),
      entrantsDataAge,
      oddsHistoryCount: oddsHistoryQuery.documents.length,
      moneyFlowHistoryCount: moneyFlowQuery.documents.length,
    }

    return {
      race,
      meeting,
      entrants,
      navigationData,
      dataFreshness,
    }
  } catch (error) {
    console.error('Error fetching race details:', error)
    return null
  }
}

/**
 * Fast navigation data fetching - optimized for speed
 * Only fetches essential data needed for navigation updates
 */
async function getNavigationRaceData(raceId: string): Promise<{
  race: Race
  meeting: Meeting
  entrants: Entrant[]
  navigationData: RaceNavigationData
  dataFreshness: {
    lastUpdated: string
    entrantsDataAge: number
    oddsHistoryCount: number
    moneyFlowHistoryCount: number
  }
} | null> {
  try {
    const { databases } = await createServerClient()

    // Fetch race with meeting data - only essential fields
    const raceQuery = await databases.listDocuments('raceday-db', 'races', [
      Query.equal('raceId', raceId),
      Query.limit(1),
    ])

    // Fetch race-results data for this race if it exists
    let raceResultsData = null
    if (raceQuery.documents.length > 0) {
      const raceDocumentId = raceQuery.documents[0].$id
      try {
        const raceResultsQuery = await databases.listDocuments('raceday-db', 'race-results', [
          Query.equal('race', raceDocumentId),
          Query.limit(1),
        ])
        
        if (raceResultsQuery.documents.length > 0) {
          raceResultsData = raceResultsQuery.documents[0]
        }
      } catch (error) {
        console.error('Error fetching race results:', error)
        // Continue without results data - not critical for navigation display
      }
    }

    if (!raceQuery.documents.length) {
      return null
    }

    const raceData = raceQuery.documents[0]

    if (!raceData.meeting || !raceData.meeting.meetingId) {
      return null
    }

    // Convert to expected format (same as comprehensive version)
    const race: Race = {
      $id: raceData.$id,
      $createdAt: raceData.$createdAt,
      $updatedAt: raceData.$updatedAt,
      raceId: raceData.raceId,
      raceNumber: raceData.raceNumber,
      name: raceData.name,
      startTime: raceData.startTime,
      actualStart: raceData.actualStart, // Include actual start time from database
      meeting: raceData.meeting.meetingId,
      status: raceData.status,
      distance: raceData.distance,
      trackCondition: raceData.trackCondition,
      weather: raceData.weather,
      type: raceData.type, // Race type code (T, H, G) for category display
      // Results data fields from race-results collection
      resultsAvailable: raceResultsData?.resultsAvailable || false,
      resultsData: raceResultsData?.resultsData ? JSON.parse(raceResultsData.resultsData) : undefined,
      dividendsData: raceResultsData?.dividendsData ? JSON.parse(raceResultsData.dividendsData) : undefined,
      fixedOddsData: raceResultsData?.fixedOddsData ? JSON.parse(raceResultsData.fixedOddsData) : undefined,
      resultStatus: raceResultsData?.resultStatus,
      photoFinish: raceResultsData?.photoFinish || false,
      stewardsInquiry: raceResultsData?.stewardsInquiry || false,
      protestLodged: raceResultsData?.protestLodged || false,
      resultTime: raceResultsData?.resultTime,
    }

    const meeting: Meeting = {
      $id: raceData.meeting.$id,
      $createdAt: raceData.meeting.$createdAt,
      $updatedAt: raceData.meeting.$updatedAt,
      meetingId: raceData.meeting.meetingId,
      meetingName: raceData.meeting.meetingName,
      country: raceData.meeting.country,
      raceType: raceData.meeting.raceType,
      category: raceData.meeting.category,
      date: raceData.meeting.date,
      // Ensure weather is populated from the meeting document when available
      weather: raceData.meeting.weather ?? undefined,
    }

    // Fetch basic entrants data - no history data for speed
    const entrantsQuery = await databases.listDocuments(
      'raceday-db',
      'entrants',
      [Query.equal('race', raceData.$id), Query.orderAsc('runnerNumber')]
    )

    // Calculate basic data freshness
    const now = new Date()
    const entrantsDataAge =
      entrantsQuery.documents.length > 0
        ? Math.round(
            (now.getTime() -
              new Date(entrantsQuery.documents[0].$updatedAt).getTime()) /
              1000
          )
        : 0

    // Only fetch navigation data - skip history data for speed
    const [previousRaceQuery, nextRaceQuery, nextScheduledRaceQuery] =
      await Promise.all([
        databases.listDocuments('raceday-db', 'races', [
          Query.lessThan('startTime', raceData.startTime),
          Query.orderDesc('startTime'),
          Query.limit(1),
        ]),
        databases.listDocuments('raceday-db', 'races', [
          Query.greaterThan('startTime', raceData.startTime),
          Query.orderAsc('startTime'),
          Query.limit(1),
        ]),
        databases.listDocuments('raceday-db', 'races', [
          Query.greaterThan('startTime', now.toISOString()),
          Query.orderAsc('startTime'),
          Query.limit(1),
        ]),
      ])

    // Basic entrant mapping without history data for speed
    const entrants: Entrant[] = entrantsQuery.documents.map((doc) => ({
      $id: doc.$id,
      $createdAt: doc.$createdAt,
      $updatedAt: doc.$updatedAt,
      entrantId: doc.entrantId,
      name: doc.name,
      runnerNumber: doc.runnerNumber,
      jockey: doc.jockey,
      trainerName: doc.trainerName,
      weight: doc.weight,
      silkUrl: doc.silkUrl,
      silkColours: doc.silkColours,
      silkUrl64: doc.silkUrl64,
      silkUrl128: doc.silkUrl128,
      isScratched: doc.isScratched,
      race: doc.race,
      winOdds: doc.fixedWinOdds || doc.poolWinOdds,
      placeOdds: doc.fixedPlaceOdds || doc.poolPlaceOdds,
      // Set basic defaults for UI - real-time updates will populate these
      oddsHistory: [],
      holdPercentage: 0,
      moneyFlowTrend: 'neutral',
    }))

    // Navigation data processing (same as comprehensive)
    const navigationData: RaceNavigationData = {
      previousRace:
        previousRaceQuery.documents.length > 0
          ? {
              raceId: previousRaceQuery.documents[0].raceId,
              name: previousRaceQuery.documents[0].name,
              startTime: previousRaceQuery.documents[0].startTime,
              meetingName:
                previousRaceQuery.documents[0].meeting?.meetingName ||
                'Unknown Meeting',
            }
          : null,
      nextRace:
        nextRaceQuery.documents.length > 0
          ? {
              raceId: nextRaceQuery.documents[0].raceId,
              name: nextRaceQuery.documents[0].name,
              startTime: nextRaceQuery.documents[0].startTime,
              meetingName:
                nextRaceQuery.documents[0].meeting?.meetingName ||
                'Unknown Meeting',
            }
          : null,
      nextScheduledRace:
        nextScheduledRaceQuery.documents.length > 0
          ? {
              raceId: nextScheduledRaceQuery.documents[0].raceId,
              name: nextScheduledRaceQuery.documents[0].name,
              startTime: nextScheduledRaceQuery.documents[0].startTime,
              meetingName:
                nextScheduledRaceQuery.documents[0].meeting?.meetingName ||
                'Unknown Meeting',
            }
          : null,
    }

    const dataFreshness = {
      lastUpdated: now.toISOString(),
      entrantsDataAge,
      oddsHistoryCount: 0, // No history data in navigation mode
      moneyFlowHistoryCount: 0, // No history data in navigation mode
    }

    return {
      race,
      meeting,
      entrants,
      navigationData,
      dataFreshness,
    }
  } catch (error) {
    console.error('Error fetching navigation race data:', error)
    return null
  }
}
