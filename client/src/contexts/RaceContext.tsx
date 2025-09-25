'use client'

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react'
import { Race, Meeting, Entrant, RaceNavigationData } from '@/types/meetings'
import { cacheInvalidation } from '@/lib/cache'
import { useMemoryOptimization } from '@/utils/performance'
import { useRacePolling, type RacePollingState } from '@/hooks/useRacePolling'

export interface RaceContextData {
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
  refreshRaceData: () => Promise<void>
  pollingState: RacePollingState
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
  const inFlightRequestsRef = useRef<
    Map<
      string,
      {
        promise: Promise<void>
        controller: AbortController
      }
    >
  >(new Map())

  // Memory optimization for RaceContext
  const { triggerCleanup } = useMemoryOptimization()

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
      setError(null)
    },
    [setRaceData]
  )

  // Simple race data loading function (without navigation complexity)
  const loadRaceData = useCallback(
    async (raceId: string): Promise<void> => {
      const normalizedRaceId = raceId?.trim()

      if (!normalizedRaceId) {
        setError('Race ID is required')
        return Promise.resolve()
      }

      const existing = inFlightRequestsRef.current.get(normalizedRaceId)
      if (existing) {
        setIsLoading(true)
        return existing.promise
      }

      // Abort any other in-flight race requests since we only care about the latest
      inFlightRequestsRef.current.forEach(({ controller }) => {
        controller.abort()
      })
      inFlightRequestsRef.current.clear()

      const controller = new AbortController()

      const fetchPromise = (async () => {
        setIsLoading(true)
        setError(null)

        try {
          const response = await fetch(`/api/race/${normalizedRaceId}`, {
            signal: controller.signal,
          })

          if (!response.ok) {
            throw new Error(
              `Failed to fetch race data: ${response.statusText}`
            )
          }

          const newRaceData: RaceContextData = await response.json()
          setRaceData(newRaceData)
        } catch (err) {
          if (controller.signal.aborted) {
            return
          }

          console.error('❌ Error loading race data:', err)
          setError(
            err instanceof Error ? err.message : 'Unknown error occurred'
          )
        } finally {
          inFlightRequestsRef.current.delete(normalizedRaceId)
          setIsLoading(inFlightRequestsRef.current.size > 0)
        }
      })()

      inFlightRequestsRef.current.set(normalizedRaceId, {
        promise: fetchPromise,
        controller,
      })

      return fetchPromise
    },
    [setRaceData]
  )

  const invalidateRaceCache = useCallback(
    (raceId: string) => {
      cacheInvalidation.onRaceUpdate(raceId)

      // Trigger memory cleanup when invalidating cache
      triggerCleanup()
    },
    [triggerCleanup]
  )

  useEffect(() => {
    const requestsMap = inFlightRequestsRef.current

    return () => {
      requestsMap.forEach(({ controller }) => {
        controller.abort()
      })
      requestsMap.clear()
      setIsLoading(false)
    }
  }, [])

  const pollingState = useRacePolling({
    raceId: raceData?.race?.raceId ?? '',
    raceStartTime: raceData?.race?.startTime ?? '',
    raceStatus: raceData?.race?.status ?? '',
    hasInitialData: Boolean(raceData),
    onDataUpdate: updateRaceData,
    onError: (pollingError) => {
      setError(pollingError.message)
    },
  })

  const refreshRaceData = useCallback(async () => {
    await pollingState.retry()
  }, [pollingState])

  const value: RaceContextValue = {
    raceData,
    isLoading,
    error,
    updateRaceData,
    loadRaceData,
    invalidateRaceCache,
    refreshRaceData,
    pollingState,
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
