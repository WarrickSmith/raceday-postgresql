-- Migration: Story 2.10E - Client REST Support Prerequisites
-- Tasks 9.1 & 9.2: Add race_results and user_alert_configs tables required for REST endpoints
-- References:
--   - docs/stories/story-2.10E.md (Task 9 acceptance criteria)
--   - docs/stories/story-context-2.10E.xml (Task 9 subtasks, REST contract)

-- Ensure UUID generation functions are available for primary keys
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================
-- race_results table (Task 9.1)
-- Stores finalized race outcome payloads for client consumption
-- ==============================================
CREATE TABLE IF NOT EXISTS race_results (
  race_id TEXT PRIMARY KEY REFERENCES races(race_id) ON DELETE CASCADE,
  results_available BOOLEAN NOT NULL DEFAULT FALSE,
  results_data JSONB,
  dividends_data JSONB,
  fixed_odds_data JSONB,
  result_status TEXT CHECK (result_status IN ('interim', 'final', 'protest')),
  photo_finish BOOLEAN NOT NULL DEFAULT FALSE,
  stewards_inquiry BOOLEAN NOT NULL DEFAULT FALSE,
  protest_lodged BOOLEAN NOT NULL DEFAULT FALSE,
  result_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE race_results IS 'Stores finalized race result payloads (JSONB) for REST API consumption';
COMMENT ON COLUMN race_results.results_available IS 'Indicates whether official race results are available';
COMMENT ON COLUMN race_results.results_data IS 'JSONB array of runner placings and metadata';
COMMENT ON COLUMN race_results.dividends_data IS 'JSONB array of pool dividend payouts';
COMMENT ON COLUMN race_results.fixed_odds_data IS 'JSONB map of fixed odds snapshot at completion time';
COMMENT ON COLUMN race_results.result_status IS 'Normalization of Appwrite statuses: interim, final, protest';
COMMENT ON COLUMN race_results.photo_finish IS 'True when a photo finish flag is reported';
COMMENT ON COLUMN race_results.stewards_inquiry IS 'True when stewards inquiry flag is reported';
COMMENT ON COLUMN race_results.protest_lodged IS 'True when a protest flag is reported';
COMMENT ON COLUMN race_results.result_time IS 'Timestamp when results were finalized or recorded';

DROP TRIGGER IF EXISTS race_results_updated_at ON race_results;
CREATE TRIGGER race_results_updated_at
  BEFORE UPDATE ON race_results
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_race_results_status
  ON race_results(result_status);

-- ==============================================
-- user_alert_configs table (Task 9.2)
-- Stores per-user alert indicator configuration used by client UI
-- ==============================================
CREATE TABLE IF NOT EXISTS user_alert_configs (
  indicator_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  indicator_type TEXT NOT NULL CHECK (indicator_type = 'percentage_range'),
  percentage_range_min NUMERIC(5,2) NOT NULL CHECK (percentage_range_min >= 0 AND percentage_range_min <= 100),
  percentage_range_max NUMERIC(5,2) CHECK (percentage_range_max >= 0 AND percentage_range_max <= 100),
  color CHAR(7) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 6),
  audible_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_alert_configs IS 'Percentage range indicator configuration per user for alerting UI';
COMMENT ON COLUMN user_alert_configs.indicator_type IS 'Only percentage_range indicators are supported for Story 2.10E';
COMMENT ON COLUMN user_alert_configs.percentage_range_min IS 'Lower bound of monitored percentage range';
COMMENT ON COLUMN user_alert_configs.percentage_range_max IS 'Upper bound of monitored percentage range (NULL => open-ended)';
COMMENT ON COLUMN user_alert_configs.color IS 'Hex colour code (#RRGGBB) associated with indicator display';
COMMENT ON COLUMN user_alert_configs.display_order IS 'Ordering slot (1-6) for alert indicator presentation';

CREATE INDEX IF NOT EXISTS idx_user_alert_configs_user_id
  ON user_alert_configs(user_id);

CREATE INDEX IF NOT EXISTS idx_user_alert_configs_indicator_type
  ON user_alert_configs(indicator_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_alert_configs_user_display_order
  ON user_alert_configs(user_id, display_order);

DROP TRIGGER IF EXISTS user_alert_configs_updated_at ON user_alert_configs;
CREATE TRIGGER user_alert_configs_updated_at
  BEFORE UPDATE ON user_alert_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
