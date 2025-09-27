import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, Query } from '@/lib/appwrite-server'
import {
  Race,
  Meeting,
  Entrant,
  RaceNavigationData,
  type OddsHistoryData,
} from '@/types/meetings'
import {
  normalizeMeetingDocument,
  type EntrantDocument,
  type MeetingDocument,
  type MoneyFlowHistoryDocument,
  type RaceDocument,
  type RaceResultsDocument,
} from './appwriteTypes'
import type { Models } from 'node-appwrite'

const RACE_SELECT_FIELDS = [
  '$id',
  '$createdAt',
  '$updatedAt',
  'raceId',
  'raceNumber',
  'name',
  'startTime',
  'actualStart',
  'status',
  'distance',
  'trackCondition',
  'weather',
  'type',
  // Include base meeting field to support both string ID and expanded object shapes
  'meeting',
  'meeting.$id',
  'meeting.$createdAt',
  'meeting.$updatedAt',
  'meeting.meetingId',
  'meeting.meetingName',
  'meeting.country',
  'meeting.raceType',
  'meeting.category',
  'meeting.date',
  'meeting.weather',
]

const RACE_RESULTS_SELECT_FIELDS = [
  '$id',
  '$createdAt',
  '$updatedAt',
  'resultsAvailable',
  'resultsData',
  'dividendsData',
  'fixedOddsData',
  'resultStatus',
  'photoFinish',
  'stewardsInquiry',
  'protestLodged',
  'resultTime',
]

const ENTRANT_SELECT_FIELDS = [
  '$id',
  '$createdAt',
  '$updatedAt',
  'entrantId',
  'name',
  'runnerNumber',
  'jockey',
  'trainerName',
  'silkColours',
  'silkUrl64',
  'silkUrl128',
  'isScratched',
  'raceId',
  'fixedWinOdds',
  'poolWinOdds',
  'fixedPlaceOdds',
  'poolPlaceOdds',
]

const MONEY_FLOW_SELECT_FIELDS = [
  '$id',
  '$createdAt',
  '$updatedAt',
  'raceId',
  'entrantId',
  'holdPercentage',
  'fixedWinOdds',
  'poolWinOdds',
  'fixedPlaceOdds',
  'poolPlaceOdds',
]

const NAVIGATION_SELECT_FIELDS = [
  'raceId',
  'name',
  'startTime',
  'status',
]

type AppwriteDatabases = Awaited<ReturnType<typeof createServerClient>>['databases']

const createEmptyDocumentList = <T extends Models.Document>(): Models.DocumentList<T> => ({
  total: 0,
  documents: [],
})

