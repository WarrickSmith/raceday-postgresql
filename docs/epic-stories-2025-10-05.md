# raceday-postgresql - Epic Breakdown

**Author:** warrick
**Date:** 2025-10-05
**Project Level:** Level 2 (System Migration)
**Target Scale:** Production Migration

---

## Epic Overview

This migration project consists of **5 core epics** sequenced for safe, incremental delivery:

1. **Core Infrastructure Setup** - Foundation (database, Docker, logging)
2. **High-Performance Data Pipeline** - Core value (fetch → transform → write <15s)
3. **REST API Layer** - Client integration (drop-in Appwrite replacement)
4. **Database Optimization & Partitioning** - Production scale (partitions, indexes, performance)
5. **Migration & Deployment** - Safe deployment (shadow mode, gradual cutover, rollback)

**Total Estimated Stories:** 45-56 across 5 epics

**Timeline:** 5 weeks (Week 1: Epic 1, Week 2-3: Epic 2-3, Week 4: Epic 4, Week 5: Epic 5)

---

## Epic Details

---

## Epic 1: Core Infrastructure Setup

**Goal:** Establish foundational infrastructure for Node.js/PostgreSQL stack

**Priority:** Must Have (Week 1)

**Dependencies:** None (foundational)

**Estimated Stories:** 8-10

### Story 1.1: PostgreSQL 18 Database Setup

**As a** developer
**I want** PostgreSQL 18 database running in Docker
**So that** I have a performant database foundation for the migration

**Acceptance Criteria:**

- PostgreSQL 18 container runs via docker-compose
- Database accessible at localhost:5432
- Database name: raceday
- User credentials configured via environment variables
- Health check confirms database connectivity
- PostgreSQL 18 features available (SIMD, improved UPSERT)

---

### Story 1.2: Core Database Schema Migration

**As a** developer
**I want** core database tables created from schema migrations
**So that** I can store race data in normalized structure

**Acceptance Criteria:**

- Core tables created: meetings, races, entrants, race_pools
- Primary keys defined for all tables
- Foreign key relationships enforced (races → meetings, entrants → races)
- Status fields use CHECK constraints (e.g., race_type IN ('thoroughbred', 'harness'))
- All timestamp fields use TIMESTAMPTZ
- created_at and updated_at fields auto-populate via triggers

---

### Story 1.3: Time-Series Tables with Partitioning

**As a** developer
**I want** partitioned time-series tables for money_flow_history and odds_history
**So that** I can efficiently store and query high-volume historical data

**Acceptance Criteria:**

- money_flow_history table created with PARTITION BY RANGE (event_timestamp)
- odds_history table created with PARTITION BY RANGE (event_timestamp)
- Initial daily partition created for current date
- Partition naming convention: {table_name}\_YYYY_MM_DD
- Foreign key relationships to entrants table maintained
- Indexes created on (entrant_id, event_timestamp DESC)

---

### Story 1.4: Database Indexes for Query Optimization

**As a** developer
**I want** indexes optimized for client query patterns
**So that** API responses are fast (<100ms)

**Acceptance Criteria:**

- Index on races(start_time) WHERE status IN ('open', 'closed', 'interim')
- Index on entrants(race_id)
- Index on entrants(race_id, is_scratched) partial index WHERE is_scratched = false
- Index on meetings(date, race_type) WHERE status = 'active'
- Index on money_flow_history(entrant_id, event_timestamp DESC)
- Index on odds_history(entrant_id, event_timestamp DESC)
- All indexes verified via EXPLAIN ANALYZE on representative queries

---

### Story 1.5: Docker Configuration for Node.js Server

**As a** developer
**I want** Docker container configured for Node.js 22 server
**So that** I can run the application with consistent resource allocation

**Acceptance Criteria:**

- Dockerfile created for Node.js 22 LTS Alpine base image
- Multi-stage build (dependencies → build → runtime)
- Container CPU limit: 4 cores
- Container memory limit: 4GB
- Health check configured (curl localhost:3000/health)
- Environment variables passed via docker-compose
- Volume mounts for logs (if needed)
- Container restart policy: unless-stopped

---

### Story 1.6: Environment Variable Validation with Zod

**As a** developer
**I want** environment variables validated at startup using Zod
**So that** configuration errors are caught immediately with clear messages

**Acceptance Criteria:**

- Zod schema defined for all required environment variables
- Required variables: NODE_ENV, DATABASE_URL, NZTAB_API_URL, NZTAB_API_KEY, PORT
- Type coercion for numeric values (PORT → number)
- URL validation for DATABASE_URL and NZTAB_API_URL
- Application fails fast on startup if any validation fails
- Clear error messages indicating which variable is invalid
- Validated config exported as typed constant (env)

---

### Story 1.7: Structured Logging with Pino

**As a** developer
**I want** structured JSON logging with Pino
**So that** I can track application behavior and debug issues in production

**Acceptance Criteria:**

- Pino logger configured with JSON output
- Log level configurable via LOG_LEVEL environment variable (default: info)
- ISO 8601 timestamps on all log entries
- Logger instance exported for use across application
- Example log entries for: info, warn, error levels
- Logs include contextual data (raceId, duration, etc.) as structured fields
- No console.log statements in production code (enforced by ESLint)

---

### Story 1.8: PostgreSQL Connection Pooling

**As a** developer
**I want** PostgreSQL connection pool configured with optimal settings
**So that** I can handle concurrent database operations without saturation

