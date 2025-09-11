import type { SUPPORTED_RACE_TYPE_CODES } from '@/constants/raceTypes'
import type { MoneyFlowDataPoint, EntrantMoneyFlowTimeline } from './moneyFlow'
import type { RacePoolData, PoolType, RaceResult, PoolDividend } from './racePools'
import type { JockeySilk } from './jockeySilks'

type SupportedRaceTypeCode = (typeof SUPPORTED_RACE_TYPE_CODES)[number]

export interface Meeting {
  $id: string
  $createdAt: string
  $updatedAt: string
  meetingId: string
  meetingName: string
  country: string
  raceType: string
  category: SupportedRaceTypeCode // Race type code: H or T (currently supported)
  date: string
  firstRaceTime?: string
  weather?: string // Weather conditions (e.g. "Fine", "Overcast")
  trackCondition?: string // Track condition (e.g. "Good 3", "Heavy 8")
}

export interface Race {
  $id: string
  $createdAt: string
  $updatedAt: string
  raceId: string
  raceNumber: number
  name: string // Race name field from database
  raceName?: string // Optional legacy field
  startTime: string
  actualStart?: string // Actual race start time from NZTAB API (actual_start_string)
  meeting: string
  status: string
  distance?: number // Race distance in metres
  trackCondition?: string // Track condition (e.g. "Good 3", "Heavy 8")
  weather?: string // Weather conditions (e.g. "Fine", "Overcast")
  runnerCount?: number // Number of runners in the race
  type?: string // Race type code (T, H, G) for category display
  // Results data fields
  resultsAvailable?: boolean // Whether results data is available
  resultsData?: RaceResult[] // Parsed race results array
  dividendsData?: PoolDividend[] // Parsed dividends array
  fixedOddsData?: Record<string, {fixed_win: number | null, fixed_place: number | null, runner_name: string | null, entrant_id: string | null}> // Fixed odds per runner at result time
  resultStatus?: 'interim' | 'final' | 'protest' // Status of results
  photoFinish?: boolean // Photo finish flag
  stewardsInquiry?: boolean // Stewards inquiry flag
  protestLodged?: boolean // Protest lodged flag
  resultTime?: string // Time when results were declared
}

// Race results collection interface - separate from main race data
export interface RaceResults {
  $id: string
  $createdAt: string
  $updatedAt: string
  race: string // Relationship to races collection
  resultsAvailable?: boolean // Whether results data is available
  resultsData?: string // JSON-stringified race results array
  dividendsData?: string // JSON-stringified dividends array
  resultStatus?: 'interim' | 'final' | 'protest' // Status of results
  photoFinish?: boolean // Photo finish flag
  stewardsInquiry?: boolean // Stewards inquiry flag
  protestLodged?: boolean // Protest lodged flag
  resultTime?: string // Time when results were declared
}

export interface MeetingWithRaces extends Meeting {
  races: Race[]
}

export interface MeetingWithExpandState extends Meeting {
  isExpanded?: boolean
  races?: Race[]
}

// Appwrite real-time subscription response type for entrants
export interface EntrantSubscriptionResponse {
  payload?: Partial<Entrant> & { $id: string }
  events?: string[]
}

// Money flow subscription callback interface for type safety
export interface MoneyFlowSubscriptionResponse {
  payload?: {
    entrant?: string
    holdPercentage?: number
  }
  events?: string[]
}

// MoneyFlowHistory document interface
export interface MoneyFlowHistory {
  $id: string
  $createdAt: string
  $updatedAt: string
  entrant: string
  holdPercentage: number
}

// DEPRECATED: OddsHistory document interface for sparkline data
// Odds data now comes from MoneyFlowHistory collection via Timeline hooks
export interface OddsHistoryData {
  $id: string
  $createdAt: string
  $updatedAt: string
  entrant: string
  winOdds: number
  timestamp: string
}

// DEPRECATED: Odds history subscription callback interface
// Real-time odds updates now come via MoneyFlowHistory subscriptions
export interface OddsHistorySubscriptionResponse {
  payload?: Partial<OddsHistoryData> & { $id: string }
  events?: string[]
}

// Navigation event handler types
export type NavigationHandler = (direction: 'previous' | 'next') => void
export type NavigationErrorHandler = (error: Error) => void

// Race navigation data interfaces
export interface RaceNavigationData {
  previousRace?: {
    raceId: string
    name: string
    startTime: string
    meetingName: string
  } | null
  nextRace?: {
    raceId: string
    name: string
    startTime: string
    meetingName: string
  } | null
  nextScheduledRace?: {
    raceId: string
    name: string
    startTime: string
    meetingName: string
  } | null
}

// Navigation button state interfaces
export interface NavigationButtonState {
  isLoading: boolean
  disabled: boolean
  disabledReason?: string
}

export interface Entrant {
  $id: string
  $createdAt: string
  $updatedAt: string
  entrantId: string
  name: string // Runner name
  runnerNumber: number // Saddlecloth number
  jockey?: string
  trainerName?: string
  weight?: number
  silkUrl?: string // Legacy field - may not be populated
  silkColours?: string // Silk color description from NZ TAB
  silkUrl64?: string // 64x64 silk image URL from NZ TAB
  silkUrl128?: string // 128x128 silk image URL from NZ TAB
  isScratched: boolean
  race: string // Race ID this entrant belongs to
  winOdds?: number // Current win odds
  placeOdds?: number // Current place odds
  // CONSOLIDATED ODDS DATA (NEW in Story 4.9)
  poolWinOdds?: number // Pool Win odds (tote)
  poolPlaceOdds?: number // Pool Place odds (tote)
  holdPercentage?: number // Current money flow percentage
  previousHoldPercentage?: number // Previous money flow for trend calculation
  moneyFlowTrend?: 'up' | 'down' | 'neutral' // Trend direction for display
  moneyFlowHistory?: string[] // MoneyFlowHistory collection relationship
  oddsHistory?: OddsHistoryData[] // DEPRECATED: Array of odds history data for sparkline (use MoneyFlowTimeline instead)
  oddsHistoryRelationship?: string[] // DEPRECATED: OddsHistory collection relationship (use MoneyFlowHistory instead)
  // Enhanced v4.7 data
  moneyFlowTimeline?: EntrantMoneyFlowTimeline // Timeline visualization data
  silk?: JockeySilk // Jockey silk visual data
  poolMoney?: {
    win: number
    place: number
    total: number
    percentage: number
  }
}
