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

- [x] Create `server/src/workers/worker-pool.ts` with WorkerPool class (AC: 1, 6, 7)
  - [x] Define WorkerPool class with configurable size (default: 3)
  - [x] Implement worker status tracking (idle/busy map keyed by worker ID)
  - [x] Implement task queue (FIFO array) for when all workers busy
  - [x] Implement exec(data) method returning Promise<TransformedRace>
  - [x] Export singleton pool instance for application-wide use
- [x] Create `server/src/workers/transformWorker.ts` worker script (AC: 2, 3)
  - [x] Set up message listener using parentPort.on('message')
  - [x] Define typed message payload schema with Zod
  - [x] Implement postMessage response with transformed data
  - [x] Add error event handlers for uncaught exceptions
- [x] Implement worker lifecycle management (AC: 4, 8)
  - [x] Bootstrap worker threads on pool initialization
  - [x] Listen for worker 'error' and 'exit' events
  - [x] Implement graceful worker restart on crash (log + create new worker)
  - [x] Initialize pool in application startup (server/src/index.ts or bootstrap)
- [x] Implement task queuing and assignment (AC: 5, 6)
  - [x] Queue tasks when all workers are busy
  - [x] Assign queued tasks to workers as they become available
  - [x] Track active task count and queue depth
  - [x] Ensure FIFO ordering for task assignment
- [x] Add structured logging with Pino (AC: 9)
  - [x] Log worker start events (workerId, script path)
  - [x] Log task assignment (workerId, taskId/raceId)
  - [x] Log task completion (workerId, taskId, duration)
  - [x] Log worker crash/restart events with error details
- [x] Write unit tests for worker pool
  - [x] Test worker pool initialization with correct worker count
  - [x] Test task assignment to idle workers
  - [x] Test task queuing when all workers busy
  - [x] Test exec() Promise resolution on successful transform
  - [x] Test exec() Promise rejection on worker failure
  - [x] Test worker status tracking (idle → busy → idle transitions)
  - [x] Mock worker threads using Vitest worker mocks
- [x] Integration test: Initialize pool and verify worker readiness
  - [x] Pool initializes 3 workers successfully
  - [x] Workers respond to postMessage with echo or simple transform
  - [x] Pool correctly tracks worker status

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

- **2025-10-10 – Implementation Plan:** Stage work by (a) scaffolding `server/src/workers` with `worker-pool.ts` + singleton that tracks worker states, queue depth, metrics, and Promise resolution (AC1, AC5–AC7); (b) authoring `transformWorker.ts` to load Zod schemas, validate payloads, execute placeholder transform hook, and reply via `postMessage` while trapping errors (AC2–AC4); (c) wiring lifecycle handlers for crash/restart and startup bootstrap in `server/src/index.ts` (AC4, AC8); (d) layering structured Pino logging around worker lifecycle + queue stats (AC6, AC9); (e) delivering Vitest unit/integration suites that mock Worker threads and verify queueing, metrics, restart, and Promise semantics (test tasks, AC1–AC7).

### Completion Notes List

- **2025-10-10 – Worker pool delivered and validated:** Implemented WorkerPool singleton with temp TS compilation fallback entry, comprehensive queueing/restart logic, Pino lifecycle logging, and integration/unit suites covering idle/busy states, FIFO queueing, crash recovery, and real worker exec; validated via `npm run test:unit` and `npm run test:integration`.
- **2025-10-10 – Worker pool runtime dependencies hardened:** Removed on-the-fly TypeScript compilation, added guarded loader for dev-only `tsx`, and introduced production runtime test coverage to guarantee worker threads boot without dev dependencies (AC2, AC8).

### File List

- server/src/index.ts
- server/src/workers/messages.ts
- server/src/workers/transformWorker.ts
- server/src/workers/transformWorker.entry.js
- server/src/workers/worker-pool.ts
- server/tests/unit/workers/worker-pool.test.ts
- server/tests/unit/workers/worker-pool.prod-env.test.ts
- server/tests/integration/workers/worker-pool.integration.test.ts

