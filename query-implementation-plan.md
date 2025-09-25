# Query Implementation Plan

Purpose: translate the high-level optimisation strategy into execution-ready phases that GPT-5-Codex (and collaborating engineers) can deliver sequentially. Each phase is a self-contained pull request to be merged into `feat/implement-polling`.

## Repository Context

- Framework: Next.js (App Router) with Appwrite backend.
- Server functions: Deployed independently via Appwrite Functions; cron schedules in `appwrite.json` are UTC.
- Data source: Appwrite database configured via `server/database-setup/src/database-setup.js`.

## Phase Overview

| Phase   | Focus                           | Primary Outcomes                                                                                    |
| ------- | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Phase 1 | Data Hygiene & Scalar Keys      | Reliable `raceId`/`entrantId` attributes on entrants & money-flow documents + automated enforcement |
| Phase 2 | Index Provisioning              | New compound indexes leveraging scalar keys; deployment script updates                              |
| Phase 3 | API Query Optimisation          | Next.js API handlers refactored to use indexed filters, `Query.select`, and incremental retrieval   |
| Phase 4 | Polling & Response Optimisation | Server-side caching, payload compression, progressive loading, and polling cadence alignment        |

---

## Phase 1 – Data Hygiene & Scalar Keys (Foundation)

**Goal:** Ensure every entrant and money-flow document exposes scalar keys Appwrite can index, and prevent future drift.

**Prerequisites:** None (kick-off phase).

**Scope:**

- Appwrite Functions (ingestion/backfill) and supporting scripts.
- Appwrite database setup utilities.

**Tasks:**

1. **Schema audit:** Confirm `entrants` and `money-flow-history` collections expose `raceId` and `entrantId` string attributes (extend schema if missing).
2. **Maintenance function:** Create a one-off/backfill Appwrite Function to populate missing scalar keys using existing relationship fields.
3. **CRON scheduling:** Add/adjust `appwrite.json` entry to run the maintenance function (UTC-friendly) until data is clean; disable once complete.
4. **Runtime enforcement:** Update ingestion/ETL functions to set `raceId`/`entrantId` on write and reject payloads where values are absent.
5. **Safety nets:** Add data validation or monitoring (e.g., logging & alerts) to detect future missing keys.

**Deliverables:**

- Updated schema definitions in `server/database-setup/src/database-setup.js` (if required).
- New/updated Appwrite Function code and configuration.
- Documentation updates (e.g., `docs/architecture` or runbooks) describing the scalar-key requirement.

**Validation:**

- Manual verification via Appwrite console or scripts that random documents now include the scalar keys.
- Execution logs from maintenance function confirming processed counts and zero missing keys.
- Unit/integration tests for ingestion logic if present (add new tests when practical).

**Notes:**

- Record any long-running maintenance steps in project notes so future phases can assume a clean dataset.

---

## Phase 2 – Index Provisioning

**Goal:** Provide Appwrite indexes that align with the new scalar-key query patterns.

**Prerequisites:** Phase 1 completed and verified (scalar keys populated and enforced).

**Scope:** Database setup script, Appwrite console, and migration documentation.

**Tasks:**

1. **Add indexes to setup script:** Extend `server/database-setup/src/database-setup.js` with:
   - `money-flow-history`: `idx_race_entrant_time` (`raceId`, `entrantId`, `timeInterval`).
   - `entrants`: `idx_race_active` (`raceId`, `isScratched`).
2. **Deployment sequencing:** Document the order of operations (ensure attributes are available before index creation).
3. **One-time creation:** Run setup script or manual Appwrite console tasks to create the indexes in production/test environments.
4. **Monitoring:** Capture creation logs and note any transient performance impact during index build.

**Deliverables:**

- Updated database setup script with new index definitions and safety checks.
- Ops notes or scripts for running the index creation safely.

**Validation:**

- Confirm indexes show as `available` in Appwrite console.
- Run targeted queries (small script or console) to verify improved execution time where measurable.

**Notes:**

- Schedule index creation during low-traffic windows to avoid write contention.

---

## Phase 3 – API Query Optimisation

**Goal:** Refactor Next.js API routes to exploit new indexes, trim payloads, and support incremental polling.

**Prerequisites:** Phases 1 & 2 complete; indexes live.

**Scope:** Next.js server routes, shared query utilities, types.

**Tasks:**

1. **Race endpoint (`client/src/app/api/race/[id]/route.ts`):**
   - Swap relationship filters for `Query.equal('raceId', raceId)`.
   - Apply `Query.select` to limit race, meeting, entrant, and money-flow fields.
   - Remove automatic meeting expansion; fetch minimal meeting data or use denormalised fields.
2. **Money-flow timeline endpoint (`client/src/app/api/race/[id]/money-flow-timeline/route.ts`):**
   - Base queries on `raceId` & `entrantId` scalar keys.
   - Add cursor-based incremental fetching (via `$createdAt` or `cursorAfter`).
3. **Shared types/utilities:** Update TypeScript interfaces if field selections alter shapes.
4. **Documentation:** Note query behaviour changes (e.g., progressive loading expectations) in relevant docs.

**Deliverables:**

- Refactored API handlers with comprehensive inline comments where logic becomes non-obvious.
- Updated unit/integration tests covering new query behaviour (add mocks as needed).
- Docs summarising the new query strategy.

**Validation:**

- Run existing test suite (`npm run test`, `npm run lint` or project equivalent).
- Benchmark endpoints locally (e.g., Postman/HTTPie) showing reduced payload size and faster response time.
- Spot-check Appwrite dashboard query logs for improved durations.

**Notes:**

- Ensure migrations preserve backward compatibility where front-end components expect unchanged shapes; coordinate with UI follow-up work if necessary.

---

## Phase 4 – Polling & Response Optimisation

**Goal:** Improve perceived performance by caching, compressing responses, and aligning polling cadence with backend capacity.

**Prerequisites:** Phases 1–3 merged and stable.

**Scope:** Next.js API responses, caching strategy, polling configuration (`polling_plan.md`).

**Tasks:**

1. **Caching controls:** Implement race-status-aware caching headers and Next.js route `revalidate` values (e.g., 30s live, 5m finalised).
2. **Server-side cache helper:** Optional shared utility (Redis/in-memory) for short-lived caching between polls.
3. **Compression:** Enable compression middleware for large API responses if not already active.
4. **Progressive loading:** Adjust client fetch sequence to load essential race data, then entrants, then timelines.
5. **Polling cadence alignment:** Update `polling_plan.md` and implementation to respect Appwrite rate limits; ensure scheduling avoids CRON ingestion overlap (remind that CRON is UTC).

**Deliverables:**

- Updated API handlers/middleware with caching & compression logic.
- Adjusted client-side polling implementation and documentation.
- Revised polling plan outlining cadence and sequencing.

**Validation:**

- Confirm cache headers via browser devtools or cURL.
- Measure network payload (should drop relative to pre-Phase 4).
- Manual/live test showing improved initial render speed.

**Notes:**

- Keep caching conservative until real-time (subscription-based) architecture is adopted in future sprints.

---

## General Implementation Guidance

- Each phase is independent; branch from `feat/implement-polling`, deliver a focused PR, and update documentation/tests accordingly.
- Keep `query-optimization-plan.md` and this implementation plan in sync—note deviations or discoveries.
- Record KPI measurements before/after significant changes when feasible.
