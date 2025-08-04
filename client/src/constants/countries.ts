/**
 * Country constants and utilities for consistent handling across the application
 */

import { AU, NZ } from 'country-flag-icons/react/3x2';

// Country codes supported in the application
export const COUNTRY_CODES = {
  AUSTRALIA: 'AUS',
  NEW_ZEALAND: 'NZ',
} as const;

// Country code normalization map
export const COUNTRY_CODE_ALIASES = {
  'AUS': COUNTRY_CODES.AUSTRALIA,
  'AU': COUNTRY_CODES.AUSTRALIA,
  'AUSTRALIA': COUNTRY_CODES.AUSTRALIA,
  'NZ': COUNTRY_CODES.NEW_ZEALAND,
  'NZL': COUNTRY_CODES.NEW_ZEALAND,
  'NEW ZEALAND': COUNTRY_CODES.NEW_ZEALAND,
} as const;

// Country display information
export const COUNTRY_INFO = {
  [COUNTRY_CODES.AUSTRALIA]: {
    name: 'Australia',
    flag: AU,
    textColor: 'text-blue-600',
  },
  [COUNTRY_CODES.NEW_ZEALAND]: {
    name: 'New Zealand',
    flag: NZ,
    textColor: 'text-green-600',
  },
} as const;

/**
 * Normalize country code to standard format
 */
export function normalizeCountryCode(country: string): string {
  const upperCountry = country?.toUpperCase();
  return COUNTRY_CODE_ALIASES[upperCountry as keyof typeof COUNTRY_CODE_ALIASES] || country;
}

/**
 * Get country display information
 */
export function getCountryInfo(country: string) {
  const normalizedCode = normalizeCountryCode(country);
  return COUNTRY_INFO[normalizedCode as keyof typeof COUNTRY_INFO];
}

/**
 * Check if country is supported
 */
export function isSupportedCountry(country: string): boolean {
  const normalizedCode = normalizeCountryCode(country);
  return normalizedCode === COUNTRY_CODES.AUSTRALIA || normalizedCode === COUNTRY_CODES.NEW_ZEALAND;
}