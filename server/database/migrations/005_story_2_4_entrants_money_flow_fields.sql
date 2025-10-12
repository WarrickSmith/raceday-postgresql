-- Migration: Story 2.4 - Add Money Flow Fields to Entrants Table
-- Adds calculated money flow fields from transform worker to entrants table
-- Reference: docs/stories/story-2.4.md, server/src/workers/messages.ts:32-59

-- Add missing odds fields
ALTER TABLE entrants
  ADD COLUMN IF NOT EXISTS fixed_win_odds NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS fixed_place_odds NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pool_win_odds NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pool_place_odds NUMERIC(10,2);

-- Add calculated money flow percentages
ALTER TABLE entrants
  ADD COLUMN IF NOT EXISTS bet_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS win_pool_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS place_pool_percentage NUMERIC(5,2);

-- Add pool amounts in cents (BIGINT for large values)
ALTER TABLE entrants
  ADD COLUMN IF NOT EXISTS win_pool_amount BIGINT,
  ADD COLUMN IF NOT EXISTS place_pool_amount BIGINT;

-- Add entrant metadata fields
ALTER TABLE entrants
  ADD COLUMN IF NOT EXISTS barrier INTEGER,
  ADD COLUMN IF NOT EXISTS is_late_scratched BOOLEAN,
  ADD COLUMN IF NOT EXISTS jockey TEXT,
  ADD COLUMN IF NOT EXISTS trainer_name TEXT,
  ADD COLUMN IF NOT EXISTS silk_colours TEXT,
  ADD COLUMN IF NOT EXISTS favourite BOOLEAN,
  ADD COLUMN IF NOT EXISTS mover BOOLEAN;

-- Update existing column names for consistency
-- Note: win_odds and place_odds already exist, no rename needed

-- Add index for money flow queries (most recent percentages)
CREATE INDEX IF NOT EXISTS idx_entrants_hold_percentage
  ON entrants(race_id, hold_percentage DESC NULLS LAST)
  WHERE hold_percentage IS NOT NULL;

-- Add index for pool amount queries
CREATE INDEX IF NOT EXISTS idx_entrants_pool_amounts
  ON entrants(race_id)
  WHERE win_pool_amount IS NOT NULL OR place_pool_amount IS NOT NULL;
