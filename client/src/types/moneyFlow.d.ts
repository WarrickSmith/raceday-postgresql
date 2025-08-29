/**
 * Canonical money flow types used by the client.
 * This file provides the exported names expected by imports (e.g. '@/types/moneyFlow').
 * Keep these definitions broad and optional where appropriate to match server documents.
 */

export interface MoneyFlowDataPoint {
  // Appwrite metadata
  $id?: string
  $createdAt?: string
  $updatedAt?: string

  // Entrant references
  entrant?:
    | string
    | { entrantId?: string; $id?: string; name?: string; [k: string]: any }
  entrantId?: string

  // Timing / interval fields
  timeToStart?: number // legacy minutes (may be fractional)
  timeInterval?: number // bucketed interval (minutes or fractional)
  intervalType?: string // e.g. '5m', '30s', '1m'
  pollingTimestamp?: string
  pollingInterval?: number // numeric in minutes (e.g. 0.5 for 30s)

  // Pool totals (stored in cents)
  winPoolAmount?: number
  placePoolAmount?: number
  totalPoolAmount?: number

  // Percentages and metadata
  poolPercentage?: number // holdPercentage / betPercentage etc
  holdPercentage?: number
  betPercentage?: number

  // Incremental deltas (stored in cents)
  incrementalAmount?: number // generic incremental amount (fallback)
  incrementalWinAmount?: number
  incrementalPlaceAmount?: number

  // Optional debug/linkage fields
  rawPollingData?: string | null
  bucketDocumentId?: string | null

  // Document type marker
  type?: string

  // Misc
  [key: string]: any
}

/**
 * Timeline structure for a single entrant used by components/hooks.
 */
export interface EntrantMoneyFlowTimeline {
  entrantId: string
  dataPoints: MoneyFlowDataPoint[]
  latestPercentage: number
  trend: 'up' | 'down' | 'neutral' | string
  significantChange: boolean
  // Allow additional metadata used by UI components
  [key: string]: any
}

/**
 * Visual indicator type (used in some components)
 */
export type MoneyFlowVisualIndicator = {
  color?: string
  icon?: string
  label?: string
}
