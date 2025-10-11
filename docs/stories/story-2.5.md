# Story 2.5: Bulk UPSERT Database Operations

Status: ContextReadyDraft

## Story

As a backend developer,
I want bulk UPSERT operations using multi-row INSERT with ON CONFLICT and change detection,
so that the pipeline can persist complete race snapshots in a single <300 ms transaction without redundant writes.

## Acceptance Criteria

1. Implement `bulkUpsertMeetings(meetings: Meeting[])` that writes normalized meeting snapshots via multi-row `INSERT ... ON CONFLICT DO UPDATE` using the shared PG pool and returns when all rows persist [docs/epics.md:32](../epics.md#L32), [docs/tech-spec-epic-2.md:94](../tech-spec-epic-2.md#L94), [docs/architecture-specification.md:534](../architecture-specification.md#L534).
2. Implement `bulkUpsertRaces(races: Race[])` mirroring meeting behavior, including enum validation and timestamp handling consistent with Epic 1 schema constraints [docs/epics.md:33](../epics.md#L33), [docs/tech-spec-epic-2.md:95](../tech-spec-epic-2.md#L95), [docs/architecture-specification.md:536](../architecture-specification.md#L536).
3. Implement `bulkUpsertEntrants(entrants: Entrant[])` with identical transactional guarantees and mappings for odds/hold percentages produced by Story 2.4 transforms [docs/epics.md:34](../epics.md#L34), [docs/tech-spec-epic-2.md:95](../tech-spec-epic-2.md#L95), [docs/stories/story-2.4.md:423](../stories/story-2.4.md#L423).
4. Each function issues a single multi-row statement per race using parameterized queries with `ON CONFLICT (primary_key) DO UPDATE` to avoid per-row chatter [docs/epics.md:35](../epics.md#L35), [docs/architecture-specification.md:536](../architecture-specification.md#L536).
5. Conflict clauses include change-detection `WHERE` filters so existing rows untouched when values match, preventing `updated_at` churn and trimming write load by ≥30 % [docs/epics.md:36](../epics.md#L36), [docs/architecture-specification.md:552](../architecture-specification.md#L552), [docs/tech-spec-epic-2.md:94](../tech-spec-epic-2.md#L94).
6. All race-level writes execute inside a single `BEGIN`/`COMMIT` using a pooled client to guarantee atomicity and release connections promptly for up to five concurrent races [docs/epics.md:37](../epics.md#L37), [docs/tech-spec-epic-2.md:107](../tech-spec-epic-2.md#L107), [docs/PRD-raceday-postgresql-2025-10-05.md:114](../PRD-raceday-postgresql-2025-10-05.md#L114).
7. Failures roll back the transaction, emit structured error logs, and surface typed errors to the race processor without leaving partial data behind [docs/epics.md:38](../epics.md#L38), [docs/tech-spec-epic-2.md:107](../tech-spec-epic-2.md#L107), [docs/CODING-STANDARDS.md:171](../CODING-STANDARDS.md#L171).
8. Write path logs include per-table row counts, duration metrics, and warn when operations exceed the <300 ms budget mandated by architecture and PRD performance goals [docs/epics.md:39](../epics.md#L39), [docs/solution-architecture.md:35](../solution-architecture.md#L35), [docs/PRD-raceday-postgresql-2025-10-05.md:69](../PRD-raceday-postgresql-2025-10-05.md#L69), [docs/tech-spec-epic-2.md:115](../tech-spec-epic-2.md#L115).
9. Automated tests and benchmark hooks validate that UPSERT calls remain under 300 ms per race and skip updates when data is unchanged, feeding metrics into Stories 2.13–2.15 [docs/epics.md:40](../epics.md#L40), [docs/tech-spec-epic-2.md:195](../tech-spec-epic-2.md#L195), [docs/PRD-raceday-postgresql-2025-10-05.md:337](../PRD-raceday-postgresql-2025-10-05.md#L337).

## Tasks / Subtasks

- [ ] Implement bulk UPSERT module in `server/src/database/bulk-upsert.ts` (AC1–AC6)
  - [ ] Create typed helpers that accept `Meeting`, `Race`, `Entrant` arrays and serialize to parameterized value matrices
  - [ ] Share a `withTransaction` wrapper that borrows a pooled client, opens `BEGIN`, executes writers, and guarantees `ROLLBACK` on error
  - [ ] Encode change-detection `WHERE` clauses using `IS DISTINCT FROM` comparisons for each mutable column
  - [ ] Normalize status enums and timestamp handling to match Epic 1 schema constraints (leveraging triggers for `updated_at`)
- [ ] Integrate writers with race processor pipeline (AC2, AC3, AC6–AC8)
  - [ ] Update `server/src/workers/transformWorker.ts` consumer to pass structured meeting/race/entrant payloads into the writers
  - [ ] Ensure writer integration addresses Story 2.4 `[M2]` TODO by supplying previous snapshot identifiers for incremental delta queries [docs/stories/story-2.4.md:517](../stories/story-2.4.md#L517)
  - [ ] Emit Pino logs including `raceId`, row counts, `write_ms`, and warning flag when duration ≥300 ms
  - [ ] Bubble typed error objects so the race processor can classify retryable vs fatal failures
- [ ] Add automated validation coverage (AC7–AC9)
  - [ ] Unit-test SQL builders with seeded fixtures to prove unchanged payloads skip updates (restoring Story 2.4 `[H1]` regression coverage) [docs/stories/story-2.4.md:517](../stories/story-2.4.md#L517)
  - [ ] Integration-test end-to-end write using a disposable PostgreSQL schema to measure timing and transactional rollback
  - [ ] Extend benchmark/telemetry harness to persist UPSERT duration metrics consumed by Stories 2.13–2.15 [docs/tech-spec-epic-2.md:195](../tech-spec-epic-2.md#L195)
- [ ] Document operational expectations (AC8–AC9)
  - [ ] Update developer runbook with transaction/rollback workflow and logging fields
  - [ ] Capture playbook steps for diagnosing slow UPSERTs (include log field descriptions and retry strategy)
  - [ ] Coordinate with observability team to ingest `bulk_upsert` metrics into upcoming dashboards (aligning with solution architecture telemetry roadmap)

## Dev Notes

### Requirements Context Summary

This story delivers the database persistence layer that the solution architecture earmarks as one of the project’s core differentiators: multi-row UPSERTs with conditional `WHERE` clauses to shave redundant writes and keep each race commit under 300 ms [docs/solution-architecture.md:26](../solution-architecture.md#L26), [docs/solution-architecture.md:32](../solution-architecture.md#L32). PRD performance goals demand <300 ms database writes as part of the overall <2 s single-race and <15 s five-race targets, so this implementation must produce measurable timing metrics and warnings when budgets slip [docs/PRD-raceday-postgresql-2025-10-05.md:69](../PRD-raceday-postgresql-2025-10-05.md#L69), [docs/PRD-raceday-postgresql-2025-10-05.md:337](../PRD-raceday-postgresql-2025-10-05.md#L337). The tech spec assigns Story 2.5 responsibility for `bulkUpsertMeetings/Races/Entrants`, ensuring data stays consistent with Epic 1 schema constraints and freeing later stories to focus on history tables and API layers [docs/tech-spec-epic-2.md:94](../tech-spec-epic-2.md#L94), [docs/tech-spec-epic-2.md:107](../tech-spec-epic-2.md#L107).

Story 2.4 highlighted outstanding dependencies: regression fixtures from `server-old` remain missing (`[H1]`), and the transform worker still emits TODO comments for previous-bucket lookups (`[M2]`) that rely on this story’s database access to complete incremental delta calculations [docs/stories/story-2.4.md:517](../stories/story-2.4.md#L517). Resolving those blockers while implementing the UPSERT pipeline keeps deltas accurate and unblocks downstream history inserts (Story 2.6) and performance telemetry (Stories 2.13–2.15).

### Project Structure Notes

- New writer module should live in `server/src/database/bulk-upsert.ts`, exporting pure async functions with named exports per coding standards (ESM, strict typing, zero `any`) [docs/CODING-STANDARDS.md:169](../CODING-STANDARDS.md#L169).
- Reuse the existing pooled client from `server/src/database/pool.ts` to respect the 10-connection budget (PRD NFR003) and ensure transactions release promptly [docs/PRD-raceday-postgresql-2025-10-05.md:173](../PRD-raceday-postgresql-2025-10-05.md#L173).
- Shared SQL fragments (column lists, placeholders) can live alongside existing query utilities (e.g., `server/src/database/query-validator.ts`) to keep builders testable.
- Race processor integration occurs in `server/src/workers/transformWorker.ts` or a new orchestration helper so that worker outputs flow directly into the database layer without mixing persistence logic into worker threads.
- No unified project structure doc exists yet, so follow the established `server/src/database` layout and align logging fields with prior stories (worker pool, money-flow transform).

### Carry-Over & Dependencies

- Address Story 2.4 `[H1]` by generating server-old regression fixtures as part of UPSERT unit tests, ensuring delta calculations compare against legacy outputs once the database layer is wired [docs/stories/story-2.4.md:517](../stories/story-2.4.md#L517).
- Resolve Story 2.4 `[M2]` by providing prior snapshot lookup hooks once UPSERTs persist data, unblocking incremental delta accuracy [docs/stories/story-2.4.md:517](../stories/story-2.4.md#L517).
- Monitor `[M1]` (placeholder money flow values) during integration so UPSERT payloads carry real calculations when the transform story is updated [docs/stories/story-2.4.md:519](../stories/story-2.4.md#L519).

### Testing Strategy

- Unit tests validate SQL builders and change-detection filters using seeded payloads that include unchanged rows, proving `IS DISTINCT FROM` skips redundant updates [docs/tech-spec-epic-2.md:195](../tech-spec-epic-2.md#L195).
- Integration tests exercise the full transaction path against PostgreSQL, asserting rollback semantics and recording `write_ms` metrics under the <300 ms target [docs/tech-spec-epic-2.md:195](../tech-spec-epic-2.md#L195), [docs/PRD-raceday-postgresql-2025-10-05.md:389](../PRD-raceday-postgresql-2025-10-05.md#L389).
- Benchmark hooks feed Story 2.15 telemetry by persisting UPSERT durations and row counts, enabling trend analysis referenced in the solution architecture [docs/solution-architecture.md:35](../solution-architecture.md#L35), [docs/tech-spec-epic-2.md:216](../tech-spec-epic-2.md#L216).

### References

- [docs/epics.md:32-40](../epics.md#L32) – Story definition and acceptance criteria.
- [docs/solution-architecture.md:26-39](../solution-architecture.md#L26) – Performance vision, bulk UPSERT mandate, and write budget.
- [docs/PRD-raceday-postgresql-2025-10-05.md:69-174](../PRD-raceday-postgresql-2025-10-05.md#L69) – Performance goals, functional requirements FR004–FR007, and NFR003 pool limits.
- [docs/tech-spec-epic-2.md:94-116](../tech-spec-epic-2.md#L94) – Interface definitions, workflow sequencing, and non-functional requirements tied to Story 2.5.
- [docs/architecture-specification.md:534-560](../architecture-specification.md#L534) – Conditional UPSERT pattern and performance impact.
- [docs/stories/story-2.4.md:423-522](../stories/story-2.4.md#L423) – Upstream action items and dependencies from money-flow transform.
- [docs/CODING-STANDARDS.md:169-214](../CODING-STANDARDS.md#L169) – Strict typing and module export guidance.

## Dev Agent Record

### Context Reference

- docs/stories/story-context-2.5.xml (generated 2025-10-12T12:32:45+13:00)

### Agent Model Used

codex-gpt-5 (Scrum Master persona)

### Debug Log References

- **2025-10-10 – Story draft created:** Captured epics, PRD, solution architecture, and tech-spec mandates; enumerated tasks for transactional writers, instrumentation, testing, and documentation; mapped Story 2.4 dependencies and telemetry requirements.

### Completion Notes List

- _None yet – implementation pending._

### File List

- docs/stories/story-2.5.md (this specification)
- server/src/database/bulk-upsert.ts (planned)
- server/src/workers/transformWorker.ts (integration touchpoint)
- server/tests/unit/database/bulk-upsert.test.ts (planned)
- server/tests/integration/database/bulk-upsert.integration.test.ts (planned)

## Change Log

**2025-10-10** – Story 2.5 drafted by Bob (Scrum Master agent)

- Initial story specification generated from Epic 2 planning artifacts and architecture docs.
- Acceptance criteria mapped with canonical citations and performance expectations.
- Task breakdown aligned with transactional persistence, logging, and testing deliverables.
- Dev notes capture upstream dependencies (Story 2.4) and telemetry obligations for future stories.
