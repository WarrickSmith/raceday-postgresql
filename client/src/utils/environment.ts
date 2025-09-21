/**
 * Environment utilities for development/production feature toggling
 */

/**
 * Check if connection monitoring should be enabled
 * Returns true only if explicitly enabled via environment variable
 */
export function isConnectionMonitorEnabled(): boolean {
  // Only enable if explicitly set to 'true' in environment
  return process.env.NEXT_PUBLIC_ENABLE_CONNECTION_MONITOR === 'true';
}

/**
 * Check if we're in development mode
 * Considers both NODE_ENV and explicit development features
 */
export function isDevelopmentMode(): boolean {
  return process.env.NODE_ENV === 'development' || isConnectionMonitorEnabled();
}

/**
 * Check if development features should be shown
 * This is the primary function to use for conditional development UI
 */
export function showDevelopmentFeatures(): boolean {
  return isConnectionMonitorEnabled();
}