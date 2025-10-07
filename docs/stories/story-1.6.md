# Story 1.6: Environment Variable Validation with Zod

Status: Approved

## Story

As a developer,
I want environment variables validated at startup using Zod,
so that configuration errors are caught immediately with clear messages.

## Acceptance Criteria

1. Zod schema defined for all required environment variables
2. Required variables: NODE_ENV, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, NZTAB_API_URL, PORT
3. Type coercion for numeric values (PORT, DB_PORT, DB_POOL_MAX → number)
4. URL validation for NZTAB_API_URL
5. Application fails fast on startup if any validation fails
6. Clear error messages indicating which variable is invalid
7. Validated config exported as typed constant (env)
8. DATABASE_URL environment variable removed - replaced with individual DB component variables (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME)

## Tasks / Subtasks

- [ ] Task 1: Remove DATABASE_URL from environment validation (AC: 8)
  - [ ] Subtask 1.1: Remove DATABASE_URL from EnvSchema in server/src/shared/env.ts
  - [ ] Subtask 1.2: Update EnvSchema to include DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME as required fields
  - [ ] Subtask 1.3: Remove DATABASE_URL from tech spec documentation (lines 388, 411)
- [ ] Task 2: Update Zod schema with individual DB components (AC: 1, 2, 3)
  - [ ] Subtask 2.1: Add DB_HOST validation (z.string().min(1))
  - [ ] Subtask 2.2: Add DB_PORT validation (z.coerce.number().int().positive())
  - [ ] Subtask 2.3: Add DB_USER validation (z.string().min(1))
  - [ ] Subtask 2.4: Add DB_PASSWORD validation (z.string().min(1))
  - [ ] Subtask 2.5: Add DB_NAME validation (z.string().min(1))
  - [ ] Subtask 2.6: Keep existing validations for NODE_ENV, NZTAB_API_URL, PORT, LOG_LEVEL, etc.
- [ ] Task 3: Update application code to build DATABASE_URL from components (AC: 8)
  - [ ] Subtask 3.1: Update database connection code to construct DATABASE_URL from env.DB_HOST, env.DB_PORT, etc.
  - [ ] Subtask 3.2: Ensure connection pool uses constructed URL
  - [ ] Subtask 3.3: Update migration scripts (run-migrations.ts) to use DB component variables
- [ ] Task 4: Update test environment configuration (AC: 2, 8)
  - [ ] Subtask 4.1: Update test env setup to use DB component variables
  - [ ] Subtask 4.2: Update vitest.config.ts if it references DATABASE_URL
  - [ ] Subtask 4.3: Verify existing unit tests pass with new env structure
- [ ] Task 5: Validate error handling and messaging (AC: 5, 6)
  - [ ] Subtask 5.1: Test startup with missing required variables
  - [ ] Subtask 5.2: Test startup with invalid PORT (non-numeric)
  - [ ] Subtask 5.3: Test startup with invalid DB_PORT (non-numeric)
  - [ ] Subtask 5.4: Test startup with invalid NZTAB_API_URL (not a URL)
  - [ ] Subtask 5.5: Verify error messages clearly indicate which variable failed and why
- [ ] Task 6: Update documentation (AC: 8)
  - [ ] Subtask 6.1: Verify .env.example already uses DB components (it does)
  - [ ] Subtask 6.2: Update developer-quick-start.md if it references DATABASE_URL
  - [ ] Subtask 6.3: Update tech-spec-epic-1.md to remove DATABASE_URL references

## Dev Notes

### Environment Variable Architecture Change

**Critical Change**: DATABASE_URL is being replaced with individual database component variables to match the existing .env.example format and recent docker-compose.yml implementation (Story 1.5).

**Current State** (from .env.example):
```bash
# Database Configuration (PostgreSQL 18)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=raceday
DB_POOL_MAX=10
```

**Required Changes**:
1. Update EnvSchema to validate DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
2. Remove DATABASE_URL validation
3. Update connection code to construct URL from components: `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`

### Zod Validation Standards

**Type Coercion**: Use z.coerce for environment variables that need conversion:
- `z.coerce.number()` for PORT, DB_PORT, UV_THREADPOOL_SIZE, MAX_WORKER_THREADS, DB_POOL_MAX
- Handles string → number conversion automatically
- Validates as integer and positive where appropriate

