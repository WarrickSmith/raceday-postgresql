# Client Polling & Query Optimisation Plan - RaceDay v4.8 (Revised)

## Background & References

- **Framework & Hosting**: Next.js (App Router) frontend with Appwrite backend functions deployed independently; cron schedules defined in `appwrite.json` run in UTC. 【F:query-implementation-plan.md†L5-L20】【F:query-optimization-plan.md†L5-L23】
- **Server Polling Cadence**: Master scheduler (`/server/master-race-scheduler/src/main.js`) orchestrates enhanced race polling with cadence windows at T-65m+ (30m), T-5m to T-3m (30s), through post-start until status is Final; client can optionally halve intervals via `DOUBLE_POLLING_FREQUENCY`. 【F:polling_plan.md†L19-L60】
- **Key API Endpoints**: Race data `/client/src/app/api/race/[id]/route.ts`, money flow timeline `/client/src/app/api/race/[id]/money-flow-timeline/route.ts`, pools `/client/src/app/api/race/[id]/pools/route.ts`, entrants `/client/src/app/api/race/[id]/entrants/route.ts`. 【F:polling_plan.md†L62-L71】
- **Performance Findings**: Inefficient relationship queries, missing compound indexes, and payload bloat produce 45+ second responses; remediation requires scalar key backfills, `Query.select`, and incremental loading. 【F:query-optimization-plan.md†L9-L123】
- **Indexing Requirements**: Add `idx_race_entrant_time` on `money-flow-history` and `idx_race_active` on `entrants` once scalar keys exist; schedule creation during low-traffic windows. 【F:query-implementation-plan.md†L47-L89】
- **Documentation Assets**: `polling-monitor.png` for UI reference, `CLAUDE.md` for architecture notes, and `.env.example` for environment variables. 【F:polling_plan.md†L404-L532】

---

## Completed Work (Ordered)

### Task 1: Remove Real-time Functionality and Fix Infinite Loop
- **Status**: Completed
- **Priority**: Critical
- **Estimated Effort**: 8 hours

**Problem Statement**: Remove legacy real-time subscriptions, resolve the meetings page infinite fetch loop, and reset race experiences to fetch-only behavior to stabilise the client before introducing polling. 【F:polling_plan.md†L73-L118】

**Task Details**:
1. Removed real-time hooks (`useUnifiedRaceRealtime.ts`, `useOptimizedRealtime.ts`) and monitoring components across race and meetings surfaces.  
2. Corrected `useMeetingsPolling.tsx` dependency loop that caused runaway API calls.  
3. Converted race pages to single-fetch flows with retry support only.  
4. Deleted unused real-time utilities, contexts, tests, and types.  
5. Validated via TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), tests (`npm test`), and manual Playwright verification. 【F:polling_plan.md†L120-L190】

**Acceptance Criteria**:  
- [x] Real-time subscriptions removed.  
- [x] Meetings infinite loop fixed.  
- [x] Race pages load initial data without polling.  
- [x] No `any` types or lint violations.  
- [x] All legacy real-time code deleted. 【F:polling_plan.md†L132-L164】

**Testing Requirements**: Playwright MCP smoke tests, watch for infinite requests, ensure fetch-only rendering remains stable. 【F:polling_plan.md†L166-L177】

---

### Task 2: Create Client-Side Polling Infrastructure
- **Status**: Completed
- **Priority**: Critical
- **Estimated Effort**: 12 hours

**Problem Statement**: Establish a lightweight polling framework matching backend cadence with an optional 2× multiplier, deduplicated requests, and lifecycle management. 【F:polling_plan.md†L179-L229】

**Task Details**:
1. Built `useRacePolling` hook with typed configuration, dynamic intervals, and lifecycle state.  
2. Added cadence calculator respecting race timing windows and optional `DOUBLE_POLLING_FREQUENCY`.  
3. Implemented start/stop rules tied to race status transitions.  
4. Added exponential backoff retries, abort handling, and deduplication.  
5. Updated environment configuration, RaceContext integration, and `.env.example`.  
6. Verified via TypeScript, ESLint, Jest, and Playwright timing checks. 【F:polling_plan.md†L229-L318】

