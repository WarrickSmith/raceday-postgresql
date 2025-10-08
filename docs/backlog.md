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