const parseJson = <T>(value?: string | null): T | undefined => {
  if (!value) {
    return undefined
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

const normalizeResultStatus = (
  status?: string | null
): Race['resultStatus'] => {
  if (status === 'interim' || status === 'final' || status === 'protest') {
    return status
  }

  return undefined
}

async function fetchRaceResultsDocument(
  databases: AppwriteDatabases,
  raceId: string,
  raceDocId: string
): Promise<RaceResultsDocument | null> {
  const queryAttempts = [
    [Query.equal('raceId', raceId)],
    [Query.equal('race', raceDocId)],
  ]

  for (const attempt of queryAttempts) {
    try {
      const response = await databases.listDocuments<RaceResultsDocument>(
        'raceday-db',
        'race-results',
        [
          ...attempt,
          Query.select(RACE_RESULTS_SELECT_FIELDS),
          Query.limit(1),
        ]
      )

      if (response.documents.length > 0) {
        return response.documents[0]
      }
    } catch {
      // Ignore and try the next strategy - race-results data is non-critical
    }
  }

  return null
}


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
  } catch {
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

    let raceData: RaceDocument | null = null
    try {
      const raceQuery = await databases.listDocuments<RaceDocument>('raceday-db', 'races', [
        Query.equal('raceId', raceId),
        Query.select(RACE_SELECT_FIELDS),
        Query.limit(1),
      ])
      raceData = raceQuery.documents[0] ?? null
    } catch {}

    if (!raceData) {
      try {
        raceData = await databases.getDocument<RaceDocument>('raceday-db', 'races', raceId)
      } catch {
        return null
      }
    }

    const raceResultsData = await fetchRaceResultsDocument(
      databases,
      raceId,
      raceData.$id
    )

    let resolvedMeetingId: string | null = null
    let meetingDocument: MeetingDocument | null = null

    const raceMeetingField = raceData.meeting
    if (typeof raceMeetingField === 'string' && raceMeetingField) {
      resolvedMeetingId = raceMeetingField
    } else if (
      raceMeetingField &&
      typeof raceMeetingField === 'object' &&
      (raceMeetingField.meetingId || raceMeetingField.$id)
    ) {
      const castMeeting = raceMeetingField as MeetingDocument
      resolvedMeetingId = castMeeting.meetingId ?? castMeeting.$id ?? null
      meetingDocument = castMeeting
    }

    if (!resolvedMeetingId) {
      return null
    }

    if (!meetingDocument) {
      try {
        meetingDocument = await databases.getDocument<MeetingDocument>(
          'raceday-db',
          'meetings',
          resolvedMeetingId
        )
      } catch {
        meetingDocument = null
      }
    }

    const meeting = normalizeMeetingDocument(meetingDocument, {
      id: resolvedMeetingId,
      createdAt: raceData.$createdAt,
      updatedAt: raceData.$updatedAt,
    })

    const raceStartTime = raceData.startTime ?? raceData.$createdAt

    const race: Race = {
      $id: raceData.$id,
      $createdAt: raceData.$createdAt,
      $updatedAt: raceData.$updatedAt,
      raceId: raceData.raceId ?? raceData.$id,
      raceNumber: raceData.raceNumber ?? 0,
      name: raceData.name ?? 'Unknown Race',
      startTime: raceStartTime,
      actualStart: raceData.actualStart ?? undefined,
      meeting: resolvedMeetingId,
      status: raceData.status ?? 'Unknown',
      distance: raceData.distance,
      trackCondition: raceData.trackCondition,
      weather: raceData.weather,
      type: raceData.type,
      resultsAvailable: raceResultsData?.resultsAvailable ?? false,
      resultsData: parseJson<Race['resultsData']>(raceResultsData?.resultsData),
      dividendsData: parseJson<Race['dividendsData']>(raceResultsData?.dividendsData),
      fixedOddsData: parseJson<Race['fixedOddsData']>(raceResultsData?.fixedOddsData),
      resultStatus: normalizeResultStatus(raceResultsData?.resultStatus),
      photoFinish: raceResultsData?.photoFinish ?? false,
      stewardsInquiry: raceResultsData?.stewardsInquiry ?? false,
      protestLodged: raceResultsData?.protestLodged ?? false,
      resultTime: raceResultsData?.resultTime,
    }

    const entrantsQuery = await databases.listDocuments<EntrantDocument>(
      'raceday-db',
      'entrants',
      [
        Query.equal('raceId', raceId),
        Query.select(ENTRANT_SELECT_FIELDS),
        Query.orderAsc('runnerNumber'),
      ]
    )

    const now = new Date()
    const entrantsDataAge =
      entrantsQuery.documents.length > 0
        ? Math.round(
            (now.getTime() -
              new Date(entrantsQuery.documents[0].$updatedAt).getTime()) /
              1000
          )
        : 0

    const entrantKeys = entrantsQuery.documents.map(
      (doc) => doc.entrantId ?? doc.$id
    )

    const [previousRaceQuery, nextRaceQuery, nextScheduledRaceQuery] =
      await Promise.all([
        databases.listDocuments<RaceDocument>('raceday-db', 'races', [
          Query.lessThan('startTime', raceStartTime),
          Query.orderDesc('startTime'),
          Query.select(NAVIGATION_SELECT_FIELDS),
          Query.limit(1),
        ]),
        databases.listDocuments<RaceDocument>('raceday-db', 'races', [
          Query.greaterThan('startTime', raceStartTime),
          Query.orderAsc('startTime'),
          Query.select(NAVIGATION_SELECT_FIELDS),
          Query.limit(1),
        ]),
        databases.listDocuments<RaceDocument>('raceday-db', 'races', [
          Query.greaterThan('startTime', now.toISOString()),
          Query.notEqual('status', 'Abandoned'),
          Query.orderAsc('startTime'),
          Query.select(NAVIGATION_SELECT_FIELDS),
          Query.limit(1),
        ]),
      ])

    let moneyFlowQuery: Models.DocumentList<MoneyFlowHistoryDocument>
    if (entrantKeys.length > 0) {
      moneyFlowQuery = await databases.listDocuments<MoneyFlowHistoryDocument>(
        'raceday-db',
        'money-flow-history',
        [
          Query.equal('raceId', raceId),
          Query.equal('entrantId', entrantKeys),
          Query.select(MONEY_FLOW_SELECT_FIELDS),
          Query.orderDesc('$createdAt'),
          Query.limit(200),
        ]
      )
    } else {
      moneyFlowQuery = createEmptyDocumentList<MoneyFlowHistoryDocument>()
    }

    const moneyFlowByEntrant = new Map<string, MoneyFlowHistoryDocument[]>()
    moneyFlowQuery.documents.forEach((doc) => {
      const entrantKey = doc.entrantId ?? doc.entrant
      if (!entrantKey) {
        return
      }

      const histories = moneyFlowByEntrant.get(entrantKey)
      if (histories) {
        histories.push(doc)
      } else {
        moneyFlowByEntrant.set(entrantKey, [doc])
      }
    })

    const oddsHistoryByEntrant = new Map<string, OddsHistoryData[]>()
    moneyFlowQuery.documents.forEach((doc) => {
      const entrantKey = doc.entrantId ?? doc.entrant
      if (!entrantKey) {
        return
      }

      const winOdds = doc.fixedWinOdds ?? doc.poolWinOdds
      if (!winOdds || winOdds <= 0) {
        return
      }

      const oddsHistoryEntry: OddsHistoryData = {
        $id: doc.$id,
        $createdAt: doc.$createdAt,
        $updatedAt: doc.$updatedAt,
        entrant: entrantKey,
        winOdds,
        timestamp: doc.$createdAt,
      }

      const existing = oddsHistoryByEntrant.get(entrantKey)
      if (existing) {
        existing.push(oddsHistoryEntry)
      } else {
        oddsHistoryByEntrant.set(entrantKey, [oddsHistoryEntry])
      }
    })

    const moneyFlowMap = new Map<
      string,
      {
        holdPercentage: number
        previousHoldPercentage?: number
        moneyFlowTrend: 'up' | 'down' | 'neutral'
      }
    >()

    entrantKeys.forEach((entrantKey) => {
      const histories = [...(moneyFlowByEntrant.get(entrantKey) ?? [])]
      histories.sort(
        (a, b) =>
          new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime()
      )

      const [current, previous] = histories
      if (!current) {
        return
      }

      const currentHold = current.holdPercentage ?? 0
      const previousHold = previous?.holdPercentage

      let trend: 'up' | 'down' | 'neutral' = 'neutral'
      if (previousHold !== undefined && currentHold !== previousHold) {
        trend = currentHold > previousHold ? 'up' : 'down'
      }

      moneyFlowMap.set(entrantKey, {
        holdPercentage: currentHold,
        previousHoldPercentage: previousHold,
        moneyFlowTrend: trend,
      })
    })

    const entrants: Entrant[] = entrantsQuery.documents.map((doc) => {
      const entrantId = doc.entrantId ?? doc.$id
      const raceReference =
        (typeof doc.race === 'string' && doc.race) || doc.raceId || raceData.$id

      const oddsHistory = [...(oddsHistoryByEntrant.get(entrantId) ?? [])]
      oddsHistory.sort(
        (a, b) =>
          new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime()
      )

      const moneyFlowInfo = moneyFlowMap.get(entrantId)

      const winOdds = doc.fixedWinOdds ?? doc.poolWinOdds
      const placeOdds = doc.fixedPlaceOdds ?? doc.poolPlaceOdds

      return {
        $id: doc.$id,
        $createdAt: doc.$createdAt,
        $updatedAt: doc.$updatedAt,
        entrantId,
        name: doc.name ?? 'Unknown Entrant',
        runnerNumber: doc.runnerNumber ?? 0,
        jockey: doc.jockey,
        trainerName: doc.trainerName,
        silkColours: doc.silkColours,
        silkUrl64: doc.silkUrl64,
        silkUrl128: doc.silkUrl128,
        isScratched: doc.isScratched ?? false,
        race: raceReference,
        winOdds,
        placeOdds,
        oddsHistory,
        ...(moneyFlowInfo ?? {}),
      }
    })

    const toNavigationEntry = (
      documents: Models.DocumentList<RaceDocument>['documents']
    ): RaceNavigationData['previousRace'] => {
      const [doc] = documents
      if (!doc) {
        return null
      }

      const meetingField = doc.meeting
      const meetingName =
        typeof meetingField === 'object' && meetingField?.meetingName
          ? meetingField.meetingName
          : 'Unknown Meeting'

      return {
        raceId: doc.raceId ?? doc.$id,
        name: doc.name ?? 'Unknown Race',
        startTime: doc.startTime ?? doc.$createdAt,
        meetingName,
      }
    }

    const navigationData: RaceNavigationData = {
      previousRace: toNavigationEntry(previousRaceQuery.documents),
      nextRace: toNavigationEntry(nextRaceQuery.documents),
      nextScheduledRace: toNavigationEntry(nextScheduledRaceQuery.documents),
    }

    const dataFreshness = {
      lastUpdated: now.toISOString(),
      entrantsDataAge,
      oddsHistoryCount: 0,
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
    console.error('Error fetching comprehensive race data:', error)
    return null
  }
}

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

    let raceData: RaceDocument | null = null
    try {
      const raceQuery = await databases.listDocuments<RaceDocument>('raceday-db', 'races', [
        Query.equal('raceId', raceId),
        Query.select(RACE_SELECT_FIELDS),
        Query.limit(1),
      ])
      raceData = raceQuery.documents[0] ?? null
    } catch {}

    if (!raceData) {
      try {
        raceData = await databases.getDocument<RaceDocument>('raceday-db', 'races', raceId)
      } catch {
        return null
      }
    }

    const raceResultsData = await fetchRaceResultsDocument(
      databases,
      raceId,
      raceData.$id
    )

    let resolvedMeetingId: string | null = null
    let meetingDocument: MeetingDocument | null = null

    const raceMeetingField = raceData.meeting
    if (typeof raceMeetingField === 'string' && raceMeetingField) {
      resolvedMeetingId = raceMeetingField
    } else if (
      raceMeetingField &&
      typeof raceMeetingField === 'object' &&
      (raceMeetingField.meetingId || raceMeetingField.$id)
    ) {
      const castMeeting = raceMeetingField as MeetingDocument
      resolvedMeetingId = castMeeting.meetingId ?? castMeeting.$id ?? null
      meetingDocument = castMeeting
    }

    if (!resolvedMeetingId) {
      return null
    }

    if (!meetingDocument) {
      try {
        meetingDocument = await databases.getDocument<MeetingDocument>(
          'raceday-db',
          'meetings',
          resolvedMeetingId
        )
      } catch {
        meetingDocument = null
      }
    }

    const meeting = normalizeMeetingDocument(meetingDocument, {
      id: resolvedMeetingId,
      createdAt: raceData.$createdAt,
      updatedAt: raceData.$updatedAt,
    })

    const raceStartTime = raceData.startTime ?? raceData.$createdAt

    const race: Race = {
      $id: raceData.$id,
      $createdAt: raceData.$createdAt,
      $updatedAt: raceData.$updatedAt,
      raceId: raceData.raceId ?? raceData.$id,
      raceNumber: raceData.raceNumber ?? 0,
      name: raceData.name ?? 'Unknown Race',
      startTime: raceStartTime,
      actualStart: raceData.actualStart ?? undefined,
      meeting: resolvedMeetingId,
      status: raceData.status ?? 'Unknown',
      distance: raceData.distance,
      trackCondition: raceData.trackCondition,
      weather: raceData.weather,
      type: raceData.type,
      resultsAvailable: raceResultsData?.resultsAvailable ?? false,
      resultsData: parseJson<Race['resultsData']>(raceResultsData?.resultsData),
      dividendsData: parseJson<Race['dividendsData']>(raceResultsData?.dividendsData),
      fixedOddsData: parseJson<Race['fixedOddsData']>(raceResultsData?.fixedOddsData),
      resultStatus: normalizeResultStatus(raceResultsData?.resultStatus),
      photoFinish: raceResultsData?.photoFinish ?? false,
      stewardsInquiry: raceResultsData?.stewardsInquiry ?? false,
      protestLodged: raceResultsData?.protestLodged ?? false,
      resultTime: raceResultsData?.resultTime,
    }

    const entrantsQuery = await databases.listDocuments<EntrantDocument>(
      'raceday-db',
      'entrants',
      [
        Query.equal('raceId', raceId),
        Query.select(ENTRANT_SELECT_FIELDS),
        Query.orderAsc('runnerNumber'),
      ]
    )

    const now = new Date()
    const entrantsDataAge =
      entrantsQuery.documents.length > 0
        ? Math.round(
            (now.getTime() -
              new Date(entrantsQuery.documents[0].$updatedAt).getTime()) /
              1000
          )
        : 0

    const entrants: Entrant[] = entrantsQuery.documents.map((doc) => {
      const entrantId = doc.entrantId ?? doc.$id
      const raceReference =
        (typeof doc.race === 'string' && doc.race) || doc.raceId || raceData.$id

      return {
        $id: doc.$id,
        $createdAt: doc.$createdAt,
        $updatedAt: doc.$updatedAt,
        entrantId,
        name: doc.name ?? 'Unknown Entrant',
        runnerNumber: doc.runnerNumber ?? 0,
        jockey: doc.jockey,
        trainerName: doc.trainerName,
        silkColours: doc.silkColours,
        silkUrl64: doc.silkUrl64,
        silkUrl128: doc.silkUrl128,
        isScratched: doc.isScratched ?? false,
        race: raceReference,
        winOdds: doc.fixedWinOdds ?? doc.poolWinOdds,
        placeOdds: doc.fixedPlaceOdds ?? doc.poolPlaceOdds,
        oddsHistory: [],
        holdPercentage: 0,
        moneyFlowTrend: 'neutral',
      }
    })

    const [previousRaceQuery, nextRaceQuery, nextScheduledRaceQuery] =
      await Promise.all([
        databases.listDocuments<RaceDocument>('raceday-db', 'races', [
          Query.lessThan('startTime', raceStartTime),
          Query.orderDesc('startTime'),
          Query.select(NAVIGATION_SELECT_FIELDS),
          Query.limit(1),
        ]),
        databases.listDocuments<RaceDocument>('raceday-db', 'races', [
          Query.greaterThan('startTime', raceStartTime),
          Query.orderAsc('startTime'),
          Query.select(NAVIGATION_SELECT_FIELDS),
          Query.limit(1),
        ]),
        databases.listDocuments<RaceDocument>('raceday-db', 'races', [
          Query.greaterThan('startTime', now.toISOString()),
          Query.notEqual('status', 'Abandoned'),
          Query.orderAsc('startTime'),
          Query.select(NAVIGATION_SELECT_FIELDS),
          Query.limit(1),
        ]),
      ])

    const toNavigationEntry = (
      documents: Models.DocumentList<RaceDocument>['documents']
    ): RaceNavigationData['previousRace'] => {
      const [doc] = documents
      if (!doc) {
        return null
      }

      const meetingField = doc.meeting
      const meetingName =
        typeof meetingField === 'object' && meetingField?.meetingName
          ? meetingField.meetingName
          : 'Unknown Meeting'

      return {
        raceId: doc.raceId ?? doc.$id,
        name: doc.name ?? 'Unknown Race',
        startTime: doc.startTime ?? doc.$createdAt,
        meetingName,
      }
    }

    const navigationData: RaceNavigationData = {
      previousRace: toNavigationEntry(previousRaceQuery.documents),
      nextRace: toNavigationEntry(nextRaceQuery.documents),
      nextScheduledRace: toNavigationEntry(nextScheduledRaceQuery.documents),
    }

    const dataFreshness = {
      lastUpdated: now.toISOString(),
      entrantsDataAge,
      oddsHistoryCount: 0,
      moneyFlowHistoryCount: 0,
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
