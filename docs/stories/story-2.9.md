# Story 2.9: Daily Baseline Data Initialization

Status: Ready

## Story

As a **system operator**,
I want **automated daily fetching of meetings, races, and initial race data early in the race day**,
so that **the scheduler has race times available and baseline data is pre-populated before real-time polling begins**.

## Acceptance Criteria

1. Daily initialization function runs early morning (6:00 AM NZST) before scheduler activates
2. Function fetches all meetings for current NZ race day from NZ TAB API
3. Function fetches all race details (times, entrants, initial odds) for those meetings
4. Function uses NZ timezone fields (race_date_nz, start_time_nz) from API - no UTC conversion needed
5. Function populates database tables: meetings, races (with start_time), entrants (with initial data)
6. Function uses bulk UPSERT operations for efficient data loading
7. Function handles API failures gracefully with retry logic (max 3 retries)
8. Function completes before dynamic scheduler starts (by 7:00 AM NZST)
9. Function logs completion statistics: meetings fetched, races created, entrants populated, execution duration
10. Scheduler queries database for races with start_time >= NOW() to begin polling operations
11. Database queries use race_date_nz field for partition key alignment (NZ racing day boundary)
12. Optional: Second evening job (post-races, e.g., 9:00 PM NZST) for comprehensive historical backfill if needed

## Tasks / Subtasks

- [ ] Task 1: Implement daily initialization scheduler/cron job (AC: 1, 8)
  - [ ] Create scheduled task to run at 6:00 AM NZST daily
  - [ ] Configure task with appropriate timeout (10-15 minutes for large racing days)
  - [ ] Ensure task completes before scheduler activation (7:00 AM NZST)
  - [ ] Add logging for task start, completion, and failures

- [ ] Task 2: Implement meetings fetch logic (AC: 2, 4)
  - [ ] Reuse NZ TAB API client from Story 2.1
  - [ ] Fetch all meetings for current NZ race day using `/meetings` endpoint
  - [ ] Extract race_date_nz field from API response (YYYY-MM-DD format in NZST)
  - [ ] Filter meetings to NZ/AU thoroughbred/harness races
  - [ ] Handle API failures with retry logic (max 3 retries, exponential backoff)

- [ ] Task 3: Implement race details fetch logic (AC: 3, 4)
  - [ ] For each meeting, fetch all race details using `/races` or `/events` endpoints
  - [ ] Extract start_time_nz field from API response (HH:MM:SS NZST format)
  - [ ] Extract entrant information (runner details, initial odds)
  - [ ] Batch API requests to avoid overwhelming NZ TAB API
  - [ ] Handle partial failures (some races fetch successfully, others fail)

- [ ] Task 4: Implement database population logic (AC: 5, 6, 11)
  - [ ] Reuse bulk UPSERT functions from Story 2.5
  - [ ] Populate meetings table using bulkUpsertMeetings()
  - [ ] Populate races table with start_time field using bulkUpsertRaces()
  - [ ] Populate entrants table with initial odds using bulkUpsertEntrants()
  - [ ] Use race_date_nz for partition key alignment in time-series tables
  - [ ] Execute all writes in transactions with rollback on failure

- [ ] Task 5: Implement retry and error handling (AC: 7)
  - [ ] Add retry logic for transient API failures (network errors, 5xx responses)
  - [ ] Max 3 retry attempts with exponential backoff (100ms, 200ms, 400ms)
  - [ ] Log each retry attempt with details (attempt number, error type)
  - [ ] On final failure, log error and continue with remaining meetings/races
  - [ ] Ensure partial success doesn't block entire initialization

- [ ] Task 6: Implement completion statistics logging (AC: 9)
  - [ ] Log total meetings fetched from API
  - [ ] Log total meetings successfully written to database
  - [ ] Log total races created with start_time populated
  - [ ] Log total entrants populated with initial data
  - [ ] Log execution duration (start time, end time, elapsed time)
  - [ ] Use structured JSON logging (Pino) for observability

- [ ] Task 7: Verify scheduler integration (AC: 10)
  - [ ] Ensure scheduler queries races table for start_time >= NOW()
  - [ ] Verify scheduler can access race times populated by initialization
  - [ ] Test scheduler activation after initialization completes (7:00 AM NZST)
  - [ ] Verify scheduler begins polling races with correct intervals

- [ ] Task 8: Add unit tests for initialization logic (AC: All)
  - [ ] Test meetings fetch with mocked NZ TAB API responses
  - [ ] Test race details fetch with various response scenarios
  - [ ] Test database population with bulk UPSERT operations
  - [ ] Test retry logic with simulated API failures
  - [ ] Test race_date_nz field usage for partition alignment
  - [ ] Test error handling and partial success scenarios

- [ ] Task 9: Add integration tests for end-to-end flow (AC: All)
  - [ ] Test complete initialization flow with test database
  - [ ] Verify meetings, races, entrants tables populated correctly
  - [ ] Verify start_time field populated for all races
  - [ ] Verify scheduler can query and schedule races after initialization
  - [ ] Measure initialization execution time (should complete in <10 minutes)
  - [ ] Test with various racing day sizes (small, medium, large card)

