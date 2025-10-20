'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RaceContextData } from '@/contexts/RaceContext'
import { useLogger } from '@/utils/logging'
import { pollingConfig } from '@/config/pollingConfig'
import { calculateDstAwareMinutesToStart } from '@/utils/timezoneUtils'
import {
  setConnectionState,
  getConnectionState,
  ensureConnection,
} from '@/state/connectionState'

interface PollingConfig {
  race_id: string
  raceStartTime: string
  raceStatus: string
  hasInitialData: boolean
  onDataUpdate: (data: RaceContextData) => void
  onError?: (error: Error) => void
}

export interface RacePollingState {
  isPolling: boolean
  error: Error | null
  last_updated: Date | null
  currentIntervalMs: number | null
  nextPollTimestamp: number | null
  isDoubleFrequencyEnabled: boolean
  lastRequestDurationMs: number | null
  retry: () => Promise<void>
  stop: () => void
}

const MINUTE_IN_MS = 60 * 1000
const DEFAULT_BASELINE_INTERVAL = 30 * MINUTE_IN_MS
const DEFAULT_ACTIVE_INTERVAL = 2.5 * MINUTE_IN_MS
const DEFAULT_CRITICAL_INTERVAL = 30 * 1000
const MINIMUM_SCHEDULE_DELAY = 5 * 1000
const INITIAL_BACKOFF_MS = 5 * 1000
const MAX_BACKOFF_MS = 2 * MINUTE_IN_MS

const RACE_COMPLETE_STATUSES = new Set([
  'final',
  'finalized',
  'finalised',
  'abandoned',
  'cancelled',
  'canceled',
  'official',
])

const CRITICAL_STATUSES = new Set(['closed', 'running', 'interim'])

export function isRaceComplete(status: string | undefined): boolean {
  if (!status) {
    return false
  }

  return RACE_COMPLETE_STATUSES.has(status.trim().toLowerCase())
}

export function calculatePollingIntervalMs(
  raceStartTime: string,
  raceStatus: string,
  doubleFrequency: boolean
): number {
  if (isRaceComplete(raceStatus)) {
    return Number.POSITIVE_INFINITY
  }

  const multiplier = doubleFrequency ? 0.5 : 1

  const applyMultiplier = (intervalMs: number): number => intervalMs * multiplier

  const normalizedStatus = raceStatus?.trim().toLowerCase()

  if (normalizedStatus && CRITICAL_STATUSES.has(normalizedStatus)) {
    return applyMultiplier(DEFAULT_CRITICAL_INTERVAL)
  }

  // Use DST-aware calculation instead of naive Date arithmetic
  const minutesToStart = calculateDstAwareMinutesToStart(raceStartTime, raceStatus)

  if (minutesToStart === null || Number.isNaN(minutesToStart)) {
    return applyMultiplier(DEFAULT_BASELINE_INTERVAL)
  }

  if (minutesToStart <= 5) {
    return applyMultiplier(DEFAULT_CRITICAL_INTERVAL)
  }

  if (minutesToStart <= 65) {
    return applyMultiplier(DEFAULT_ACTIVE_INTERVAL)
  }

  return applyMultiplier(DEFAULT_BASELINE_INTERVAL)
}

