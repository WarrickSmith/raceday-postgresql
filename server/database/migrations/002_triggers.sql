-- Auto-update Triggers for updated_at fields
-- Creates function and triggers to automatically update updated_at timestamp

-- Function: update_updated_at_column
-- Updates the updated_at column to the current timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: meetings_updated_at
-- Auto-updates updated_at on meetings table
DROP TRIGGER IF EXISTS meetings_updated_at ON meetings;
CREATE TRIGGER meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: races_updated_at
-- Auto-updates updated_at on races table
DROP TRIGGER IF EXISTS races_updated_at ON races;
CREATE TRIGGER races_updated_at
  BEFORE UPDATE ON races
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: entrants_updated_at
-- Auto-updates updated_at on entrants table
DROP TRIGGER IF EXISTS entrants_updated_at ON entrants;
CREATE TRIGGER entrants_updated_at
  BEFORE UPDATE ON entrants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function: update_last_updated_column
-- Updates the last_updated column to the current timestamp
CREATE OR REPLACE FUNCTION update_last_updated_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: race_pools_last_updated
-- Auto-updates last_updated on race_pools table
DROP TRIGGER IF EXISTS race_pools_last_updated ON race_pools;
CREATE TRIGGER race_pools_last_updated
  BEFORE UPDATE ON race_pools
  FOR EACH ROW
  EXECUTE FUNCTION update_last_updated_column();
