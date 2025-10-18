-- Migration Rollback: Story 2.10B - Complete Schema Alignment with Appwrite
-- Rollback for migration 008_story_2_10B_complete_schema_alignment.sql
-- Removes all fields and indexes added in the UP migration

-- ==============================================
-- DROP INDEXES (in reverse order)
-- ==============================================

-- Entrant indexes
DROP INDEX IF EXISTS idx_entrants_pool_odds;
DROP INDEX IF EXISTS idx_entrants_fixed_odds;
DROP INDEX IF EXISTS idx_entrants_active_detailed;
DROP INDEX IF EXISTS idx_entrants_updated;
DROP INDEX IF EXISTS idx_entrants_late_scratched;
DROP INDEX IF EXISTS idx_entrants_trainer;
DROP INDEX IF EXISTS idx_entrants_jockey;
DROP INDEX IF EXISTS idx_entrants_barrier;

-- Race indexes
DROP INDEX IF EXISTS idx_races_updated;
DROP INDEX IF EXISTS idx_races_finalized;
DROP INDEX IF EXISTS idx_races_date_nz;
DROP INDEX IF EXISTS idx_races_status_change;
DROP INDEX IF EXISTS idx_races_poll_time;

-- Meeting indexes
DROP INDEX IF EXISTS idx_meetings_data_source;
DROP INDEX IF EXISTS idx_meetings_updated;
DROP INDEX IF EXISTS idx_meetings_track_condition;
DROP INDEX IF EXISTS idx_meetings_category;

-- ==============================================
-- REMOVE COLUMNS FROM ENTRANTS TABLE
-- ==============================================

ALTER TABLE entrants
  DROP COLUMN IF EXISTS imported_at,
  DROP COLUMN IF EXISTS last_updated,
  DROP COLUMN IF EXISTS silk_colours,
  DROP COLUMN IF EXISTS is_late_scratched,
  DROP COLUMN IF EXISTS pool_place_odds,
  DROP COLUMN IF EXISTS pool_win_odds,
  DROP COLUMN IF EXISTS fixed_place_odds,
  DROP COLUMN IF EXISTS fixed_win_odds,
  DROP COLUMN IF EXISTS trainer_name,
  DROP COLUMN IF EXISTS jockey,
  DROP COLUMN IF EXISTS barrier;

-- ==============================================
-- REMOVE COLUMNS FROM RACES TABLE
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
-- REMOVE COLUMNS FROM MEETINGS TABLE
-- ==============================================

ALTER TABLE meetings
  DROP COLUMN IF EXISTS api_generated_time,
  DROP COLUMN IF EXISTS data_source,
  DROP COLUMN IF EXISTS last_updated,
  DROP COLUMN IF EXISTS track_condition,
  DROP COLUMN IF EXISTS track_surface,
  DROP COLUMN IF EXISTS weather,
  DROP COLUMN IF EXISTS rail_position,
  DROP COLUMN IF EXISTS track_direction,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS state;

-- ==============================================
-- STATISTICS UPDATE
-- ==============================================

ANALYZE meetings;
ANALYZE races;
ANALYZE entrants;
