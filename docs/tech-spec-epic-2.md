# Technical Specification: Epic 2 - High-Performance Data Pipeline

Date: 2025-10-09
Author: warrick
Epic ID: 2
Status: Draft

---

## Overview

The PRD defines Epic 2 as the heart of the migration: a Node.js 22 pipeline that continuously fetches NZ TAB race data, transforms it with money-flow analytics, and persists results fast enough to unlock the 2× performance promise (<15 s for five concurrent races, <2 s for an individual race). This specification operationalizes that goal by grounding implementation in the validated solution architecture’s scheduler → fetcher → worker pool → bulk UPSERT sequence.

Delivering this epic ensures downstream epics have trustworthy, low-latency data. Success requires demonstrable processing ceilings (<300 ms database writes, resilient worker execution, structured telemetry) so the migration can enter shadow mode with confidence at the start of Week 5.

## Objectives and Scope

**In Scope**
- Build the NZ TAB HTTP client with retry, timeout, and Zod validation exactly as outlined in the PRD (Story 2.1 & 2.2).
- Stand up a three-worker thread pool and money-flow transform pipeline extracted from `server-old` (Stories 2.3 & 2.4).
- Implement transactional bulk UPSERTs and time-series inserts for meetings, races, entrants, money_flow_history, and odds_history tables (Stories 2.5 & 2.6).
- Deliver the race processor orchestrator, dynamic polling scheduler, and performance metrics logging that coordinate end-to-end flow (Stories 2.7 – 2.10).
- Provide fail-safe behaviors for worker crashes, fetch retries, and throughput benchmarking covering 1 and 5-race scenarios (Stories 2.11 – 2.15).

**Out of Scope**
- Real-time push/streaming delivery or WebSocket fan-out (deferred per PRD “Advanced Features”).
- Caching layers, read replicas, or Redis-backed acceleration (explicitly postponed in PRD “Explicitly Not Included”).
- Machine-learning driven predictions or anomaly detection (future work once high-frequency data foundation stabilizes).
- Client-side contract or UI changes (migration maintains drop-in compatibility per PRD constraints).

## System Architecture Alignment

The solution architecture prescribes a monolithic Node.js server with an adaptive scheduler feeding Axios-based fetchers, a three-worker thread pool for CPU-bound money-flow transforms, and bulk PostgreSQL UPSERT operations guarded by connection pooling. Epic 2 delivers these pre-approved components exactly, instrumenting them with the architecture’s performance telemetry so downstream API and migration phases can depend on consistent, measured outputs.

## Detailed Design

### Services and Modules

| Module | Responsibilities | Inputs | Outputs | Owner |
| --- | --- | --- | --- | --- |
| Scheduler (`scheduler/`) | Calculate dynamic polling cadence (15 s, 30 s, 60 s) based on time-to-post and keep race intervals updated (arch-spec “Component Responsibilities”). | Race metadata (start time, status), system clock, configuration env vars. | `setInterval` handles for each active race, interval change events logged via Pino. | Epic 2 Backend |
| NZ TAB Fetcher (`clients/nztab.ts`) | Fetch race payloads with Axios, retries, timeout, and structured logging (PRD Story 2.1). | Race ID, `NZTAB_API_URL`, API key headers, retry configuration. | `RaceData` JSON validated by Zod schemas, fetch telemetry metrics. | Epic 2 Backend |
| Worker Pool (`workers/worker-pool.ts`) | Maintain three worker threads that execute CPU-bound money-flow transforms without blocking the event loop (arch-spec §Worker Pool; Story 2.3). | Validated race payload, worker script path, task queue. | Transformed entrant and pool aggregates, worker status metrics, crash notifications. | Epic 2 Backend |
| Race Processor (`pipeline/race-processor.ts`) | Coordinate fetch → transform → write pipeline, orchestrate retries, and collect durations (arch-spec §Race Processor; Story 2.7 & 2.10). | Scheduler tick events, worker pool, database repositories, configuration for retries. | Persisted race artifacts, structured metrics (`fetch_ms`, `transform_ms`, `write_ms`, etc.), failure escalations. | Epic 2 Backend |
| Bulk UPSERT Services (`database/bulk-upsert.ts`) | Execute multi-row UPSERTs with transactional guarantees for meetings, races, entrants (Stories 2.5). | Transformed race aggregates, `pg` pool connection. | Atomic commits, change-bit detection via `WHERE` clause, rollback on failure. | Epic 2 Backend |
| Time-Series Writer (`database/time-series.ts`) | Append money_flow_history and odds_history batches with partition awareness (Story 2.6, arch-spec Time-Series Tables). | Time-series records with event timestamps, partition metadata, `pg` pool. | Batched INSERT statements routed to the correct partition, duration logs. | Epic 2 Backend |
| Metrics & Alerting (`observability/perf-logger.ts`) | Emit structured Pino logs for each processing cycle and trigger slow-path warnings (Story 2.10). | Timings from race processor, counts from worker pool and DB writers. | JSON logs and warning events consumed by observability stack. | Epic 2 Backend |

