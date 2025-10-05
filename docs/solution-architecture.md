# raceday-postgresql Solution Architecture

**Project:** raceday-postgresql
**Date:** 2025-10-05
**Architect:** warrick (based on Winston's architecture specification)
**Phase:** Solutioning (Post-PRD, Pre-Implementation)
**Status:** Approved for Development

---

## Document Purpose

This Solution Architecture document serves as the **solutioning handoff** from planning (PRD) to implementation. It synthesizes the comprehensive architecture work already completed and maps it to the 5 epics defined in the PRD for development execution.

**Related Documents:**
- **[PRD-raceday-postgresql-2025-10-05.md](./PRD-raceday-postgresql-2025-10-05.md)** - Product Requirements (16 FRs, 17 NFRs)
- **[epic-stories-2025-10-05.md](./epic-stories-2025-10-05.md)** - Detailed epic breakdown (44-55 stories)
- **[architecture-specification.md](./architecture-specification.md)** - Complete technical blueprint (40+ pages)
- **[architectural-decisions.md](./architectural-decisions.md)** - 10 ADRs with rationale
- **[REQUIREMENTS.md](./REQUIREMENTS.md)** - Technical requirements (Node.js 22, TypeScript strict)

---

## Executive Summary

The raceday-postgresql migration replaces Appwrite (serverless + MariaDB) with a custom **Node.js 22 LTS + PostgreSQL 18 monolith** achieving **2x performance improvement** (>30s → <15s for 5 concurrent races).

**Core Architecture Decisions (Pre-Validated):**
- ✅ **Monolith with Internal Parallelization** - Minimizes latency vs microservices
- ✅ **Hybrid Transforms** - Node.js workers (CPU) + PostgreSQL (bulk ops)
- ✅ **Worker Threads** - 3 workers for money flow calculations
- ✅ **Bulk UPSERT** - Multi-row INSERT with conditional WHERE clause
- ✅ **Docker Deployment** - Single container (4 CPU, 4GB RAM)

**Performance Targets:**
- 5 concurrent races: **<15s** (currently >30s)
- Single race: **<2s** (fetch 300ms + transform 700ms + write 200ms)
- API response: **<100ms** (p95)
- Database write: **<300ms** per race

---

## High-Level Architecture

### System Context Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      NZ TAB API                              │
│                  (External Data Source)                      │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/REST (15s polling)
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  RACEDAY NODE.JS SERVER                      │
│                  (Monolith - 4 CPU, 4GB RAM)                 │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Scheduler   │  │   Fetchers   │  │  API Server  │      │
│  │  (Dynamic)   │──│  (NZ TAB)    │  │  (Express)   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────▲───────┘      │
│         │                  │                  │              │
│         │         ┌────────▼────────┐        │              │
│         │         │  Worker Pool    │        │              │
│         │         │  (3 Workers)    │        │              │
│         │         └────────┬────────┘        │              │
│         │                  │                  │              │
│         │         ┌────────▼────────┐        │              │
│         └────────▶│  Race Processor │        │              │
│                   │  (Orchestrator) │        │              │
│                   └────────┬────────┘        │              │
│                            │                  │              │
│                   ┌────────▼────────┐        │              │
│                   │   DB Operations │◄───────┘              │
│                   │  (Bulk UPSERT)  │                        │
│                   └────────┬────────┘                        │
└────────────────────────────┼──────────────────────────────────┘
                             │ Connection Pool (10)
                             │
                   ┌─────────▼─────────┐
                   │  PostgreSQL 18    │
                   │  (Partitioned)    │
                   └───────────────────┘
                             ▲
                             │ REST API
                   ┌─────────┴─────────┐
                   │   Client App      │
                   └───────────────────┘
```

---

## Technology Stack

### Core Technologies (Non-Negotiable)

```yaml
Runtime: Node.js 22 LTS (v22.0.0+)
Language: TypeScript 5.7+ (strict mode, zero any types)
Database: PostgreSQL 18 (SIMD, improved UPSERT)
Containerization: Docker
Process Manager: Native Worker Threads
```

### Production Dependencies (Node.js 22 Compatible)

```json
{
  "express": "^4.21.2",      // HTTP server & API routing
  "pg": "^8.13.1",           // PostgreSQL client with connection pooling
  "axios": "^1.7.9",         // NZ TAB API client
  "node-cron": "^3.0.3",     // Scheduling (base intervals)
  "pino": "^9.5.0",          // High-performance logging
  "dotenv": "^16.4.7",       // Environment configuration
  "helmet": "^8.0.0",        // Security headers
  "compression": "^1.7.5",   // Response compression
  "zod": "^3.23.8"           // Runtime type validation
}
```

### Code Quality Tools

```json
{
  "typescript": "^5.7.2",
  "@types/node": "^22.10.2",
  "@typescript-eslint/eslint-plugin": "^8.19.1",
  "@typescript-eslint/parser": "^8.19.1",
  "eslint": "^9.17.0",
  "jest": "^29.7.0",
  "prettier": "^3.4.2",
  "husky": "^9.1.7",
  "lint-staged": "^15.2.11"
}
```

---

## Epic-to-Architecture Mapping

This section maps each PRD epic to the corresponding architecture components and technical specifications.

---

### Epic 1: Core Infrastructure Setup

**PRD Reference:** Epic 1 (Stories 1.1-1.10)
**Architecture Document:** [architecture-specification.md](./architecture-specification.md) - Database Design, Deployment Architecture sections

#### Components to Build

**1.1-1.3: Database Schema & Partitioning**
- **Core Tables:** meetings, races, entrants, race_pools
- **Partitioned Tables:** money_flow_history, odds_history (daily partitions)
- **Triggers:** Auto-update timestamps (updated_at)
- **Constraints:** CHECK constraints for enums, foreign keys
- **Schema Location:** `./server/database/migrations/`

**Database Schema Reference:**
```sql
-- Core entity tables (see architecture-specification.md lines 255-397)
CREATE TABLE meetings (...);
CREATE TABLE races (...);
CREATE TABLE entrants (...);
CREATE TABLE race_pools (...);

-- Partitioned time-series tables
CREATE TABLE money_flow_history (...) PARTITION BY RANGE (event_timestamp);
CREATE TABLE odds_history (...) PARTITION BY RANGE (event_timestamp);
```

**1.4: Database Indexes**
```sql
-- Hot path indexes (see architecture-specification.md lines 586-601)
CREATE INDEX idx_races_start_time ON races(start_time)
  WHERE status IN ('upcoming', 'in_progress');
CREATE INDEX idx_entrants_race ON entrants(race_id);
CREATE INDEX idx_money_flow_entrant_time
  ON money_flow_history(entrant_id, event_timestamp DESC);
```

**1.5: Docker Configuration**
- **Dockerfile:** Multi-stage build (dependencies → build → runtime)
- **docker-compose.yml:** PostgreSQL 18 + Node.js server
- **Resource Limits:** 4 CPU cores, 4GB RAM
- **Config Location:** `./docker-compose.yml`, `./server/Dockerfile`

**1.6: Environment Validation**
```typescript
// ./server/src/shared/env.ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATABASE_URL: z.string().url(),
  NZTAB_API_URL: z.string().url(),
  NZTAB_API_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive(),
});

