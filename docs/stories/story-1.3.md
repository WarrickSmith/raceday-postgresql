# Story 1.3: Time-Series Tables with Partitioning

Status: Ready

## Story

As a developer,
I want partitioned time-series tables for money_flow_history and odds_history,
so that I can efficiently store and query high-volume historical data.

## Acceptance Criteria

1. money_flow_history table created with PARTITION BY RANGE (event_timestamp)
2. odds_history table created with PARTITION BY RANGE (event_timestamp)
3. Initial daily partition created for current date
4. Partition naming convention: {table_name}_YYYY_MM_DD
5. Foreign key relationships to entrants table maintained
6. Indexes created on (entrant_id, event_timestamp DESC)
7. Zero TypeScript errors on build
8. Zero ESLint errors/warnings
9. No `any` types in codebase
10. All code follows ES6+ functional programming standards

## Tasks / Subtasks

- [ ] Create partitioned table migration script (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Create `server/database/migrations/003_partitioned_tables.sql`
  - [ ] Create money_flow_history parent table with PARTITION BY RANGE (event_timestamp)
  - [ ] Create odds_history parent table with PARTITION BY RANGE (event_timestamp)
  - [ ] Define all columns per tech spec (id BIGSERIAL, entrant_id, race_id, event_timestamp, etc.)
  - [ ] Create initial partition for current date (money_flow_history_YYYY_MM_DD)
  - [ ] Create initial partition for current date (odds_history_YYYY_MM_DD)
  - [ ] Add foreign key constraint: entrant_id REFERENCES entrants(entrant_id)
  - [ ] Create indexes on (entrant_id, event_timestamp DESC) for both tables
  - [ ] Verify partition naming follows {table_name}_YYYY_MM_DD convention

- [ ] Create partition management utility in TypeScript (AC: 7, 8, 9, 10)
  - [ ] Create `server/src/database/partitions.ts` (ES6 modules, functional)
  - [ ] Implement createTomorrowPartitions() function
  - [ ] Implement getPartitionName(tableName: string, date: Date) helper
  - [ ] Use pg.Pool for connection (typed, no `any`)
  - [ ] Add error handling for partition already exists (idempotent)
  - [ ] Log partition creation with structured logging (Pino)
  - [ ] Verify TypeScript compilation with `npm run build`
  - [ ] Verify ESLint passes with `npm run lint`

- [ ] Create integration tests for partitioned tables (AC: 7, 8, 9, 10)
  - [ ] Create `server/tests/integration/partitioned-tables.test.ts`
  - [ ] Test table existence (money_flow_history, odds_history)
  - [ ] Test partition existence (current date partitions)
  - [ ] Test data insertion to correct partition (based on event_timestamp)
  - [ ] Test foreign key constraint to entrants table
  - [ ] Test index usage via EXPLAIN ANALYZE (partition pruning)
  - [ ] Test partition naming convention (YYYY_MM_DD format)
  - [ ] Verify all tests pass with `npm test`
  - [ ] Verify zero TypeScript/ESLint errors in test files

- [ ] Test partition management utility (AC: 7, 8, 9, 10)
  - [ ] Create `server/tests/unit/partitions.test.ts`
  - [ ] Test getPartitionName() with various dates
  - [ ] Test createTomorrowPartitions() creates correct partitions
  - [ ] Test idempotent partition creation (already exists scenario)
  - [ ] Verify all tests pass with `npm test`

- [ ] Execute migration and validate (AC: 1-6)
  - [ ] Run migration utility: `npm run migrate`
  - [ ] Verify partitioned tables created in raceday database
  - [ ] Verify initial partitions exist with correct naming
  - [ ] Verify indexes created via `\d+ money_flow_history` in psql
  - [ ] Run integration tests to confirm schema matches tech spec
  - [ ] Document migration execution in completion notes

- [ ] Quality gate validation (AC: 7, 8, 9, 10)
  - [ ] Run `npm run build` → Zero TypeScript errors
  - [ ] Run `npm run lint` → Zero ESLint errors/warnings
  - [ ] Run `grep -r ": any" server/src/` → No matches found
  - [ ] Run `npm test` → All tests passing
  - [ ] Verify ES6 imports used throughout (no `require()`)
  - [ ] Verify functional patterns (arrow functions, const/let, immutability)

## Dev Notes

### Architecture Context

- **Reference:** [tech-spec-epic-1.md](../tech-spec-epic-1.md#partitioned-time-series-tables) - Lines 169-244 (Partitioned Tables Design)
- **Reference:** [tech-spec-epic-1.md](../tech-spec-epic-1.md#partition-management) - Lines 468-524 (Partition Management Functions)
- **Reference:** [architecture-specification.md](../architecture-specification.md#time-series-tables-partitioned) - Lines 380-432 (Time-Series Schema)
- **Reference:** [CODING-STANDARDS.md](../CODING-STANDARDS.md) - ES6+ functional programming standards

### Partitioned Tables Schema

**From tech-spec-epic-1.md:**

#### money_flow_history (Partitioned)

```sql
CREATE TABLE money_flow_history (
  id BIGSERIAL,
  entrant_id TEXT NOT NULL REFERENCES entrants(entrant_id),
  race_id TEXT NOT NULL,
  hold_percentage NUMERIC(5,2),
  bet_percentage NUMERIC(5,2),
  type TEXT,
  time_to_start INTEGER,
  time_interval INTEGER,
  interval_type TEXT,
  event_timestamp TIMESTAMPTZ NOT NULL,
  polling_timestamp TIMESTAMPTZ NOT NULL,
  win_pool_amount BIGINT,
  place_pool_amount BIGINT,
  win_pool_percentage NUMERIC(5,2),
  place_pool_percentage NUMERIC(5,2),
  incremental_amount BIGINT,
  incremental_win_amount BIGINT,
  incremental_place_amount BIGINT,
  pool_type TEXT,
  is_consolidated BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (event_timestamp);

-- Initial partition
CREATE TABLE money_flow_history_2025_10_06
  PARTITION OF money_flow_history
  FOR VALUES FROM ('2025-10-06') TO ('2025-10-07');

-- Index
CREATE INDEX idx_money_flow_entrant_time
  ON money_flow_history(entrant_id, event_timestamp DESC);
```

#### odds_history (Partitioned)

```sql
CREATE TABLE odds_history (
  id BIGSERIAL,
  entrant_id TEXT NOT NULL REFERENCES entrants(entrant_id),
  odds NUMERIC(10,2),
  type TEXT,
  event_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (event_timestamp);

-- Initial partition
CREATE TABLE odds_history_2025_10_06
  PARTITION OF odds_history
  FOR VALUES FROM ('2025-10-06') TO ('2025-10-07');

-- Index
CREATE INDEX idx_odds_entrant_time
  ON odds_history(entrant_id, event_timestamp DESC);
```

### Partition Management Strategy

**Partition Key:** event_timestamp (when the event occurred)
**Partition Size:** Daily (one partition per day)
**Retention:** 30 days (older partitions detached and archived - Epic 4)
**Naming Convention:** {table_name}_YYYY_MM_DD

**Why Partitioning:**
- Query performance: Partition pruning limits scans to relevant date ranges
- Data management: Easy archival of old data by detaching partitions
- Write performance: Reduced index maintenance per partition
- Scalability: Supports high-volume time-series inserts

### Partition Pruning Example

```sql
-- Query scans only relevant partition (not all data)
SELECT * FROM money_flow_history
WHERE entrant_id = 'ENT-123'
  AND event_timestamp > NOW() - INTERVAL '7 days';

-- EXPLAIN shows partition pruning:
-- Seq Scan on money_flow_history_2025_10_06
-- Seq Scan on money_flow_history_2025_10_05
-- ... (only last 7 days of partitions scanned)
```

### Lessons Learned from Previous Stories

**Apply to Story 1.3:**

1. **From Story 1.1:**
   - Use explicit `.js` extensions in ES module imports (Node.js 22 requirement)
   - Match Vitest coverage version precisely (@vitest/coverage-v8@2.1.9)
   - Test SQL case-sensitivity (column names, table names)

2. **From Story 1.2:**
   - ESLint catches type errors early - run `npm run lint` frequently
   - Pre-commit hooks prevent committing code with errors
   - All TypeScript utilities must be strictly typed (no `any`)
   - Use transactions in integration tests for cleanup
   - Use pg-format for SQL identifier escaping if dynamic SQL needed
   - Add Pool error event listeners to prevent unhandled rejections
   - Race status values are: 'open', 'closed', 'interim', 'final', 'abandoned'

**New for Story 1.3:**

1. Partition parent tables cannot have PRIMARY KEY on id (limitation of range partitioning)
2. Indexes on partitioned tables automatically cascade to all child partitions
3. Foreign keys work across partitions (entrant_id → entrants)
4. Initial partition must cover current date to accept inserts immediately
5. Partition naming must follow strict convention for automated management (Epic 4)

### Project Structure Alignment

**Migration Files:**
- `server/database/migrations/003_partitioned_tables.sql` - Partition table creation
- All migrations run in numbered order (000 → 001 → 002 → 003)
- Idempotent SQL (CREATE IF NOT EXISTS, CREATE OR REPLACE)

**TypeScript Utilities:**
- `server/src/database/partitions.ts` - Partition management functions
- Follow ES6 module structure with `.js` import extensions
- Export pure functions (no classes for business logic)
- Use typed pg.Pool (imported from `./pool.js`)

**Testing:**
- `server/tests/integration/partitioned-tables.test.ts` - Schema validation tests
- `server/tests/unit/partitions.test.ts` - Partition utility unit tests
- Use ROLLBACK for test isolation in integration tests

### References

- [Source: epic-stories-2025-10-05.md#Story 1.3] - Lines 70-82 (Acceptance criteria)
- [Source: tech-spec-epic-1.md#Partitioned Time-Series Tables] - Lines 169-244 (Complete schema)
- [Source: tech-spec-epic-1.md#Partition Management] - Lines 468-524 (Automated partition creation)
- [Source: architecture-specification.md#Time-Series Tables] - Lines 380-432 (Architecture context)

## Dev Agent Record

### Context Reference

- [story-context-1.3.xml](../story-context-1.3.xml)

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
