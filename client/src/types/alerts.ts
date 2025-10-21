/**
 * Alert Indicators Configuration Types
 * Story 5.1: Create Alerts Configuration UI
 */

export interface IndicatorConfig {
  // Database fields
  indicator_id?: string
  user_id: string
  indicator_type: 'percentage_range'
  percentage_range_min: number
  percentage_range_max: number | null // null for 50%+
  color: string // Hex color code
  is_default: boolean
  enabled: boolean
  display_order: number
  last_updated?: string
  created_at?: string
  audible_alerts_enabled?: boolean
}

export interface AlertsModalState {
  indicators: IndicatorConfig[]
  toggle_all: boolean
  is_loading: boolean
  is_saving: boolean
  has_changes: boolean
  audible_alerts_enabled: boolean
}

export interface AlertsConfig {
  user_id: string
  indicators: IndicatorConfig[]
  toggle_all: boolean
  audible_alerts_enabled: boolean
}

// Default color constants tuned to soft pastel tones for calmer visuals
export const DEFAULT_INDICATOR_COLORS = {
  '5-10': '#E5E7EB',   // Soft Gray
  '10-15': '#BFDBFE',  // Powder Blue
  '15-20': '#FEF3C7',  // Pale Amber
  '20-25': '#BBF7D0',  // Mint Green
  '25-50': '#FECACA',  // Blush Red
  '50+': '#F3E8FF',    // Lavender
} as const

// Default indicator configurations
export const DEFAULT_INDICATORS: Omit<IndicatorConfig, 'indicator_id' | 'user_id' | 'last_updated' | 'created_at'>[] = [
  {
    indicator_type: 'percentage_range',
    percentage_range_min: 5,
    percentage_range_max: 10,
    color: DEFAULT_INDICATOR_COLORS['5-10'],
    is_default: true,
    enabled: true,
    display_order: 1,
  },
  {
    indicator_type: 'percentage_range',
    percentage_range_min: 10,
    percentage_range_max: 15,
    color: DEFAULT_INDICATOR_COLORS['10-15'],
    is_default: true,
    enabled: true,
    display_order: 2,
  },
  {
    indicator_type: 'percentage_range',
    percentage_range_min: 15,
    percentage_range_max: 20,
    color: DEFAULT_INDICATOR_COLORS['15-20'],
    is_default: true,
    enabled: true,
    display_order: 3,
  },
  {
    indicator_type: 'percentage_range',
    percentage_range_min: 20,
    percentage_range_max: 25,
    color: DEFAULT_INDICATOR_COLORS['20-25'],
    is_default: true,
    enabled: true,
    display_order: 4,
  },
  {
    indicator_type: 'percentage_range',
    percentage_range_min: 25,
    percentage_range_max: 50,
    color: DEFAULT_INDICATOR_COLORS['25-50'],
    is_default: true,
    enabled: true,
    display_order: 5,
  },
  {
    indicator_type: 'percentage_range',
    percentage_range_min: 50,
    percentage_range_max: null, // 50%+
    color: DEFAULT_INDICATOR_COLORS['50+'],
    is_default: true,
    enabled: true,
    display_order: 6,
  },
]

// Helper type for color picker options
export interface ColorOption {
  label: string
  value: string
  isDefault: boolean
}

// Predefined color palette for indicators
export const INDICATOR_COLOR_PALETTE: ColorOption[] = [
  // Default colors
  { label: 'Soft Gray', value: DEFAULT_INDICATOR_COLORS['5-10'], isDefault: true },
  { label: 'Powder Blue', value: DEFAULT_INDICATOR_COLORS['10-15'], isDefault: true },
  { label: 'Pale Amber', value: DEFAULT_INDICATOR_COLORS['15-20'], isDefault: true },
  { label: 'Mint', value: DEFAULT_INDICATOR_COLORS['20-25'], isDefault: true },
  { label: 'Blush', value: DEFAULT_INDICATOR_COLORS['25-50'], isDefault: true },
  { label: 'Lavender', value: DEFAULT_INDICATOR_COLORS['50+'], isDefault: true },

  // Additional pastel options
  { label: 'Cloud', value: '#F1F5F9', isDefault: false },
  { label: 'Sky', value: '#DBEAFE', isDefault: false },
  { label: 'Sunrise', value: '#FEF9C3', isDefault: false },
  { label: 'Seafoam', value: '#DCFCE7', isDefault: false },
  { label: 'Peony', value: '#FDE2E4', isDefault: false },
  { label: 'Lilac', value: '#EDE9FE', isDefault: false },
  { label: 'Aqua', value: '#CCFBF1', isDefault: false },
  { label: 'Periwinkle', value: '#E0E7FF', isDefault: false },
  { label: 'Rosewater', value: '#FFE4E6', isDefault: false },
  { label: 'Honeydew', value: '#F0FDF4', isDefault: false },
]

// Helper functions
export const formatPercentageRange = (indicator: IndicatorConfig): string => {
  if (indicator.percentage_range_max === null) {
    return `${indicator.percentage_range_min}%+`
  }
  return `${indicator.percentage_range_min}-${indicator.percentage_range_max}%`
}

export const getIndicatorLabel = (indicator: IndicatorConfig): string => {
  return formatPercentageRange(indicator)
}

// Constants for the default user
export const DEFAULT_USER_ID = 'Default User'

// Validation helpers
export const isValidHexColor = (color: string): boolean => {
  return /^#[0-9A-F]{6}$/i.test(color)
}

export const validateIndicatorConfig = (indicator: IndicatorConfig): string[] => {
  const errors: string[] = []

  if (!indicator.user_id) {
    errors.push('User ID is required')
  }

  if (indicator.percentage_range_min < 0 || indicator.percentage_range_min > 100) {
    errors.push('Percentage range minimum must be between 0 and 100')
  }

  if (indicator.percentage_range_max !== null &&
      (indicator.percentage_range_max < 0 || indicator.percentage_range_max > 100)) {
    errors.push('Percentage range maximum must be between 0 and 100')
  }

  if (indicator.percentage_range_max !== null &&
      indicator.percentage_range_max <= indicator.percentage_range_min) {
    errors.push('Percentage range maximum must be greater than minimum')
  }

  if (!isValidHexColor(indicator.color)) {
    errors.push('Color must be a valid hex color code')
  }

  if (indicator.display_order < 1 || indicator.display_order > 6) {
    errors.push('Display order must be between 1 and 6')
  }

  return errors
}
