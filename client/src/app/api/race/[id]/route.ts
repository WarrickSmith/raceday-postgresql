import { NextRequest } from 'next/server'
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
import { jsonWithCompression } from '@/lib/http/compression'

const RACE_SELECT_FIELDS = [
  '$id',
  '$createdAt',
  '$updatedAt',
  'race_id',
  'race_number',
  'name',
  'start_time',
  'actual_start',
  'status',
  'distance',
  'track_condition',
  'weather',
  'type',
  // Include base meeting field to support both string ID and expanded object shapes
  'meeting',
  'meeting.$id',
  'meeting.$createdAt',
  'meeting.$updatedAt',
  'meeting.meeting_id',
  'meeting.meeting_name',
  'meeting.country',
  'meeting.race_type',
  'meeting.category',
  'meeting.date',
  'meeting.weather',
]

const RACE_RESULTS_SELECT_FIELDS = [
  '$id',
  '$createdAt',
  '$updatedAt',
  'results_available',
  'results_data',
  'dividends_data',
  'fixed_odds_data',
  'result_status',
  'photo_finish',
  'stewards_inquiry',
  'protest_lodged',
  'result_time',
]

const ENTRANT_SELECT_FIELDS = [
  '$id',
  '$createdAt',
  '$updatedAt',
  'entrant_id',
  'name',
  'runner_number',
  'jockey',
  'trainer_name',
  'silk_colours',
  'silk_url_64',
  'silk_url_128',
  'is_scratched',
  'race_id',
  'fixed_win_odds',
  'pool_win_odds',
  'fixed_place_odds',
  'pool_place_odds',
]

const MONEY_FLOW_SELECT_FIELDS = [
  '$id',
  '$createdAt',
  '$updatedAt',
  'race_id',
  'entrant_id',
  'hold_percentage',
  'fixed_win_odds',
  'pool_win_odds',
  'fixed_place_odds',
  'pool_place_odds',
]

const NAVIGATION_SELECT_FIELDS = [
  'race_id',
  'name',
  'start_time',
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
): Race['result_status'] => {
  if (status === 'interim' || status === 'final' || status === 'protest') {
    return status
  }

  return undefined
}