- [ ] Task 10: Optional evening backfill job implementation (AC: 12)
  - [ ] Create optional evening job to run at 9:00 PM NZST
  - [ ] Fetch comprehensive historical data for completed races
  - [ ] Backfill money_flow_history and odds_history for day's races
  - [ ] Log backfill statistics (races backfilled, records inserted)
  - [ ] Make job configurable (enabled/disabled via environment variable)

## Dev Notes

### Architecture Integration

**Daily Initialization Module (`initialization/daily-baseline.ts`)**
- Runs as scheduled task at 6:00 AM NZST before real-time scheduler starts
- Fetches meetings → races → entrants in sequence
- Populates baseline data using bulk UPSERT operations
- Critical dependency for Story 2.10 (Dynamic Scheduler)

**Key Functions:**
- `runDailyInitialization(): Promise<InitializationResult>` - Main entry point
- `fetchMeetingsForToday(): Promise<Meeting[]>` - Fetch NZ/AU meetings for current NZ day
- `fetchRacesForMeetings(meetings: Meeting[]): Promise<Race[]>` - Fetch race details with start times
- `populateBaselineData(meetings, races, entrants): Promise<void>` - Bulk UPSERT to database
- `logCompletionStatistics(stats: InitStats): void` - Structured logging of results

**Integration Points:**
- Reuses NZ TAB API client from Story 2.1 (with retry logic)
- Reuses bulk UPSERT functions from Story 2.5 (meetings, races, entrants)
- Provides race schedule data for Story 2.10 (Dynamic Scheduler)
- Uses Pino logger from Epic 1.7 for structured logging
- Coordinates with scheduler activation timing

### NZ Timezone Field Usage

**Critical Design Decision:**
The NZ TAB API provides timezone-specific fields that eliminate UTC conversion complexity:

**race_date_nz (YYYY-MM-DD in NZST/NZDT):**
- Used for identifying NZ racing day boundary
- Aligns with partition strategy (partitions by NZ day, not UTC day)
- Example: "2025-10-14" represents Oct 14 in NZ timezone

**start_time_nz (HH:MM:SS NZST format):**
- Local NZ time for race start
- No UTC conversion needed
- Stored directly in database for scheduler queries
- Example: "12:50:00 NZST" for a race starting at 12:50 PM NZ time

**Benefits:**
- Eliminates timezone conversion bugs
- Aligns with business logic (NZ racing day)
- Matches partition strategy (daily partitions by NZ date)
- Simplifies scheduler time-to-start calculations

**Reference:**
- [NZ TAB API Documentation](../api/README.md) - Timezone field details
- [API Sample Response](../api/nztab-samples/race-event-full-response.json:32-33) - race_date_nz and start_time_nz fields

### Performance Requirements

**Initialization Timing:**
- Start: 6:00 AM NZST (scheduled task)
- Completion target: Before 7:00 AM NZST (scheduler activation)
- Max duration: 60 minutes (allows for large racing days with 50+ meetings)

**API Request Volume:**
- Meetings fetch: 1 request (all meetings for day)
- Race details: 1 request per meeting (typically 10-30 meetings)
- Estimated total: 15-35 API requests for typical racing day
- Rate limiting: 500ms delay between race detail requests

**Database Write Performance:**
- Bulk UPSERT meetings: <100ms (typically 10-30 meetings)
- Bulk UPSERT races: <300ms (typically 100-300 races)
- Bulk UPSERT entrants: <500ms (typically 1000-3000 entrants)
- Total write time: <1 second for typical racing day

### Scheduler Dependency

**Critical Integration:**
The dynamic scheduler (Story 2.10) depends on this initialization:

**Without Daily Initialization:**
- Scheduler has no races to schedule (empty races table)
- Cannot calculate time-to-start (no start_time values)
- Cannot determine polling intervals
- Real-time polling cannot begin

**With Daily Initialization:**
- Races table populated with start_time values at 6:00 AM
- Scheduler queries: `SELECT * FROM races WHERE start_time >= NOW()`
- Scheduler calculates time-to-start for each race
- Scheduler applies correct polling intervals (15s, 30s, 60s)
- Real-time polling begins at 7:00 AM

**Query Pattern:**
```typescript
// Scheduler query (Story 2.10) depends on start_time from initialization
const upcomingRaces = await pool.query(`
  SELECT race_id, start_time, status
  FROM races
  WHERE status IN ('open', 'upcoming')
    AND start_time > NOW()
  AND start_time < NOW() + INTERVAL '24 hours'
  ORDER BY start_time ASC
`);
```

### Error Handling Strategy

**Graceful Degradation:**
- API failures for individual meetings/races don't block entire initialization
- Partial success is acceptable (e.g., 25 of 30 meetings populated)
- Failed meetings logged for manual investigation
- Scheduler can work with partial data (polls available races)

