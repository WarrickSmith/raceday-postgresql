-- Core Database Schema Migration
-- Creates tables: meetings, races, entrants, race_pools

-- Table: meetings
-- Stores race meeting information
CREATE TABLE IF NOT EXISTS meetings (
  meeting_id TEXT PRIMARY KEY,
  meeting_name TEXT NOT NULL,
  country TEXT NOT NULL,
  race_type TEXT NOT NULL CHECK (race_type IN ('thoroughbred', 'harness')),
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index for active meetings
CREATE INDEX IF NOT EXISTS idx_meetings_date_type
  ON meetings(date, race_type)
  WHERE status = 'active';

-- Table: races
-- Stores individual race details
CREATE TABLE IF NOT EXISTS races (
  race_id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(meeting_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  race_number INTEGER NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'interim', 'final', 'abandoned')),
  actual_start TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for races by meeting
CREATE INDEX IF NOT EXISTS idx_races_meeting
  ON races(meeting_id);

-- Partial index for open races
CREATE INDEX IF NOT EXISTS idx_races_start_time
  ON races(start_time)
  WHERE status IN ('open', 'interim');

-- Table: entrants
-- Stores race participants (horses/drivers)
CREATE TABLE IF NOT EXISTS entrants (
  entrant_id TEXT PRIMARY KEY,
  race_id TEXT NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  runner_number INTEGER NOT NULL,
  win_odds NUMERIC(10,2),
  place_odds NUMERIC(10,2),
  hold_percentage NUMERIC(5,2),
  is_scratched BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for entrants by race
CREATE INDEX IF NOT EXISTS idx_entrants_race
  ON entrants(race_id);

-- Partial index for active (non-scratched) entrants
CREATE INDEX IF NOT EXISTS idx_active_entrants
  ON entrants(race_id, runner_number)
  WHERE is_scratched = FALSE;

-- Table: race_pools
-- Stores pool totals per race (one-to-one with races)
CREATE TABLE IF NOT EXISTS race_pools (
  race_id TEXT PRIMARY KEY REFERENCES races(race_id) ON DELETE CASCADE,
  win_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  place_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  quinella_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  trifecta_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
