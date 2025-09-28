# Client Polling & Query Optimisation Plan - RaceDay v4.8 (Revised)

## Background & References

- **Framework & Hosting**: Next.js (App Router) frontend with Appwrite backend functions deployed independently; cron schedules defined in `appwrite.json` run in UTC. Server functions are deployed independently via Appwrite Functions with data source configured via `server/database-setup/src/database-setup.js`.

- **Server Polling Cadence**: Master scheduler (`/server/master-race-scheduler/src/main.js`) orchestrates enhanced race polling with cadence windows: T-65m+ (30 minute intervals), T-5m to T-3m (30 second intervals), through post-start until status is Final. Client can optionally halve intervals via `DOUBLE_POLLING_FREQUENCY`. The master scheduler runs every 1 minute via CRON and coordinates high-frequency polling via enhanced-race-poller.

- **Key API Endpoints**:

  - Race data: `/client/src/app/api/race/[id]/route.ts`
  - Money flow timeline: `/client/src/app/api/race/[id]/money-flow-timeline/route.ts`
  - Pools: `/client/src/app/api/race/[id]/pools/route.ts`
  - Entrants: `/client/src/app/api/race/[id]/entrants/route.ts`

- **Performance Context**: Initial analysis revealed 45+ second response times for single race queries due to inefficient relationship queries, missing compound indexes, and payload bloat. Remediation involved scalar key backfills, `Query.select` implementation, and incremental loading patterns. Key optimizations included:

  - Database scalar keys: Populated reliable `raceId` and `entrantId` attributes on entrants and money-flow documents
  - Compound indexes: Added `idx_race_entrant_time` on money-flow-history and `idx_race_active` on entrants
  - Query optimization: Refactored APIs to use indexed filters, field selection, and cursor-based pagination
  - Performance improvements: 45s → 2-5s queries (90% improvement), 60-70% payload reduction

- **Indexing Implementation**: Critical database indexes were provisioned to support scalar-key query patterns:

  - `money-flow-history`: `idx_race_entrant_time` (raceId, entrantId, timeInterval)
  - `entrants`: `idx_race_active` (raceId, isScratched)
  - Deployment sequencing ensures attributes are available before index creation during low-traffic windows

- **Environment Configuration**:

  - `DOUBLE_POLLING_FREQUENCY`: Enable 2x polling frequency (default: false)
  - `NEXT_PUBLIC_POLLING_ENABLED`: Toggle polling functionality
  - `NEXT_PUBLIC_POLLING_DEBUG_MODE`: Enable debug logging
  - `NEXT_PUBLIC_POLLING_TIMEOUT`: Request timeout settings
  - Connection monitoring: `NEXT_PUBLIC_ENABLE_CONNECTION_MONITOR` for development UI

- **Implementation Context**: Previous phases completed include real-time functionality removal, client-side polling infrastructure creation, data hygiene improvements, index provisioning, API query optimization, and dynamic polling interval implementation. The application now uses a coordinated polling architecture with error handling, request deduplication, and progressive loading patterns.

---

## Remaining Work (Prioritised & De-duplicated)

### Task 1: Meetings Page Polling & Navigation Data

- **Status**: Not Started
- **Priority**: Medium
- **Estimated Effort**: 4 hours

**Problem Statement**: Deliver 5-minute meetings polling that feeds navigation buttons without regression of the fixed infinite loop. The meetings page requires controlled polling to update navigation elements while preventing the dependency loops that caused runaway API calls.

**Task Details**:

1. Create meetings polling hook with 5-minute cadence while active races exist.
2. Ensure `useMeetingsPolling.tsx` cleanup prevents dependency loops.
3. Surface data for Next Scheduled Race/Next Race buttons on meetings and race pages.
4. Remove outdated meetings polling code that may interfere with new implementation.
5. Implement Databse Connection check on initial page render - Show a modern design, friendly, RacDay data is unavilable message with a re-try connection button to effect a manula re-connect.
6. When the Databse returns no meetings data, show a modern design, friendly, 'No Meeting Information is currently available' message with a re-check meeting data connection button to effect a manula refresh of meetings data (although the polling should automatically fetch this when available and refresh the page).
7. Update the Meetings card to reduce card component height by removinng the meetingId value, and combine the racee type (HARNESS/THROUGHBRED), Meeting Status (Upcoming) and Meeting start time, on the same row as the Meeting Name to the right of the meeting name. Keep the Flag Icon right justified in the component.

