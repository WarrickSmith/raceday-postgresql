# Story 2.10: Dynamic Scheduler with Time-Based Intervals

Status: COMPLETED & REPLACED

## Story

As a **developer**,
I want **comprehensive data population pipeline with automatic partitions, complete schema alignment, and enhanced data processing**,
so that **the dynamic scheduler can function with full data flow and client applications receive complete race data**.

## Acceptance Criteria

1. **Database Partition Automation**: Daily partitions are automatically created for time-series tables (money_flow_history, odds_history) preventing PartitionNotFoundError
2. **Complete Schema Alignment**: All 50+ missing database fields are added and populated from NZTAB API data, ensuring client compatibility
3. **Race Pools Population**: Race pools data is extracted from NZTAB API and stored in race_pools table with all pool types (win, place, quinella, etc.)
4. **Enhanced Money Flow Processing**: Money flow incremental calculations work properly with time-bucketing and mathematical consistency validation
5. **Odds Change Detection**: Odds processing prevents duplicate records through proper change detection logic
6. **End-to-End Data Flow**: Integration tests pass with complete data flow from API to database to scheduler
7. **Performance Validation**: All database operations maintain performance targets (5 races in <15s, single race in <2s) with proper indexing

## Tasks / Subtasks

- [ ] Task 1: Implement database partition automation (AC: 1)
  - [ ] Create `ensurePartition(tableName: string, date: Date): Promise<void>` function in time-series.ts
  - [ ] Add partition existence validation before all time-series writes
  - [ ] Implement automatic partition creation for today + tomorrow dates
  - [ ] Add graceful error handling and structured logging for partition operations
  - [ ] Create unit tests for partition management with various date scenarios
  - [ ] Add integration tests validating partition creation and data insertion

- [ ] Task 2: Add missing database schema fields (AC: 2)
  - [ ] Create migration 008_add_missing_entrant_fields.sql (jockey, trainer, barrier, silk colours, etc.)
  - [ ] Create migration 009_add_missing_race_fields.sql (distance, prize money, video channels, etc.)
  - [ ] Create migration 010_add_missing_meeting_fields.sql (weather, track condition, state, etc.)
  - [ ] Create migration 011_enhance_money_flow_history.sql (timeline fields, incremental calculations)
  - [ ] Add performance indexes for new fields (entrant barrier, money flow timeline, race status)
  - [ ] Update TypeScript interfaces to include all new fields
  - [ ] Create unit tests for schema migrations and field validations

- [ ] Task 3: Enhance data processing logic for race pools (AC: 3)
  - [ ] Add `extractPoolTotals(apiData: any, raceId: string): RacePoolData | null` function
  - [ ] Implement RacePoolData interface with all pool types (win, place, quinella, trifecta, etc.)
  - [ ] Create race-pools.ts module with `insertRacePoolData()` function
  - [ ] Update transformWorker.ts to extract and process tote_pools from NZTAB API
  - [ ] Add currency conversion and amount normalization (to cents)
  - [ ] Implement race pools data validation and error handling
  - [ ] Create unit tests for race pools extraction and insertion

- [ ] Task 4: Implement enhanced money flow processing (AC: 4)
  - [ ] Add `getPreviousMoneyFlowRecord()` function for incremental calculations
  - [ ] Implement `createTimeBucketedRecords()` for time-bucketed timeline data
  - [ ] Create MoneyFlowRecord interface with all timeline and calculation fields
  - [ ] Add incremental delta calculations (win/place amounts, percentages)
  - [ ] Implement mathematical consistency validation
  - [ ] Add data quality scoring and stale data detection
  - [ ] Update transformWorker.ts with enhanced money flow logic
  - [ ] Create unit tests for incremental calculations and time-bucketing

- [ ] Task 5: Add odds change detection logic (AC: 5)
  - [ ] Implement `hasOddsChanged()` function comparing new odds with previous records
  - [ ] Add odds comparison for fixed_win, fixed_place, pool_win, pool_place
  - [ ] Update race-processor.ts to check for odds changes before insertion
  - [ ] Add structured logging for odds change events
  - [ ] Implement change detection tolerance for floating-point comparisons
  - [ ] Create unit tests for odds change detection scenarios
  - [ ] Add integration tests validating duplicate prevention