### Data Models and Contracts

#### meetings
- `meeting_id TEXT` primary key (format `{country}-{venue}-{YYYYMMDD}`, arch-spec Database Design).
- Key fields: `meeting_name`, `country`, `race_type` (`CHECK` on `'thoroughbred' | 'harness'`), `date`, `status`.
- Audit columns: `created_at`, `updated_at` with trigger to maintain timestamps.
- Index: `idx_meetings_date_type` on `(date, race_type)` filtered to `status = 'active'` (Epic 1 schema reused by Epic 2 writes).

#### races
- `race_id TEXT` primary key referencing `meetings`.
- Fields: `name`, `race_number`, `start_time`, `status`, optional `actual_start`.
- Foreign key: `meeting_id` with `ON DELETE CASCADE`.
- Valid statuses constrained to the legacy Appwrite list: `'open', 'closed', 'interim', 'final', 'abandoned'`; schema migration will introduce an identical `CHECK` constraint.
- Indexes: `idx_races_start_time` filtered to active statuses (`open`, `interim`) for hot queries, and `idx_races_meeting` for navigation (arch-spec Database Design).

#### entrants
- `entrant_id TEXT` primary key; ties to `races` via `race_id`.
- Fields: `name`, `runner_number`, **fixed** win/place odds, `hold_percentage`, `is_scratched`; legacy Appwrite fields `fixedWinOdds`/`fixedPlaceOdds` map 1:1 to PostgreSQL numeric columns (no other odds varieties stored).
- Indexes: `idx_entrants_race`, partial `idx_entrants_scratched` to filter active entrants.
- Updated timestamps mirrored via trigger for audit consistency.

#### money_flow_history (partitioned)
- Columns include `entrant_id`, `race_id`, hold/odds percentages, `time_to_start`, interval descriptors, pool amounts, incremental deltas (arch-spec Time-Series Tables).
- Ranged partition on `event_timestamp`; scheduler auto-creates daily partitions (e.g., `money_flow_history_2025_10_05`).
- Index `idx_money_flow_entrant_time` on `(entrant_id, event_timestamp DESC)` ensures fast historical lookups.

#### odds_history (partitioned)
- Contains `entrant_id`, `odds`, `type`, `event_timestamp`, with automatic partitions mirroring `money_flow_history`.
- Index `idx_odds_entrant_time` to support descending time queries for entrant odds evolution.

#### race_pools (shared dependency)
- Captures pool totals (`win_pool_amount`, `place_pool_amount`) and supports money-flow deltas per race. Types stay compatible with Appwrite `float` attributes via NUMERIC mappings.
- Maintains timestamped snapshots and downstream linkage for API responses (arch-spec Database Design §6).

#### Appwrite Compatibility Audit
- Legacy Appwrite collections enforced attribute-length and nullability limits via custom DBUtils; a migration audit will replicate those rules (e.g., text fields ≤255 chars, numeric precision) in PostgreSQL by adding equivalent `VARCHAR` lengths and `CHECK` constraints where needed.
- Before production cutover, run schema-diff scripts comparing PostgreSQL column types/defaults to `server-old` attribute metadata (see `server-old/database-setup/src/database-setup.js` around attribute definitions) to prevent regressions.

### APIs and Interfaces