**Acceptance Criteria**:  
- [x] Dynamic interval adjustments across race phases.  
- [x] `DOUBLE_POLLING_FREQUENCY` toggle supported.
- [x] Automatic stop on finalised races.  
- [x] Request deduplication and retry logic validated.  
- [x] Full TypeScript coverage, tests, and docs updated. 【F:polling_plan.md†L318-L362】

**Testing Requirements**: Playwright validation of cadence changes, ensure no stacked requests, allow for busy server latency. 【F:polling_plan.md†L364-L372】

---

### Phase 1: Data Hygiene & Scalar Keys (Query Implementation)
- **Status**: Completed
- **Priority**: Critical
- **Estimated Effort**: 16 hours

**Problem Statement**: Populate reliable scalar `raceId` and `entrantId` attributes on entrants and money-flow documents, enforce them during ingestion, and backfill existing data to unlock indexed querying. 【F:query-implementation-plan.md†L22-L57】

**Task Details**:
1. Audited Appwrite collection schemas, extending attributes where necessary.  
2. Developed maintenance/backfill function scheduled via `appwrite.json` to populate missing scalar keys.  
3. Updated ingestion flows to require scalar IDs and reject incomplete payloads.  
4. Added monitoring/logging to detect future drift.  
5. Documented scalar-key requirements for operations. 【F:query-implementation-plan.md†L24-L56】

**Acceptance Criteria**:  
- [x] Entrant and money-flow documents expose scalar keys.  
- [x] Backfill job completes with zero missing keys.  
- [x] Ingestion enforces new attributes.  
- [x] Monitoring alerts on missing keys. 【F:query-implementation-plan.md†L40-L55】

**Testing Requirements**: Manual Appwrite verification, ingestion unit tests, log review to confirm clean data. 【F:query-implementation-plan.md†L49-L57】

---

### Phase 2: Index Provisioning (Query Implementation)
- **Status**: Completed
- **Priority**: High
- **Estimated Effort**: 10 hours

**Problem Statement**: Create compound indexes that align with scalar-key query patterns for entrants and money-flow history, ensuring predictable performance. 【F:query-implementation-plan.md†L59-L89】

**Task Details**:
1. Added index definitions for `idx_race_entrant_time` and `idx_race_active` in `server/database-setup/src/database-setup.js`.  
2. Documented deployment sequencing to avoid downtime.  
3. Provisioned indexes in environments, monitoring build impact.  
4. Captured verification logs and notes for operations. 【F:query-implementation-plan.md†L62-L88】

**Acceptance Criteria**:  
- [x] Index definitions merged into setup script.  
- [x] Production/test indexes marked `available`.  
- [x] Query performance improves on targeted routes.  
- [x] Ops notes circulated. 【F:query-implementation-plan.md†L71-L90】

**Testing Requirements**: Appwrite console verification, targeted query benchmarks, review of index build logs. 【F:query-implementation-plan.md†L84-L89】

---

### Phase 3: API Query Optimisation (Query Implementation)
- **Status**: Completed
- **Priority**: High
- **Estimated Effort**: 18 hours

**Problem Statement**: Refactor Next.js API routes to exploit new indexes, reduce payload size with `Query.select`, and enable incremental polling semantics for timelines. 【F:query-implementation-plan.md†L92-L129】

**Task Details**:
1. Updated race API to rely on scalar filters, remove relationship expansion, and limit fields.  
2. Refactored money-flow timeline API to use scalar keys, cursor pagination, and incremental limits.  
3. Adjusted shared TypeScript types to match trimmed payloads.  
4. Documented query behaviour updates for frontend integration. 【F:query-implementation-plan.md†L96-L123】

**Acceptance Criteria**:  
- [x] API handlers use indexed filters and `Query.select`.  
- [x] Incremental loading supported for timelines.  
- [x] Updated tests cover new logic.  
- [x] Documentation reflects query changes. 【F:query-implementation-plan.md†L100-L123】

**Testing Requirements**: `npm test`, `npm run lint`, targeted HTTP benchmarks, Appwrite log review for improved durations. 【F:query-implementation-plan.md†L117-L123】