- [ ] Task 6: Update data pipeline integration (AC: 6)
  - [ ] Modify `persistTransformedRace()` to handle race pools and enhanced money flow
  - [ ] Update race-processor.ts to call new data processing functions
  - [ ] Add partition checks before all time-series data writes
  - [ ] Implement proper error handling and rollback for data pipeline failures
  - [ ] Add comprehensive structured logging for pipeline operations
  - [ ] Update database transaction handling for multiple table writes
  - [ ] Create end-to-end integration tests for complete data flow

- [ ] Task 7: Add comprehensive testing and validation (AC: 7)
  - [ ] Create end-to-end integration test for complete API-to-database flow
  - [ ] Add performance tests validating 5 races in <15s, single race in <2s targets
  - [ ] Implement data quality validation SQL queries for mathematical consistency
  - [ ] Create tests for partition creation with various date scenarios
  - [ ] Add load testing for concurrent race processing
  - [ ] Validate client application data access patterns
  - [ ] Create regression test suite to prevent future data pipeline breaks

## Dev Notes

### Remediation Architecture Integration

**Data Pipeline Enhancement Focus:**
- The Dynamic Scheduler (Story 2.10) is implemented and working correctly
- This story addresses critical data population blockers preventing end-to-end functionality
- Focus shifts from scheduler logic to comprehensive data pipeline remediation

**Key Integration Points:**
- **Database Layer**: Time-series partition management and schema alignment
- **Data Processing**: Enhanced transformWorker.ts with race pools and money flow logic
- **Pipeline Integration**: Updated race-processor.ts to handle complete data flow
- **Testing**: Comprehensive validation of end-to-end data pipeline

### Critical Blocker Resolution

**Phase 1 - Database Infrastructure (CRITICAL):**
- Implement automatic daily partition creation for `money_flow_history` and `odds_history`
- Prevent `PartitionNotFoundError` that blocks all data writes
- Add graceful partition existence validation before time-series operations

**Phase 2 - Schema Alignment (HIGH):**
- Add 50+ missing fields identified in Appwrite vs PostgreSQL gap analysis
- Focus on critical client-facing data: entrant details, race metadata, meeting information
- Maintain backward compatibility during schema migrations

**Phase 3 - Data Processing Logic (HIGH):**
- Implement race pools extraction from NZTAB API `tote_pools` data
- Add money flow incremental calculations with time-bucketing
- Create odds change detection to prevent duplicate records

**Phase 4 - Testing & Validation (MEDIUM):**
- End-to-end integration tests for complete data flow
- Performance validation maintaining target thresholds
- Data quality validation and mathematical consistency checks

### Performance Requirements

**Data Pipeline Performance Targets:**
- **5 races in <15 seconds**: Batch processing performance requirement
- **Single race in <2 seconds**: Individual race processing target
- **Partition creation**: <100ms for automatic partition setup
- **Database writes**: <50ms per time-series record with proper indexing
- **Schema migrations**: Zero-downtime deployments with backward compatibility

**Quality Requirements:**
- **Mathematical consistency**: Money flow calculations must balance
- **Data completeness**: All required fields populated from API data
- **Change detection**: No duplicate odds or money flow records
- **Performance monitoring**: Structured logging for pipeline health

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

- docs/stories/story-context-2.10.xml (Original scheduler context)
- docs/stories/story-context-2.10.xml (NEW: Comprehensive remediation scope - 2025-10-16)

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
- 2025-10-16: Code quality assessment completed - found 245 lint errors, 45+ TypeScript build errors, and 14+ test failures. Updated validation checklist with prioritized remediation phases. Story needs significant foundation work before data pipeline remediation can proceed.

### Critical Blockers Discovered (2025-10-16)

- **🔴 CRITICAL: Code Quality Issues**: 245 lint errors and 45+ TypeScript build errors indicating significant code quality problems across the codebase.
- **🔴 CRITICAL: Partition Management Issues**: Tests failing due to incorrect partition date calculations (odds_history_2025_10_15 vs 2025_10_14) and auto-creation not working properly.
- **🔴 CRITICAL: Data Pipeline Broken**: "INSERT has more target columns than expressions" errors throughout the test suite, indicating schema mismatches between code and database.
- **🔴 CRITICAL: Schema Misalignment**: 50+ missing fields between Appwrite (server-old) and PostgreSQL implementations, including critical entrant data (jockey, trainer, barrier), race metadata (distance, prize money), and meeting information (weather, track conditions).
- **🔴 HIGH: Test Suite Failures**: 14+ failing tests across unit and integration suites, indicating systemic issues that need immediate attention.

