# raceday-postgresql Product Requirements Document (PRD)

**Author:** warrick
**Date:** 2025-10-05
**Project Level:** Level 2 (System Migration)
**Project Type:** Backend Migration / Performance Optimization
**Target Scale:** Production Migration

---

## Description, Context and Goals

### Description

The raceday-postgresql project is a critical backend migration from Appwrite (serverless functions + MariaDB) to a custom Node.js 22 LTS + PostgreSQL 18 architecture. This migration replaces the existing server functionality with a high-performance monolith that achieves 2x faster processing times for time-critical race betting data.

**Core Functionality:**
- Fetch race data from NZ TAB API with dynamic polling intervals (15s during critical 5-minute window)
- Transform race data using CPU-intensive money flow calculations (worker thread-based)
- Store transformed data in PostgreSQL with bulk UPSERT operations
- Serve data to client application via REST API (drop-in replacement for Appwrite API)

**Key Technical Characteristics:**
- Node.js 22 LTS with TypeScript 5.7+ strict mode (zero `any` types)
- PostgreSQL 18 with partitioned time-series tables
- Worker Threads for parallel CPU-bound processing
- Docker deployment (4 CPU cores, 4GB RAM)
- Zero-downtime migration with shadow mode validation

### Deployment Intent

**Production Migration** - This is a full replacement of the existing Appwrite backend with zero tolerance for downtime or data loss. The deployment strategy includes:

1. **Shadow Mode (Week 5, Days 1-2):** Run new stack alongside Appwrite, compare outputs for accuracy
2. **Gradual Cutover (Week 5, Days 3-4):** 10% → 50% → 100% traffic migration with monitoring
3. **Validation Period (Week 5, Days 5-7):** Performance validation, error monitoring, user feedback
4. **Appwrite Decommission:** Keep Appwrite running for 1 week as backup, then decommission

**Success Criteria:**
- <15s processing time for 5 concurrent races (2x improvement)
- Zero data loss during migration
- Zero user-reported issues during cutover
- Client application works without code changes

### Context

**Business Critical Problem:**
The Raceday application detects insider betting patterns by analyzing money flow changes in real-time. Critical insider patterns emerge in the final 30-60 seconds before race close. Current Appwrite architecture takes >30 seconds to process 5 concurrent races, causing users to either miss patterns completely or see them too late to act before competing bettors capitalize on the same signal.

**Why This Matters Now:**
This isn't a technical preference—it's about competitive survival. Every second of delay in detecting insider betting patterns directly impacts:
- User ability to capitalize on insider knowledge before betting window closes
- Competitive advantage versus faster pattern detection systems
- Business viability in a time-sensitive market where 15-second detection beats 30-second detection every time

**Current Bottlenecks:**
- Transform operations (CPU-intensive money flow calculations)
- Database write operations (single-row inserts vs bulk UPSERT)
- Appwrite resource limits and cold starts
- MariaDB performance limitations

**Migration Opportunity:**
The existing ./server codebase contains proven business logic (polling algorithms, money flow calculations, data transformation rules) that can be extracted and optimized. A forked codebase (raceday-postgresql branch) allows safe experimentation without production risk.

### Goals

**Primary Goals:**

1. **Achieve 2x Performance Improvement**
   - Target: <15s processing for 5 concurrent races (currently >30s)
   - Target: <2s single race (fetch + transform + write)
   - Target: <300ms database write per race
   - Success Metric: Measured processing times in production

2. **Eliminate Missed Betting Opportunities**
   - Enable pattern detection in final 30-60 seconds before race close
   - Reduce data latency from 30-60s to 15-30s
   - Zero missed polling cycles during critical 5-minute window
   - Success Metric: User-reported missed opportunity incidents = 0

3. **Execute Zero-Downtime Migration**
   - No disruption during active betting periods
   - Zero data loss or corruption
   - Client application compatibility maintained (drop-in API replacement)
   - Success Metric: <1% rollback rate, zero data integrity issues

**Secondary Goals:**

4. **Establish Modern Technical Foundation**
   - Node.js 22 LTS + TypeScript 5.7+ strict mode (zero `any` types policy)
   - PostgreSQL 18 with performance optimizations (SIMD, improved UPSERT)
   - Comprehensive monitoring and observability
   - Success Metric: Zero TypeScript errors, zero lint errors in codebase

5. **Validate Safe Migration Path**
   - Prove shadow mode deployment effectiveness
   - Demonstrate feature flag instant rollback capability
   - Document migration patterns for future use
   - Success Metric: Shadow mode validation passed, rollback tested

---

## Requirements

### Functional Requirements

**Data Pipeline:**

