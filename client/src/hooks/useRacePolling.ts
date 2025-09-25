'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RaceContextData } from '@/contexts/RaceContext'
import { useLogger } from '@/utils/logging'

interface PollingConfig {
  raceId: string
  raceStartTime: string
  raceStatus: string
  hasInitialData: boolean
  onDataUpdate: (data: RaceContextData) => void
  onError?: (error: Error) => void
}

export interface RacePollingState {
  isPolling: boolean
  error: Error | null
  lastUpdated: Date | null
  currentIntervalMs: number | null
  nextPollTimestamp: number | null
  isDoubleFrequencyEnabled: boolean
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
])

function isDoublePollingEnabled(): boolean {
  const rawValue =
    process.env.NEXT_PUBLIC_DOUBLE_POLLING_FREQUENCY ??
    process.env.DOUBLE_POLLING_FREQUENCY

  return rawValue !== undefined && rawValue.toLowerCase() === 'true'
}

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
  if (!raceStartTime) {
    return DEFAULT_ACTIVE_INTERVAL * (doubleFrequency ? 0.5 : 1)
  }

  if (isRaceComplete(raceStatus)) {
    return Number.POSITIVE_INFINITY
  }

  const startTimestamp = new Date(raceStartTime).getTime()
  const now = Date.now()

  if (Number.isNaN(startTimestamp)) {
    return DEFAULT_ACTIVE_INTERVAL * (doubleFrequency ? 0.5 : 1)
  }

  const minutesToStart = (startTimestamp - now) / MINUTE_IN_MS
  const multiplier = doubleFrequency ? 0.5 : 1

  if (minutesToStart > 65) {
    return DEFAULT_BASELINE_INTERVAL * multiplier
  }

  if (minutesToStart > 5) {
    return DEFAULT_ACTIVE_INTERVAL * multiplier
  }

  return DEFAULT_CRITICAL_INTERVAL * multiplier
}

export function useRacePolling(config: PollingConfig): RacePollingState {
  const { raceId, raceStartTime, raceStatus, hasInitialData } = config
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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [currentIntervalMs, setCurrentIntervalMs] = useState<number | null>(
    null
  )
  const [nextPollTimestamp, setNextPollTimestamp] = useState<number | null>(
    null
  )

  const isDoubleFrequencyEnabled = useMemo(
    () => isDoublePollingEnabled(),
    []
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
      if (!isPollingRef.current) {
        return
      }

      logger.info('Stopping race polling', { reason, raceId })
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
    [clearScheduledPoll, logger, raceId]
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

      timeoutRef.current = setTimeout(() => {
        const run = executePollRef.current
        if (run) {
          void run()
        }
      }, boundedDelay)
    },
    [clearScheduledPoll]
  )

  const executePoll = useCallback(
    async (options?: { forced?: boolean; reason?: string }) => {
      const forced = options?.forced ?? false

      if (!raceId) {
        return
      }

      if (!isPollingRef.current && !forced) {
        return
      }

      if (isFetchingRef.current) {
        logger.debug('Polling skipped: request already in progress')
        return
      }

      if (isRaceComplete(raceStatusRef.current)) {
        stop('race-complete')
        return
      }

      try {
        isFetchingRef.current = true
        const controller = new AbortController()
        abortControllerRef.current = controller

        const response = await fetch(`/api/race/${raceId}`, {
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

        consecutiveFailuresRef.current = 0
        setError(null)
        setLastUpdated(new Date())

        if (data.race?.status) {
          raceStatusRef.current = data.race.status
        }
        if (data.race?.startTime) {
          raceStartTimeRef.current = data.race.startTime
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

        scheduleNextPoll(backoffDelay)
      } finally {
        if (abortControllerRef.current) {
          abortControllerRef.current = null
        }
        isFetchingRef.current = false
      }
    },
    [isDoubleFrequencyEnabled, logger, raceId, scheduleNextPoll, stop]
  )

  useEffect(() => {
    executePollRef.current = executePoll
  }, [executePoll])

  const startPolling = useCallback(() => {
    if (!raceId || !hasInitialData) {
      return
    }

    if (isRaceComplete(raceStatusRef.current)) {
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
      raceStatusRef.current,
      isDoubleFrequencyEnabled
    )

    if (!Number.isFinite(initialInterval)) {
      stop('computed-infinite-interval')
      return
    }

    scheduleNextPoll(initialInterval)
  }, [hasInitialData, isDoubleFrequencyEnabled, raceId, scheduleNextPoll, stop])

  useEffect(() => {
    if (previousRaceIdRef.current && previousRaceIdRef.current !== raceId) {
      stop('race-changed')
      setLastUpdated(null)
      setError(null)
      consecutiveFailuresRef.current = 0
    }

    previousRaceIdRef.current = raceId ?? ''
  }, [raceId, stop])

  useEffect(() => {
    if (!raceId || !hasInitialData) {
      stop('missing-initial-data')
      return
    }

    if (isRaceComplete(raceStatusRef.current)) {
      stop('race-complete')
      return
    }

    startPolling()
  }, [hasInitialData, raceId, startPolling, stop])

  useEffect(() => {
    if (raceStatus && isRaceComplete(raceStatus)) {
      stop('race-status-complete')
    }
  }, [raceStatus, stop])

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
    if (!raceId) {
      return
    }

    if (!isPollingRef.current) {
      startPolling()
    }

    await executePoll({ forced: true, reason: 'manual-refresh' })
  }, [executePoll, raceId, startPolling])

  return {
    isPolling,
    error,
    lastUpdated,
    currentIntervalMs,
    nextPollTimestamp,
    isDoubleFrequencyEnabled,
    retry,
    stop: () => {
      stop('manual-stop')
    },
  }
}
