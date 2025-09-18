/**
 * Alert Indicators Configuration Types
 * Story 5.1: Create Alerts Configuration UI
 */

export interface IndicatorConfig {
  // Database fields
  $id?: string
  userId: string
  indicatorType: 'percentage_range'
  percentageRangeMin: number
  percentageRangeMax: number | null // null for 50%+
  color: string // Hex color code
  isDefault: boolean
  enabled: boolean
  displayOrder: number
  lastUpdated?: string
  createdAt?: string
  audibleAlertsEnabled?: boolean
}

export interface AlertsModalState {
  indicators: IndicatorConfig[]
  toggleAll: boolean
  isLoading: boolean
  isSaving: boolean
  hasChanges: boolean
  audibleAlertsEnabled: boolean
}

export interface AlertsConfig {
  userId: string
  indicators: IndicatorConfig[]
  toggleAll: boolean
  audibleAlertsEnabled: boolean
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
export const DEFAULT_INDICATORS: Omit<IndicatorConfig, '$id' | 'userId' | 'lastUpdated' | 'createdAt'>[] = [
  {
    indicatorType: 'percentage_range',
    percentageRangeMin: 5,
    percentageRangeMax: 10,
    color: DEFAULT_INDICATOR_COLORS['5-10'],
    isDefault: true,
    enabled: true,
    displayOrder: 1,
  },
  {
    indicatorType: 'percentage_range',
    percentageRangeMin: 10,
    percentageRangeMax: 15,
    color: DEFAULT_INDICATOR_COLORS['10-15'],
    isDefault: true,
    enabled: true,
    displayOrder: 2,
  },
  {
    indicatorType: 'percentage_range',
    percentageRangeMin: 15,
    percentageRangeMax: 20,
    color: DEFAULT_INDICATOR_COLORS['15-20'],
    isDefault: true,
    enabled: true,
    displayOrder: 3,
  },
  {
    indicatorType: 'percentage_range',
    percentageRangeMin: 20,
    percentageRangeMax: 25,
    color: DEFAULT_INDICATOR_COLORS['20-25'],
    isDefault: true,
    enabled: true,
    displayOrder: 4,
  },
  {
    indicatorType: 'percentage_range',
    percentageRangeMin: 25,
    percentageRangeMax: 50,
    color: DEFAULT_INDICATOR_COLORS['25-50'],
    isDefault: true,
    enabled: true,
    displayOrder: 5,
  },
  {
    indicatorType: 'percentage_range',
    percentageRangeMin: 50,
    percentageRangeMax: null, // 50%+
    color: DEFAULT_INDICATOR_COLORS['50+'],
    isDefault: true,
    enabled: true,
    displayOrder: 6,
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
  if (indicator.percentageRangeMax === null) {
    return `${indicator.percentageRangeMin}%+`
  }
  return `${indicator.percentageRangeMin}-${indicator.percentageRangeMax}%`
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

  if (!indicator.userId) {
    errors.push('User ID is required')
  }

  if (indicator.percentageRangeMin < 0 || indicator.percentageRangeMin > 100) {
    errors.push('Percentage range minimum must be between 0 and 100')
  }

  if (indicator.percentageRangeMax !== null &&
      (indicator.percentageRangeMax < 0 || indicator.percentageRangeMax > 100)) {
    errors.push('Percentage range maximum must be between 0 and 100')
  }

  if (indicator.percentageRangeMax !== null &&
      indicator.percentageRangeMax <= indicator.percentageRangeMin) {
    errors.push('Percentage range maximum must be greater than minimum')
  }

  if (!isValidHexColor(indicator.color)) {
    errors.push('Color must be a valid hex color code')
  }

  if (indicator.displayOrder < 1 || indicator.displayOrder > 6) {
    errors.push('Display order must be between 1 and 6')
  }

  return errors
}
