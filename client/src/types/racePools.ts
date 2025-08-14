/**
 * Enhanced Race Pools Types for v4.7 Race Interface
 * Supports pool totals display and race results presentation
 */

// Pool types supported by the system
export type PoolType = 'win' | 'place' | 'quinella' | 'trifecta' | 'exacta' | 'first4';

// Individual pool totals
export interface PoolTotal {
  poolType: PoolType;
  totalAmount: number;
  currency: string;
  percentage: number; // percentage of total race pools
  isActive: boolean;
}

// Complete race pool data
export interface RacePoolData {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  raceId: string;
  winPoolTotal: number;
  placePoolTotal: number;
  quinellaPoolTotal: number;
  trifectaPoolTotal: number;
  exactaPoolTotal: number;
  first4PoolTotal: number;
  totalRacePool: number;
  currency: string;
  lastUpdated: string;
  isLive: boolean;
}

// Race results data for display
export interface RaceResult {
  position: number;
  runnerNumber: number;
  runnerName: string;
  jockey: string;
  odds: number;
  margin?: string; // e.g., "1.5L", "neck", "nose"
}

// Pool dividends for completed races
export interface PoolDividend {
  poolType: PoolType;
  dividend: number;
  investment: number; // minimum investment (e.g., $1, $2)
  winners: string[]; // array of runner numbers or combinations
  currency: string;
}

// Complete race results with dividends
export interface RaceResultsData {
  raceId: string;
  status: 'interim' | 'final' | 'protest';
  results: RaceResult[];
  dividends: PoolDividend[];
  photoFinish: boolean;
  stewardsInquiry: boolean;
  protestLodged: boolean;
  resultTime: string;
}

// Pool toggle state for UI switching
export interface PoolToggleState {
  activeView: PoolType;
  availableViews: PoolType[];
  displayMode: 'odds' | 'money' | 'percentage';
}

// Pool summary for footer display
export interface PoolSummaryDisplay {
  pools: PoolTotal[];
  totalAmount: number;
  currency: string;
  lastUpdated: string;
  updateFrequency: number; // seconds between updates
}

// Race status types for display
export type RaceStatus = 'open' | 'closed' | 'interim' | 'final' | 'abandoned' | 'postponed';

// Race status display data
export interface RaceStatusDisplay {
  status: RaceStatus;
  timeToStart?: number; // seconds until race start (if open)
  timeToClose?: number; // seconds until betting closes (if open)
  statusMessage: string;
  countdown: boolean; // whether to show countdown timer
  color: 'green' | 'yellow' | 'red' | 'blue' | 'gray';
}

// Pool subscription callback interface
export interface PoolSubscriptionResponse {
  payload?: Partial<RacePoolData> & { raceId: string };
  events?: string[];
}

// Results subscription callback interface
export interface ResultsSubscriptionResponse {
  payload?: Partial<RaceResultsData> & { raceId: string };
  events?: string[];
}