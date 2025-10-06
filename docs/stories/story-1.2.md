# Story 1.2: Core Database Schema Migration

Status: Draft

## Story

As a developer,
I want core database tables (meetings, races, entrants, race_pools) created via migration scripts,
so that I can store normalized race data with proper constraints and relationships.

## Acceptance Criteria

1. Core tables created: meetings, races, entrants, race_pools
2. Primary keys defined for all tables
3. Foreign key relationships enforced (races → meetings, entrants → races)
4. Status fields use CHECK constraints (race_type IN ('thoroughbred', 'harness'))
5. All timestamp fields use TIMESTAMPTZ
6. created_at and updated_at fields auto-populate via triggers
7. ESLint fully configured and passing on all TypeScript server code
8. Zero TypeScript errors or warnings on build
9. No `any` types in codebase
10. All code follows ES6+ functional programming standards

## Tasks / Subtasks

- [ ] Configure ESLint for TypeScript server code (AC: 7, 8, 9, 10)
  - [ ] Install ESLint packages (@typescript-eslint/eslint-plugin, @typescript-eslint/parser, eslint-config-airbnb-typescript)
  - [ ] Create .eslintrc.json with strict-type-checked config (no-explicit-any: error)
  - [ ] Add lint scripts to package.json (lint, lint:fix, format, format:check)
  - [ ] Configure Prettier integration (.prettierrc.json)
  - [ ] Add pre-commit hook configuration (lint-staged + husky)
  - [ ] Verify `npm run lint` passes with zero errors/warnings

- [ ] Create database migration utility in TypeScript (AC: 7, 8, 9, 10)
  - [ ] Create `server/src/database/migrate.ts` (ES6 modules, functional)
  - [ ] Use pg.Pool for connection (typed, no `any`)
  - [ ] Load SQL files from `server/database/migrations/` directory
  - [ ] Execute migrations in numbered order (001, 002, 003...)
  - [ ] Log migration success/failure with structured logging (prepare for Pino in 1.7)
  - [ ] Verify TypeScript compilation with `npm run build`
  - [ ] Verify ESLint passes with `npm run lint`

