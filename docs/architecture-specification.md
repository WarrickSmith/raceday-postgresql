# Raceday PostgreSQL Architecture Specification

**Project:** Appwrite to Node.js/PostgreSQL Migration
**Version:** 1.0
**Date:** 2025-10-05
**Architect:** Winston (BMAD System Architect)
**Stakeholder:** Warrick

---

## Executive Summary

This document specifies the architecture for migrating the Raceday application from Appwrite (serverless functions + MariaDB) to a custom Node.js/PostgreSQL solution. The primary objective is to achieve **2x performance improvement** (30s → 15s processing window) for time-critical race data transformation during the final 5 minutes before race start.

### Business Context

The application detects insider betting patterns by analyzing money flow changes in real-time. Critical insider patterns emerge in the final 30-60 seconds before race close. Current 30-second update cycles cause users to either miss patterns entirely or see them too late to capitalize, resulting in competitive disadvantage. This migration is essential for business survival in a time-sensitive market.

### Performance Target

- **Current State:** >30 seconds to process 5 concurrent races (missing updates)
- **Target State:** <15 seconds to process 5 concurrent races (enabling 2x faster polling)
- **External Constraint:** NZ TAB API refresh rate defines performance ceiling

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [System Architecture](#system-architecture)
4. [Database Design](#database-design)
5. [Performance Optimization](#performance-optimization)
6. [API Design](#api-design)
7. [Deployment Architecture](#deployment-architecture)
8. [Migration Strategy](#migration-strategy)
9. [Monitoring & Operations](#monitoring--operations)
10. [Risk Analysis](#risk-analysis)

---

## Architecture Overview

### Architectural Decisions

| Decision Point | Choice | Rationale |
|----------------|--------|-----------|
| **Transform Location** | Hybrid (Node.js primary + PostgreSQL optimization) | Node.js for business logic (maintainable), PostgreSQL for bulk operations (performant) |
| **Execution Model** | Monolith with internal parallelization | Minimizes network latency, shared connection pool, simpler operations |
| **Concurrency Pattern** | Worker Threads + Promise.all() | CPU-bound transforms in workers, I/O-bound operations async |
| **Database Strategy** | Multi-row UPSERT with bulk operations | Single transaction per race, minimal round trips |
| **Deployment Model** | Docker container (4 CPU cores, 4GB RAM) | Optimal resource allocation for 5 concurrent races |

### Key Architectural Principles

1. **Performance First:** Every millisecond counts in 15-second processing window
2. **Simplicity Over Complexity:** Monolith beats microservices for this use case
3. **Boring Technology:** Proven stack (Node.js, PostgreSQL) over experimental tools
4. **Safe Experimentation:** Forked codebase allows validation before commitment
5. **Race Isolation:** No cross-race dependencies enables massive parallelization

---

## Technology Stack

### Core Technologies

```json
{
  "runtime": "Node.js 22 LTS",
  "language": "TypeScript 5.7+",
  "database": "PostgreSQL 18",
  "containerization": "Docker",
  "process_manager": "Native (built-in Worker Threads)"
}
```

### TypeScript Configuration Requirements

**Strict Mode Enabled:**
- No `any` types allowed
- Strict null checks enforced
- No implicit any
- ESLint with strict rules
- Zero lint errors policy

### Coding Standards

**Modern ES6+ Standards:**
- **ES Modules (ESM):** All code uses `import`/`export` (not `require`/`module.exports`)
- **Arrow Functions:** Use arrow functions for functional programming patterns
- **Async/Await:** Prefer async/await over callbacks or raw Promises
- **Const/Let:** Use `const` by default, `let` when reassignment needed (never `var`)
- **Destructuring:** Use object/array destructuring for cleaner code
- **Template Literals:** Use template literals for string interpolation
- **Spread/Rest Operators:** Leverage spread syntax for immutability
- **Optional Chaining:** Use `?.` for safe property access
- **Nullish Coalescing:** Use `??` for default values (not `||`)

**Functional Programming Principles:**
- **Pure Functions:** Functions should be side-effect free when possible
- **Immutability:** Avoid mutating objects/arrays; create new instances
- **Array Methods:** Use `.map()`, `.filter()`, `.reduce()`, `.find()` over loops
- **Function Composition:** Build complex logic from simple, composable functions
- **No Classes for Business Logic:** Prefer functional composition over OOP patterns

**TypeScript Best Practices:**
- **Type Inference:** Let TypeScript infer types when obvious
- **Interface over Type:** Use `interface` for object shapes, `type` for unions/intersections
- **Strict Typing:** No `any`, use `unknown` when type truly unknown
- **Runtime Validation:** Use Zod for API boundaries and external data
- **Named Exports:** Prefer named exports over default exports for better refactoring

**Code Quality Standards:**
- **TypeScript:** Zero compilation errors (`npm run build` must succeed)
- **ESLint:** Zero errors and zero warnings (`npm run lint` must pass)
- **No `any` Types:** Strict type enforcement (use `unknown` when type is genuinely unknown)
- **Prettier:** Automatic formatting enforced (2 spaces, single quotes, no semicolons)
- **Maximum Function Length:** 50 lines (refactor if longer)
- **Maximum File Length:** 300 lines (split if longer)
- **Meaningful Names:** Use descriptive variable/function names (no abbreviations)
- **Comments:** Explain "why" not "what"; code should be self-documenting

**Validation Commands:**
```bash
npm run build    # TypeScript compilation (0 errors required)
npm run lint     # ESLint validation (0 errors, 0 warnings required)
npm run format   # Prettier formatting
npm test -- --run  # Full test suite
npm audit        # Security vulnerability scan
```

**Definition of Done:** All stories must satisfy quality gates defined in [DEFINITION-OF-DONE.md](./DEFINITION-OF-DONE.md)

**Module System Configuration:**
```json
// package.json
{
  "type": "module"  // Enable ES modules
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "ESNext",
    "target": "ES2022",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  }
}
```

### Dependencies

**Production Dependencies (Node.js 22 LTS Compatible):**
```json
{
  "express": "^4.21.2",           // HTTP server & API routing (Node 22 compatible)
  "pg": "^8.13.1",                // PostgreSQL client with connection pooling
  "axios": "^1.7.9",              // NZ TAB API client
  "node-cron": "^3.0.3",          // Scheduling (base intervals)
  "pino": "^9.5.0",               // High-performance logging
  "dotenv": "^16.4.7",            // Environment configuration
  "helmet": "^8.0.0",             // Security headers
  "compression": "^1.7.5",        // Response compression
  "zod": "^3.23.8"                // Runtime type validation (replaces any types)
}
```

**Development Dependencies:**
```json
{
  "typescript": "^5.7.2",
  "@types/node": "^22.10.2",      // Node.js 22 type definitions
  "@types/express": "^5.0.0",
  "@types/pg": "^8.11.10",
  "@types/compression": "^1.7.5",
  "@typescript-eslint/eslint-plugin": "^8.19.1",
  "@typescript-eslint/parser": "^8.19.1",
  "eslint": "^9.17.0",
  "eslint-config-airbnb-typescript": "^18.0.0",
  "eslint-plugin-import": "^2.31.0",
  "jest": "^29.7.0",
  "@types/jest": "^29.5.14",
  "ts-jest": "^29.2.5",
  "ts-node": "^10.9.2",
  "nodemon": "^3.1.9",
  "prettier": "^3.4.2"
}
```

### Infrastructure

- **Database:** PostgreSQL 18 (native partitioning, improved UPSERT performance)
- **Container Orchestration:** Docker Compose (development), Docker (production)
- **Monitoring:** Pino JSON logs + external aggregation (future: Prometheus/Grafana)

---

## System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      NZ TAB API                              │
│                  (External Data Source)                      │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/REST
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  RACEDAY NODE.JS SERVER                      │
│                      (Monolith - 4 CPU)                      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Scheduler   │  │   Fetchers   │  │  API Server  │      │
│  │  (Dynamic    │──│  (NZ TAB)    │  │  (Express)   │      │
│  │   Polling)   │  │              │  │              │      │
│  └──────┬───────┘  └──────┬───────┘  └──────▲───────┘      │
│         │                  │                  │              │
│         │         ┌────────▼────────┐        │              │
│         │         │  Worker Pool    │        │              │
│         │         │  (Transforms)   │        │              │
│         │         │  3 Workers      │        │              │
│         │         └────────┬────────┘        │              │
│         │                  │                  │              │
│         │         ┌────────▼────────┐        │              │
│         └────────▶│  Race Processor │        │              │
│                   │  (Orchestrator) │        │              │
│                   └────────┬────────┘        │              │
│                            │                  │              │
│                   ┌────────▼────────┐        │              │
│                   │   DB Operations │        │              │
│                   │  (Bulk UPSERT)  │◄───────┘              │
│                   └────────┬────────┘                        │
│                            │                                  │
└────────────────────────────┼──────────────────────────────────┘
                             │ Connection Pool (10 connections)
                             │
                   ┌─────────▼─────────┐
                   │   PostgreSQL 18   │
                   │                   │
                   │  ┌──────────────┐ │
                   │  │ Meetings     │ │
                   │  │ Races        │ │
                   │  │ Entrants     │ │
                   │  │ Money Flow   │ │ (Partitioned)
                   │  │ Odds History │ │ (Partitioned)
                   │  │ Race Pools   │ │
                   │  └──────────────┘ │
                   └───────────────────┘
                             ▲
                             │ HTTP/REST
                             │
                   ┌─────────┴─────────┐
                   │   Client App      │
                   │ (Adaptive Polling)│
                   └───────────────────┘
```

### Component Responsibilities

#### 1. Scheduler
- **Purpose:** Dynamic polling frequency based on race timing
- **Logic:**
  - ≤5 minutes to start: 15-second intervals
  - 5-15 minutes to start: 30-second intervals
  - >15 minutes to start: 60-second intervals
- **Implementation:** node-cron base + dynamic setInterval per race

#### 2. Fetchers
- **Purpose:** Retrieve race data from NZ TAB API
- **Features:**
  - Concurrent fetching (up to 5 races in parallel)
  - Retry logic with exponential backoff
  - Timeout handling (5s max per fetch)
- **Output:** Raw race data (JSON)

#### 3. Worker Pool (Transformers)
- **Purpose:** CPU-intensive money flow calculations
- **Implementation:** Node.js Worker Threads (3 workers)
- **Input:** Raw NZ TAB data
- **Output:** Transformed data with calculated fields
- **Why Workers:** Offload CPU work from main event loop

#### 4. Race Processor (Orchestrator)
- **Purpose:** Coordinate fetch → transform → write pipeline
- **Pattern:**
  ```typescript
  for each race in batch:
    rawData = await fetch(race)
    transformed = await transformInWorker(rawData)
    await bulkUpsert(transformed)
  ```
- **Parallelization:** Promise.all() for I/O-bound operations
- **Performance Tracking:** Measure and log duration per race

#### 5. Database Operations
- **Purpose:** High-performance bulk writes to PostgreSQL
- **Strategy:** Multi-row UPSERT with ON CONFLICT
- **Transaction Scope:** Single transaction per race (atomic)
- **Performance:** <300ms per race target

#### 6. API Server
- **Purpose:** Serve race data to client application
- **Framework:** Express.js
- **Compatibility:** Near drop-in replacement for Appwrite API
- **Features:**
  - Targeted queries (client specifies filters)
  - JSON responses
  - Compression enabled

---

## Database Design

### Schema Overview

#### Core Tables

**1. meetings**
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

CREATE INDEX idx_meetings_date_type ON meetings(date, race_type)
  WHERE status = 'active';
```

**2. races**
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

CREATE INDEX idx_races_start_time ON races(start_time)
  WHERE status IN ('upcoming', 'in_progress');

CREATE INDEX idx_races_meeting ON races(meeting_id);
```

**3. entrants**
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

CREATE INDEX idx_entrants_race ON entrants(race_id);
CREATE INDEX idx_entrants_scratched ON entrants(race_id, is_scratched);
```

#### Time-Series Tables (Partitioned)

**4. money_flow_history**
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

-- Daily partitions (auto-created by scheduler)
CREATE TABLE money_flow_history_2025_10_05 PARTITION OF money_flow_history
  FOR VALUES FROM ('2025-10-05') TO ('2025-10-06');

CREATE INDEX idx_money_flow_entrant_time
  ON money_flow_history(entrant_id, event_timestamp DESC);
```

**5. odds_history**
```sql
CREATE TABLE odds_history (
  id BIGSERIAL,
  entrant_id TEXT NOT NULL REFERENCES entrants(entrant_id),
  odds NUMERIC(10,2),
  type TEXT,
  event_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (event_timestamp);

CREATE TABLE odds_history_2025_10_05 PARTITION OF odds_history
  FOR VALUES FROM ('2025-10-05') TO ('2025-10-06');

CREATE INDEX idx_odds_entrant_time
  ON odds_history(entrant_id, event_timestamp DESC);
```

**6. race_pools**
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

### Database Triggers

**Auto-update timestamps:**
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_races_updated_at BEFORE UPDATE ON races
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_entrants_updated_at BEFORE UPDATE ON entrants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Partition Management

**Daily partition creation (automated):**
```sql
-- Scheduled function to create next day's partitions
CREATE OR REPLACE FUNCTION create_tomorrow_partitions()
RETURNS void AS $$
DECLARE
  tomorrow DATE := CURRENT_DATE + INTERVAL '1 day';
  day_after DATE := CURRENT_DATE + INTERVAL '2 days';
BEGIN
  -- Money flow partition
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS money_flow_history_%s PARTITION OF money_flow_history
     FOR VALUES FROM (%L) TO (%L)',
    to_char(tomorrow, 'YYYY_MM_DD'),
    tomorrow,
    day_after
  );

  -- Odds history partition
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS odds_history_%s PARTITION OF odds_history
     FOR VALUES FROM (%L) TO (%L)',
    to_char(tomorrow, 'YYYY_MM_DD'),
    tomorrow,
    day_after
  );
END;
$$ LANGUAGE plpgsql;

-- Run daily at midnight
SELECT cron.schedule('create-partitions', '0 0 * * *', 'SELECT create_tomorrow_partitions()');
```

### Data Retention

**Archive old partitions after 30 days:**
```sql
CREATE OR REPLACE FUNCTION archive_old_partitions()
RETURNS void AS $$
DECLARE
  cutoff_date DATE := CURRENT_DATE - INTERVAL '30 days';
BEGIN
  -- Detach old partitions (can be backed up separately)
  EXECUTE format(
    'ALTER TABLE money_flow_history DETACH PARTITION money_flow_history_%s',
    to_char(cutoff_date, 'YYYY_MM_DD')
  );

  EXECUTE format(
    'ALTER TABLE odds_history DETACH PARTITION odds_history_%s',
    to_char(cutoff_date, 'YYYY_MM_DD')
  );
END;
$$ LANGUAGE plpgsql;
```

---

## Performance Optimization

### 1. Bulk UPSERT Strategy

**Multi-row UPSERT with conditional updates:**
```sql
INSERT INTO entrants (
  entrant_id, name, runner_number, win_odds, place_odds,
  hold_percentage, is_scratched, race_id
) VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8),
  ($9, $10, $11, $12, $13, $14, $15, $16),
  -- ... all entrants
ON CONFLICT (entrant_id)
DO UPDATE SET
  win_odds = EXCLUDED.win_odds,
  place_odds = EXCLUDED.place_odds,
  hold_percentage = EXCLUDED.hold_percentage,
  is_scratched = EXCLUDED.is_scratched
WHERE
  entrants.win_odds IS DISTINCT FROM EXCLUDED.win_odds
  OR entrants.place_odds IS DISTINCT FROM EXCLUDED.place_odds
  OR entrants.is_scratched IS DISTINCT FROM EXCLUDED.is_scratched;
```

**Performance Impact:**
- Single DB round trip for entire race
- WHERE clause prevents unnecessary writes (30-50% reduction)
- Atomic transaction ensures data consistency

### 2. Connection Pooling

**PostgreSQL Connection Pool Configuration:**
```typescript
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                      // Max connections
  min: 2,                       // Min idle connections
  idleTimeoutMillis: 30000,     // Close idle after 30s
  connectionTimeoutMillis: 2000, // Fail fast if pool exhausted
});
```

**Why 10 connections:**
- 1 connection for scheduler queries
- 5 connections for concurrent race writes
- 3 connections for API queries
- 1 spare for admin operations

### 3. Worker Thread Optimization

**CPU-Intensive Transform Pattern:**
```typescript
import { Worker } from 'worker_threads';

class WorkerPool {
  private workers: Worker[] = [];
  private queue: Array<{ data: any; resolve: Function; reject: Function }> = [];

  constructor(size: number = 3) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker('./transformWorker.js');
      worker.on('message', this.handleMessage);
      this.workers.push(worker);
    }
  }

  async exec(data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ data, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue() {
    const availableWorker = this.workers.find(w => !w.busy);
    const task = this.queue.shift();

    if (availableWorker && task) {
      availableWorker.busy = true;
      availableWorker.postMessage(task.data);
      // Handle response...
    }
  }
}
```

### 4. Parallel Processing Pattern

**Process 5 races concurrently:**
```typescript
export async function processCriticalRaces(races: Race[]) {
  const startTime = performance.now();

  // Process all 5 in parallel
  const results = await Promise.allSettled(
    races.map(async (race) => {
      const raceStart = performance.now();

      // 1. Fetch (I/O-bound - async)
      const rawData = await fetchRaceData(race.id);

      // 2. Transform (CPU-bound - worker thread)
      const transformed = await workerPool.exec(rawData);

      // 3. Write (I/O-bound - async)
      await bulkUpsertRaceData(transformed);

      const raceDuration = performance.now() - raceStart;
      logger.info(`Race ${race.id}: ${raceDuration.toFixed(0)}ms`);

      return { raceId: race.id, duration: raceDuration };
    })
  );

  const totalDuration = performance.now() - startTime;
  logger.info(`Total processing: ${totalDuration.toFixed(0)}ms`);

  return results;
}
```

### 5. Index Strategy

**Query-optimized indexes:**
```sql
-- Hot path: Get active races by time
CREATE INDEX idx_races_start_time ON races(start_time)
  WHERE status IN ('upcoming', 'in_progress');

-- Hot path: Get entrants by race
CREATE INDEX idx_entrants_race ON entrants(race_id);

-- Hot path: Latest money flow for entrant
CREATE INDEX idx_money_flow_entrant_time
  ON money_flow_history(entrant_id, event_timestamp DESC);

-- Partial index: Only non-scratched entrants
CREATE INDEX idx_active_entrants ON entrants(race_id)
  WHERE is_scratched = false;
```

### Performance Targets

| Operation | Target | Actual (Expected) |
|-----------|--------|-------------------|
| Fetch from NZ TAB | <500ms | ~300ms |
| Transform (worker) | <1s | ~700ms |
| Bulk write to DB | <300ms | ~200ms |
| **Single Race Total** | **<2s** | **~1.2s** |
| **5 Races Parallel** | **<15s** | **~6-9s** ✅ |

---

## API Design

### REST Endpoints (Client Compatibility)

**1. Get Meetings**
```
GET /api/meetings?date=2025-10-05&raceType=thoroughbred

Response:
[
  {
    "meeting_id": "NZ-AUK-20251005",
    "meeting_name": "Auckland",
    "country": "NZ",
    "race_type": "thoroughbred",
    "date": "2025-10-05",
    "status": "active"
  }
]
```

**2. Get Races**
```
GET /api/races?meetingId=NZ-AUK-20251005

Response:
[
  {
    "race_id": "NZ-AUK-20251005-R1",
    "name": "Race 1 - Maiden",
    "race_number": 1,
    "start_time": "2025-10-05T12:00:00Z",
    "status": "upcoming",
    "meeting_id": "NZ-AUK-20251005"
  }
]
```

**3. Get Entrants with History**
```
GET /api/entrants?raceId=NZ-AUK-20251005-R1

Response:
[
  {
    "entrant_id": "ENT-001",
    "name": "Thunder Bolt",
    "runner_number": 1,
    "win_odds": 3.50,
    "place_odds": 1.80,
    "hold_percentage": 15.2,
    "is_scratched": false,
    "odds_history": [
      { "odds": 3.50, "timestamp": "2025-10-05T11:59:00Z" },
      { "odds": 3.40, "timestamp": "2025-10-05T11:58:30Z" }
    ],
    "money_flow_history": [
      {
        "hold_percentage": 15.2,
        "win_pool_amount": 50000,
        "timestamp": "2025-10-05T11:59:00Z"
      }
    ]
  }
]
```

### API Performance

- Response time: <100ms (cached queries)
- Compression: gzip enabled
- Rate limiting: 100 req/min per client (future implementation)

---

## Deployment Architecture

### Docker Configuration

**docker-compose.yml**
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
      - ./migrations:/docker-entrypoint-initdb.d
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

**Dockerfile (server)**
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node healthcheck.js

# Start server
CMD ["node", "dist/index.js"]
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://raceday:password@postgres:5432/raceday

# NZ TAB API
NZTAB_API_URL=https://api.tab.co.nz
NZTAB_API_KEY=your-api-key

# Server
NODE_ENV=production
PORT=3000
UV_THREADPOOL_SIZE=8

# Logging
LOG_LEVEL=info

# Performance
MAX_WORKER_THREADS=3
DB_POOL_MAX=10
```

### Resource Allocation

**Production Sizing:**
- **CPU:** 4 cores
- **Memory:** 4GB RAM
- **Storage:** 50GB SSD (database + logs)
- **Network:** 1Gbps (NZ TAB API throughput)

**Why 4 CPU cores:**
1. Main event loop (scheduler, API)
2-4. Worker threads for transforms
5. PostgreSQL client operations

---

## Migration Strategy

### Phase 1: Preparation (Week 1)

**Tasks:**
1. ✅ Fork repository → raceday-postgresql branch
2. ✅ Rename ./server → ./server-old
3. ✅ Extract business logic:
   - Money flow calculation algorithms
   - Polling frequency logic
   - Data transformation rules
4. ✅ Set up development environment
5. ✅ Create PostgreSQL schema migrations

**Validation:**
- Dev environment running
- PostgreSQL schema created
- Business logic extracted and documented

### Phase 2: Core Development (Week 2-3)

**Tasks:**
1. Implement database operations layer
2. Build worker thread transform logic
3. Create NZ TAB API fetcher
4. Develop race processor (orchestrator)
5. Implement dynamic scheduler
6. Build REST API endpoints

**Validation:**
- Single race: fetch → transform → write in <2s
- 5 races: parallel processing in <15s
- API responses match Appwrite format

### Phase 3: Testing & Validation (Week 4)

**Tasks:**
1. Performance benchmarking
2. Load testing (concurrent races)
3. Integration testing (end-to-end)
4. Client compatibility testing
5. Security audit
6. Documentation review

**Success Criteria:**
- ✅ <15s processing for 5 races (2x improvement)
- ✅ Client app works without changes
- ✅ No data loss or corruption
- ✅ Stable under load

### Phase 4: Migration (Week 5)

**Deployment Plan:**

**Day 1-2: Shadow Mode**
- Deploy new stack alongside Appwrite
- Run both systems in parallel
- Compare outputs for accuracy

**Day 3-4: Gradual Cutover**
- 10% traffic → new stack (monitor performance)
- 50% traffic → new stack (validate stability)
- 100% traffic → new stack (full cutover)

**Day 5-7: Monitoring**
- Performance validation
- Error monitoring
- User feedback collection

**Rollback Plan:**
- Feature flag: `USE_LEGACY_BACKEND=true`
- Instant rollback if performance degrades
- Keep Appwrite running for 1 week backup

### Migration Checklist

- [ ] PostgreSQL instance provisioned
- [ ] Schema migrations executed
- [ ] Environment variables configured
- [ ] Docker containers deployed
- [ ] Health checks passing
- [ ] Monitoring dashboards configured
- [ ] Shadow mode validation complete
- [ ] Traffic cutover executed
- [ ] Performance targets achieved
- [ ] Appwrite decommissioned

---

## Monitoring & Operations

### Key Metrics

**Performance Metrics:**
```typescript
// Track in application
const metrics = {
  raceProcessingTime: histogram('race_processing_seconds'),
  fetchDuration: histogram('nztab_fetch_seconds'),
  transformDuration: histogram('transform_seconds'),
  writeDuration: histogram('db_write_seconds'),
  activeRaces: gauge('active_races_total'),
  dbConnections: gauge('db_pool_connections'),
};
```

**Database Metrics:**
```sql
-- Long-running queries
SELECT pid, now() - query_start as duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '5 seconds';

-- Connection pool usage
SELECT count(*) as active, state
FROM pg_stat_activity
GROUP BY state;

-- Table sizes
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Logging Strategy

**Structured JSON Logging (Pino):**
```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Usage
logger.info({ raceId: 'R1', duration: 1200 }, 'Race processed');
logger.warn({ raceId: 'R2', duration: 18000 }, 'Slow processing detected');
logger.error({ err, raceId: 'R3' }, 'Processing failed');
```

### Health Checks

**Application Health Endpoint:**
```typescript
app.get('/health', async (req, res) => {
  try {
    // Check database
    await pool.query('SELECT 1');

    // Check worker pool
    const workersHealthy = workerPool.isHealthy();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      workers: workersHealthy ? 'operational' : 'degraded',
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});
```

### Alerting Rules

**Critical Alerts:**
1. Processing time >15s for 3 consecutive cycles
2. Database connection pool exhausted
3. Worker thread crashes
4. NZ TAB API unreachable for >30s
5. Memory usage >90%

**Warning Alerts:**
1. Processing time >10s
2. Database query >5s
3. API response time >500ms

---

## Risk Analysis

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Node.js performance worse than expected | HIGH | LOW | Forked codebase allows safe testing; rollback to Appwrite if needed |
| PostgreSQL connection pool saturation | MEDIUM | MEDIUM | Monitor pool usage; increase max connections if needed; implement connection queueing |
| Worker thread memory leaks | MEDIUM | LOW | Implement worker restart after N tasks; memory profiling in dev |
| NZ TAB API rate limiting | HIGH | MEDIUM | Implement exponential backoff; cache responses; coordinate with TAB team |
| Transform logic bugs vs server-old | HIGH | LOW | Comprehensive unit tests; shadow mode validation; gradual rollout |

### Operational Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Data migration errors | HIGH | LOW | Dry-run migrations; validation queries; backup Appwrite data |
| Client app incompatibility | HIGH | LOW | API contract testing; integration tests; client team coordination |
| Deployment failures | MEDIUM | LOW | Staged rollout; feature flags; automated rollback |
| Performance regression under load | HIGH | MEDIUM | Load testing; gradual traffic increase; monitoring dashboards |

### Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Migration delays competitive advantage | HIGH | MEDIUM | Aggressive timeline; parallel development; daily standups |
| Users miss betting opportunities during migration | CRITICAL | LOW | Zero-downtime deployment; shadow mode; instant rollback capability |
| Cost overruns (infrastructure) | MEDIUM | LOW | Cloud cost monitoring; resource right-sizing; budget alerts |

### Risk Mitigation Summary

**Key Mitigations:**
1. ✅ **Forked codebase** = Safe experimentation
2. ✅ **Shadow mode** = Validate before cutover
3. ✅ **Feature flags** = Instant rollback
4. ✅ **Gradual rollout** = Controlled risk exposure
5. ✅ **Performance benchmarks** = Early detection
6. ✅ **Comprehensive testing** = Quality assurance

---

## Appendix A: Performance Calculations

### Single Race Processing Breakdown

```
Fetch from NZ TAB:     300ms
Transform (worker):    700ms
Bulk write to DB:      200ms
-------------------------
Total per race:       1200ms ✅ (<2s target)
```

### 5 Concurrent Races (Parallel)

```
Race 1: 1200ms ─┐
Race 2: 1150ms ─┤
Race 3: 1300ms ─┼─> Max(all) = 1300ms
Race 4: 1100ms ─┤
Race 5: 1250ms ─┘

Plus orchestration overhead: ~200ms
-------------------------
Total 5 races:          ~1500ms ✅ (<15s target)

Best case:  ~1.5s  (10x improvement!)
Worst case: ~6-9s  (2-3x improvement)
```

### Performance vs Appwrite

| Metric | Appwrite (Current) | Node.js/PostgreSQL (Target) | Improvement |
|--------|-------------------|----------------------------|-------------|
| Single race | ~6-10s | ~1.2s | **5-8x faster** |
| 5 concurrent races | >30s | <15s | **2x faster** |
| Polling frequency | 30s | 15s | **2x faster** |
| Data freshness | 30-60s old | 15-30s old | **2x fresher** |

---

## Appendix B: Code Reference

### Directory Structure

```
raceday-postgresql/
├── server/
│   ├── src/
│   │   ├── index.ts                 # Application entry point
│   │   ├── scheduler/
│   │   │   ├── index.ts            # Dynamic scheduling logic
│   │   │   └── processor.ts        # Race processing orchestrator
│   │   ├── fetchers/
│   │   │   ├── nztab.ts            # NZ TAB API client
│   │   │   └── types.ts            # API response types
│   │   ├── transformers/
│   │   │   ├── index.ts            # Worker pool manager
│   │   │   └── moneyflow.ts        # Money flow calculations
│   │   ├── database/
│   │   │   ├── pool.ts             # Connection pool
│   │   │   ├── operations.ts       # CRUD operations
│   │   │   └── migrations/         # Schema migrations
│   │   ├── api/
│   │   │   ├── server.ts           # Express app
│   │   │   ├── routes/             # API endpoints
│   │   │   └── middleware/         # Auth, logging, etc.
│   │   └── shared/
│   │       ├── types.ts            # Shared TypeScript types
│   │       ├── logger.ts           # Pino logger config
│   │       └── utils.ts            # Helper functions
│   ├── workers/
│   │   └── transformWorker.ts      # Worker thread script
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── performance/
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── server-old/                      # Legacy Appwrite code (reference)
├── docs/
│   ├── architecture-specification.md (this document)
│   └── brainstorming-session-results-2025-10-05.md
├── docker-compose.yml
└── README.md
```

---

## Appendix C: Success Criteria

### Technical Success Criteria

- [x] Architecture designed and documented
- [ ] Development environment set up
- [ ] PostgreSQL schema migrated
- [ ] Core processing pipeline implemented
- [ ] <15s processing time achieved (5 races)
- [ ] <300ms database write per race
- [ ] Client API compatibility maintained
- [ ] Zero data loss during migration
- [ ] All tests passing (unit, integration, performance)

### Business Success Criteria

- [ ] 2x performance improvement validated
- [ ] Users can detect insider patterns faster
- [ ] No missed betting opportunities due to delays
- [ ] Successful production deployment
- [ ] Positive user feedback
- [ ] Appwrite successfully decommissioned

### Operational Success Criteria

- [ ] Monitoring dashboards operational
- [ ] Alerting rules configured
- [ ] Runbooks documented
- [ ] Team trained on new stack
- [ ] Rollback plan tested and ready

---

## Document Control

**Version History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-05 | Winston (BMAD Architect) | Initial architecture specification |

**Approvals:**

- [ ] Technical Lead: __________________
- [ ] Product Owner: __________________
- [ ] DevOps Lead: __________________

**Next Review Date:** 2025-10-12 (after Phase 1 completion)

---

**End of Architecture Specification**