**Acceptance Criteria:**

- pg Pool configured with DATABASE_URL from environment
- Max connections: 10
- Min idle connections: 2
- Idle timeout: 30 seconds
- Connection timeout: 2 seconds (fail fast if pool exhausted)
- Pool instance exported for use across application
- Connection pool metrics logged on startup (max, min, timeout settings)

---

### Story 1.9: Health Check Endpoint

**As a** developer
**I want** /health endpoint returning system health status
**So that** Docker and monitoring can verify system is operational

**Acceptance Criteria:**

- GET /health endpoint implemented
- Returns 200 OK if system healthy, 503 Service Unavailable if unhealthy
- Health check validates: database connectivity (SELECT 1 query)
- Health check validates: worker pool operational (future: once workers implemented)
- Response body includes: status, timestamp, database status, worker status
- Health check responds in <100ms
- Docker health check configured to use this endpoint

---

### Story 1.10: Development Environment Setup Documentation

**As a** developer
**I want** clear documentation for setting up local development environment
**So that** I can get started quickly and consistently

**Acceptance Criteria:**

- README.md or developer-quick-start.md updated with setup instructions
- Prerequisites listed: Node.js 22 LTS, Docker, Docker Compose
- Step-by-step setup: clone repo, install dependencies, start Docker, run migrations
- Common commands documented: npm run dev, npm run build, npm test
- Troubleshooting section for common issues
- Environment variable template (.env.example) provided

---

### Story 1.11: Epic 2 Kickoff Readiness

**As a** product owner
**I want** to confirm Epic 2 prerequisites and update planning artifacts
**So that** the data pipeline work can start without blockers

**Acceptance Criteria:**

- All Epic 1 deliverables verified as Done/Approved and captured in the latest retrospective
- Epic 2 readiness checklist completed, including references to tech-spec-epic-2, PRD-epic-002, and supporting architecture documents
- Story 2.1 identified as the next development item and linked in planning artifacts
- Sprint goal and capacity notes updated to reflect the Epic 2 kickoff

---

---

## Epic 2: High-Performance Data Pipeline

**Goal:** Implement fetch → transform → write pipeline achieving <15s processing target

**Priority:** Must Have (Week 2-3)

**Dependencies:** Epic 1 (Infrastructure)

**Estimated Stories:** 17-20 (including split stories 2.10A-2.10D)

### Story 2.1: NZ TAB API Client with Axios

**As a** developer
**I want** NZ TAB API client that fetches race data with retry logic
**So that** I can reliably retrieve race data even with transient API failures

**Acceptance Criteria:**

- Axios client configured with base URL from NZTAB_API_URL environment variable
- API key authentication via headers (if required)
- Timeout: 5 seconds per request
- Retry logic: max 3 retries with exponential backoff (100ms, 200ms, 400ms)
- Error handling for: timeout, network errors, 4xx/5xx responses
- Fetch race data endpoint implemented: fetchRaceData(raceId: string)
- Response validated using Zod schema (RaceDataSchema)
- Logging for: fetch start, fetch success/failure, retry attempts

---

### Story 2.2: NZ TAB API Response Type Definitions

**As a** developer
**I want** TypeScript types and Zod schemas for NZ TAB API responses
**So that** I have type-safe, validated data from external API

**Acceptance Criteria:**

- Zod schemas defined for: RaceData, Entrant, Odds, Pool, MeetingData
- TypeScript types inferred from Zod schemas using z.infer<>
- All external API responses validated with schema.parse() or schema.safeParse()
- Validation errors logged with details (which field failed, why)
- No any types used (enforced by ESLint)
- Example test cases for valid and invalid API responses

---

### Story 2.3: Worker Thread Pool for CPU-Bound Transforms

**As a** developer
**I want** worker thread pool (3 workers) for money flow calculations
**So that** CPU-intensive work doesn't block the main event loop

**Acceptance Criteria:**

- Worker pool class created with configurable size (default: 3)
- Worker threads created from transformWorker.ts script
- Workers communicate via postMessage / on('message')
- Workers handle errors gracefully (restart on crash)
- Pool queues tasks if all workers busy
- Pool tracks worker status (idle / busy)
- exec(data) method returns Promise resolving to transformed data
- Worker pool initialized on application startup
- Logging for: worker start, task assignment, task completion, worker crash/restart

---

### Story 2.4: Money Flow Calculation Transform Logic

**As a** developer
**I want** money flow calculation logic extracted from server-old and implemented in worker
**So that** I can transform raw NZ TAB data into calculated money flow patterns

**Acceptance Criteria:**

- Transform logic extracted from ./server-old codebase
- Money flow calculations implemented per-race, per-entrant, over time
- Calculations include: hold_percentage, bet_percentage, win_pool_percentage, place_pool_percentage
- Calculations include: incremental amounts (change from previous poll)
- Calculations include: time_to_start, time_interval, interval_type
- Transform accepts raw NZ TAB data, returns structured money flow data
- Transform logic validated against server-old outputs (test cases)
- No any types in transform logic

---

### Story 2.5: Bulk UPSERT Database Operations

**As a** developer
**I want** bulk UPSERT operations using multi-row INSERT with ON CONFLICT
**So that** I can write entire race data in single transaction (<300ms)

**Acceptance Criteria:**

