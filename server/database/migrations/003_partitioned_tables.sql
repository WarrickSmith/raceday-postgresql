-- Partitioned Time-Series Tables Migration
-- Creates partitioned tables: money_flow_history, odds_history
-- Partition strategy: Daily partitions by event_timestamp

-- Table: money_flow_history (Partitioned by event_timestamp)
-- Stores time-series money flow tracking data
CREATE TABLE IF NOT EXISTS money_flow_history (
  id BIGSERIAL,
  entrant_id TEXT NOT NULL REFERENCES entrants(entrant_id),
  race_id TEXT NOT NULL,
  hold_percentage NUMERIC(5,2),
  bet_percentage NUMERIC(5,2),
  type TEXT,
  time_to_start INTEGER,
  time_interval INTEGER,
  interval_type TEXT,
  event_timestamp TIMESTAMPTZ NOT NULL,
  polling_timestamp TIMESTAMPTZ NOT NULL,
  win_pool_amount BIGINT,
  place_pool_amount BIGINT,
  win_pool_percentage NUMERIC(5,2),
  place_pool_percentage NUMERIC(5,2),
  incremental_amount BIGINT,
  incremental_win_amount BIGINT,
  incremental_place_amount BIGINT,
  pool_type TEXT,
  is_consolidated BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (event_timestamp);

-- Index for money_flow_history (automatically applied to all partitions)
CREATE INDEX IF NOT EXISTS idx_money_flow_entrant_time
  ON money_flow_history(entrant_id, event_timestamp DESC);

-- Initial partition for money_flow_history (current date)
DO $$
DECLARE
  partition_date DATE := CURRENT_DATE;
  partition_name TEXT := 'money_flow_history_' || TO_CHAR(partition_date, 'YYYY_MM_DD');
  start_range TEXT := partition_date::TEXT;
  end_range TEXT := (partition_date + INTERVAL '1 day')::DATE::TEXT;
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF money_flow_history FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    start_range,
    end_range
  );
END $$;

-- Table: odds_history (Partitioned by event_timestamp)
-- Stores time-series odds tracking data
CREATE TABLE IF NOT EXISTS odds_history (
  id BIGSERIAL,
  entrant_id TEXT NOT NULL REFERENCES entrants(entrant_id),
  odds NUMERIC(10,2),
  type TEXT,
  event_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (event_timestamp);

-- Index for odds_history (automatically applied to all partitions)
CREATE INDEX IF NOT EXISTS idx_odds_entrant_time
  ON odds_history(entrant_id, event_timestamp DESC);

-- Initial partition for odds_history (current date)
DO $$
DECLARE
  partition_date DATE := CURRENT_DATE;
  partition_name TEXT := 'odds_history_' || TO_CHAR(partition_date, 'YYYY_MM_DD');
  start_range TEXT := partition_date::TEXT;
  end_range TEXT := (partition_date + INTERVAL '1 day')::DATE::TEXT;
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF odds_history FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    start_range,
    end_range
  );
END $$;