**FR001:** System SHALL fetch race data from NZ TAB API with dynamic polling intervals based on time-to-start
- ≤5 minutes to start: 15-second intervals
- 5-15 minutes to start: 30-second intervals
- >15 minutes to start: 60-second intervals

**FR002:** System SHALL process up to 5 concurrent races in parallel within a single 15-second polling window

**FR003:** System SHALL calculate money flow patterns per race, per entrant, over time using CPU-intensive algorithms executed in worker threads

**FR004:** System SHALL store race data using bulk UPSERT operations (multi-row INSERT with ON CONFLICT) in single transactions per race

**FR005:** System SHALL partition time-series data (money_flow_history, odds_history) by day with automated partition creation and 30-day retention

**FR005.1:** System SHALL perform daily baseline data initialization each morning (6:00 AM NZST) to fetch meetings, races, and initial race data before real-time polling begins

**FR005.2:** System SHALL use NZ timezone fields (race_date_nz, start_time_nz) from NZ TAB API responses for all race day calculations and partition key alignment, eliminating UTC conversion complexity

**Database Operations:**

**FR006:** System SHALL maintain the following core data entities:
- Meetings (meeting_id, name, country, race_type, date, status)
- Races (race_id, name, race_number, start_time, status, meeting_id)
- Entrants (entrant_id, name, runner_number, odds, hold_percentage, is_scratched, race_id)
- Money Flow History (time-series, partitioned)
- Odds History (time-series, partitioned)
- Race Pools (win, place, quinella, trifecta totals)

**FR007:** System SHALL implement conditional UPSERT with WHERE clauses to prevent unnecessary writes when data hasn't changed (30-50% write reduction)

**API Layer:**

**FR008:** System SHALL provide REST API endpoints matching Appwrite contract exactly:
- GET /api/meetings?date={date}&raceType={type}
- GET /api/races?meetingId={id}
- GET /api/entrants?raceId={id} (with odds_history and money_flow_history embedded)

**FR009:** System SHALL respond to API requests in <100ms for cached queries

**FR010:** System SHALL compress API responses using gzip

**Operational:**

**FR011:** System SHALL expose health check endpoint returning database connectivity, worker thread status, and system health

**FR012:** System SHALL log all operations using structured JSON format (Pino) with configurable log levels

**FR013:** System SHALL track and report performance metrics for each race processing cycle (fetch, transform, write durations)

**FR014:** System SHALL validate all environment variables at startup using Zod schemas, failing fast if configuration is invalid

**FR015:** System SHALL populate race schedule (meetings, races with start_time, entrants with initial odds) via daily initialization before dynamic scheduler activates, ensuring scheduler has race times available for interval calculations

**Migration:**

**FR016:** System SHALL support shadow mode deployment running alongside Appwrite for data consistency validation

**FR017:** System SHALL support feature flag-based instant rollback to Appwrite backend (<5 minute cutover)

### Non-Functional Requirements

**Performance:**

**NFR001:** System SHALL process 5 concurrent races in <15 seconds end-to-end (2x improvement requirement)
- Single race: <2s (fetch + transform + write)
- Fetch from NZ TAB: <500ms
- Transform (worker): <1s
- Bulk write to DB: <300ms

**NFR002:** System SHALL maintain <100ms API response time for 95th percentile requests

**NFR003:** System SHALL support connection pool of 10 concurrent PostgreSQL connections without saturation

**Reliability:**

**NFR004:** System SHALL achieve 99.9% uptime during race hours (defined as 8am-10pm NZT)

**NFR005:** System SHALL implement retry logic with exponential backoff for NZ TAB API failures (max 3 retries)

**NFR006:** System SHALL gracefully handle worker thread crashes with automatic worker restart

**Code Quality:**

**NFR007:** System SHALL enforce zero `any` types in TypeScript codebase (ESLint error rule)

**NFR008:** System SHALL maintain zero TypeScript compilation errors and zero ESLint errors

**NFR009:** System SHALL validate all external data (NZ TAB API responses, environment variables, worker messages) using Zod runtime schemas

**Scalability:**

**NFR010:** System SHALL support deployment on single Docker container with 4 CPU cores and 4GB RAM

**NFR011:** System SHALL utilize 3 worker threads for CPU-bound transformations, leaving 1 core for main event loop and PostgreSQL operations

**Security:**

**NFR012:** System SHALL validate and sanitize all user inputs and external data sources

**NFR013:** System SHALL implement Helmet security headers for HTTP responses

**NFR014:** System SHALL prevent SQL injection through parameterized queries exclusively (no string concatenation)

**Maintainability:**