| Interface | Signature / Shape | Purpose & Notes |
| --- | --- | --- |
| `fetchRaceData` | `fetchRaceData(raceId: string, opts?: FetchOptions): Promise<RaceData>` | Axios client with 5 s timeout, 3 retries (100 ms, 200 ms, 400 ms backoff). Parses response via `RaceDataSchema.parse`. Logged with start/end/attempt metadata (Story 2.1). |
| `RaceDataSchema` | `const RaceDataSchema = z.object({ ... })` | Zod schema set covering Race, Entrant, Odds, Pool, Meeting data. Provides `RaceData` types via `z.infer` and detailed validation errors (Story 2.2). |
| `workerPool.exec` | `exec(payload: RacePayload): Promise<TransformedRace>` | Queues work on available worker, requeues if all busy, auto-restarts crashed workers and retries tasks up to 3 times (Stories 2.3 & 2.11). |
| `bulkUpsertMeetings` | `bulkUpsertMeetings(records: Meeting[]): Promise<void>` | Performs single-transaction multi-row `INSERT ... ON CONFLICT DO UPDATE` with change detection `WHERE` clause; targets <300 ms per race (Story 2.5). |
| `bulkUpsertRaces` / `bulkUpsertEntrants` | `(records: Race[] | Entrant[]): Promise<void>` | Mirror meeting writer behavior for race and entrant aggregates, sharing instrumentation and rollback semantics (Story 2.5). |
| `insertMoneyFlowHistory` | `insertMoneyFlowHistory(rows: MoneyFlowRecord[]): Promise<void>` | Batches append-only inserts routed to correct partition; benchmarks 100/500/1000 row batches (Story 2.6). |
| `insertOddsHistory` | `insertOddsHistory(rows: OddsRecord[]): Promise<void>` | Append-only inserts with identical batching/partition logic as money-flow history (Story 2.6). Only fixed win/place odds are persisted; pool odds are excluded per product focus. |
| `RaceProcessor.process` | `process(raceId: string): Promise<ProcessResult>` | Composes fetch → transform → write pipeline, returns timings, surfaces failure causes, invoked via scheduler tick (Story 2.7). |
| `Scheduler.start` | `start(races: RaceSchedule[]): void` | Applies dynamic interval matrix (15 s, 30 s, 60 s), attaches `setInterval`, clears when race complete; logs interval changes (Story 2.9). |
| `PerfLogger.logCycle` | `logCycle(metrics: CycleMetrics): void` | Emits structured JSON metrics with thresholds (<2 s per race, <15 s batch) and warning logs when exceeded (Story 2.10). |

### Workflows and Sequencing

1. Scheduler bootstraps from active `races` and computes polling cadence based on time-to-start, maintaining 15 s cadence inside critical five-minute window (arch-spec Component Responsibilities; Story 2.9).
2. On each interval tick, `RaceProcessor.process` triggers `fetchRaceData`, which issues Axios request with retry/timeout guards; null response short-circuits downstream writes (Stories 2.1 & 2.12). All response timestamps are normalized to New Zealand local date/time (using `Pacific/Auckland`) before persistence to avoid UTC confusion.
3. Successful fetch payloads are validated via `RaceDataSchema` and dispatched to `workerPool.exec`; worker threads transform entrants and pool aggregates, emitting incremental deltas and metadata (Stories 2.2–2.4).
4. The processor awaits worker resolution and invokes bulk UPSERT services to persist normalized tables within a single transaction, then appends time-series batches to partitioned history tables (Stories 2.5 & 2.6).
5. After persistence, `PerfLogger` captures fetch/transform/write totals, logs JSON metrics, and emits warnings if thresholds exceeded; failures queue retries or bubble to alerting based on policy (Story 2.10 & 2.11).
6. Scheduler evaluates race status; completed or abandoned races clear their intervals, while active races continue the cycle with updated cadence (Story 2.9).

## Non-Functional Requirements

### Performance

- Meet PRD NFR001 by sustaining <15 s total duration for five concurrent races and <2 s per individual race; enforced through integration tests (Stories 2.13/2.14) and benchmark tooling (Story 2.15) using architecture’s baseline table (~6–9 s expectation).
- Ensure database operations complete in <300 ms (Story 2.5) via multi-row UPSERTs and partition-aware inserts; log precise timings for fetch, transform, write, batch totals to verify compliance.
- Maintain three-worker configuration (NFR011) with one CPU reserved for orchestrator/DB work; monitor worker queue depth to guard against load-induced regressions.

### Security

- Validate every NZ TAB response and worker interaction through Zod schemas (NFR009), rejecting malformed payloads before they touch the pipeline.
- Execute all database writes via parameterized queries and `pg` bindings to uphold SQL injection defenses (NFR014); no dynamic string concatenation permitted.
- Handle secrets (API keys, database credentials) strictly through the Epic 1 environment validation layer; Epic 2 code never logs sensitive headers and redacts error output, satisfying NFR012 expectations for external data sanitization.

