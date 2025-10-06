-- Enable PostgreSQL Extensions
-- This migration runs first (000) to set up required extensions

-- pgAgent: PostgreSQL job scheduling agent
-- Note: pgAgent must be installed at the server level first (already done in Story 1.1)
-- This statement enables the extension for use within the raceday database
CREATE EXTENSION IF NOT EXISTS pgagent;
