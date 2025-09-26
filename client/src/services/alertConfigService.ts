/**
 * Alert Configuration Service
 * Story 5.1: Create Alerts Configuration UI
 *
 * Handles CRUD operations for user alert indicator configurations via API routes
 */

import type { AlertsConfig } from '@/types/alerts'
import { DEFAULT_INDICATORS as DEFAULT_INDICATOR_CONFIGS, DEFAULT_USER_ID } from '@/types/alerts'

// Lightweight in-flight dedup for service calls
const inFlight = new Map<string, Promise<any>>()

// Service now uses API routes instead of direct database access
export const initializeAlertConfigService = () => {
  // No initialization needed for API-based service
}

/**
 * Load user alert configuration
 * Returns 6 indicator configurations for the specified user
 */
export const loadUserAlertConfig = async (userId: string = DEFAULT_USER_ID): Promise<AlertsConfig> => {
  const key = `load:${userId}`
  const existing = inFlight.get(key)
  if (existing) return existing

  const req = (async (): Promise<AlertsConfig> => {
    try {
      const response = await fetch(`/api/user-alert-configs?userId=${encodeURIComponent(userId)}`)

      if (!response.ok) {
        throw new Error(`Failed to load alert config: ${response.statusText}`)
      }

      const config = await response.json()
      const audibleAlertsEnabled =
        config.audibleAlertsEnabled ??
        config.indicators?.[0]?.audibleAlertsEnabled ??
        true

      return {
        ...config,
        audibleAlertsEnabled,
      }
    } catch (error) {
      console.error('Failed to load user alert config:', error)

      // Return defaults on error
      const defaultIndicators = DEFAULT_INDICATOR_CONFIGS.map((defaultInd, index) => ({
        ...defaultInd,
        $id: `default-${index}`,
        userId,
        lastUpdated: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }))

      return {
        userId,
        indicators: defaultIndicators,
        toggleAll: true,
        audibleAlertsEnabled: true,
      }
    } finally {
      inFlight.delete(key)
    }
  })()

  inFlight.set(key, req)
  return req
}

/**
 * Save user alert configuration
 * Updates all 6 indicator configurations for the user
 */
export const saveUserAlertConfig = async (config: AlertsConfig): Promise<void> => {
  const key = `save:${config.userId}`
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<void>

  const req = (async () => {
    try {
      const response = await fetch('/api/user-alert-configs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: config.userId,
          indicators: config.indicators,
          audibleAlertsEnabled: config.audibleAlertsEnabled,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to save alert config: ${response.statusText}`)
      }
    } catch (error) {
      console.error('Failed to save user alert config:', error)
      throw new Error('Failed to save alert configuration. Please try again.')
    } finally {
      inFlight.delete(key)
    }
  })()

  inFlight.set(key, req)
  return req
}

/**
 * Reset user configuration to defaults
 * Resets colors and enables all indicators
 */
export const resetToDefaults = async (userId: string = DEFAULT_USER_ID): Promise<AlertsConfig> => {
  const key = `reset:${userId}`
  const existing = inFlight.get(key)
  if (existing) return existing

  const req = (async (): Promise<AlertsConfig> => {
    try {
      const response = await fetch('/api/user-alert-configs/reset', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      })

      if (!response.ok) {
        throw new Error(`Failed to reset alert config: ${response.statusText}`)
      }

      const resetConfig = await response.json()
      const audibleAlertsEnabled =
        resetConfig.audibleAlertsEnabled ??
        resetConfig.indicators?.[0]?.audibleAlertsEnabled ??
        true
      return {
        ...resetConfig,
        audibleAlertsEnabled,
      }
    } catch (error) {
      console.error('Failed to reset to defaults:', error)
      throw new Error('Failed to reset to default configuration. Please try again.')
    } finally {
      inFlight.delete(key)
    }
  })()

  inFlight.set(key, req)
  return req
}

// Validation helper
export const validateAlertConfig = (config: AlertsConfig): string[] => {
  const errors: string[] = []

  if (!config.userId) {
    errors.push('User ID is required')
  }

  if (!config.indicators || config.indicators.length !== 6) {
    errors.push('Exactly 6 indicators are required')
  }

  if (typeof config.audibleAlertsEnabled !== 'boolean') {
    errors.push('Audible alerts enabled flag must be a boolean')
  }

  // Validate each indicator
  config.indicators?.forEach((indicator, index) => {
    if (indicator.displayOrder !== index + 1) {
      errors.push(`Indicator ${index + 1} has incorrect display order`)
    }

    if (indicator.userId !== config.userId) {
      errors.push(`Indicator ${index + 1} has mismatched user ID`)
    }

    if (!/^#[0-9A-F]{6}$/i.test(indicator.color)) {
      errors.push(`Indicator ${index + 1} has invalid color format`)
    }
  })

  return errors
}
