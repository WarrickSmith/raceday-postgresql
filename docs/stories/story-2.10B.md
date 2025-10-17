# Story 2.10B: Database Infrastructure & Partitions

Status: Ready

## Story

As a **developer**,
I want **automated partition management and complete schema alignment**,
so that **data can be written to time-series tables without errors**.

## Acceptance Criteria

1. **Partition Automation**: Daily partitions auto-created for money_flow_history and odds_history tables
2. **Schema Alignment**: 50+ missing fields added to match Appwrite implementation
3. **Migration Scripts**: New database migrations created for entrant, race, and meeting field additions
4. **Performance Indexes**: Optimized indexes created for new fields and time-series queries
5. **Error Handling**: Graceful partition creation and schema validation with proper error logging

## Tasks / Subtasks

- [ ] Task 1: Implement automated partition creation (AC: 1, 5)
  - [ ] Subtask 1.1: Create PostgreSQL function `create_daily_partitions()` for money_flow_history and odds_history
  - [ ] Subtask 1.2: Implement partition naming convention: `{table}_YYYY_MM_DD`
  - [ ] Subtask 1.3: Add partition range logic: `FOR VALUES FROM (date) TO (date + 1 day)`
  - [ ] Subtask 1.4: Schedule partition creation using Node.js cron job (runs at midnight NZST)
  - [ ] Subtask 1.5: Add error handling for existing partitions (skip if already exists)
  - [ ] Subtask 1.6: Implement logging for partition creation success/failure
  - [ ] Subtask 1.7: Create integration test verifying partition auto-creation

- [ ] Task 2: Identify and document schema gaps (AC: 2)
  - [ ] Subtask 2.1: Audit Appwrite implementation for all meeting fields
  - [ ] Subtask 2.2: Audit Appwrite implementation for all race fields
  - [ ] Subtask 2.3: Audit Appwrite implementation for all entrant fields
  - [ ] Subtask 2.4: Compare PostgreSQL schema with Appwrite attributes
  - [ ] Subtask 2.5: Document missing fields in migration plan
  - [ ] Subtask 2.6: Identify any deprecated fields to exclude

- [ ] Task 3: Create database migration scripts (AC: 3)
  - [ ] Subtask 3.1: Create migration for meeting table field additions
  - [ ] Subtask 3.2: Create migration for race table field additions
  - [ ] Subtask 3.3: Create migration for entrant table field additions
  - [ ] Subtask 3.4: Add proper column types, constraints, and defaults
  - [ ] Subtask 3.5: Include rollback (DOWN) migrations for each change
  - [ ] Subtask 3.6: Test migrations: apply → verify → rollback → re-apply

- [ ] Task 4: Create optimized indexes (AC: 4)
  - [ ] Subtask 4.1: Add indexes for new meeting fields (if needed for queries)
  - [ ] Subtask 4.2: Add indexes for new race fields (status, start time filters)
  - [ ] Subtask 4.3: Add indexes for new entrant fields (runner lookups, scratched status)
  - [ ] Subtask 4.4: Optimize time-series partition indexes (event_timestamp, entrant_id)
  - [ ] Subtask 4.5: Run EXPLAIN ANALYZE on key queries to validate index usage
  - [ ] Subtask 4.6: Document index strategy and performance impact

- [ ] Task 5: Update TypeScript interfaces (AC: 2, 5)
  - [ ] Subtask 5.1: Update Meeting interface with new fields
  - [ ] Subtask 5.2: Update Race interface with new fields
  - [ ] Subtask 5.3: Update Entrant interface with new fields
  - [ ] Subtask 5.4: Add Zod schemas for validation of new fields
  - [ ] Subtask 5.5: Update bulk UPSERT operations to include new fields
  - [ ] Subtask 5.6: Verify no TypeScript build errors

