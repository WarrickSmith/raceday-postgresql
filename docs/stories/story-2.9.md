# Story 2.9: Dynamic Scheduler with Time-Based Intervals

Status: Done

## Story

As a **developer**,
I want **scheduler that adjusts polling frequency based on time-to-start**,
so that **I can poll at 15s intervals during critical 5-minute window**.

## Acceptance Criteria

1. Scheduler queries database for upcoming races
2. For each race, calculates time-to-start (start_time - current time)
3. Determines polling interval based on time-to-start:
   - ≤5 minutes: 15 seconds
   - 5-15 minutes: 30 seconds
   - >15 minutes: 60 seconds
4. Schedules race processing using `setInterval` per race
5. Clears interval when race completes or is abandoned
6. Scheduler runs continuously, re-evaluating intervals every minute
7. Logging for: interval changes, race scheduling, race completion

## Tasks / Subtasks

- [x] Task 1: Implement interval calculation logic (AC: 2, 3)
  - [x] Create `calculatePollingInterval(timeToStart: number): number` function
  - [x] Implement time-based interval matrix (15s, 30s, 60s)
  - [x] Add unit tests for boundary conditions (300s, 301s, 900s, 901s)
  - [x] Ensure function handles edge cases (negative time, race already started)

- [x] Task 2: Implement race query and scheduling logic (AC: 1, 4)
  - [x] Query database for upcoming races (`status IN ('open', 'upcoming')`)
  - [x] Filter races by start_time (next 24 hours)
  - [x] Create `scheduleRace(raceId: string, interval: number)` function
  - [x] Use `setInterval` to call `processRace()` at calculated interval
  - [x] Store interval handles in Map keyed by raceId

- [x] Task 3: Implement interval cleanup (AC: 5)
  - [x] Listen for race status changes (completed, abandoned, final)
  - [x] Clear interval handle when race finishes
  - [x] Remove race from active scheduling map
  - [x] Log race completion and interval cleanup

- [x] Task 4: Implement continuous re-evaluation loop (AC: 6)
  - [x] Create main scheduler loop running every 60 seconds
  - [x] Re-query database for race status updates
  - [x] Recalculate intervals for active races
  - [x] Update intervals if they changed (clear old, start new)
  - [x] Add/remove races as they enter/exit scheduling window

- [x] Task 5: Add structured logging (AC: 7)
  - [x] Log interval changes with race context (raceId, old interval, new interval, reason)
  - [x] Log race scheduling events (raceId, interval, start_time, time_to_start)
  - [x] Log race completion events (raceId, final status, total polls)
  - [x] Use Pino structured JSON format

- [x] Task 6: Add unit tests for scheduler logic (AC: All)
  - [x] Test interval calculation with various time-to-start values
  - [x] Test race scheduling and interval storage
  - [x] Test interval cleanup on race completion
  - [x] Test re-evaluation loop with mock database queries
  - [x] Test edge cases (race starts during evaluation, database errors)

- [x] Task 7: Add integration tests for end-to-end scheduling (AC: All)
  - [x] Seed test database with races at different time-to-start values
  - [x] Start scheduler and verify correct intervals applied
  - [x] Simulate time progression and verify interval updates
  - [x] Verify race processor called at correct intervals
  - [x] Verify cleanup when races complete
  - [x] Ensure races remain scheduled after start_time until terminal status

## Dev Notes

### Architecture Integration

**Scheduler Module (`scheduler/index.ts`)**
- Main entry point for dynamic scheduling logic
- Manages active race intervals in memory (Map<raceId, NodeJS.Timer>)
- Queries database every 60 seconds for race updates
- Integrates with race processor from Story 2.7

**Key Functions:**
- `calculatePollingInterval(timeToStart: number): number` - Time-based interval logic
- `scheduleRace(raceId: string, interval: number): void` - Start polling for a race
- `unscheduleRace(raceId: string): void` - Stop polling and cleanup
- `startScheduler(): void` - Main loop, runs continuously
- `stopScheduler(): void` - Graceful shutdown

**Integration Points:**
- Calls `processRace(raceId)` from Story 2.7 at each interval tick
- Queries `races` table for active races
- Uses Pino logger from Epic 1 for structured logging
- Coordinates with batch processor from Story 2.8 for concurrent race handling

