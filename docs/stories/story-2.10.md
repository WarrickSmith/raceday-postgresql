# Story 2.10: Dynamic Scheduler with Time-Based Intervals

Status: In Progress

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

- **Epic Breakdown:** Story 2.10 requirements (formerly 2.9) → [epic-stories-2025-10-05.md](../epic-stories-2025-10-05.md#L426-L444)
- **Tech Spec Epic 2:** Scheduler component specification → [tech-spec-epic-2.md](../tech-spec-epic-2.md#L41-L42)
- **Solution Architecture:** Dynamic scheduling patterns → [solution-architecture.md](../solution-architecture.md#L338-L344)
- **Architecture Spec:** Polling strategy and intervals → [architecture-specification.md](../architecture-specification.md)
- **PRD:** Performance requirements and polling cadence → [PRD-raceday-postgresql-2025-10-05.md](../PRD-raceday-postgresql-2025-10-05.md)

## Dev Agent Record

### Context Reference

- docs/stories/story-context-2.10.xml

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
- docs/stories/story-2.10.md (updated)
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

## Data Population Investigation & Remediation Plan

### Issue Summary
The Dynamic Scheduler (Story 2.10) is **implemented and running correctly**, but **critical issues** prevent data population in three key tables:
- `money_flow_history` - No records being created
- `odds_history` - No records being created
- `race_pools` - No records being created

### Root Cause Analysis

#### 🔴 **CRITICAL Issue 1: Missing Database Partitions**
- **Problem**: Time-series tables require daily partitions that don't exist
- **Impact**: `PartitionNotFoundError` causes all data writes to fail
- **Evidence**: Error logs show missing partitions for current dates
- **Status**: **IMMEDIATE BLOCKER** - Must resolve before any data can flow

#### 🔴 **HIGH Issue 2: Missing Data Processing Logic**
- **Race Pools**: No extraction of `tote_pools` data from NZTAB API response
- **Money Flow**: Missing incremental delta calculations and time-bucketing logic
- **Odds**: No change detection (creating duplicate records unnecessarily)
- **Impact**: Even with partitions, data pipeline is incomplete

#### 🔴 **HIGH Issue 3: Schema Discrepancies**
- **Problem**: 50+ missing fields between Appwrite (server-old) and PostgreSQL implementations
- **Impact**: Client applications will receive incomplete data or null values
- **Critical Missing Fields**:
  - **Entrants**: `jockey`, `trainer_name`, `barrier`, `silk_colours`, `favourite`, `mover`
  - **Races**: `distance`, `total_prize_money`, `field_size`, `video_channels`, `silk_url`
  - **Meetings**: `weather`, `track_condition`, `state`, `track_surface`, `category`
  - **Money Flow**: Timeline fields, incremental calculations, data quality metrics

### Comprehensive Remediation Plan

#### **Phase 1: Database Infrastructure (IMMEDIATE - CRITICAL)**

##### 1.1 Automatic Partition Management
**File**: `/server/src/database/time-series.ts`
**Action**: Add automatic daily partition creation logic
**Implementation**:
```typescript
async function ensurePartition(tableName: string, date: Date): Promise<void> {
  const partitionName = `${tableName}_${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, '0')}_${String(date.getDate()).padStart(2, '0')}`;

  // Check if partition exists
  const result = await pool.query(`
    SELECT 1 FROM pg_tables
    WHERE tablename = $1
  `, [partitionName]);

  if (result.rows.length === 0) {
    // Create partition for today's date
    await pool.query(`
      CREATE TABLE ${partitionName} PARTITION OF ${tableName}
      FOR VALUES FROM ('${date.toISOString().split('T')[0]}')
      TO ('${new Date(date.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]}')
    `);
  }
}
```

##### 1.2 Partition Existence Validation
- Add partition checks before all time-series writes
- Graceful handling with proper error reporting
- Automatic partition creation for today + tomorrow

#### **Phase 2: Schema Alignment (HIGH PRIORITY)**

##### 2.1 Critical Missing Field Additions

**ENTRANTS Table** (Most Critical for Client Functionality):
```sql
ALTER TABLE entrants ADD COLUMN barrier INTEGER;
ALTER TABLE entrants ADD COLUMN is_late_scratched BOOLEAN DEFAULT FALSE;
ALTER TABLE entrants ADD COLUMN jockey VARCHAR(255);
ALTER TABLE entrants ADD COLUMN trainer_name VARCHAR(255);
ALTER TABLE entrants ADD COLUMN silk_colours VARCHAR(100);
ALTER TABLE entrants ADD COLUMN favourite BOOLEAN DEFAULT FALSE;
ALTER TABLE entrants ADD COLUMN mover BOOLEAN DEFAULT FALSE;
ALTER TABLE entrants ADD COLUMN scratch_time BIGINT;
ALTER TABLE entrants ADD COLUMN runner_change TEXT;
ALTER TABLE entrants ADD COLUMN silk_url64 VARCHAR(500);
ALTER TABLE entrants ADD COLUMN silk_url128 VARCHAR(500);
ALTER TABLE entrants ADD COLUMN last_updated TIMESTAMP;
ALTER TABLE entrants ADD COLUMN imported_at TIMESTAMP;
```

**RACES Table**:
```sql
ALTER TABLE races ADD COLUMN distance INTEGER;
ALTER TABLE races ADD COLUMN total_prize_money INTEGER;
ALTER TABLE races ADD COLUMN field_size INTEGER;
ALTER TABLE races ADD COLUMN positions_paid INTEGER;
ALTER TABLE races ADD COLUMN type VARCHAR(10);
ALTER TABLE races ADD COLUMN video_channels TEXT;
ALTER TABLE races ADD COLUMN silk_url VARCHAR(500);
ALTER TABLE races ADD COLUMN silk_base_url VARCHAR(200);
ALTER TABLE races ADD COLUMN tote_start_time VARCHAR(20);
ALTER TABLE races ADD COLUMN last_status_change TIMESTAMP;
ALTER TABLE races ADD COLUMN finalized_at TIMESTAMP;
ALTER TABLE races ADD COLUMN abandoned_at TIMESTAMP;
ALTER TABLE races ADD COLUMN last_poll_time TIMESTAMP;
```

**MEETINGS Table**:
```sql
ALTER TABLE meetings ADD COLUMN state VARCHAR(10);
ALTER TABLE meetings ADD COLUMN track_direction VARCHAR(20);
ALTER TABLE meetings ADD COLUMN track_surface VARCHAR(50);
ALTER TABLE meetings ADD COLUMN rail_position VARCHAR(100);
ALTER TABLE meetings ADD COLUMN weather VARCHAR(50);
ALTER TABLE meetings ADD COLUMN category VARCHAR(10);
ALTER TABLE meetings ADD COLUMN category_name VARCHAR(100);
ALTER TABLE meetings ADD COLUMN last_updated TIMESTAMP;
ALTER TABLE meetings ADD COLUMN imported_at TIMESTAMP;
```

**MONEY_FLOW_HISTORY Enhancement**:
```sql
ALTER TABLE money_flow_history ADD COLUMN polling_timestamp TIMESTAMP;
ALTER TABLE money_flow_history ADD COLUMN time_to_start INTEGER;
ALTER TABLE money_flow_history ADD COLUMN time_interval INTEGER;
ALTER TABLE money_flow_history ADD COLUMN interval_type VARCHAR(10);
ALTER TABLE money_flow_history ADD COLUMN incremental_amount INTEGER;
ALTER TABLE money_flow_history ADD COLUMN incremental_win_amount INTEGER;
ALTER TABLE money_flow_history ADD COLUMN incremental_place_amount INTEGER;
ALTER TABLE money_flow_history ADD COLUMN pool_type VARCHAR(10);
ALTER TABLE money_flow_history ADD COLUMN is_consolidated BOOLEAN DEFAULT FALSE;
ALTER TABLE money_flow_history ADD COLUMN win_pool_percentage FLOAT;
ALTER TABLE money_flow_history ADD COLUMN place_pool_percentage FLOAT;
ALTER TABLE money_flow_history ADD COLUMN total_pool_amount INTEGER;
ALTER TABLE money_flow_history ADD COLUMN data_quality_score INTEGER;
ALTER TABLE money_flow_history ADD COLUMN mathematically_consistent BOOLEAN;
ALTER TABLE money_flow_history ADD COLUMN polling_latency_ms INTEGER;
ALTER TABLE money_flow_history ADD COLUMN is_stale BOOLEAN DEFAULT FALSE;
```

##### 2.2 Enhanced Performance Indexes
```sql
-- Entrants performance indexes
CREATE INDEX idx_entrants_race_barrier ON entrants(race_id, barrier);
CREATE INDEX idx_entrants_jockey ON entrants(jockey);
CREATE INDEX idx_entrants_trainer ON entrants(trainer_name);

-- Money flow timeline indexes
CREATE INDEX idx_money_flow_time_interval ON money_flow_history(time_interval);
CREATE INDEX idx_money_flow_polling_timestamp ON money_flow_history(polling_timestamp);
CREATE INDEX idx_money_flow_race_entrant_time ON money_flow_history(race_id, entrant_id, time_interval);

-- Race timeline indexes
CREATE INDEX idx_races_last_status_change ON races(last_status_change);
CREATE INDEX idx_races_start_time_status ON races(start_time, status);
```

#### **Phase 3: Data Processing Logic Enhancement (HIGH PRIORITY)**

##### 3.1 Race Pools Population
**File**: `/server/src/workers/transformWorker.ts`
**Action**: Add `tote_pools` data extraction from NZTAB API
**Implementation**:
```typescript
interface RacePoolData {
  raceId: string;
  winPoolTotal: number;
  placePoolTotal: number;
  quinellaPoolTotal: number;
  trifectaPoolTotal: number;
  exactaPoolTotal: number;
  first4PoolTotal: number;
  totalRacePool: number;
  currency: string;
  lastUpdated: Date;
}

function extractPoolTotals(apiData: any, raceId: string): RacePoolData | null {
  try {
    const pools = apiData.tote_pools || [];
    const winPool = pools.find((p: any) => p.type === 'win');
    const placePool = pools.find((p: any) => p.type === 'place');

    if (!winPool || !placePool) {
      return null;
    }

    return {
      raceId,
      winPoolTotal: Math.round(winPool.total * 100), // Convert to cents
      placePoolTotal: Math.round(placePool.total * 100),
      quinellaPoolTotal: Math.round(pools.find((p: any) => p.type === 'quinella')?.total * 100 || 0),
      trifectaPoolTotal: Math.round(pools.find((p: any) => p.type === 'trifecta')?.total * 100 || 0),
      exactaPoolTotal: Math.round(pools.find((p: any) => p.type === 'exacta')?.total * 100 || 0),
      first4PoolTotal: Math.round(pools.find((p: any) => p.type === 'first4')?.total * 100 || 0),
      totalRacePool: pools.reduce((sum: number, p: any) => sum + (p.total || 0), 0) * 100,
      currency: winPool.currency || '$',
      lastUpdated: new Date()
    };
  } catch (error) {
    console.error('Error extracting pool totals:', error);
    return null;
  }
}
```

##### 3.2 Enhanced Money Flow Processing
**File**: `/server/src/workers/transformWorker.ts`
**Action**: Implement incremental delta calculations and time-bucketing
**Implementation**:
```typescript
interface MoneyFlowRecord {
  raceId: string;
  entrantId: string;
  pollingTimestamp: Date;
  timeToStart: number;
  timeInterval: number;
  intervalType: string;
  winPoolAmount: number;
  placePoolAmount: number;
  incrementalWinAmount: number;
  incrementalPlaceAmount: number;
  poolType: string;
  holdPercentage: number;
  betPercentage: number;
  // ... other fields
}

async function getPreviousMoneyFlowRecord(
  pool: any,
  raceId: string,
  entrantId: string,
  currentTimeInterval: number
): Promise<MoneyFlowRecord | null> {
  const result = await pool.query(`
    SELECT * FROM money_flow_history
    WHERE race_id = $1 AND entrant_id = $2 AND time_interval < $3
    ORDER BY time_interval DESC
    LIMIT 1
  `, [raceId, entrantId, currentTimeInterval]);

  return result.rows[0] || null;
}

function createTimeBucketedRecords(
  raceData: any,
  currentTime: Date
): MoneyFlowRecord[] {
  const timeToStart = Math.floor((new Date(raceData.start_time).getTime() - currentTime.getTime()) / 1000 / 60);

  // Define time buckets (60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 4, 3, 2, 1, 0)
  const timeBuckets = [60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 4, 3, 2, 1, 0];
  const relevantBuckets = timeBuckets.filter(bucket => bucket >= timeToStart);

  return relevantBuckets.map(bucket => ({
    raceId: raceData.race_id,
    entrantId: raceData.entrant_id,
    pollingTimestamp: currentTime,
    timeToStart: bucket,
    timeInterval: bucket,
    intervalType: bucket <= 5 ? '5m' : bucket <= 15 ? '1m' : '30s',
    // ... other field calculations
  }));
}
```

##### 3.3 Odds Change Detection
**File**: `/server/src/pipeline/race-processor.ts`
**Action**: Add odds comparison with previous records
**Implementation**:
```typescript
async function hasOddsChanged(
  pool: any,
  raceId: string,
  entrantId: string,
  newOdds: { fixedWin: number; fixedPlace: number; poolWin: number; poolPlace: number }
): Promise<boolean> {
  const result = await pool.query(`
    SELECT fixed_win_odds, fixed_place_odds, pool_win_odds, pool_place_odds
    FROM odds_history
    WHERE race_id = $1 AND entrant_id = $2
    ORDER BY event_timestamp DESC
    LIMIT 1
  `, [raceId, entrantId]);

  if (result.rows.length === 0) {
    return true; // First record
  }

  const lastOdds = result.rows[0];
  return (
    lastOdds.fixed_win_odds !== newOdds.fixedWin ||
    lastOdds.fixed_place_odds !== newOdds.fixedPlace ||
    lastOdds.pool_win_odds !== newOdds.poolWin ||
    lastOdds.pool_place_odds !== newOdds.poolPlace
  );
}
```

#### **Phase 4: Testing & Validation (MEDIUM PRIORITY)**

##### 4.1 End-to-End Data Flow Testing
- Manually trigger race processing for active races
- Validate data appears in all three tables
- Monitor pipeline success/failure rates
- Test with real NZTAB API responses

##### 4.2 Data Quality Validation
```sql
-- Validate mathematical consistency between pool totals
SELECT race_id,
       SUM(win_pool_amount) as total_individual_win,
       (SELECT win_pool_total FROM race_pools WHERE race_id = mh.race_id) as race_total_win,
       ABS(SUM(win_pool_amount) - (SELECT win_pool_total FROM race_pools WHERE race_id = mh.race_id)) as discrepancy
FROM money_flow_history mh
GROUP BY race_id
HAVING ABS(SUM(win_pool_amount) - (SELECT win_pool_total FROM race_pools WHERE race_id = mh.race_id)) > 0;
```

##### 4.3 Performance Monitoring
- Add comprehensive logging for pipeline operations
- Monitor partition creation and data insertion performance
- Track data quality metrics over time

### Files to Modify

1. **Database Migrations**:
   - `/server/database/migrations/008_add_missing_entrant_fields.sql`
   - `/server/database/migrations/009_add_missing_race_fields.sql`
   - `/server/database/migrations/010_add_missing_meeting_fields.sql`
   - `/server/database/migrations/011_enhance_money_flow_history.sql`

2. **Data Processing**:
   - `/server/src/workers/transformWorker.ts` - Complete data processing logic
   - `/server/src/pipeline/race-processor.ts` - Enhanced race coordination

3. **Database Operations**:
   - `/server/src/database/time-series.ts` - Add partition management
   - `/server/src/database/race-pools.ts` - Implement race pools population

4. **Scheduler Enhancement**:
   - `/server/src/scheduler/scheduler.ts` - Add pipeline monitoring

### Implementation Timeline

- **Phase 1** (Immediate): 1-2 days - Partition management and data flow restoration
- **Phase 2** (High): 2-3 days - Schema alignment and field additions
- **Phase 3** (High): 2-3 days - Enhanced data processing logic
- **Phase 4** (Medium): 1-2 days - Testing and validation

### Success Criteria

✅ **All three tables populated** with comprehensive, validated data
✅ **Complete schema alignment** between Appwrite and PostgreSQL
✅ **Enhanced data quality** with mathematical validation and consistency scoring
✅ **Time-bucketed timeline data** for critical race periods
✅ **Optimized performance** with proper indexing and partition management
✅ **Client application compatibility** maintained with no breaking changes

### Risk Mitigation

- **Partition Failures**: Graceful degradation with error reporting
- **Schema Migration**: Rollback capability for each migration phase
- **Data Quality**: Validation checks before data insertion
- **Performance**: Staged rollout with monitoring at each phase

### Dependencies

- **Story 2.7**: Race Processor (already completed)
- **Story 2.6**: Time-Series Writer (already completed)
- **Story 2.3**: Transform Worker (needs enhancement)
- **Epic 4**: Partition automation (needs implementation)

### Validation Checklist

- [ ] Database partitions exist for current dates
- [ ] Race data can be successfully written to time-series tables
- [ ] Tote pools data is extracted and populated correctly
- [ ] Money flow incremental calculations work properly
- [ ] Odds change detection prevents duplicate records
- [ ] All missing database fields are added and populated
- [ ] Client applications can access complete data sets
- [ ] Data quality validation passes mathematical consistency checks
- [ ] Performance tests show acceptable query times
- [ ] End-to-end pipeline functions correctly with live data
