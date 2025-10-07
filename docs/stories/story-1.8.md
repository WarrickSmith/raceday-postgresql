# Story 1.8: PostgreSQL Connection Pooling

Status: Approved Ready for Development

## Story

As a developer,
I want PostgreSQL connection pool configured with optimal settings,
so that I can handle concurrent database operations without saturation.

## Acceptance Criteria

1. Shared `pg.Pool` builds its connection string from validated `DB_*` environment variables via `buildDatabaseUrl(env)` so configuration remains environment-driven (`docs/epic-stories-2025-10-05.md:155-162`, `server/src/shared/env.ts:11-48`, `server/.env.example:5-12`).
2. `pool.options.max` resolves to 10 connections (using `env.DB_POOL_MAX`) and maintains at least two idle connections to meet throughput and warm-connection expectations (`docs/tech-spec-epic-1.md:499-527`, `docs/PRD-raceday-postgresql-2025-10-05.md:165-174`).
3. Pool configuration enforces `idleTimeoutMillis = 30000` (30 seconds) to recycle unused connections promptly (`docs/tech-spec-epic-1.md:499-527`).
4. Pool configuration enforces `connectionTimeoutMillis = 2000` (2 seconds) to fail fast when saturation occurs (`docs/tech-spec-epic-1.md:499-527`).
5. The shared pool instance is exported for reuse across application modules (HTTP server, migrations, future data layer) rather than instantiating ad-hoc pools (`docs/epic-stories-2025-10-05.md:155-162`, `docs/solution-architecture.md:544-576`).
6. Startup logging records pool metrics (max, min, idle timeout, connection timeout) through the structured logger to provide observability baselines (`docs/tech-spec-epic-1.md:507-513`, `docs/epic-stories-2025-10-05.md:155-162`).
7. Pool lifecycle management hooks process shutdown (SIGTERM/SIGINT) to end the pool cleanly and avoid dangling connections (`docs/tech-spec-epic-1.md:515-520`, `docs/architectural-decisions.md:61-100`).

## Tasks / Subtasks

- [ ] Task 1: Implement shared connection pool module (AC: 1-4,6,7)
  - [ ] Create `server/src/database/pool.ts` exporting a singleton `pg.Pool` configured via `buildDatabaseUrl(env)` and `env.DB_POOL_MAX` (`docs/tech-spec-epic-1.md:489-527`, `server/src/shared/env.ts:11-48`).
  - [ ] Set `min`, `idleTimeoutMillis`, and `connectionTimeoutMillis` to spec values and document rationale inline (`docs/tech-spec-epic-1.md:499-527`).
  - [ ] Log pool configuration metrics once at module initialization using the shared logger (`docs/tech-spec-epic-1.md:507-513`).
  - [ ] Register `pool.on('error')` to escalate failures through the logger per earlier action items (`docs/stories/story-1.1.md:439-570`).
  - [ ] Attach SIGTERM/SIGINT listeners that close the pool before process exit (`docs/tech-spec-epic-1.md:515-520`).
- [ ] Task 2: Integrate shared pool across server entry points (AC: 1,5-7)
  - [ ] Replace the inline pool in `server/src/index.ts` with the shared export and remove redundant initialization helpers (`server/src/index.ts:1-140`).
  - [ ] Ensure health checks and future routes import the shared pool without re-configuring connection options (`docs/solution-architecture.md:544-576`, `docs/tech-spec-epic-1.md:489-520`).
  - [ ] Confirm startup logging occurs once while preserving existing health-check responses (`server/src/index.ts:45-112`).
- [ ] Task 3: Add validation and tests for pool configuration (AC: 2-4,6-7)
  - [ ] Create unit tests that assert `pool.options` values (max, min, idle, connection timeout) and verify metrics logging with a spy (`docs/PRD-raceday-postgresql-2025-10-05.md:165-174`, `docs/tech-spec-epic-1.md:499-513`).
  - [ ] Add integration test (or extend existing health check tests) to verify the shared pool executes a `SELECT 1` successfully and handles simulated exhaustion gracefully (`developer-quick-start.md:401-425`, `server/src/index.ts:27-84`).
  - [ ] Document test execution commands and expected outcomes in the change log.
- [ ] Task 4: Update documentation to reflect environment-driven connection strings (AC: 1)
  - [ ] Refresh `docs/tech-spec-epic-1.md` connection-pool section to reference `buildDatabaseUrl(env)` instead of `env.DATABASE_URL` (`docs/tech-spec-epic-1.md:489-520`).
  - [ ] Add note in `developer-quick-start.md` troubleshooting that metrics log on startup and rely on `DB_POOL_MAX` (`developer-quick-start.md:401-463`).

