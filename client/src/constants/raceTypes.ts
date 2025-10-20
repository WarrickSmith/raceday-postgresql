/**
 * Race type constants and utilities for consistent handling across the application
 */

// Race type codes used in the database 'category' field
export const RACE_TYPE_CODES = {
  HARNESS: 'H',
  THOROUGHBRED: 'T',
  GREYHOUND: 'G',
} as const

// Full race type names used in the database 'race_type' field
export const RACE_TYPE_NAMES = {
  HARNESS: 'Harness Horse Racing',
  THOROUGHBRED: 'Thoroughbred Horse Racing',
  GREYHOUND: 'Greyhound Racing',
} as const

// Display names for the UI
export const RACE_TYPE_DISPLAY = {
  [RACE_TYPE_CODES.HARNESS]: 'HARNESS',
  [RACE_TYPE_CODES.THOROUGHBRED]: 'THROUGHBRED',
  [RACE_TYPE_CODES.GREYHOUND]: 'GREYHOUND',
} as const

// Valid race type codes for filtering
export const VALID_RACE_TYPE_CODES = Object.values(RACE_TYPE_CODES)

// Currently supported race type codes for the application
export const SUPPORTED_RACE_TYPE_CODES = [
  RACE_TYPE_CODES.THOROUGHBRED,
  RACE_TYPE_CODES.HARNESS,
] as const

// Valid race type names for legacy support
export const VALID_RACE_TYPE_NAMES = Object.values(RACE_TYPE_NAMES)

/**
 * Get display name from race type code
 */
export function getRaceTypeDisplay(code: string): string {
  const upperCode = code.toUpperCase()
  return RACE_TYPE_DISPLAY[upperCode as keyof typeof RACE_TYPE_DISPLAY] || code
}

/**
 * Get race type code from full race type name
 */
export function getRaceTypeCode(race_typeName: string): string | null {
  switch (race_typeName) {
    case RACE_TYPE_NAMES.HARNESS:
      return RACE_TYPE_CODES.HARNESS
    case RACE_TYPE_NAMES.THOROUGHBRED:
      return RACE_TYPE_CODES.THOROUGHBRED
    case RACE_TYPE_NAMES.GREYHOUND:
      return RACE_TYPE_CODES.GREYHOUND
    default:
      return null
  }
}

/**
 * Check if a race type code is valid
 */
export function isValidRaceTypeCode(code: string): boolean {
  return VALID_RACE_TYPE_CODES.includes(
    code.toUpperCase() as (typeof VALID_RACE_TYPE_CODES)[number]
  )
}
