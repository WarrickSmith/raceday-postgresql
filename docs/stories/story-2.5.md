# Story 2.5: Bulk UPSERT Database Operations

Status: Draft

## Story

As a backend developer,
I want bulk UPSERT operations using multi-row INSERT with ON CONFLICT and change detection,
so that the pipeline can persist complete race snapshots in a single <300 ms transaction without redundant writes.

## Acceptance Criteria

1. Deliver `bulkUpsertMeetings(meetings: Meeting[])` that persists normalized meeting snapshots via a single multi-row `INSERT ... ON CONFLICT DO UPDATE` and returns only after the transaction commits [docs/epics.md:32](../epics.md#L32), [docs/tech-spec-epic-2.md:94](../tech-spec-epic-2.md#L94).
2. Deliver `bulkUpsertRaces(races: Race[])` mirroring meeting behaviour, including enum normalization and timestamp handling aligned with Epic 1 schema requirements [docs/epics.md:33](../epics.md#L33), [docs/tech-spec-epic-2.md:95](../tech-spec-epic-2.md#L95).
3. Deliver `bulkUpsertEntrants(entrants: Entrant[])` that writes Story 2.4 money-flow fields without loss while keeping transactional guarantees [docs/epics.md:34](../epics.md#L34), [docs/stories/story-2.4.md:373-429](story-2.4.md#L373), [docs/tech-spec-epic-2.md:95](../tech-spec-epic-2.md#L95).
4. Each writer issues a single statement per race using parameterized `ON CONFLICT (primary_key) DO UPDATE` clauses with `IS DISTINCT FROM` predicates to skip unchanged rows [docs/epics.md:35-36](../epics.md#L35), [docs/architecture-specification.md:534-560](../architecture-specification.md#L534).
5. Writers borrow a pooled client, wrap all table updates in `BEGIN`/`COMMIT`, and release the connection to stay within the 10-connection budget [docs/epics.md:37](../epics.md#L37), [docs/tech-spec-epic-2.md:104-108](../tech-spec-epic-2.md#L104), [docs/architecture-specification.md:562-575](../architecture-specification.md#L562).
6. Failures roll back the race transaction, emit structured error logs with race identifiers, and surface typed errors to the race processor [docs/epics.md:38](../epics.md#L38), [docs/tech-spec-epic-2.md:107-115](../tech-spec-epic-2.md#L107), [docs/CODING-STANDARDS.md:395-454](../CODING-STANDARDS.md#L395).
7. Writers log per-table row counts, `write_ms`, and warn when duration ≥300 ms, feeding the performance metrics pipeline [docs/epics.md:39-40](../epics.md#L39), [docs/PRD-raceday-postgresql-2025-10-05.md:69-132](../PRD-raceday-postgresql-2025-10-05.md#L69), [docs/solution-architecture.md:26-38](../solution-architecture.md#L26), [docs/tech-spec-epic-2.md:133-135](../tech-spec-epic-2.md#L133).
8. Automated unit, integration, and benchmark tests prove UPSERTs stay under 300 ms, skip unchanged payloads, and leverage Story 2.4 regression fixtures once populated [docs/epics.md:40](../epics.md#L40), [docs/tech-spec-epic-2.md:115-119](../tech-spec-epic-2.md#L115), [docs/stories/story-2.4.md:345-517](story-2.4.md#L345).
9. Implementation maintains strict TypeScript typing (zero `any`) and uses parameterized queries exclusively per coding standards [docs/CODING-STANDARDS.md:167-260](../CODING-STANDARDS.md#L167), [docs/tech-spec-epic-2.md:120-134](../tech-spec-epic-2.md#L120).

## Tasks / Subtasks

- [ ] Implement transactional bulk UPSERT module (AC1-5)
  - [ ] Scaffold `server/src/database/bulk-upsert.ts` with typed builders that accept meetings, races, and entrants payloads [docs/tech-spec-epic-2.md:94-108](../tech-spec-epic-2.md#L94).
  - [ ] Add shared `withTransaction` helper that acquires `pool.connect()`, wraps `BEGIN`/`COMMIT`, and ensures `ROLLBACK` on error [server/src/database/pool.ts#L1](../server/src/database/pool.ts#L1), [docs/architecture-specification.md:562-575](../architecture-specification.md#L562).
  - [ ] Encode multi-row parameter sets and `IS DISTINCT FROM` change-detection filters for each table [docs/architecture-specification.md:534-560](../architecture-specification.md#L534).
  - [ ] Map Story 2.4 transform entities to column order with strict typing [docs/stories/story-2.4.md:373-429](story-2.4.md#L373).
- [ ] Integrate writers with race pipeline and observability (AC3,5-7)
  - [ ] Wire race processor to invoke the new writers after transform completion, sharing pooled clients and returning typed results [docs/tech-spec-epic-2.md:104-108](../tech-spec-epic-2.md#L104).
  - [ ] Provide transform worker with APIs to resolve previous snapshots, unblocking `[M2]` incremental delta calculations [docs/stories/story-2.4.md:373-429](story-2.4.md#L373).
  - [ ] Emit structured Pino logs with `raceId`, per-table row counts, `write_ms`, and `overBudget` flags when ≥300 ms [docs/solution-architecture.md:26-38](../solution-architecture.md#L26), [docs/PRD-raceday-postgresql-2025-10-05.md:69-132](../PRD-raceday-postgresql-2025-10-05.md#L69).
  - [ ] Propagate typed error classes so the race processor can classify retryable vs fatal failures [docs/CODING-STANDARDS.md:395-454](../CODING-STANDARDS.md#L395).
- [ ] Add test coverage and benchmarks (AC4,8-9)
  - [ ] Unit test SQL builders with unchanged payloads to assert zero UPDATE operations and correct parameter binding [docs/epics.md:35-36](../epics.md#L35).
  - [ ] Integration test full transaction rollback by simulating failures inside the writers using a disposable schema [docs/tech-spec-epic-2.md:107-115](../tech-spec-epic-2.md#L107).
  - [ ] Load Story 2.4 regression fixtures once `[H1]` lands to validate entrant field preservation [docs/stories/story-2.4.md:345-517](story-2.4.md#L345).
  - [ ] Extend benchmark/telemetry harness to persist UPSERT duration metrics for Stories 2.13–2.15 [docs/tech-spec-epic-2.md:115-119](../tech-spec-epic-2.md#L115).
- [ ] Document operational playbook (AC7-8)
  - [ ] Update runbook with transaction workflow, logging fields, and slow-write troubleshooting steps [docs/architecture-specification.md:562-575](../architecture-specification.md#L562).
  - [ ] Coordinate with observability roadmap to ingest `bulk_upsert` metrics into upcoming dashboards [docs/solution-architecture.md:33-38](../solution-architecture.md#L33).

## Dev Notes

### Requirements Context Summary

- Story definition locks bulk UPSERT functions for meetings, races, and entrants with single-transaction, <300 ms objectives [docs/epics.md:24-40](../epics.md#L24).
- Tech spec mandates the `bulkUpsert*` interfaces deliver multi-row `INSERT ... ON CONFLICT DO UPDATE` with change-detection filters and shared instrumentation across the race pipeline [docs/tech-spec-epic-2.md:94-108](../tech-spec-epic-2.md#L94).
- PRD performance goals cap database writes at <300 ms inside the 2 s single-race budget and require structured metrics to prove the 2× improvement [docs/PRD-raceday-postgresql-2025-10-05.md:69-132](../PRD-raceday-postgresql-2025-10-05.md#L69).
- Solution architecture already approved bulk UPSERT with conditional WHERE clauses as a core decision supporting the pipeline timing targets [docs/solution-architecture.md:26-38](../solution-architecture.md#L26).
- Architecture specification provides the exact SQL shape with `IS DISTINCT FROM` guards to avoid redundant updates while keeping the race commit atomic [docs/architecture-specification.md:534-560](../architecture-specification.md#L534).

### Architecture & Constraints

- Use the architecture-spec multi-row UPSERT shape with `IS DISTINCT FROM` filters to avoid redundant updates while keeping operations atomic [docs/architecture-specification.md:534-560](../architecture-specification.md#L534).
- Borrow connections from the shared `pool` and release them promptly to respect the 10-connection ceiling mandated for concurrent race writes [docs/tech-spec-epic-2.md:104-108](../tech-spec-epic-2.md#L104), [server/src/database/pool.ts#L1](../server/src/database/pool.ts#L1).
- Keep all SQL parameterized and maintain strict TypeScript definitions, following the zero-`any` policy [docs/CODING-STANDARDS.md:167-260](../CODING-STANDARDS.md#L167).
- Surface structured logs and typed errors so the race processor can classify retryable vs fatal failures [docs/tech-spec-epic-2.md:107-115](../tech-spec-epic-2.md#L107).

### Testing Strategy

- Use Vitest unit tests to assert builder SQL and change-detection branches, leveraging Story 2.4 fixtures once `[H1]` lands [docs/stories/story-2.4.md:345-517](story-2.4.md#L345).
- Run integration tests against a disposable PostgreSQL schema to verify transaction rollback and connection release [docs/tech-spec-epic-2.md:107-115](../tech-spec-epic-2.md#L107).
- Extend benchmark/telemetry harness to record <300 ms write timings and warning logs for observability [docs/solution-architecture.md:26-38](../solution-architecture.md#L26), [docs/PRD-raceday-postgresql-2025-10-05.md:69-132](../PRD-raceday-postgresql-2025-10-05.md#L69).

### Project Structure Notes

- Create `server/src/database/bulk-upsert.ts` for the new writers and export typed helpers per project pattern [docs/tech-spec-epic-2.md:94-108](../tech-spec-epic-2.md#L94).
- Reuse `server/src/database/query-validator.ts` to EXPLAIN the statements and document index coverage before completion [server/src/database/query-validator.ts#L1](../server/src/database/query-validator.ts#L1).
- Integrate with `server/src/workers/transformWorker.ts` and `server/src/workers/messages.ts` to consume normalized Story 2.4 payloads [server/src/workers/transformWorker.ts#L1](../server/src/workers/transformWorker.ts#L1), [server/src/workers/messages.ts#L1](../server/src/workers/messages.ts#L1).
- Place integration tests under `server/tests/integration/database/` and reuse `server/tests/fixtures/money-flow-legacy/` for regression coverage [docs/stories/story-2.4.md:345-517](story-2.4.md#L345).

### References

- [docs/epics.md](../epics.md)
- [docs/tech-spec-epic-2.md](../tech-spec-epic-2.md)
- [docs/PRD-raceday-postgresql-2025-10-05.md](../PRD-raceday-postgresql-2025-10-05.md)
- [docs/solution-architecture.md](../solution-architecture.md)
- [docs/architecture-specification.md](../architecture-specification.md)
- [docs/CODING-STANDARDS.md](../CODING-STANDARDS.md)
- [docs/stories/story-2.4.md](story-2.4.md)
- [server/src/database/pool.ts](../server/src/database/pool.ts)
- [server/src/database/query-validator.ts](../server/src/database/query-validator.ts)
- [server/src/workers/transformWorker.ts](../server/src/workers/transformWorker.ts)
- [server/src/workers/messages.ts](../server/src/workers/messages.ts)

## Change Log

| Date | Change | Author |
| --- | --- | --- |
| 2025-10-12 | Initial draft generated by create-story workflow | Bob (Scrum Master agent) |

## Dev Agent Record

### Context Reference

- docs/stories/story-context-2.5.xml (pending refresh)

### Agent Model Used

codex-gpt-5 (Scrum Master persona)

### Debug Log References

- 2025-10-12 – create-story workflow executed (Scrum Master)

### Completion Notes List

- Implementation pending.

### File List

- docs/stories/story-2.5.md
- docs/stories/story-context-2.5.xml
- server/src/database/bulk-upsert.ts
- server/src/database/query-validator.ts
- server/src/workers/transformWorker.ts
- server/src/workers/messages.ts