**Validation Patterns**:
- NODE_ENV: `z.enum(['development', 'production', 'test'])`
- URL fields: `z.string().url()` for NZTAB_API_URL
- Required strings: `z.string().min(1)` for DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
- Numbers: `z.coerce.number().int().positive()` for ports and pool sizes
- Optional with defaults: `.default('info')` for LOG_LEVEL

**Error Handling**:
- Use `.parse()` for fail-fast behavior on startup
- Zod automatically generates clear error messages showing field path and validation failure
- Example error: "Invalid DB_PORT: Expected number, received string"

### Implementation Reference

Existing code patterns from server/src/database/run-migrations.ts (lines 8-14):
```typescript
const buildDatabaseUrl = (database: string): string => {
  const dbHost = process.env.DB_HOST ?? 'localhost'
  const dbPort = process.env.DB_PORT ?? '5432'
  const dbUser = process.env.DB_USER ?? 'postgres'
  const dbPassword = process.env.DB_PASSWORD ?? 'postgres'
  return `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${database}`
}
```

This pattern should be applied consistently across:
1. server/src/shared/env.ts (Zod validation + URL builder)
2. server/src/database/pool.ts (connection pool initialization)
3. server/src/database/run-migrations.ts (already uses this pattern)

### Testing Strategy

**Unit Tests** (tests/unit/environment-config.test.ts):
- Test valid environment variables pass validation
- Test invalid DB_PORT (string 'abc') throws validation error
- Test invalid PORT (string 'xyz') throws validation error
- Test invalid NZTAB_API_URL (string 'not-a-url') throws validation error
- Test missing required variables throw validation errors
- Test default values applied correctly (LOG_LEVEL defaults to 'info')
- Test constructed DATABASE_URL format is correct

**Integration Tests**:
- Verify database connection works with component-based URL
- Verify migration scripts work with component variables
- Verify docker-compose environment variable passing works

### Project Structure Notes

**Files to Modify**:
1. `server/src/shared/env.ts` - Main Zod schema definition
2. `server/src/database/pool.ts` - Connection pool using constructed URL
3. `server/tests/unit/environment-config.test.ts` - Validation tests
4. `docs/tech-spec-epic-1.md` - Remove DATABASE_URL references (lines 388, 411)
5. `docs/developer-quick-start.md` - If it references DATABASE_URL

**Files Already Correct**:
1. `server/.env.example` - Already uses DB component variables ✓
2. `server/docker-compose.yml` - Already passes DB component variables ✓
3. `server/src/database/run-migrations.ts` - Already constructs URL from components ✓

### References

- [Tech Spec Epic 1](../tech-spec-epic-1.md#environment-configuration) - Lines 379-425 (Environment Variables Schema)
- [Epic Breakdown](../epic-stories-2025-10-05.md#story-16-environment-variable-validation-with-zod) - Lines 118-131 (Story Definition)
- [Architecture Spec](../architecture-specification.md) - Environment validation patterns
- [Existing .env.example](../../server/.env.example) - Current DB component variable format
- [Story 1.5 Implementation](./story-1.5.md) - Docker compose uses DB components

### Known Deviations from Tech Spec

**Deviation**: Tech Spec (lines 386-396) shows DATABASE_URL as a single variable. This story implements the corrected approach using individual DB components (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME) to match:
1. Current .env.example format
2. Story 1.5 docker-compose.yml implementation
3. Better security (passwords not in URLs in logs)
4. Greater deployment flexibility

**Rationale**: Individual components provide:
- Better secrets management (DB_PASSWORD can be injected separately)
- Clearer configuration in docker-compose and Portainer
- Consistency with existing codebase (run-migrations.ts already uses this pattern)
- Alignment with Story 1.5 Docker implementation

## Dev Agent Record

### Context Reference

- [story-context-1.6.xml](../story-context-1.6.xml) - Generated 2025-10-07

### Agent Model Used

<!-- Will be populated during development -->

### Debug Log References

### Completion Notes List

### File List

### Change Log

**2025-10-07**: Story 1.6 created for environment variable validation with Zod. Key change: DATABASE_URL replaced with individual DB component variables (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME) to align with .env.example and Story 1.5 implementation.
