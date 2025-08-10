/**
 * Utility functions for formatting race data
 */

/**
 * Format race distance in a human-readable format
 * @param distance - Distance in metres
 * @returns Formatted distance string (e.g., "2.2km" or "800m")
 */
export function formatDistance(distance: number | undefined): string | null {
  if (!distance) return null;
  
  if (distance >= 1000) {
    const km = (distance / 1000).toFixed(1);
    return `${km}km`;
  } else {
    return `${distance}m`;
  }
}

/**
 * Format race start time in a consistent format
 * @param dateTimeString - ISO datetime string
 * @returns Formatted time string or 'TBA' if invalid
 */
export function formatRaceTime(dateTimeString: string): string {
  try {
    const date = new Date(dateTimeString);
    if (isNaN(date.getTime())) {
      return 'TBA';
    }
    return date.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return 'TBA';
  }
}

/**
 * Format meeting category for display
 * @param category - Category code (T, H, etc.)
 * @returns Human-readable category name
 */
export function formatCategory(category: string): string {
  switch (category?.toUpperCase()) {
    case 'T':
      return 'Thoroughbred';
    case 'H':
      return 'Harness';
    default:
      return category || 'Unknown';
  }
}