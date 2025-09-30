'use client'

import { useCallback } from 'react'
import type { PollingEndpointKey } from '@/types/pollingMetrics'

/**
 * Helper for tracking endpoint request metrics
 *
 * This hook provides a simple way for data-fetching hooks to report
 * their activity to the polling metrics system via a custom event.
 */
export function useEndpointMetrics(endpoint: PollingEndpointKey) {
  const recordRequest = useCallback(
    (result: { success: boolean; durationMs?: number; error?: string }) => {
      // Dispatch custom event for metrics tracking
      const event = new CustomEvent('endpoint-metrics', {
        detail: {
          endpoint,
          timestamp: new Date(),
          success: result.success,
          durationMs: result.durationMs,
          error: result.error,
        },
      })
      window.dispatchEvent(event)
    },
    [endpoint]
  )

  return { recordRequest }
}