**NFR015:** System SHALL document all functions, types, and interfaces using TSDoc comments

**NFR016:** System SHALL organize imports in standard order: Node.js built-ins → external dependencies → internal modules → relative imports

**NFR017:** System SHALL enforce code formatting using Prettier with pre-commit hooks (Husky + lint-staged)

---

## User Journeys

### Primary User Journey: Power Bettor Detecting Last-Minute Pattern

**Persona:** Informed race bettor who understands money flow analysis and makes time-sensitive betting decisions

**Scenario:** Race closing in 45 seconds, unusual money flow pattern emerges

**Journey Steps:**

1. **User Context (T-5 minutes)**
   - User opens raceday application
   - Selects upcoming race (Race 3 at Auckland, starts in 5 minutes)
   - Views current odds and money flow patterns for all entrants

2. **System Processing (T-45 seconds)**
   - Backend polls NZ TAB API (15-second interval during critical window)
   - Detects significant money flow shift: Horse #7 hold percentage jumps from 12% → 18% in 30 seconds
   - System processes this change within <15s window
   - Pattern calculation completes: 6% shift in 30s = high-confidence insider signal

3. **User Detection (T-30 seconds)**
   - User's app receives fresh data via polling
   - Money flow visualization updates showing Horse #7 unusual spike
   - Alert highlights significant pattern change
   - User has 30 seconds to analyze and act

4. **User Action (T-15 seconds)**
   - User reviews pattern context (historical money flow, odds movement)
   - Decides to place bet on Horse #7 based on insider signal
   - Places bet through external TAB platform
   - Bet confirmed before race close (T-0 seconds)

5. **Outcome**
   - User capitalized on insider knowledge before betting window closed
   - Competing bettors using 30-second systems missed the pattern entirely OR saw it too late
   - Competitive advantage achieved through faster pattern detection

**Pain Points Eliminated:**
- ❌ **Old System (>30s):** Pattern emerges at T-45s, processed at T-15s, user sees at T-0s = MISSED
- ✅ **New System (<15s):** Pattern emerges at T-45s, processed at T-30s, user sees at T-30s = ACTION TAKEN

**Success Criteria:**
- User sees pattern change within 30 seconds of emergence
- User has ≥15 seconds to analyze and act before race close
- Zero "missed opportunity due to delay" reports

---

## UX Design Principles

**Note:** This is a backend migration project with no client-side changes. The following UX principles apply to the API design and data delivery patterns that enable the client application UX.

**UX001: Data Freshness Over Feature Richness**
- Principle: Deliver timely data with minimal latency over additional features
- Implementation: <15s polling cycle during critical window, optimized for speed
- Rationale: Users value real-time patterns over historical analysis features

**UX002: API Response Consistency**
- Principle: Maintain exact API contract compatibility with Appwrite
- Implementation: Drop-in replacement with identical endpoints and response formats
- Rationale: Zero client-side changes preserves existing UX without disruption

**UX003: Graceful Degradation**
- Principle: System failures should fail gracefully without data loss
- Implementation: Retry logic, worker restart, health checks, instant rollback capability
- Rationale: Betting windows are time-critical; any downtime = lost opportunities

**UX004: Performance Visibility**
- Principle: Users trust systems they understand
- Implementation: Structured logging and metrics enable transparency (future: expose freshness metrics to client)
- Rationale: Power users want to know data freshness and system health

**UX005: Predictable Behavior**
- Principle: System should behave consistently under all conditions
- Implementation: Dynamic polling intervals follow deterministic rules, connection pooling prevents saturation
- Rationale: Users develop mental models based on system behavior; consistency builds trust

---

## Epics

This PRD defines **5 core epics** for the raceday-postgresql migration, sequenced for safe, incremental delivery. Each epic represents a major functional capability that can be developed, tested, and validated independently.

### Epic 1: Core Infrastructure Setup
**Goal:** Establish foundational infrastructure for Node.js/PostgreSQL stack

**Scope:**
- PostgreSQL 18 database setup with schema migrations
- Docker configuration (4 CPU, 4GB RAM)
- Environment variable management and validation (Zod)
- Connection pooling configuration (10 max connections)
- Logging infrastructure (Pino structured JSON logs)
- Health check endpoint implementation

**Success Criteria:**
- Database schema created with all tables and indexes
- Docker containers running and healthy
- Environment variables validated on startup
- Health check returns 200 OK with database connectivity confirmed
- Logs captured in structured JSON format

**Dependencies:** None (foundational)

**Estimated Stories:** 8-10

---

### Epic 2: High-Performance Data Pipeline
**Goal:** Implement fetch → transform → write pipeline achieving <15s processing target

