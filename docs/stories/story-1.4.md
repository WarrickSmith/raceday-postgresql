# Story 1.4: Database Indexes for Query Optimization

Status: Draft

## Story

As a developer,
I want indexes optimized for client query patterns,
so that API responses are fast (<100ms).

## Acceptance Criteria

1. Index on races(start_time) WHERE status IN ('open', 'closed', 'interim')
2. Index on entrants(race_id)
3. Index on entrants(race_id, is_scratched) partial index WHERE is_scratched = false
4. Index on meetings(date, race_type) WHERE status = 'active'
5. Index on money_flow_history(entrant_id, event_timestamp DESC)
6. Index on odds_history(entrant_id, event_timestamp DESC)
7. All indexes verified via EXPLAIN ANALYZE on representative queries
8. Zero TypeScript errors on build
9. Zero ESLint errors/warnings
10. No `any` types in codebase
11. All code follows ES6+ functional programming standards

## Tasks / Subtasks

- [ ] Create index migration script (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Create `server/database/migrations/004_indexes.sql`
  - [ ] Add partial index on races(start_time) for open/closed/interim races
  - [ ] Add index on entrants(race_id) for foreign key navigation
  - [ ] Add partial index on entrants(race_id) for non-scratched entrants only
  - [ ] Add partial index on meetings(date, race_type) for active meetings
  - [ ] Add descending indexes on time-series tables (money_flow_history, odds_history)
  - [ ] Use CREATE INDEX IF NOT EXISTS for idempotency

- [ ] Create query validation utility (AC: 7, 8, 9, 10, 11)
  - [ ] Create `server/src/database/query-validator.ts` (ES6 modules, functional)
  - [ ] Implement validateIndexUsage() function using EXPLAIN ANALYZE
  - [ ] Define representative queries for each index
  - [ ] Parse EXPLAIN output to confirm index scan (not seq scan)
  - [ ] Use typed pg.Pool (no `any` types)
  - [ ] Add structured logging for validation results
  - [ ] Verify TypeScript compilation with `npm run build`
  - [ ] Verify ESLint passes with `npm run lint`

- [ ] Create integration tests for indexes (AC: 7, 8, 9, 10, 11)
  - [ ] Create `server/tests/integration/indexes.test.ts`
  - [ ] Test index existence for all 6 indexes
  - [ ] Test races(start_time) index usage via EXPLAIN ANALYZE
  - [ ] Test entrants(race_id) index usage via EXPLAIN ANALYZE
  - [ ] Test partial index on active entrants via EXPLAIN ANALYZE
  - [ ] Test meetings partial index via EXPLAIN ANALYZE
  - [ ] Test partition pruning on time-series indexes
  - [ ] Verify no sequential scans on large tables
  - [ ] Verify all tests pass with `npm test`
  - [ ] Verify zero TypeScript/ESLint errors in test files

- [ ] Execute migration and validate (AC: 1-7)
  - [ ] Run migration utility: `npm run migrate`
  - [ ] Verify all indexes created in raceday database
  - [ ] Run EXPLAIN ANALYZE on representative queries
  - [ ] Verify Index Scan appears in query plans (no Seq Scan)
  - [ ] Run integration tests to confirm index usage
  - [ ] Document query plans in completion notes

- [ ] Quality gate validation (AC: 8, 9, 10, 11)
  - [ ] Run `npm run build` → Zero TypeScript errors
  - [ ] Run `npm run lint` → Zero ESLint errors/warnings
  - [ ] Run `grep -r ": any" server/src/` → No matches found
  - [ ] Run `npm test` → All tests passing
  - [ ] Verify ES6 imports used throughout (no `require()`)
  - [ ] Verify functional patterns (arrow functions, const/let, immutability)

## Dev Notes

### Architecture Context

- **Reference:** [tech-spec-epic-1.md](../tech-spec-epic-1.md#database-indexes-for-query-optimization) - Index specifications
- **Reference:** [epic-stories-2025-10-05.md](../epic-stories-2025-10-05.md#story-14) - Lines 85-98 (Acceptance criteria)
- **Reference:** [CODING-STANDARDS.md](../CODING-STANDARDS.md) - ES6+ functional programming standards

### Index Strategy

**From tech-spec-epic-1.md:**

All indexes are designed to optimize hot-path queries used by the REST API:

1. **races(start_time) Partial Index**
   - Query pattern: Get upcoming/active races within time window
   - Partial: WHERE status IN ('open', 'closed', 'interim')
   - Benefit: Excludes completed/abandoned races (reduces index size ~50%)

2. **entrants(race_id) Index**
   - Query pattern: Get all entrants for a specific race
   - Hot path: Most frequent query in API layer
   - Foreign key: Improves JOIN performance

3. **entrants(race_id, is_scratched) Partial Index**
   - Query pattern: Get active (non-scratched) entrants only
   - Partial: WHERE is_scratched = false
   - Benefit: Client typically filters scratched entries

4. **meetings(date, race_type) Partial Index**
   - Query pattern: Get active meetings for specific date/type
   - Composite: Supports filters on both columns
   - Partial: WHERE status = 'active'

5. **money_flow_history(entrant_id, event_timestamp DESC) Index**
   - Query pattern: Get latest money flow for entrant
   - DESC: Supports ORDER BY event_timestamp DESC (latest first)
   - Partition-aware: Works across all child partitions

6. **odds_history(entrant_id, event_timestamp DESC) Index**
   - Query pattern: Get latest odds trend for entrant
   - DESC: Supports ORDER BY event_timestamp DESC
   - Partition-aware: Automatic cascade to partitions

### Query Validation Strategy

**EXPLAIN ANALYZE Validation:**

Must verify that queries use Index Scan (not Seq Scan) for:

```sql
-- Query 1: Upcoming races
EXPLAIN ANALYZE
SELECT * FROM races
WHERE start_time > NOW()
  AND status IN ('open', 'interim')
ORDER BY start_time;

-- Expected: Index Scan using races_start_time_partial_idx
-- NOT: Seq Scan on races
```

```sql
-- Query 2: Race entrants (active only)
EXPLAIN ANALYZE
SELECT * FROM entrants
WHERE race_id = 'NZ-AUK-20251006-R1'
  AND is_scratched = false;

-- Expected: Index Scan using entrants_race_id_active_idx
-- OR: Bitmap Index Scan (acceptable for small result sets)
```

```sql
-- Query 3: Latest money flow for entrant
EXPLAIN ANALYZE
SELECT * FROM money_flow_history
WHERE entrant_id = 'ENT-123'
  AND event_timestamp > NOW() - INTERVAL '1 hour'
ORDER BY event_timestamp DESC
LIMIT 50;

-- Expected: Index Scan using idx_money_flow_entrant_time
-- Must show partition pruning (only recent partitions scanned)
```

### Lessons Learned from Previous Stories

**Apply to Story 1.4:**

1. **From Story 1.1:**
   - Use explicit `.js` extensions in ES module imports
   - Test SQL case-sensitivity (index names, column names)

2. **From Story 1.2:**
   - Run `npm run lint` frequently during development
   - Use pg-format for dynamic SQL if needed (index names)
   - Add proper error handling with typed errors

3. **From Story 1.3:**
   - Indexes on partitioned tables cascade to all child partitions automatically
   - Partial indexes significantly reduce index size
   - EXPLAIN ANALYZE must show partition pruning for time-series queries

**New for Story 1.4:**

1. Partial indexes require WHERE clause in CREATE INDEX statement
2. DESC in index definition enables reverse-order scans without re-sorting
3. Composite indexes (multi-column) must match query WHERE clause column order
4. EXPLAIN ANALYZE shows different scan types: Index Scan, Bitmap Index Scan, Seq Scan
5. Query planner may choose Seq Scan for very small tables (acceptable)

### Project Structure Alignment

**Migration Files:**
- `server/database/migrations/004_indexes.sql` - All index creation
- All migrations run in numbered order (000 → 001 → 002 → 003 → 004)
- Idempotent SQL (CREATE INDEX IF NOT EXISTS)

**TypeScript Utilities:**
- `server/src/database/query-validator.ts` - EXPLAIN ANALYZE validation
- Follow ES6 module structure with `.js` import extensions
- Export pure functions for query validation
- Use typed pg.Pool (imported from `./pool.js`)

**Testing:**
- `server/tests/integration/indexes.test.ts` - Index validation tests
- Use EXPLAIN ANALYZE to verify index usage
- Test both index existence and actual usage by queries
- Use ROLLBACK for test isolation

### Performance Targets

**From epic-stories-2025-10-05.md:**
- API response times: <100ms (p95)
- All queries must use indexes (no Seq Scan on large tables)
- Partial indexes reduce index size and maintenance overhead

### References

- [Source: epic-stories-2025-10-05.md#Story 1.4] - Lines 85-98 (Acceptance criteria)
- [Source: tech-spec-epic-1.md#Database Schema Design] - Index specifications
- [Source: architecture-specification.md#Database Design] - Query patterns

## Dev Agent Record

### Context Reference

- [story-context-1.4.xml](../story-context-1.4.xml)

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

### Completion Notes List

### File List
