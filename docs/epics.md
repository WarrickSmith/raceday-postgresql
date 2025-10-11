# Raceday PostgreSQL - Epic Index

This index mirrors the canonical planning document `docs/epic-stories-2025-10-05.md` and is maintained so automated workflows can resolve upcoming story definitions per epic. For full detail (including context, rationale, and downstream stories) see the primary epic breakdown document.

## Epic 2: High-Performance Data Pipeline

### Story 2.4: Money Flow Calculation Transform Logic

**As a** developer  
**I want** money flow calculation logic extracted from server-old and implemented in worker  
**So that** I can transform raw NZ TAB data into calculated money flow patterns

**Acceptance Criteria:**

1. Transform logic extracted from ./server-old codebase
2. Money flow calculations implemented per-race, per-entrant, over time
3. Calculations include: hold_percentage, bet_percentage, win_pool_percentage, place_pool_percentage
4. Calculations include: incremental amounts (change from previous poll)
5. Calculations include: time_to_start, time_interval, interval_type
6. Transform accepts raw NZ TAB data, returns structured money flow data
7. Transform logic validated against server-old outputs (test cases)
8. No `any` types in transform logic

### Story 2.5: Bulk UPSERT Database Operations

**As a** developer  
**I want** bulk UPSERT operations using multi-row INSERT with ON CONFLICT  
**So that** I can write entire race data in single transaction (<300ms)

**Acceptance Criteria:**

1. `bulkUpsertMeetings(meetings: Meeting[])` function implemented
2. `bulkUpsertRaces(races: Race[])` function implemented
3. `bulkUpsertEntrants(entrants: Entrant[])` function implemented
4. Multi-row INSERT with `ON CONFLICT (primary_key) DO UPDATE`
5. Conditional `WHERE` clause prevents unnecessary writes when data unchanged
6. Single transaction per race (`BEGIN / COMMIT`)
7. Error handling with rollback on failure
8. Performance logging (duration per operation)
9. Target: `<300ms` per race write operation

### Story 2.6: Time-Series Data Insert Operations

**As a** developer  
**I want** efficient INSERT operations for time-series tables (money_flow_history, odds_history)  
**So that** I can store historical data without UPSERT overhead

**Acceptance Criteria:**

1. `insertMoneyFlowHistory(records: MoneyFlowRecord[])` function implemented
2. `insertOddsHistory(records: OddsRecord[])` function implemented
3. Multi-row INSERT (no `ON CONFLICT` - always append)
4. Batch size optimization (test 100, 500, 1000 rows per batch)
5. Automatic partition detection (insert into correct partition based on event_timestamp)
6. Single transaction per batch
7. Error handling with rollback
8. Performance logging (rows inserted, duration)

---

_For additional epics, see `docs/epic-stories-2025-10-05.md`._
