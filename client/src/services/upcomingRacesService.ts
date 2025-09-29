'use client'

import { databases, Query } from '@/lib/appwrite-client'
import { ensureConnection, isConnectionHealthy } from '@/state/connectionState'
import type { Race } from '@/types/meetings'

const DATABASE_ID = 'raceday-db'
const RACES_COLLECTION_ID = 'races'

export interface FetchUpcomingRacesOptions {
  /** Number of minutes ahead to search for upcoming races (default 120) */
  windowMinutes?: number
  /** Number of minutes to look back to catch races about to start (default 5) */
  lookbackMinutes?: number
  /** Maximum number of races to return (default 50) */
  limit?: number
  /** Optional client-side filter applied after fetching */
  filter?: (race: Race) => boolean
}

const DEFAULT_OPTIONS: Required<Omit<FetchUpcomingRacesOptions, 'filter'>> = {
  windowMinutes: 120,
  lookbackMinutes: 5,
  limit: 50,
}

export async function fetchUpcomingRaces(
  options: FetchUpcomingRacesOptions = {}
): Promise<Race[]> {
  const { filter, ...rest } = options
  const { windowMinutes, lookbackMinutes, limit } = {
    ...DEFAULT_OPTIONS,
    ...rest,
  }

  if (!(isConnectionHealthy() || (await ensureConnection()))) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Skipping upcoming races fetch while connection is unavailable')
    }
    return []
  }

  const now = Date.now()
  const lowerBound = new Date(now - lookbackMinutes * 60_000).toISOString()
  const upperBound = new Date(now + windowMinutes * 60_000).toISOString()

  try {
    const query = [
      Query.greaterThan('startTime', lowerBound),
      Query.lessThanEqual('startTime', upperBound),
      Query.notEqual('status', 'Abandoned'),
      Query.notEqual('status', 'Final'),
      Query.notEqual('status', 'Finalized'),
      Query.orderAsc('startTime'),
      Query.limit(limit),
    ]

    const response = await databases.listDocuments(
      DATABASE_ID,
      RACES_COLLECTION_ID,
      query
    )

    const races = response.documents as unknown as Race[]

    if (typeof filter === 'function') {
      return races.filter(filter)
    }

    return races
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Failed to fetch upcoming races', error)
    }
    return []
  }
}
