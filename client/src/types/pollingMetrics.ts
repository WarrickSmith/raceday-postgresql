/**
 * Polling Metrics Type Definitions
 *
 * Type-safe definitions for the Polling Monitor feature, providing
 * observability into the client-side polling system.
 */

/**
 * Polling endpoint identifiers
 */
export const PollingEndpoint = {
  RACE: 'race',
  ENTRANTS: 'entrants',
  POOLS: 'pools',
  MONEY_FLOW: 'money-flow',
} as const

export type PollingEndpointKey = typeof PollingEndpoint[keyof typeof PollingEndpoint]

/**
 * Endpoint status indicator
 */
export type EndpointStatus = 'OK' | 'ERROR' | 'WARNING'

/**
 * Cadence tracking status
 */
export type CadenceStatus = 'on-track' | 'behind' | 'ahead'

/**
 * Alert severity levels
 */
export type AlertSeverity = 'error' | 'warning' | 'info'

/**
 * Per-endpoint performance metrics
 */
export interface EndpointMetrics {
  /** Total number of requests made to this endpoint */
  requests: number
  /** Number of failed requests */
  errors: number
  /** Average latency in milliseconds */
  latency: number
  /** Timestamp of last successful request */
  lastSuccess: Date | null
  /** Current health status */
  status: EndpointStatus
  /** Count of fallback responses used */
  fallbacks: number
  /** Count of successful recoveries after errors */
  recoveries: number
  /** Last error message (if any) */
  lastError: string | null
}

/**
 * Cadence compliance tracking
 */
export interface CadenceMetrics {
  /** Target polling interval in milliseconds */
  targetIntervalMs: number
  /** Actual measured interval in milliseconds */
  actualIntervalMs: number | null
  /** Compliance status */
  status: CadenceStatus
  /** Next scheduled poll timestamp */
  nextPollTimestamp: number | null
  /** Duration of current polling session in seconds */
  durationSeconds: number
}

/**
 * Active alert information
 */
export interface PollingAlert {
  /** Unique alert identifier */
  id: string
  /** Alert severity */
  severity: AlertSeverity
  /** Alert message */
  message: string
  /** Affected endpoint (if applicable) */
  endpoint?: PollingEndpointKey
  /** Alert timestamp */
  timestamp: Date
  /** Additional context data */
  metadata?: Record<string, unknown>
}

/**
 * Recent activity event
 */
export interface ActivityEvent {
  /** Event timestamp */
  timestamp: Date
  /** Event type */
  type: 'request' | 'success' | 'error' | 'warning' | 'info'
  /** Event message */
  message: string
  /** Associated endpoint */
  endpoint?: PollingEndpointKey
  /** Event duration in milliseconds (for requests) */
  durationMs?: number
}

/**
 * Aggregated polling metrics
 */
export interface PollingMetrics {
  /** Total requests across all endpoints */
  requests: number
  /** Success rate as percentage (0-100) */
  successRate: number
  /** Error rate as percentage (0-100) */
  errorRate: number
  /** Average latency across all endpoints in milliseconds */
  avgLatency: number
  /** Per-endpoint metrics */
  endpoints: Record<PollingEndpointKey, EndpointMetrics>
  /** Cadence compliance metrics */
  cadence: CadenceMetrics
  /** Active alerts */
  alerts: PollingAlert[]
  /** Recent activity log (limited to last N events) */
  recentActivity: ActivityEvent[]
  /** Uptime percentage since monitor enabled */
  uptime: number
}

/**
 * Polling event for metric tracking
 */
export interface PollingEvent {
  /** Event timestamp */
  timestamp: Date
  /** Target endpoint */
  endpoint: PollingEndpointKey
  /** Event type */
  type: 'start' | 'success' | 'error'
  /** Request duration in milliseconds (for completed requests) */
  durationMs?: number
  /** Error message (for failed requests) */
  error?: string
  /** Whether a fallback was used */
  usedFallback?: boolean
}

/**
 * Configuration for polling metrics hook
 */
export interface PollingMetricsConfig {
  /** Maximum number of activity events to retain */
  maxActivityEvents?: number
  /** Threshold for high error rate warning (percentage) */
  errorRateThreshold?: number
  /** Threshold for high latency warning (milliseconds) */
  latencyThreshold?: number
  /** Cadence deviation tolerance (percentage) */
  cadenceTolerancePercent?: number
}

/**
 * Default configuration values
 */
export const DEFAULT_POLLING_METRICS_CONFIG: Required<PollingMetricsConfig> = {
  maxActivityEvents: 50,
  errorRateThreshold: 25, // 25%
  latencyThreshold: 5000, // 5 seconds
  cadenceTolerancePercent: 15, // 15% deviation allowed
}