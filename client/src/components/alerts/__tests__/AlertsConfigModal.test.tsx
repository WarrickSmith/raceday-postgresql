/**
 * AlertsConfigModal Tests
 * Story 5.1: Create Alerts Configuration UI
 *
 * Tests for the AlertsConfigModal component functionality
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AlertsConfigModal } from '../AlertsConfigModal'
import * as alertConfigService from '@/services/alertConfigService'
import { DEFAULT_INDICATORS } from '@/types/alerts'

// Mock the alert config service
jest.mock('@/services/alertConfigService', () => ({
  loadUserAlertConfig: jest.fn(),
  saveUserAlertConfig: jest.fn(),
  resetToDefaults: jest.fn(),
}))

const mockAlertConfigService = alertConfigService as jest.Mocked<typeof alertConfigService>

describe('AlertsConfigModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    userId: 'test-user',
  }

  const mockConfig = {
    userId: 'test-user',
    indicators: DEFAULT_INDICATORS.map((ind, index) => ({
      ...ind,
      $id: `indicator-${index}`,
      userId: 'test-user',
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })),
    toggleAll: true,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockAlertConfigService.loadUserAlertConfig.mockResolvedValue(mockConfig)
    mockAlertConfigService.saveUserAlertConfig.mockResolvedValue()
    mockAlertConfigService.resetToDefaults.mockResolvedValue(mockConfig)
  })

  it('renders modal when open', async () => {
    render(<AlertsConfigModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Indicators')).toBeInTheDocument()
    })
  })

  it('does not render when closed', () => {
    render(<AlertsConfigModal {...defaultProps} isOpen={false} />)

    expect(screen.queryByText('Indicators')).not.toBeInTheDocument()
  })

  it('loads user configuration on open', async () => {
    render(<AlertsConfigModal {...defaultProps} />)

    await waitFor(() => {
      expect(mockAlertConfigService.loadUserAlertConfig).toHaveBeenCalledWith('test-user')
    })
  })

  it('displays loading state initially', () => {
    render(<AlertsConfigModal {...defaultProps} />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('displays all 6 percentage range indicators', async () => {
    render(<AlertsConfigModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('5-10%')).toBeInTheDocument()
      expect(screen.getByText('10-15%')).toBeInTheDocument()
      expect(screen.getByText('15-20%')).toBeInTheDocument()
      expect(screen.getByText('20-25%')).toBeInTheDocument()
      expect(screen.getByText('25-50%')).toBeInTheDocument()
      expect(screen.getByText('50%+')).toBeInTheDocument()
    })
  })

  it('displays toggle all checkbox', async () => {
    render(<AlertsConfigModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByLabelText(/Toggle All/i)).toBeInTheDocument()
    })
  })

  it('handles toggle all functionality', async () => {
    render(<AlertsConfigModal {...defaultProps} />)

    await waitFor(() => {
      const toggleAllCheckbox = screen.getByLabelText(/Toggle All/i) as HTMLInputElement
      expect(toggleAllCheckbox.checked).toBe(true)
    })

    const toggleAllCheckbox = screen.getByLabelText(/Toggle All/i)
    fireEvent.click(toggleAllCheckbox)

    // All individual checkboxes should be unchecked
    const checkboxes = screen.getAllByRole('checkbox')
    checkboxes.slice(1).forEach(checkbox => { // Skip toggle all checkbox
      expect((checkbox as HTMLInputElement).checked).toBe(false)
    })
  })

  it('handles individual indicator toggle', async () => {
    render(<AlertsConfigModal {...defaultProps} />)

    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes).toHaveLength(7) // 6 indicators + toggle all
    })

    const firstIndicatorCheckbox = screen.getAllByRole('checkbox')[1] // Skip toggle all
    fireEvent.click(firstIndicatorCheckbox)

    expect((firstIndicatorCheckbox as HTMLInputElement).checked).toBe(false)
  })

  it('handles color change for indicators', async () => {
    render(<AlertsConfigModal {...defaultProps} />)

    await waitFor(() => {
      const colorSelects = screen.getAllByRole('combobox')
      expect(colorSelects).toHaveLength(6)
    })

    const firstColorSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(firstColorSelect, { target: { value: '#EF4444' } })

    expect((firstColorSelect as HTMLSelectElement).value).toBe('#EF4444')
  })

  it('enables save button when changes are made', async () => {
    render(<AlertsConfigModal {...defaultProps} />)

    await waitFor(() => {
      const saveButton = screen.getByText('Save')
      expect(saveButton).toBeDisabled()
    })

    // Make a change
    const toggleAllCheckbox = screen.getByLabelText(/Toggle All/i)
    fireEvent.click(toggleAllCheckbox)

    const saveButton = screen.getByText('Save')
    expect(saveButton).toBeEnabled()
  })

  it('saves configuration when save button is clicked', async () => {
    render(<AlertsConfigModal {...defaultProps} />)

    await waitFor(() => {
      const toggleAllCheckbox = screen.getByLabelText(/Toggle All/i)
      fireEvent.click(toggleAllCheckbox) // Make a change
    })

    const saveButton = screen.getByText('Save')
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockAlertConfigService.saveUserAlertConfig).toHaveBeenCalled()
      expect(defaultProps.onClose).toHaveBeenCalled()
    })
  })

  it('resets to defaults when default button is clicked', async () => {
    render(<AlertsConfigModal {...defaultProps} />)

    await waitFor(() => {
      const defaultButton = screen.getByText('Default')
      expect(defaultButton).toBeInTheDocument()
    })

    const defaultButton = screen.getByText('Default')
    fireEvent.click(defaultButton)

    await waitFor(() => {
      expect(mockAlertConfigService.resetToDefaults).toHaveBeenCalledWith('test-user')
    })
  })

  it('closes modal when cancel is clicked', async () => {
    render(<AlertsConfigModal {...defaultProps} />)

    await waitFor(() => {
      const cancelButton = screen.getByText('Cancel')
      expect(cancelButton).toBeInTheDocument()
    })

    const cancelButton = screen.getByText('Cancel')
    fireEvent.click(cancelButton)

    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('closes modal when backdrop is clicked', async () => {
    render(<AlertsConfigModal {...defaultProps} />)

    await waitFor(() => {
      const backdrop = document.querySelector('[aria-hidden="true"]')
      expect(backdrop).toBeInTheDocument()
    })

    const backdrop = document.querySelector('[aria-hidden="true"]')!
    fireEvent.click(backdrop)

    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('closes modal when escape key is pressed', async () => {
    render(<AlertsConfigModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Indicators')).toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('has proper accessibility attributes', async () => {
    render(<AlertsConfigModal {...defaultProps} />)

    await waitFor(() => {
      const modal = screen.getByRole('dialog')
      expect(modal).toHaveAttribute('aria-modal', 'true')
      expect(modal).toHaveAttribute('aria-labelledby', 'alerts-modal-title')
    })
  })

  it('handles loading error gracefully', async () => {
    mockAlertConfigService.loadUserAlertConfig.mockRejectedValue(new Error('Load failed'))

    render(<AlertsConfigModal {...defaultProps} />)

    // Should still render the modal structure
    await waitFor(() => {
      expect(screen.getByText('Indicators')).toBeInTheDocument()
    })
  })

  it('handles save error gracefully', async () => {
    mockAlertConfigService.saveUserAlertConfig.mockRejectedValue(new Error('Save failed'))

    render(<AlertsConfigModal {...defaultProps} />)

    await waitFor(() => {
      const toggleAllCheckbox = screen.getByLabelText(/Toggle All/i)
      fireEvent.click(toggleAllCheckbox) // Make a change
    })

    const saveButton = screen.getByText('Save')
    fireEvent.click(saveButton)

    // Should not close modal on error
    await waitFor(() => {
      expect(mockAlertConfigService.saveUserAlertConfig).toHaveBeenCalled()
    })

    // Modal should still be open
    expect(screen.getByText('Indicators')).toBeInTheDocument()
  })
})