---

## Remaining Work (Prioritised & De-duplicated)

### Task A: Implement Dynamic Polling Interval & Cadence Alignment
- **Status**: Not Started
- **Priority**: High
- **Estimated Effort**: 6 hours

**Problem Statement**: Finalise the polling interval calculator so client cadence mirrors backend scheduling windows and respects the optional doubling flag while coordinating with server cron jobs. 【F:polling_plan.md†L302-L347】【F:query-implementation-plan.md†L130-L154】

**Task Details**:
1. Complete `calculatePollingInterval` helper and integrate with race status transitions.  
2. Ensure polling halts for statuses `final`/`abandoned` and resumes on reactivation.  
3. Align with backend cadence documentation and avoid overlaps with cron ingestion windows (UTC awareness).  
4. Update `.env.example` and docs for cadence flags.  
5. Remove legacy interval utilities. 【F:polling_plan.md†L292-L332】【F:query-implementation-plan.md†L130-L154】

**Acceptance Criteria**:  
- [ ] Intervals match backend windows under normal/double modes.  
- [ ] Polling stops and resumes correctly on status changes.  
- [ ] Environment toggles documented and type-safe.  
- [ ] No residual legacy timing code.  
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` all pass without `any` types. 【F:polling_plan.md†L333-L347】

**Testing Requirements**: Automated tests covering interval outputs, Playwright scenarios validating stop/start logic, manual verification of cron alignment notes. 【F:polling_plan.md†L348-L357】【F:query-implementation-plan.md†L148-L154】

---

### Task B: Add Error Handling, Request Deduplication & Fallback UI
- **Status**: Not Started
- **Priority**: High
- **Estimated Effort**: 4 hours

**Problem Statement**: Provide resilient polling with exponential backoff, prevent concurrent fetch stacking, and enforce '-' fallbacks for missing values without introducing complex resilience patterns. 【F:polling_plan.md†L360-L430】

**Task Details**:
1. Implement simple retry handler class with capped exponential delays.  
2. Guard polling against overlapping requests using in-flight flags or AbortControllers.  
3. Render '-' for missing odds/pools/money flow data.  
4. Purge obsolete error-handling utilities. 【F:polling_plan.md†L370-L424】

**Acceptance Criteria**:  
- [ ] No stacked requests per endpoint.  
- [ ] Retry logic retries up to configured cap with logging.  
- [ ] UI consistently shows '-' placeholders.  
- [ ] Codebase free of deprecated error utilities and `any` types; TS, lint, tests pass. 【F:polling_plan.md†L424-L446】

**Testing Requirements**: Simulate network failures in unit tests and Playwright, validate placeholder rendering, ensure concurrency guard works. 【F:polling_plan.md†L438-L446】

---

### Task C: Coordinate Race Data Polling & Progressive Loading
- **Status**: Not Started
- **Priority**: High
- **Estimated Effort**: 7 hours

**Problem Statement**: Sequence polling across race, entrants, pools, and money-flow endpoints with shared cadence while progressively loading data to minimise payload impact. 【F:polling_plan.md†L448-L520】【F:query-implementation-plan.md†L130-L154】

**Task Details**:
1. Build `useCoordinatedRacePolling` (or extend existing hook) for sequential fetches with 200 ms spacing.  
2. Track timestamps for progressive loading—fetch essential race shell first, then entrants/pools, then incremental timelines leveraging cursor APIs.  
3. Ensure money-flow timeline uses incremental pagination per Phase 3 work.  
4. Remove legacy coordination logic. 【F:polling_plan.md†L452-L518】【F:query-optimization-plan.md†L115-L160】

**Acceptance Criteria**:  
- [ ] All race data sources poll together using sequential pattern.  
- [ ] Progressive loading ensures initial render fast with subsequent data hydration.  
- [ ] Timeline requests leverage incremental queries.  
- [ ] TS/lint/tests succeed with no `any` types. 【F:polling_plan.md†L512-L520】【F:query-optimization-plan.md†L133-L162】

**Testing Requirements**: Integration tests covering sequential polling, Playwright validation of progressive updates, monitoring logs for request spacing. 【F:polling_plan.md†L520-L531】

---

### Task D: Meetings Page Polling & Navigation Data
- **Status**: Not Started
- **Priority**: Medium
- **Estimated Effort**: 4 hours

**Problem Statement**: Deliver 5-minute meetings polling that feeds navigation buttons without regression of the fixed infinite loop. 【F:polling_plan.md†L520-L604】

**Task Details**:
1. Create meetings polling hook with 5-minute cadence while active races exist.  
2. Ensure `useMeetingsPolling.tsx` cleanup prevents dependency loops.  
3. Surface data for Next Scheduled Race/Next Race buttons on meetings and race pages.  
4. Remove outdated meetings polling code. 【F:polling_plan.md†L536-L594】

**Acceptance Criteria**:  
- [ ] Meetings poll at 5-minute intervals when applicable.  
- [ ] Navigation buttons consume fresh data.  
- [ ] No infinite loops or redundant fetches.  
- [ ] TS, lint, tests pass without `any` types. 【F:polling_plan.md†L584-L606】

**Testing Requirements**: Playwright navigation checks, timers verifying interval accuracy, regression tests on `useMeetingsPolling`. 【F:polling_plan.md†L600-L606】

---

### Task E: Developer Configuration & Polling Monitor
- **Status**: Not Started
- **Priority**: Medium
- **Estimated Effort**: 8 hours

**Problem Statement**: Provide environment-driven toggles and a consolidated Polling Monitor UI for observability while stripping legacy real-time counters. 【F:polling_plan.md†L606-L672】

**Task Details**:
1. Introduce `.env.local` variables (`DOUBLE_POLLING_FREQUENCY`, `NEXT_PUBLIC_POLLING_ENABLED`, `NEXT_PUBLIC_POLLING_DEBUG_MODE`, `NEXT_PUBLIC_POLLING_TIMEOUT`).  
2. Build Polling Monitor component (dev-only) above Enhanced Entrants Grid, referencing `polling-monitor.png`.  
3. Track request counts, error rates, and latency with lightweight state.  
4. Remove old connection monitoring UI. 【F:polling_plan.md†L612-L666】

**Acceptance Criteria**:  
- [ ] Monitor toggled via env var and hidden in production.  
- [ ] Header retains only Latency & Status.  
- [ ] Legacy counters removed.  
- [ ] Env vars documented and type-safe; TS/lint/tests clean. 【F:polling_plan.md†L666-L692】

**Testing Requirements**: Playwright layout checks, dev-mode toggle tests, unit tests for monitor metrics. 【F:polling_plan.md†L694-L701】

---

### Task F: Race Page Component Integration & UX Updates
- **Status**: Not Started
- **Priority**: Medium
- **Estimated Effort**: 6 hours

**Problem Statement**: Wire polling data into race page components with clear status indicators, maintaining smooth UX and removing residual real-time props/state. 【F:polling_plan.md†L702-L768】

**Task Details**:
1. Integrate `RacePageContent`, `EnhancedEntrantsGrid`, `RaceDataHeader`, and `RaceFooter` with polling hooks.  
2. Provide loading, updating, and error states with timestamps.  
3. Render '-' placeholders for missing data.  
4. Purge real-time-related props, effects, and comments. 【F:polling_plan.md†L708-L756】

**Acceptance Criteria**:  
- [ ] Components respond to polling updates seamlessly.  
- [ ] Real-time code removed.  
- [ ] UX remains smooth with clear update indicators.  
- [ ] TS/lint/tests succeed, no `any` types. 【F:polling_plan.md†L756-L774】

**Testing Requirements**: Playwright UI flows, snapshot/unit tests for component states, manual verification of '-' placeholders. 【F:polling_plan.md†L774-L782】

---

### Task G: Server Response Optimisation (Caching & Compression)
- **Status**: Not Started
- **Priority**: Medium
- **Estimated Effort**: 8 hours

**Problem Statement**: Optimise server-side responses with caching headers, optional shared cache helper, and compression to reduce payload size and align with polling cadence. 【F:query-implementation-plan.md†L130-L154】

**Task Details**:
1. Apply race-status-aware `Cache-Control` headers and Next.js `revalidate` settings.  
2. Evaluate short-lived cache helper (Redis/in-memory) for hot races.  
3. Enable compression middleware for large API payloads.  
4. Document cadence alignment with caching strategy. 【F:query-implementation-plan.md†L130-L154】【F:query-optimization-plan.md†L123-L170】

**Acceptance Criteria**:  
- [ ] API responses include appropriate cache headers.  
- [ ] Optional cache helper safely reduces repeated fetch cost.  
- [ ] Compression active without breaking clients.  
- [ ] Polling plan updated to reflect response optimisations.  
- [ ] TS/lint/tests pass, no `any` types introduced. 【F:query-implementation-plan.md†L130-L155】

**Testing Requirements**: cURL/browser header checks, payload size comparisons, performance metrics before/after, automated tests validating middleware. 【F:query-implementation-plan.md†L148-L154】

---

### Task H: End-to-End Testing & Validation
- **Status**: Not Started
- **Priority**: High
- **Estimated Effort**: 8 hours

**Problem Statement**: Validate polling reliability, cadence compliance, and resilience across browsers/devices with comprehensive automated coverage. 【F:polling_plan.md†L782-L842】

**Task Details**:
1. Expand integration tests covering cadence, status transitions, request dedup, and fallback rendering.  
2. Author Playwright scenarios for network interruptions, background tabs, and mobile breakpoints.  
3. Validate environment toggles and monitor instrumentation.  
4. Retire obsolete real-time tests. 【F:polling_plan.md†L794-L842】

**Acceptance Criteria**:  
- [ ] Integration & Playwright suites cover polling workflows.  
- [ ] Normal and double-frequency modes verified.  
- [ ] No request stacking or data regressions detected.  
- [ ] TS/lint/tests succeed with zero `any` types. 【F:polling_plan.md†L804-L842】

**Testing Requirements**: Full automated test suite runs (`npm test`, `npm run lint`, `npx tsc --noEmit`), Playwright MCP runs with sufficient wait windows. 【F:polling_plan.md†L834-L842】

---

### Task I: Documentation & Operational Runbooks
- **Status**: Not Started
- **Priority**: Low
- **Estimated Effort**: 4 hours

**Problem Statement**: Update architecture and troubleshooting documentation to describe the polling-only model, environment configuration, and response optimisations while purging real-time references. 【F:polling_plan.md†L842-L910】

**Task Details**:
1. Refresh `CLAUDE.md`, README sections, and any runbooks with polling architecture details.  
2. Document environment variables, cadence rules, and troubleshooting steps.  
3. Remove obsolete real-time diagrams/assets and update `polling_plan.md` references.  
4. Ensure docs match implemented caching/compression behaviour. 【F:polling_plan.md†L846-L906】

**Acceptance Criteria**:  
- [ ] Documentation reflects final polling approach and env vars.  
- [ ] All real-time references removed.  
- [ ] Troubleshooting guide actionable.  
- [ ] Docs build/tests (if any) pass; repository remains free of `any` types. 【F:polling_plan.md†L872-L906】

**Testing Requirements**: Proofread and link-check documentation, run standard TS/lint/test suite to ensure no incidental regressions. 【F:polling_plan.md†L900-L906】

---

## Success Metrics & Risk Watchlist

- **Success Metrics**: Cadence compliance, no concurrent fetches, error rate <5%, '-' fallback consistency, zero `any` types, ESLint/TypeScript/test suite all green, reduced payload sizes post-caching. 【F:polling_plan.md†L910-L964】【F:query-optimization-plan.md†L9-L123】
- **Risks**: Infinite loop regressions on meetings polling, backend load from misconfigured intervals, stale caches, inadequate testing coverage, or documentation drift. Mitigate via sequential polling, cadence audits, monitoring instrumentation, and disciplined validation per tasks above. 【F:polling_plan.md†L964-L1006】【F:query-optimization-plan.md†L123-L170】