export function useRacePolling(config: PollingConfig): RacePollingState {
  const { race_id, raceStartTime, raceStatus, hasInitialData } = config
  const logger = useLogger('useRacePolling')

  const onDataUpdateRef = useRef(config.onDataUpdate)
  const onErrorRef = useRef(config.onError)
  const raceStatusRef = useRef(raceStatus)
  const raceStartTimeRef = useRef(raceStartTime)
  const isPollingRef = useRef(false)
  const isFetchingRef = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const consecutiveFailuresRef = useRef(0)
  const executePollRef = useRef<
    ((options?: { forced?: boolean; reason?: string }) => Promise<void>) | null
  >(null)
  const previousRaceIdRef = useRef<string>('')

  const [isPolling, setIsPolling] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [last_updated, setLastUpdated] = useState<Date | null>(null)
  const [currentIntervalMs, setCurrentIntervalMs] = useState<number | null>(
    null
  )
  const [nextPollTimestamp, setNextPollTimestamp] = useState<number | null>(
    null
  )
  const [lastRequestDurationMs, setLastRequestDurationMs] = useState<number | null>(
    null
  )

  const { doubleFrequency, enabled: isFeatureEnabled, debugMode, timeoutMs } = pollingConfig

  const isDoubleFrequencyEnabled = useMemo(
    () => doubleFrequency,
    [doubleFrequency]
  )

  useEffect(() => {
    onDataUpdateRef.current = config.onDataUpdate
  }, [config.onDataUpdate])

  useEffect(() => {
    onErrorRef.current = config.onError
  }, [config.onError])

  useEffect(() => {
    if (raceStatus) {
      raceStatusRef.current = raceStatus
    }
  }, [raceStatus])

  useEffect(() => {
    if (raceStartTime) {
      raceStartTimeRef.current = raceStartTime
    }
  }, [raceStartTime])

  const clearScheduledPoll = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const stop = useCallback(
    (reason: string) => {
      logger.info('Stopping race polling', { reason, race_id })
      isPollingRef.current = false
      setIsPolling(false)
      clearScheduledPoll()
      setCurrentIntervalMs(null)
      setNextPollTimestamp(null)

      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    },
    [clearScheduledPoll, logger, race_id]
  )

  const scheduleNextPoll = useCallback(
    (delayMs: number) => {
      if (!isPollingRef.current) {
        return
      }

      const boundedDelay = Math.max(delayMs, MINIMUM_SCHEDULE_DELAY)
      clearScheduledPoll()

      const targetTimestamp = Date.now() + boundedDelay
      setCurrentIntervalMs(boundedDelay)
      setNextPollTimestamp(targetTimestamp)

      if (debugMode) {
        logger.debug('Scheduling next poll', {
          race_id,
          delayMs: boundedDelay,
          targetTimestamp,
        })
      }

      timeoutRef.current = setTimeout(() => {
        const run = executePollRef.current
        if (run) {
          void run()
        }
      }, boundedDelay)
    },
    [clearScheduledPoll, debugMode, logger, race_id]
  )

  const executePoll = useCallback(
    async (options?: { forced?: boolean; reason?: string }) => {
      const forced = options?.forced ?? false

      if (!race_id) {
        return
      }

      if (!isPollingRef.current && !forced) {
        return
      }

      // Check connection state before attempting fetch
      // Skip polling if disconnected (unless forced retry)
      const connectionState = getConnectionState()
      if (!forced) {
        if (connectionState === 'disconnected') {
          logger.debug('Polling skipped: connection is disconnected')
          void ensureConnection()
          scheduleNextPoll(MINIMUM_SCHEDULE_DELAY)
          return
        }

        if (connectionState === 'connecting') {
          logger.debug('Polling skipped: connection is still being established')
          scheduleNextPoll(MINIMUM_SCHEDULE_DELAY)
          return
        }
      }

      if (isFetchingRef.current) {
        logger.debug('Polling skipped: request already in progress')
        return
      }

      if (isRaceComplete(raceStatusRef.current)) {
        stop('race-complete')
        return
      }

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      const requestStartTime = performance.now()

      try {
        isFetchingRef.current = true
        const controller = new AbortController()
        abortControllerRef.current = controller

        if (timeoutMs > 0) {
          timeoutHandle = setTimeout(() => {
            controller.abort()
          }, timeoutMs)
        }

        const response = await fetch(`/api/race/${race_id}`, {
          signal: controller.signal,
          cache: 'no-store',
          headers: {
            'X-Race-Polling': 'true',
          },
        })

        if (!response.ok) {
          throw new Error(
            `Polling request failed with status ${response.status}: ${response.statusText}`
          )
        }

        const data = (await response.json()) as RaceContextData
        const requestDuration = Math.round(performance.now() - requestStartTime)

        consecutiveFailuresRef.current = 0
        setError(null)
        setLastUpdated(new Date())
        setLastRequestDurationMs(requestDuration)

        // Update global connection state on successful fetch (recovery detection)
        setConnectionState('connected')

        if (data.race?.status) {
          raceStatusRef.current = data.race.status
        }
        if (data.race?.start_time) {
          raceStartTimeRef.current = data.race.start_time
        }

        onDataUpdateRef.current(data)

        if (isRaceComplete(raceStatusRef.current)) {
          stop('race-complete')
          return
        }

        const nextInterval = calculatePollingIntervalMs(
          raceStartTimeRef.current,
          raceStatusRef.current,
          isDoubleFrequencyEnabled
        )

        if (!Number.isFinite(nextInterval)) {
          stop('computed-infinite-interval')
          return
        }

        scheduleNextPoll(nextInterval)
      } catch (err) {
        const errorInstance =
          err instanceof Error
            ? err
            : new Error('Unexpected polling failure')

        if (errorInstance.name === 'AbortError') {
          logger.debug('Polling request aborted')
          return
        }

        consecutiveFailuresRef.current += 1

        const backoffDelay = Math.min(
          INITIAL_BACKOFF_MS * 2 ** (consecutiveFailuresRef.current - 1),
          MAX_BACKOFF_MS
        )

        setError(errorInstance)
        onErrorRef.current?.(errorInstance)
        logger.warn('Polling request failed', {
          error: errorInstance.message,
          attempt: consecutiveFailuresRef.current,
        })

        // Update global connection state on fetch failure
        setConnectionState('disconnected')

        scheduleNextPoll(backoffDelay)
      } finally {
        if (timeoutMs > 0 && typeof timeoutHandle !== 'undefined') {
          clearTimeout(timeoutHandle)
        }

        if (abortControllerRef.current) {
          abortControllerRef.current = null
        }
        isFetchingRef.current = false
      }
    },
    [
      isDoubleFrequencyEnabled,
      logger,
      race_id,
      scheduleNextPoll,
      stop,
      timeoutMs,
    ]
  )

  useEffect(() => {
    executePollRef.current = executePoll
  }, [executePoll])

  const startPolling = useCallback(
    (override?: { status?: string; start_time?: string }) => {
      if (!isFeatureEnabled) {
        return
      }

      if (!race_id || !hasInitialData) {
        return
      }

      if (override?.status) {
        raceStatusRef.current = override.status
      }

      if (override?.start_time) {
        raceStartTimeRef.current = override.start_time
      }

      const currentStatus = override?.status ?? raceStatusRef.current

      if (isRaceComplete(currentStatus)) {
        stop('race-complete')
        return
      }

      if (isPollingRef.current) {
        return
      }

      isPollingRef.current = true
      setIsPolling(true)
      consecutiveFailuresRef.current = 0

      const initialInterval = calculatePollingIntervalMs(
        raceStartTimeRef.current,
        currentStatus ?? 'open',
        isDoubleFrequencyEnabled
      )

      if (!Number.isFinite(initialInterval)) {
        stop('computed-infinite-interval')
        return
      }

      scheduleNextPoll(initialInterval)
    },
    [
      hasInitialData,
      isDoubleFrequencyEnabled,
      isFeatureEnabled,
      race_id,
      scheduleNextPoll,
      stop,
    ]
  )

  useEffect(() => {
    if (previousRaceIdRef.current && previousRaceIdRef.current !== race_id) {
      stop('race-changed')
      setLastUpdated(null)
      setError(null)
      consecutiveFailuresRef.current = 0
    }

    previousRaceIdRef.current = race_id ?? ''
  }, [race_id, stop])

  useEffect(() => {
    if (!isFeatureEnabled) {
      if (isPollingRef.current || timeoutRef.current) {
        stop('polling-disabled')
      } else {
        setIsPolling(false)
        setCurrentIntervalMs(null)
        setNextPollTimestamp(null)

        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
          abortControllerRef.current = null
        }
      }
      return
    }

    if (!race_id || !hasInitialData) {
      stop('missing-initial-data')
      return
    }

    const effectiveStatus = raceStatusRef.current ?? raceStatus ?? 'open'
    const effectiveRaceStartTime = raceStartTime ?? raceStartTimeRef.current

    if (isRaceComplete(effectiveStatus)) {
      stop('race-status-complete')
      return
    }

    if (!isPollingRef.current) {
      startPolling({ status: effectiveStatus, start_time: effectiveRaceStartTime ?? undefined })
      return
    }

    const nextInterval = calculatePollingIntervalMs(
      effectiveRaceStartTime || '',
      effectiveStatus,
      isDoubleFrequencyEnabled
    )

    if (!Number.isFinite(nextInterval)) {
      stop('computed-infinite-interval')
      return
    }

    scheduleNextPoll(nextInterval)
  }, [
    hasInitialData,
    isDoubleFrequencyEnabled,
    isFeatureEnabled,
    race_id,
    raceStartTime,
    raceStatus,
    scheduleNextPoll,
    startPolling,
    stop,
  ])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      isPollingRef.current = false
    }
  }, [])

  const retry = useCallback(async () => {
    if (!race_id) {
      return
    }

    if (!isPollingRef.current && isFeatureEnabled) {
      startPolling()
    }

    await executePoll({ forced: true, reason: 'manual-refresh' })
  }, [executePoll, isFeatureEnabled, race_id, startPolling])

  return {
    isPolling,
    error,
    last_updated,
    currentIntervalMs,
    nextPollTimestamp,
    isDoubleFrequencyEnabled,
    lastRequestDurationMs,
    retry,
    stop: () => {
      stop('manual-stop')
    },
  }
}