async function fetchRaceResultsDocument(
  databases: AppwriteDatabases,
  race_id: string,
  raceDocId: string
): Promise<RaceResultsDocument | null> {
  const queryAttempts = [
    [Query.equal('race_id', race_id)],
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
    const { id: race_id } = await params

    if (!race_id) {
      return jsonWithCompression(
        request,
        { error: 'Race ID is required' },
        { status: 400 }
      )
    }

    // Check if this is a navigation request (fast mode)
    const url = new URL(request.url)
    const isNavigation = url.searchParams.get('nav') === 'true'

    const raceData = isNavigation
      ? await getNavigationRaceData(race_id)
      : await getComprehensiveRaceData(race_id)

    if (!raceData) {
      return jsonWithCompression(
        request,
        { error: 'Race not found' },
        { status: 404 }
      )
    }

    // Set cache headers based on mode
    const response = await jsonWithCompression(request, raceData)

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
    response.headers.set('X-Race-ID', race_id)

    return response
  } catch {
    return jsonWithCompression(
      request,
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Comprehensive data fetching with batch optimization for race ecosystem
 * Identical to the server-side function in the page component
 */
async function getComprehensiveRaceData(race_id: string): Promise<{
  race: Race
  meeting: Meeting
  entrants: Entrant[]
  navigationData: RaceNavigationData
  dataFreshness: {
    last_updated: string
    entrantsDataAge: number
    odds_historyCount: number
    money_flow_historyCount: number
  }
} | null> {
  try {
    const { databases } = await createServerClient()

    let raceData: RaceDocument | null = null
    try {
      const raceQuery = await databases.listDocuments<RaceDocument>('raceday-db', 'races', [
        Query.equal('race_id', race_id),
        Query.select(RACE_SELECT_FIELDS),
        Query.limit(1),
      ])
      raceData = raceQuery.documents[0] ?? null
    } catch {}

    if (!raceData) {
      try {
        raceData = await databases.getDocument<RaceDocument>('raceday-db', 'races', race_id)
      } catch {
        return null
      }
    }

    const raceResultsData = await fetchRaceResultsDocument(
      databases,
      race_id,
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
      (raceMeetingField.meeting_id || raceMeetingField.$id)
    ) {
      const castMeeting = raceMeetingField as MeetingDocument
      resolvedMeetingId = castMeeting.meeting_id ?? castMeeting.$id ?? null
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

    const raceStartTime = raceData.start_time ?? raceData.$createdAt

    const race: Race = {
      $id: raceData.$id,
      $createdAt: raceData.$createdAt,
      $updatedAt: raceData.$updatedAt,
      race_id: raceData.race_id ?? raceData.$id,
      race_number: raceData.race_number ?? 0,
      name: raceData.name ?? 'Unknown Race',
      start_time: raceStartTime,
      actual_start: raceData.actual_start ?? undefined,
      meeting: resolvedMeetingId,
      status: raceData.status ?? 'Unknown',
      distance: raceData.distance,
      track_condition: raceData.track_condition,
      weather: raceData.weather,
      type: raceData.type,
      results_available: raceResultsData?.results_available ?? false,
      results_data: parseJson<Race['results_data']>(raceResultsData?.results_data),
      dividends_data: parseJson<Race['dividends_data']>(raceResultsData?.dividends_data),
      fixed_odds_data: parseJson<Race['fixed_odds_data']>(raceResultsData?.fixed_odds_data),
      result_status: normalizeResultStatus(raceResultsData?.result_status),
      photo_finish: raceResultsData?.photo_finish ?? false,
      stewards_inquiry: raceResultsData?.stewards_inquiry ?? false,
      protest_lodged: raceResultsData?.protest_lodged ?? false,
      result_time: raceResultsData?.result_time,
    }

    const entrantsQuery = await databases.listDocuments<EntrantDocument>(
      'raceday-db',
      'entrants',
      [
        Query.equal('race_id', race_id),
        Query.select(ENTRANT_SELECT_FIELDS),
        Query.orderAsc('runner_number'),
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
      (doc) => doc.entrant_id ?? doc.$id
    )

    const [previousRaceQuery, nextRaceQuery, nextScheduledRaceQuery] =
      await Promise.all([
        databases.listDocuments<RaceDocument>('raceday-db', 'races', [
          Query.lessThan('start_time', raceStartTime),
          Query.orderDesc('start_time'),
          Query.select(NAVIGATION_SELECT_FIELDS),
          Query.limit(1),
        ]),
        databases.listDocuments<RaceDocument>('raceday-db', 'races', [
          Query.greaterThan('start_time', raceStartTime),
          Query.orderAsc('start_time'),
          Query.select(NAVIGATION_SELECT_FIELDS),
          Query.limit(1),
        ]),
        databases.listDocuments<RaceDocument>('raceday-db', 'races', [
          Query.greaterThan('start_time', now.toISOString()),
          Query.notEqual('status', 'Abandoned'),
          Query.orderAsc('start_time'),
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
          Query.equal('race_id', race_id),
          Query.equal('entrant_id', entrantKeys),
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
      const entrantKey = doc.entrant_id ?? doc.entrant
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

    const odds_historyByEntrant = new Map<string, OddsHistoryData[]>()
    moneyFlowQuery.documents.forEach((doc) => {
      const entrantKey = doc.entrant_id ?? doc.entrant
      if (!entrantKey) {
        return
      }

      const win_odds = doc.fixed_win_odds ?? doc.pool_win_odds
      if (!win_odds || win_odds <= 0) {
        return
      }

      const odds_historyEntry: OddsHistoryData = {
        $id: doc.$id,
        $createdAt: doc.$createdAt,
        $updatedAt: doc.$updatedAt,
        entrant: entrantKey,
        win_odds,
        timestamp: doc.$createdAt,
      }

      const existing = odds_historyByEntrant.get(entrantKey)
      if (existing) {
        existing.push(odds_historyEntry)
      } else {
        odds_historyByEntrant.set(entrantKey, [odds_historyEntry])
      }
    })

    const moneyFlowMap = new Map<
      string,
      {
        hold_percentage: number
        previous_hold_percentage?: number
        money_flow_trend: 'up' | 'down' | 'neutral'
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

      const currentHold = current.hold_percentage ?? 0
      const previousHold = previous?.hold_percentage

      let trend: 'up' | 'down' | 'neutral' = 'neutral'
      if (previousHold !== undefined && currentHold !== previousHold) {
        trend = currentHold > previousHold ? 'up' : 'down'
      }

      moneyFlowMap.set(entrantKey, {
        hold_percentage: currentHold,
        previous_hold_percentage: previousHold,
        money_flow_trend: trend,
      })
    })

    const entrants: Entrant[] = entrantsQuery.documents.map((doc) => {
      const entrant_id = doc.entrant_id ?? doc.$id
      const raceReference =
        (typeof doc.race === 'string' && doc.race) || doc.race_id || raceData.$id

      const odds_history = [...(odds_historyByEntrant.get(entrant_id) ?? [])]
      odds_history.sort(
        (a, b) =>
          new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime()
      )

      const moneyFlowInfo = moneyFlowMap.get(entrant_id)

      const win_odds = doc.fixed_win_odds ?? doc.pool_win_odds
      const place_odds = doc.fixed_place_odds ?? doc.pool_place_odds

      return {
        $id: doc.$id,
        $createdAt: doc.$createdAt,
        $updatedAt: doc.$updatedAt,
        entrant_id,
        name: doc.name ?? 'Unknown Entrant',
        runner_number: doc.runner_number ?? 0,
        jockey: doc.jockey,
        trainer_name: doc.trainer_name,
        silk_colours: doc.silk_colours,
        silk_url_64: doc.silk_url_64,
        silk_url_128: doc.silk_url_128,
        is_scratched: doc.is_scratched ?? false,
        race: raceReference,
        win_odds,
        place_odds,
        odds_history,
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
      const meeting_name =
        typeof meetingField === 'object' && meetingField?.meeting_name
          ? meetingField.meeting_name
          : 'Unknown Meeting'

      return {
        race_id: doc.race_id ?? doc.$id,
        name: doc.name ?? 'Unknown Race',
        start_time: doc.start_time ?? doc.$createdAt,
        meeting_name,
      }
    }

    const navigationData: RaceNavigationData = {
      previousRace: toNavigationEntry(previousRaceQuery.documents),
      nextRace: toNavigationEntry(nextRaceQuery.documents),
      nextScheduledRace: toNavigationEntry(nextScheduledRaceQuery.documents),
    }

    const dataFreshness = {
      last_updated: now.toISOString(),
      entrantsDataAge,
      odds_historyCount: 0,
      money_flow_historyCount: moneyFlowQuery.documents.length,
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

async function getNavigationRaceData(race_id: string): Promise<{
  race: Race
  meeting: Meeting
  entrants: Entrant[]
  navigationData: RaceNavigationData
  dataFreshness: {
    last_updated: string
    entrantsDataAge: number
    odds_historyCount: number
    money_flow_historyCount: number
  }
} | null> {
  try {
    const { databases } = await createServerClient()

    let raceData: RaceDocument | null = null
    try {
      const raceQuery = await databases.listDocuments<RaceDocument>('raceday-db', 'races', [
        Query.equal('race_id', race_id),
        Query.select(RACE_SELECT_FIELDS),
        Query.limit(1),
      ])
      raceData = raceQuery.documents[0] ?? null
    } catch {}

    if (!raceData) {
      try {
        raceData = await databases.getDocument<RaceDocument>('raceday-db', 'races', race_id)
      } catch {
        return null
      }
    }

    const raceResultsData = await fetchRaceResultsDocument(
      databases,
      race_id,
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
      (raceMeetingField.meeting_id || raceMeetingField.$id)
    ) {
      const castMeeting = raceMeetingField as MeetingDocument
      resolvedMeetingId = castMeeting.meeting_id ?? castMeeting.$id ?? null
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

    const raceStartTime = raceData.start_time ?? raceData.$createdAt

    const race: Race = {
      $id: raceData.$id,
      $createdAt: raceData.$createdAt,
      $updatedAt: raceData.$updatedAt,
      race_id: raceData.race_id ?? raceData.$id,
      race_number: raceData.race_number ?? 0,
      name: raceData.name ?? 'Unknown Race',
      start_time: raceStartTime,
      actual_start: raceData.actual_start ?? undefined,
      meeting: resolvedMeetingId,
      status: raceData.status ?? 'Unknown',
      distance: raceData.distance,
      track_condition: raceData.track_condition,
      weather: raceData.weather,
      type: raceData.type,
      results_available: raceResultsData?.results_available ?? false,
      results_data: parseJson<Race['results_data']>(raceResultsData?.results_data),
      dividends_data: parseJson<Race['dividends_data']>(raceResultsData?.dividends_data),
      fixed_odds_data: parseJson<Race['fixed_odds_data']>(raceResultsData?.fixed_odds_data),
      result_status: normalizeResultStatus(raceResultsData?.result_status),
      photo_finish: raceResultsData?.photo_finish ?? false,
      stewards_inquiry: raceResultsData?.stewards_inquiry ?? false,
      protest_lodged: raceResultsData?.protest_lodged ?? false,
      result_time: raceResultsData?.result_time,
    }

    const entrantsQuery = await databases.listDocuments<EntrantDocument>(
      'raceday-db',
      'entrants',
      [
        Query.equal('race_id', race_id),
        Query.select(ENTRANT_SELECT_FIELDS),
        Query.orderAsc('runner_number'),
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
      const entrant_id = doc.entrant_id ?? doc.$id
      const raceReference =
        (typeof doc.race === 'string' && doc.race) || doc.race_id || raceData.$id

      return {
        $id: doc.$id,
        $createdAt: doc.$createdAt,
        $updatedAt: doc.$updatedAt,
        entrant_id,
        name: doc.name ?? 'Unknown Entrant',
        runner_number: doc.runner_number ?? 0,
        jockey: doc.jockey,
        trainer_name: doc.trainer_name,
        silk_colours: doc.silk_colours,
        silk_url_64: doc.silk_url_64,
        silk_url_128: doc.silk_url_128,
        is_scratched: doc.is_scratched ?? false,
        race: raceReference,
        win_odds: doc.fixed_win_odds ?? doc.pool_win_odds,
        place_odds: doc.fixed_place_odds ?? doc.pool_place_odds,
        odds_history: [],
        hold_percentage: 0,
        money_flow_trend: 'neutral',
      }
    })

    const [previousRaceQuery, nextRaceQuery, nextScheduledRaceQuery] =
      await Promise.all([
        databases.listDocuments<RaceDocument>('raceday-db', 'races', [
          Query.lessThan('start_time', raceStartTime),
          Query.orderDesc('start_time'),
          Query.select(NAVIGATION_SELECT_FIELDS),
          Query.limit(1),
        ]),
        databases.listDocuments<RaceDocument>('raceday-db', 'races', [
          Query.greaterThan('start_time', raceStartTime),
          Query.orderAsc('start_time'),
          Query.select(NAVIGATION_SELECT_FIELDS),
          Query.limit(1),
        ]),
        databases.listDocuments<RaceDocument>('raceday-db', 'races', [
          Query.greaterThan('start_time', now.toISOString()),
          Query.notEqual('status', 'Abandoned'),
          Query.orderAsc('start_time'),
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
      const meeting_name =
        typeof meetingField === 'object' && meetingField?.meeting_name
          ? meetingField.meeting_name
          : 'Unknown Meeting'

      return {
        race_id: doc.race_id ?? doc.$id,
        name: doc.name ?? 'Unknown Race',
        start_time: doc.start_time ?? doc.$createdAt,
        meeting_name,
      }
    }

    const navigationData: RaceNavigationData = {
      previousRace: toNavigationEntry(previousRaceQuery.documents),
      nextRace: toNavigationEntry(nextRaceQuery.documents),
      nextScheduledRace: toNavigationEntry(nextScheduledRaceQuery.documents),
    }

    const dataFreshness = {
      last_updated: now.toISOString(),
      entrantsDataAge,
      odds_historyCount: 0,
      money_flow_historyCount: 0,
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
