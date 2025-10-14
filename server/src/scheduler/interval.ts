const FIFTEEN_MINUTES_IN_SECONDS = 15 * 60
const FIVE_MINUTES_IN_SECONDS = 5 * 60

/**
 * Calculates the polling interval (in milliseconds) for a race based on its
 * time-to-start. Negative values indicate the race has already started, in
 * which case we continue polling at the fastest cadence until a terminal
 * status clears the schedule.
 *
 * @param timeToStartSeconds Seconds until the race starts.
 * @returns Polling interval in milliseconds.
 */
export function calculatePollingInterval(timeToStartSeconds: number): number {
  if (!Number.isFinite(timeToStartSeconds)) {
    throw new TypeError(
      `timeToStartSeconds must be a finite number, received: ${String(timeToStartSeconds)}`,
    )
  }

  if (timeToStartSeconds <= 0) {
    return 15_000
  }

  if (timeToStartSeconds <= FIVE_MINUTES_IN_SECONDS) {
    return 15_000
  }

  if (timeToStartSeconds <= FIFTEEN_MINUTES_IN_SECONDS) {
    return 30_000
  }

  return 60_000
}
