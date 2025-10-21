'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import type { Race } from '@/types/meetings'
import type { AlertsConfig } from '@/types/alerts'
import {
  loadUserAlertConfig,
  saveUserAlertConfig,
} from '@/services/alertConfigService'
import { useAudibleRaceAlerts } from '@/hooks/useAudibleRaceAlerts'

interface AudibleAlertContextValue {
  isEnabled: boolean
  isLoading: boolean
  isPersisting: boolean
  lastError: string | null
  toggle: () => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
  setFilterPredicate: (predicate: (race: Race) => boolean) => void
  primeAudioWithUserGesture: () => void
}

const AudibleAlertContext = createContext<AudibleAlertContextValue | undefined>(
  undefined
)

const FILTER_STORAGE_KEY = 'raceday:filters'

type StoredFilters = {
  countries?: string[]
  race_types?: string[]
  meetings?: string[]
  meeting_ids?: string[]
  race_ids?: string[]
}

// Helper function to extract race type from Race object
const extractRaceType = (race: Race): string | undefined => {
  return race.race_type ?? undefined
}

const buildFilterPredicateFromStorage = (): ((race: Race) => boolean) => {
  if (typeof window === 'undefined') {
    return () => true
  }

  try {
    const storedValue =
      window.sessionStorage.getItem(FILTER_STORAGE_KEY) ??
      window.localStorage?.getItem?.(FILTER_STORAGE_KEY) ??
      null

    if (!storedValue) {
      return () => true
    }

    const parsed = JSON.parse(storedValue) as StoredFilters | null
    if (!parsed) {
      return () => true
    }

    const {
      race_types = [],
      meetings = [],
      meeting_ids = [],
      race_ids = [],
    } = parsed

    return (race: Race) => {
      if (race_ids.length > 0 && !race_ids.includes(race.race_id)) {
        return false
      }

      // Race now has meeting_id directly (not nested meeting object)
      const meeting_id = race.meeting_id
      if (
        meeting_id &&
        (meeting_ids.length > 0 || meetings.length > 0) &&
        !meeting_ids.includes(meeting_id) &&
        !meetings.includes(meeting_id)
      ) {
        return false
      }

      // Note: Country filtering is not available on Race object alone
      // Would need to join with Meeting data to filter by country
      // For now, skip country filtering when only Race data is available

      const race_type = extractRaceType(race)
      if (race_types.length > 0 && race_type && !race_types.includes(race_type)) {
        return false
      }

      return true
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to parse stored race filters', error)
    }
    return () => true
  }
}

interface AudibleAlertProviderProps {
  children: ReactNode
}

export const AudibleAlertProvider = ({ children }: AudibleAlertProviderProps) => {
  const [config, setConfig] = useState<AlertsConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPersisting, setIsPersisting] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const configRef = useRef<AlertsConfig | null>(null)
  const filterPredicateRef = useRef<(race: Race) => boolean>(
    buildFilterPredicateFromStorage()
  )

  const ensureConfig = useCallback(async () => {
    if (configRef.current) {
      return configRef.current
    }

    setIsLoading(true)
    try {
      const loadedConfig = await loadUserAlertConfig()
      configRef.current = loadedConfig
      setConfig(loadedConfig)
      return loadedConfig
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    ensureConfig().catch((error) => {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to load audible alert configuration', error)
      }
      setLastError('Unable to load audible alert settings')
    })
  }, [ensureConfig])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== FILTER_STORAGE_KEY) {
        return
      }
      filterPredicateRef.current = buildFilterPredicateFromStorage()
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const filterFn = useCallback(
    (race: Race) => filterPredicateRef.current(race),
    []
  )

  const isEnabled = config?.audible_alerts_enabled ?? false

  const { primeAudio, primeAudioDuringGesture } = useAudibleRaceAlerts({
    enabled: isEnabled && !isLoading,
    filterRace: filterFn,
  })

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      setLastError(null)
      const currentConfig = await ensureConfig()
      if (!currentConfig) return

      if (currentConfig.audible_alerts_enabled === enabled) {
        return
      }

      const optimisticConfig = {
        ...currentConfig,
        audible_alerts_enabled: enabled,
      }

      setConfig(optimisticConfig)
      configRef.current = optimisticConfig
      setIsPersisting(true)

      try {
        await saveUserAlertConfig(optimisticConfig)
        if (enabled) {
          await primeAudio()
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Failed to persist audible alert preference', error)
        }
        setLastError('Unable to save audible alert preference')
        setConfig(currentConfig)
        configRef.current = currentConfig
        throw error
      } finally {
        setIsPersisting(false)
      }
    },
    [ensureConfig, primeAudio]
  )

  const toggle = useCallback(async () => {
    const current = configRef.current?.audible_alerts_enabled ?? false
    await setEnabled(!current)
  }, [setEnabled])

  const setFilterPredicate = useCallback(
    (predicate: (race: Race) => boolean) => {
      filterPredicateRef.current = predicate
    },
    []
  )

  const value = useMemo<AudibleAlertContextValue>(
    () => ({
      isEnabled,
      isLoading,
      isPersisting,
      lastError,
      toggle,
      setEnabled,
      setFilterPredicate,
      primeAudioWithUserGesture: primeAudioDuringGesture,
    }),
    [
      isEnabled,
      isLoading,
      isPersisting,
      lastError,
      toggle,
      setEnabled,
      setFilterPredicate,
      primeAudioDuringGesture,
    ]
  )

  return (
    <AudibleAlertContext.Provider value={value}>
      {children}
    </AudibleAlertContext.Provider>
  )
}

export const useAudibleAlerts = () => {
  const context = useContext(AudibleAlertContext)
  if (!context) {
    throw new Error('useAudibleAlerts must be used within an AudibleAlertProvider')
  }
  return context
}
