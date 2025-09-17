'use client'

/**
 * Alerts Configuration Modal
 * Story 5.1: Create Alerts Configuration UI
 *
 * Modal component for configuring percentage range indicators
 * Features: Toggle All, 6 percentage ranges, color customization, default reset
 */

import { useState, useEffect, useCallback } from 'react'
import type {
  AlertsConfig,
  AlertsModalState,
} from '@/types/alerts'
import {
  formatPercentageRange,
  INDICATOR_COLOR_PALETTE as COLOR_PALETTE,
  DEFAULT_USER_ID as DEFAULT_USER,
} from '@/types/alerts'
import {
  loadUserAlertConfig,
  saveUserAlertConfig,
  resetToDefaults,
} from '@/services/alertConfigService'

interface AlertsConfigModalProps {
  isOpen: boolean
  onClose: () => void
  userId?: string
}

export const AlertsConfigModal = ({
  isOpen,
  onClose,
  userId = DEFAULT_USER,
}: AlertsConfigModalProps) => {
  const [state, setState] = useState<AlertsModalState>({
    indicators: [],
    toggleAll: true,
    isLoading: true,
    isSaving: false,
    hasChanges: false,
  })

  const [originalConfig, setOriginalConfig] = useState<AlertsConfig | null>(null)

  const loadConfiguration = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }))
      const config = await loadUserAlertConfig(userId)
      setOriginalConfig(config)
      setState(prev => ({
        ...prev,
        indicators: config.indicators,
        toggleAll: config.toggleAll,
        isLoading: false,
        hasChanges: false,
      }))
    } catch (error) {
      console.error('Failed to load configuration:', error)
      setState(prev => ({ ...prev, isLoading: false }))
    }
  }, [userId])

  // Load configuration when modal opens
  useEffect(() => {
    if (isOpen) {
      loadConfiguration()
    }
  }, [isOpen, loadConfiguration])

  // Handle toggle all indicators
  const handleToggleAll = useCallback(async () => {
    const newToggleState = !state.toggleAll

    setState(prev => ({
      ...prev,
      indicators: prev.indicators.map(ind => ({ ...ind, enabled: newToggleState })),
      toggleAll: newToggleState,
      hasChanges: true,
    }))
  }, [state.toggleAll])

  // Handle individual indicator toggle
  const handleIndicatorToggle = useCallback((displayOrder: number) => {
    setState(prev => {
      const updatedIndicators = prev.indicators.map(ind =>
        ind.displayOrder === displayOrder ? { ...ind, enabled: !ind.enabled } : ind
      )
      const newToggleAll = updatedIndicators.every(ind => ind.enabled)

      return {
        ...prev,
        indicators: updatedIndicators,
        toggleAll: newToggleAll,
        hasChanges: true,
      }
    })
  }, [])

  // Handle color change
  const handleColorChange = useCallback((displayOrder: number, color: string) => {
    setState(prev => ({
      ...prev,
      indicators: prev.indicators.map(ind =>
        ind.displayOrder === displayOrder
          ? { ...ind, color, isDefault: false }
          : ind
      ),
      hasChanges: true,
    }))
  }, [])

  // Handle reset to defaults
  const handleResetToDefaults = async () => {
    try {
      setState(prev => ({ ...prev, isSaving: true }))
      const resetConfig = await resetToDefaults(userId)
      setState(prev => ({
        ...prev,
        indicators: resetConfig.indicators,
        toggleAll: resetConfig.toggleAll,
        isSaving: false,
        hasChanges: false,
      }))
      setOriginalConfig(resetConfig)
    } catch (error) {
      console.error('Failed to reset to defaults:', error)
      setState(prev => ({ ...prev, isSaving: false }))
    }
  }

  // Handle save
  const handleSave = async () => {
    try {
      setState(prev => ({ ...prev, isSaving: true }))

      const configToSave: AlertsConfig = {
        userId,
        indicators: state.indicators,
        toggleAll: state.toggleAll,
      }

      await saveUserAlertConfig(configToSave)
      setOriginalConfig(configToSave)
      setState(prev => ({
        ...prev,
        isSaving: false,
        hasChanges: false,
      }))
      onClose()
    } catch (error) {
      console.error('Failed to save configuration:', error)
      setState(prev => ({ ...prev, isSaving: false }))
    }
  }

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (originalConfig) {
      setState(prev => ({
        ...prev,
        indicators: originalConfig.indicators,
        toggleAll: originalConfig.toggleAll,
        hasChanges: false,
      }))
    }
    onClose()
  }, [originalConfig, onClose])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCancel()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, handleCancel])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={handleCancel}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="alerts-modal-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 id="alerts-modal-title" className="text-lg font-semibold text-gray-900">
            Indicators
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {state.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <span className="ml-2 text-gray-600">Loading...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Toggle All */}
              <div className="flex items-center p-3 bg-gray-50 rounded-lg">
                <label className="flex items-center cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={state.toggleAll}
                    onChange={handleToggleAll}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-900">
                    Toggle All
                  </span>
                </label>
              </div>

              {/* Indicators */}
              <div className="space-y-3">
                {state.indicators.map((indicator) => (
                  <div
                    key={indicator.displayOrder}
                    className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    {/* Checkbox */}
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={indicator.enabled}
                        onChange={() => handleIndicatorToggle(indicator.displayOrder)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </label>

                    {/* Percentage Range with Color */}
                    <div
                      className="mx-3 px-3 py-1 rounded text-white text-sm font-medium min-w-[80px] text-center"
                      style={{ backgroundColor: indicator.color }}
                    >
                      {formatPercentageRange(indicator)}
                    </div>

                    {/* Color Picker */}
                    <div className="flex-1">
                      <select
                        value={indicator.color}
                        onChange={(e) => handleColorChange(indicator.displayOrder, e.target.value)}
                        className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                        aria-label={`Color for ${formatPercentageRange(indicator)} range`}
                      >
                        {COLOR_PALETTE.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label} {option.isDefault ? '(Default)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Color Preview */}
                    <div className="ml-2 flex items-center">
                      <div
                        className="w-6 h-6 rounded border border-gray-300"
                        style={{ backgroundColor: indicator.color }}
                        title={`Current color: ${indicator.color}`}
                      />
                      <span className="ml-1 text-xs text-gray-500">
                        {indicator.displayOrder}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Default Reset Button */}
              <div className="pt-2">
                <button
                  onClick={handleResetToDefaults}
                  disabled={state.isSaving}
                  className="w-full px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {state.isSaving ? 'Resetting...' : 'Default'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            onClick={handleCancel}
            disabled={state.isSaving}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={state.isSaving || !state.hasChanges}
            className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {state.isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AlertsConfigModal