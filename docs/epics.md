# Raceday PostgreSQL - Epic Index

This index mirrors the canonical planning document `docs/epic-stories-2025-10-05.md` and is maintained so automated workflows can resolve upcoming story definitions per epic. For full detail (including context, rationale, and downstream stories) see the primary epic breakdown document.

## Epic 2: High-Performance Data Pipeline

### Story 2.4: Money Flow Calculation Transform Logic

**As a** developer  
**I want** money flow calculation logic extracted from server-old and implemented in worker  
**So that** I can transform raw NZ TAB data into calculated money flow patterns

**Acceptance Criteria:**

1. Transform logic extracted from ./server-old codebase
2. Money flow calculations implemented per-race, per-entrant, over time
3. Calculations include: hold_percentage, bet_percentage, win_pool_percentage, place_pool_percentage
4. Calculations include: incremental amounts (change from previous poll)
5. Calculations include: time_to_start, time_interval, interval_type
6. Transform accepts raw NZ TAB data, returns structured money flow data
7. Transform logic validated against server-old outputs (test cases)
8. No `any` types in transform logic

### Story 2.5: Bulk UPSERT Database Operations

**As a** developer  
**I want** bulk UPSERT operations using multi-row INSERT with ON CONFLICT  
**So that** I can write entire race data in single transaction (<300ms)

**Acceptance Criteria:**

1. `bulkUpsertMeetings(meetings: Meeting[])` function implemented
2. `bulkUpsertRaces(races: Race[])` function implemented
3. `bulkUpsertEntrants(entrants: Entrant[])` function implemented
4. Multi-row INSERT with `ON CONFLICT (primary_key) DO UPDATE`
5. Conditional `WHERE` clause prevents unnecessary writes when data unchanged
6. Single transaction per race (`BEGIN / COMMIT`)
7. Error handling with rollback on failure
8. Performance logging (duration per operation)
9. Target: `<300ms` per race write operation

### Story 2.6: Time-Series Data Insert Operations

**As a** developer
**I want** efficient INSERT operations for time-series tables (money_flow_history, odds_history)
**So that** I can store historical data without UPSERT overhead

**Acceptance Criteria:**

1. `insertMoneyFlowHistory(records: MoneyFlowRecord[])` function implemented
2. `insertOddsHistory(records: OddsRecord[])` function implemented
3. Multi-row INSERT (no `ON CONFLICT` - always append)
4. Batch size optimization (test 100, 500, 1000 rows per batch)
5. Automatic partition detection (insert into correct partition based on event_timestamp)
6. Single transaction per batch
7. Error handling with rollback
8. Performance logging (rows inserted, duration)

### Story 2.7: Race Processor Orchestrator

**As a** developer
**I want** race processor that orchestrates fetch → transform → write pipeline
**So that** I can process a complete race in <2s end-to-end

**Acceptance Criteria:**

1. `processRace(raceId: string)` function implemented
2. Pipeline steps: fetch → transform (worker) → write (bulk UPSERT)
3. Steps executed sequentially (await each step)
4. Performance tracking: measure duration for fetch, transform, write, total
5. Error handling: retry fetch on failure, log transform errors, rollback DB writes on failure
6. Logging for: pipeline start, each step completion, pipeline end
7. Return processing duration for metrics
8. Target: <2s total processing time per race

### Story 2.8: Parallel Race Processing with Promise.all()

**As a** developer
**I want** parallel processing of up to 5 concurrent races
**So that** I can process multiple races within a single 15-second window

**Acceptance Criteria:**

1. `processRaces(raceIds: string[])` function implemented
2. Uses `Promise.allSettled()` to process all races in parallel
3. Each race processed independently (no shared state except connection pool)
4. Failed races logged but don't block other races
5. Performance tracking: measure max duration across all races
6. Logging for: batch start, individual race completion, batch end
7. Return processing results for all races (success/failure, durations)
8. Target: 5 races processed in <15s

### Story 2.9: Daily Baseline Data Initialization

**As a** system operator
**I want** automated daily fetching of meetings, races, and initial race data early in the race day
**So that** the scheduler has race times available and baseline data is pre-populated before real-time polling begins

**Status:** ✅ **COMPLETE** (2025-10-16)

**Acceptance Criteria:**

1. Daily initialization function runs early morning (6:00 AM NZST) before scheduler activates
2. Function fetches all meetings for current NZ race day from NZ TAB API
3. Function fetches all race details (times, entrants, initial odds) for those meetings
4. Function uses NZ timezone fields (race_date_nz, start_time_nz) from API - no UTC conversion needed
5. Function populates database tables: meetings, races (with start_time), entrants (with initial data)
6. Function uses bulk UPSERT operations for efficient data loading
7. Function handles API failures gracefully with retry logic (max 3 retries)
8. Function completes before dynamic scheduler starts (by 7:00 AM NZST)
9. Function logs completion statistics: meetings fetched, races created, entrants populated, execution duration
10. Scheduler queries database for races with start_time >= NOW() to begin polling operations
11. Database queries use race_date_nz field for partition key alignment (NZ racing day boundary)
12. Optional: Second evening job (post-races, e.g., 9:00 PM NZST) for comprehensive historical backfill if needed