- bulkUpsertMeetings(meetings: Meeting[]) function implemented
- bulkUpsertRaces(races: Race[]) function implemented
- bulkUpsertEntrants(entrants: Entrant[]) function implemented
- Multi-row INSERT with ON CONFLICT (primary_key) DO UPDATE
- Conditional WHERE clause prevents unnecessary writes when data unchanged
- Single transaction per race (BEGIN / COMMIT)
- Error handling with rollback on failure
- Performance logging (duration per operation)
- Target: <300ms per race write operation

---

### Story 2.6: Time-Series Data Insert Operations

**As a** developer
**I want** efficient INSERT operations for time-series tables (money_flow_history, odds_history)
**So that** I can store historical data without UPSERT overhead

**Acceptance Criteria:**

- insertMoneyFlowHistory(records: MoneyFlowRecord[]) function implemented
- insertOddsHistory(records: OddsRecord[]) function implemented
- Multi-row INSERT (no ON CONFLICT - always append)
- Batch size optimization (test 100, 500, 1000 rows per batch)
- Automatic partition detection (insert into correct partition based on event_timestamp)
- Single transaction per batch
- Error handling with rollback
- Performance logging (rows inserted, duration)

---

### Story 2.7: Race Processor Orchestrator

**As a** developer
**I want** race processor that orchestrates fetch → transform → write pipeline
**So that** I can process a complete race in <2s end-to-end

**Acceptance Criteria:**

- processRace(raceId: string) function implemented
- Pipeline steps: fetch → transform (worker) → write (bulk UPSERT)
- Steps executed sequentially (await each step)
- Performance tracking: measure duration for fetch, transform, write, total
- Error handling: retry fetch on failure, log transform errors, rollback DB writes on failure
- Logging for: pipeline start, each step completion, pipeline end
- Return processing duration for metrics
- Target: <2s total processing time per race

---

### Story 2.8: Parallel Race Processing with Promise.all()

**As a** developer
**I want** parallel processing of up to 5 concurrent races
**So that** I can process multiple races within a single 15-second window

**Acceptance Criteria:**

- processRaces(raceIds: string[]) function implemented
- Uses Promise.allSettled() to process all races in parallel
- Each race processed independently (no shared state except connection pool)
- Failed races logged but don't block other races
- Performance tracking: measure max duration across all races
- Logging for: batch start, individual race completion, batch end
- Return processing results for all races (success/failure, durations)
- Target: 5 races processed in <15s

---

### Story 2.9: Daily Baseline Data Initialization

**As a** system operator
**I want** automated daily fetching of meetings, races, and initial race data early in the race day
**So that** the scheduler has race times available and baseline data is pre-populated before real-time polling begins

**Acceptance Criteria:**

- Daily initialization function runs early morning (6:00 AM NZST) before scheduler activates
- Function fetches all meetings for current NZ race day from NZ TAB API
- Function fetches all race details (times, entrants, initial odds) for those meetings
- Function uses NZ timezone fields (race_date_nz, start_time_nz) from API - no UTC conversion needed
- Function populates database tables: meetings, races (with start_time), entrants (with initial data)
- Function uses bulk UPSERT operations for efficient data loading
- Function handles API failures gracefully with retry logic (max 3 retries)
- Function completes before dynamic scheduler starts (by 7:00 AM NZST)
- Function logs completion statistics: meetings fetched, races created, entrants populated, execution duration
- Scheduler queries database for races with start_time >= NOW() to begin polling operations
- Database queries use race_date_nz field for partition key alignment (NZ racing day boundary)
- Optional: Second evening job (post-races, e.g., 9:00 PM NZST) for comprehensive historical backfill if needed

**Technical Notes:**

- Reuses NZ TAB API client from Story 2.1 (with retry logic)
- Reuses bulk UPSERT operations from Story 2.5
- Can reuse race processor orchestrator from Story 2.7 for data transformation
- NZ TAB API provides race_date_nz (YYYY-MM-DD) and start_time_nz (HH:MM:SS NZST) eliminating timezone conversion complexity
- Race day boundary aligns with NZ timezone (not UTC), matching business logic and partition strategy

---

### Story 2.10: Dynamic Scheduler with Time-Based Intervals

**Status:** ✅ **COMPLETED & REPLACED** - Split into Stories 2.10A-2.10D (2025-10-17)

**As a** developer
**I want** scheduler that adjusts polling frequency based on time-to-start
**So that** I can poll at 15s intervals during critical 5-minute window

**Acceptance Criteria:**

- Scheduler queries database for upcoming races (populated by Story 2.9 daily initialization)
- For each race, calculates time-to-start using start_time from database
- Determines polling interval:
  - ≤5 minutes: 15 seconds
  - 5-15 minutes: 30 seconds
  - > 15 minutes: 60 seconds
- Schedules race processing using setInterval per race
- Clears interval when race completes or is abandoned
- Scheduler runs continuously, re-evaluating intervals every minute
- Scheduler activates after daily initialization completes (7:00 AM NZST or later)
- Logging for: interval changes, race scheduling, race completion

**Original Story Completed:** Dynamic scheduler functionality implemented and working correctly.

**Split Reason:** Story scope expanded beyond scheduler implementation to include comprehensive data pipeline remediation. Original story became too large for effective workflow tracking and completion.

**See New Stories:**
- **Story 2.10A:** Code Quality Foundation (lint errors, build errors, test failures)
- **Story 2.10B:** Database Infrastructure & Partitions (schema alignment, partition automation)
- **Story 2.10C:** Data Pipeline Processing (race pools, money flow, odds change detection)
- **Story 2.10D:** Integration & Performance Validation (end-to-end testing, performance targets)