**Scope:**
- Daily baseline data initialization (meetings, races, initial odds) before real-time polling
- NZ TAB API client with retry logic and timeout handling using NZ timezone fields
- Worker thread pool (3 workers) for CPU-bound money flow calculations
- Bulk UPSERT database operations with conditional WHERE clauses
- Race processor orchestrator coordinating parallel processing
- Dynamic scheduler with time-based polling intervals (requires race times from daily init)
- Performance metrics tracking and logging

**Success Criteria:**
- Single race processed in <2s (fetch + transform + write)
- 5 concurrent races processed in <15s
- Database writes complete in <300ms per race
- Worker threads handle CPU-bound work without blocking event loop
- Performance metrics logged for every processing cycle

**Dependencies:** Epic 1 (Infrastructure)

**Estimated Stories:** 13-16

---

### Epic 3: REST API Layer
**Goal:** Provide drop-in API replacement matching Appwrite contract exactly

**Scope:**
- Express server with routing and middleware (Helmet, compression)
- GET /api/meetings endpoint with filters (date, race_type)
- GET /api/races endpoint with filters (meeting_id)
- GET /api/entrants endpoint with embedded history (odds_history, money_flow_history)
- API response formatting matching Appwrite schema
- Error handling and validation
- Response time optimization (<100ms target)

**Success Criteria:**
- All API endpoints functional and tested
- Response format matches Appwrite exactly (client compatibility validated)
- API response time <100ms for 95th percentile
- Security headers applied (Helmet)
- Compression enabled (gzip)
- Integration tests passing against client application

**Dependencies:** Epic 2 (Data Pipeline producing data to serve)

**Estimated Stories:** 8-10

---

### Epic 4: Database Optimization & Partitioning
**Goal:** Implement time-series partitioning and optimization for production scale

**Scope:**
- Daily partition creation for money_flow_history and odds_history
- Automated partition management (create tomorrow, archive >30 days)
- Index optimization based on query patterns
- Connection pool monitoring and tuning
- Query performance testing and optimization
- Database backup and restore procedures

**Success Criteria:**
- Partitions auto-created daily at midnight
- Old partitions (>30 days) detached and archived
- All queries utilize indexes (verified via EXPLAIN ANALYZE)
- Connection pool operates at <80% capacity under load
- Database write performance <300ms per race maintained under load
- Backup/restore procedures documented and tested

**Dependencies:** Epic 2 (Data Pipeline), Epic 3 (API Layer)

**Estimated Stories:** 6-8

---

### Epic 5: Migration & Deployment
**Goal:** Execute zero-downtime migration from Appwrite to Node.js/PostgreSQL

**Scope:**
- Shadow mode deployment (run both systems in parallel)
- Data consistency validation tools (compare Appwrite vs new stack outputs)
- Feature flag implementation for instant rollback
- Gradual traffic cutover (10% → 50% → 100%)
- Performance monitoring during migration
- Rollback procedures testing
- Documentation for deployment and operations
- Appwrite decommissioning plan

**Success Criteria:**
- Shadow mode validation shows <1% data drift
- Feature flag enables instant rollback (<5 min cutover)
- Traffic cutover completes without user-reported issues
- Performance targets met in production (measured)
- Zero data loss during migration (validated)
- Rollback tested and verified
- Operations runbook completed
- Appwrite successfully decommissioned after 1-week validation period

**Dependencies:** Epic 1, 2, 3, 4 (All core functionality complete)

**Estimated Stories:** 10-12

---

**Total Estimated Stories:** 45-56 stories across 5 epics

**Epic Sequencing Rationale:**
1. Infrastructure first (foundation)
2. Data pipeline second (core value)
3. API layer third (client integration)
4. Optimization fourth (production readiness)
5. Migration last (safe deployment)

**Parallel Work Opportunities:**
- Epic 2 and Epic 3 can partially overlap once Epic 1 is complete
- Epic 4 optimization work can begin during Epic 3 development
- Epic 5 planning and tooling can be prepared during Epic 4

---

## Out of Scope

The following capabilities are explicitly deferred to future phases and NOT included in this migration PRD:

### Deferred Features (Post-Migration)

**Real-Time Subscriptions (Phase 2)**
- WebSocket or Server-Sent Events for push notifications
- Elimination of client polling in favor of server push
- Sub-second pattern alerts to connected clients
- Rationale: MVP focuses on 2x improvement via optimized polling; real-time push is enhancement

**Advanced Monitoring & Observability (Phase 2)**
- Prometheus metrics collection
- Grafana dashboards for real-time performance visualization
- Distributed tracing (OpenTelemetry)
- Rationale: Structured logging (Pino) sufficient for MVP; advanced tooling post-launch

