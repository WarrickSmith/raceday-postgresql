/**
 * Client-side timezone utilities for New Zealand race scheduling
 *
 * Provides consistent, DST-aware timezone handling that mirrors server-side logic.
 * Fixes issues with hardcoded UTC offsets and naive time calculations in client polling.
 *
 * CRITICAL: This file should maintain identical logic to server-side timezone-utils.js
 * for consistency between client and server polling behavior.
 */

/**
 * Get current New Zealand time as a Date object
 * Properly handles DST transitions without hardcoded offsets
 * @returns {Date} Current time in NZ timezone
 */
export function getCurrentNzTime(): Date {
  const now = new Date()

  // Use the browser's Intl API for proper timezone conversion
  const nzTimeString = now.toLocaleString('en-US', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })

  // Parse the formatted string back to a Date object
  // Format: "MM/DD/YYYY, HH:mm:ss"
  const [datePart, timePart] = nzTimeString.split(', ')
  const [month, day, year] = datePart.split('/')
  const [hour, minute, second] = timePart.split(':')

  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second))
}

/**
 * Get current New Zealand date string in YYYY-MM-DD format
 * @returns {string} NZ date in ISO format
 */
export function getCurrentNzDateString(): string {
  return getCurrentNzTime().toLocaleDateString('en-CA') // en-CA gives YYYY-MM-DD format
}

/**
 * Calculate time difference in minutes between a race start time and current NZ time
 * Handles timezone conversion properly for DST - mirrors server logic
 * @param {string} raceStartTimeIso - Race start time in ISO format
 * @returns {number} Minutes until race start (negative if race has started)
 */
export function getMinutesUntilRaceStart(raceStartTimeIso: string): number | null {
  if (!raceStartTimeIso) return null

  const now = new Date()
  const raceStart = new Date(raceStartTimeIso)

  // Calculate difference in milliseconds, then convert to minutes
  const diffMs = raceStart.getTime() - now.getTime()
  return Math.round(diffMs / (1000 * 60))
}

/**
 * Check if current time is within NZ racing hours (9 AM - 1 AM next day)
 * @returns {boolean} True if within racing hours
 */
export function isWithinNzRacingHours(): boolean {
  const nzTime = getCurrentNzTime()
  const nzHour = nzTime.getHours()

  // Racing hours: 9:00 AM - 1:00 AM next day (NZ time)
  return nzHour >= 9 || nzHour < 1
}

/**
 * Check if should terminate function execution based on NZ time (1:00 AM termination)
 * @returns {boolean} True if should terminate
 */
export function shouldTerminateForNzTime(): boolean {
  const nzTime = getCurrentNzTime()
  const nzHour = nzTime.getHours()

  // Terminate during 1:00 AM - 9:00 AM NZ time
  return nzHour >= 1 && nzHour < 9
}

/**
 * Get NZ timezone display string for logging
 * @returns {string} Formatted NZ time with timezone
 */
export function getNzTimeDisplay(): string {
  const now = new Date()
  return now.toLocaleString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  })
}

/**
 * Convert race start time to NZ timezone for display
 * @param {string} raceStartTimeIso - Race start time in ISO format
 * @returns {string} Race start time in NZ timezone
 */
export function convertToNzTime(raceStartTimeIso: string): string | null {
  if (!raceStartTimeIso) return null

  const raceTime = new Date(raceStartTimeIso)
  return raceTime.toLocaleString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
}

/**
 * Create a time window for race detection that accounts for DST
 * @param {number} hoursBack - Hours before current time
 * @param {number} hoursForward - Hours after current time
 * @returns {Object} Object with startTime and endTime in UTC ISO format
 */
export function createNzAwareTimeWindow(hoursBack: number = 1, hoursForward: number = 1): {
  startTime: string
  endTime: string
  nzStartTime: string
  nzEndTime: string
  currentNzTime: string
} {
  const now = new Date()

  // Calculate the time window in UTC
  const startTime = new Date(now.getTime() - (hoursBack * 60 * 60 * 1000))
  const endTime = new Date(now.getTime() + (hoursForward * 60 * 60 * 1000))

  return {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    // Also provide NZ times for logging
    nzStartTime: startTime.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
    nzEndTime: endTime.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }),
    currentNzTime: now.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })
  }
}

/**
 * Extended race detection window for DST edge cases
 * Creates a wider time window during DST transition periods
 * @param {number} baseHours - Base hours for window
 * @returns {Object} Extended time window
 */
export function createExtendedRaceWindow(baseHours: number = 1): {
  startTime: string
  endTime: string
  nzStartTime: string
  nzEndTime: string
  currentNzTime: string
} {
  // Check if we're near a DST transition (typically late March or late September)
  const now = new Date()
  const month = now.getMonth() // 0-11
  const day = now.getDate()

  // DST transitions typically happen late March (month 2) and late September (month 8)
  const isDstTransitionPeriod = (month === 2 && day > 20) || (month === 8 && day > 20)

  // Extend window during DST transition periods
  const hoursBack = isDstTransitionPeriod ? baseHours + 0.5 : baseHours
  const hoursForward = isDstTransitionPeriod ? baseHours + 0.5 : baseHours

  return createNzAwareTimeWindow(hoursBack, hoursForward)
}

/**
 * Client-side polling interval calculation with DST awareness
 * This mirrors the server-side enhanced-race-poller logic for consistency
 * @param {string} raceStartTimeIso - Race start time in ISO format
 * @param {string} raceStatus - Current race status
 * @returns {number} Minutes until race start (accurate for DST)
 */
export function calculateDstAwareMinutesToStart(raceStartTimeIso: string, raceStatus?: string): number | null {
  if (!raceStartTimeIso) return null

  // Handle completed races
  const completedStatuses = ['final', 'finalized', 'finalised', 'abandoned', 'cancelled', 'canceled']
  if (raceStatus && completedStatuses.includes(raceStatus.toLowerCase())) {
    return null
  }

  try {
    // Use DST-aware calculation instead of naive Date arithmetic
    return getMinutesUntilRaceStart(raceStartTimeIso)
  } catch (error) {
    console.warn('Failed to calculate DST-aware minutes to start:', error)
    return null
  }
}