'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RacePoolData } from '@/types/racePools'
import { useEndpointMetrics } from './useEndpointMetrics'
import { PollingEndpoint } from '@/types/pollingMetrics'
import { getConnectionState } from '@/state/connectionState'

interface UseRacePoolsResult {
  poolData: RacePoolData | null
  isLoading: boolean
  error: string | null
  lastUpdate: Date | null
  refetch: () => Promise<void>
}

/**
 * useRacePools
 * - Deduplicates in-flight requests per component instance
 * - Uses AbortController with proper cleanup to prevent leaks
 * - Defers initial fetch to avoid dev StrictMode double-invoke aborts
 */
export function useRacePools(
  race_id?: string,
  trigger?: unknown
): UseRacePoolsResult {
  const [poolData, setPoolData] = useState<RacePoolData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const pendingRequestRef = useRef<Promise<void> | null>(null)
  const scheduledRef = useRef<number | null>(null) // rAF or setTimeout id
  const unmountedRef = useRef(false)

  // Metrics tracking
  const { recordRequest } = useEndpointMetrics(PollingEndpoint.POOLS)

  const clearScheduled = () => {
    if (scheduledRef.current !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(scheduledRef.current)
      } else {
        clearTimeout(scheduledRef.current as unknown as number)
      }
      scheduledRef.current = null
    }
  }

  const startFetch = useCallback(async () => {
    if (!race_id) return

    // Check connection state before attempting fetch
    const connectionState = getConnectionState()
    if (connectionState !== 'connected') {
      // Don't attempt fetch if not connected
      setError('Connection unavailable')
      return
    }

    // If a request is already in-flight, reuse it
    if (pendingRequestRef.current) {
      return pendingRequestRef.current
    }

    setIsLoading(true)
    setError(null)

    const controller = new AbortController()
    abortControllerRef.current = controller
    const requestStartTime = performance.now()

    const promise = (async () => {
      try {
        const response = await fetch(`/api/race/${race_id}/pools`, {
          signal: controller.signal,
          cache: 'no-store',
          headers: { 'X-Pools-Fetch': 'true' },
        })

        if (!response.ok) {
          throw new Error(
            `Failed to fetch pool data: ${response.status} ${response.statusText}`
          )
        }

        const data: RacePoolData = await response.json()
        const requestDuration = Math.round(performance.now() - requestStartTime)

        if (!unmountedRef.current && !controller.signal.aborted) {
          setPoolData(data)
          setLastUpdate(new Date())
          setError(null)

          // Record successful request
          recordRequest({
            success: true,
            durationMs: requestDuration,
          })
        }
      } catch (err) {
        // Ignore intentional aborts
        if ((err as Error)?.name === 'AbortError' || controller.signal.aborted) {
          return
        }

        const requestDuration = Math.round(performance.now() - requestStartTime)
        const message = (err as Error)?.message || 'Unknown pools fetch error'

        if (!unmountedRef.current) {
          setError(message)
          setPoolData(null)

          // Record failed request
          recordRequest({
            success: false,
            durationMs: requestDuration,
            error: message,
          })
        }
      } finally {
        if (!unmountedRef.current) {
          setIsLoading(false)
        }
        pendingRequestRef.current = null
      }
    })()

    pendingRequestRef.current = promise
    return promise
  }, [race_id, recordRequest])

  const scheduleFetch = useCallback(() => {
    clearScheduled()
    if (!race_id) return

    // Defer to next frame to avoid dev StrictMode immediate abort churn
    if (typeof requestAnimationFrame !== 'undefined') {
      scheduledRef.current = requestAnimationFrame(() => {
        scheduledRef.current = null
        void startFetch()
      })
    } else {
      // Fallback for non-browser test environments
      const id = setTimeout(() => {
        scheduledRef.current = null
        void startFetch()
      }, 0) as unknown as number
      scheduledRef.current = id
    }
  }, [race_id, startFetch])

  // Trigger fetch on race_id change or external trigger (e.g., polling tick)
  useEffect(() => {
    if (!race_id) {
      setPoolData(null)
      setLastUpdate(null)
      setIsLoading(false)
      setError(null)
      return
    }

    scheduleFetch()

    return () => {
      clearScheduled()
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race_id, trigger])

  useEffect(() => {
    // Reset unmounted flag on mount. In React StrictMode the effect cleanup
    // is invoked immediately after the first mount to surface side-effects,
    // which was leaving the flag stuck on `true` and preventing state updates.
    unmountedRef.current = false

    return () => {
      unmountedRef.current = true
      clearScheduled()
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  const refetch = useCallback(async () => {
    if (!race_id) return
    // Cancel any pending scheduled fetch and in-flight request
    clearScheduled()
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    await startFetch()
  }, [race_id, startFetch])

  return { poolData, isLoading, error, lastUpdate, refetch }
}

export default useRacePools

