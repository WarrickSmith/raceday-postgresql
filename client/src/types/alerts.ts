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
}

export interface AlertsModalState {
  indicators: IndicatorConfig[]
  toggleAll: boolean
  isLoading: boolean
  isSaving: boolean
  hasChanges: boolean
}

export interface AlertsConfig {
  userId: string
  indicators: IndicatorConfig[]
  toggleAll: boolean
}

// Default color constants matching the image specifications
export const DEFAULT_INDICATOR_COLORS = {
  '5-10': '#888888',   // Gray
  '10-15': '#3B82F6',  // Blue
  '15-20': '#FDE047',  // Yellow
  '20-25': '#10B981',  // Green
  '25-50': '#EF4444',  // Red
  '50+': '#A855F7',    // Magenta
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
  { label: 'Gray', value: DEFAULT_INDICATOR_COLORS['5-10'], isDefault: true },
  { label: 'Blue', value: DEFAULT_INDICATOR_COLORS['10-15'], isDefault: true },
  { label: 'Yellow', value: DEFAULT_INDICATOR_COLORS['15-20'], isDefault: true },
  { label: 'Green', value: DEFAULT_INDICATOR_COLORS['20-25'], isDefault: true },
  { label: 'Red', value: DEFAULT_INDICATOR_COLORS['25-50'], isDefault: true },
  { label: 'Magenta', value: DEFAULT_INDICATOR_COLORS['50+'], isDefault: true },

  // Additional color options
  { label: 'Light Gray', value: '#D1D5DB', isDefault: false },
  { label: 'Dark Gray', value: '#374151', isDefault: false },
  { label: 'Light Blue', value: '#60A5FA', isDefault: false },
  { label: 'Dark Blue', value: '#1E40AF', isDefault: false },
  { label: 'Light Yellow', value: '#FEF08A', isDefault: false },
  { label: 'Orange', value: '#F97316', isDefault: false },
  { label: 'Light Green', value: '#34D399', isDefault: false },
  { label: 'Dark Green', value: '#059669', isDefault: false },
  { label: 'Pink', value: '#EC4899', isDefault: false },
  { label: 'Purple', value: '#8B5CF6', isDefault: false },
  { label: 'Indigo', value: '#6366F1', isDefault: false },
  { label: 'Teal', value: '#14B8A6', isDefault: false },
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