- [ ] Task 6: Integration testing and validation (AC: 1, 4, 5)
  - [ ] Subtask 6.1: Test partition creation runs successfully at scheduled time
  - [ ] Subtask 6.2: Test partition creation handles existing partitions gracefully
  - [ ] Subtask 6.3: Test data inserts route to correct partitions
  - [ ] Subtask 6.4: Validate all new fields accept data correctly
  - [ ] Subtask 6.5: Run full test suite to ensure no regressions
  - [ ] Subtask 6.6: Document any known issues or follow-up work

## Dev Notes

### Context & Background

This story addresses **database infrastructure gaps** discovered during Story 2.10 investigation. It focuses on two critical areas:

1. **Automated Partition Management**: Ensuring time-series tables have daily partitions created automatically
2. **Schema Alignment**: Adding 50+ missing fields to match the complete Appwrite implementation

**Dependencies:**
- **Story 2.10A** (Code Quality Foundation) - COMPLETE ✅
- Blocks **Story 2.10C** (Data Pipeline Processing)
- Blocks **Story 2.10D** (Integration & Performance Validation)

**Strategic Importance:**
Without automated partitions, data writes to time-series tables will fail. Without complete schema alignment, data transformation cannot populate all required fields from the NZTAB API.

### Architecture Alignment

