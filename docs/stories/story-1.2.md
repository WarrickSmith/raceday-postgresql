# Story 1.2: Core Database Schema Migration

Status: Done

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

- [x] Configure ESLint for TypeScript server code (AC: 7, 8, 9, 10)

  - [x] Install ESLint packages (typescript-eslint, eslint-plugin-import, husky, lint-staged)
  - [x] Create eslint.config.js with strict-type-checked config (no-explicit-any: error)
  - [x] Add lint scripts to package.json (lint, lint:fix, format, format:check)
  - [x] Configure Prettier integration (.prettierrc.json)
  - [x] Add pre-commit hook configuration (lint-staged + husky)
  - [x] Verify `npm run lint` passes with zero errors/warnings

- [x] Create database migration utility in TypeScript (AC: 7, 8, 9, 10)

  - [x] Create `server/src/database/migrate.ts` (ES6 modules, functional)
  - [x] Use pg.Pool for connection (typed, no `any`)
  - [x] Load SQL files from `server/database/migrations/` directory
  - [x] Execute migrations in numbered order (000, 001, 002...)
  - [x] Log migration success/failure with console.warn/error
  - [x] Verify TypeScript compilation with `npm run build`
  - [x] Verify ESLint passes with `npm run lint`

- [x] Create SQL migration scripts (AC: 1, 2, 3, 4, 5, 6)

  - [x] Create `server/database/migrations/000_extensions.sql` (pgAgent extension)
  - [x] Create `server/database/migrations/001_initial_schema.sql` (meetings, races, entrants, race_pools)
  - [x] Define primary keys (meeting_id TEXT, race_id TEXT, entrant_id TEXT, race_id for pools)
  - [x] Add foreign keys with CASCADE delete (races → meetings, entrants → races)
  - [x] Add CHECK constraints (race_type IN ('thoroughbred', 'harness'), status fields)
  - [x] Use TIMESTAMPTZ for all timestamp columns (created_at, updated_at, start_time, etc.)
  - [x] Create `server/database/migrations/002_triggers.sql` (auto-update triggers)
  - [x] Create update_updated_at_column() PostgreSQL function
  - [x] Apply BEFORE UPDATE triggers to all tables with updated_at field

- [x] Create migration test suite (AC: 7, 8, 9, 10)

  - [x] Create `server/tests/integration/database-schema.test.ts`
  - [x] Test table existence (meetings, races, entrants, race_pools)
  - [x] Test primary keys enforced (duplicate insert fails)
  - [x] Test foreign keys enforced (cascading deletes work, orphan inserts fail)
  - [x] Test CHECK constraints (invalid race_type/status rejected)
  - [x] Test timestamp triggers (updated_at auto-updates on UPDATE)
  - [x] Verify all tests pass with `npm test`
  - [x] Verify zero TypeScript/ESLint errors in test files

- [x] Execute migrations and validate (AC: 1-6)

  - [x] Create raceday database if not exists (automated in migration script)
  - [x] Run migration utility: `npm run migrate`
  - [x] Verify all tables created in raceday database
  - [x] Verify schema matches tech spec via tests
  - [x] Run integration tests to confirm constraints work
  - [x] Document migration execution in story completion notes

- [x] Quality gate validation (AC: 7, 8, 9, 10)
  - [x] Run `npm run build` → Zero TypeScript errors
  - [x] Run `npm run lint` → Zero ESLint errors/warnings
  - [x] Run `grep -r ": any" server/src/` → No matches found
  - [x] Run `npm test` → All tests passing (25 tests)
  - [x] Verify ES6 imports used throughout (no `require()`)
  - [x] Verify functional patterns (arrow functions, const/let, immutability)

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
import { Pool } from 'pg'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

interface MigrationResult {
  file: string
  success: boolean
  error?: string
}