**Current Status Assessment (2025-10-16)**:
- ✅ **Lint Status**: 245 errors found - needs immediate remediation
- ✅ **TypeScript Build**: 45+ errors - needs immediate remediation
- ✅ **Test Suite**: Multiple failures - needs immediate remediation
- ✅ **Partition Logic**: Identified and documented issues
- ✅ **Schema Alignment**: Comprehensive remediation plan created

**Updated Assessment**: Story requires significant code quality remediation before data pipeline work can proceed. The foundation (linting, typing, build, tests) must be stabilized first.

### File List

**Existing Scheduler Files (Already Completed):**
- server/src/scheduler/interval.ts (completed)
- server/src/scheduler/index.ts (completed)
- server/src/scheduler/scheduler.ts (completed)
- server/src/scheduler/types.ts (completed)

**New Remediation Files to Create:**
- server/database/migrations/008_add_missing_entrant_fields.sql (new)
- server/database/migrations/009_add_missing_race_fields.sql (new)
- server/database/migrations/010_add_missing_meeting_fields.sql (new)
- server/database/migrations/011_enhance_money_flow_history.sql (new)
- server/src/database/race-pools.ts (new)
- server/tests/unit/database/time-series-partition.test.ts (new)
- server/tests/unit/workers/race-pools.test.ts (new)
- server/tests/integration/data-pipeline.e2e.test.ts (new)

**Files to Modify for Remediation:**
- server/src/database/time-series.ts (partition automation)
- server/src/workers/transformWorker.ts (enhanced data processing)
- server/src/pipeline/race-processor.ts (pipeline integration)
- server/src/shared/types.ts (updated interfaces)

**Documentation:**
- docs/stories/story-2.10.md (restructured for remediation)
- docs/stories/story-context-2.10.xml (comprehensive remediation scope)

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
| 2025-10-16 | CRITICAL: Discovered data population blockers during regression testing; story halted | Amelia (Developer agent) |
| 2025-10-16 | RESTRUCTURED: Converted to comprehensive data population remediation story with 7 actionable tasks and proper acceptance criteria | Amelia (Developer agent) |
| 2025-10-16 | CODE QUALITY ASSESSMENT: Found 245 lint errors, 45+ TypeScript build errors, 14+ test failures. Updated validation checklist with prioritized remediation phases. Foundation work needed before data pipeline remediation. | Amelia (Developer agent) |
| 2025-10-17 | STORY SPLIT COMPLETED: Split into 4 focused stories (2.10A-2.10D) for better workflow tracking. All findings preserved in Epic 2 and new stories. Original story marked COMPLETED & REPLACED. | Amelia (Developer agent) |

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

### Updated Validation Checklist (2025-10-16)

**Phase 1: Critical Infrastructure (IMMEDIATE BLOCKERS)**
- [ ] **FIX PARTITION ISSUE**: Odds change detection test failing - wrong partition date calculation (odds_history_2025_10_15 vs 2025_10_14)
- [ ] Database partitions exist for current dates (money_flow_history, odds_history)
- [ ] Race data can be successfully written to time-series tables without PartitionNotFoundError
- [ ] Partition creation logic works for today + tomorrow dates automatically
- [ ] Partition existence validation before all time-series writes

**Phase 2: Code Quality & Standards (CURRENT TASKS)**
- [ ] **NO LINT ERRORS**: Ensure all code passes linting without warnings
- [ ] **STRICT TYPING**: Eliminate all 'any' types and ensure strict TypeScript compliance
- [ ] **BUILD SUCCESS**: npm run build completes without issues
- [ ] **ALL TESTS PASS**: Fix failing odds change detection test and ensure full test suite passes

**Phase 3: Data Processing Logic (HIGH PRIORITY)**
- [ ] Tote pools data is extracted and populated correctly
- [ ] Money flow incremental calculations work properly
- [ ] Odds change detection prevents duplicate records with proper partition handling
- [ ] All missing database fields are added and populated
- [ ] Data quality validation passes mathematical consistency checks

**Phase 4: Integration & Performance (VALIDATION)**
- [ ] Client applications can access complete data sets
- [ ] Performance tests show acceptable query times (5 races <15s, 1 race <2s)
- [ ] End-to-end pipeline functions correctly with live data
- [ ] Load testing for concurrent race processing
- [ ] Regression test suite to prevent future breaks
