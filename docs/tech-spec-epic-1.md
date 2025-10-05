# Technical Specification: Epic 1 - Core Infrastructure Setup

**Epic:** Epic 1 - Core Infrastructure Setup
**Project:** raceday-postgresql
**Date:** 2025-10-05
**Author:** warrick
**Status:** Ready for Development

---

## Epic Overview

**Goal:** Establish foundational infrastructure for Node.js/PostgreSQL stack

**Scope:** Database schema, Docker configuration, environment validation, logging, connection pooling, health checks

**Success Criteria:**
- PostgreSQL 18 database running with complete schema
- Docker containers healthy and resource-limited
- Environment variables validated on startup
- Structured logging operational
- Connection pool configured (10 max)
- Health check endpoint returning 200 OK

**Dependencies:** None (foundational epic)

**Estimated Stories:** 8-10

---

## Architecture Context

**Reference Documents:**
- [solution-architecture.md](./solution-architecture.md) - Epic 1 mapping
- [architecture-specification.md](./architecture-specification.md) - Database Design (lines 249-456), Deployment (lines 689-807)
- [PRD Epic 1](./PRD-raceday-postgresql-2025-10-05.md) - Functional requirements FR006, NFR010, NFR014

---

## Database Schema Design

### Core Tables

#### 1. meetings