### Performance Requirements

**Interval Thresholds (from PRD/Epics):**
- Critical window (≤5 min to start): 15 second polling
- Moderate window (5-15 min): 30 second polling
- Low priority (>15 min): 60 second polling

**Scheduler Performance:**
- Database query for race list: <100ms (indexed on start_time)
- Interval calculation: <1ms per race (simple math)
- Re-evaluation loop: completes in <5 seconds for 100 races
- Memory footprint: ~1KB per scheduled race (interval handle + metadata)

**Edge Case Handling:**
- Race starts during evaluation: immediate interval update
- Race cancelled/abandoned: cleanup within 60 seconds
- Database connection lost: retry with exponential backoff
- System restart: rebuild scheduling state from database

### Time-Based Interval Logic

**Calculation Function:**
```typescript
export function calculatePollingInterval(timeToStartSeconds: number): number {
  if (!Number.isFinite(timeToStartSeconds)) {
    throw new TypeError(
      `timeToStartSeconds must be a finite number, received: ${String(timeToStartSeconds)}`,
    );
  }

  if (timeToStartSeconds <= 0) {
    // Race already started – keep polling at the fastest cadence until terminal status.
    return 15_000;
  }

  if (timeToStartSeconds <= 5 * 60) {
    return 15_000;
  }

  if (timeToStartSeconds <= 15 * 60) {
    return 30_000;
  }

  return 60_000;
}
```

**Interval Updates:**
- Races automatically transition from 60s → 30s → 15s as start time approaches
- Re-evaluation every 60 seconds ensures timely transitions
- Example timeline:
  - T-20 minutes: 60s polling
  - T-10 minutes: 30s polling
  - T-4 minutes: 15s polling
  - T+0 minutes: polling continues at 15s until race status becomes terminal

### Database Query Pattern

**Query for Active Races:**
```typescript
const upcomingRaces = await pool.query(`
  SELECT race_id, start_time, status
  FROM races
  WHERE status IN ('open', 'upcoming')
    AND start_time > NOW()
  AND start_time < NOW() + INTERVAL '24 hours'
  ORDER BY start_time ASC
`);
```

> Races that have already started remain scheduled via the in-memory map; when they drop out of this query the scheduler explicitly checks their latest status and only clears intervals once a terminal state is observed.

**Benefits:**
- Uses `idx_races_start_time` index from Epic 1
- Filters to races within next 24 hours (manageable set)
- Ordered by start_time for predictable processing

### Structured Logging Examples

**Race Scheduled:**
```json
{
  "level": "info",
  "msg": "Race scheduled for polling",
  "raceId": "NZ-AUK-20251014-R03",
  "start_time": "2025-10-14T14:30:00Z",
  "time_to_start_seconds": 1200,
  "polling_interval_ms": 30000
}
```

**Interval Changed:**
```json
{
  "level": "info",
  "msg": "Polling interval updated",
  "raceId": "NZ-AUK-20251014-R03",
  "old_interval_ms": 30000,
  "new_interval_ms": 15000,
  "reason": "time_to_start <= 5 minutes"
}
```

**Race Completed:**
```json
{
  "level": "info",
  "msg": "Race polling completed",
  "raceId": "NZ-AUK-20251014-R03",
  "final_status": "final",
  "total_polls": 24,
  "polling_duration_seconds": 360
}
```

### Project Structure Notes

**New Files:**
- `server/src/scheduler/index.ts` - Main scheduler implementation
- `server/src/scheduler/types.ts` - Scheduler-specific types
- `server/tests/unit/scheduler/index.test.ts` - Unit tests
- `server/tests/integration/scheduler/scheduler.integration.test.ts` - Integration tests

**Modified Files:**
- `server/src/index.ts` - Start scheduler on application startup
- `server/src/pipeline/race-processor.ts` - Ensure processRace is exported and reusable

**Dependencies:**
- Existing database pool from Epic 1.8
- Existing race processor from Story 2.7
- Existing Pino logger from Epic 1.7
- Node.js built-in `setInterval` / `clearInterval`

### Testing Strategy

**Unit Tests:**
- Test `calculatePollingInterval()` with various time-to-start values
- Test race scheduling/unscheduling in isolation (mock setInterval)
- Test interval map management (add, update, remove)
- Test edge cases (negative time, zero races, duplicate raceId)

