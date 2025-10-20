export interface MoneyFlowDataPoint {
  // Common identifiers
  $id?: string
  entrant?: string | { entrant_id?: string; $id?: string }
  race_id?: string

  // Timing fields
  time_to_start?: number // legacy field (minutes or fractional minutes)
  time_interval?: number // bucketed timeline interval (minutes or fractional)

  // Pool amounts (stored in cents)
  winPoolAmount?: number
  placePoolAmount?: number

  // Incremental deltas (stored in cents). Some documents use generic incremental_amount,
  // others pre-calculate incremental_win_amount / incremental_place_amount.
  incremental_amount?: number
  incremental_win_amount?: number
  incremental_place_amount?: number

  // Optional debug / linkage fields
  rawPollingData?: string | null
  bucketDocumentId?: string | null

  // Document type marker
  type?: string
}
