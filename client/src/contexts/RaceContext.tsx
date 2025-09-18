'use client'

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react'
import { Race, Meeting, Entrant, RaceNavigationData } from '@/types/meetings'
import { cacheInvalidation } from '@/lib/cache'
import { useMemoryOptimization } from '@/utils/performance'
import {
  useSubscriptionCleanup,
  type CleanupReason,
} from '@/contexts/SubscriptionCleanupContext'

interface RaceContextData {
  race: Race
  meeting: Meeting
  entrants: Entrant[]
  navigationData: RaceNavigationData
  dataFreshness: {
    lastUpdated: string
    entrantsDataAge: number
    oddsHistoryCount: number // DEPRECATED: Always 0, odds data comes from MoneyFlowHistory
    moneyFlowHistoryCount: number
  }
}

interface RaceContextValue {
  raceData: RaceContextData | null
  isLoading: boolean
  error: string | null
  updateRaceData: (data: RaceContextData) => void
  loadRaceData: (raceId: string) => Promise<void>
  invalidateRaceCache: (raceId: string) => void
  // New cleanup signal for subscription management
  subscriptionCleanupSignal: number
  triggerSubscriptionCleanup: (reason?: CleanupReason) => Promise<void>
}

const RaceContext = createContext<RaceContextValue | undefined>(undefined)

interface RaceProviderProps {
  children: ReactNode
  initialData: RaceContextData | null
}

export function RaceProvider({ children, initialData }: RaceProviderProps) {
  const [raceData, setRaceDataInternal] = useState<RaceContextData | null>(
    initialData
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Memory optimization for RaceContext
  const { triggerCleanup } = useMemoryOptimization()
  const { signal: subscriptionCleanupSignal, requestCleanup } =
    useSubscriptionCleanup()

  // Internal setter for race data (no debug logging in production)
  const setRaceData = useCallback(
    (data: RaceContextData | null) => {
      setRaceDataInternal(data)
    },
    []
  )

  const updateRaceData = useCallback(
    (data: RaceContextData) => {
      setRaceData(data)
    },
    [setRaceData]
  )

  // Simple race data loading function (without navigation complexity)
  const loadRaceData = useCallback(async (raceId: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/race/${raceId}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch race data: ${response.statusText}`)
      }
      const newRaceData: RaceContextData = await response.json()
      setRaceData(newRaceData)
    } catch (err) {
      console.error('❌ Error loading race data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [setRaceData])

  const invalidateRaceCache = useCallback(
    (raceId: string) => {
      cacheInvalidation.onRaceUpdate(raceId)

      // Trigger memory cleanup when invalidating cache
      triggerCleanup()
    },
    [triggerCleanup]
  )

  // Trigger subscription cleanup for navigation
  const triggerSubscriptionCleanup = useCallback(
    (reason?: CleanupReason) =>
      requestCleanup({ reason: reason ?? 'race-navigation' }),
    [requestCleanup]
  )

  const value: RaceContextValue = {
    raceData,
    isLoading,
    error,
    updateRaceData,
    loadRaceData,
    invalidateRaceCache,
    subscriptionCleanupSignal,
    triggerSubscriptionCleanup,
  }

  return <RaceContext.Provider value={value}>{children}</RaceContext.Provider>
}

export function useRace() {
  const context = useContext(RaceContext)
  if (context === undefined) {
    throw new Error('useRace must be used within a RaceProvider')
  }
  return context
}
