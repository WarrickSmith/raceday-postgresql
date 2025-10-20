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
    | { entrant_id?: string; $id?: string; name?: string; [k: string]: unknown }
  entrant_id?: string

  // Timing / interval fields
  time_to_start?: number // legacy minutes (may be fractional)
  time_interval?: number // bucketed interval (minutes or fractional)
  interval_type?: string // e.g. '5m', '30s', '1m'
  polling_timestamp?: string
  polling_interval?: number // numeric in minutes (e.g. 0.5 for 30s)

  // Pool totals (stored in cents)
  winPoolAmount?: number
  placePoolAmount?: number
  total_pool_amount?: number

  // Percentages and metadata
  pool_percentage?: number // hold_percentage / betPercentage etc
  hold_percentage?: number
  betPercentage?: number

  // Incremental deltas (stored in cents)
  incremental_amount?: number // generic incremental amount (fallback)
  incremental_win_amount?: number
  incremental_place_amount?: number

  // Optional debug/linkage fields
  rawPollingData?: string | null
  bucketDocumentId?: string | null

  // Document type marker
  type?: string

  // Misc
  [key: string]: unknown
}

/**
 * Timeline structure for a single entrant used by components/hooks.
 */
export interface EntrantMoneyFlowTimeline {
  entrant_id: string
  dataPoints: MoneyFlowDataPoint[]
  latest_percentage: number
  trend: 'up' | 'down' | 'neutral' | string
  significant_change: boolean
  // Allow additional metadata used by UI components
  [key: string]: unknown
}

/**
 * Visual indicator type (used in some components)
 */
export type MoneyFlowVisualIndicator = {
  color?: string
  icon?: string
  label?: string
}
