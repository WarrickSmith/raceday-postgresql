# Story 2.10C: Data Pipeline Processing

Status: Ready

## Story

As a **developer**,
I want **enhanced data processing with race pools, money flow, and odds change detection**,
so that **complete race data flows from API to database without duplication or data loss**.

## Acceptance Criteria

1. **Race Pools Extraction**: Extract and populate tote_pools data from NZTAB API into race_pools table
2. **Money Flow Calculations**: Implement incremental calculations and time-bucketing logic for money_flow_history
3. **Odds Change Detection**: Add change detection to prevent duplicate odds_history records when odds haven't changed
4. **Data Quality Validation**: Mathematical consistency validation and quality scoring for transformed data
5. **Pipeline Integration**: Update race processor to orchestrate enhanced processing steps with proper error handling

## Tasks / Subtasks

- [ ] Task 1: Implement race pools extraction and storage (AC: 1)
  - [ ] Subtask 1.1: Add race_pools extraction logic to worker transform
  - [ ] Subtask 1.2: Update `bulkUpsertRacePools()` function in bulk-upsert.ts
  - [ ] Subtask 1.3: Extract pool amounts (win_pool_amount, place_pool_amount) from NZTAB API response
  - [ ] Subtask 1.4: Validate pool data with Zod schema before persistence
  - [ ] Subtask 1.5: Add unit tests for race pools extraction and UPSERT
  - [ ] Subtask 1.6: Add integration test verifying pools are written to database

- [ ] Task 2: Enhance money flow calculations with incremental deltas (AC: 2)
  - [ ] Subtask 2.1: Implement incremental calculation logic (change from previous poll)
  - [ ] Subtask 2.2: Add time-bucketing logic for interval_type (pre_race, critical, post_race)
  - [ ] Subtask 2.3: Calculate time_to_start and time_interval fields
  - [ ] Subtask 2.4: Update worker transform to include incremental fields
  - [ ] Subtask 2.5: Add unit tests for incremental calculations
  - [ ] Subtask 2.6: Validate calculations against server-old fixtures (if available)

- [ ] Task 3: Implement odds change detection (AC: 3)
  - [ ] Subtask 3.1: Add odds comparison logic in race processor
  - [ ] Subtask 3.2: Query latest odds from odds_history before inserting new records
  - [ ] Subtask 3.3: Skip INSERT if odds values are identical to previous poll
  - [ ] Subtask 3.4: Log odds change events (when odds actually change)
  - [ ] Subtask 3.5: Add unit tests for odds change detection
  - [ ] Subtask 3.6: Add integration test verifying duplicate prevention

- [ ] Task 4: Implement data quality validation (AC: 4)
  - [ ] Subtask 4.1: Add mathematical consistency checks (pools sum correctly, percentages add to 100%)
  - [ ] Subtask 4.2: Validate entrant count matches race expectations
  - [ ] Subtask 4.3: Implement quality scoring logic (0-100 score based on completeness)
  - [ ] Subtask 4.4: Log quality warnings when score below threshold (e.g., <80)
  - [ ] Subtask 4.5: Add unit tests for quality validation functions
  - [ ] Subtask 4.6: Add integration test for end-to-end quality validation

- [ ] Task 5: Update race processor pipeline integration (AC: 5)
  - [ ] Subtask 5.1: Update `processRace()` to call race pools UPSERT
  - [ ] Subtask 5.2: Update `processRace()` to call odds change detection before INSERT
  - [ ] Subtask 5.3: Update `processRace()` to perform data quality validation
  - [ ] Subtask 5.4: Add structured logging for pipeline steps (pools, odds changes, quality scores)
  - [ ] Subtask 5.5: Handle errors gracefully (continue pipeline on non-critical failures)
  - [ ] Subtask 5.6: Update integration tests to verify complete pipeline

- [ ] Task 6: Update time-series INSERT operations (AC: 2, 3)
  - [ ] Subtask 6.1: Update `insertMoneyFlowHistory()` to include incremental fields
  - [ ] Subtask 6.2: Update `insertOddsHistory()` to use conditional INSERT (skip if no change)
  - [ ] Subtask 6.3: Add batch size optimization for time-series writes
  - [ ] Subtask 6.4: Verify partition routing for new fields
  - [ ] Subtask 6.5: Add unit tests for updated INSERT operations
  - [ ] Subtask 6.6: Add integration test for time-series writes with new fields

## Dev Notes

### Context & Background

This story implements the **core data pipeline enhancements** identified in the Story 2.10 split. It builds on the foundation established by:

- **Story 2.10A** (Code Quality Foundation) - Clean codebase with passing tests ✅
- **Story 2.10B** (Database Infrastructure) - Complete schema and automated partitions ✅

**Key Enhancements:**