### Story 2.10: Dynamic Scheduler with Time-Based Intervals

**As a** developer
**I want** scheduler that adjusts polling frequency based on time-to-start
**So that** I can poll at 15s intervals during critical 5-minute window

**Acceptance Criteria:**

1. Scheduler queries database for upcoming races
2. For each race, calculates time-to-start
3. Determines polling interval: ≤5 minutes: 15 seconds / 5-15 minutes: 30 seconds / >15 minutes: 60 seconds
4. Schedules race processing using setInterval per race
5. Clears interval when race completes or is abandoned
6. Scheduler runs continuously, re-evaluating intervals every minute
7. Logging for: interval changes, race scheduling, race completion

**Status:** ✅ **COMPLETE** (2025-10-14)

### Story 2.11: Performance Metrics Tracking

**As a** developer
**I want** detailed performance metrics logged for every processing cycle
**So that** I can monitor and optimize system performance

**Acceptance Criteria:**

1. Metrics logged for each race: fetch_duration, transform_duration, write_duration, total_duration
2. Metrics logged for batch: max_duration, race_count, success_count, failure_count
3. Metrics include raceId for correlation
4. Slow processing warnings: log warning if total_duration >2s (single race) or >15s (batch)
5. Metrics formatted as structured JSON (Pino)

### Story 2.12: Worker Thread Error Handling and Restart

**As a** developer
**I want** worker threads to restart automatically on crash
**So that** temporary failures don't cause permanent system degradation

**Acceptance Criteria:**

1. Worker pool listens for worker 'error' and 'exit' events
2. On worker crash: log error details, create new worker, add to pool
3. Crashed worker's pending task requeued for retry
4. Max retry attempts per task: 3 (fail task after 3 worker crashes)
5. Worker restart doesn't impact other workers or main event loop
6. Logging for: worker crash, worker restart, task retry, task failure

### Story 2.13: Fetch Timeout and Error Handling

**As a** developer
**I want** robust timeout and error handling for NZ TAB API fetches
**So that** transient network issues don't cause processing failures

**Acceptance Criteria:**

1. Fetch timeout: 5 seconds (configurable via environment variable)
2. Network errors caught and logged with details
3. HTTP 4xx errors (client errors) logged but not retried
4. HTTP 5xx errors (server errors) retried with exponential backoff
5. Timeout errors retried with exponential backoff
6. Max retries: 3 attempts
7. Final failure logged with full context (raceId, attempt count, error details)
8. Failed fetches return null (gracefully handled by race processor)

### Story 2.14: Integration Test - Single Race End-to-End

**As a** developer
**I want** integration test for single race fetch → transform → write
**So that** I can validate the complete pipeline works correctly

**Acceptance Criteria:**

1. Test fetches real or mocked NZ TAB data for single race
2. Test validates data transformation (money flow calculations correct)
3. Test validates database writes (data appears in all tables)
4. Test measures processing time (asserts <2s)
5. Test validates data consistency (no missing entrants, correct relationships)
6. Test cleans up database after completion (transaction rollback or test database)

### Story 2.15: Integration Test - 5 Concurrent Races

**As a** developer
**I want** integration test for 5 concurrent races processed in parallel
**So that** I can validate performance target (<15s)

**Acceptance Criteria:**

1. Test processes 5 races in parallel using `Promise.allSettled()`
2. Test validates all 5 races complete successfully
3. Test measures total processing time (asserts <15s)
4. Test validates database writes for all 5 races
5. Test validates worker pool handles concurrent load
6. Test validates connection pool doesn't saturate (max 10 connections)

### Story 2.16: Performance Benchmarking Tool

**As a** developer
**I want** standalone benchmarking tool to measure pipeline performance
**So that** I can validate 2x improvement target and identify bottlenecks

**Acceptance Criteria:**

1. Benchmark script runs independent of main application
2. Benchmark tests: 1 race, 5 races, 10 races (stress test)
3. Benchmark reports: min, max, avg, p95, p99 durations
4. Benchmark reports: fetch, transform, write breakdown
5. Benchmark saves results to file (JSON or CSV)
6. Benchmark can use real NZ TAB data or synthetic test data
7. Benchmark validates target: 5 races <15s (pass/fail)

---

_For additional epics, see `docs/epic-stories-2025-10-05.md`._