**Machine Learning Integration (Future)**
- Pattern prediction algorithms on historical data
- Anomaly detection using ML models
- Predictive insights before patterns fully emerge
- Rationale: Requires stable high-frequency data foundation first

**Market Expansion (Future)**
- Additional betting markets (Australia, UK, US)
- Multi-region deployment for global coverage
- White-label pattern detection service
- Rationale: Prove NZ market success before expansion

### Explicitly Not Included

**Client Application Changes**
- No UI/UX changes to client application
- No client-side code modifications
- No new client features
- Rationale: Drop-in API replacement maintains client compatibility

**Performance Beyond 2x**
- Sub-15-second processing targets
- Sub-10-second polling intervals
- Rationale: 2x improvement validates architecture; further optimization is iterative

**Additional Data Sources**
- Integration with betting platforms beyond NZ TAB
- Historical data import beyond 30 days
- Rationale: Scope limited to NZ TAB replacement for MVP

**Advanced Features**
- User authentication/authorization changes
- Rate limiting per client
- Caching layer (Redis)
- Database read replicas
- Rationale: Functionality parity with Appwrite is MVP target; enhancements are Phase 2

---

## Next Steps

### Immediate Actions (Post-PRD Approval)

1. **Week 1: Preparation Phase**
   - [ ] Fork repository → raceday-postgresql branch
   - [ ] Rename ./server → ./server-old
   - [ ] Extract business logic from ./server-old (polling algorithms, money flow calculations, data schemas)
   - [ ] Set up development environment (Node.js 22, PostgreSQL 18, Docker)
   - [ ] Create initial schema migrations

2. **Week 2-3: Core Development Phase**
   - [ ] Epic 1: Infrastructure Setup (database, Docker, logging, health checks)
   - [ ] Epic 2: Data Pipeline (fetchers, workers, bulk UPSERT, scheduler)
   - [ ] Epic 3: REST API Layer (Express server, endpoints, client compatibility)

3. **Week 4: Testing & Optimization Phase**
   - [ ] Epic 4: Database Optimization (partitioning, indexes, performance tuning)
   - [ ] Performance benchmarking (validate <15s target)
   - [ ] Integration testing with client application
   - [ ] Load testing under realistic conditions

4. **Week 5: Migration Phase**
   - [ ] Epic 5: Shadow mode deployment
   - [ ] Data consistency validation
   - [ ] Gradual traffic cutover (10% → 50% → 100%)
   - [ ] Production monitoring and validation
   - [ ] Appwrite decommissioning (after 1-week validation)

### Documentation Deliverables

- [ ] Solution architecture document (from solutioning workflow)
- [ ] Epic-level technical specifications (per epic)
- [ ] Detailed user stories with acceptance criteria
- [ ] Operations runbook (deployment, rollback, monitoring)
- [ ] API documentation (OpenAPI/Swagger spec)
- [ ] Database schema documentation

### Stakeholder Reviews

- [ ] PRD review with product owner (warrick)
- [ ] Architecture review with technical lead
- [ ] Migration plan review with operations team
- [ ] Client compatibility validation with frontend team

---

## Document Status

- [x] Goals and context validated with stakeholders
- [x] All functional requirements reviewed (17 FRs defined)
- [x] User journeys cover primary persona (power bettor)
- [x] Epic structure approved for phased delivery (5 epics, 45-56 stories)
- [ ] Ready for solutioning phase (generate solution-architecture.md)
- [ ] Ready for detailed story generation (expand epics into acceptance criteria)

### Dependencies and Assumptions

**Critical Dependencies:**
- NZ TAB API availability and stability
- Client application API contract documented
- Docker infrastructure availability (4 CPU, 4GB RAM)

**Key Assumptions:**
- ✅ Node.js/PostgreSQL achieves 2x performance (validated via architecture analysis)
- ⚠️ NZ TAB API refresh rate ≥15 seconds (requires validation)
- ✅ Race-isolated calculations enable parallelization (confirmed)
- ✅ Client API contract is stable (requires validation with client team)

**Open Questions:**
1. What is NZ TAB API actual refresh rate? (Defines performance ceiling)
2. Are there API rate limits from NZ TAB? (May require throttling)
3. What is acceptable rollback window SLA? (Feature flag cutover time)
4. How much historical data needs migration? (30 days assumed)

_Note: See [technical-decisions.md](./architectural-decisions.md) for captured technical context and 10 architectural decision records (ADRs)_

---

_This PRD is a Level 2 project (System Migration) - providing appropriate detail for a production backend replacement with strict performance and reliability requirements._