export const env = EnvSchema.parse(process.env);
```

**1.7-1.8: Logging & Connection Pooling**
```typescript
// ./server/src/shared/logger.ts
import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
});

// ./server/src/database/pool.ts
import { Pool } from 'pg';
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

**1.9: Health Check Endpoint**
```typescript
// ./server/src/api/routes/health.ts
app.get('/health', async (req, res) => {
  const dbHealthy = await pool.query('SELECT 1');
  const workersHealthy = workerPool.isHealthy();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: 'connected',
    workers: workersHealthy ? 'operational' : 'degraded',
  });
});
```

**Technical Specification:** See [tech-spec-epic-1.md](#) (to be generated)

---

### Epic 2: High-Performance Data Pipeline

**PRD Reference:** Epic 2 (Stories 2.1-2.15)
**Architecture Document:** [architecture-specification.md](./architecture-specification.md) - System Architecture, Performance Optimization sections

#### Components to Build

**2.1-2.2: NZ TAB API Client**
```typescript
// ./server/src/fetchers/nztab.ts
import axios from 'axios';
import { RaceDataSchema } from './types';

export async function fetchRaceData(raceId: string): Promise<RaceData> {
  const response = await axios.get<unknown>(
    `${env.NZTAB_API_URL}/races/${raceId}`,
    {
      timeout: 5000,
      headers: { 'X-API-Key': env.NZTAB_API_KEY },
    }
  );
  return RaceDataSchema.parse(response.data);
}
```

**2.3-2.4: Worker Thread Pool**
```typescript
// ./server/src/transformers/index.ts
import { Worker } from 'worker_threads';

class WorkerPool {
  private workers: Worker[] = [];
  private queue: TaskQueue = [];

  constructor(size: number = 3) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker('./transformWorker.js');
      this.workers.push(worker);
    }
  }

  async exec(data: RawRaceData): Promise<TransformedRaceData> {
    // Queue task, assign to available worker, return promise
  }
}
```

**2.5-2.6: Bulk UPSERT Operations**
```typescript
// ./server/src/database/operations.ts
export async function bulkUpsertEntrants(entrants: Entrant[]): Promise<void> {
  const query = `
    INSERT INTO entrants (entrant_id, name, runner_number, win_odds, ...)
    VALUES ($1, $2, ...), ($n, $n+1, ...)
    ON CONFLICT (entrant_id)
    DO UPDATE SET
      win_odds = EXCLUDED.win_odds,
      place_odds = EXCLUDED.place_odds
    WHERE
      entrants.win_odds IS DISTINCT FROM EXCLUDED.win_odds
      OR entrants.place_odds IS DISTINCT FROM EXCLUDED.place_odds
  `;

  await pool.query(query, flattenedParams);
}
```

**2.7-2.8: Race Processor & Parallel Processing**
```typescript
// ./server/src/scheduler/processor.ts
export async function processRace(raceId: string): Promise<number> {
  const start = performance.now();

  // 1. Fetch
  const rawData = await fetchRaceData(raceId);

  // 2. Transform (worker)
  const transformed = await workerPool.exec(rawData);

  // 3. Write (bulk)
  await bulkUpsertRaceData(transformed);

  const duration = performance.now() - start;
  logger.info({ raceId, duration }, 'Race processed');
  return duration;
}

export async function processRaces(raceIds: string[]): Promise<void> {
  const results = await Promise.allSettled(
    raceIds.map(id => processRace(id))
  );
}
```

**2.9: Dynamic Scheduler**
```typescript
// ./server/src/scheduler/index.ts
export function calculatePollingInterval(timeToStart: number): number {
  if (timeToStart <= 5 * 60) return 15_000;      // ≤5 min: 15s
  if (timeToStart <= 15 * 60) return 30_000;     // 5-15 min: 30s
  return 60_000;                                  // >15 min: 60s
}
```

**Performance Architecture Reference:**
- Worker Thread Pattern: [architecture-specification.md](./architecture-specification.md) lines 511-545
- Parallel Processing: lines 549-580
- Bulk UPSERT Strategy: lines 464-488

**Technical Specification:** See [tech-spec-epic-2.md](#) (to be generated)

---

### Epic 3: REST API Layer

**PRD Reference:** Epic 3 (Stories 3.1-3.10)
**Architecture Document:** [architecture-specification.md](./architecture-specification.md) - API Design section

#### Components to Build

**3.1: Express Server Setup**
```typescript
// ./server/src/api/server.ts
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';

const app = express();
app.use(helmet());
app.use(compression());
app.use(express.json());

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Server started');
});
```

**3.2-3.4: API Endpoints**
```typescript
// ./server/src/api/routes/meetings.ts
app.get('/api/meetings', async (req, res) => {
  const { date, raceType } = req.query;
  const meetings = await pool.query(`
    SELECT * FROM meetings
    WHERE ($1::date IS NULL OR date = $1)
      AND ($2::text IS NULL OR race_type = $2)
  `, [date, raceType]);
  res.json(meetings.rows);
});

// ./server/src/api/routes/races.ts
app.get('/api/races', async (req, res) => {
  const { meetingId } = req.query;
  // Query races with meeting_id filter
});

// ./server/src/api/routes/entrants.ts
app.get('/api/entrants', async (req, res) => {
  const { raceId } = req.query;
  // Query entrants with embedded odds_history and money_flow_history
  // JOIN or separate queries + aggregation
});
```

**API Contract Reference:**
- Endpoint specifications: [architecture-specification.md](./architecture-specification.md) lines 619-680
- Response formats must match Appwrite exactly (client compatibility)

**Technical Specification:** See [tech-spec-epic-3.md](#) (to be generated)

---

### Epic 4: Database Optimization & Partitioning

**PRD Reference:** Epic 4 (Stories 4.1-4.8)
**Architecture Document:** [architecture-specification.md](./architecture-specification.md) - Database Design section

#### Components to Build

**4.1: Automated Partition Creation**
```sql
-- ./server/database/functions/partitions.sql
CREATE OR REPLACE FUNCTION create_tomorrow_partitions()
RETURNS void AS $$
DECLARE
  tomorrow DATE := CURRENT_DATE + INTERVAL '1 day';
  day_after DATE := CURRENT_DATE + INTERVAL '2 days';
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS money_flow_history_%s
     PARTITION OF money_flow_history
     FOR VALUES FROM (%L) TO (%L)',
    to_char(tomorrow, 'YYYY_MM_DD'), tomorrow, day_after
  );
  -- Repeat for odds_history
END;
$$ LANGUAGE plpgsql;

-- Schedule via pg_cron
SELECT cron.schedule('create-partitions', '0 0 * * *',
  'SELECT create_tomorrow_partitions()');
```

**4.2: Partition Archival**
```sql
CREATE OR REPLACE FUNCTION archive_old_partitions()
RETURNS void AS $$
DECLARE
  cutoff_date DATE := CURRENT_DATE - INTERVAL '30 days';
BEGIN
  EXECUTE format(
    'ALTER TABLE money_flow_history
     DETACH PARTITION money_flow_history_%s',
    to_char(cutoff_date, 'YYYY_MM_DD')
  );
END;
$$ LANGUAGE plpgsql;
```

**4.3-4.7: Optimization & Monitoring**
- Index validation: EXPLAIN ANALYZE all queries
- Connection pool metrics logging
- Load testing framework
- Backup/restore procedures
- Partition pruning validation

**Optimization Reference:**
- Index strategy: [architecture-specification.md](./architecture-specification.md) lines 586-601
- Partition management: lines 399-455

**Technical Specification:** See [tech-spec-epic-4.md](#) (to be generated)

---

### Epic 5: Migration & Deployment

**PRD Reference:** Epic 5 (Stories 5.1-5.12)
**Architecture Document:** [architecture-specification.md](./architecture-specification.md) - Migration Strategy, Monitoring sections

#### Components to Build

**5.1-5.2: Shadow Mode & Validation**
```typescript
// ./tools/shadow-mode-validator.ts
export async function validateDataConsistency(
  raceId: string
): Promise<ConsistencyReport> {
  const appwriteData = await fetchFromAppwrite(raceId);
  const newStackData = await fetchFromNewStack(raceId);

  const differences = compareData(appwriteData, newStackData);
  const consistencyPercent = calculateConsistency(differences);

  return {
    raceId,
    consistencyPercent,
    differences,
    timestamp: new Date().toISOString(),
  };
}
```

**5.3: Feature Flag**
```typescript
// Client or proxy configuration
const USE_NEW_BACKEND = process.env.USE_NEW_BACKEND === 'true';
const backendUrl = USE_NEW_BACKEND
  ? 'http://new-stack:3000'
  : 'http://appwrite:3000';
```

**5.4-5.7: Gradual Cutover**
- Shadow mode: 48 hours, continuous validation
- 10% traffic: 2-4 hours, monitor error rates
- 50% traffic: 4-8 hours, validate performance
- 100% traffic: 24 hours, full monitoring

**5.8: Performance Validation**
```typescript
// ./tools/performance-validator.ts
export async function validatePerformanceTargets(): Promise<ValidationReport> {
  const fiveRacesTime = await measureFiveRacesProcessing();
  const singleRaceTime = await measureSingleRaceProcessing();
  const apiResponseTime = await measureAPIResponseTime();

  return {
    fiveRacesTarget: { target: 15000, actual: fiveRacesTime, pass: fiveRacesTime < 15000 },
    singleRaceTarget: { target: 2000, actual: singleRaceTime, pass: singleRaceTime < 2000 },
    apiResponseTarget: { target: 100, actual: apiResponseTime, pass: apiResponseTime < 100 },
  };
}
```

**Migration Strategy Reference:**
- Deployment plan: [architecture-specification.md](./architecture-specification.md) lines 860-895
- Monitoring: lines 900-995

**Technical Specification:** See [tech-spec-epic-5.md](#) (to be generated)

---

## Component Directory Structure

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
│   │   │   └── types.ts            # API response types (Zod schemas)
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
│   │   │   │   ├── health.ts
│   │   │   │   ├── meetings.ts
│   │   │   │   ├── races.ts
│   │   │   │   └── entrants.ts
│   │   │   └── middleware/         # Auth, logging, etc.
│   │   └── shared/
│   │       ├── types.ts            # Shared TypeScript types
│   │       ├── logger.ts           # Pino logger config
│   │       ├── env.ts              # Environment validation (Zod)
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
├── tools/
│   ├── shadow-mode-validator.ts     # Data consistency checker
│   ├── performance-validator.ts     # Performance benchmarking
│   └── migration-scripts/
├── docs/
│   ├── PRD-raceday-postgresql-2025-10-05.md
│   ├── epic-stories-2025-10-05.md
│   ├── solution-architecture.md (this document)
│   ├── architecture-specification.md
│   ├── architectural-decisions.md
│   ├── REQUIREMENTS.md
│   ├── tech-spec-epic-1.md (to be generated)
│   ├── tech-spec-epic-2.md (to be generated)
│   ├── tech-spec-epic-3.md (to be generated)
│   ├── tech-spec-epic-4.md (to be generated)
│   └── tech-spec-epic-5.md (to be generated)
├── docker-compose.yml
└── README.md
```

---

## Performance Targets Summary

| Operation | Target | Architecture Reference |
|-----------|--------|----------------------|
| 5 races parallel | <15s | [arch-spec](./architecture-specification.md) lines 549-580 |
| Single race | <2s | lines 553-573 |
| Fetch from NZ TAB | <500ms | lines 209-211 |
| Transform (worker) | <1s | lines 218-229 |
| Bulk write to DB | <300ms | lines 233-245, 464-488 |
| API response | <100ms | lines 684-686 |

**Performance Validation:**
- Benchmark tool: Epic 2 Story 2.15
- Production validation: Epic 5 Story 5.8

---

## Risk Mitigation Architecture

### Critical Risks & Architectural Mitigations

| Risk | Mitigation | Architecture Component |
|------|-----------|----------------------|
| Worker thread memory leaks | Auto-restart after N tasks | WorkerPool (Epic 2 Story 2.11) |
| Connection pool saturation | 10 max, monitoring, timeout | pool.ts (Epic 1 Story 1.8) |
| NZ TAB API failures | Retry with exponential backoff | nztab.ts (Epic 2 Story 2.12) |
| Migration data loss | Shadow mode validation | Validator (Epic 5 Story 5.2) |
| Performance regression | Feature flag instant rollback | Feature flag (Epic 5 Story 5.3) |

**Risk Analysis Reference:** [architecture-specification.md](./architecture-specification.md) lines 998-1036

---

## Development Sequence

### Phase 1: Foundation (Week 1)
**Epic 1: Core Infrastructure Setup**
- Database schema + Docker + logging + health checks
- **Deliverable:** Docker stack running, database schema created, health check passing

### Phase 2: Core Value (Week 2-3)
**Epic 2: High-Performance Data Pipeline**
- Fetchers + workers + bulk UPSERT + parallel processing
- **Deliverable:** 5 races processed in <15s (validated by benchmarks)

**Epic 3: REST API Layer**
- Express server + endpoints + client compatibility
- **Deliverable:** API matches Appwrite contract, client app works

### Phase 3: Production Readiness (Week 4)
**Epic 4: Database Optimization**
- Partitions + indexes + load testing + backup procedures
- **Deliverable:** Production-ready database, optimized queries, backup tested

### Phase 4: Safe Deployment (Week 5)
**Epic 5: Migration & Deployment**
- Shadow mode → 10% → 50% → 100% → Appwrite decommission
- **Deliverable:** Live in production, 2x performance validated, zero data loss

---

## Next Steps

### Immediate Actions

1. **Generate Per-Epic Technical Specifications**
   - [ ] [tech-spec-epic-1.md](#) - Core Infrastructure (database schema, Docker, environment)
   - [ ] [tech-spec-epic-2.md](#) - Data Pipeline (workers, UPSERT, scheduler)
   - [ ] [tech-spec-epic-3.md](#) - API Layer (Express, endpoints, contracts)
   - [ ] [tech-spec-epic-4.md](#) - Optimization (partitions, indexes, performance)
   - [ ] [tech-spec-epic-5.md](#) - Migration (shadow mode, cutover, validation)

2. **Critical Pre-Development Research**
   - [ ] NZ TAB API documentation (refresh rate, rate limits)
   - [ ] Client API contract validation (Appwrite endpoint schemas)
   - [ ] Baseline Appwrite performance (measure actual times)

3. **Development Environment Setup**
   - [ ] Fork repository → raceday-postgresql branch
   - [ ] Rename ./server → ./server-old
   - [ ] Extract business logic from server-old
   - [ ] Initialize new ./server directory structure

4. **Week 1 Kickoff**
   - [ ] Begin Epic 1 Story 1.1 (PostgreSQL 18 Database Setup)

---

## Document Status

- [x] Solution architecture created (based on Winston's architecture-specification.md)
- [x] Epic-to-architecture mapping complete
- [x] Component directory structure defined
- [x] Performance targets mapped to architecture
- [x] Risk mitigation architecture documented
- [ ] Per-epic technical specifications generated (next step)
- [ ] Development environment ready (Week 0)
- [ ] Ready for Week 1 development kickoff

---

**Architecture Approved By:** warrick (Product Owner / Architect)
**Date:** 2025-10-05
**Next Review:** After per-epic tech specs generated

---

_This solution architecture synthesizes comprehensive architectural work (Winston's 40+ page architecture-specification.md, 10 ADRs, technical requirements) and maps it to the 5-epic PRD for development execution. All critical architectural decisions have been validated and documented._