**Note:** All technical findings and analysis preserved in individual split stories. Dynamic scheduler component remains fully functional.

---

### Story 2.10A: Code Quality Foundation

**Status:** 📋 **READY FOR DEVELOPMENT**

**As a** developer
**I want** all lint errors resolved, build passing, and tests working
**So that** the codebase has a solid foundation for data pipeline remediation

**Acceptance Criteria:**

1. **Zero Lint Errors**: All 245 lint errors resolved across the codebase
2. **Build Success**: TypeScript compilation completes without errors (45+ build errors resolved)
3. **Test Suite Health**: All 14+ failing tests pass, test coverage maintained
4. **Strict Typing**: No 'any' types remain, all TypeScript interfaces properly defined
5. **Code Quality Standards**: Code follows established patterns and conventions

**Dependencies:** None (foundation for subsequent 2.10B-2.10D stories)

---

### Story 2.10B: Database Infrastructure & Partitions

**Status:** 📋 **READY FOR DEVELOPMENT** (depends on 2.10A)

**As a** developer
**I want** automated partition management and complete schema alignment
**So that** data can be written to time-series tables without errors

**Acceptance Criteria:**

1. **Partition Automation**: Daily partitions auto-created for money_flow_history and odds_history
2. **Schema Alignment**: 50+ missing fields added to match Appwrite implementation
3. **Migration Scripts**: New database migrations for entrant, race, and meeting fields
4. **Performance Indexes**: Optimized indexes for new fields and time-series queries
5. **Error Handling**: Graceful partition creation and schema validation

**Dependencies:** Story 2.10A (Code Quality Foundation)

---

### Story 2.10C: Data Pipeline Processing

**Status:** 📋 **READY FOR DEVELOPMENT** (depends on 2.10B)

**As a** developer
**I want** enhanced data processing logic for race pools, money flow, and odds
**So that** complete data is populated from NZTAB API to database

**Acceptance Criteria:**

1. **Race Pools Processing**: Extract and store tote_pools data from NZTAB API
2. **Money Flow Calculations**: Incremental delta calculations with time-bucketing
3. **Odds Change Detection**: Prevent duplicate records through proper change detection
4. **Data Quality Validation**: Mathematical consistency checks and data scoring
5. **Enhanced Transform Logic**: Complete data transformation pipeline

**Dependencies:** Story 2.10B (Database Infrastructure & Partitions)

---

### Story 2.10D: Integration & Performance Validation

**Status:** 📋 **READY FOR DEVELOPMENT** (depends on 2.10C)

**As a** developer
**I want** end-to-end testing and performance validation of the complete data pipeline
**So that** client application receives complete, accurate race data within performance targets

**Acceptance Criteria:**

1. **End-to-End Testing**: Complete data flow from API to database validated
2. **Performance Targets**: 5 races processed in <15s, single race in <2s
3. **Data Quality Validation**: Mathematical consistency and completeness checks
4. **Load Testing**: Concurrent race processing validated
5. **Client Compatibility**: Confirm client application can access complete data

**Dependencies:** Story 2.10C (Data Pipeline Processing)

---

### Story 2.11: Performance Metrics Tracking

**As a** developer
**I want** detailed performance metrics logged for every processing cycle and an api endpoint exposing performance metrics
**So that** I can monitor and optimize system performance and monitor performance metrics from a future client application

**Acceptance Criteria:**

- Metrics logged for each race: fetch_duration, transform_duration, write_duration, total_duration
- Metrics logged for batch: max_duration, race_count, success_count, failure_count
- Metrics include raceId for correlation
- Slow processing warnings: log warning if total_duration >2s (single race) or >15s (batch)
- Metrics formatted as structured JSON (Pino)
- Example log entry:
  ```json
  {
    "level": "info",
    "raceId": "NZ-AUK-20251005-R1",
    "fetch_ms": 320,
    "transform_ms": 680,
    "write_ms": 210,
    "total_ms": 1210,
    "msg": "Race processed"
  }
  ```

---

### Story 2.12: Worker Thread Error Handling and Restart

**As a** developer
**I want** worker threads to restart automatically on crash
**So that** temporary failures don't cause permanent system degradation

**Acceptance Criteria:**

- Worker pool listens for worker 'error' and 'exit' events
- On worker crash: log error details, create new worker, add to pool
- Crashed worker's pending task requeued for retry
- Max retry attempts per task: 3 (fail task after 3 worker crashes)
- Worker restart doesn't impact other workers or main event loop
- Logging for: worker crash, worker restart, task retry, task failure

---

### Story 2.13: Fetch Timeout and Error Handling

**As a** developer
**I want** robust timeout and error handling for NZ TAB API fetches
**So that** transient network issues don't cause processing failures

**Acceptance Criteria:**

- Fetch timeout: 5 seconds (configurable via environment variable)
- Network errors caught and logged with details
- HTTP 4xx errors (client errors) logged but not retried
- HTTP 5xx errors (server errors) retried with exponential backoff
- Timeout errors retried with exponential backoff
- Max retries: 3 attempts
- Final failure logged with full context (raceId, attempt count, error details)
- Failed fetches return null (gracefully handled by race processor)

---

### Story 2.14: Integration Test - Single Race End-to-End

**As a** developer
**I want** integration test for single race fetch → transform → write
**So that** I can validate the complete pipeline works correctly

