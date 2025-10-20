/**
 * Enhanced Race Pools Types for v4.7 Race Interface
 * Supports pool totals display and race results presentation
 */

// Pool types supported by the system
export type PoolType = 'win' | 'place' | 'quinella' | 'trifecta' | 'exacta' | 'first4';

// Individual pool totals
export interface PoolTotal {
  pool_type: PoolType;
  total_amount: number;
  currency: string;
  percentage: number;
  is_active: boolean;
}

// Complete race pool data
export interface RacePoolData {
  race_pool_id: string;
  created_at: string;
  updated_at: string;
  race_id: string;
  win_pool_total: number;
  place_pool_total: number;
  quinella_pool_total: number;
  trifecta_pool_total: number;
  exacta_pool_total: number;
  first4_pool_total: number;
  total_race_pool: number;
  currency: string;
  last_updated: string;
  is_live: boolean;
}

// Race results data for display
export interface RaceResult {
  position: number;
  runner_number?: number;
  runner_name?: string;
  jockey?: string;
  odds?: number;
  margin?: string; // e.g., "1.5L", "neck", "nose"
  // NZTAB API fields
  name?: string;
  barrier?: number;
  margin_length?: number;
  entrant_id?: string;
}

// Pool dividends for completed races
export interface PoolDividend {
  pool_type?: PoolType;
  dividend: number;
  investment?: number; // minimum investment (e.g., $1, $2)
  winners?: string[]; // array of runner numbers or combinations
  currency?: string;
  // NZTAB API fields
  product_name?: string; // e.g., "Pool Win", "Pool Place"
  product_type?: string;
  pool_type?: string;
  type?: string;
  id?: string;
  tote?: string;
  status?: string;
  pool_size?: number;
  jackpot_size?: number;
  positions?: Array<{runner_number: number; position: number}>;
  description?: string;
}

// Fixed odds data structure for individual runners
export interface FixedOddsRunner {
  fixed_win_odds: number;
  fixed_place_odds: number;
  runner_name: string;
  entrant_id: string;
}

// Complete race results with dividends
export interface RaceResultsData {
  race_id: string;
  status: 'interim' | 'final' | 'protest';
  results: RaceResult[];
  dividends: PoolDividend[];
  fixed_odds_data?: Record<string, FixedOddsRunner>;
  photo_finish: boolean;
  stewards_inquiry: boolean;
  protest_lodged: boolean;
  result_time: string;
}

// Pool toggle state for UI switching
export interface PoolToggleState {
  active_view: PoolType;
  available_views: PoolType[];
  display_mode: 'odds' | 'money' | 'percentage';
}

// Pool summary for footer display
export interface PoolSummaryDisplay {
  pools: PoolTotal[];
  total_amount: number;
  currency: string;
  last_updated: string;
  update_frequency: number;
}

// Race status types for display
export type RaceStatus = 'open' | 'closed' | 'interim' | 'final' | 'abandoned' | 'postponed';

// Race status display data
export interface RaceStatusDisplay {
  status: RaceStatus;
  time_to_start?: number;
  time_to_close?: number;
  status_message: string;
  countdown: boolean; // whether to show countdown timer
  color: 'green' | 'yellow' | 'red' | 'blue' | 'gray';
}