## Change Log

**2025-10-10** - Story 2.3 created by Bob (Scrum Master agent)

- Initial story draft generated from Epic 2 requirements
- Acceptance criteria extracted from epics file and tech spec
- Tasks structured for worker pool infrastructure and testing
- Dev notes aligned with Story 2.2 type definitions and architecture spec
- Story context XML generated with documentation artifacts, code references, interfaces, constraints, and test ideas

**2025-10-10** - Senior Developer Review notes appended by warrick (AI reviewer)

**2025-10-10** - Worker pool infrastructure implemented by warrick (Dev agent)

- Added worker pool module, transform worker script, message schemas, and startup wiring to satisfy AC1–AC9
- Authored Vitest unit and integration coverage for queueing, restart, metrics, and happy-path execution
- Registered new worker entry loader to support TypeScript execution in dev environments and ensured teardown cleans temp artifacts

**2025-10-10** - Worker pool production runtime hardened by Amelia (Dev agent)

- Removed dynamic TypeScript compiler usage from `worker-pool.ts` and replaced with build-time entry resolution
- Updated `transformWorker.entry.js` to avoid loading `tsx` in production and to error with actionable guidance when builds are missing
- Added `worker-pool.prod-env.test.ts` ensuring production environments operate without dev-only dependencies

**2025-10-10** - Senior Developer Review (second pass) notes appended by warrick (AI reviewer)

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

## Senior Developer Review (AI)

**Reviewer:** warrick  
**Date:** 2025-10-10  
**Outcome:** Changes Requested

**Summary**
- Worker pool code and tests exist, but mandatory runtime dependencies are still marked as dev-only, so the production build crashes before any worker threads start.

**Key Findings**
- **High** – `worker-pool.ts` requires `typescript` during module import (`server/src/workers/worker-pool.ts:20`), yet `typescript` remains in devDependencies only (`server/package.json:33-50`). A production install with `npm ci --omit=dev` cannot load the worker pool, leaving AC2/AC8 unmet.
- **High** – `transformWorker.entry.js` unconditionally imports `tsx/esm/api` (`server/src/workers/transformWorker.entry.js:4`), but `tsx` is also scoped to devDependencies (`server/package.json:33-50`). Worker threads therefore fail immediately in production, preventing any transform execution (AC2/AC8).

**Acceptance Criteria Coverage**
- AC1, AC3, AC4, AC5, AC6, AC7, AC9: Implementation present pending dependency fix.
- AC2: Not Met – Missing runtime dependency stops workers from spawning.
- AC8: Not Met – Worker pool cannot initialize in production when devDependencies are omitted.

**Test Coverage and Gaps**
- Unit and integration suites validate queueing, restart, and success/error flows, but no test simulates a production install without devDependencies. Add coverage (e.g., CI step) to surface this regression.

**Architectural Alignment**
- Structure aligns with the worker-pool blueprint, but runtime availability is blocked until the dependency issue is resolved.

**Security Notes**
- No new security regressions detected; primary risk is availability.

**Best-Practices and References**
- Node.js Worker Threads API – https://nodejs.org/api/worker_threads.html
- npm install documentation on dependency types – https://docs.npmjs.com/cli/v10/configuring-npm/install#production

**Action Items**
1. Gate the `typescript` import behind the fallback path or precompile the worker so production never requires `typescript` (`server/src/workers/worker-pool.ts`) – restores AC2/AC8.
2. Replace the `tsx` loader with a production-safe entry point or promote `tsx` to a runtime dependency so workers can boot (`server/src/workers/transformWorker.entry.js`) – restores AC2/AC8.
3. Add a CI/QA check that installs with `--omit=dev` and starts the server to ensure runtime dependencies stay correct.
