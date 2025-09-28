'use client'

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on'])
const FALSY_VALUES = new Set(['0', 'false', 'no', 'off'])

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue
  }

  const normalized = value.trim().toLowerCase()
  if (TRUTHY_VALUES.has(normalized)) {
    return true
  }

  if (FALSY_VALUES.has(normalized)) {
    return false
  }

  return defaultValue
}

function parsePositiveInteger(value: string | undefined, defaultValue: number): number {
  if (!value) {
    return defaultValue
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue
  }

  return parsed
}

const doubleFrequencyValue =
  process.env.NEXT_PUBLIC_DOUBLE_POLLING_FREQUENCY ??
  process.env.DOUBLE_POLLING_FREQUENCY

export const pollingConfig = {
  enabled: parseBoolean(process.env.NEXT_PUBLIC_POLLING_ENABLED, true),
  debugMode: parseBoolean(process.env.NEXT_PUBLIC_POLLING_DEBUG_MODE, false),
  doubleFrequency: parseBoolean(doubleFrequencyValue, false),
  timeoutMs: parsePositiveInteger(process.env.NEXT_PUBLIC_POLLING_TIMEOUT, 10_000),
} as const

export type PollingConfigFlags = typeof pollingConfig
