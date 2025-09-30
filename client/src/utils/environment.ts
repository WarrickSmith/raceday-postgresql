/**
 * Environment utilities for development/production feature toggling
 */

/**
 * Check if we're in development mode
 */
export function isDevelopmentMode(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Determine if optional development-only features should be displayed
 */
export function showDevelopmentFeatures(): boolean {
  return isDevelopmentMode();
}