## Dev Notes

### Requirements Context Summary

- Epic 1 Story 1.8 mandates a shared PostgreSQL pool with explicit max/min sizing, timeouts, export, and startup metrics logging (`docs/epic-stories-2025-10-05.md:150-162`).
- The technical specification prescribes `server/src/database/pool.ts`, enumerates the required configuration values, and demands signal-driven shutdown and metrics logs (`docs/tech-spec-epic-1.md:489-520`).
- PRD NFR003 requires supporting 10 concurrent connections without saturation, reinforcing the `max` target and resilience posture (`docs/PRD-raceday-postgresql-2025-10-05.md:165-174`).
- Architecture decisions emphasise a single shared pool within the monolith to minimize latency and simplify operations (`docs/architectural-decisions.md:61-100`).
- Environment configuration already replaces `DATABASE_URL` with discrete `DB_*` variables and documents that URLs are composed in code, so the pool must use `buildDatabaseUrl(env)` (`server/.env.example:5-12`, `server/src/shared/env.ts:11-48`, `docs/stories/story-1.6.md:1-244`).

### Technical Considerations

- The current `server/src/index.ts` spins up its own minimal pool for health checks; Story 1.8 centralizes this logic to avoid duplicated configuration and to expose telemetry consistently (`server/src/index.ts:1-140`).
- Structured logging from Story 1.7 already standardizes JSON outputs, so pool metrics must log through the shared logger to remain queryable in downstream observability tools (`docs/stories/story-1.7.md:1-210`, `docs/tech-spec-epic-1.md:507-513`).
- Incorporate error listeners on the shared pool to satisfy earlier backlog notes about surfacing pool faults immediately (`docs/stories/story-1.1.md:439-570`).
- Worker threads and bulk writes will compete for connections in later epics, making the 2s connection timeout essential to trigger back-pressure rather than indefinite hangs (`docs/solution-architecture.md:609-619`, `docs/tech-spec-epic-1.md:523-527`).

### Testing Strategy

- Unit tests should inspect pool option values and simulate exhaustion to ensure the 2s timeout path triggers expected logging (`docs/tech-spec-epic-1.md:499-513`, `docs/PRD-raceday-postgresql-2025-10-05.md:165-174`).
- Extend health-check or integration tests to guarantee the shared pool executes `SELECT 1` and surfaces errors cleanly, supporting production readiness goals (`server/src/index.ts:27-84`, `developer-quick-start.md:401-425`).
- Capture baseline metrics log output during tests to document observability expectations in the change log.

### Project Structure Notes

- Add `server/src/database/pool.ts` within the database folder defined by the solution architecture, keeping exports aligned with upcoming operations modules (`docs/solution-architecture.md:544-576`).
- Ensure `server/src/index.ts` imports the shared pool and exposes helper functions (e.g., `checkDatabase`) that can move into future DAO layers without reinitializing connections (`server/src/index.ts:27-84`).
- Future API routes (e.g., `server/src/api/routes/health.ts`) should consume the shared pool once the Express server replaces the current HTTP implementation (`docs/tech-spec-epic-1.md:533-540`).

### References

- `docs/epic-stories-2025-10-05.md:150-162`
- `docs/tech-spec-epic-1.md:489-527`
- `docs/PRD-raceday-postgresql-2025-10-05.md:165-174`
- `docs/solution-architecture.md:544-576`
- `docs/architectural-decisions.md:61-100`
- `server/.env.example:5-12`
- `server/src/shared/env.ts:11-48`
- `server/src/index.ts:1-140`
- `developer-quick-start.md:401-463`
- `docs/stories/story-1.1.md:439-570`
- `docs/stories/story-1.6.md:1-244`
- `docs/stories/story-1.7.md:1-210`

## Dev Agent Record

### Context Reference

- docs/story-context-1.8.xml (generated 2025-10-08T22:40:00Z)

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

- Pending

### Completion Notes List

- Pending

### File List

- Pending

## Change Log

**2025-10-08** - Draft story created

- Generated Story 1.8 backlog entry grounded in epic, tech spec, PRD, and environment architecture sources.
- Captured tasks for implementation, testing, and documentation updates aligned with environment-driven connection strings and shared pool usage.
- Assembled story-context-1.8.xml and validated it against the Story Context checklist for development handoff.