### Reliability/Availability

- Deliver 99.9 % uptime during race hours (NFR004) by combining resilient scheduler intervals with automatic worker restart logic (Story 2.11) and retryable fetches (NFR005).
- Keep PostgreSQL connection utilization within the 10-connection pool budget (NFR003) by sharing pooled clients across writers and releasing them promptly after each transaction.
- Guarantee transactional safety: every race write occurs in a single `BEGIN/COMMIT` block with rollback on failure, preventing partial persistence and enabling quick replays.

### Observability

- Capture structured JSON metrics for every cycle (Story 2.10) including `fetch_ms`, `transform_ms`, `write_ms`, totals, and success/failure counts, feeding future dashboards cited in the solution architecture.
- Emit warning-level logs whenever thresholds breach (<2 s single race, <15 s batch) so operators can react before SLA impact; integrate with the existing Pino logger standard.
- Maintain traceability by tagging logs with `raceId`, scheduler interval, worker ID, and database batch sizes, enabling correlation across pipeline, database, and future API telemetry.

## Dependencies and Integrations

**Runtime & Platform**
- Node.js ≥22.0.0 (package engines requirement) deployed inside Docker (4 CPU / 4 GB) per PRD NFR010.
- PostgreSQL 18 primary instance with partitioned tables and 10-connection pool (PRD goals, architecture database plan).

**NPM Runtime Dependencies** (from `server/package.json`)
- `express@^4.21.2` – health checks and eventual REST layer entry point (shared with Epic 3).
- `compression@^1.8.1` – response compression (currently minimal impact but configured).
- `helmet@^8.1.0` – security headers to satisfy NFR013.
- `pg@^8.16.3` & `pg-format@^1.0.4` – PostgreSQL client with safe identifier formatting.
- `dotenv@^16.6.1` – environment management (reused from Epic 1 validation).
- `pino@^9.5.0` – structured logging for performance metrics.
- `zod@^3.25.76` – runtime validation for NZ TAB responses and worker messages.

**Build/Test Tooling**
- `typescript@^5.7.0`, `tsx@^4.19.0` – TypeScript compilation and runtime.
- `vitest@^2.0.0` with `@vitest/coverage-v8@^2.1.9` – unit/integration testing, coverage.
- `eslint@^9.0.0`, `@typescript-eslint/*@^8.0.0`, `prettier@^3.3.0`, `husky@^9.1.7`, `lint-staged@^15.5.2` – linting/formatting gates referenced by PRD NFR007–NFR017.

**External Integrations**
- NZ TAB REST API – primary data source, accessed on 15 s/30 s/60 s cadence with API key auth (PRD “Data Pipeline” requirements).
- `server-old` codebase – legacy source for money-flow logic; extracted and wrapped in worker threads (PRD Story 2.4 dependency).
- Observability sink – structured logs forwarded to existing logging stack (per solution architecture; no new vendor introduced in Epic 2).

## Acceptance Criteria (Authoritative)

