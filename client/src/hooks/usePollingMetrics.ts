'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { RacePollingState } from './useRacePolling'
import type {
  PollingMetrics,
  PollingEvent,
  PollingEndpointKey,
  EndpointMetrics,
  CadenceStatus,
  PollingAlert,
  ActivityEvent,
  PollingMetricsConfig,
} from '@/types/pollingMetrics'
import { DEFAULT_POLLING_METRICS_CONFIG, PollingEndpoint } from '@/types/pollingMetrics'

/**
 * Hook for tracking and aggregating polling metrics
 *
 * Monitors polling activity across all endpoints, calculates health metrics,
 * detects anomalies, and provides observability into the polling system.
 */
export function usePollingMetrics(
  pollingState: RacePollingState,
  config: PollingMetricsConfig = {}
): PollingMetrics {
  const mergedConfig = useRef({ ...DEFAULT_POLLING_METRICS_CONFIG, ...config }).current

  // Metrics state
  const [metrics, setMetrics] = useState<PollingMetrics>(() => initializeMetrics())

  // Track polling session start time
  const sessionStartRef = useRef<Date>(new Date())

  // Track events for metric calculation
  const eventsRef = useRef<PollingEvent[]>([])

  // Track last poll timestamp for cadence calculation
  const lastPollTimestampRef = useRef<number | null>(null)

  /**
   * Initialize empty metrics structure
   */
  function initializeMetrics(): PollingMetrics {
    const emptyEndpointMetrics: EndpointMetrics = {
      requests: 0,
      errors: 0,
      latency: 0,
      lastSuccess: null,
      status: 'OK',
      fallbacks: 0,
      recoveries: 0,
      lastError: null,
    }

    return {
      requests: 0,
      successRate: 100,
      errorRate: 0,
      avgLatency: 0,
      endpoints: {
        [PollingEndpoint.RACE]: { ...emptyEndpointMetrics },
        [PollingEndpoint.ENTRANTS]: { ...emptyEndpointMetrics },
        [PollingEndpoint.POOLS]: { ...emptyEndpointMetrics },
        [PollingEndpoint.MONEY_FLOW]: { ...emptyEndpointMetrics },
      },
      cadence: {
        targetIntervalMs: 0,
        actualIntervalMs: null,
        status: 'on-track',
        nextPollTimestamp: null,
        durationSeconds: 0,
      },
      alerts: [],
      recentActivity: [],
      uptime: 100,
    }
  }

  /**
   * Record a polling event
   */
  const recordEvent = useCallback(
    (event: PollingEvent) => {
      eventsRef.current.push(event)

      // Trim to reasonable size
      if (eventsRef.current.length > 1000) {
        eventsRef.current = eventsRef.current.slice(-500)
      }

      // Track poll timestamps for cadence calculation
      if (event.type === 'success') {
        lastPollTimestampRef.current = event.timestamp.getTime()
      }
    },
    []
  )

  /**
   * Calculate aggregated metrics from events
   */
  const calculateMetrics = useCallback((): PollingMetrics => {
    const events = eventsRef.current
    const now = new Date()

    // Initialize endpoint metrics
    const endpointMetrics: Record<PollingEndpointKey, EndpointMetrics> = {
      [PollingEndpoint.RACE]: {
        requests: 0,
        errors: 0,
        latency: 0,
        lastSuccess: null,
        status: 'OK',
        fallbacks: 0,
        recoveries: 0,
        lastError: null,
      },
      [PollingEndpoint.ENTRANTS]: {
        requests: 0,
        errors: 0,
        latency: 0,
        lastSuccess: null,
        status: 'OK',
        fallbacks: 0,
        recoveries: 0,
        lastError: null,
      },
      [PollingEndpoint.POOLS]: {
        requests: 0,
        errors: 0,
        latency: 0,
        lastSuccess: null,
        status: 'OK',
        fallbacks: 0,
        recoveries: 0,
        lastError: null,
      },
      [PollingEndpoint.MONEY_FLOW]: {
        requests: 0,
        errors: 0,
        latency: 0,
        lastSuccess: null,
        status: 'OK',
        fallbacks: 0,
        recoveries: 0,
        lastError: null,
      },
    }

    let totalRequests = 0
    let totalErrors = 0
    let totalLatency = 0
    let latencyCount = 0

    // Aggregate metrics per endpoint
    events.forEach((event) => {
      const endpoint = endpointMetrics[event.endpoint]

      if (event.type === 'start') {
        endpoint.requests++
        totalRequests++
      } else if (event.type === 'success') {
        if (event.durationMs !== undefined) {
          endpoint.latency =
            (endpoint.latency * latencyCount + event.durationMs) / (latencyCount + 1)
          totalLatency += event.durationMs
          latencyCount++
        }
        endpoint.lastSuccess = event.timestamp
        if (endpoint.errors > 0) {
          endpoint.recoveries++
        }
      } else if (event.type === 'error') {
        endpoint.errors++
        totalErrors++
        endpoint.lastError = event.error || 'Unknown error'
      }

      if (event.usedFallback) {
        endpoint.fallbacks++
      }
    })

    // Calculate endpoint status
    Object.values(endpointMetrics).forEach((endpoint) => {
      if (endpoint.requests === 0) {
        endpoint.status = 'OK'
      } else {
        const errorRate = (endpoint.errors / endpoint.requests) * 100
        if (errorRate >= mergedConfig.errorRateThreshold) {
          endpoint.status = 'ERROR'
        } else if (
          errorRate > 0 ||
          (endpoint.latency > 0 && endpoint.latency > mergedConfig.latencyThreshold)
        ) {
          endpoint.status = 'WARNING'
        } else {
          endpoint.status = 'OK'
        }
      }
    })

    // Calculate overall success/error rates
    const successRate = totalRequests > 0 ? ((totalRequests - totalErrors) / totalRequests) * 100 : 100
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0
    const avgLatency = latencyCount > 0 ? totalLatency / latencyCount : 0

    // Calculate cadence metrics
    const targetIntervalMs = pollingState.currentIntervalMs || 0
    let actualIntervalMs: number | null = null
    let cadenceStatus: CadenceStatus = 'on-track'

    if (
      lastPollTimestampRef.current !== null &&
      pollingState.lastUpdated !== null
    ) {
      actualIntervalMs =
        pollingState.lastUpdated.getTime() - lastPollTimestampRef.current
      if (targetIntervalMs > 0) {
        const deviation = Math.abs(actualIntervalMs - targetIntervalMs) / targetIntervalMs
        if (deviation > mergedConfig.cadenceTolerancePercent / 100) {
          cadenceStatus = actualIntervalMs > targetIntervalMs ? 'behind' : 'ahead'
        }
      }
    }

    const durationSeconds = Math.floor(
      (now.getTime() - sessionStartRef.current.getTime()) / 1000
    )

    // Generate alerts
    const alerts: PollingAlert[] = []
    let alertId = 0

    Object.entries(endpointMetrics).forEach(([key, endpoint]) => {
      const endpointKey = key as PollingEndpointKey
      if (endpoint.status === 'ERROR') {
        alerts.push({
          id: `alert-${alertId++}`,
          severity: 'error',
          message: `High polling error rate detected`,
          endpoint: endpointKey,
          timestamp: now,
          metadata: {
            errorRate: endpoint.requests > 0 ? (endpoint.errors / endpoint.requests) * 100 : 0,
            lastError: endpoint.lastError,
          },
        })
      }

      if (endpoint.latency > mergedConfig.latencyThreshold) {
        alerts.push({
          id: `alert-${alertId++}`,
          severity: 'warning',
          message: `${endpointKey} experiencing high latency`,
          endpoint: endpointKey,
          timestamp: now,
          metadata: { latency: endpoint.latency },
        })
      }
    })

    if (errorRate >= mergedConfig.errorRateThreshold) {
      alerts.push({
        id: `alert-${alertId++}`,
        severity: 'error',
        message: 'High polling error rate detected',
        timestamp: now,
        metadata: { errorRate: errorRate.toFixed(1) },
      })
    }

    // Generate recent activity log
    const recentActivity: ActivityEvent[] = events
      .slice(-mergedConfig.maxActivityEvents)
      .map((event) => {
        let type: ActivityEvent['type'] = 'info'
        let message = ''

        if (event.type === 'start') {
          type = 'request'
          message = `Polling ${event.endpoint} started`
        } else if (event.type === 'success') {
          type = 'success'
          message = `${event.endpoint} poll succeeded${event.durationMs ? ` (${event.durationMs}ms)` : ''}`
        } else if (event.type === 'error') {
          type = 'error'
          message = `${event.endpoint} poll failed: ${event.error || 'Unknown error'}`
        }

        return {
          timestamp: event.timestamp,
          type,
          message,
          endpoint: event.endpoint,
          durationMs: event.durationMs,
        }
      })
      .reverse()

    // Calculate uptime (percentage of time without errors)
    const uptime = totalRequests > 0 ? successRate : 100

    return {
      requests: totalRequests,
      successRate,
      errorRate,
      avgLatency,
      endpoints: endpointMetrics,
      cadence: {
        targetIntervalMs,
        actualIntervalMs,
        status: cadenceStatus,
        nextPollTimestamp: pollingState.nextPollTimestamp,
        durationSeconds,
      },
      alerts,
      recentActivity,
      uptime,
    }
  }, [pollingState, mergedConfig])

  /**
   * Update metrics when polling state changes
   */
  useEffect(() => {
    // Record polling activity from pollingState
    if (pollingState.isPolling && pollingState.lastUpdated) {
      recordEvent({
        timestamp: pollingState.lastUpdated,
        endpoint: PollingEndpoint.RACE, // Primary endpoint
        type: pollingState.error ? 'error' : 'success',
        error: pollingState.error?.message,
      })
    }

    // Recalculate metrics
    const newMetrics = calculateMetrics()
    setMetrics(newMetrics)
  }, [
    pollingState.isPolling,
    pollingState.error,
    pollingState.lastUpdated,
    recordEvent,
    calculateMetrics,
  ])

  return metrics
}