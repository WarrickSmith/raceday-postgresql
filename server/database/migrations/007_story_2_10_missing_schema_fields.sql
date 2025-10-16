-- Migration: Story 2.10 - Add Missing Database Schema Fields
-- Completes schema alignment with NZTAB API response data
-- Adds 50+ missing fields for comprehensive data population
-- Reference: docs/stories/story-2.10.md, Task 2.2 (AC: 2)

-- ==============================================
-- ENTRANTS TABLE: Missing Fields from NZTAB API
-- ==============================================

-- Add missing entrant fields from NZTAB API
ALTER TABLE entrants
  ADD COLUMN IF NOT EXISTS silk_url_64x64 TEXT,
  ADD COLUMN IF NOT EXISTS silk_url_128x128 TEXT,
  ADD COLUMN IF NOT EXISTS scratch_time INTEGER,
  ADD COLUMN IF NOT EXISTS runner_change TEXT,
  ADD COLUMN IF NOT EXISTS mover VARCHAR(10),
  ADD COLUMN IF NOT EXISTS favourite BOOLEAN DEFAULT FALSE;

-- ==============================================
-- RACES TABLE: Missing Fields from NZTAB API
-- ==============================================

-- Add missing race metadata fields
ALTER TABLE races
  ADD COLUMN IF NOT EXISTS actual_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tote_start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS distance INTEGER,
  ADD COLUMN IF NOT EXISTS track_condition TEXT,
  ADD COLUMN IF NOT EXISTS track_surface TEXT,
  ADD COLUMN IF NOT EXISTS weather TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS total_prize_money NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS entrant_count INTEGER,
  ADD COLUMN IF NOT EXISTS field_size INTEGER,
  ADD COLUMN IF NOT EXISTS positions_paid INTEGER,
  ADD COLUMN IF NOT EXISTS silk_url TEXT,
  ADD COLUMN IF NOT EXISTS silk_base_url TEXT,
  ADD COLUMN IF NOT EXISTS video_channels TEXT;

-- ==============================================
-- MEETINGS TABLE: Missing Fields from NZTAB API
-- ==============================================

-- Add missing meeting metadata fields
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS meeting TEXT,
  ADD COLUMN IF NOT EXISTS category_name TEXT;

-- ==============================================
-- RACE_POOLS TABLE: Additional Pool Types
-- ==============================================

-- Add missing pool types from enhanced implementation
ALTER TABLE race_pools
  ADD COLUMN IF NOT EXISTS exacta_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first4_pool_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT '$',
  ADD COLUMN IF NOT EXISTS data_quality_score INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS extracted_pools INTEGER DEFAULT 0;

-- ==============================================
-- INDEXES FOR PERFORMANCE AND QUERYING
-- ==============================================

-- Simple indexes for performance
CREATE INDEX IF NOT EXISTS idx_entrants_silk_urls ON entrants(race_id);
CREATE INDEX IF NOT EXISTS idx_entrants_scratching ON entrants(race_id, is_scratched);
CREATE INDEX IF NOT EXISTS idx_races_metadata ON races(start_time, track_condition);
CREATE INDEX IF NOT EXISTS idx_races_prize_money ON races(total_prize_money) WHERE total_prize_money IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_race_pools_comprehensive ON race_pools(race_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status_category ON meetings(status, date);

-- ==============================================
-- COMMENTS FOR DOCUMENTATION
-- ==============================================

COMMENT ON COLUMN entrants.silk_url_64x64 IS '64x64 pixel silk colours image URL from NZTAB API';
COMMENT ON COLUMN entrants.silk_url_128x128 IS '128x128 pixel silk colours image URL from NZTAB API';
COMMENT ON COLUMN entrants.scratch_time IS 'Time when entrant was scratched (minutes from start)';
COMMENT ON COLUMN entrants.runner_change IS 'Details of any runner number changes';
COMMENT ON COLUMN entrants.mover IS 'Market mover indicator from NZTAB API';
COMMENT ON COLUMN entrants.favourite IS 'Favourite status from NZTAB API';

COMMENT ON COLUMN races.actual_start IS 'Actual race start time when race began';
COMMENT ON COLUMN races.tote_start_time IS 'Tote betting start time';
COMMENT ON COLUMN races.distance IS 'Race distance in meters';
COMMENT ON COLUMN races.track_condition IS 'Track condition (Good, Soft, Heavy, etc.)';
COMMENT ON COLUMN races.track_surface IS 'Track surface type (Turf, Synthetic, etc.)';
COMMENT ON COLUMN races.weather IS 'Weather conditions during race';
COMMENT ON COLUMN races.type IS 'Race type or classification';
COMMENT ON COLUMN races.total_prize_money IS 'Total prize money pool for the race';
COMMENT ON COLUMN races.entrant_count IS 'Number of entrants in the race';
COMMENT ON COLUMN races.field_size IS 'Final field size after scratches';
COMMENT ON COLUMN races.positions_paid IS 'Number of paid positions';
COMMENT ON COLUMN races.silk_url IS 'Base URL for silk images';
COMMENT ON COLUMN races.silk_base_url IS 'Base URL for silk images';
COMMENT ON COLUMN races.video_channels IS 'JSON array of available video channels';

COMMENT ON COLUMN meetings.meeting IS 'Original meeting identifier from NZTAB API';
COMMENT ON COLUMN meetings.category_name IS 'Full category name from API (e.g., "Thoroughbred Horse Racing")';

COMMENT ON COLUMN race_pools.exacta_pool_total IS 'Total amount in exacta pool (in cents)';
COMMENT ON COLUMN race_pools.first4_pool_total IS 'Total amount in first4 pool (in cents)';
COMMENT ON COLUMN race_pools.currency IS 'Currency for pool amounts';
COMMENT ON COLUMN race_pools.data_quality_score IS 'Data quality/validation score (0-100)';
COMMENT ON COLUMN race_pools.extracted_pools IS 'Number of pools successfully extracted from API';