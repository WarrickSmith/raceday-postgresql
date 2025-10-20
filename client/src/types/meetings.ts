import type { SUPPORTED_RACE_TYPE_CODES } from '@/constants/race_types'
import type { EntrantMoneyFlowTimeline } from './moneyFlow'
import type { RaceResult, PoolDividend } from './racePools'
import type { JockeySilk } from './jockeySilks'

type SupportedRaceTypeCode = (typeof SUPPORTED_RACE_TYPE_CODES)[number]

export interface Meeting {
  meeting_id: string
  meeting_name: string
  country: string
  race_type: string
  category?: SupportedRaceTypeCode
  date: string
  status: string
  created_at: string
  updated_at: string
  first_race_time?: string
  weather?: string
  track_condition?: string
}

export interface Race {
  race_id: string
  created_at: string
  updated_at: string
  race_number: number
  name: string
  start_time: string
  actual_start?: string | null
  meeting_id: string
  status: string
  distance?: number | null
  track_condition?: string | null
  weather?: string | null
  runner_count?: number | null
  race_type?: string | null
  results_available?: boolean
  results_data?: RaceResult[]
  dividends_data?: PoolDividend[]
  fixed_odds_data?: Record<
    string,
    {
      fixed_win_odds: number | null
      fixed_place_odds: number | null
      runner_name: string | null
      entrant_id: string | null
    }
  >
  result_status?: 'interim' | 'final' | 'protest'
  photo_finish?: boolean
  stewards_inquiry?: boolean
  protest_lodged?: boolean
  result_time?: string
}

export interface RaceResults {
  race_id: string
  results_available?: boolean
  results_data?: string
  dividends_data?: string
  fixed_odds_data?: string
  result_status?: 'interim' | 'final' | 'protest'
  photo_finish?: boolean
  stewards_inquiry?: boolean
  protest_lodged?: boolean
  result_time?: string
  created_at: string
  updated_at: string
}

export interface MeetingWithRaces extends Meeting {
  races: Race[]
}

export interface MeetingWithExpandState extends Meeting {
  is_expanded?: boolean
  races?: Race[]
}

export interface MoneyFlowHistory {
  entry_id: string
  created_at: string
  updated_at: string
  entrant_id: string
  race_id: string
  hold_percentage: number | null
  fixed_win_odds: number | null
  fixed_place_odds: number | null
  pool_win_odds: number | null
  pool_place_odds: number | null
}

export interface OddsHistoryData {
  entry_id: string
  created_at: string
  updated_at: string
  entrant_id: string
  win_odds: number
  timestamp: string
}

export type NavigationHandler = (direction: 'previous' | 'next') => void
export type NavigationErrorHandler = (error: Error) => void

export interface RaceNavigationData {
  previous_race?: {
    race_id: string
    name: string
    start_time: string
    meeting_name: string
  } | null
  next_race?: {
    race_id: string
    name: string
    start_time: string
    meeting_name: string
  } | null
  next_scheduled_race?: {
    race_id: string
    name: string
    start_time: string
    meeting_name: string
  } | null
}

export interface Entrant {
  entrant_id: string
  created_at: string
  updated_at: string
  name: string
  runner_number: number
  jockey?: string
  trainer_name?: string
  weight?: number
  silk_url?: string
  silk_colours?: string
  silk_url_64?: string
  silk_url_128?: string
  is_scratched: boolean
  race_id: string
  fixed_win_odds?: number | null
  pool_win_odds?: number | null
  fixed_place_odds?: number | null
  pool_place_odds?: number | null
  hold_percentage?: number | null
  previous_hold_percentage?: number | null
  money_flow_trend?: 'up' | 'down' | 'neutral'
  money_flow_timeline?: EntrantMoneyFlowTimeline
  silk?: JockeySilk
  pool_money?: {
    win: number
    place: number
    total: number
    percentage: number
  }
  odds_history?: OddsHistoryData[]
  money_flow_history?: MoneyFlowHistory[]
}
