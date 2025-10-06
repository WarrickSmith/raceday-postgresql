/**
 * Timezone utilities for New Zealand race scheduling
 *
 * Provides consistent, DST-aware timezone handling for racing operations.
 * All racing data is based on New Zealand (Pacific/Auckland) timezone.
 *
 * IMPORTANT: Partition management and racing day calculations must use
 * NZ timezone, not UTC, since all races operate on NZ time.
 */

/**
 * Get current New Zealand time as a Date object
 * Properly handles DST transitions (NZDT/NZST)
 * @returns Current time in NZ timezone
 */
export const getCurrentNzTime = (): Date => {
  const now = new Date()

  // Use Intl API for proper timezone conversion with DST awareness
  const nzTimeString = now.toLocaleString('en-US', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  // Parse the formatted string back to a Date object
  // Format: "MM/DD/YYYY, HH:mm:ss"
  const [datePart, timePart] = nzTimeString.split(', ')

  if (datePart === undefined || timePart === undefined) {
    throw new Error('Failed to split NZ time string')
  }

  const [month, day, year] = datePart.split('/')
  const [hour, minute, second] = timePart.split(':')

  if (
    month === undefined ||
    day === undefined ||
    year === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    throw new Error('Failed to parse NZ time string')
  }

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  )
}

/**
 * Get current New Zealand date as a Date object (time set to midnight NZ time)
 * @returns Date object representing current NZ date at 00:00:00
 */
export const getCurrentNzDate = (): Date => {
  const nzTime = getCurrentNzTime()
  // Return date at midnight NZ time
  return new Date(nzTime.getFullYear(), nzTime.getMonth(), nzTime.getDate())
}

/**
 * Get current New Zealand date string in YYYY-MM-DD format
 * @returns NZ date in ISO format (YYYY-MM-DD)
 */
export const getNzDateString = (date?: Date): string => {
  const nzDate = date ?? getCurrentNzDate()
  // en-CA locale produces YYYY-MM-DD format
  return nzDate.toLocaleDateString('en-CA')
}

/**
 * Get tomorrow's date in NZ timezone as a Date object
 * @returns Date object representing tomorrow's NZ date at 00:00:00
 */
export const getTomorrowNzDate = (): Date => {
  const nzToday = getCurrentNzDate()
  const tomorrow = new Date(nzToday)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow
}

/**
 * Convert a Date object to NZ timezone date string (YYYY-MM-DD)
 * Useful for database queries and partition naming
 * @param date - Date to convert
 * @returns Date string in YYYY-MM-DD format (NZ timezone)
 */
export const toNzDateString = (date: Date): string => {
  const nzTimeString = date.toLocaleString('en-US', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
  })

  const [datePart] = nzTimeString.split(',')

  if (datePart === undefined) {
    throw new Error('Failed to split NZ time string')
  }

  const [month, day, year] = datePart.split('/')

  if (month === undefined || day === undefined || year === undefined) {
    throw new Error('Failed to parse NZ date string')
  }

  return `${year}-${month}-${day}`
}
