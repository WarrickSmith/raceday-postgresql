-- Migration: Story 2.10B - Add Critical Missing Database Schema Fields
-- Task 3: Create database migration scripts (AC: 3)
-- Adds high-priority missing fields for complete schema alignment with Appwrite
-- Reference: docs/stories/story-2.10B.md

-- ==============================================
-- MEETINGS TABLE: Critical Missing Fields
-- ==============================================

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS category VARCHAR(10),
  ADD COLUMN IF NOT EXISTS track_direction VARCHAR(20),
  ADD COLUMN IF NOT EXISTS rail_position VARCHAR(100),
  ADD COLUMN IF NOT EXISTS weather VARCHAR(50),
  ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_source VARCHAR(50) DEFAULT 'NZTAB',
  ADD COLUMN IF NOT EXISTS api_generated_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS track_condition VARCHAR(50),
  ADD COLUMN IF NOT EXISTS track_surface VARCHAR(50);

COMMENT ON COLUMN meetings.state IS 'State/region for non-NZ meetings';
COMMENT ON COLUMN meetings.category IS 'Category code (T=Thoroughbred, H=Harness, G=Greyhound)';
COMMENT ON COLUMN meetings.track_direction IS 'Track direction (Left/Right)';
COMMENT ON COLUMN meetings.rail_position IS 'Rail position information from NZTAB API';
COMMENT ON COLUMN meetings.weather IS 'Weather conditions at meeting';
COMMENT ON COLUMN meetings.last_updated IS 'Last update timestamp from data source';
COMMENT ON COLUMN meetings.data_source IS 'Data source identifier (e.g., NZTAB)';
COMMENT ON COLUMN meetings.api_generated_time IS 'Timestamp when API data was generated';
COMMENT ON COLUMN meetings.track_condition IS 'Track condition (Good, Soft, Heavy, etc.)';
COMMENT ON COLUMN meetings.track_surface IS 'Track surface type (All Weather, Turf, etc.)';

-- ==============================================
-- RACES TABLE: Critical Missing Fields
-- ==============================================

ALTER TABLE races
  ADD COLUMN IF NOT EXISTS start_time_nz VARCHAR(30),
  ADD COLUMN IF NOT EXISTS race_date_nz VARCHAR(15),
  ADD COLUMN IF NOT EXISTS last_poll_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_status_change TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ;

COMMENT ON COLUMN races.start_time_nz IS 'Start time in NZ local time (HH:MM:SS NZST) - NO UTC conversion needed';
COMMENT ON COLUMN races.race_date_nz IS 'Race date in NZ timezone (YYYY-MM-DD) - aligns partition boundaries';
COMMENT ON COLUMN races.last_poll_time IS 'Timestamp of last poll by master race scheduler';
COMMENT ON COLUMN races.last_status_change IS 'Timestamp of last status change';
COMMENT ON COLUMN races.finalized_at IS 'Timestamp when race status became Final/Finalized';
COMMENT ON COLUMN races.abandoned_at IS 'Timestamp when race was abandoned';
COMMENT ON COLUMN races.imported_at IS 'Timestamp when race data was imported';
COMMENT ON COLUMN races.last_updated IS 'Last update timestamp from data source';

-- ==============================================
-- ENTRANTS TABLE: Critical Missing Fields
-- ==============================================

ALTER TABLE entrants
  ADD COLUMN IF NOT EXISTS barrier INTEGER,
  ADD COLUMN IF NOT EXISTS fixed_win_odds NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS fixed_place_odds NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pool_win_odds NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pool_place_odds NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS is_late_scratched BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS jockey VARCHAR(255),
  ADD COLUMN IF NOT EXISTS trainer_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS silk_colours VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

COMMENT ON COLUMN entrants.barrier IS 'Barrier position/gate number';
COMMENT ON COLUMN entrants.fixed_win_odds IS 'Fixed odds for win betting';
COMMENT ON COLUMN entrants.fixed_place_odds IS 'Fixed odds for place betting';
COMMENT ON COLUMN entrants.pool_win_odds IS 'Pool/Tote odds for win betting';
COMMENT ON COLUMN entrants.pool_place_odds IS 'Pool/Tote odds for place betting';
COMMENT ON COLUMN entrants.is_late_scratched IS 'Late scratch indicator';
COMMENT ON COLUMN entrants.jockey IS 'Jockey or driver name';
COMMENT ON COLUMN entrants.trainer_name IS 'Trainer name';
COMMENT ON COLUMN entrants.silk_colours IS 'Silk colour description';
COMMENT ON COLUMN entrants.last_updated IS 'Last update timestamp from data source';
COMMENT ON COLUMN entrants.imported_at IS 'Timestamp when entrant data was imported';

-- ==============================================
-- INDEXES FOR NEW FIELDS (AC: 4)
-- ==============================================

-- Meeting indexes for filtering and querying
CREATE INDEX IF NOT EXISTS idx_meetings_category ON meetings(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_track_condition ON meetings(track_condition) WHERE track_condition IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_updated ON meetings(last_updated DESC) WHERE last_updated IS NOT NULL;

-- Race indexes for scheduler and status tracking
CREATE INDEX IF NOT EXISTS idx_races_poll_time ON races(last_poll_time DESC) WHERE last_poll_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_races_status_change ON races(last_status_change DESC) WHERE last_status_change IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_races_date_nz ON races(race_date_nz) WHERE race_date_nz IS NOT NULL;

-- Entrant indexes for lookups and filtering
CREATE INDEX IF NOT EXISTS idx_entrants_barrier ON entrants(race_id, barrier) WHERE barrier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entrants_jockey ON entrants(jockey) WHERE jockey IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entrants_late_scratched ON entrants(race_id) WHERE is_late_scratched = TRUE;
CREATE INDEX IF NOT EXISTS idx_entrants_updated ON entrants(last_updated DESC) WHERE last_updated IS NOT NULL;

-- Compound index for active non-late-scratched entrants (optimizes common queries)
CREATE INDEX IF NOT EXISTS idx_entrants_active_detailed
  ON entrants(race_id, is_scratched, is_late_scratched)
  WHERE is_scratched = FALSE AND is_late_scratched = FALSE;