1. `fetchRaceData` uses the `NZTAB_API_URL` base, applies API key headers, and enforces a configurable 5 s timeout.
2. The fetcher retries transient timeouts/5xx responses up to three times with 100 ms, 200 ms, 400 ms exponential backoff while logging attempts and outcomes.
3. All NZ TAB responses pass through `RaceDataSchema.parse`; invalid payloads emit structured validation errors and never introduce `any` types.
4. Worker pool bootstraps exactly three worker threads on startup, exposes idle/busy status, and queues tasks when all workers are occupied.
5. Worker crashes trigger automatic restart and the offending task is retried up to three times before surfacing a failure.
6. Money-flow transform reproduces server-old calculations (hold/bet percentages, incremental deltas, interval metadata) and passes regression tests against legacy fixtures.
7. `bulkUpsertMeetings`, `bulkUpsertRaces`, and `bulkUpsertEntrants` execute multi-row `INSERT ... ON CONFLICT DO UPDATE` inside a single transaction, enforce valid status enumerations, and log duration targeting <300 ms.
8. UPSERT statements include change-detection `WHERE` clauses so unchanged rows are skipped without touching updated_at timestamps.
9. `insertMoneyFlowHistory` and `insertOddsHistory` route each record to the correct date partition, execute in append-only batches of 100/500/1000 rows, and record batch durations.
10. Time-series insert batches wrap in a single transaction and roll back cleanly on any failure.
11. `processRace` runs fetch → transform → write sequentially, logs step timings, and returns <2 s total processing duration under nominal load.
12. `processRaces` leverages `Promise.allSettled` to process up to five race IDs concurrently, capturing max duration <15 s while isolating per-race failures.
13. Retry strategy treats irrecoverable fetch errors as `null` results so the race processor can safely skip downstream writes and still log the failure.
14. Scheduler recalculates time-to-start every minute, applies 15 s/30 s/60 s polling intervals accordingly, and clears timers once a race completes or is abandoned.
15. Scheduler emits logs for interval changes, race scheduling actions, and race completion/abandonment events.
16. Metrics logger produces structured JSON with `raceId`, `fetch_ms`, `transform_ms`, `write_ms`, `total_ms`, success/failure counts, and warning logs beyond <2 s/<15 s thresholds.
17. Single-race integration test (Story 2.13) proves data flows through fetch → worker → UPSERT → history tables with <2 s elapsed time.
18. Five-race integration test (Story 2.14) processes concurrent pipelines in <15 s total while keeping PostgreSQL pool utilization ≤10 connections.
19. Benchmark tool (Story 2.15) records min/max/avg/p95/p99 durations for 1, 5, and 10 race runs and persists results to disk (JSON/CSV).
20. Performance telemetry includes row counts for UPSERT/time-series batches so operations can be correlated with duration and capacity planning.
21. PostgreSQL schema mappings are validated against legacy Appwrite attribute definitions (type, length, required flags) with documented diffs prior to migration.
22. Pipeline filters and stores only fixed win/place odds; unit tests fail if tote/pool odds sneak into transformed records.
23. All persisted timestamps representing race or meeting schedule are converted to `Pacific/Auckland` local time (with UTC offsets retained for reference where needed).

## Traceability Mapping

| AC # | Spec Section(s) | Components / APIs | Test Idea |
| --- | --- | --- | --- |
| 1,2,13 | Detailed Design › Services & Modules (NZ TAB Fetcher), APIs › `fetchRaceData` | `clients/nztab.ts`, retry policy | Simulate timeout & 5xx responses, assert exponential retry, redaction, and null handoff on terminal failure. |
| 3 | Detailed Design › APIs & Interfaces (`RaceDataSchema`) | Zod schemas, validation layer | Feed malformed payload fixture, assert schema error details and absence of `any` through TypeScript build. |
| 4,5,12 | Detailed Design › Worker Pool & Race Processor | `workerPool.exec`, `processRaces` | Force worker crash mid-task and verify automatic restart plus `Promise.allSettled` surfaces only failed race. |
| 6,7,8 | Detailed Design › Data Models & Bulk UPSERT Services | `bulkUpsert*` functions, normalized tables | Seed baseline data, rerun UPSERT with identical payload, confirm change-detection prevents unnecessary updates. |
| 9,10,20 | Detailed Design › Time-Series Writer & Observability | `insertMoneyFlowHistory`, metrics logger | Run batch inserts across 100/500/1000 row sets, assert partition routing, transaction rollback, and logged row counts. |
| 11,14,15,16 | Detailed Design › Workflows & Sequencing, Observability | `processRace`, scheduler, perf logger | Execute full pipeline with synthetic schedule, validate <2 s total, interval transitions, and structured warning logs. |
| 17,18 | Acceptance Criteria › Integration Tests | `tests/integration/pipeline.spec.ts` (new) | Implement integration specs for single and five-race scenarios, measuring timings and connection usage. |
| 19 | Dependencies & Integrations › Benchmark Tooling | `scripts/benchmark.ts` | Run benchmark script, verify metrics persisted and thresholds flagged when exceeding limits. |
| 21 | Detailed Design › Appwrite Compatibility Audit | Migration audit scripts | Compare PostgreSQL schema metadata against `server-old` DBUtils definitions; fail pipeline when mismatches found. |
| 22 | Detailed Design › APIs & Interfaces (`insertOddsHistory`) | Transform unit tests | Assert fixtures containing tote odds are dropped while fixed odds persist, mirroring product requirements. |
| 23 | Workflows & Sequencing; Risks | Time normalization helpers | Inject NZTAB response with UTC timestamp, assert stored record reflects `Pacific/Auckland` local time and offset metadata. |

## Risks, Assumptions, Open Questions

