# Story 2.8: Parallel Race Processing

Status: Done

## Story

As a developer,
I want a `processRaces` batch orchestrator that runs up to five race pipelines in parallel,
so that the scheduler can meet the 15-second update window without single-race failures blocking the rest of the batch.

## Acceptance Criteria

1. Implement `processRaces(raceIds: string[], maxConcurrency?: number, options?: ProcessOptions)` beside `processRace`, dispatching batches with `Promise.allSettled` while reusing shared result builders and typed errors so pipeline logic stays centralized [[docs/epics.md:84](../epics.md#L84), [docs/tech-spec-epic-2.md:175](../tech-spec-epic-2.md#L175)].
2. Guarantee each race executes independently—shared state limited to the worker pool and PostgreSQL pool—so a single failure cannot corrupt parallel executions [[docs/epics.md:86](../epics.md#L86), [docs/tech-spec-epic-2.md:194](../tech-spec-epic-2.md#L194)].
3. Emit structured JSON logs covering batch start, per-race completion, failures, and final batch summary with raceId, timings, and retryability flags for observability dashboards [[docs/epics.md:88](../epics.md#L88), [docs/tech-spec-epic-2.md:179](../tech-spec-epic-2.md#L179)].
4. Capture per-race timings (fetch_ms, transform_ms, write_ms, total_ms) plus batch max duration, keeping single races <2 s and five-race batches <15 s per PRD performance targets [[docs/epics.md:89](../epics.md#L89), [docs/PRD-raceday-postgresql-2025-10-05.md:165](../PRD-raceday-postgresql-2025-10-05.md#L165)].
5. Return fulfilled results and typed pipeline errors separately so failed races are logged and surfaced without blocking successful completions [[docs/epics.md:87](../epics.md#L87), [docs/tech-spec-epic-2.md:175](../tech-spec-epic-2.md#L175)].
6. Honor the 10-connection PostgreSQL pool ceiling by respecting `env.DB_POOL_MAX` and logging utilization so operators can spot saturation risks [[docs/PRD-raceday-postgresql-2025-10-05.md:173](../PRD-raceday-postgresql-2025-10-05.md#L173), [docs/tech-spec-epic-2.md:208](../tech-spec-epic-2.md#L208)].
7. Extend automated coverage with a five-race integration test hitting the real PostgreSQL harness to assert performance thresholds and connection usage [[docs/tech-spec-epic-2.md:181](../tech-spec-epic-2.md#L181), [docs/tech-spec-epic-2.md:197](../tech-spec-epic-2.md#L197)].
8. Expose aggregated metrics (success count, failure count, retryable count, max duration) for downstream scheduler and analytics consumption [[docs/epics.md:72](../epics.md#L72), [docs/tech-spec-epic-2.md:198](../tech-spec-epic-2.md#L198)].

## Tasks / Subtasks

- [x] Implement batch orchestration entry point (AC1)
  - [x] Add exported `processRaces` beside `processRace` in `server/src/pipeline/race-processor.ts`, reusing result builders and error types [[docs/epics.md:84](../epics.md#L84), [docs/tech-spec-epic-2.md:175](../tech-spec-epic-2.md#L175)]
  - [x] Support `maxConcurrency` and `ProcessOptions` parameters and ensure `Promise.allSettled` batches do not exceed pool limits [[docs/tech-spec-epic-2.md:175](../tech-spec-epic-2.md#L175)]
- [x] Enforce isolation and pool safety (AC2, AC5-6)
  - [x] Guard shared state by reusing worker pool APIs and ensuring connection usage never exceeds `env.DB_POOL_MAX` [[docs/tech-spec-epic-2.md:194](../tech-spec-epic-2.md#L194), [docs/PRD-raceday-postgresql-2025-10-05.md:173](../PRD-raceday-postgresql-2025-10-05.md#L173)]
  - [x] Surface fulfilled results plus typed pipeline errors separately so callers can react to individual failures [[docs/tech-spec-epic-2.md:175](../tech-spec-epic-2.md#L175)]
  - [x] Log pool utilization and worker telemetry instead of duplicating metrics [[docs/tech-spec-epic-2.md:206](../tech-spec-epic-2.md#L206)]
- [x] Capture batch metrics and logging (AC3-4, AC8)
  - [x] Emit structured JSON logs for batch start, per-race completion, and batch summary with timings and retryability flags [[docs/tech-spec-epic-2.md:179](../tech-spec-epic-2.md#L179)]
  - [x] Aggregate per-race timings and batch max duration; warn when approaching the 15 s SLA [[docs/PRD-raceday-postgresql-2025-10-05.md:165](../PRD-raceday-postgresql-2025-10-05.md#L165)]
  - [x] Expose success, failure, retryable counts, and durations for scheduler consumption [[docs/tech-spec-epic-2.md:198](../tech-spec-epic-2.md#L198)]
- [x] Extend automated testing (AC4, AC7)
  - [x] Add unit coverage in `server/tests/unit/pipeline/race-processor.test.ts` asserting Promise.allSettled outcomes, error isolation, and telemetry [[docs/tech-spec-epic-2.md:215](../tech-spec-epic-2.md#L215)]
  - [x] Add integration spec running five-race batches against PostgreSQL to confirm <15 s aggregate and ≤10 active connections [[docs/tech-spec-epic-2.md:181](../tech-spec-epic-2.md#L181), [docs/tech-spec-epic-2.md:197](../tech-spec-epic-2.md#L197)]

## Dev Notes

### Requirements Context Summary

- Story 2.8 expands the pipeline to process up to five races in parallel via a new `processRaces` entry point that wraps `Promise.allSettled`, ensuring each race reports its own outcome [[docs/epics.md:84](../epics.md#L84), [docs/epics.md:85](../epics.md#L85), [docs/tech-spec-epic-2.md:175](../tech-spec-epic-2.md#L175)]
- Batches still have to meet the PRD performance envelope—<15 s for five concurrent races, <2 s per race—while staying under the 10-connection PostgreSQL pool cap [[docs/PRD-raceday-postgresql-2025-10-05.md:165](../PRD-raceday-postgresql-2025-10-05.md#L165), [docs/PRD-raceday-postgresql-2025-10-05.md:173](../PRD-raceday-postgresql-2025-10-05.md#L173)]
- The concurrency layer must compose the existing sequential `processRace` orchestrator delivered in Story 2.7 and reuse the architecture’s fetch → transform → write flow without duplication [[docs/stories/story-2.7.md:1](story-2.7.md#L1), [docs/solution-architecture.md:310](../solution-architecture.md#L310)]
- Observability requirements call for structured logs covering batch start, per-race completion, and aggregate metrics so operators can spot slow paths quickly [[docs/epics.md:88](../epics.md#L88), [docs/epics.md:89](../epics.md#L89), [docs/tech-spec-epic-2.md:179](../tech-spec-epic-2.md#L179)]
- Tech spec risks highlight the need to guard against worker restart loops and connection saturation when multiple races run simultaneously [[docs/tech-spec-epic-2.md:206](../tech-spec-epic-2.md#L206), [docs/tech-spec-epic-2.md:208](../tech-spec-epic-2.md#L208)]

### Structure Alignment Summary

- Parallel batch orchestration belongs beside the existing sequential pipeline in `server/src/pipeline/race-processor.ts:605`, keeping shared result-building and error types in one module.
- Extend the current integration harness in `server/tests/integration/pipeline/race-processor.integration.test.ts:27` to exercise five-race batches and verify metrics without exhausting the real PostgreSQL pool.
- Mirror the new scenarios in unit coverage under `server/tests/unit/pipeline/race-processor.test.ts:1` so fast feedback protects log/metric formatting and Promise.allSettled handling.
- Worker pool telemetry and retry behaviour from `server/src/workers/worker-pool.ts:47` remain the single source of truth for transform concurrency; surface its metrics instead of duplicating counters.
- Pool limits and monitoring live in `server/src/database/pool.ts:10`; batch execution must respect the validated `DB_POOL_MAX` when scheduling concurrent writes.
- Solution architecture still maps scheduler hooks into `server/src/scheduler` (see docs/solution-architecture.md:310); this story delivers the shared batch API that scheduler logic will call next.

### Project Structure Notes

- Implement concurrency additions in `server/src/pipeline/race-processor.ts` to keep orchestration logic centralized.
- Extend worker telemetry consumption via `server/src/workers/worker-pool.ts` rather than introducing new metrics collectors.
- Update pool instrumentation or warnings through `server/src/database/pool.ts` and associated monitor utilities when adjusting concurrency caps.
- Place new unit tests under `server/tests/unit/pipeline/race-processor.test.ts` and integration coverage under `server/tests/integration/pipeline/race-processor.integration.test.ts` to align with existing pipeline suites.

### References

- [docs/epics.md](../epics.md#L84-L90)
- [docs/tech-spec-epic-2.md](../tech-spec-epic-2.md#L160-L204)
- [docs/PRD-raceday-postgresql-2025-10-05.md](../PRD-raceday-postgresql-2025-10-05.md#L160-L206)
- [docs/solution-architecture.md](../solution-architecture.md#L300-L340)
- [docs/architecture-specification.md](../architecture-specification.md#L600-L684)
- [docs/stories/story-2.7.md](story-2.7.md)

## Dev Agent Record

### Context Reference

- docs/stories/story-context-2.8.xml

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

- Plan:
  1. Re-read `server/src/pipeline/race-processor.ts` to confirm `processRaces` batches with `Promise.allSettled`, enforces pool limits, and surfaces structured logs/metrics for AC1-AC6.
  2. Review existing unit and integration specs to ensure coverage for success/failure isolation, five-race batches, and metrics assertions (AC3-AC8); add gaps if discovered.
  3. Execute unit and integration test suites (`npm run test:unit`, `npm run test:integration`) to prove the implementation meets acceptance thresholds without regressions.
- Execution:
  - Verified concurrency guardrails and metrics logging already in `processRaces`, updated integration fixtures to satisfy meeting schema while still forcing partition failures (AC2, AC5).
  - Hardened integration cleanup to keep odds history FK-safe and added date-dependent fixtures so mixed batch runs produce the intended success/failure split (AC3, AC7).
  - Re-ran unit (`npm run test:unit`) and integration (`npm run test:integration`) suites; both pass on Node 22 with PostgreSQL harness (AC4, AC7).
- Follow-up Execution (2025-10-14):
  - Patched `processRaces` to roll `PipelineStageError.result.timings.total_ms` into `metrics.maxDuration_ms`, restoring AC4/AC8 observability coverage.
  - Augmented unit regression to assert batch metrics reflect failure durations and exercised cleanup helper to cover meeting prefix deletions.
  - Updated integration cleanup to purge `raceId` and `meeting-${raceId}` meetings; reran `npm run test:unit` and `npm run test:integration` to confirm green suites.
- Follow-up Plan (2025-10-14):
  1. Update `processRaces` metrics aggregation to incorporate `PipelineStageError.result.timings.total_ms` so failure durations affect `maxDuration_ms`, keeping logs aligned with AC4/AC8.
  2. Extend unit coverage to assert failure timings propagate into batch metrics and retain existing success paths.
  3. Fix integration cleanup helpers to purge both `raceId` and `meeting-${raceId}` meeting rows, preventing fixture bleed between runs.

### Completion Notes List

- Implementation reuses `processRaces` batching with `Promise.allSettled`, enforces `env.DB_POOL_MAX`, and logs start/complete telemetry plus max duration metrics, satisfying AC1-AC6.
- Integration suite now seeds valid `thoroughbred` meetings, exercises mixed-success batches, and cleans fixtures to keep odds history counts deterministic while covering AC7-AC8.
- Unit coverage continues to assert concurrency adjustment, metrics aggregation, and retryable error accounting for Promise.allSettled flows.
- Failure metrics now aggregate both success and error durations, and integration cleanup removes prefixed meeting identifiers so review action items are resolved.

### Completion Notes
**Completed:** 2025-10-14
**Definition of Done:** All acceptance criteria met, code reviewed, tests passing, deployed

### File List

- docs/stories/story-2.8.md
- server/src/pipeline/race-processor.ts
- server/tests/unit/pipeline/race-processor.test.ts
- server/tests/integration/pipeline/race-processor.integration.test.ts

## Change Log

| Date       | Change                                 | Author                   |
| ---------- | -------------------------------------- | ------------------------ |
| 2025-10-13 | Story drafted by create-story workflow | Bob (Scrum Master agent) |
| 2025-10-13 | Validated batch processor, extended unit/integration coverage, and marked story Ready for Review | Amelia (Developer agent) |
| 2025-10-14 | Review flagged changes: batch metrics mis-report and integration cleanup gaps | Amelia (Developer agent) |
| 2025-10-14 | Addressed review findings: failure metrics logging and meeting cleanup fixes, retested suites | Amelia (Developer agent) |
| 2025-10-14 | Senior Developer review approved and notes appended | warrick |

## Senior Developer Review (AI)

Reviewer: warrick

Date: 2025-10-14

Outcome: Approved

### Summary

- Failure metrics now reflect both successful and failed races, integration cleanup removes prefixed meetings, and the story satisfies all acceptance criteria.

### Key Findings

- None.

### Acceptance Criteria Coverage

- **AC1-AC8:** Pass – Concurrency guardrails, structured telemetry, observability metrics, and coverage align with epic and PRD expectations.

### Test Coverage and Gaps

- `npm run test:unit` and `npm run test:integration` validate the updated metrics aggregation and cleanup helpers; no additional gaps observed.

### Architectural Alignment

- Batch orchestration continues to reuse `processRace`, respects pool limits, and emits structured logs consistent with the solution architecture.

### Security Notes

- No new security concerns; database writes stay parameterized and cleanup leaves no residual fixtures.

### Best-Practices and References

- [[docs/tech-spec-epic-2.md#L175-L204](../tech-spec-epic-2.md#L175-L204)] — Observability and batching requirements.
- [[docs/PRD-raceday-postgresql-2025-10-05.md#L165-L173](../PRD-raceday-postgresql-2025-10-05.md#L165-L173)] — Performance targets and pool ceilings.

### Action Items

- None.
