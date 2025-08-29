export interface MoneyFlowDataPoint {
  // Common identifiers
  $id?: string
  entrant?: string | { entrantId?: string; $id?: string }
  raceId?: string

  // Timing fields
  timeToStart?: number // legacy field (minutes or fractional minutes)
  timeInterval?: number // bucketed timeline interval (minutes or fractional)

  // Pool amounts (stored in cents)
  winPoolAmount?: number
  placePoolAmount?: number

  // Incremental deltas (stored in cents). Some documents use generic incrementalAmount,
  // others pre-calculate incrementalWinAmount / incrementalPlaceAmount.
  incrementalAmount?: number
  incrementalWinAmount?: number
  incrementalPlaceAmount?: number

  // Optional debug / linkage fields
  rawPollingData?: string | null
  bucketDocumentId?: string | null

  // Document type marker
  type?: string
}