- [ ] Create SQL migration scripts (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Create `server/database/migrations/001_initial_schema.sql` (meetings, races, entrants, race_pools)
  - [ ] Define primary keys (meeting_id TEXT, race_id TEXT, entrant_id TEXT, race_id for pools)
  - [ ] Add foreign keys with CASCADE delete (races → meetings, entrants → races)
  - [ ] Add CHECK constraints (race_type IN ('thoroughbred', 'harness'), status fields)
  - [ ] Use TIMESTAMPTZ for all timestamp columns (created_at, updated_at, start_time, etc.)
  - [ ] Create `server/database/migrations/002_triggers.sql` (auto-update triggers)
  - [ ] Create update_updated_at_column() PostgreSQL function
  - [ ] Apply BEFORE UPDATE triggers to all tables with updated_at field

- [ ] Create migration test suite (AC: 7, 8, 9, 10)
  - [ ] Create `server/tests/integration/database-schema.test.ts`
  - [ ] Test table existence (meetings, races, entrants, race_pools)
  - [ ] Test primary keys enforced (duplicate insert fails)
  - [ ] Test foreign keys enforced (cascading deletes work, orphan inserts fail)
  - [ ] Test CHECK constraints (invalid race_type/status rejected)
  - [ ] Test timestamp triggers (updated_at auto-updates on UPDATE)
  - [ ] Verify all tests pass with `npm test`
  - [ ] Verify zero TypeScript/ESLint errors in test files

- [ ] Execute migrations and validate (AC: 1-6)
  - [ ] Create raceday database if not exists
  - [ ] Run migration utility: `npm run migrate`
  - [ ] Verify all tables created in raceday database
  - [ ] Verify schema matches tech spec via pgAdmin visual inspection
  - [ ] Run integration tests to confirm constraints work
  - [ ] Document migration execution in story completion notes

- [ ] Quality gate validation (AC: 7, 8, 9, 10)
  - [ ] Run `npm run build` → Zero TypeScript errors
  - [ ] Run `npm run lint` → Zero ESLint errors/warnings
  - [ ] Run `grep -r ": any" server/src/` → No matches found
  - [ ] Run `npm test` → All tests passing
  - [ ] Verify ES6 imports used throughout (no `require()`)
  - [ ] Verify functional patterns (arrow functions, const/let, immutability)

## Dev Notes

### Architecture Context

- **Reference:** [tech-spec-epic-1.md](../tech-spec-epic-1.md#database-schema-design) - Lines 40-166 (Database Schema Design)
- **Reference:** [tech-spec-epic-1.md](../tech-spec-epic-1.md#migration-scripts-organization) - Lines 581-605 (Migration Scripts Organization)
- **Reference:** [CODING-STANDARDS.md](../CODING-STANDARDS.md) - ES6+ functional programming standards
- **Reference:** [typescript-eslint-config.md](../typescript-eslint-config.md) - TypeScript & ESLint configuration

### Database Schema Overview

**Core Tables (from tech spec):**

1. **meetings** - Race meeting information
   - Primary Key: meeting_id (TEXT)
   - Fields: meeting_name, country, race_type, date, status, timestamps
   - Indexes: idx_meetings_date_type (partial index on active meetings)

2. **races** - Individual race details
   - Primary Key: race_id (TEXT)
   - Foreign Key: meeting_id → meetings (CASCADE DELETE)
   - Fields: name, race_number, start_time, status, actual_start, timestamps
   - Indexes: idx_races_start_time (partial), idx_races_meeting

3. **entrants** - Race participants (horses/drivers)
   - Primary Key: entrant_id (TEXT)
   - Foreign Key: race_id → races (CASCADE DELETE)
   - Fields: name, runner_number, win_odds, place_odds, hold_percentage, is_scratched, timestamps
   - Indexes: idx_entrants_race, idx_active_entrants (partial on non-scratched)

4. **race_pools** - Pool totals per race
   - Primary Key: race_id (one-to-one with races)
   - Foreign Key: race_id → races (CASCADE DELETE)
   - Fields: win_pool_total, place_pool_total, quinella_pool_total, trifecta_pool_total, last_updated

### Migration Strategy

**Migration Files:**

```
server/database/migrations/
├── 001_initial_schema.sql    # Core tables (meetings, races, entrants, race_pools)
└── 002_triggers.sql           # Auto-update triggers (update_updated_at_column)
```

**Execution Order:**
1. Create tables (001_initial_schema.sql)
2. Create triggers (002_triggers.sql)

**Note:** Partitioned tables (money_flow_history, odds_history) and indexes will be created in Stories 1.3 and 1.4.

### ESLint Configuration Requirements

**Packages to Install:**
```json
{
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.19.1",
    "@typescript-eslint/parser": "^8.19.1",
    "eslint": "^9.17.0",
    "eslint-config-airbnb-typescript": "^18.0.0",
    "eslint-plugin-import": "^2.31.0",
    "prettier": "^3.4.2",
    "husky": "^9.1.7",
    "lint-staged": "^15.2.11"
  }
}
```

**Critical ESLint Rules (from typescript-eslint-config.md):**
- `@typescript-eslint/no-explicit-any: "error"` - Enforce no `any` types
- `@typescript-eslint/no-unsafe-*: "error"` - Prevent unsafe type operations
- `@typescript-eslint/strict-boolean-expressions: "error"` - Strict boolean checks
- `import/no-default-export: "error"` - Use named exports only
- `no-console: ["error", { "allow": ["warn", "error"] }]` - No console.log in production

**Quality Gate Commands:**
```bash
npm run build        # TypeScript compilation (zero errors)
npm run lint         # ESLint check (zero errors/warnings)
npm run format:check # Prettier validation
npm test             # Vitest test suite
```

### Migration Utility Design

**TypeScript Migration Runner (server/src/database/migrate.ts):**

```typescript
import { Pool } from 'pg';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

interface MigrationResult {
  file: string;
  success: boolean;
  error?: string;
}

export const runMigrations = async (pool: Pool): Promise<MigrationResult[]> => {
  const migrationsDir = join(process.cwd(), 'database', 'migrations');
  const files = await readdir(migrationsDir);
  const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

  const results: MigrationResult[] = [];

  for (const file of sqlFiles) {
    try {
      const sql = await readFile(join(migrationsDir, file), 'utf-8');
      await pool.query(sql);
      results.push({ file, success: true });
      console.log(`✅ Migration ${file} executed successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push({ file, success: false, error: errorMessage });
      console.error(`❌ Migration ${file} failed: ${errorMessage}`);
      throw error; // Stop on first failure
    }
  }

  return results;
};
```

**Key Design Principles:**
- Functional approach (pure functions, no side effects beyond DB writes)
- ES6 modules (import/export)
- Typed interfaces (MigrationResult)
- No `any` types
- Arrow functions
- Structured error handling

### Testing Strategy

**Integration Tests (server/tests/integration/database-schema.test.ts):**

1. **Table Existence Tests**
   ```typescript
   it('should create meetings table', async () => {
     const result = await pool.query(`
       SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'meetings'
     `);
     expect(result.rows.length).toBe(1);
   });
   ```

2. **Constraint Tests**
   ```typescript
   it('should enforce race_type CHECK constraint', async () => {
     await expect(
       pool.query(`
         INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
         VALUES ('TEST-01', 'Test', 'NZ', 'invalid_type', '2025-10-06', 'active')
       `)
     ).rejects.toThrow();
   });
   ```

3. **Trigger Tests**
   ```typescript
   it('should auto-update updated_at timestamp', async () => {
     // Insert meeting
     await pool.query(`INSERT INTO meetings (...) VALUES (...)`);

     // Wait 1 second
     await new Promise(resolve => setTimeout(resolve, 1000));

     // Update meeting
     await pool.query(`UPDATE meetings SET status = 'completed' WHERE meeting_id = 'TEST-01'`);

     // Check updated_at changed
     const result = await pool.query(`SELECT created_at, updated_at FROM meetings WHERE meeting_id = 'TEST-01'`);
     expect(result.rows[0].updated_at).not.toEqual(result.rows[0].created_at);
   });
   ```

### Project Structure Notes

**Alignment with unified project structure:**

```
server/
├── src/
│   └── database/
│       └── migrate.ts              # NEW - TypeScript migration runner
├── database/
│   └── migrations/
│       ├── 001_initial_schema.sql  # NEW - Core tables
│       └── 002_triggers.sql        # NEW - Auto-update triggers
├── tests/
│   └── integration/
│       └── database-schema.test.ts # NEW - Schema validation tests
├── .eslintrc.json                  # NEW - ESLint configuration
├── .prettierrc.json                # NEW - Prettier configuration
├── package.json                    # UPDATED - Add lint scripts, ESLint deps
└── tsconfig.json                   # EXISTING - Already configured
```

### Lessons Learned from Story 1.1

**Apply to Story 1.2:**
1. Use explicit `.js` extensions in ES module imports (Node.js 22 requirement)
2. Match Vitest coverage version precisely (@vitest/coverage-v8@2.1.9)
3. Test SQL case-sensitivity (column names, table names)
4. Document migration execution steps clearly in completion notes

**New for Story 1.2:**
1. ESLint will catch type errors and code quality issues early
2. Pre-commit hooks prevent committing code with lint/type errors
3. Migration scripts are SQL (not TypeScript) but utilities are fully typed
4. Integration tests must clean up database state (use transactions or test database)

### References

- [Source: tech-spec-epic-1.md#Database Schema Design] - Lines 40-166 (Complete schema specification)
- [Source: tech-spec-epic-1.md#Migration Scripts Organization] - Lines 581-605 (Migration strategy)
- [Source: CODING-STANDARDS.md#TypeScript Best Practices] - Lines 169-238 (Type safety, no `any`)
- [Source: typescript-eslint-config.md#ESLint Configuration] - Lines 92-223 (ESLint rules and setup)
- [Source: epic-stories-2025-10-05.md#Story 1.2] - Lines 55-68 (Acceptance criteria)

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML/JSON will be added here by context workflow -->

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date       | Version | Description                                           | Author  |
| ---------- | ------- | ----------------------------------------------------- | ------- |
| 2025-10-06 | 0.1     | Initial draft created by Scrum Master agent          | warrick |