1. **Race Pools Data**: Currently missing from the pipeline, needed for complete money flow analysis
2. **Incremental Money Flow**: Track changes over time (deltas between polls), not just absolute values
3. **Odds Change Detection**: Prevent duplicate odds_history records when odds are unchanged (reduces storage and improves query performance)
4. **Data Quality Validation**: Ensure mathematical consistency and completeness before persistence

**Dependencies:**

- Depends on **Story 2.10A**: Requires passing tests and clean build
- Depends on **Story 2.10B**: Requires complete schema including race_pools table and time-series partitions
- Blocks **Story 2.10D**: Integration & Performance Validation cannot proceed without complete data pipeline

**Strategic Importance:**

This story completes the data pipeline processing layer, enabling full end-to-end testing in Story 2.10D. Without these enhancements, the pipeline would have incomplete data (missing pools), unnecessary duplicate records (unchanged odds), and no quality validation.

### Architecture Alignment

**Data Pipeline Architecture** [Source: [tech-spec-epic-2.md](../tech-spec-epic-2.md#L102-L110)]

The race processor orchestrates the complete pipeline:

1. **Fetch** → NZ TAB API (race data, pools, odds)
2. **Transform** → Worker thread (money flow calculations, incremental deltas)
3. **Validate** → Quality checks (mathematical consistency, completeness)
4. **Write** → Bulk UPSERT (meetings, races, entrants, pools) + Time-Series INSERT (money_flow_history, odds_history)

**Race Pools Requirements** [Source: [tech-spec-epic-2.md](../tech-spec-epic-2.md#L79-L81)]

- `race_pools` table captures pool totals (win_pool_amount, place_pool_amount)
- Supports money-flow deltas per race
- Maintains timestamped snapshots for API responses

**Money Flow Incremental Logic** [Source: [tech-spec-epic-2.md](../tech-spec-epic-2.md#L17), [epics.md](../epics.md#L18)]

Story 2.4 established base calculations:
- hold_percentage, bet_percentage, win_pool_percentage, place_pool_percentage
- **Story 2.10C adds**: incremental amounts (change from previous poll), time_interval, interval_type

**Odds Change Detection** [Source: Architecture best practices]

- Query latest odds from odds_history before INSERT
- Compare current odds to previous odds
- Only INSERT if odds have changed (prevents duplicate records)
- Log odds change events for observability

**Data Quality Validation** [Source: [tech-spec-epic-2.md](../tech-spec-epic-2.md#L121), NFR009]

- Zod schema validation for all NZTAB responses (already implemented in Story 2.2)
- **Story 2.10C adds**: Mathematical consistency checks (pools sum correctly, percentages validate)
- Quality scoring (0-100) based on data completeness
- Warning logs when quality score below threshold

### Known Gaps from Previous Stories

**From Story 2.5 & 2.6 Reviews:**

- Race pools UPSERT is mentioned but not yet implemented
- Money flow history INSERT includes polling_timestamp and event_timestamp but lacks incremental delta fields
- Odds history INSERT uses `new Date().toISOString()` instead of proper race time ([server/src/pipeline/race-processor.ts:106](../../server/src/pipeline/race-processor.ts#L106))

**From Story 2.10B Migration 008:**

- Schema now includes all fields from Appwrite (30+ new fields)
- Race pools table fully defined and ready
- Partition infrastructure automated

**This Story Addresses:**

1. **Race Pools**: Implement extraction and UPSERT operations
2. **Incremental Money Flow**: Add delta calculations and time-bucketing
3. **Odds Detection**: Implement change detection to prevent duplicates
4. **Quality Validation**: Add mathematical consistency checks

### Project Structure Notes

**Files to Create/Modify:**

Race Pools:
- [server/src/database/bulk-upsert.ts](../../server/src/database/bulk-upsert.ts) - Add or update `bulkUpsertRacePools()`
- [server/src/workers/messages.ts](../../server/src/workers/messages.ts) - Update worker message types for race pools

Money Flow Enhancements:
- [server/src/workers/transform-worker.ts](../../server/src/workers/transform-worker.ts) - Add incremental calculation logic
- [server/src/database/time-series.ts](../../server/src/database/time-series.ts) - Update `insertMoneyFlowHistory()` signature

Odds Change Detection:
- [server/src/pipeline/race-processor.ts](../../server/src/pipeline/race-processor.ts) - Add odds change detection before INSERT
- [server/src/database/queries.ts](../../server/src/database/queries.ts) - New: Add query for latest odds (or add to existing queries file)

Data Quality:
- [server/src/validation/data-quality.ts](../../server/src/validation/data-quality.ts) - New: Quality validation functions
- [server/src/pipeline/race-processor.ts](../../server/src/pipeline/race-processor.ts) - Integrate quality checks

Testing:
- [server/tests/unit/database/bulk-upsert.test.ts](../../server/tests/unit/database/bulk-upsert.test.ts) - Add race pools tests
- [server/tests/unit/workers/transform-worker.test.ts](../../server/tests/unit/workers/transform-worker.test.ts) - Add incremental calculation tests
- [server/tests/unit/validation/data-quality.test.ts](../../server/tests/unit/validation/data-quality.test.ts) - New: Quality validation tests
- [server/tests/integration/pipeline/race-processor.test.ts](../../server/tests/integration/pipeline/race-processor.test.ts) - Update for complete pipeline

### Testing Strategy

**Unit Tests:**

- Race pools extraction from NZTAB API response
- Race pools UPSERT SQL generation and execution
- Incremental money flow calculations (delta logic)
- Time-bucketing logic (pre_race, critical, post_race intervals)
- Odds change detection comparison logic
- Data quality validation functions (mathematical consistency, quality scoring)

**Integration Tests:**

- End-to-end pipeline with race pools data
- Verify race pools written to database correctly
- Verify money_flow_history includes incremental fields
- Verify odds_history does NOT insert duplicate records when odds unchanged
- Verify odds_history DOES insert when odds change
- Data quality validation triggers warnings on incomplete data

**Test Data:**

- Use existing NZTAB API fixtures from Story 2.1/2.2
- Create fixtures with unchanged odds (for duplicate detection testing)
- Create fixtures with changed odds (for insertion testing)
- Create fixtures with incomplete data (for quality validation testing)

**Expected Outcomes:**

- All unit tests pass (target: 100% coverage for new functions)
- All integration tests pass
- Pipeline processes complete race data (meetings, races, entrants, pools, history)
- Odds change detection prevents duplicates (verify with test fixture)
- Data quality warnings logged for incomplete data

### Performance Considerations

**Race Pools UPSERT:**

- Add pools UPSERT to existing transaction (no additional database round-trip)
- Target: Pools UPSERT within overall <300ms per race budget

**Odds Change Detection:**

- Query latest odds: Use indexed query (idx_odds_entrant_time), should be <10ms
- Comparison: In-memory comparison, negligible overhead
- **Net benefit**: Reduces INSERT operations when odds unchanged (saves time and storage)

**Data Quality Validation:**

- Validation runs in-memory (no database queries)
- Mathematical checks: Simple arithmetic, negligible overhead
- **Net benefit**: Catch data quality issues before persistence (prevents bad data)

**Overall Pipeline Impact:**

- Race pools: +10-20ms (one additional UPSERT operation)
- Odds detection: -5ms to +10ms (query cost offset by skipped INSERTs)
- Quality validation: +5ms (in-memory validation)
- **Total impact**: +10-35ms per race (well within <2s budget)

### References

- **Epic Breakdown**: [docs/epics.md](../epics.md#L174-L190) - Story 2.10C definition
- **Tech Spec Epic 2**: [docs/tech-spec-epic-2.md](../tech-spec-epic-2.md) - Data pipeline architecture
- **Solution Architecture**: [docs/solution-architecture.md](../solution-architecture.md#L243-L352) - Epic 2 components
- **Story 2.10A**: [docs/stories/story-2.10A.md](./story-2.10A.md) - Code quality foundation (dependency)
- **Story 2.10B**: [docs/stories/story-2.10B.md](./story-2.10B.md) - Database infrastructure (dependency)
- **Story 2.10**: [docs/stories/story-2.10.md](./story-2.10.md) - Original comprehensive analysis

**Technical References:**

- Story 2.1: NZ TAB API Client implementation
- Story 2.2: Zod schema validation
- Story 2.3: Worker thread pool
- Story 2.4: Money flow transform logic
- Story 2.5: Bulk UPSERT operations
- Story 2.6: Time-series INSERT operations
- Story 2.7: Race processor orchestrator

### Dependency Notes

**This Story Depends On:**

- Story 2.10A (Code Quality Foundation) - COMPLETE ✅
- Story 2.10B (Database Infrastructure & Partitions) - COMPLETE ✅

**This Story Blocks:**

- Story 2.10D (Integration & Performance Validation) - Cannot validate complete pipeline without full data processing

**Critical Path:**

This is the third story in the 2.10 split sequence. Data pipeline processing must be complete before end-to-end integration testing can proceed in Story 2.10D.

## Dev Agent Record

### Context Reference

- [story-context-2.10C.xml](./story-context-2.10C.xml) - Generated 2025-10-18

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

### Completion Notes List

### File List

---

## Change Log

| Date       | Change                                      | Author  |
| ---------- | ------------------------------------------- | ------- |
| 2025-10-18 | Story created via create-story workflow     | warrick |
