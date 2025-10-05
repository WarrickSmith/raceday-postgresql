# Technical Specifications Index

**Project:** raceday-postgresql
**Date:** 2025-10-05
**Status:** Solutioning Complete

---

## Overview

This index provides navigation to all technical specifications for the raceday-postgresql migration project. Each epic has a detailed technical specification document that expands on the architecture and provides implementation-ready details.

---

## Epic Technical Specifications

### ✅ Epic 1: Core Infrastructure Setup
**Document:** [tech-spec-epic-1.md](./tech-spec-epic-1.md)
**Status:** Complete

**Contents:**
- Database schema (6 tables: meetings, races, entrants, race_pools, money_flow_history, odds_history)
- Partitioning strategy (daily partitions, 30-day retention)
- Docker configuration (docker-compose.yml, Dockerfile)
- Environment validation (Zod schemas)
- Logging infrastructure (Pino structured JSON)
- Connection pooling (PostgreSQL pg pool, 10 max connections)
- Health check endpoint (/health)
- Migration scripts organization

**Key Components:**
- `./server/database/migrations/` - SQL migration files
- `./server/src/shared/env.ts` - Environment validation
- `./server/src/shared/logger.ts` - Pino logger
- `./server/src/database/pool.ts` - Connection pool
- `./server/src/api/routes/health.ts` - Health check
- `./docker-compose.yml` - Container orchestration
- `./server/Dockerfile` - Server image build

---

### 📋 Epic 2: High-Performance Data Pipeline
**Document:** [tech-spec-epic-2.md](./tech-spec-epic-2.md)
**Status:** To be generated (reference architecture-specification.md)

**Key Architecture References:**
- NZ TAB API Client: [architecture-specification.md](./architecture-specification.md) lines 209-229
- Worker Thread Pool: lines 511-545
- Money Flow Calculations: Extract from ./server-old + lines 218-229
- Bulk UPSERT Operations: lines 464-488
- Race Processor Orchestrator: lines 550-580
- Parallel Processing (Promise.all): lines 553-575
- Dynamic Scheduler: lines 196-207
- Performance Metrics: lines 902-913

**Key Components:**
- `./server/src/fetchers/nztab.ts` - NZ TAB API client with retry logic
- `./server/src/fetchers/types.ts` - Zod schemas for API responses
- `./server/src/transformers/index.ts` - Worker pool manager
- `./server/src/transformers/moneyflow.ts` - Money flow calculations
- `./server/workers/transformWorker.ts` - Worker thread script
- `./server/src/database/operations.ts` - Bulk UPSERT functions
- `./server/src/scheduler/processor.ts` - Race processor orchestrator
- `./server/src/scheduler/index.ts` - Dynamic scheduling logic

**Implementation Notes:**
- Worker pool: 3 workers for CPU-bound transforms
- Fetch timeout: 5 seconds with 3 retries
- Transform target: <1s per race
- Write target: <300ms per race (bulk UPSERT)
- Parallel processing: 5 races <15s total

---

### 📋 Epic 3: REST API Layer
**Document:** [tech-spec-epic-3.md](./tech-spec-epic-3.md)
**Status:** To be generated (reference architecture-specification.md)

**Key Architecture References:**
- Express Server Setup: [architecture-specification.md](./architecture-specification.md) lines 237-246
- API Endpoints: lines 619-680
- Response Formats: Must match Appwrite contract exactly
- Error Handling: lines 686
- Performance Target: <100ms response time

**API Endpoints:**
```
GET /api/meetings?date={YYYY-MM-DD}&raceType={type}
GET /api/races?meetingId={id}
GET /api/entrants?raceId={id}  // with embedded odds_history, money_flow_history
GET /health
```

**Key Components:**
- `./server/src/api/server.ts` - Express app configuration
- `./server/src/api/routes/meetings.ts` - GET /api/meetings
- `./server/src/api/routes/races.ts` - GET /api/races
- `./server/src/api/routes/entrants.ts` - GET /api/entrants (with joins)
- `./server/src/api/middleware/` - Helmet, compression, error handling
- `./server/src/api/schemas/` - Zod response validation

**Implementation Notes:**
- Helmet for security headers
- Compression (gzip) enabled
- Response format must match Appwrite exactly (client compatibility)
- Query optimization: use indexes, LIMIT history records
- Response time target: p95 <100ms

