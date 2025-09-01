import type { SUPPORTED_RACE_TYPE_CODES } from '@/constants/raceTypes'
import type { MoneyFlowDataPoint, EntrantMoneyFlowTimeline } from './moneyFlow'
import type { RacePoolData, PoolType } from './racePools'
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

// OddsHistory document interface for sparkline data
export interface OddsHistoryData {
  $id: string
  $createdAt: string
  $updatedAt: string
  entrant: string
  winOdds: number
  timestamp: string
}

// Odds history subscription callback interface for type safety
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
  holdPercentage?: number // Current money flow percentage
  previousHoldPercentage?: number // Previous money flow for trend calculation
  moneyFlowTrend?: 'up' | 'down' | 'neutral' // Trend direction for display
  moneyFlowHistory?: string[] // MoneyFlowHistory collection relationship
  oddsHistory?: OddsHistoryData[] // Array of odds history data for sparkline
  oddsHistoryRelationship?: string[] // OddsHistory collection relationship
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
