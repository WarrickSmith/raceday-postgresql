'use client'

import { ensureConnection, isConnectionHealthy } from '@/state/connectionState'
import type { Race } from '@/types/meetings'

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

  try {
    // Call Next.js API route instead of Appwrite directly
    const params = new URLSearchParams({
      windowMinutes: windowMinutes.toString(),
      lookbackMinutes: lookbackMinutes.toString(),
      limit: limit.toString(),
    })

    const response = await fetch(`/api/races/upcoming?${params.toString()}`, {
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch upcoming races: ${response.statusText}`)
    }

    const data = await response.json() as { races: Race[]; total: number; timestamp: string }
    const races = data.races

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