---

### 📋 Epic 4: Database Optimization & Partitioning
**Document:** [tech-spec-epic-4.md](./tech-spec-epic-4.md)
**Status:** To be generated (reference architecture-specification.md)

**Key Architecture References:**
- Partition Management: [architecture-specification.md](./architecture-specification.md) lines 399-455
- Index Strategy: lines 586-601
- Connection Pool Monitoring: lines 489-509
- Query Performance: lines 916-933

**Key Components:**
- `./server/database/functions/partitions.sql` - Automated partition creation/archival
- `./server/database/functions/monitoring.sql` - Query performance monitoring
- `./tools/performance-benchmarks/` - Load testing scripts
- Database backup procedures documentation

**Partition Automation:**
```sql
-- Daily partition creation (midnight)
SELECT cron.schedule('create-partitions', '0 0 * * *',
  'SELECT create_tomorrow_partitions()');

-- Monthly archival (detach >30 days)
SELECT cron.schedule('archive-partitions', '0 1 1 * *',
  'SELECT archive_old_partitions()');
```

**Implementation Notes:**
- Daily partitions: `{table}_YYYY_MM_DD` naming
- 30-day retention: detach and archive older partitions
- EXPLAIN ANALYZE all queries: validate index usage
- Connection pool metrics: log every 5 minutes
- Backup strategy: pg_dump daily, 7-day retention

---

### 📋 Epic 5: Migration & Deployment
**Document:** [tech-spec-epic-5.md](./tech-spec-epic-5.md)
**Status:** To be generated (reference architecture-specification.md)

**Key Architecture References:**
- Migration Strategy: [architecture-specification.md](./architecture-specification.md) lines 809-895
- Shadow Mode: lines 863-867
- Feature Flags: lines 879-882
- Monitoring: lines 900-995
- Rollback Plan: lines 879-882

**Key Components:**
- `./tools/shadow-mode-validator.ts` - Data consistency validation
- `./tools/performance-validator.ts` - Performance benchmarking
- `./tools/migration-scripts/` - Cutover automation
- Operations runbook documentation

**Migration Phases:**
1. **Shadow Mode (48 hours):** Both systems run, continuous validation
2. **10% Traffic (2-4 hours):** Monitor error rates, validate
3. **50% Traffic (4-8 hours):** Load testing, performance validation
4. **100% Traffic (24 hours):** Full production, keep Appwrite backup
5. **Appwrite Decommission (after 7 days):** Final data backup, resource cleanup

**Feature Flag Implementation:**
```typescript
// Environment variable controls backend selection
const USE_NEW_BACKEND = process.env.USE_NEW_BACKEND === 'true';
const backendUrl = USE_NEW_BACKEND
  ? 'http://new-stack:3000'
  : 'http://appwrite:3000';
```

**Rollback Criteria:**
- Error rate >1% (vs Appwrite baseline)
- Response time >150ms p95 (degradation)
- Data consistency <99%
- Critical bug discovered
- User-reported issues

**Implementation Notes:**
- Rollback target: <5 minutes from decision to traffic shifted
- Data consistency threshold: >99% required
- Performance validation: all targets met before 100% cutover
- UAT with power bettors during 50% phase

---

## Cross-Epic Architecture Documents

### Core Architecture Documentation

**[architecture-specification.md](./architecture-specification.md)** (40+ pages)
- Complete technical blueprint
- System architecture diagrams
- Technology stack details
- Database design (schema, partitioning, indexes)
- Performance optimization strategies
- API design and contracts
- Deployment architecture (Docker)
- Migration strategy
- Monitoring and operations
- Risk analysis

**[architectural-decisions.md](./architectural-decisions.md)** (10 ADRs)
1. Transform Location (Hybrid: Node.js + PostgreSQL)
2. Execution Model (Monolith with parallelization)
3. Concurrency Pattern (Worker Threads + Promise.all)
4. Database Write Strategy (Multi-row UPSERT)
5. Deployment Model (Docker 4 CPU, 4GB RAM)
6. Technology Stack (Node.js 22, PostgreSQL 18, TypeScript 5.7+)
7. Type Safety Approach (Zero `any`, Zod validation)
8. Testing Strategy (Unit, integration, performance)
9. Monitoring Approach (Pino logs, performance metrics)
10. Migration Strategy (Shadow mode, gradual cutover)

