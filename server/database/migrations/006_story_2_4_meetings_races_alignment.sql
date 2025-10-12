-- Migration: Story 2.4/2.5 - Align Meetings and Races Tables with Transform Output
-- Updates table schemas to match TransformedMeeting and TransformedRace types
-- Reference: server/src/workers/messages.ts:15-126

-- Update meetings table to match TransformedMeeting schema
ALTER TABLE meetings
  -- Add track_condition and tote_status from NZ TAB API
  ADD COLUMN IF NOT EXISTS track_condition TEXT,
  ADD COLUMN IF NOT EXISTS tote_status TEXT;

-- Note: meeting_name maps to "name" in TransformedMeeting
-- Note: race_type maps to "category" in TransformedMeeting
-- Both are acceptable as-is; UPSERT will use column aliases

-- Update races table to match TransformedRace schema elements
ALTER TABLE races
  -- Add race_date_nz and start_time_nz from NZ TAB API (separate from start_time)
  ADD COLUMN IF NOT EXISTS race_date_nz DATE,
  ADD COLUMN IF NOT EXISTS start_time_nz TIME;

-- Note: races.name already exists and matches TransformedRace
-- Note: races.status already exists and matches TransformedRace
-- Note: races.race_number already exists and matches TransformedRace

-- Add index for NZ timezone queries
CREATE INDEX IF NOT EXISTS idx_races_nz_datetime
  ON races(race_date_nz, start_time_nz)
  WHERE status IN ('open', 'interim');
