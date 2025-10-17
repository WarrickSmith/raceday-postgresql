-- Migration: Story 2.10B - Complete Schema Alignment with Appwrite
-- Task 3: Create database migration scripts (AC: 3)
-- Adds ALL remaining missing fields for 100% schema parity with Appwrite implementation
-- Reference: docs/stories/story-2.10B.md, server-old/database-setup/src/database-setup.js

-- ==============================================
-- MEETINGS TABLE: ALL Missing Fields from Appwrite
-- ==============================================

-- Core metadata fields
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS category VARCHAR(10),
  ADD COLUMN IF NOT EXISTS track_direction VARCHAR(20),
  ADD COLUMN IF NOT EXISTS rail_position VARCHAR(100),
  ADD COLUMN IF NOT EXISTS weather VARCHAR(50),
  ADD COLUMN IF NOT EXISTS track_surface VARCHAR(50),
  ADD COLUMN IF NOT EXISTS track_condition VARCHAR(50),
  ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_source VARCHAR(50) DEFAULT 'NZTAB',
  ADD COLUMN IF NOT EXISTS api_generated_time TIMESTAMPTZ;

COMMENT ON COLUMN meetings.state IS 'State/region (for non-NZ meetings like AU)';
COMMENT ON COLUMN meetings.category IS 'Category code: T=Thoroughbred, H=Harness, G=Greyhound';
COMMENT ON COLUMN meetings.track_direction IS 'Track direction: Left/Right';
COMMENT ON COLUMN meetings.rail_position IS 'Rail position information';
COMMENT ON COLUMN meetings.weather IS 'Weather conditions at meeting venue';
COMMENT ON COLUMN meetings.track_surface IS 'Track surface: All Weather, Turf, Synthetic';
COMMENT ON COLUMN meetings.track_condition IS 'Track condition: Good, Soft, Heavy, Dead, etc.';
COMMENT ON COLUMN meetings.last_updated IS 'Timestamp of last data update';
COMMENT ON COLUMN meetings.data_source IS 'Data source identifier (NZTAB, etc.)';
COMMENT ON COLUMN meetings.api_generated_time IS 'API generation timestamp from source';

-- ==============================================
-- RACES TABLE: ALL Missing Fields from Appwrite
-- ==============================================

-- NZ Timezone fields (CRITICAL - no UTC conversion)
ALTER TABLE races
  ADD COLUMN IF NOT EXISTS start_time_nz VARCHAR(30),
  ADD COLUMN IF NOT EXISTS race_date_nz VARCHAR(15);

-- Scheduler and status tracking
ALTER TABLE races
  ADD COLUMN IF NOT EXISTS last_poll_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_status_change TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ;

-- Import metadata
ALTER TABLE races
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ;

COMMENT ON COLUMN races.start_time_nz IS 'Start time in NZ local time (HH:MM:SS NZST/NZDT) - NO UTC conversion';
COMMENT ON COLUMN races.race_date_nz IS 'Race date in NZ timezone (YYYY-MM-DD) - partition alignment';
COMMENT ON COLUMN races.last_poll_time IS 'Last poll timestamp (master race scheduler)';
COMMENT ON COLUMN races.last_status_change IS 'Timestamp of most recent status change';
COMMENT ON COLUMN races.finalized_at IS 'Timestamp when race became Final/Finalized';
COMMENT ON COLUMN races.abandoned_at IS 'Timestamp when race was abandoned';
COMMENT ON COLUMN races.imported_at IS 'Initial import timestamp';
COMMENT ON COLUMN races.last_updated IS 'Last update timestamp';

-- ==============================================
-- ENTRANTS TABLE: ALL Missing Fields from Appwrite
-- ==============================================

-- Core entrant details
ALTER TABLE entrants
  ADD COLUMN IF NOT EXISTS barrier INTEGER,
  ADD COLUMN IF NOT EXISTS jockey VARCHAR(255),
  ADD COLUMN IF NOT EXISTS trainer_name VARCHAR(255);

-- Odds fields (Fixed vs Pool/Tote)
-- Note: Appwrite uses fixedWinOdds/fixedPlaceOdds and poolWinOdds/poolPlaceOdds
-- We already have win_odds and place_odds from migration 001, treat those as fixed odds
-- Add new pool odds columns
ALTER TABLE entrants
  ADD COLUMN IF NOT EXISTS fixed_win_odds NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS fixed_place_odds NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pool_win_odds NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pool_place_odds NUMERIC(10,2);

-- Scratch status (is_late_scratched added to existing is_scratched)
ALTER TABLE entrants
  ADD COLUMN IF NOT EXISTS is_late_scratched BOOLEAN DEFAULT FALSE;

