-- Migration 004: Fix and optimize database indexes
-- Story 1.4: Database Indexes for Query Optimization
-- Date: 2025-10-07

-- Fix AC #1: races(start_time) partial index
-- Original index in 001_initial_schema.sql excluded 'closed' status
-- Must DROP and recreate (cannot ALTER partial WHERE clause)
DROP INDEX IF EXISTS idx_races_start_time;

CREATE INDEX idx_races_start_time
  ON races(start_time)
  WHERE status IN ('open', 'closed', 'interim');

-- Fix AC #3: entrants partial index for active (non-scratched) entries
-- Original index in 001_initial_schema.sql had wrong columns (race_id, runner_number)
-- Should be (race_id) only to match query pattern: WHERE race_id = X AND is_scratched = false
--
-- RATIONALE: Composite index (race_id, runner_number) provided no query benefit.
-- PostgreSQL uses the race_id prefix for index scan, then applies the is_scratched
-- predicate from the partial WHERE clause. The runner_number column added index size
-- without improving query performance since it's not used in WHERE or JOIN clauses.
DROP INDEX IF EXISTS idx_active_entrants;

CREATE INDEX idx_active_entrants
  ON entrants(race_id)
  WHERE is_scratched = FALSE;

-- Verification comments for existing indexes (no action needed):
-- AC #2: idx_entrants_race ON entrants(race_id) - EXISTS in 001_initial_schema.sql
-- AC #4: idx_meetings_date_type ON meetings(date, race_type) WHERE status = 'active' - EXISTS in 001_initial_schema.sql
-- AC #5: idx_money_flow_entrant_time ON money_flow_history(entrant_id, event_timestamp DESC) - EXISTS in 003_partitioned_tables.sql
-- AC #6: idx_odds_entrant_time ON odds_history(entrant_id, event_timestamp DESC) - EXISTS in 003_partitioned_tables.sql
