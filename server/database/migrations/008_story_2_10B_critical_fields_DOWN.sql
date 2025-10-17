-- Migration Rollback: Story 2.10B - Remove Critical Missing Database Schema Fields
-- Rollback for migration 008_story_2_10B_critical_fields.sql

-- ==============================================
-- ENTRANTS TABLE: Remove Added Indexes
-- ==============================================

DROP INDEX IF EXISTS idx_entrants_active_detailed;
DROP INDEX IF EXISTS idx_entrants_updated;
DROP INDEX IF EXISTS idx_entrants_late_scratched;
DROP INDEX IF EXISTS idx_entrants_jockey;
DROP INDEX IF EXISTS idx_entrants_barrier;

-- ==============================================
-- RACES TABLE: Remove Added Indexes
-- ==============================================

DROP INDEX IF EXISTS idx_races_date_nz;
DROP INDEX IF EXISTS idx_races_status_change;
DROP INDEX IF EXISTS idx_races_poll_time;

-- ==============================================
-- MEETINGS TABLE: Remove Added Indexes
-- ==============================================

DROP INDEX IF EXISTS idx_meetings_updated;
DROP INDEX IF EXISTS idx_meetings_track_condition;
DROP INDEX IF EXISTS idx_meetings_category;

-- ==============================================
-- ENTRANTS TABLE: Remove Added Columns
-- ==============================================

ALTER TABLE entrants
  DROP COLUMN IF EXISTS imported_at,
  DROP COLUMN IF EXISTS last_updated,
  DROP COLUMN IF EXISTS silk_colours,
  DROP COLUMN IF EXISTS trainer_name,
  DROP COLUMN IF EXISTS jockey,
  DROP COLUMN IF EXISTS is_late_scratched,
  DROP COLUMN IF EXISTS pool_place_odds,
  DROP COLUMN IF EXISTS pool_win_odds,
  DROP COLUMN IF EXISTS fixed_place_odds,
  DROP COLUMN IF EXISTS fixed_win_odds,
  DROP COLUMN IF EXISTS barrier;

-- ==============================================
-- RACES TABLE: Remove Added Columns
-- ==============================================

ALTER TABLE races
  DROP COLUMN IF EXISTS last_updated,
  DROP COLUMN IF EXISTS imported_at,
  DROP COLUMN IF EXISTS abandoned_at,
  DROP COLUMN IF EXISTS finalized_at,
  DROP COLUMN IF EXISTS last_status_change,
  DROP COLUMN IF EXISTS last_poll_time,
  DROP COLUMN IF EXISTS race_date_nz,
  DROP COLUMN IF EXISTS start_time_nz;

-- ==============================================
-- MEETINGS TABLE: Remove Added Columns
-- ==============================================

ALTER TABLE meetings
  DROP COLUMN IF EXISTS track_surface,
  DROP COLUMN IF EXISTS track_condition,
  DROP COLUMN IF EXISTS api_generated_time,
  DROP COLUMN IF EXISTS data_source,
  DROP COLUMN IF EXISTS last_updated,
  DROP COLUMN IF EXISTS weather,
  DROP COLUMN IF EXISTS rail_position,
  DROP COLUMN IF EXISTS track_direction,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS state;