- **Risk:** Worker crash loops could starve the pipeline if restart logic fails. *Mitigation:* Implement health checks on worker heartbeat, cap retries per task (Story 2.11), and emit alerts when restart frequency exceeds threshold.
- **Risk:** NZ TAB API rate limits or latency spikes above assumed thresholds could break the <15 s target. *Mitigation:* Capture real response timings during benchmarking, add adaptive backoff, and coordinate with NZ TAB support before Week 5 cutover (PRD Open Question #1/#2).
- **Risk:** Connection pool saturation during five-race bursts may exceed 10 connections. *Mitigation:* Instrument pool usage, share pooled clients across writers, and introduce guardrails that delay new batches when utilization crosses 80 % (PRD NFR003).
- **Risk:** Timezone drift between UTC storage and NZ-local scheduling could trigger incorrect polling windows. *Mitigation:* Centralize `Pacific/Auckland` conversions via a utilities module with regression tests, and log both local time and UTC for observability.
- **Assumption:** Daily partition creation job runs successfully before new data ingestion. *Action:* Verify scheduler task from Epic 4 is available or create interim CLI to ensure partitions exist ahead of processing.
- **Question:** Do we have authoritative fixtures from `server-old` for money-flow regression? *Next Step:* Confirm with migration lead; if absent, capture live shadow-mode data before replacing production pipeline.

## Test Strategy Summary

- **Unit Tests:** Cover fetch retry logic, Zod schema validation, worker pool queuing/restart behavior, and UPSERT SQL builders using Vitest with mocked `pg` clients.
- **Integration Tests:** New suites for single-race and five-race pipelines hitting a test database, seeded via fixtures, verifying data persistence, timing thresholds, and connection usage (Stories 2.13 & 2.14).
- **Benchmarking:** Standalone script (Story 2.15) executed in CI on demand and pre-release; persists stats for trend analysis and ensures <15 s/<2 s targets remain satisfied.
- **Regression Fixtures:** Snapshot transformed outputs against `server-old` results to guard against drift in money-flow calculations during refactors.
- **Schema Compatibility Audit:** Automated check comparing PostgreSQL column metadata with Appwrite attribute definitions (type, nullability, length) using migration scripts; fails CI when mismatches arise.
- **Timezone Normalization Tests:** Unit tests validating conversions to `Pacific/Auckland` and ensuring stored records include both local time and UTC reference.
- **Observability Checks:** Automated assertions ensuring metrics logs include race IDs, durations, warning escalations, and timezone context; integrate with log-based tests or linting to catch missing fields early.

## Post-Review Follow-ups

**From Story 2.5 Senior Developer Review (2025-10-12):**
- **[High]** Fix 68 ESLint template literal errors in [server/src/database/bulk-upsert.ts](../server/src/database/bulk-upsert.ts) - Convert `paramIndex` to `String(paramIndex)` before template interpolation (AC9, lines 58, 160, 249)
- **[High]** Fix 26 ESLint unsafe `any` value access errors in [server/tests/integration/database/bulk-upsert.integration.test.ts](../server/tests/integration/database/bulk-upsert.integration.test.ts) - Add type assertions to `persisted.rows[0]` (AC9, lines 166-342)
- **[High]** Fix failing unit test in [server/tests/unit/database/bulk-upsert.test.ts:143-144](../server/tests/unit/database/bulk-upsert.test.ts#L143-L144) - Update parameter index expectations to match 8-field meeting schema (AC8)
- **[High]** Unskip transaction rollback integration test - Refactor [server/src/database/bulk-upsert.ts](../server/src/database/bulk-upsert.ts) to accept table name parameter (AC5/AC6)
- **[Med]** Document UPSERT query plans with `EXPLAIN ANALYZE` using [server/src/database/query-validator.ts](../server/src/database/query-validator.ts) - Validate INDEX SCAN on primary key and confirm UPDATE skipped when WHERE clause false (AC4)
- **[Med]** Add foreign key constraint violation test for AC6 error handling - Simulate entrant UPSERT with nonexistent race_id
- **[Med]** Evaluate parallel UPSERT execution for independent tables (meetings + races concurrently before entrants) - Performance optimization
- **[Low]** Add inline comment documenting all 22 entrant fields in [server/src/database/bulk-upsert.ts:280-286](../server/src/database/bulk-upsert.ts#L280-L286) - Maintainability
- **[Low]** Integrate `pg-pool-monitor` for connection pool metrics in production - Observability
- **[Low]** Load Story 2.4 regression fixtures once [H1] lands - Blocked dependency
