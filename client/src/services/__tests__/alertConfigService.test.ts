/**
 * AlertConfigService Tests
 * Story 5.1: Create Alerts Configuration UI
 *
 * Tests for the alert configuration service API integration
 */

jest.mock('@/state/connectionState', () => ({
  isConnectionHealthy: jest.fn(),
  ensureConnection: jest.fn(),
}))

import {
  loadUserAlertConfig,
  saveUserAlertConfig,
  resetToDefaults,
  validateAlertConfig,
} from '../alertConfigService'
import { DEFAULT_INDICATORS, DEFAULT_USER_ID } from '@/types/alerts'
import { ensureConnection, isConnectionHealthy } from '@/state/connectionState'

// Mock fetch
global.fetch = jest.fn()

const mockFetch = fetch as jest.MockedFunction<typeof fetch>
const mockIsConnectionHealthy = isConnectionHealthy as jest.MockedFunction<typeof isConnectionHealthy>
const mockEnsureConnection = ensureConnection as jest.MockedFunction<typeof ensureConnection>

describe('AlertConfigService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsConnectionHealthy.mockReturnValue(true)
    mockEnsureConnection.mockResolvedValue(true)
  })

  describe('loadUserAlertConfig', () => {
    it('loads user configuration successfully', async () => {
      const mockConfig = {
        userId: 'test-user',
        indicators: DEFAULT_INDICATORS.map((ind, index) => ({
          ...ind,
          $id: `indicator-${index}`,
          userId: 'test-user',
          lastUpdated: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          audibleAlertsEnabled: true,
        })),
        toggleAll: true,
        audibleAlertsEnabled: true,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig,
      } as Response)

      const result = await loadUserAlertConfig('test-user')

      expect(mockFetch).toHaveBeenCalledWith('/api/user-alert-configs?userId=test-user')
      expect(result).toEqual(mockConfig)
    })

    it('uses default user ID when none provided', async () => {
      const mockConfig = {
        userId: DEFAULT_USER_ID,
        indicators: [],
        toggleAll: true,
        audibleAlertsEnabled: true,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig,
      } as Response)

      await loadUserAlertConfig()

      expect(mockFetch).toHaveBeenCalledWith(`/api/user-alert-configs?userId=${encodeURIComponent(DEFAULT_USER_ID)}`)
    })

    it('returns defaults on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      } as Response)

      const result = await loadUserAlertConfig('test-user')

      expect(result.userId).toBe('test-user')
      expect(result.indicators).toHaveLength(6)
      expect(result.toggleAll).toBe(true)
      expect(result.audibleAlertsEnabled).toBe(true)
    })

    it('returns defaults on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await loadUserAlertConfig('test-user')

      expect(result.userId).toBe('test-user')
      expect(result.indicators).toHaveLength(6)
      expect(result.toggleAll).toBe(true)
      expect(result.audibleAlertsEnabled).toBe(true)
    })

    it('returns defaults when connection is unavailable', async () => {
      mockIsConnectionHealthy.mockReturnValue(false)
      mockEnsureConnection.mockResolvedValue(false)

      const result = await loadUserAlertConfig('test-user')

      expect(mockEnsureConnection).toHaveBeenCalled()
      expect(mockFetch).not.toHaveBeenCalled()
      expect(result.userId).toBe('test-user')
      expect(result.indicators).toHaveLength(6)
      expect(result.toggleAll).toBe(true)
      expect(result.audibleAlertsEnabled).toBe(true)
    })
  })

  describe('saveUserAlertConfig', () => {
    it('saves configuration successfully', async () => {
      const config = {
        userId: 'test-user',
        indicators: DEFAULT_INDICATORS.map((ind, index) => ({
          ...ind,
          $id: `indicator-${index}`,
          userId: 'test-user',
          lastUpdated: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          audibleAlertsEnabled: true,
        })),
        toggleAll: true,
        audibleAlertsEnabled: true,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response)

      await saveUserAlertConfig(config)

      expect(mockFetch).toHaveBeenCalledWith('/api/user-alert-configs', {
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
    })

    it('throws error on API failure', async () => {
      const config = {
        userId: 'test-user',
        indicators: [],
        toggleAll: true,
        audibleAlertsEnabled: true,
      }

      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      } as Response)

      await expect(saveUserAlertConfig(config)).rejects.toThrow(
        'Failed to save alert configuration. Please try again.'
      )
    })

    it('throws error on network failure', async () => {
      const config = {
        userId: 'test-user',
        indicators: [],
        toggleAll: true,
        audibleAlertsEnabled: true,
      }

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(saveUserAlertConfig(config)).rejects.toThrow(
        'Failed to save alert configuration. Please try again.'
      )
    })

    it('throws a descriptive error when connection is unavailable', async () => {
      mockIsConnectionHealthy.mockReturnValue(false)
      mockEnsureConnection.mockResolvedValue(false)

      const config = {
        userId: 'test-user',
        indicators: [],
        toggleAll: true,
        audibleAlertsEnabled: true,
      }

      await expect(saveUserAlertConfig(config)).rejects.toThrow(
        'Cannot save alert configuration while offline. Please reconnect and try again.'
      )

      expect(mockEnsureConnection).toHaveBeenCalled()
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('resetToDefaults', () => {
    it('resets configuration successfully', async () => {
      const mockResetConfig = {
        userId: 'test-user',
        indicators: DEFAULT_INDICATORS.map((ind, index) => ({
          ...ind,
          $id: `indicator-${index}`,
          userId: 'test-user',
          enabled: true,
          isDefault: true,
          lastUpdated: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          audibleAlertsEnabled: true,
        })),
        toggleAll: true,
        audibleAlertsEnabled: true,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResetConfig,
      } as Response)

      const result = await resetToDefaults('test-user')

      expect(mockFetch).toHaveBeenCalledWith('/api/user-alert-configs/reset', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: 'test-user' }),
      })

      expect(result).toEqual(mockResetConfig)
    })

    it('uses default user ID when none provided', async () => {
      const mockResetConfig = {
        userId: DEFAULT_USER_ID,
        indicators: [],
        toggleAll: true,
        audibleAlertsEnabled: true,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResetConfig,
      } as Response)

      await resetToDefaults()

      expect(mockFetch).toHaveBeenCalledWith('/api/user-alert-configs/reset', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: DEFAULT_USER_ID }),
      })
    })

    it('throws error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      } as Response)

      await expect(resetToDefaults('test-user')).rejects.toThrow(
        'Failed to reset to default configuration. Please try again.'
      )
    })

    it('throws a descriptive error when connection is unavailable', async () => {
      mockIsConnectionHealthy.mockReturnValue(false)
      mockEnsureConnection.mockResolvedValue(false)

      await expect(resetToDefaults('test-user')).rejects.toThrow(
        'Cannot reset alert configuration while offline. Please reconnect and try again.'
      )

      expect(mockEnsureConnection).toHaveBeenCalled()
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('validateAlertConfig', () => {
    it('validates correct configuration', () => {
      const validConfig = {
        userId: 'test-user',
        indicators: DEFAULT_INDICATORS.map((ind, index) => ({
          ...ind,
          $id: `indicator-${index}`,
          userId: 'test-user',
          lastUpdated: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          audibleAlertsEnabled: true,
        })),
        toggleAll: true,
        audibleAlertsEnabled: true,
      }

      const errors = validateAlertConfig(validConfig)
      expect(errors).toEqual([])
    })

    it('validates missing user ID', () => {
      const invalidConfig = {
        userId: '',
        indicators: DEFAULT_INDICATORS.map((ind, index) => ({
          ...ind,
          $id: `indicator-${index}`,
          userId: '',
          lastUpdated: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          audibleAlertsEnabled: true,
        })),
        toggleAll: true,
        audibleAlertsEnabled: true,
      }

      const errors = validateAlertConfig(invalidConfig)
      expect(errors).toContain('User ID is required')
    })

    it('validates incorrect number of indicators', () => {
      const invalidConfig = {
        userId: 'test-user',
        indicators: DEFAULT_INDICATORS.slice(0, 3).map((ind, index) => ({
          ...ind,
          $id: `indicator-${index}`,
          userId: 'test-user',
          lastUpdated: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          audibleAlertsEnabled: true,
        })),
        toggleAll: true,
        audibleAlertsEnabled: true,
      }

      const errors = validateAlertConfig(invalidConfig)
      expect(errors).toContain('Exactly 6 indicators are required')
    })

    it('validates indicator display order', () => {
      const invalidConfig = {
        userId: 'test-user',
        indicators: DEFAULT_INDICATORS.map((ind, index) => ({
          ...ind,
          $id: `indicator-${index}`,
          userId: 'test-user',
          displayOrder: index + 2, // Wrong display order
          lastUpdated: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          audibleAlertsEnabled: true,
        })),
        toggleAll: true,
        audibleAlertsEnabled: true,
      }

      const errors = validateAlertConfig(invalidConfig)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors.some(error => error.includes('incorrect display order'))).toBe(true)
    })

    it('validates mismatched user ID in indicators', () => {
      const invalidConfig = {
        userId: 'test-user',
        indicators: DEFAULT_INDICATORS.map((ind, index) => ({
          ...ind,
          $id: `indicator-${index}`,
          userId: 'different-user', // Mismatched user ID
          lastUpdated: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          audibleAlertsEnabled: true,
        })),
        toggleAll: true,
        audibleAlertsEnabled: true,
      }

      const errors = validateAlertConfig(invalidConfig)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors.some(error => error.includes('mismatched user ID'))).toBe(true)
    })

    it('validates invalid color format', () => {
      const invalidConfig = {
        userId: 'test-user',
        indicators: DEFAULT_INDICATORS.map((ind, index) => ({
          ...ind,
          $id: `indicator-${index}`,
          userId: 'test-user',
          color: 'invalid-color', // Invalid color
          lastUpdated: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          audibleAlertsEnabled: true,
        })),
        toggleAll: true,
        audibleAlertsEnabled: true,
      }

      const errors = validateAlertConfig(invalidConfig)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors.some(error => error.includes('invalid color format'))).toBe(true)
    })

    it('validates audible alerts flag type', () => {
      const invalidConfig = {
        userId: 'test-user',
        indicators: DEFAULT_INDICATORS.map((ind, index) => ({
          ...ind,
          $id: `indicator-${index}`,
          userId: 'test-user',
          lastUpdated: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          audibleAlertsEnabled: true,
        })),
        toggleAll: true,
        audibleAlertsEnabled: undefined as unknown as boolean,
      }

      const errors = validateAlertConfig(invalidConfig)
      expect(errors).toContain('Audible alerts enabled flag must be a boolean')
    })
  })
})