**Integration Tests:**
- Seed database with races at T-20min, T-10min, T-3min
- Start scheduler and verify intervals assigned correctly
- Use fake timers to simulate time progression
- Verify race processor called at expected intervals
- Verify cleanup when races transition to 'final' status

**Manual Testing:**
- Run scheduler in development with live database
- Observe logs for interval transitions
- Verify no memory leaks (interval handles properly cleaned up)
- Test graceful shutdown (stopScheduler clears all intervals)

### References

- **Epic Breakdown:** Story 2.9 requirements → [epic-stories-2025-10-05.md](../epic-stories-2025-10-05.md#L396-L414)
- **Tech Spec Epic 2:** Scheduler component specification → [tech-spec-epic-2.md](../tech-spec-epic-2.md#L41-L42)
- **Solution Architecture:** Dynamic scheduling patterns → [solution-architecture.md](../solution-architecture.md#L338-L344)
- **Architecture Spec:** Polling strategy and intervals → [architecture-specification.md](../architecture-specification.md)
- **PRD:** Performance requirements and polling cadence → [PRD-raceday-postgresql-2025-10-05.md](../PRD-raceday-postgresql-2025-10-05.md)

## Dev Agent Record

### Context Reference

- docs/stories/story-context-2.9.xml

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

- 2025-10-14: Task 1 plan — create scheduler module scaffold with `calculatePollingInterval`, ensure 0ms for races already started, enforce 15s/30s/60s thresholds at 300s/900s boundaries, add Vitest unit coverage for negative, boundary, and large time-to-start values.
- 2025-10-14: Tasks 2-5 plan — design race scheduler service with dependency injection for DB queries and timers, maintain Map of active intervals, guard against overlapping runs, re-evaluate every 60s to add/update/remove races, and emit structured logs for scheduling, interval changes, and cleanup.
- 2025-10-14: Tasks 6-7 plan — craft Vitest unit coverage for scheduler behavior using fake timers plus integration tests that seed PostgreSQL races, verify interval updates, and ensure cleanup/logging paths when statuses change.
- 2025-10-14: Task 3 rework plan — expand race query to keep active races past start time, clamp negative time-to-start values to fastest interval, and adjust scheduler cleanup so intervals persist until terminal status (AC5 regression fix).
- 2025-10-14: Tasks 6-7 coverage plan — add unit test for races remaining scheduled after start time and integration spec asserting scheduler holds active races until terminal status to close review gap.
- 2025-10-14: Action item remediation plan — restore query constraints, guard cleanup with terminal-status checks, refresh scheduler docs, and rerun unit/integration suites.

### Completion Notes List

- 2025-10-14: Implemented Task 1 interval calculation and unit tests; validated via `npm run test:unit -- scheduler/interval`.
- 2025-10-14: Delivered Tasks 2-7 with full scheduler orchestration, logging, cleanup, unit coverage, and integration flow; validated via `npm run test:unit` and `npm run test:integration`.
- 2025-10-14: Addressed review action items by keeping active races scheduled past start time, expanding scheduler interval logic, and adding unit/integration coverage; validated via `npm run test:unit` and `npm run test:integration`.
- 2025-10-14: Realigned scheduler query with story context constraints, updated documentation, and revalidated via `npm run test:unit` and `npm run test:integration`.
- 2025-10-14: Definition of Done confirmed post-review; story approved and marked done after `story-approved` workflow.

### File List

- server/src/scheduler/interval.ts (new)
- server/src/scheduler/index.ts (updated)
- server/src/scheduler/scheduler.ts (new)
- server/src/scheduler/types.ts (new)
- server/src/index.ts (updated)
- server/tests/unit/scheduler/interval.test.ts (updated)
- server/tests/unit/scheduler/scheduler.test.ts (updated)
- server/tests/integration/scheduler/scheduler.integration.test.ts (updated)
- docs/stories/story-2.9.md (updated)
- docs/project-workflow-status.md (updated)

## Change Log

| Date       | Change                                 | Author                   |
| ---------- | -------------------------------------- | ------------------------ |
| 2025-10-14 | Story drafted by create-story workflow | Bob (Scrum Master agent) |
| 2025-10-14 | Implemented Task 1 interval logic and tests | Amelia (Developer agent) |
| 2025-10-14 | Completed Tasks 2-7 scheduler implementation and test suites | Amelia (Developer agent) |
| 2025-10-14 | Senior Developer Review notes appended | Amelia (Developer agent - AI reviewer) |
| 2025-10-14 | Resolved AC5 scheduler cleanup regression and added persistent scheduling tests | Amelia (Developer agent) |
| 2025-10-14 | Senior Developer Review (Changes Requested) | warrick |
| 2025-10-14 | Action items resolved; scheduler query realigned and docs updated | Amelia (Developer agent) |
| 2025-10-14 | Senior Developer Review (Approved) | warrick |

## Senior Developer Review (AI)

### Review 2025-10-14 – First Pass

**Reviewer:** warrick  
**Date:** 2025-10-14  
**Outcome:** Changes Requested

### Summary
- Scheduler foundation and logging align with Epic 2 design, but current cleanup logic stops polling as soon as `start_time` passes, so races are no longer processed while still active.

### Key Findings
- **High:** `fetchUpcomingRaces` filters out races where `start_time <= now`, and `upsertRaceSchedule` immediately clears intervals when `calculatePollingInterval` returns 0 (`server/src/scheduler/index.ts:20`, `server/src/scheduler/scheduler.ts:134-147`). As a result, races drop from scheduling as soon as they start, violating AC5 (“Clears interval when race completes or is abandoned”) and the tech spec mandate to keep polling until completion (`docs/tech-spec-epic-2.md:99`, `docs/tech-spec-epic-2.md:177`).
- **Medium:** No automated test verifies that a race remains scheduled after `start_time` while its status is still active, so the regression above went uncaught (`server/tests/unit/scheduler/scheduler.test.ts`, `server/tests/integration/scheduler/scheduler.integration.test.ts`).

### Acceptance Criteria Coverage
- AC1, AC2, AC3, AC4, AC6, AC7: ✅ Implemented with supporting unit/integration coverage (`server/src/scheduler/index.ts:8-34`, `server/src/scheduler/scheduler.ts:162-222`).
- AC5: ✗ Fails because races are unscheduled at start rather than on completion (`server/src/scheduler/index.ts:20-23`, `server/src/scheduler/scheduler.ts:134-147`).

### Test Coverage and Gaps
- Unit and integration suites exercise interval thresholds, rescheduling, and cleanup flows, but no scenario holds a race past `start_time` while keeping status active, so the AC5 regression is untested (`server/tests/unit/scheduler/scheduler.test.ts`, `server/tests/integration/scheduler/scheduler.integration.test.ts`).

### Architectural Alignment
- Implementation follows dynamic interval targets and logging patterns described in the Epic 2 tech spec, but early cleanup conflicts with requirement 6 to keep active races cycling until completion (`docs/tech-spec-epic-2.md:104-109`, `docs/tech-spec-epic-2.md:177-178`).

### Security Notes
- Database access uses parameterized queries and maintains existing pool usage; no new secret handling or injection risks identified.

### Best-Practices and References
- `docs/tech-spec-epic-2.md:41-109` – Scheduler must track active races until terminal status.
- `docs/CODING-STANDARDS.md:1-120` – Reinforces adherence to acceptance criteria and comprehensive test coverage for critical flows.

### Action Items
- ✅ [High][AC5] Keep races scheduled after `start_time` until their status transitions to a terminal state by clamping negative intervals and retaining active schedules until terminal statuses are observed (`server/src/scheduler/interval.ts`, `server/src/scheduler/scheduler.ts`).
- ✅ [Medium][QA] Add unit/integration coverage for a race whose status stays active after `start_time`, asserting the scheduler keeps polling until the status update arrives (`server/tests/unit/scheduler/scheduler.test.ts`, `server/tests/integration/scheduler/scheduler.integration.test.ts`).

### Review 2025-10-14 – Second Pass

**Reviewer:** warrick  
**Date:** 2025-10-14  
**Outcome:** Changes Requested

**Summary**
- Scheduler now keeps active races polling past their advertised start, but the database query and supporting documentation drifted from the approved constraints, so a light correction pass is still required.

**Key Findings**
- **Medium – Spec drift in scheduler query:** The widened filter now includes `status IN ('upcoming', 'open', 'closed', 'interim')` and a 12-hour look-back window (`server/src/scheduler/index.ts:20-23`), which conflicts with the story-context constraint to stick with `status IN ('open','upcoming')` and `start_time > NOW()` (`docs/stories/story-context-2.9.xml:83-93`). This change risks pulling significantly more rows than intended and bypasses the agreed contract with the idx_races_start_time index. Please realign the query (or secure an updated spec) while still preserving the post-start polling fix.
- **Low – Documentation now contradicts implementation:** The scheduler documentation still shows the interval helper returning `0` after the start time (`docs/stories/story-2.9.md:117-134`) and the sample SQL retains the original filter (`docs/stories/story-2.9.md:149-158`). Update these examples so future readers do not reintroduce the regression.

**Acceptance Criteria Coverage**
- AC1-4,6-7: ✅ Behaviour and tests demonstrate the scheduler querying races, calculating cadence, scheduling intervals, re-evaluating every minute, and logging transitions.
- AC5: ⚠️ Functionally satisfied, but please adjust the query approach to stay within the documented constraint before we close the story.

**Test Coverage and Gaps**
- Unit and integration suites (`npm run test:unit`, `npm run test:integration`) cover the new persistence of active races and interval updates. No additional gaps surfaced once the items above are resolved.

**Architectural Alignment**
- Core design continues to follow Epic 2 guidance for dynamic polling and structured logging (`docs/tech-spec-epic-2.md:90-156`), pending the query alignment noted above.

**Security Notes**
- No new security concerns; all database access remains parameterised.

**Best-Practices and References**
- `docs/stories/story-context-2.9.xml:83-93` – Scheduler query constraint.
- `docs/tech-spec-epic-2.md:90-156` – Scheduler architecture requirements.
- `docs/CODING-STANDARDS.md:1-120` – TypeScript and documentation consistency.

**Action Items**
1. Rework the scheduler query to comply with the documented constraint (retain post-start polling without broadening the status list or window) and update accompanying tests as needed (`server/src/scheduler/index.ts:20-23`, `server/tests/integration/scheduler/scheduler.integration.test.ts`).
2. Refresh the story documentation snippets so the interval helper and SQL example reflect the intended behaviour (`docs/stories/story-2.9.md:117-158`).

### Resolution Notes (2025-10-14)

- Restored the scheduler query to the documented filter (`status IN ('open','upcoming')` and `start_time > NOW()`) while updating evaluation logic to keep active races polling until terminal status.
- Updated unit/integration tests to reflect the new lifecycle and prevented regressions for races that remain active after `start_time`.
- Refreshed the story documentation snippets to match runtime behaviour, highlighting continued 15 s polling post-start and the retention strategy.

### Review 2025-10-14 – Final Pass

**Reviewer:** warrick  
**Date:** 2025-10-14  
**Outcome:** Approve

**Summary**
- Scheduler logic now adheres to the story-context query constraints while preserving post-start polling, and documentation/tests reflect the final behaviour.

**Key Findings**
- None – implementation aligns with the tech spec and story context.

**Acceptance Criteria Coverage**
- AC1-7: ✅ Query limited to upcoming/open races with range guard (`server/src/scheduler/index.ts:20-23`), interval calculation and persistence verified via unit coverage (`server/tests/unit/scheduler/scheduler.test.ts:171-239`), integration flow confirms dynamic intervals and terminal cleanup (`server/tests/integration/scheduler/scheduler.integration.test.ts:200-311`), and structured logging remains intact.

**Test Coverage and Gaps**
- `npm run test:unit` and `npm run test:integration` executed after the fixes; suites cover time-based transitions, ongoing polling after `start_time`, and terminal cleanup.

**Architectural Alignment**
- Matches Epic 2 scheduler design and honours the story-context constraint while deferring cleanup to confirmed terminal statuses (`docs/tech-spec-epic-2.md:90-156`, `docs/stories/story-context-2.9.xml:83-93`).

**Security Notes**
- No new risks; database access still parameterised and timer management remains in-process.

**Best-Practices and References**
- `docs/stories/story-context-2.9.xml:83-93`
- `docs/tech-spec-epic-2.md:90-156`
- `docs/CODING-STANDARDS.md:1-120`

**Action Items**
- None.
