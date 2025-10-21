/**
 * Alert Configuration Service
 * Story 5.1: Create Alerts Configuration UI
 *
 * Handles CRUD operations for user alert indicator configurations via API routes
 */

import { ensureConnection, isConnectionHealthy } from '@/state/connectionState'
import type { AlertsConfig } from '@/types/alerts'
import { DEFAULT_INDICATORS as DEFAULT_INDICATOR_CONFIGS, DEFAULT_USER_ID } from '@/types/alerts'

// Lightweight in-flight dedup for service calls
const createDefaultConfig = (userId: string): AlertsConfig => {
  const defaultIndicators = DEFAULT_INDICATOR_CONFIGS.map((defaultInd, index) => ({
    ...defaultInd,
    indicator_id: `default-${index}`,
    user_id: userId,
    last_updated: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }))

  return {
    user_id: userId,
    indicators: defaultIndicators,
    toggle_all: true,
    audible_alerts_enabled: true,
  }
}

const inFlight = new Map<string, Promise<unknown>>()

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
  if (existing) return existing as Promise<AlertsConfig>

  if (!(isConnectionHealthy() || (await ensureConnection()))) {
    console.warn('Skipping alert config load while connection is unavailable')
    return createDefaultConfig(userId)
  }

  const req = (async (): Promise<AlertsConfig> => {
    try {
      const response = await fetch(`/api/user-alert-configs?userId=${encodeURIComponent(userId)}`)

      if (!response.ok) {
        throw new Error(`Failed to load alert config: ${response.statusText}`)
      }

      const config = await response.json()
      const audibleAlertsEnabled =
        config.audible_alerts_enabled ??
        config.indicators?.[0]?.audible_alerts_enabled ??
        true

      return {
        ...config,
        audibleAlertsEnabled,
      }
    } catch (error) {
      console.error('Failed to load user alert config:', error)

      // Return defaults on error
      return createDefaultConfig(userId)
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
  const key = `save:${config.user_id}`
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<void>

  if (!(isConnectionHealthy() || (await ensureConnection()))) {
    console.warn('Skipping alert config save while connection is unavailable')
    throw new Error('Cannot save alert configuration while offline. Please reconnect and try again.')
  }

  const req = (async () => {
    try {
      const response = await fetch('/api/user-alert-configs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: config.user_id,
          indicators: config.indicators,
          audible_alerts_enabled: config.audible_alerts_enabled,
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
  if (existing) return existing as Promise<AlertsConfig>

  if (!(isConnectionHealthy() || (await ensureConnection()))) {
    console.warn('Skipping alert config reset while connection is unavailable')
    throw new Error('Cannot reset alert configuration while offline. Please reconnect and try again.')
  }

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
        resetConfig.audible_alerts_enabled ??
        resetConfig.indicators?.[0]?.audible_alerts_enabled ??
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

  if (!config.user_id) {
    errors.push('User ID is required')
  }

  if (!config.indicators || config.indicators.length !== 6) {
    errors.push('Exactly 6 indicators are required')
  }

  if (typeof config.audible_alerts_enabled !== 'boolean') {
    errors.push('Audible alerts enabled flag must be a boolean')
  }

  // Validate each indicator
  config.indicators?.forEach((indicator, index) => {
    if (indicator.display_order !== index + 1) {
      errors.push(`Indicator ${index + 1} has incorrect display order`)
    }

    if (indicator.user_id !== config.user_id) {
      errors.push(`Indicator ${index + 1} has mismatched user ID`)
    }

    if (!/^#[0-9A-F]{6}$/i.test(indicator.color)) {
      errors.push(`Indicator ${index + 1} has invalid color format`)
    }
  })

  return errors
}