-- Silk information
ALTER TABLE entrants
  ADD COLUMN IF NOT EXISTS silk_colours VARCHAR(100);

-- Import metadata
ALTER TABLE entrants
  ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

COMMENT ON COLUMN entrants.barrier IS 'Barrier position/gate number';
COMMENT ON COLUMN entrants.jockey IS 'Jockey or driver name';
COMMENT ON COLUMN entrants.trainer_name IS 'Trainer name';
COMMENT ON COLUMN entrants.fixed_win_odds IS 'Fixed odds for win betting (TAB Fixed)';
COMMENT ON COLUMN entrants.fixed_place_odds IS 'Fixed odds for place betting (TAB Fixed)';
COMMENT ON COLUMN entrants.pool_win_odds IS 'Pool/Tote odds for win betting';
COMMENT ON COLUMN entrants.pool_place_odds IS 'Pool/Tote odds for place betting';
COMMENT ON COLUMN entrants.win_odds IS 'Legacy odds field - prefer fixed_win_odds for new code';
COMMENT ON COLUMN entrants.place_odds IS 'Legacy odds field - prefer fixed_place_odds for new code';
COMMENT ON COLUMN entrants.is_late_scratched IS 'Late scratch indicator (scratched close to race time)';
COMMENT ON COLUMN entrants.silk_colours IS 'Silk colour description';
COMMENT ON COLUMN entrants.last_updated IS 'Last update timestamp';
COMMENT ON COLUMN entrants.imported_at IS 'Initial import timestamp';

-- ==============================================
-- DATA MIGRATION: Copy legacy odds to fixed odds
-- ==============================================

-- Migrate existing win_odds/place_odds data to fixed_win_odds/fixed_place_odds
-- This ensures backward compatibility while adopting Appwrite naming convention
UPDATE entrants
SET
  fixed_win_odds = win_odds,
  fixed_place_odds = place_odds
WHERE
  fixed_win_odds IS NULL
  AND (win_odds IS NOT NULL OR place_odds IS NOT NULL);

-- ==============================================
-- INDEXES FOR NEW FIELDS (AC: 4 - Performance Indexes)
-- ==============================================

-- Meeting indexes
CREATE INDEX IF NOT EXISTS idx_meetings_category
  ON meetings(category)
  WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_track_condition
  ON meetings(track_condition, date)
  WHERE track_condition IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_updated
  ON meetings(last_updated DESC)
  WHERE last_updated IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_data_source
  ON meetings(data_source, date)
  WHERE data_source IS NOT NULL;

-- Race indexes (critical for scheduler and queries)
CREATE INDEX IF NOT EXISTS idx_races_poll_time
  ON races(last_poll_time DESC)
  WHERE last_poll_time IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_races_status_change
  ON races(last_status_change DESC, status)
  WHERE last_status_change IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_races_date_nz
  ON races(race_date_nz)
  WHERE race_date_nz IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_races_finalized
  ON races(finalized_at DESC)
  WHERE finalized_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_races_updated
  ON races(last_updated DESC)
  WHERE last_updated IS NOT NULL;

-- Entrant indexes (optimized for common query patterns)
CREATE INDEX IF NOT EXISTS idx_entrants_barrier
  ON entrants(race_id, barrier)
  WHERE barrier IS NOT NULL AND is_scratched = FALSE;

CREATE INDEX IF NOT EXISTS idx_entrants_jockey
  ON entrants(jockey)
  WHERE jockey IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entrants_trainer
  ON entrants(trainer_name)
  WHERE trainer_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entrants_late_scratched
  ON entrants(race_id, is_late_scratched)
  WHERE is_late_scratched = TRUE;

CREATE INDEX IF NOT EXISTS idx_entrants_updated
  ON entrants(last_updated DESC)
  WHERE last_updated IS NOT NULL;

-- Compound index for active entrants (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_entrants_active_detailed
  ON entrants(race_id, is_scratched, is_late_scratched, runner_number)
  WHERE is_scratched = FALSE AND is_late_scratched = FALSE;

-- Odds lookup indexes (for odds comparison queries)
CREATE INDEX IF NOT EXISTS idx_entrants_fixed_odds
  ON entrants(race_id, fixed_win_odds DESC)
  WHERE fixed_win_odds IS NOT NULL AND is_scratched = FALSE;

CREATE INDEX IF NOT EXISTS idx_entrants_pool_odds
  ON entrants(race_id, pool_win_odds DESC)
  WHERE pool_win_odds IS NOT NULL AND is_scratched = FALSE;

-- ==============================================
-- STATISTICS UPDATE
-- ==============================================

-- Update table statistics for query planner optimization
ANALYZE meetings;
ANALYZE races;
ANALYZE entrants;
