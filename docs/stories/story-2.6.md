# Story 2.6: Time-Series Data Insert Operations

Status: Approved

## Story

As a backend developer,
I want efficient INSERT operations for time-series tables (money_flow_history, odds_history),
so that I can store historical data without UPSERT overhead in append-only batches routed to the correct daily partition.

## Acceptance Criteria

1. Deliver `insertMoneyFlowHistory(records: MoneyFlowRecord[])` that appends rows to the correct daily partition based on `event_timestamp` and returns only after the transaction commits [docs/epics.md:50](../epics.md#L50), [docs/tech-spec-epic-2.md:96-97](../tech-spec-epic-2.md#L96).
2. Deliver `insertOddsHistory(records: OddsRecord[])` mirroring money-flow behavior with identical batching and partition logic [docs/epics.md:51](../epics.md#L51), [docs/tech-spec-epic-2.md:97](../tech-spec-epic-2.md#L97).
3. Implement multi-row INSERT (no `ON CONFLICT`) that always appends without conditional checks, eliminating UPSERT overhead [docs/epics.md:52](../epics.md#L52), [docs/tech-spec-epic-2.md:172](../tech-spec-epic-2.md#L172).
4. Test and optimize batch sizes (100, 500, 1000 rows per batch) to identify optimal performance profile within the <300 ms write budget [docs/epics.md:53](../epics.md#L53), [docs/tech-spec-epic-2.md:172](../tech-spec-epic-2.md#L172).
5. Each writer automatically detects the target partition based on `event_timestamp` and routes records to the correct daily partition table (e.g., `money_flow_history_2025_10_05`) [docs/epics.md:54](../epics.md#L54), [docs/tech-spec-epic-2.md:96-97](../tech-spec-epic-2.md#L96), [docs/architecture-specification.md:399-455](../architecture-specification.md#L399).
6. Writers borrow a pooled client, wrap all inserts in `BEGIN`/`COMMIT`, and release the connection to stay within the 10-connection budget [docs/epics.md:55](../epics.md#L55), [docs/tech-spec-epic-2.md:128](../tech-spec-epic-2.md#L128).
7. Failures roll back the batch transaction, emit structured error logs with partition and record count, and surface typed errors to the race processor [docs/epics.md:56](../epics.md#L56), [docs/tech-spec-epic-2.md:173](../tech-spec-epic-2.md#L173).
8. Writers log per-batch row counts and `insert_ms` duration, warning when duration ≥300 ms to feed the performance metrics pipeline [docs/epics.md:57](../epics.md#L57), [docs/tech-spec-epic-2.md:116-117](../tech-spec-epic-2.md#L116), [docs/PRD-raceday-postgresql-2025-10-05.md:169](../PRD-raceday-postgresql-2025-10-05.md#L169).
9. Automated unit, integration, and benchmark tests prove append-only inserts stay under 300 ms across batch sizes and validate partition routing [docs/epics.md:57](../epics.md#L57), [docs/tech-spec-epic-2.md:172-173](../tech-spec-epic-2.md#L172).
10. Implementation maintains strict TypeScript typing (zero `any`) and uses parameterized queries exclusively per coding standards [docs/CODING-STANDARDS.md:167-260](../CODING-STANDARDS.md#L167), [docs/tech-spec-epic-2.md:134](../tech-spec-epic-2.md#L134).

## Tasks / Subtasks

- [ ] Implement transactional time-series INSERT module (AC1-3)
  - [ ] Scaffold `server/src/database/time-series.ts` with typed builders that accept money_flow_history and odds_history payloads [docs/tech-spec-epic-2.md:96-97](../tech-spec-epic-2.md#L96).
  - [ ] Reuse `withTransaction` helper from Story 2.5 for consistent transaction semantics (`BEGIN`/`COMMIT`/`ROLLBACK`) [server/src/database/bulk-upsert.ts#L15-L31](../server/src/database/bulk-upsert.ts#L15).
  - [ ] Encode multi-row parameter sets for append-only INSERT (no ON CONFLICT clause) with strict typing [docs/tech-spec-epic-2.md:172](../tech-spec-epic-2.md#L172).
  - [ ] Map transformed time-series entities to column order matching partitioned table schemas [docs/architecture-specification.md:399-455](../architecture-specification.md#L399).
- [ ] Implement partition detection and routing (AC5)
  - [ ] Add partition resolver that extracts date from `event_timestamp` and constructs partition table name (e.g., `money_flow_history_2025_10_05`) [docs/tech-spec-epic-2.md:96-97](../tech-spec-epic-2.md#L96), [docs/architecture-specification.md:399-455](../architecture-specification.md#L399).
  - [ ] Query PostgreSQL system catalogs (`pg_class`, `pg_inherits`) to verify partition existence before INSERT [docs/architecture-specification.md:399-455](../architecture-specification.md#L399).
  - [ ] Emit error if target partition does not exist (rely on Epic 4 partition creation automation) [docs/tech-spec-epic-2.md:210](../tech-spec-epic-2.md#L210).
- [ ] Optimize batch sizes and observability (AC4,6-8)
  - [ ] Wire race processor to invoke time-series writers after bulk UPSERT completion, sharing pooled clients [docs/tech-spec-epic-2.md:128](../tech-spec-epic-2.md#L128).
  - [ ] Emit structured Pino logs with partition name, row count, `insert_ms`, and `overBudget` flags when ≥300 ms [docs/PRD-raceday-postgresql-2025-10-05.md:169](../PRD-raceday-postgresql-2025-10-05.md#L169), [docs/tech-spec-epic-2.md:133-135](../tech-spec-epic-2.md#L133).
  - [ ] Propagate typed error classes so the race processor can classify retryable vs fatal failures [docs/tech-spec-epic-2.md:173](../tech-spec-epic-2.md#L173).
  - [ ] Run benchmark tests with 100, 500, and 1000-row batches to identify optimal batch size within 300 ms budget [docs/epics.md:53](../epics.md#L53).
- [ ] Add test coverage and benchmarks (AC4,9-10)
  - [ ] Unit test SQL builders with various batch sizes (100, 500, 1000 rows) to assert correct parameter binding and partition table name resolution [docs/tech-spec-epic-2.md:172](../tech-spec-epic-2.md#L172).
  - [ ] Integration test full transaction rollback by simulating failures inside the writers using a disposable schema [docs/tech-spec-epic-2.md:173](../tech-spec-epic-2.md#L173).
  - [ ] Integration test partition routing by inserting records across multiple date boundaries and verifying correct partition targets [docs/architecture-specification.md:399-455](../architecture-specification.md#L399).
  - [ ] Extend benchmark/telemetry harness to persist INSERT duration metrics for Stories 2.13–2.15 [docs/tech-spec-epic-2.md:183](../tech-spec-epic-2.md#L183).
- [ ] Document operational playbook (AC7-8)
  - [ ] Update runbook with time-series insert workflow, partition routing logic, and troubleshooting steps for missing partitions [docs/architecture-specification.md:399-455](../architecture-specification.md#L399).
  - [ ] Coordinate with Epic 4 partition automation to ensure daily partitions exist before writes [docs/tech-spec-epic-2.md:210](../tech-spec-epic-2.md#L210).

## Dev Notes

### Requirements Context Summary

- Story definition locks time-series INSERT functions for money_flow_history and odds_history with append-only semantics and <300 ms objectives [docs/epics.md:42-58](../epics.md#L42).
- Tech spec mandates the `insert*History` interfaces deliver multi-row `INSERT` (no ON CONFLICT) with partition detection and shared instrumentation across the race pipeline [docs/tech-spec-epic-2.md:96-97](../tech-spec-epic-2.md#L96), [docs/tech-spec-epic-2.md:172-173](../tech-spec-epic-2.md#L172).
- PRD performance goals cap database writes at <300 ms inside the 2 s single-race budget and require structured metrics to prove the 2× improvement [docs/PRD-raceday-postgresql-2025-10-05.md:169](../PRD-raceday-postgresql-2025-10-05.md#L169).
- Solution architecture already approved partitioned time-series tables with daily partitions as a core decision supporting the pipeline timing targets [docs/solution-architecture.md:167-169](../solution-architecture.md#L167).
- Architecture specification provides the exact partition management strategy with automatic daily partition creation and 30-day retention [docs/architecture-specification.md:399-455](../architecture-specification.md#L399).

### Architecture & Constraints

- Use append-only INSERT statements (no ON CONFLICT clause) to eliminate UPSERT overhead for time-series data [docs/tech-spec-epic-2.md:172](../tech-spec-epic-2.md#L172).
- Automatically detect target partition based on `event_timestamp` and route records to the correct daily partition table [docs/tech-spec-epic-2.md:96-97](../tech-spec-epic-2.md#L96), [docs/architecture-specification.md:399-455](../architecture-specification.md#L399).
- Rely on Epic 4 automated partition creation; emit clear errors if target partition is missing [docs/tech-spec-epic-2.md:210](../tech-spec-epic-2.md#L210).
- Borrow connections from the shared `pool` and release them promptly to respect the 10-connection ceiling mandated for concurrent race writes [docs/tech-spec-epic-2.md:128](../tech-spec-epic-2.md#L128), [server/src/database/pool.ts#L1](../server/src/database/pool.ts#L1).
- Keep all SQL parameterized and maintain strict TypeScript definitions, following the zero-`any` policy [docs/CODING-STANDARDS.md:167-260](../CODING-STANDARDS.md#L167).
- Surface structured logs and typed errors so the race processor can classify retryable vs fatal failures [docs/tech-spec-epic-2.md:173](../tech-spec-epic-2.md#L173).

### Testing Strategy

- Use Vitest unit tests to assert builder SQL for various batch sizes (100, 500, 1000 rows) and partition table name resolution [docs/tech-spec-epic-2.md:172](../tech-spec-epic-2.md#L172).
- Run integration tests against a disposable PostgreSQL schema with pre-created partitions to verify transaction rollback and connection release [docs/tech-spec-epic-2.md:173](../tech-spec-epic-2.md#L173).
- Run integration tests that insert records across multiple date boundaries to validate automatic partition routing [docs/architecture-specification.md:399-455](../architecture-specification.md#L399).
- Extend benchmark/telemetry harness to record <300 ms write timings and warning logs for observability [docs/tech-spec-epic-2.md:183](../tech-spec-epic-2.md#L183), [docs/PRD-raceday-postgresql-2025-10-05.md:169](../PRD-raceday-postgresql-2025-10-05.md#L169).

### Project Structure Notes

- Create `server/src/database/time-series.ts` for the new insert functions and export typed helpers per project pattern [docs/tech-spec-epic-2.md:96-97](../tech-spec-epic-2.md#L96).
- Reuse `withTransaction` helper from `server/src/database/bulk-upsert.ts` to ensure consistent transaction semantics [server/src/database/bulk-upsert.ts#L15-L31](../server/src/database/bulk-upsert.ts#L15).
- Integrate with `server/src/workers/transformWorker.ts` and `server/src/workers/messages.ts` to consume time-series payloads from Story 2.4 [server/src/workers/transformWorker.ts#L1](../server/src/workers/transformWorker.ts#L1), [server/src/workers/messages.ts#L1](../server/src/workers/messages.ts#L1).
- Place integration tests under `server/tests/integration/database/` and reuse existing test infrastructure from Story 2.5 [docs/stories/story-2.5.md:179-182](../stories/story-2.5.md#L179).
- Coordinate with Epic 4 (Stories 4.1-4.2) for partition creation automation to ensure partitions exist before writes [docs/tech-spec-epic-2.md:210](../tech-spec-epic-2.md#L210).

### References

- [docs/epics.md](../epics.md)
- [docs/tech-spec-epic-2.md](../tech-spec-epic-2.md)
- [docs/PRD-raceday-postgresql-2025-10-05.md](../PRD-raceday-postgresql-2025-10-05.md)
- [docs/solution-architecture.md](../solution-architecture.md)
- [docs/architecture-specification.md](../architecture-specification.md)
- [docs/CODING-STANDARDS.md](../CODING-STANDARDS.md)
- [docs/stories/story-2.5.md](story-2.5.md)
- [server/src/database/bulk-upsert.ts](../server/src/database/bulk-upsert.ts)
- [server/src/database/pool.ts](../server/src/database/pool.ts)
- [server/src/workers/transformWorker.ts](../server/src/workers/transformWorker.ts)
- [server/src/workers/messages.ts](../server/src/workers/messages.ts)

## Change Log

| Date       | Change                                           | Author                   |
| ---------- | ------------------------------------------------ | ------------------------ |
| 2025-10-13 | Initial draft generated by create-story workflow | Bob (Scrum Master agent) |

## Dev Agent Record

### Context Reference

- [docs/stories/story-context-2.6.xml](story-context-2.6.xml) (generated 2025-10-13, validated ✓)

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

- 2025-10-13 – create-story workflow executed (Scrum Master)
- 2025-10-13 – story-context workflow executed, XML validated 10/10 passed (Scrum Master)

### Completion Notes List

### File List