**Acceptance Criteria:**

- Test fetches real or mocked NZ TAB data for single race
- Test validates data transformation (money flow calculations correct)
- Test validates database writes (data appears in all tables)
- Test measures processing time (asserts <2s)
- Test validates data consistency (no missing entrants, correct relationships)
- Test cleans up database after completion (transaction rollback or test database)

---

### Story 2.15: Integration Test - 5 Concurrent Races

**As a** developer
**I want** integration test for 5 concurrent races processed in parallel
**So that** I can validate performance target (<15s)

**Acceptance Criteria:**

- Test processes 5 races in parallel using Promise.allSettled()
- Test validates all 5 races complete successfully
- Test measures total processing time (asserts <15s)
- Test validates database writes for all 5 races
- Test validates worker pool handles concurrent load
- Test validates connection pool doesn't saturate (max 10 connections)

---

### Story 2.16: Performance Benchmarking Tool

**As a** developer
**I want** standalone benchmarking tool to measure pipeline performance
**So that** I can validate 2x improvement target and identify bottlenecks

**Acceptance Criteria:**

- Benchmark script runs independent of main application
- Benchmark tests: 1 race, 5 races, 10 races (stress test)
- Benchmark reports: min, max, avg, p95, p99 durations
- Benchmark reports: fetch, transform, write breakdown
- Benchmark saves results to file (JSON or CSV)
- Benchmark can use real NZ TAB data or synthetic test data
- Benchmark validates target: 5 races <15s (pass/fail)

---

---

## Epic 3: REST API Layer

**Goal:** Provide drop-in API replacement matching Appwrite contract exactly

**Priority:** Must Have (Week 3)

**Dependencies:** Epic 2 (Data Pipeline producing data to serve)

**Estimated Stories:** 8-10

### Story 3.1: Express Server Setup with Middleware

**As a** developer
**I want** Express server configured with security and compression middleware
**So that** I have a production-ready HTTP server foundation

**Acceptance Criteria:**

- Express app created and exported
- Helmet middleware applied (security headers)
- Compression middleware applied (gzip)
- JSON body parser configured
- CORS configured (if needed for client)
- Error handling middleware (catch-all for 500 errors)
- Server listens on PORT from environment variable (default 7000)
- Graceful shutdown on SIGTERM/SIGINT (close connections, exit cleanly)

---

### Story 3.2: GET /api/meetings Endpoint

**As a** developer
**I want** GET /api/meetings endpoint with filtering by date and race_type
**So that** clients can query meetings matching Appwrite API contract

**Acceptance Criteria:**

- Endpoint: GET /api/meetings?date={YYYY-MM-DD}&raceType={type}
- Query parameters: date (optional), raceType (optional, values: 'thoroughbred', 'harness')
- Query database: meetings table with WHERE filters matching params
- Response format matches Appwrite schema exactly:
  ```json
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
- Response time <100ms (indexed query)
- Error handling: 400 for invalid params, 500 for DB errors

---

### Story 3.3: GET /api/races Endpoint

**As a** developer
**I want** GET /api/races endpoint with filtering by meeting_id
**So that** clients can query races for a specific meeting

**Acceptance Criteria:**

- Endpoint: GET /api/races?meetingId={id}
- Query parameter: meetingId (required)
- Query database: races table with WHERE meeting_id = {id}
- Response format matches Appwrite schema:
  ```json
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
- Response time <100ms
- Error handling: 400 if meetingId missing, 500 for DB errors

---

### Story 3.4: GET /api/entrants Endpoint with Embedded History

**As a** developer
**I want** GET /api/entrants endpoint with embedded odds_history and money_flow_history
**So that** clients can query complete entrant data with historical trends

**Acceptance Criteria:**