```sql
CREATE TABLE meetings (
  meeting_id TEXT PRIMARY KEY,
  meeting_name TEXT NOT NULL,
  country TEXT NOT NULL,
  race_type TEXT NOT NULL CHECK (race_type IN ('thoroughbred', 'harness')),
  date DATE NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common query pattern
CREATE INDEX idx_meetings_date_type ON meetings(date, race_type)
  WHERE status = 'active';

-- Auto-update trigger
CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Design Notes:**
- `meeting_id` format: `{country}-{venue}-{YYYYMMDD}` (e.g., `NZ-AUK-20251005`)
- `race_type` constrained to valid values (data integrity)
- Partial index on active meetings only (performance)

---

#### 2. races

```sql
CREATE TABLE races (
  race_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  race_number INTEGER NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  actual_start TIMESTAMPTZ,
  meeting_id TEXT NOT NULL REFERENCES meetings(meeting_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hot path: Get active races by time
CREATE INDEX idx_races_start_time ON races(start_time)
  WHERE status IN ('upcoming', 'in_progress');

-- Foreign key navigation
CREATE INDEX idx_races_meeting ON races(meeting_id);

-- Auto-update trigger
CREATE TRIGGER update_races_updated_at
  BEFORE UPDATE ON races
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Design Notes:**
- `race_id` format: `{meeting_id}-R{race_number}` (e.g., `NZ-AUK-20251005-R1`)
- Partial index excludes completed/abandoned races (reduces index size)
- Cascade delete removes races when meeting deleted

---

#### 3. entrants

```sql
CREATE TABLE entrants (
  entrant_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  runner_number INTEGER NOT NULL,
  win_odds NUMERIC(10,2),
  place_odds NUMERIC(10,2),
  hold_percentage NUMERIC(5,2),
  is_scratched BOOLEAN DEFAULT false,
  race_id TEXT NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hot path: Get entrants by race
CREATE INDEX idx_entrants_race ON entrants(race_id);

-- Partial index: Only non-scratched entrants
CREATE INDEX idx_active_entrants ON entrants(race_id)
  WHERE is_scratched = false;

-- Auto-update trigger
CREATE TRIGGER update_entrants_updated_at
  BEFORE UPDATE ON entrants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Design Notes:**
- `entrant_id` unique across all races (global identifier)
- Odds stored as NUMERIC for precision (avoid floating-point errors)
- Partial index optimizes queries excluding scratched horses

---

#### 4. race_pools

```sql
CREATE TABLE race_pools (
  race_id TEXT PRIMARY KEY REFERENCES races(race_id) ON DELETE CASCADE,
  win_pool_total NUMERIC(12,2),
  place_pool_total NUMERIC(12,2),
  quinella_pool_total NUMERIC(12,2),
  trifecta_pool_total NUMERIC(12,2),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);
```

**Design Notes:**
- One-to-one with races (PRIMARY KEY = race_id)
- Pool totals in currency (NUMERIC for precision)
- Updated on every polling cycle

---

### Partitioned Time-Series Tables

#### 5. money_flow_history

```sql
CREATE TABLE money_flow_history (
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

-- Create initial partition (today)
CREATE TABLE money_flow_history_2025_10_05
  PARTITION OF money_flow_history
  FOR VALUES FROM ('2025-10-05') TO ('2025-10-06');

-- Hot path: Latest money flow for entrant
CREATE INDEX idx_money_flow_entrant_time
  ON money_flow_history(entrant_id, event_timestamp DESC);
```

**Partitioning Strategy:**
- **Partition Key:** `event_timestamp` (when the event occurred)
- **Partition Size:** Daily (one partition per day)
- **Retention:** 30 days (older partitions detached and archived)
- **Naming:** `{table}_YYYY_MM_DD`

**Design Notes:**
- `id` BIGSERIAL not PRIMARY KEY (partitioning limitation)
- Index on (entrant_id, event_timestamp DESC) for latest queries
- Automated partition creation/archival (Stories 4.1-4.2)

---

#### 6. odds_history

```sql
CREATE TABLE odds_history (
  id BIGSERIAL,
  entrant_id TEXT NOT NULL REFERENCES entrants(entrant_id),
  odds NUMERIC(10,2),
  type TEXT,
  event_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (event_timestamp);

-- Create initial partition (today)
CREATE TABLE odds_history_2025_10_05
  PARTITION OF odds_history
  FOR VALUES FROM ('2025-10-05') TO ('2025-10-06');

-- Hot path: Latest odds for entrant
CREATE INDEX idx_odds_entrant_time
  ON odds_history(entrant_id, event_timestamp DESC);
```

**Partitioning Strategy:** Same as money_flow_history

---

### Database Functions

#### Auto-Update Timestamp Trigger

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';
```

**Usage:** Automatically updates `updated_at` on any UPDATE operation

---

## Docker Configuration

### docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:18-alpine
    container_name: raceday-postgres
    environment:
      POSTGRES_DB: raceday
      POSTGRES_USER: raceday
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./server/database/migrations:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U raceday"]
      interval: 10s
      timeout: 5s
      retries: 5

  server:
    build: ./server
    container_name: raceday-server
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      UV_THREADPOOL_SIZE: 8
      DATABASE_URL: postgresql://raceday:${DB_PASSWORD}@postgres:5432/raceday
      NZTAB_API_URL: ${NZTAB_API_URL}
      NZTAB_API_KEY: ${NZTAB_API_KEY}
      PORT: 3000
    cpus: '4.0'
    mem_limit: 4g
    ports:
      - "3000:3000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
```

**Configuration Notes:**
- PostgreSQL 18 Alpine (minimal footprint)
- Auto-run migrations on first start (`/docker-entrypoint-initdb.d`)
- Server waits for database health check before starting
- Resource limits: 4 CPU, 4GB RAM (matches architecture spec)
- Health checks for both services

---

### Dockerfile (Server)

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Production image
FROM node:22-alpine

WORKDIR /app

# Copy built artifacts and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start server
CMD ["node", "dist/index.js"]
```

**Build Strategy:**
- Multi-stage build (smaller final image)
- Node.js 22 Alpine (LTS + minimal)
- Production dependencies only
- Built TypeScript in dist/

---

## Environment Configuration

### Environment Variables Schema

```typescript
// ./server/src/shared/env.ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATABASE_URL: z.string().url(),
  NZTAB_API_URL: z.string().url(),
  NZTAB_API_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  UV_THREADPOOL_SIZE: z.coerce.number().int().positive().default(8),
  MAX_WORKER_THREADS: z.coerce.number().int().positive().default(3),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof EnvSchema>;

// Validate and export
export const env = EnvSchema.parse(process.env);
```

### .env.example

```bash
# Environment
NODE_ENV=development

# Database
DATABASE_URL=postgresql://raceday:password@localhost:5432/raceday

# NZ TAB API
NZTAB_API_URL=https://api.tab.co.nz
NZTAB_API_KEY=your-api-key-here

# Server
PORT=3000
LOG_LEVEL=info

# Performance Tuning
UV_THREADPOOL_SIZE=8
MAX_WORKER_THREADS=3
DB_POOL_MAX=10
```

**Validation Strategy:**
- All variables validated on startup (fail fast)
- Type coercion for numeric values
- URL validation for endpoints
- Clear error messages on validation failure

---

## Logging Infrastructure

### Pino Logger Configuration

```typescript
// ./server/src/shared/logger.ts
import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: env.NODE_ENV,
  },
});

// Usage examples
logger.info({ raceId: 'NZ-AUK-20251005-R1', duration: 1200 }, 'Race processed');
logger.warn({ raceId: 'R2', duration: 18000 }, 'Slow processing detected');
logger.error({ err, raceId: 'R3' }, 'Processing failed');
```

**Log Structure:**
```json
{
  "level": "info",
  "time": "2025-10-05T12:34:56.789Z",
  "env": "production",
  "raceId": "NZ-AUK-20251005-R1",
  "duration": 1200,
  "msg": "Race processed"
}
```

**Logging Standards:**
- Structured JSON only (no plain text)
- ISO 8601 timestamps
- Contextual fields (raceId, duration, etc.)
- No console.log in production code (ESLint rule)

---

## PostgreSQL Connection Pool

### Connection Pool Configuration

```typescript
// ./server/src/database/pool.ts
import { Pool } from 'pg';
import { env } from '../shared/env';
import { logger } from '../shared/logger';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,              // 10 connections
  min: 2,                             // Min idle
  idleTimeoutMillis: 30000,           // Close idle after 30s
  connectionTimeoutMillis: 2000,      // Fail fast if pool exhausted
});

// Log pool configuration on startup
logger.info({
  max: pool.options.max,
  min: pool.options.min,
  idleTimeout: pool.options.idleTimeoutMillis,
  connectionTimeout: pool.options.connectionTimeoutMillis,
}, 'Database connection pool configured');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing database pool');
  await pool.end();
  process.exit(0);
});
```

**Pool Sizing Rationale:**
- **Max 10:** 1 scheduler + 5 concurrent writes + 3 API queries + 1 spare
- **Min 2:** Keep connections warm
- **Idle timeout 30s:** Release unused connections
- **Connection timeout 2s:** Fail fast on saturation (don't wait indefinitely)

---

## Health Check Endpoint

### Implementation

```typescript
// ./server/src/api/routes/health.ts
import { Router } from 'express';
import { pool } from '../../database/pool';
import { logger } from '../../shared/logger';

const router = Router();

router.get('/health', async (req, res) => {
  try {
    // Check database connectivity
    await pool.query('SELECT 1');

    // TODO: Check worker pool health (Epic 2)
    const workersHealthy = true;

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      workers: workersHealthy ? 'operational' : 'degraded',
    });
  } catch (error) {
    logger.error({ err: error }, 'Health check failed');
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
```

### Health Check Response

**Healthy (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-05T12:34:56.789Z",
  "database": "connected",
  "workers": "operational"
}
```

**Unhealthy (503 Service Unavailable):**
```json
{
  "status": "unhealthy",
  "timestamp": "2025-10-05T12:34:56.789Z",
  "error": "Connection timeout"
}
```

---

## Migration Scripts Organization

### Directory Structure

```
server/database/migrations/
├── 001_initial_schema.sql        # Core tables
├── 002_partitioned_tables.sql    # Time-series tables with initial partitions
├── 003_indexes.sql                # All indexes
├── 004_triggers.sql               # Auto-update triggers
└── 005_functions.sql              # Partition management functions (Epic 4)
```

### Migration Execution

**Automatic (Docker Compose):**
- Files in `./server/database/migrations/` auto-run on first PostgreSQL start
- Order determined by filename (001, 002, 003...)

**Manual (Development):**
```bash
psql $DATABASE_URL -f server/database/migrations/001_initial_schema.sql
psql $DATABASE_URL -f server/database/migrations/002_partitioned_tables.sql
# etc.
```

---

## Testing Strategy

### Unit Tests

```typescript
// ./server/tests/unit/env.test.ts
import { describe, it, expect } from '@jest/globals';

describe('Environment Validation', () => {
  it('should validate valid environment variables', () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.NODE_ENV = 'test';
    // ... validate all required vars
    expect(() => EnvSchema.parse(process.env)).not.toThrow();
  });

  it('should reject invalid DATABASE_URL', () => {
    process.env.DATABASE_URL = 'not-a-url';
    expect(() => EnvSchema.parse(process.env)).toThrow();
  });
});
```

### Integration Tests

```typescript
// ./server/tests/integration/database.test.ts
describe('Database Connection', () => {
  it('should connect to PostgreSQL', async () => {
    const result = await pool.query('SELECT 1 as value');
    expect(result.rows[0].value).toBe(1);
  });

  it('should create and query meetings table', async () => {
    await pool.query(`
      INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
      VALUES ('TEST-01', 'Test Meeting', 'NZ', 'thoroughbred', '2025-10-05', 'active')
    `);

    const result = await pool.query('SELECT * FROM meetings WHERE meeting_id = $1', ['TEST-01']);
    expect(result.rows[0].meeting_name).toBe('Test Meeting');
  });
});
```

---

## Acceptance Criteria Checklist

### Story 1.1-1.3: Database Schema ✅
- [x] PostgreSQL 18 container running
- [x] Core tables created (meetings, races, entrants, race_pools)
- [x] Partitioned tables created (money_flow_history, odds_history)
- [x] Initial partitions created for current date
- [x] Foreign keys enforced
- [x] CHECK constraints applied

### Story 1.4: Indexes ✅
- [x] All hot-path indexes created
- [x] Partial indexes on filtered queries
- [x] Index on partitioned tables

### Story 1.5: Docker Configuration ✅
- [x] Multi-stage Dockerfile
- [x] docker-compose.yml with PostgreSQL + server
- [x] Resource limits (4 CPU, 4GB RAM)
- [x] Health checks configured

### Story 1.6: Environment Validation ✅
- [x] Zod schema defined
- [x] All variables validated on startup
- [x] Type coercion for numeric values
- [x] Clear error messages

### Story 1.7: Logging ✅
- [x] Pino logger configured
- [x] Structured JSON output
- [x] ISO 8601 timestamps
- [x] Logger exported for use

### Story 1.8: Connection Pool ✅
- [x] Pool configured (max 10, min 2)
- [x] Timeouts set (idle 30s, connection 2s)
- [x] Graceful shutdown on SIGTERM

### Story 1.9: Health Check ✅
- [x] /health endpoint implemented
- [x] Database connectivity tested
- [x] 200 OK if healthy, 503 if unhealthy
- [x] JSON response with status details

### Story 1.10: Documentation ✅
- [x] Setup instructions in developer-quick-start.md
- [x] .env.example provided
- [x] Common commands documented

---

## Implementation Notes

### Development Order

1. **Database First:** Create migrations (001-004)
2. **Docker Second:** Configure docker-compose.yml + Dockerfile
3. **Environment Third:** Implement env.ts with Zod validation
4. **Logging Fourth:** Configure logger.ts
5. **Connection Pool Fifth:** Implement pool.ts
6. **Health Check Sixth:** Implement /health endpoint
7. **Testing Last:** Write unit + integration tests

### Common Issues & Solutions

**Issue:** Partition already exists error
**Solution:** Use `CREATE TABLE IF NOT EXISTS` in partition creation

**Issue:** Connection pool exhausted
**Solution:** Increase `max` or decrease `connectionTimeoutMillis`

**Issue:** Docker container won't start
**Solution:** Check health check logs, ensure PostgreSQL ready before server starts

---

## Document Status

- [x] Database schema designed
- [x] Docker configuration specified
- [x] Environment validation implemented
- [x] Logging infrastructure configured
- [x] Connection pool designed
- [x] Health check endpoint specified
- [x] Testing strategy defined
- [x] Acceptance criteria documented
- [x] Ready for development (Epic 1)

---

**Next Epic:** [tech-spec-epic-2.md](./tech-spec-epic-2.md) - High-Performance Data Pipeline