DEVELOPMENT NOTES:

- Connection health should be established before any data fetching occurs. Fectch requests should check connection status before fetching to prevent failed fetch requests.
- Connection health and status should be determined on initial render, maybe display a Connection Status indicator with 'Connecting to Data..', Connected' or 'Disconnected'.\*
- A Disconnected state dhould have an automatic reconnect attempt, say every minute and a manual reconnect button.

**Acceptance Criteria**:

- [ ] Updated Meeting Card displays as expected.
- [ ] Meetings poll at 5-minute intervals when applicable.
- [ ] Navigation buttons consume fresh data.
- [ ] No infinite loops or redundant fetches.
- [ ] TS, lint, tests pass without `any` types.

**Testing Requirements**: Playwright navigation checks, timers verifying interval accuracy, regression tests on `useMeetingsPolling` to ensure no dependency loops.

---

### Task 2: Developer Configuration & Polling Monitor

- **Status**: Not Started
- **Priority**: Medium
- **Estimated Effort**: 8 hours

**Problem Statement**: Provide environment-driven toggles and a consolidated Polling Monitor UI for observability while stripping legacy real-time counters. This replaces the previous connection monitoring with polling-specific metrics.

**Task Details**:

1. Introduce `.env.local` variables (`DOUBLE_POLLING_FREQUENCY`, `NEXT_PUBLIC_POLLING_ENABLED`, `NEXT_PUBLIC_POLLING_DEBUG_MODE`, `NEXT_PUBLIC_POLLING_TIMEOUT`).
2. Build Polling Monitor component (dev-only) above Enhanced Entrants Grid, referencing UI patterns from previous connection monitoring.
3. Track request counts, error rates, and latency with lightweight state.
4. Remove old connection monitoring UI and real-time counters.

**Acceptance Criteria**:

- [ ] Monitor toggled via env var and hidden in production.
- [ ] Header retains only Latency & Status indicators.
- [ ] Legacy counters removed.
- [ ] Env vars documented and type-safe; TS/lint/tests clean.

**Testing Requirements**: Playwright layout checks, dev-mode toggle tests, unit tests for monitor metrics.

---

### Task 3: Race Page Component Integration & UX Updates

- **Status**: Not Started
- **Priority**: Medium
- **Estimated Effort**: 6 hours

**Problem Statement**: Wire polling data into race page components with clear status indicators, maintaining smooth UX and removing residual real-time props/state. Components need to respond to polling updates while providing appropriate loading states.

**Task Details**:

1. Integrate `RacePageContent`, `EnhancedEntrantsGrid`, `RaceDataHeader`, and `RaceFooter` with polling hooks.
2. Provide loading, updating, and error states with timestamps.
3. Render '-' placeholders for missing data (no dummy fallback values).
4. Purge real-time-related props, effects, and comments from components.

**Acceptance Criteria**:

- [ ] Components respond to polling updates seamlessly.
- [ ] Real-time code removed from component props and state.
- [ ] UX remains smooth with clear update indicators.
- [ ] TS/lint/tests succeed, no `any` types.

**Testing Requirements**: Playwright UI flows, snapshot/unit tests for component states, manual verification of '-' placeholders.

---

### Task 4: Server Response Optimisation (Caching & Compression)

- **Status**: Not Started
- **Priority**: Medium
- **Estimated Effort**: 8 hours

**Problem Statement**: Optimise server-side responses with caching headers, optional shared cache helper, and compression to reduce payload size and align with polling cadence. This builds on the query optimizations already implemented.

**Technical Context**: Previous phases implemented Query.select for 60-70% payload reduction, scalar key queries for 90% performance improvement, and cursor-based incremental loading. This task adds response-level optimizations.

**Task Details**:

1. Apply race-status-aware `Cache-Control` headers and Next.js `revalidate` settings.
2. Evaluate short-lived cache helper (Redis/in-memory) for hot races.
3. Enable compression middleware for large API payloads.
4. Document cadence alignment with caching strategy to respect CRON ingestion windows (UTC-aware).

**Caching Strategy**:

- Live races: 15-30 second cache, `stale-while-revalidate`
- Final races: 5-15 minute cache for stability
- Coordinate with polling intervals to prevent cache misses

**Acceptance Criteria**:

- [ ] API responses include appropriate cache headers.
- [ ] Optional cache helper safely reduces repeated fetch cost.
- [ ] Compression active without breaking clients.
- [ ] Polling plan updated to reflect response optimisations.
- [ ] TS/lint/tests pass, no `any` types introduced.

**Testing Requirements**: cURL/browser header checks, payload size comparisons, performance metrics before/after, automated tests validating middleware.

---

### Task 5: End-to-End Testing & Validation

- **Status**: Not Started
- **Priority**: High
- **Estimated Effort**: 8 hours

**Problem Statement**: Validate polling reliability, cadence compliance, and resilience across browsers/devices with comprehensive automated coverage. Ensure the polling system works correctly under various network conditions and device constraints.

**Task Details**:

1. Expand integration tests covering cadence, status transitions, request dedup, and fallback rendering.
2. Author Playwright scenarios for network interruptions, background tabs, and mobile breakpoints.
3. Validate environment toggles and monitor instrumentation.
4. Retire obsolete real-time tests that no longer apply to polling architecture.

**Test Coverage Areas**:

- Polling interval accuracy (30m/2.5m/30s cadence windows)
- Status-based polling transitions (open → closed → final)
- Request deduplication and error handling
- Environment variable toggles (DOUBLE_POLLING_FREQUENCY, debug modes)
- Progressive loading and incremental data fetching

**Acceptance Criteria**:

- [ ] Integration & Playwright suites cover polling workflows.
- [ ] Normal and double-frequency modes verified.
- [ ] No request stacking or data regressions detected.
- [ ] TS/lint/tests succeed with zero `any` types.

**Testing Requirements**: Full automated test suite runs (`npm test`, `npm run lint`, `npx tsc --noEmit`), Playwright MCP runs with sufficient wait windows for polling behavior validation.

---

### Task 6: Documentation & Operational Runbooks

- **Status**: Not Started
- **Priority**: Low
- **Estimated Effort**: 4 hours

**Problem Statement**: Update architecture and troubleshooting documentation to describe the polling-only model, environment configuration, and response optimisations while purging real-time references.

**Documentation Context**: The application has transitioned from a hybrid fetch-and-realtime model to a pure polling architecture. Key implementation details include:

- Completed phases: Real-time removal, polling infrastructure, data hygiene, index provisioning, API optimization
- Performance improvements: 45s → 2-5s queries, 60-70% payload reduction
- Architecture: Coordinated polling hooks with shared cadence, error handling, progressive loading
- Environment configuration: Multiple polling control variables

**Task Details**:

1. Refresh `CLAUDE.md`, README sections, and any runbooks with polling architecture details.
2. Document environment variables, cadence rules, and troubleshooting steps.
3. Remove obsolete real-time diagrams/assets and update references.
4. Ensure docs match implemented caching/compression behaviour and query optimizations.

**Documentation Scope**:

- Polling cadence explanation (master scheduler coordination)
- Environment variables and their effects
- Troubleshooting guide for common polling issues
- Performance context and optimization outcomes
- Architecture diagrams showing polling flow

**Acceptance Criteria**:

- [ ] Documentation reflects final polling approach and env vars.
- [ ] All real-time references removed from documentation.
- [ ] Troubleshooting guide actionable for common issues.
- [ ] Docs build/tests (if any) pass; repository remains free of `any` types.

**Testing Requirements**: Proofread and link-check documentation, run standard TS/lint/test suite to ensure no incidental regressions.

---

## Success Metrics & Risk Watchlist

### Success Metrics

- **Cadence compliance**: Client polling intervals match backend scheduling windows
- **No concurrent fetches**: Request deduplication prevents stacked API calls
- **Error rate <5%**: Robust error handling with exponential backoff
- **Fallback consistency**: UI consistently shows '-' placeholders for missing data
- **Zero `any` types**: Full TypeScript compliance across polling implementation
- **ESLint/TypeScript/test suite**: All quality gates pass
- **Performance maintenance**: Sustained 2-5s response times and reduced payload sizes

### Risk Watchlist

- **Infinite loop regressions**: Meetings polling dependency management
- **Backend load**: Misconfigured intervals overwhelming server capacity
- **Stale caches**: Caching strategy conflicts with live data requirements
- **Testing coverage**: Inadequate validation of polling behaviors
- **Documentation drift**: Technical details becoming outdated

**Mitigation Strategies**: Sequential polling implementation, cadence audits against server capacity, monitoring instrumentation, disciplined validation per tasks above, and maintaining alignment with UTC CRON schedules.