**Partition Strategy** [Source: [tech-spec-epic-2.md](../tech-spec-epic-2.md#L70-L82)]
- Daily range partitions for `money_flow_history` and `odds_history`
- Partition naming: `{table}_YYYY_MM_DD` (e.g., `money_flow_history_2025_10_17`)
- **Critical: Partitions aligned with New Zealand racing day** (not UTC)
- Automatic creation at midnight NZST before race day begins
- Partition pruning enables efficient historical queries

**New Zealand Timezone Handling** [Source: [tech-spec-epic-2.md](../tech-spec-epic-2.md#L105), [epics.md](../epics.md#L278)]
- NZTAB API returns fields in New Zealand local time: `race_date_nz` (YYYY-MM-DD), `start_time_nz` (HH:MM:SS NZST)
- **No UTC conversion required** for race_date_nz and start_time_nz fields
- Partition boundaries use race_date_nz to align with NZ racing day
- Time-series event_timestamp uses Pacific/Auckland timezone for consistency
- Racing day boundary is NZ timezone-based, not UTC-based

**Schema Requirements** [Source: [tech-spec-epic-2.md](../tech-spec-epic-2.md#L49-L86)]
- Meetings table: 8+ core fields matching Appwrite attributes
- Races table: 10+ fields including status enums and timestamps
- Entrants table: 22+ fields including odds, pools, and calculated percentages
- All fields use PostgreSQL snake_case naming convention (established in Story 2.10A)

**Performance Targets:**
- Partition creation: <5s per day (2 partitions created)
- Database writes: <300ms per race (AC from Epic 2)
- Index scan performance: EXPLAIN ANALYZE validates all queries use indexes

### Known Schema Gaps from Story 2.10 Analysis

Based on the investigation during Story 2.10, the following field gaps were identified:

**Meeting Table Missing Fields (estimated 5-10):**
- Additional metadata from NZTAB API
- Status tracking fields
- Race day scheduling fields

**Race Table Missing Fields (estimated 10-15):**
- `actual_start` timestamp
- `results_available` boolean
- Pool-related metadata
- Race classification fields

**Entrant Table Missing Fields (estimated 20-30):**
- `barrier` position
- `weight` carried
- `jockey` / `driver` information
- Form guide fields
- Betting market fields beyond current odds
- Calculated percentage fields for money flow

**Note:** Exact field inventory to be determined in Task 2 by auditing `server-old` Appwrite implementation.

### Project Structure Notes

**Files to Create/Modify:**

Database Migrations:
- `server/database/migrations/XXX_add_meeting_fields.sql` - New
- `server/database/migrations/XXX_add_race_fields.sql` - New
- `server/database/migrations/XXX_add_entrant_fields.sql` - New
- `server/database/migrations/XXX_add_partition_indexes.sql` - New

Partition Management:
- `server/src/database/partition-manager.ts` - New
- `server/src/scheduler/partition-scheduler.ts` - New (cron job)

TypeScript Interfaces:
- [server/src/types/database.ts](../../server/src/types/database.ts) - Update Meeting, Race, Entrant interfaces
- [server/src/types/validation.ts](../../server/src/types/validation.ts) - Update Zod schemas

Bulk UPSERT Updates:
- [server/src/database/bulk-upsert.ts](../../server/src/database/bulk-upsert.ts) - Update to handle new fields

### Testing Strategy

**Unit Tests:**
- Partition manager creates partitions with correct naming and ranges
- Partition manager handles existing partitions gracefully (no duplicates)
- Partition creation scheduler runs at correct time (midnight NZST)

**Integration Tests:**
- End-to-end partition creation and data insertion
- Verify data routes to correct partition based on event_timestamp
- Schema validation: all new fields accept data correctly
- UPSERT operations include new fields without errors

**Migration Tests:**
- Apply migrations in sequence: UP migrations succeed
- Rollback migrations: DOWN migrations restore previous state
- Re-apply migrations: UP migrations succeed after rollback

**Performance Tests:**
- EXPLAIN ANALYZE on queries using new indexes
- Validate partition pruning: queries only scan relevant partitions
- Database write performance: <300ms per race with new fields

**Timezone Tests:**
- Verify partition boundaries align with NZ racing day (not UTC)
- Confirm race_date_nz field values route to correct partitions
- Validate no unexpected UTC conversions on NZ timezone fields
- Test partition creation at midnight NZST (not midnight UTC)

### Performance Considerations

**Partition Creation:**
- Scheduled at midnight NZST (before 6:00 AM data initialization from Story 2.9)
- Minimal performance impact (runs during low-traffic period)
- Pre-creates next day's partitions to avoid race conditions

**Index Strategy:**
- Add indexes only for fields used in WHERE/JOIN clauses
- Avoid over-indexing (balance query speed vs write performance)
- Use partial indexes where appropriate (e.g., `WHERE is_scratched = false`)

**Write Performance:**
- More fields = larger rows = slightly slower writes
- Target remains <300ms per race despite additional fields
- Bulk UPSERT operations should batch efficiently

### References

- **Epic Breakdown**: [docs/epics.md](../epics.md#L360-L377) - Story 2.10B definition
- **Tech Spec Epic 2**: [docs/tech-spec-epic-2.md](../tech-spec-epic-2.md) - Partition strategy and schema requirements
- **Solution Architecture**: [docs/solution-architecture.md](../solution-architecture.md#L416-L473) - Epic 4 partition automation
- **Story 2.10A**: [docs/stories/story-2.10A.md](./story-2.10A.md) - Code quality foundation (dependency)
- **Story 2.10**: [docs/stories/story-2.10.md](./story-2.10.md) - Original comprehensive analysis

**Appwrite Schema Reference:**
- Legacy implementation: `server-old/` directory - Audit for complete field list
- Database setup: `server-old/database-setup/` - Attribute definitions

### Dependency Notes

**This Story Depends On:**
- Story 2.10A (Code Quality Foundation) - COMPLETE ✅

**This Story Blocks:**
- Story 2.10C (Data Pipeline Processing) - Cannot process complete data without schema
- Story 2.10D (Integration & Performance Validation) - Cannot validate without infrastructure

**Critical Path:**
This is the second story in the 2.10 split sequence. Database infrastructure must be complete before data pipeline processing can proceed.

## Dev Agent Record

### Context Reference

- [story-context-2.10B.xml](./story-context-2.10B.xml) - Generated 2025-10-17

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

### Completion Notes List

### File List

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-10-17 | Story created via create-story workflow | warrick |
| 2025-10-17 | Story marked ready for development via story-ready workflow | warrick |
| 2025-10-17 | Story context generated via story-context workflow | warrick |