**[REQUIREMENTS.md](./REQUIREMENTS.md)**
- Node.js 22 LTS minimum requirement
- TypeScript 5.7+ strict mode (zero `any` types)
- All dependencies Node.js 22 compatible
- Code quality standards (zero lint errors)
- Pre-commit hooks (Husky + lint-staged)

**[typescript-eslint-config.md](./typescript-eslint-config.md)**
- Complete TypeScript configuration
- ESLint strict rules
- Prettier formatting
- Pre-commit validation

**[developer-quick-start.md](./developer-quick-start.md)**
- 5-minute setup guide
- Prerequisites (Node.js 22, Docker)
- Common commands
- Troubleshooting

---

## Planning Documents

**[PRD-raceday-postgresql-2025-10-05.md](./PRD-raceday-postgresql-2025-10-05.md)**
- 16 Functional Requirements (FR001-FR016)
- 17 Non-Functional Requirements (NFR001-NFR017)
- User journey (power bettor detecting patterns)
- 5 Epic overview
- Out of scope

**[epic-stories-2025-10-05.md](./epic-stories-2025-10-05.md)**
- 44-55 stories across 5 epics
- Detailed acceptance criteria per story
- Epic sequencing and dependencies

**[product-brief-raceday-postgresql-2025-10-05.md](./product-brief-raceday-postgresql-2025-10-05.md)**
- Executive summary
- Problem statement
- Target users (power bettors)
- Goals and success metrics
- Strategic alignment

**[solution-architecture.md](./solution-architecture.md)**
- Epic-to-architecture mapping
- Component directory structure
- Performance targets summary
- Development sequence

---

## Implementation Roadmap

### Week 0: Pre-Development (Current)
- [x] PRD approved
- [x] Solution architecture created
- [x] Epic 1 tech spec complete
- [ ] Critical research (NZ TAB API, client contract)
- [ ] Development environment setup

### Week 1: Epic 1 - Core Infrastructure
- [ ] Database schema migrations
- [ ] Docker configuration
- [ ] Environment validation
- [ ] Logging and connection pooling
- [ ] Health check endpoint

### Week 2-3: Epic 2-3 - Data Pipeline + API
- [ ] NZ TAB API client
- [ ] Worker thread pool
- [ ] Bulk UPSERT operations
- [ ] Race processor + parallel processing
- [ ] REST API endpoints
- [ ] Client compatibility validation

### Week 4: Epic 4 - Optimization
- [ ] Partition automation
- [ ] Index optimization
- [ ] Load testing
- [ ] Performance benchmarking

### Week 5: Epic 5 - Migration
- [ ] Shadow mode (48 hours)
- [ ] Gradual cutover (10% → 50% → 100%)
- [ ] Performance validation
- [ ] Appwrite decommissioning

---

## Quick Reference

**Performance Targets:**
- 5 races parallel: <15s
- Single race: <2s
- API response: <100ms (p95)
- Database write: <300ms per race

**Resource Allocation:**
- Docker: 4 CPU cores, 4GB RAM
- Worker threads: 3 workers
- Connection pool: 10 max connections

**Code Quality Standards:**
- Node.js 22 LTS minimum
- TypeScript 5.7+ strict mode
- Zero `any` types (ESLint enforced)
- Zero lint errors, zero type errors
- Zod validation for all external data

**Key Commands:**
```bash
# Development
npm run dev

# Build
npm run build

# Test
npm test

# Type check
npm run type-check

# Lint
npm run lint

# Format
npm run format

# Docker
docker-compose up -d
docker-compose logs -f
```

---

## Document Status

- [x] Solution architecture complete
- [x] Epic 1 tech spec complete
- [ ] Epic 2 tech spec (reference arch-spec lines 209-580)
- [ ] Epic 3 tech spec (reference arch-spec lines 619-686)
- [ ] Epic 4 tech spec (reference arch-spec lines 399-601)
- [ ] Epic 5 tech spec (reference arch-spec lines 809-995)
- [x] Cross-epic architecture documented
- [x] Implementation roadmap defined
- [x] Ready for Week 1 development kickoff

---

**Next Action:** Begin Week 0 critical research (NZ TAB API, client contract, Appwrite baseline)

**Following Action:** Begin Epic 1 Story 1.1 (PostgreSQL 18 Database Setup)
