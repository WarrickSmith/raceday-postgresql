'use client'

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useRef,
} from 'react'
import { useRouter } from 'next/navigation'
import { Race, Meeting, Entrant, RaceNavigationData } from '@/types/meetings'
import { raceCache, cacheInvalidation } from '@/lib/cache'
import { racePrefetchService } from '@/services/racePrefetchService'
import { useMemoryOptimization } from '@/utils/performance'

interface RaceContextData {
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
}

interface RaceContextValue {
  raceData: RaceContextData | null
  isLoading: boolean
  error: string | null
  updateRaceData: (data: RaceContextData) => void
  navigateToRace: (
    raceId: string,
    options?: { skipUrlUpdate?: boolean }
  ) => Promise<void>
  invalidateRaceCache: (raceId: string) => void
  isNavigationInProgress: () => boolean
}

const RaceContext = createContext<RaceContextValue | undefined>(undefined)

interface RaceProviderProps {
  children: ReactNode
  initialData: RaceContextData | null
}

export function RaceProvider({ children, initialData }: RaceProviderProps) {
  const router = useRouter()
  const [raceData, setRaceDataInternal] = useState<RaceContextData | null>(
    initialData
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigationInProgress = useRef<string | null>(null)

  // Memory optimization for RaceContext
  const { triggerCleanup } = useMemoryOptimization()

  // Internal setter for race data (no debug logging in production)
  const setRaceData = useCallback(
    (data: RaceContextData | null) => {
      setRaceDataInternal(data)
    },
    [raceData]
  )

  const updateRaceData = useCallback((data: RaceContextData) => {
    setRaceData(data)
  }, [])

  const navigateToRace = useCallback(
    async (raceId: string, options?: { skipUrlUpdate?: boolean }) => {
      // Prevent duplicate navigation calls
      if (navigationInProgress.current === raceId) {
        return
      }

      // If we already have data for this race, just update URL without refetching
      if (raceData && raceData.race.raceId === raceId) {
        if (!options?.skipUrlUpdate) {
          router.replace(`/race/${raceId}`)
        }
        return
      }

      navigationInProgress.current = raceId
      setIsLoading(true)
      setError(null)

      try {
        // Check for pre-fetched basic data for immediate rendering
        const cachedBasicData = await racePrefetchService.getCachedRaceData(
          raceId
        )

        if (cachedBasicData) {
          // Create minimal race data for immediate rendering
          const immediateRaceData = {
            race: cachedBasicData.race,
            meeting: {
              $createdAt: '',
              $updatedAt: '',
              ...cachedBasicData.meeting,
              category:
                cachedBasicData.meeting.category === 'H' ||
                cachedBasicData.meeting.category === 'T'
                  ? (cachedBasicData.meeting.category as 'H' | 'T')
                  : ('T' as const),
            },
            entrants: [], // Will be populated by background fetch
            navigationData: {
              previousRace: null,
              nextRace: null,
              nextScheduledRace: null,
            },
            dataFreshness: {
              lastUpdated: new Date().toISOString(),
              entrantsDataAge: 0,
              oddsHistoryCount: 0,
              moneyFlowHistoryCount: 0,
            },
          }

          // Set immediate data and clear loading
          setRaceData(immediateRaceData)
          setIsLoading(false)

          // Only update URL if not explicitly skipped
          if (!options?.skipUrlUpdate) {
            router.replace(`/race/${raceId}`)
          }
        }

        // Use cache-first strategy for complete navigation
        const newRaceData = await raceCache.get(
          `race:${raceId}:full`,
          async () => {
            const response = await fetch(`/api/race/${raceId}`)
            if (!response.ok) {
              throw new Error(
                `Failed to fetch race data: ${response.statusText}`
              )
            }
            return response.json()
          },
          15000 // 15 second cache for live data
        )

        // Only update if we're still navigating to the same race (prevent race conditions)
        if (navigationInProgress.current === raceId) {
          setRaceData(newRaceData)
          // Only update URL if not already done and not explicitly skipped
          if (!options?.skipUrlUpdate && !cachedBasicData) {
            router.replace(`/race/${raceId}`)
          }
        }
      } catch (err) {
        console.error('❌ Error navigating to race:', err)
        setError(err instanceof Error ? err.message : 'Unknown error occurred')
      } finally {
        // Only clear navigation if we're still on the same race
        if (navigationInProgress.current === raceId) {
          navigationInProgress.current = null
        }
        setIsLoading(false)
      }
    },
    [raceData, router]
  )

  const invalidateRaceCache = useCallback(
    (raceId: string) => {
      cacheInvalidation.onRaceUpdate(raceId)

      // Trigger memory cleanup when invalidating cache
      triggerCleanup()
    },
    [triggerCleanup]
  )

  const isNavigationInProgress = useCallback(() => {
    return navigationInProgress.current !== null
  }, [])

  const value: RaceContextValue = {
    raceData,
    isLoading,
    error,
    updateRaceData,
    navigateToRace,
    invalidateRaceCache,
    isNavigationInProgress,
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
