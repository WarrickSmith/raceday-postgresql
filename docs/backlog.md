# Engineering Backlog

This backlog collects cross-cutting or future action items that emerge from reviews and planning.

Routing guidance:

- Use this file for non-urgent optimizations, refactors, or follow-ups that span multiple stories/epics.
- Must-fix items to ship a story belong in that story's `Tasks / Subtasks`.
- Same-epic improvements may also be captured under the epic Tech Spec `Post-Review Follow-ups` section.

| Date | Story | Epic | Type | Severity | Owner | Status | Notes |
| ---- | ----- | ---- | ---- | -------- | ----- | ------ | ----- |
| 2025-10-06 | 1.2 | 1 | Security | High | Claude | Resolved | Fixed SQL injection using pg-format identifier escaping (%I) in CREATE DATABASE (server/src/database/run-migrations.ts:33) |
| 2025-10-06 | 1.2 | 1 | Bug | High | Claude | Resolved | Added Pool error event listeners in run-migrations.ts for both adminPool and migration pool |
| 2025-10-06 | 1.2 | 1 | Bug | Medium | Claude | Resolved | Added race_pools trigger with update_last_updated_column() function (server/database/migrations/002_triggers.sql:38-54) |
| 2025-10-06 | 1.2 | 1 | TechDebt | Medium | Claude | Resolved | Extracted process.exit to CLI wrapper (server/src/database/cli.ts), run-migrations.ts now exportable |
| 2025-10-06 | 1.2 | 1 | Bug | Medium | Claude | Resolved | Corrected race status values to 'open', 'closed', 'interim', 'final', 'abandoned' in schema, tech spec, and tests |
| 2025-10-06 | 1.2 | 1 | TechDebt | Low | Claude | Resolved | Refined ESLint ignore patterns to 'dist/**', '*.js' (server/eslint.config.js:99) |
| 2025-10-06 | 1.2 | 1 | Testing | Medium | Claude | Resolved | Added race_pools trigger test in database-schema.test.ts (lines 237-281) - All 26 tests passing |
| 2025-10-08 | 1.9 | 1 | Enhancement | Low | Claude | Resolved | Exported DatabaseHealth interface from server/src/health/database.ts:3 to enable reuse in Epic 2 worker pool health checks |
| 2025-10-08 | 1.9 | 1 | TechDebt | Low | Claude | Resolved | Standardized error logging to use `err` property consistently (server/src/api/routes/health.ts:14) per Pino convention |
| 2025-10-08 | 1.9 | 1 | Testing | Low | Claude | Resolved | Added 503 failure path integration test simulating database unavailability using Vitest mock (server/tests/integration/health-endpoint.test.ts:84-109) - All 99 tests passing |
| 2025-10-08 | 1.10 | 1 | Enhancement | Low | Claude | Resolved | Added generic `npm test` command documentation in Testing Strategy section (docs/developer-quick-start.md:440-445) - Story 1.10 fully complete |
| 2025-10-12 | 2.5 | 2 | Bug | High | Amelia | Resolved | Fixed 68 ESLint template literal errors in server/src/database/bulk-upsert.ts - Converted paramIndex to String(paramIndex) at lines 58, 160, 249 |
| 2025-10-12 | 2.5 | 2 | Bug | High | Amelia | Resolved | Fixed 26 ESLint unsafe any value access errors - Added MeetingRow/EntrantRow/ConnectionCountRow type definitions and proper type assertions |
| 2025-10-12 | 2.5 | 2 | Bug | High | Amelia | Resolved | Fixed failing unit test - Updated parameter index expectations to $1-$8, $9-$16 matching 8-field meeting schema |
| 2025-10-12 | 2.5 | 2 | TechDebt | High | TBD | Deferred | Unskip transaction rollback integration test - Requires architecture changes to support table name parameters (moved to Epic 2 follow-ups) |
| 2025-10-12 | 2.5 | 2 | Enhancement | Med | Amelia | Resolved | Documented UPSERT query plans - Created server/src/database/document-query-plans.ts with EXPLAIN ANALYZE for all tables |
| 2025-10-12 | 2.5 | 2 | Testing | Med | Amelia | Resolved | Added foreign key constraint violation test - server/tests/integration/database/bulk-upsert.integration.test.ts:469-494 |
| 2025-10-12 | 2.5 | 2 | Enhancement | Med | Amelia | Resolved | Evaluated parallel UPSERT execution - Created docs/parallel-upsert-evaluation.md - Recommendation: maintain sequential (premature optimization) |
| 2025-10-12 | 2.5 | 2 | TechDebt | Low | Amelia | Resolved | Added 22-field documentation comment in server/src/database/bulk-upsert.ts:279-285 with field groupings |
| 2025-10-12 | 2.5 | 2 | Enhancement | Low | Amelia | Resolved | Integrated custom pool monitoring - Created server/src/database/pool-monitor.ts (no external deps), integrated into pool.ts |
| 2025-10-12 | 2.5 | 2 | Testing | Low | TBD | Blocked | Load Story 2.4 regression fixtures once [H1] lands - Upstream dependency not yet available |
| 2025-10-13 | 2.6 | 2 | Documentation | Low | TBD | Open | Update runbook with time-series insert workflow, partition routing logic, and troubleshooting steps for missing partitions - Deferred to separate documentation story |
| 2025-10-13 | 2.6 | 2 | Coordination | Low | TBD | Blocked | Coordinate with Epic 4 partition automation to ensure daily partitions exist before writes - Dependency on Epic 4 (Stories 4.1-4.2) |
