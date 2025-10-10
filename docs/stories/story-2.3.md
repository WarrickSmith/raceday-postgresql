# Story 2.3: Worker Thread Pool for CPU-Bound Transforms

Status: Ready for Review

## Story

As a backend developer,
I want a worker thread pool (3 workers) for money flow calculations,
so that CPU-intensive work doesn't block the main event loop and enables concurrent race processing.

## Acceptance Criteria

1. Worker pool class created with configurable worker count (default: 3) that exports a singleton pool instance for application-wide use [docs/epic-stories-2025-10-05.md:291](../epic-stories-2025-10-05.md#L291).
2. Worker threads instantiated from `transformWorker.ts` script using Node.js Worker API with message-passing IPC [docs/epic-stories-2025-10-05.md:292](../epic-stories-2025-10-05.md#L292).
3. Workers communicate via `postMessage()` / `on('message')` pattern, passing typed payloads validated with Zod schemas [docs/epic-stories-2025-10-05.md:293](../epic-stories-2025-10-05.md#L293).
4. Workers handle uncaught errors and 'error' events by logging details and triggering graceful restart (crash → restart flow scaffolded, Story 2.11 adds full retry logic) [docs/epic-stories-2025-10-05.md:294](../epic-stories-2025-10-05.md#L294).
5. Pool queues tasks when all workers are busy, maintaining FIFO order and preventing task loss [docs/epic-stories-2025-10-05.md:295](../epic-stories-2025-10-05.md#L295).
6. Pool tracks each worker's status (idle / busy) and exposes metrics for observability (active count, queue depth) [docs/epic-stories-2025-10-05.md:296](../epic-stories-2025-10-05.md#L296).
7. `exec(data)` method returns `Promise<TransformedRace>` that resolves when worker completes transform, rejects on worker failure [docs/epic-stories-2025-10-05.md:297](../epic-stories-2025-10-05.md#L297), [docs/tech-spec-epic-2.md:93](../tech-spec-epic-2.md#L93).
8. Worker pool initialized on application startup (in `server/src/index.ts` or dedicated bootstrap module) before scheduler starts [docs/epic-stories-2025-10-05.md:298](../epic-stories-2025-10-05.md#L298).
9. Structured logging via Pino for: worker start, task assignment, task completion, worker crash/restart with contextual data (workerId, taskId, duration) [docs/epic-stories-2025-10-05.md:299](../epic-stories-2025-10-05.md#L299), [docs/tech-spec-epic-2.md:135](../tech-spec-epic-2.md#L135).

## Tasks / Subtasks

- [ ] Create `server/src/workers/worker-pool.ts` with WorkerPool class (AC: 1, 6, 7)
  - [ ] Define WorkerPool class with configurable size (default: 3)
  - [ ] Implement worker status tracking (idle/busy map keyed by worker ID)
  - [ ] Implement task queue (FIFO array) for when all workers busy
  - [ ] Implement exec(data) method returning Promise<TransformedRace>
  - [ ] Export singleton pool instance for application-wide use
- [ ] Create `server/src/workers/transformWorker.ts` worker script (AC: 2, 3)
  - [ ] Set up message listener using parentPort.on('message')
  - [ ] Define typed message payload schema with Zod
  - [ ] Implement postMessage response with transformed data
  - [ ] Add error event handlers for uncaught exceptions
- [ ] Implement worker lifecycle management (AC: 4, 8)
  - [ ] Bootstrap worker threads on pool initialization
  - [ ] Listen for worker 'error' and 'exit' events
  - [ ] Implement graceful worker restart on crash (log + create new worker)
  - [ ] Initialize pool in application startup (server/src/index.ts or bootstrap)
- [ ] Implement task queuing and assignment (AC: 5, 6)
  - [ ] Queue tasks when all workers are busy
  - [ ] Assign queued tasks to workers as they become available
  - [ ] Track active task count and queue depth
  - [ ] Ensure FIFO ordering for task assignment
- [ ] Add structured logging with Pino (AC: 9)
  - [ ] Log worker start events (workerId, script path)
  - [ ] Log task assignment (workerId, taskId/raceId)
  - [ ] Log task completion (workerId, taskId, duration)
  - [ ] Log worker crash/restart events with error details
- [ ] Write unit tests for worker pool
  - [ ] Test worker pool initialization with correct worker count
  - [ ] Test task assignment to idle workers
  - [ ] Test task queuing when all workers busy
  - [ ] Test exec() Promise resolution on successful transform
  - [ ] Test exec() Promise rejection on worker failure
  - [ ] Test worker status tracking (idle → busy → idle transitions)
  - [ ] Mock worker threads using Vitest worker mocks
- [ ] Integration test: Initialize pool and verify worker readiness
  - [ ] Pool initializes 3 workers successfully
  - [ ] Workers respond to postMessage with echo or simple transform
  - [ ] Pool correctly tracks worker status

## Dev Notes

### Requirements Context Summary

Story 2.3 establishes the worker thread pool infrastructure that enables CPU-bound money flow calculations to execute in parallel without blocking the Node.js event loop. This directly supports PRD NFR011 (3-worker configuration with one CPU reserved for orchestrator) and Epic 2's <2s single-race processing target by offloading expensive transforms to dedicated threads [docs/PRD-raceday-postgresql-2025-10-05.md:74](../PRD-raceday-postgresql-2025-10-05.md#L74), [docs/tech-spec-epic-2.md:117](../tech-spec-epic-2.md#L117).

The worker pool must handle task queuing when all workers are busy (ensuring no task loss during 5-race concurrent processing bursts) and gracefully restart crashed workers to maintain 99.9% uptime during race hours per NFR004. Story 2.11 will add comprehensive retry logic and max-retry caps; this story scaffolds the basic crash → restart flow [docs/tech-spec-epic-2.md:126](../tech-spec-epic-2.md#L126).

Worker threads communicate via Node.js Worker API's postMessage/on('message') pattern, with all payloads validated using Zod schemas to prevent type confusion and maintain the zero-`any` policy. The pool exports a singleton instance to avoid multiple thread pools competing for CPU resources [docs/tech-spec-epic-2.md:93](../tech-spec-epic-2.md#L93).

### Project Structure Notes

Story 2.3 creates new infrastructure modules in the `server/src/workers/` directory:

- `worker-pool.ts`: WorkerPool class with singleton export
- `transformWorker.ts`: Worker thread script (message handler, transform logic placeholder)

Story 2.2 established type definitions at `server/src/clients/nztab-types.ts` that this story will import for validating worker payloads (RaceData input, TransformedRace output schemas) [docs/stories/story-2.1.md:74](story-2.1.md#L74), [docs/stories/story-2.2.md:93](story-2.2.md#L93).

Story 2.4 will implement the actual money flow calculation logic inside `transformWorker.ts`; this story provides the pool infrastructure and a minimal echo/passthrough worker for testing.

Architecture specification places workers module under `server/src/workers/` per "Services and Modules" guidance [docs/tech-spec-epic-2.md:43](../tech-spec-epic-2.md#L43). All imports must use ESM syntax with `.js` extensions per Node.js 22 standards [docs/CODING-STANDARDS.md:19](../CODING-STANDARDS.md#L19).

### References

- [docs/epic-stories-2025-10-05.md:280](../epic-stories-2025-10-05.md#L280) - Story 2.3 definition
- [docs/tech-spec-epic-2.md:43](../tech-spec-epic-2.md#L43) - Worker Pool module specification
- [docs/tech-spec-epic-2.md:93](../tech-spec-epic-2.md#L93) - workerPool.exec API contract
- [docs/PRD-raceday-postgresql-2025-10-05.md:117](../PRD-raceday-postgresql-2025-10-05.md#L117) - NFR011 3-worker configuration
- [docs/tech-spec-epic-2.md:126](../tech-spec-epic-2.md#L126) - Reliability requirements (99.9% uptime, worker restart)
- [docs/stories/story-2.2.md:93](story-2.2.md#L93) - Type definitions from Story 2.2 for worker payload validation

## Dev Agent Record

### Context Reference

- [story-context-2.3.xml](../story-context-2.3.xml) - Generated on 2025-10-10

### Agent Model Used

claude-sonnet-4-5-20250929 (Sonnet 4.5)

### Debug Log References

### Completion Notes List

### File List

## Change Log

**2025-10-10** - Story 2.3 created by Bob (Scrum Master agent)

- Initial story draft generated from Epic 2 requirements
- Acceptance criteria extracted from epics file and tech spec
- Tasks structured for worker pool infrastructure and testing
- Dev notes aligned with Story 2.2 type definitions and architecture spec
- Story context XML generated with documentation artifacts, code references, interfaces, constraints, and test ideas

**2025-10-10** - Senior Developer Review notes appended by warrick (AI reviewer)

## Senior Developer Review (AI)

**Reviewer:** warrick  
**Date:** 2025-10-10  
**Outcome:** Changes Requested

**Summary**
- Story remains unimplemented; no worker pool module, worker script, or supporting wiring exists in the repository, so none of the CPU-offloading requirements can be validated.
- Detected stack: Node.js 22 + TypeScript server with Pino logging and Vitest, so review expectations follow those tooling conventions.

**Key Findings**
- **High** – Worker pool infrastructure is absent. There is no `server/src/workers/` directory or `worker-pool.ts` implementation, so AC1–AC7 and AC9 cannot be met.
- **High** – Application startup does not initialize any worker pool (`server/src/index.ts:1` still only boots the HTTP server), violating AC8.
- **High** – Required unit/integration tests for the worker pool were not delivered; the existing `server/tests` tree contains only prior modules, leaving all story-specific test tasks undone.

**Acceptance Criteria Coverage**
- AC1: Not Met – No WorkerPool class or singleton export exists.
- AC2: Not Met – No `transformWorker.ts` script found.
- AC3: Not Met – No worker messaging or Zod validation implemented.
- AC4: Not Met – No worker error handling or restart logic present.
- AC5: Not Met – No task queueing implemented.
- AC6: Not Met – No worker status tracking or metrics implemented.
- AC7: Not Met – No `exec(data)` promise-returning API exists.
- AC8: Not Met – `server/src/index.ts:1` does not initialize a worker pool.
- AC9: Not Met – No Pino logging for worker lifecycle events implemented.

**Test Coverage and Gaps**
- No new unit or integration tests exist under `server/tests` for worker pool behavior, queueing, or restart logic, leaving every test-related subtask incomplete.

**Architectural Alignment**
- Worker pool module and bootstrap points defined in `docs/tech-spec-epic-2.md` are missing entirely, so the implementation is not aligned with the approved architecture.

**Security Notes**
- No code delivered for review; security implications cannot be assessed until the worker infrastructure exists.

**Best-Practices and References**
- Node.js Worker Threads API (https://nodejs.org/api/worker_threads.html) – required for implementing CPU-bound workers with proper lifecycle management.

**Action Items**
1. Implement `server/src/workers/worker-pool.ts`, `transformWorker.ts`, and associated queueing/restart logic per AC1–AC9, exporting a singleton and wiring it into application startup.
2. Add structured Pino logging around worker lifecycle events and expose pool metrics for observability.
3. Deliver unit and integration tests covering worker initialization, task queueing, promise resolution/rejection, restart handling, and metrics reporting.