**Retry Logic:**
- Transient failures (network errors, 5xx responses) retried up to 3 times
- Exponential backoff: 100ms, 200ms, 400ms
- Permanent failures (4xx errors) not retried
- All attempts logged for debugging

**Monitoring and Alerts:**
- Log completion statistics (success rate, failures, duration)
- Warning if initialization takes >30 minutes
- Error if initialization fails completely (no races populated)
- Alert if success rate <90% (indicates API or system issues)

### Structured Logging Examples

**Initialization Started:**
```json
{
  "level": "info",
  "msg": "Daily baseline initialization started",
  "nz_date": "2025-10-14",
  "nz_time": "06:00:00 NZST",
  "utc_time": "2025-10-13T18:00:00Z"
}
```

**Meetings Fetched:**
```json
{
  "level": "info",
  "msg": "Meetings fetched from NZ TAB API",
  "total_meetings": 28,
  "nz_meetings": 15,
  "au_meetings": 13,
  "fetch_duration_ms": 450
}
```

**Initialization Completed:**
```json
{
  "level": "info",
  "msg": "Daily baseline initialization completed",
  "meetings_fetched": 28,
  "meetings_written": 28,
  "races_created": 245,
  "entrants_populated": 2156,
  "execution_duration_seconds": 180,
  "success_rate": "100%",
  "nz_time": "06:03:00 NZST"
}
```

**Partial Failure:**
```json
{
  "level": "warn",
  "msg": "Daily baseline initialization completed with errors",
  "meetings_fetched": 28,
  "meetings_failed": 3,
  "races_created": 210,
  "execution_duration_seconds": 240,
  "success_rate": "89%",
  "failed_meetings": ["Ellerslie", "Ashburton", "Addington"]
}
```

### Project Structure Notes

**New Files:**
- `server/src/initialization/daily-baseline.ts` - Main initialization implementation
- `server/src/initialization/types.ts` - Initialization-specific types
- `server/src/initialization/scheduler.ts` - Cron job/scheduled task setup
- `server/tests/unit/initialization/daily-baseline.test.ts` - Unit tests
- `server/tests/integration/initialization/daily-baseline.integration.test.ts` - Integration tests

**Modified Files:**
- `server/src/index.ts` - Register daily initialization scheduled task
- `server/src/clients/nztab.ts` - May need to add meetings list endpoint
- `server/src/scheduler/index.ts` - Ensure scheduler waits for initialization

**Dependencies:**
- Existing NZ TAB API client from Story 2.1
- Existing bulk UPSERT functions from Story 2.5
- Existing database pool from Epic 1.8
- Existing Pino logger from Epic 1.7
- Node.js `node-cron` or similar for scheduling

### Testing Strategy

**Unit Tests:**
- Test meetings fetch with mocked API responses
- Test race details fetch with various scenarios (success, partial failure, total failure)
- Test retry logic with simulated failures
- Test database population with mocked UPSERT functions
- Test race_date_nz field extraction and usage
- Test completion statistics calculation and logging

**Integration Tests:**
- Test complete initialization flow with test database
- Seed test database, run initialization, verify data populated
- Test scheduler can query and schedule races after initialization
- Test with small racing day (5 meetings, 50 races)
- Test with large racing day (30 meetings, 300 races)
- Measure execution time and verify <10 minute target

**Manual Testing:**
- Run initialization in development at 6:00 AM NZST
- Observe logs for meetings fetched, races created, entrants populated
- Verify races table has start_time values
- Verify scheduler begins polling at 7:00 AM NZST
- Test retry logic by temporarily disabling API access

### References

- **Epic Breakdown:** Story 2.9 requirements → [epic-stories-2025-10-05.md](../epic-stories-2025-10-05.md#L396-L423)
- **Tech Spec Epic 2:** Daily initialization requirements → [tech-spec-epic-2.md](../tech-spec-epic-2.md)
- **PRD:** Daily baseline data requirements → [PRD-raceday-postgresql-2025-10-05.md](../PRD-raceday-postgresql-2025-10-05.md) (FR005.1, FR005.2, FR015)
- **NZ TAB API:** Timezone fields documentation → [docs/api/README.md](../api/README.md)
- **API Sample:** race_date_nz and start_time_nz fields → [docs/api/nztab-samples/race-event-full-response.json](../api/nztab-samples/race-event-full-response.json)
- **Solution Architecture:** Daily initialization patterns → [solution-architecture.md](../solution-architecture.md)
- **server-old Reference:** Legacy daily functions → `server-old/daily-meetings`, `server-old/daily-races`, `server-old/daily-initial-data`

## Dev Agent Record

### Context Reference

- docs/stories/story-context-2.9.xml

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date       | Change                                 | Author                   |
| ---------- | -------------------------------------- | ------------------------ |
| 2025-10-14 | Story drafted by create-story workflow | Bob (Scrum Master agent) |