export const runMigrations = async (pool: Pool): Promise<MigrationResult[]> => {
  const migrationsDir = join(process.cwd(), 'database', 'migrations')
  const files = await readdir(migrationsDir)
  const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort()

  const results: MigrationResult[] = []

  for (const file of sqlFiles) {
    try {
      const sql = await readFile(join(migrationsDir, file), 'utf-8')
      await pool.query(sql)
      results.push({ file, success: true })
      console.log(`✅ Migration ${file} executed successfully`)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      results.push({ file, success: false, error: errorMessage })
      console.error(`❌ Migration ${file} failed: ${errorMessage}`)
      throw error // Stop on first failure
    }
  }

  return results
}
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
     `)
     expect(result.rows.length).toBe(1)
   })
   ```

2. **Constraint Tests**

   ```typescript
   it('should enforce race_type CHECK constraint', async () => {
     await expect(
       pool.query(`
         INSERT INTO meetings (meeting_id, meeting_name, country, race_type, date, status)
         VALUES ('TEST-01', 'Test', 'NZ', 'invalid_type', '2025-10-06', 'active')
       `)
     ).rejects.toThrow()
   })
   ```

3. **Trigger Tests**

   ```typescript
   it('should auto-update updated_at timestamp', async () => {
     // Insert meeting
     await pool.query(`INSERT INTO meetings (...) VALUES (...)`)

     // Wait 1 second
     await new Promise((resolve) => setTimeout(resolve, 1000))

     // Update meeting
     await pool.query(
       `UPDATE meetings SET status = 'completed' WHERE meeting_id = 'TEST-01'`
     )

     // Check updated_at changed
     const result = await pool.query(
       `SELECT created_at, updated_at FROM meetings WHERE meeting_id = 'TEST-01'`
     )
     expect(result.rows[0].updated_at).not.toEqual(result.rows[0].created_at)
   })
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

- [story-context-1.2.xml](../story-context-1.2.xml)

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

N/A - No blocking issues encountered

### Completion Notes List

1. **ESLint Configuration**: Configured using ESLint v9 flat config format (eslint.config.js) with typescript-eslint strict-type-checked preset. Airbnb config not used due to version incompatibility with ESLint v9.

2. **Database URL Construction**: Implemented buildDatabaseUrl() helper function to construct DATABASE_URL from individual DB_* environment variables, eliminating duplication and ensuring single source of truth.

3. **Greenfield Database Setup**: Migration script (run-migrations.ts) automatically creates 'raceday' database if it doesn't exist, enabling true greenfield deployment.

4. **pgAgent Extension**: Added 000_extensions.sql migration to enable pgAgent extension in raceday database (extension installed at server level in Story 1.1).

5. **Idempotent Migrations**: All SQL migrations use CREATE IF NOT EXISTS, CREATE OR REPLACE, and DROP IF EXISTS to support re-running migrations safely.

6. **Test Conversion**: Converted existing Story 1.1 JavaScript tests to TypeScript with strict typing (no `any` types).

7. **Quality Gates**: All acceptance criteria met - zero TypeScript errors, zero ESLint errors, no `any` types, all tests passing (25/25), ES6 modules throughout.

8. **Security Fix - SQL Injection**: Added pg-format library to safely escape database identifier in CREATE DATABASE statement, preventing SQL injection vulnerability (review action item #1).

9. **Pool Error Handling**: Added error event listeners to both adminPool and migration pool instances to prevent unhandled promise rejections (review action item #2).

10. **Race Pools Trigger**: Created update_last_updated_column() function and trigger for race_pools table to maintain consistent timestamp behavior (review action item #3).

11. **CLI Refactoring**: Extracted process.exit from executeMigrations() function to new cli.ts wrapper, improving modularity and testability (review action item #4).

12. **Race Status Correction**: Updated race status CHECK constraint to use correct values: 'open', 'closed', 'interim', 'final', 'abandoned' across schema, tech spec, and tests (review action item #5).

13. **ESLint Configuration**: Refined ignore patterns to 'dist/**', '*.js' for more precise linting coverage (review action item #6).

14. **Test Coverage**: Added race_pools trigger test verifying last_updated auto-updates on UPDATE. Final test count: 26/26 passing (review action item #7).

### File List

**Created:**
- server/eslint.config.js
- server/.prettierrc.json
- server/.lintstagedrc.json
- server/src/database/migrate.ts
- server/src/database/run-migrations.ts
- server/src/database/cli.ts (NEW - CLI wrapper for migrations)
- server/database/migrations/000_extensions.sql
- server/database/migrations/001_initial_schema.sql
- server/database/migrations/002_triggers.sql
- server/tests/integration/database-schema.test.ts
- .husky/pre-commit

**Modified:**
- server/package.json (added pg-format dependency, updated migrate script to use cli.ts)
- server/.env (added DB_* parameters, removed DATABASE_URL)
- server/.env.example (added DB_* parameters, removed DATABASE_URL)
- server/tests/integration/database-connection.test.ts (converted to TypeScript, added buildDatabaseUrl)
- server/tests/unit/environment-config.test.ts (converted to TypeScript, updated tests for DB_* params)
- server/database/migrations/001_initial_schema.sql (updated race status values to 'open', 'closed', 'interim', 'final', 'abandoned')
- server/database/migrations/002_triggers.sql (added race_pools trigger and update_last_updated_column function)
- server/src/database/run-migrations.ts (added pg-format import, SQL injection fix, Pool error handlers, exported executeMigrations)
- server/eslint.config.js (refined ignore patterns)
- server/tests/integration/database-schema.test.ts (added race_pools trigger test, updated race status values in existing tests)
- docs/tech-spec-epic-1.md (corrected race status values in index example)
- docs/backlog.md (marked all 7 review action items as Resolved)

## Change Log

| Date       | Version | Description                                         | Author  |
| ---------- | ------- | --------------------------------------------------- | ------- |
| 2025-10-06 | 0.1     | Initial draft created by Scrum Master agent         | warrick |
| 2025-10-06 | 1.0     | Story completed - all ACs met, tests passing (25/25) | Claude  |
| 2025-10-06 | 1.1     | Senior Developer Review notes appended              | warrick |
| 2025-10-06 | 1.2     | All 7 review action items resolved, tests passing (26/26), status: Approved | Claude  |

---

## Senior Developer Review (AI)

**Reviewer:** warrick
**Date:** 2025-10-06
**Outcome:** Changes Requested

### Summary

Story 1.2 successfully implements core database schema migration with comprehensive ESLint configuration, TypeScript strict typing, and extensive test coverage. The implementation demonstrates strong adherence to modern ES6+ standards and functional programming principles. However, a **critical SQL injection vulnerability** in the database creation logic requires immediate remediation before this story can be approved.

The migration system, schema design, and testing infrastructure are well-architected and align with PostgreSQL 18 best practices. The ESLint configuration properly enforces strict type checking using typescript-eslint 8.x with `strictTypeChecked` and `stylisticTypeChecked` presets.

### Key Findings

#### High Severity Issues

1. **[HIGH] SQL Injection Vulnerability in Database Creation** ([run-migrations.ts:31](../server/src/database/run-migrations.ts#L31))
   - **Issue:** Database name is directly interpolated into SQL query without sanitization
   - **Code:** `` await adminPool.query(`CREATE DATABASE ${dbName}`) ``
   - **Risk:** If `DB_NAME` environment variable is compromised (e.g., `raceday; DROP DATABASE postgres;--`), attacker could execute arbitrary SQL commands
   - **Remediation:** PostgreSQL does not support parameterized identifiers in `CREATE DATABASE`. Use identifier escaping with `pg-format` library or strict validation:
     ```typescript
     import format from 'pg-format'
     await adminPool.query(format('CREATE DATABASE %I', dbName))
     ```
     OR implement strict validation:
     ```typescript
     const validateDbName = (name: string): string => {
       if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
         throw new Error('Invalid database name format')
       }
       return name
     }
     const safeName = validateDbName(dbName)
     ```
   - **References:**
     - PostgreSQL identifiers: https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS
     - Node.js pg injection risks: https://node-postgres.com/features/queries#query-text

2. **[HIGH] Missing Connection Pool Error Handling** ([migrate.ts](../server/src/database/migrate.ts), [run-migrations.ts](../server/src/database/run-migrations.ts))
   - **Issue:** No error event listener on Pool instances
   - **Risk:** Uncaught backend errors or network partitions cause unhandled promise rejections
   - **Remediation:** Add error handlers immediately after pool creation:
     ```typescript
     pool.on('error', (err) => {
       console.error('Unexpected database error:', err)
       process.exit(1)
     })
     ```
   - **References:** https://node-postgres.com/features/pooling#error-handling

#### Medium Severity Issues

3. **[MED] Race Pool Trigger Missing** ([002_triggers.sql](../server/database/migrations/002_triggers.sql))
   - **Issue:** `race_pools` table has `last_updated` field but no auto-update trigger
   - **Impact:** Inconsistent timestamp behavior across tables
   - **Remediation:** Add trigger in 002_triggers.sql:
     ```sql
     DROP TRIGGER IF EXISTS race_pools_updated_at ON race_pools;
     CREATE TRIGGER race_pools_updated_at
       BEFORE UPDATE ON race_pools
       FOR EACH ROW
       EXECUTE FUNCTION update_updated_at_column();
     ```

4. **[MED] Hardcoded Process Exit in Migration Runner** ([run-migrations.ts:60-63](../server/src/database/run-migrations.ts#L60-L63))
   - **Issue:** `process.exit()` prevents graceful shutdown and makes testing difficult
   - **Impact:** Cannot be used as importable module; forces process termination
   - **Remediation:** Export the function and move process.exit to a CLI wrapper:
     ```typescript
     // migrate.ts - library code (no process.exit)
     export const executeMigrations = async (): Promise<void> => { ... }

     // cli.ts - CLI wrapper
     import { executeMigrations } from './migrate.js'
     try {
       await executeMigrations()
       process.exit(0)
     } catch (err) {
       console.error(err)
       process.exit(1)
     }
     ```

#### Low Severity Issues

5. **[MED] Incorrect Race Status Values** ([001_initial_schema.sql](../server/database/migrations/001_initial_schema.sql))
   - **Issue:** Race status uses incorrect values; correct race status values are: 'open', 'closed', 'interim', 'final', 'abandoned'
   - **Line 30:** `CHECK (status IN ('scheduled', 'running', 'completed', 'cancelled'))` - ALL VALUES INCORRECT
   - **Correct Values:** Race status must be: 'open', 'closed', 'interim', 'final', 'abandoned'
   - **Impact:** Schema does not match business requirements; query patterns will fail; confusion with meeting status
   - **Remediation:** Update CHECK constraint to: `CHECK (status IN ('open', 'closed', 'interim', 'final', 'abandoned'))` AND update all project documentation (tech spec, PRD, tests) to use correct race status values. Note: Meeting status is separate and unchanged.

6. **[LOW] ESLint Ignores JS Files Unnecessarily** ([eslint.config.js:99](../server/eslint.config.js#L99))
   - **Issue:** `ignores: ['**/*.js']` prevents linting any .js files
   - **Impact:** If any .js files are added (e.g., scripts, configs), they won't be linted
   - **Remediation:** More specific ignore pattern: `ignores: ['dist/**/*.js', 'node_modules/**', 'coverage/**']`

### Acceptance Criteria Coverage

| AC | Status | Evidence |
|----|--------|----------|
| 1. Core tables created | ✅ PASS | All tables present: meetings, races, entrants, race_pools ([001_initial_schema.sql](../server/database/migrations/001_initial_schema.sql)) |
| 2. Primary keys defined | ✅ PASS | All tables have PRIMARY KEY constraints (lines 7, 25, 48, 72) |
| 3. Foreign keys enforced | ✅ PASS | races→meetings, entrants→races with CASCADE DELETE (lines 26, 49); tests verify enforcement ([database-schema.test.ts:84-121](../server/tests/integration/database-schema.test.ts#L84-L121)) |
| 4. CHECK constraints | ✅ PASS | race_type IN ('thoroughbred', 'harness'), status fields constrained (lines 10, 12, 30); tests verify ([database-schema.test.ts:124-155](../server/tests/integration/database-schema.test.ts#L124-L155)) |
| 5. TIMESTAMPTZ fields | ✅ PASS | All timestamp fields use TIMESTAMPTZ; test verifies ([database-schema.test.ts:159-175](../server/tests/integration/database-schema.test.ts#L159-L175)) |
| 6. Auto-update triggers | ⚠️ PARTIAL | Triggers work for meetings, races, entrants ([002_triggers.sql](../server/database/migrations/002_triggers.sql)); **Missing for race_pools table** |
| 7. ESLint configured | ✅ PASS | Strict type-checked config active ([eslint.config.js](../server/eslint.config.js)); `npm run lint` passes with zero errors |
| 8. Zero TypeScript errors | ✅ PASS | `npm run build` completes with no errors |
| 9. No `any` types | ✅ PASS | Grep search confirms zero `: any` in codebase; ESLint rule enforces ([eslint.config.js:21](../server/eslint.config.js#L21)) |
| 10. ES6+ functional standards | ✅ PASS | Arrow functions, const/let, no var, destructuring, template literals, async/await throughout ([migrate.ts](../server/src/database/migrate.ts), [run-migrations.ts](../server/src/database/run-migrations.ts)) |

**Overall:** 9/10 full pass, 1 partial (AC6 - race_pools trigger missing)

### Test Coverage and Gaps

#### Strengths
- **Comprehensive schema validation:** 25 tests passing covering table existence, constraints, triggers, data types
- **Proper test isolation:** All tests use transactions with ROLLBACK for cleanup
- **Type-safe test code:** Strict TypeScript typing throughout test suite with no `any` types
- **Integration + Unit coverage:** Both database-schema tests and environment-config tests

#### Gaps
1. **Missing race_pools trigger test:** No test validates auto-update behavior for `race_pools.last_updated`
2. **No migration rollback tests:** No tests verify idempotent re-running of migrations
3. **No connection pool limit tests:** Should test behavior when pool exhausted (max connections reached)
4. **No error injection tests:** Migration failure scenarios not tested (e.g., invalid SQL, connection loss mid-migration)

### Architectural Alignment

#### Strengths
- **ES Module compliance:** Strict ES6 modules with `.js` extensions in imports (Story 1.1 lesson applied correctly)
- **Functional architecture:** Pure functions, immutability, arrow functions throughout
- **Database best practices:** Proper indexing strategy (partial indexes on active data), CASCADE deletes, NUMERIC for financial data
- **Migration organization:** Sequential numbering (000, 001, 002), idempotent SQL with `IF NOT EXISTS`

#### Concerns
1. **Deviation from tech spec status values:** 'scheduled' vs 'upcoming', 'running' vs 'in_progress' may cause query mismatches
2. **No migration version tracking:** No migrations table to track which migrations have run (current implementation re-runs all files)

### Security Notes

#### Critical Security Issues
1. **SQL Injection in CREATE DATABASE** - Addressed in High Severity Finding #1
2. **Pool error handling missing** - Addressed in High Severity Finding #2

#### Security Strengths
- **Parameterized queries in tests:** All test queries use `$1` placeholders correctly
- **No secrets in code:** Database credentials properly externalized to environment variables
- **Strict type checking:** Prevents type confusion attacks via `strictTypeChecked` preset

#### Additional Security Recommendations
1. **Connection string exposure:** Consider encrypting sensitive .env values or using secrets manager (AWS Secrets Manager, HashiCorp Vault)
2. **Database user permissions:** Ensure migration user has minimal required privileges (CREATE, ALTER on target DB only)
3. **SSL/TLS connections:** Add `ssl: true` to Pool config for production to encrypt database traffic

### Best-Practices and References

#### TypeScript & ESLint (2025 Standards)
- **✅ Correctly using `strictTypeChecked`** per typescript-eslint 8.x recommendations
- **✅ Project-based type checking** enabled via `parserOptions.project: true`
- **Reference:** https://typescript-eslint.io/users/configs/#strict-type-checked

#### PostgreSQL 18 Migration Best Practices
- **✅ Idempotent migrations** using `CREATE IF NOT EXISTS`, `CREATE OR REPLACE`
- **✅ Named constraints** for better error messages
- **⚠️ Missing NOT NULL constraints with NOT VALID** - For large production tables, PG18 allows adding NOT NULL as NOT VALID for incremental validation without long locks
- **Reference:** https://www.postgresql.org/docs/current/ddl-constraints.html

#### Node.js 22 + pg Library Best Practices
- **✅ Properly using pg.Pool** for connection pooling
- **❌ Missing pool error handlers** - Critical for production stability
- **✅ Parameterized queries in tests** - Prevents SQL injection
- **Reference:** https://node-postgres.com/features/pooling

#### New PostgreSQL 18 Features (Not Yet Utilized)
- **NOT ENFORCED constraints:** Could use for soft validation during development
- **NOT NULL with NOT VALID:** Useful for adding constraints to large existing tables
- **pg_upgrade statistics preservation:** Relevant for future major version upgrades

### Action Items

1. **[HIGH][Security] Fix SQL injection in CREATE DATABASE** (AC: 1)
   - File: [server/src/database/run-migrations.ts:31](../server/src/database/run-migrations.ts#L31)
   - Owner: Developer
   - Action: Use pg-format identifier escaping or strict regex validation for database name

2. **[HIGH][Error Handling] Add Pool error event listeners** (AC: 7, 8)
   - Files: [server/src/database/migrate.ts](../server/src/database/migrate.ts), [server/src/database/run-migrations.ts](../server/src/database/run-migrations.ts)
   - Owner: Developer
   - Action: Add `pool.on('error', ...)` handlers immediately after pool creation

3. **[MED][Schema] Add race_pools auto-update trigger** (AC: 6)
   - File: [server/database/migrations/002_triggers.sql](../server/database/migrations/002_triggers.sql)
   - Owner: Developer
   - Action: Add `race_pools_updated_at` trigger for `last_updated` field consistency

4. **[MED][Architecture] Extract process.exit from migration function** (AC: 10)
   - File: [server/src/database/run-migrations.ts:60-63](../server/src/database/run-migrations.ts#L60-L63)
   - Owner: Developer
   - Action: Move process.exit to CLI wrapper for better modularity and testability

5. **[MED][Data Model] Correct race status values across all project documentation** (AC: 4)
   - Files: [server/database/migrations/001_initial_schema.sql:30](../server/database/migrations/001_initial_schema.sql#L30), tech-spec-epic-1.md, and all project documentation
   - Owner: Developer
   - Action: Race status must use ONLY these values: 'open', 'closed', 'interim', 'final', 'abandoned' (NOT 'scheduled', 'running', 'upcoming', 'in_progress', 'completed', 'cancelled'). Update schema migration, tech spec, PRD, and any other documentation to use correct race status values to prevent future confusion. Meeting status is separate and unchanged.

6. **[LOW][Linting] Refine ESLint ignore patterns** (AC: 7)
   - File: [server/eslint.config.js:99](../server/eslint.config.js#L99)
   - Owner: Developer
   - Action: Replace `**/*.js` ignore with specific paths (dist/, node_modules/)

7. **[TEST][Coverage] Add race_pools trigger test** (AC: 6)
   - File: [server/tests/integration/database-schema.test.ts](../server/tests/integration/database-schema.test.ts)
   - Owner: QA/Developer
   - Action: Add test verifying `last_updated` auto-updates on race_pools UPDATE
