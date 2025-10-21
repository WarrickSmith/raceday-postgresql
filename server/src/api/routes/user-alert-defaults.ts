/* eslint-disable @typescript-eslint/naming-convention */

export interface DefaultIndicatorConfig {
  indicator_type: 'percentage_range'
  percentage_range_min: number
  percentage_range_max: number | null
  color: string
  is_default: boolean
  enabled: boolean
  display_order: number
}

export const DEFAULT_USER_ID = 'Default User'

export const DEFAULT_INDICATORS: readonly DefaultIndicatorConfig[] = [
  {
    indicator_type: 'percentage_range',
    percentage_range_min: 5,
    percentage_range_max: 10,
    color: '#E5E7EB',
    is_default: true,
    enabled: true,
    display_order: 1,
  },
  {
    indicator_type: 'percentage_range',
    percentage_range_min: 10,
    percentage_range_max: 15,
    color: '#BFDBFE',
    is_default: true,
    enabled: true,
    display_order: 2,
  },
  {
    indicator_type: 'percentage_range',
    percentage_range_min: 15,
    percentage_range_max: 20,
    color: '#FEF3C7',
    is_default: true,
    enabled: true,
    display_order: 3,
  },
  {
    indicator_type: 'percentage_range',
    percentage_range_min: 20,
    percentage_range_max: 25,
    color: '#BBF7D0',
    is_default: true,
    enabled: true,
    display_order: 4,
  },
  {
    indicator_type: 'percentage_range',
    percentage_range_min: 25,
    percentage_range_max: 50,
    color: '#FECACA',
    is_default: true,
    enabled: true,
    display_order: 5,
  },
  {
    indicator_type: 'percentage_range',
    percentage_range_min: 50,
    percentage_range_max: null,
    color: '#F3E8FF',
    is_default: true,
    enabled: true,
    display_order: 6,
  },
] as const

/* eslint-enable @typescript-eslint/naming-convention */
