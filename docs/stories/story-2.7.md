# Story 2.7: Race Processor Orchestrator

Status: Approved for Development

## Story

As a developer,
I want a race processor that orchestrates the fetch → transform → write pipeline,
so that I can process a complete race in <2s end-to-end with structured error handling and performance tracking.

## Acceptance Criteria

1. Deliver `processRace(raceId: string)` function that coordinates the complete pipeline and returns `ProcessResult` with timings and status [[docs/epics.md:66](../epics.md#L66), [docs/tech-spec-epic-2.md:98](../tech-spec-epic-2.md#L98)]
2. Execute pipeline steps sequentially: fetch → transform (worker) → write (bulk UPSERT + time-series) [[docs/epics.md:67](../epics.md#L67), [docs/tech-spec-epic-2.md:106-108](../tech-spec-epic-2.md#L106)]
3. Each step awaited before proceeding to next; no parallel execution within a single race [[docs/epics.md:68](../epics.md#L68)]
4. Track and return durations for: fetch_ms, transform_ms, write_ms, total_ms [[docs/epics.md:69](../epics.md#L69), [docs/tech-spec-epic-2.md:174](../tech-spec-epic-2.md#L174)]
5. Retry fetch failures according to Story 2.12 retry policy; null fetch results short-circuit pipeline [[docs/epics.md:70](../epics.md#L70), [docs/tech-spec-epic-2.md:176](../tech-spec-epic-2.md#L176)]
6. Log transform errors with structured context; surface typed errors to caller [[docs/epics.md:70](../epics.md#L70)]
7. Rollback database writes on failure; maintain transaction integrity [[docs/epics.md:70](../epics.md#L70), [docs/tech-spec-epic-2.md:129](../tech-spec-epic-2.md#L129)]
8. Emit structured logs for: pipeline start, each step completion, pipeline end [[docs/epics.md:71](../epics.md#L71), [docs/tech-spec-epic-2.md:133-135](../tech-spec-epic-2.md#L133)]
9. Return processing duration for metrics aggregation by scheduler [[docs/epics.md:72](../epics.md#L72)]
10. Achieve <2s total processing time under nominal load (single race, fresh data) [[docs/epics.md:73](../epics.md#L73), [docs/PRD-raceday-postgresql-2025-10-05.md:169](../PRD-raceday-postgresql-2025-10-05.md#L169)]

## Tasks / Subtasks

- [ ] Implement core race processor module (AC1-3)

  - [ ] Create `server/src/pipeline/race-processor.ts` with `processRace` function [[docs/tech-spec-epic-2.md:98](../tech-spec-epic-2.md#L98)]
  - [ ] Define `ProcessResult` type with timings, status, and error details [[docs/tech-spec-epic-2.md:174](../tech-spec-epic-2.md#L174)]
  - [ ] Wire fetch stage: invoke `fetchRaceData` from Story 2.1, handle null responses [[docs/tech-spec-epic-2.md:105](../tech-spec-epic-2.md#L105)]
  - [ ] Wire transform stage: dispatch to worker pool from Story 2.3, await result [[docs/tech-spec-epic-2.md:106](../tech-spec-epic-2.md#L106)]
  - [ ] Wire write stage: invoke bulk UPSERT (Story 2.5) and time-series inserts (Story 2.6) [[docs/tech-spec-epic-2.md:107-108](../tech-spec-epic-2.md#L107)]

- [ ] Implement timing and observability (AC4, AC8-9)

  - [ ] Add `performance.now()` instrumentation at each pipeline boundary [[docs/tech-spec-epic-2.md:174](../tech-spec-epic-2.md#L174)]
  - [ ] Calculate and store fetch_ms, transform_ms, write_ms, total_ms [[docs/epics.md:69](../epics.md#L69)]
  - [ ] Emit structured Pino logs for pipeline start, step completions, end [[docs/tech-spec-epic-2.md:133-135](../tech-spec-epic-2.md#L133)]
  - [ ] Log warnings when total_ms exceeds 2000ms threshold [[docs/tech-spec-epic-2.md:179](../tech-spec-epic-2.md#L179)]
  - [ ] Return `ProcessResult` with all timing metrics for scheduler aggregation [[docs/tech-spec-epic-2.md:98](../tech-spec-epic-2.md#L98)]

- [ ] Implement error handling and resilience (AC5-7)

  - [ ] Short-circuit pipeline when fetch returns null (transient failure) [[docs/tech-spec-epic-2.md:176](../tech-spec-epic-2.md#L176)]
  - [ ] Catch and log transform errors with raceId and worker context [[docs/epics.md:70](../epics.md#L70)]
  - [ ] Wrap database writes in try-catch; log rollback details on failure [[docs/tech-spec-epic-2.md:129](../tech-spec-epic-2.md#L129)]
  - [ ] Surface typed errors (`FetchError`, `TransformError`, `WriteError`) to caller [[docs/tech-spec-epic-2.md:173](../tech-spec-epic-2.md#L173)]
  - [ ] Ensure connection pool resources released on all exit paths [[docs/tech-spec-epic-2.md:128](../tech-spec-epic-2.md#L128)]

- [ ] Add unit and integration tests (AC10)
  - [ ] Unit test: Mock fetch/transform/write stages, verify sequential execution [[docs/tech-spec-epic-2.md:215](../tech-spec-epic-2.md#L215)]
  - [ ] Unit test: Verify timing calculations and log emission [[docs/tech-spec-epic-2.md:179](../tech-spec-epic-2.md#L179)]
  - [ ] Unit test: Null fetch response short-circuits without errors [[docs/tech-spec-epic-2.md:176](../tech-spec-epic-2.md#L176)]
  - [ ] Integration test: End-to-end pipeline with real database, verify <2s [[docs/tech-spec-epic-2.md:180](../tech-spec-epic-2.md#L180)]
  - [ ] Integration test: Verify rollback behavior on write failure [[docs/tech-spec-epic-2.md:129](../tech-spec-epic-2.md#L129)]

## Dev Notes

### Requirements Context Summary

- Story 2.7 defines the orchestrator that composes fetch, transform, and write stages into a cohesive pipeline with sub-2s latency [[docs/epics.md:59-73](../epics.md#L59)]
- Tech spec mandates sequential execution with performance tracking at each boundary and structured error handling [[docs/tech-spec-epic-2.md:98-99](../tech-spec-epic-2.md#L98), [docs/tech-spec-epic-2.md:174](../tech-spec-epic-2.md#L174)]
- PRD performance target: <2s per race is critical to achieve the 2× improvement goal [[docs/PRD-raceday-postgresql-2025-10-05.md:169](../PRD-raceday-postgresql-2025-10-05.md#L169)]
- Solution architecture places race processor as the central coordinator between scheduler and database operations [[docs/solution-architecture.md:310-335](../solution-architecture.md#L310)]

### Architecture & Constraints

- Sequential pipeline execution ensures clear timing attribution and simplifies debugging [[docs/epics.md:68](../epics.md#L68)]
- Null fetch responses (from retry exhaustion) should gracefully skip downstream processing without throwing [[docs/tech-spec-epic-2.md:176](../tech-spec-epic-2.md#L176)]
- Database writes must execute within single transaction for rollback integrity [[docs/tech-spec-epic-2.md:129](../tech-spec-epic-2.md#L129)]
- All timing measurements use `performance.now()` for microsecond precision [[docs/tech-spec-epic-2.md:174](../tech-spec-epic-2.md#L174)]
- Emit warning logs when total_ms ≥ 2000ms to feed performance monitoring pipeline [[docs/tech-spec-epic-2.md:179](../tech-spec-epic-2.md#L179)]
- Reuse existing Pino logger with structured fields (raceId, stage, duration) [[docs/tech-spec-epic-2.md:133-135](../tech-spec-epic-2.md#L133)]

### Testing Strategy

- Unit tests mock fetch/transform/write dependencies to verify orchestration logic, timing calculations, and error handling [[docs/tech-spec-epic-2.md:215](../tech-spec-epic-2.md#L215)]
- Integration tests execute full pipeline against test database with seeded data, measuring actual timings [[docs/tech-spec-epic-2.md:180](../tech-spec-epic-2.md#L180)]
- Performance test validates <2s target with realistic race payloads (Story 2.13 dependency) [[docs/tech-spec-epic-2.md:180](../tech-spec-epic-2.md#L180)]
- Error injection tests verify rollback behavior and connection cleanup on failures [[docs/tech-spec-epic-2.md:129](../tech-spec-epic-2.md#L129)]

### Project Structure Notes

- Create `server/src/pipeline/race-processor.ts` as main orchestrator module [[docs/tech-spec-epic-2.md:98](../tech-spec-epic-2.md#L98)]
- Depends on: `fetchRaceData` (Story 2.1), worker pool (Story 2.3), bulk UPSERT (Story 2.5), time-series inserts (Story 2.6)
- Exports `processRace` function and `ProcessResult` type for scheduler integration (Story 2.9) [[docs/tech-spec-epic-2.md:98-99](../tech-spec-epic-2.md#L98)]
- Place unit tests under `server/tests/unit/pipeline/`
- Place integration tests under `server/tests/integration/pipeline/` (reuse from Story 2.13)

### References

- [docs/epics.md](../epics.md#L59-L73) - Story 2.7 definition
- [docs/tech-spec-epic-2.md](../tech-spec-epic-2.md#L98-L108) - Race processor interface and workflow
- [docs/PRD-raceday-postgresql-2025-10-05.md](../PRD-raceday-postgresql-2025-10-05.md#L169) - Performance targets
- [docs/solution-architecture.md](../solution-architecture.md#L310-L335) - Pipeline orchestration pattern
- [docs/architecture-specification.md](../architecture-specification.md) - Component responsibilities
- [docs/stories/story-2.1.md](story-2.1.md) - Fetch stage (dependency)
- [docs/stories/story-2.3.md](story-2.3.md) - Worker pool (dependency)
- [docs/stories/story-2.5.md](story-2.5.md) - Bulk UPSERT (dependency)
- [docs/stories/story-2.6.md](story-2.6.md) - Time-series inserts (dependency)

## Change Log

| Date       | Change                                           | Author                   |
| ---------- | ------------------------------------------------ | ------------------------ |
| 2025-10-13 | Initial draft generated by create-story workflow | Bob (Scrum Master agent) |

## Dev Agent Record

### Context Reference

- [story-context-2.7.xml](story-context-2.7.xml) - Generated 2025-10-13 by story-context workflow

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

- 2025-10-13 – create-story workflow executed (Scrum Master)

### Completion Notes List

### File List