- Endpoint: GET /api/entrants?raceId={id}
- Query parameter: raceId (required)
- Query database: entrants table with JOIN to odds_history and money_flow_history
- Limit history: latest 50 records per entrant (configurable)
- Response format matches Appwrite schema:
  ```json
  [
    {
      "entrant_id": "ENT-001",
      "name": "Thunder Bolt",
      "runner_number": 1,
      "win_odds": 3.5,
      "place_odds": 1.8,
      "hold_percentage": 15.2,
      "is_scratched": false,
      "odds_history": [
        { "odds": 3.5, "type": "win", "timestamp": "2025-10-05T11:59:00Z" }
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
- Response time target: <100ms (indexed query, partitioned tables)
- Error handling: 400 if raceId missing, 500 for DB errors

---

### Story 3.5: API Response Type Validation

**As a** developer
**I want** API responses validated against Appwrite schema using Zod
**So that** client compatibility is guaranteed

**Acceptance Criteria:**

- Zod schemas defined for: MeetingResponse, RaceResponse, EntrantResponse
- Schemas match Appwrite API contract exactly (field names, types, structure)
- Responses validated with schema.parse() before sending (fail fast on mismatch)
- Validation errors logged with details
- Integration tests validate response schemas against expected structure

---

### Story 3.6: API Error Handling and Status Codes

**As a** developer
**I want** consistent error handling across all API endpoints
**So that** clients receive informative error messages with correct status codes

**Acceptance Criteria:**

- 400 Bad Request: invalid/missing query parameters
- 404 Not Found: resource not found (e.g., invalid raceId)
- 500 Internal Server Error: database errors, unexpected exceptions
- Error response format:
  ```json
  {
    "error": "Invalid query parameter",
    "details": "raceId is required"
  }
  ```
- All errors logged with context (endpoint, params, error details)
- No stack traces exposed in production (NODE_ENV=production)

---

### Story 3.7: API Performance Optimization - Query Tuning

**As a** developer
**I want** optimized database queries for all API endpoints
**So that** response times are consistently <100ms

**Acceptance Criteria:**

- All queries use indexes (validated via EXPLAIN ANALYZE)
- Queries use SELECT with explicit column lists (no SELECT \*)
- Queries use LIMIT where appropriate (e.g., latest 50 history records)
- Partitioned table queries include partition key in WHERE clause
- Connection pool reused (no new connection per request)
- Query performance logged (slow query warning if >100ms)

---

### Story 3.8: API Integration Tests with Client Contract Validation

**As a** developer
**I want** integration tests validating API responses match Appwrite contract
**So that** client application works without code changes

**Acceptance Criteria:**

- Test suite for GET /api/meetings (with/without filters)
- Test suite for GET /api/races (valid/invalid meetingId)
- Test suite for GET /api/entrants (with embedded history)
- Tests validate response status codes (200, 400, 404, 500)
- Tests validate response schemas match Appwrite exactly
- Tests validate response times <100ms
- Tests use test database with known seed data

---

### Story 3.9: API Documentation with OpenAPI/Swagger

**As a** developer
**I want** API documented using OpenAPI/Swagger specification
**So that** clients have clear reference for endpoint contracts

**Acceptance Criteria:**

- OpenAPI 3.0 spec created (YAML or JSON)
- All endpoints documented: /api/meetings, /api/races, /api/entrants
- Query parameters documented with types, required/optional, examples
- Response schemas documented with examples
- Error responses documented
- Swagger UI served at /api-docs (development only)
- Spec validated using Swagger validator

---

### Story 3.10: Client Application Integration Testing

**As a** developer
**I want** end-to-end integration test with actual client application
**So that** I can confirm zero client-side code changes required

**Acceptance Criteria:**

- Client application configured to use new backend URL
- Client application runs without errors
- Client application displays meetings, races, entrants correctly
- Client application receives real-time updates (polling works)
- Client application handles API errors gracefully
- No client-side code modifications required
- Integration test documented as passing in PRD

---

---

## Epic 4: Database Optimization & Partitioning

**Goal:** Implement time-series partitioning and optimization for production scale

**Priority:** Must Have (Week 4)

**Dependencies:** Epic 2 (Data Pipeline), Epic 3 (API Layer)

**Estimated Stories:** 6-8

### Story 4.1: Automated Daily Partition Creation

**As a** developer
**I want** automated creation of tomorrow's partitions every day at midnight
**So that** time-series data inserts succeed without manual intervention

**Acceptance Criteria:**

- PostgreSQL function: create_tomorrow_partitions() implemented
- Function creates partitions for: money_flow_history, odds_history
- Partition naming: {table}\_YYYY_MM_DD (e.g., money_flow_history_2025_10_06)
- Partition range: FOR VALUES FROM (date) TO (date + 1 day)
- Function scheduled via pg_cron extension (0 0 \* \* \* = midnight)
- Function logs partition creation (PostgreSQL logs or application logs)
- Function handles errors gracefully (e.g., partition already exists)

---

### Story 4.2: Automated Partition Archival (30-Day Retention)

**As a** developer
**I want** old partitions (>30 days) detached and archived automatically
**So that** database size is managed and query performance maintained

**Acceptance Criteria:**

- PostgreSQL function: archive_old_partitions() implemented
- Function detaches partitions older than 30 days
- Detached partitions can be backed up separately (not dropped immediately)
- Function scheduled via pg_cron (daily at 1am)
- Function logs partition detachment
- Detached partitions archived to backup storage (documented procedure)
- Old partitions dropped after backup confirmation (manual or automated)

---

### Story 4.3: Index Performance Validation with EXPLAIN ANALYZE

**As a** developer
**I want** all production queries validated with EXPLAIN ANALYZE
**So that** I can confirm indexes are used and queries are optimized

**Acceptance Criteria:**

- EXPLAIN ANALYZE run on all API endpoint queries
- EXPLAIN ANALYZE run on data pipeline queries (fetch races, upsert operations)
- Query plans documented showing index usage (Index Scan, Bitmap Index Scan)
- No Sequential Scans on large tables (meetings, races, entrants OK; history tables NOT OK)
- Slow queries identified and optimized (add indexes, rewrite queries)
- Query plan documentation included in code comments or separate doc

---

### Story 4.4: Connection Pool Monitoring and Tuning

**As a** developer
**I want** connection pool metrics logged and monitored
**So that** I can detect saturation and tune pool size if needed

**Acceptance Criteria:**

- Pool metrics logged on startup: max, min, idle timeout
- Pool metrics logged periodically (every 5 min): active connections, idle connections, waiting requests
- Pool saturation warning: log warning if active ≥ 90% of max
- Pool exhaustion error: log error if connection timeout reached
- Metrics available via health check endpoint (future enhancement)
- Documentation on tuning pool size based on workload

---

### Story 4.5: Query Performance Testing Under Load

**As a** developer
**I want** load testing on API endpoints with realistic concurrent requests
**So that** I can validate <100ms response time under production load

**Acceptance Criteria:**

- Load test simulates 10 concurrent API requests
- Load test uses realistic query patterns (meetings, races, entrants)
- Load test measures: min, max, avg, p95, p99 response times
- Load test validates: p95 <100ms for all endpoints
- Load test validates: connection pool doesn't saturate
- Load test identifies bottlenecks (slow queries, index misses)
- Load test results documented

---

### Story 4.6: Database Backup and Restore Procedures

**As a** developer
**I want** documented backup and restore procedures
**So that** I can recover from data loss or corruption

**Acceptance Criteria:**

- pg_dump backup script documented (full database dump)
- Backup schedule documented (daily, retention period)
- Backup storage location documented (local, cloud)
- Restore procedure documented (pg_restore from backup)
- Point-in-time recovery (PITR) procedure documented (if WAL archiving enabled)
- Backup test: restore to test database, validate data integrity
- Disaster recovery plan documented (RTO, RPO targets)

---

### Story 4.7: Partition Pruning Validation

**As a** developer
**I want** queries validated to use partition pruning
**So that** time-series queries only scan relevant partitions

**Acceptance Criteria:**

- EXPLAIN ANALYZE shows partition pruning for history queries
- Queries include event_timestamp in WHERE clause (enables pruning)
- Example: SELECT \* FROM money_flow_history WHERE entrant_id = X AND event_timestamp > NOW() - INTERVAL '7 days'
- Query plan shows only relevant partitions scanned (not all partitions)
- Documentation on writing partition-aware queries
- Performance comparison: with pruning vs without pruning (demonstrate speedup)

---

### Story 4.8: Database Migration Scripts Organization

**As a** developer
**I want** database migration scripts organized and versioned
**So that** schema changes are reproducible and traceable

**Acceptance Criteria:**

- Migrations stored in ./migrations directory (or similar)
- Migrations numbered sequentially: 001_initial_schema.sql, 002_add_indexes.sql
- Each migration includes: up migration (apply), down migration (rollback)
- Migration tool used: node-pg-migrate, Flyway, or manual scripts
- Migrations tracked in database: migrations table with version, timestamp
- Migrations documented in README or migration guide
- Migrations tested: apply, rollback, re-apply

---

---

## Epic 5: Migration & Deployment

**Goal:** Execute zero-downtime migration from Appwrite to Node.js/PostgreSQL

**Priority:** Must Have (Week 5)

**Dependencies:** Epic 1, 2, 3, 4 (All core functionality complete)

**Estimated Stories:** 10-12

### Story 5.1: Shadow Mode Deployment Infrastructure

**As a** developer
**I want** new stack deployed alongside Appwrite (not serving client traffic yet)
**So that** I can validate data consistency before cutover

**Acceptance Criteria:**

- New stack deployed to production environment
- New stack URL/port different from Appwrite (e.g., localhost:3001 vs 3000)
- New stack NOT accessible to client application yet
- Both systems running independently (separate databases)
- Both systems polling NZ TAB API (same races)
- Monitoring confirms both systems operational
- No impact on client application (still using Appwrite)

---

### Story 5.2: Data Consistency Validation Tool

**As a** developer
**I want** automated tool comparing Appwrite vs new stack outputs
**So that** I can validate data consistency before cutover

**Acceptance Criteria:**

- Tool queries both systems for same raceId
- Tool compares: meetings, races, entrants, odds, money flow
- Tool identifies differences (missing records, field mismatches, calculation errors)
- Tool calculates consistency percentage (e.g., 99.5% match)
- Tool generates comparison report (JSON or CSV)
- Tool runs continuously during shadow mode (every poll cycle)
- Acceptable drift threshold: <1% (configurable)

---

### Story 5.3: Feature Flag for Backend Selection

**As a** developer
**I want** feature flag controlling which backend the client uses
**So that** I can instantly switch traffic or rollback if needed

**Acceptance Criteria:**

- Environment variable: USE_NEW_BACKEND (true/false, default: false)
- Client application (or proxy) reads flag and routes to Appwrite or new stack
- Flag change takes effect immediately (no restart required, or <1 min restart)
- Flag documented in deployment guide
- Flag tested: switch from Appwrite → new stack → Appwrite (rollback)
- Rollback time measured: <5 minutes from decision to traffic shifted

---

### Story 5.4: Shadow Mode Validation - 48 Hours

**As a** test engineer
**I want** shadow mode running for 48 hours with continuous monitoring
**So that** I can validate stability and data consistency under real-world load

**Acceptance Criteria:**

- Shadow mode runs for 48 hours minimum
- Data consistency validation runs every 15 seconds (matches polling cycle)
- Consistency reports generated hourly
- New stack performance monitored: processing times, error rates, resource usage
- New stack compared to Appwrite: performance delta, consistency %, error delta
- Validation passes if: consistency >99%, performance target met, zero crashes
- Go/No-Go decision documented based on validation results

---

### Story 5.5: Gradual Traffic Cutover - 10% Phase

**As a** deployment engineer
**I want** 10% of client traffic routed to new stack
**So that** I can validate production behavior with minimal risk

**Acceptance Criteria:**

- Feature flag or load balancer routes 10% traffic to new stack
- 90% traffic remains on Appwrite
- Monitoring tracks: error rates, response times, user reports for both backends
- Validation period: 2-4 hours
- Success criteria: error rate ≤ Appwrite baseline, response times ≤ Appwrite, zero user complaints
- Rollback if any success criteria fails
- Go/No-Go decision for 50% phase

---

### Story 5.6: Gradual Traffic Cutover - 50% Phase

**As a** deployment engineer
**I want** 50% of client traffic routed to new stack
**So that** I can validate production behavior under significant load

**Acceptance Criteria:**

- Feature flag or load balancer routes 50% traffic to new stack
- 50% traffic remains on Appwrite
- Monitoring tracks: error rates, response times, performance metrics, resource usage
- Validation period: 4-8 hours
- Success criteria: error rate ≤ Appwrite baseline, response times <100ms, performance target met
- Rollback if any success criteria fails
- Go/No-Go decision for 100% phase

---

### Story 5.7: Full Traffic Cutover - 100% Phase

**As a** deployment engineer
**I want** 100% of client traffic routed to new stack
**So that** migration is complete and Appwrite can be decommissioned

**Acceptance Criteria:**

- Feature flag or load balancer routes 100% traffic to new stack
- Appwrite receives zero client traffic (kept running as backup)
- Monitoring tracks: error rates, response times, performance metrics, user feedback
- Validation period: 24 hours minimum
- Success criteria: error rate <1%, response times <100ms, performance target met, zero critical user reports
- Rollback capability maintained for 7 days
- Go/No-Go decision for Appwrite decommissioning

---

### Story 5.8: Performance Validation in Production

**As a** product owner
**I want** production performance measured and validated against 2x improvement target
**So that** I can confirm migration success

**Acceptance Criteria:**

- Measure: 5 concurrent races processing time (target <15s)
- Measure: single race processing time (target <2s)
- Measure: database write time per race (target <300ms)
- Measure: API response times (target <100ms p95)
- Compare: new stack vs Appwrite baseline (calculate improvement %)
- Results logged and reported
- Success: 2x improvement achieved (or better)
- Document actual performance: best case, worst case, average

---

### Story 5.9: Rollback Testing and Documentation

**As a** deployment engineer
**I want** rollback procedures tested and documented
**So that** I can confidently revert if issues arise

**Acceptance Criteria:**

- Rollback procedure documented: how to switch traffic back to Appwrite
- Rollback tested in staging: execute rollback, validate client traffic shifts
- Rollback time measured: target <5 minutes from decision to traffic shifted
- Rollback triggers documented: error rate spike, performance degradation, critical bug
- Rollback decision tree documented: who approves, what metrics justify rollback
- Rollback executed in production (test during 10% or 50% phase)

---

### Story 5.10: User Acceptance Testing (UAT)

**As a** product owner
**I want** user acceptance testing with real users during gradual cutover
**So that** I can validate user experience is acceptable

**Acceptance Criteria:**

- UAT conducted during 50% or 100% traffic phase
- Test scenarios: view races, detect patterns, place bets (external), verify data freshness
- UAT participants: power bettors (primary persona)
- Feedback collected: data freshness, pattern detection speed, any issues encountered
- Success criteria: zero "missed opportunity" reports, positive feedback on speed
- UAT results documented and inform Go/No-Go decision

---

### Story 5.11: Appwrite Decommissioning Plan

**As a** deployment engineer
**I want** documented plan for decommissioning Appwrite
**So that** resources are reclaimed safely after successful migration

**Acceptance Criteria:**

- Decommissioning plan documented: when, how, what to backup
- Plan includes: Appwrite data backup (full export), Appwrite config backup
- Plan includes: 7-day validation period after 100% cutover before decommissioning
- Plan includes: decommission steps (stop Appwrite, delete resources, confirm no dependencies)
- Plan executed only after 7-day validation passes
- Final data backup confirmed before resource deletion
- Decommissioning completion documented

---

### Story 5.12: Operations Runbook for New Stack

**As a** operations engineer
**I want** comprehensive runbook for operating new stack in production
**So that** I can troubleshoot issues and maintain system health

**Acceptance Criteria:**

- Runbook sections: deployment, monitoring, troubleshooting, rollback, disaster recovery
- Deployment: how to deploy new version, restart containers, apply migrations
- Monitoring: key metrics, dashboards, alerting thresholds
- Troubleshooting: common issues, logs locations, debugging steps
- Rollback: step-by-step rollback procedure
- Disaster recovery: backup restoration, failover procedures
- Runbook tested: walkthrough with operations team
- Runbook published in accessible location (wiki, docs repo)

---

---

## Appendix: Story Estimation Summary

| Epic                                         | Stories   | Estimated Points | Priority  |
| -------------------------------------------- | --------- | ---------------- | --------- |
| Epic 1: Core Infrastructure Setup            | 8-10      | 13-16            | Must Have |
| Epic 2: High-Performance Data Pipeline       | 13-16     | 22-28            | Must Have |
| Epic 3: REST API Layer                       | 8-10      | 13-16            | Must Have |
| Epic 4: Database Optimization & Partitioning | 6-8       | 8-13             | Must Have |
| Epic 5: Migration & Deployment               | 10-12     | 13-21            | Must Have |
| **Total**                                    | **45-56** | **69-94**        | -         |

**Velocity Assumptions:**

- Single developer (warrick)
- 5-week timeline
- Weeks 1-4: Development (Epics 1-4)
- Week 5: Migration (Epic 5)

**Risk Buffer:**

- 10-20% buffer built into estimates
- Critical path: Epic 1 → Epic 2 → Epic 5 (cannot parallelize)
- Parallelization opportunities: Epic 3 during Epic 2, Epic 4 during Epic 3

---

_This epic breakdown provides detailed stories ready for sprint planning and development. Each story includes clear acceptance criteria for implementation and testing._
