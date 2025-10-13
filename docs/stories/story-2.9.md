# Story 2.9: Dynamic Scheduler with Time-Based Intervals

Status: Ready

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

- [ ] Task 1: Implement interval calculation logic (AC: 2, 3)
  - [ ] Create `calculatePollingInterval(timeToStart: number): number` function
  - [ ] Implement time-based interval matrix (15s, 30s, 60s)
  - [ ] Add unit tests for boundary conditions (300s, 301s, 900s, 901s)
  - [ ] Ensure function handles edge cases (negative time, race already started)

- [ ] Task 2: Implement race query and scheduling logic (AC: 1, 4)
  - [ ] Query database for upcoming races (`status IN ('open', 'upcoming')`)
  - [ ] Filter races by start_time (next 24 hours)
  - [ ] Create `scheduleRace(raceId: string, interval: number)` function
  - [ ] Use `setInterval` to call `processRace()` at calculated interval
  - [ ] Store interval handles in Map keyed by raceId

- [ ] Task 3: Implement interval cleanup (AC: 5)
  - [ ] Listen for race status changes (completed, abandoned, final)
  - [ ] Clear interval handle when race finishes
  - [ ] Remove race from active scheduling map
  - [ ] Log race completion and interval cleanup

- [ ] Task 4: Implement continuous re-evaluation loop (AC: 6)
  - [ ] Create main scheduler loop running every 60 seconds
  - [ ] Re-query database for race status updates
  - [ ] Recalculate intervals for active races
  - [ ] Update intervals if they changed (clear old, start new)
  - [ ] Add/remove races as they enter/exit scheduling window

- [ ] Task 5: Add structured logging (AC: 7)
  - [ ] Log interval changes with race context (raceId, old interval, new interval, reason)
  - [ ] Log race scheduling events (raceId, interval, start_time, time_to_start)
  - [ ] Log race completion events (raceId, final status, total polls)
  - [ ] Use Pino structured JSON format

- [ ] Task 6: Add unit tests for scheduler logic (AC: All)
  - [ ] Test interval calculation with various time-to-start values
  - [ ] Test race scheduling and interval storage
  - [ ] Test interval cleanup on race completion
  - [ ] Test re-evaluation loop with mock database queries
  - [ ] Test edge cases (race starts during evaluation, database errors)

- [ ] Task 7: Add integration tests for end-to-end scheduling (AC: All)
  - [ ] Seed test database with races at different time-to-start values
  - [ ] Start scheduler and verify correct intervals applied
  - [ ] Simulate time progression and verify interval updates
  - [ ] Verify race processor called at correct intervals
  - [ ] Verify cleanup when races complete

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
  if (timeToStartSeconds <= 0) {
    // Race already started or finished - no polling needed
    return 0;
  }

  const FIVE_MINUTES = 5 * 60;
  const FIFTEEN_MINUTES = 15 * 60;

  if (timeToStartSeconds <= FIVE_MINUTES) {
    return 15_000; // 15 seconds
  } else if (timeToStartSeconds <= FIFTEEN_MINUTES) {
    return 30_000; // 30 seconds
  } else {
    return 60_000; // 60 seconds
  }
}
```

**Interval Updates:**
- Races automatically transition from 60s → 30s → 15s as start time approaches
- Re-evaluation every 60 seconds ensures timely transitions
- Example timeline:
  - T-20 minutes: 60s polling
  - T-10 minutes: 30s polling
  - T-4 minutes: 15s polling
  - T+0 minutes: polling stops

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

### Completion Notes List

### File List

## Change Log

| Date       | Change                                 | Author                   |
| ---------- | -------------------------------------- | ------------------------ |
| 2025-10-14 | Story drafted by create-story workflow | Bob (Scrum Master agent) |
