# Story 1.7: Structured Logging with Pino

Status: Approved

## Story

As a developer,
I want structured logging configured using Pino,
so that application events are logged in a consistent, parseable JSON format with timestamps.

## Acceptance Criteria

1. Pino logger configured in `server/src/shared/logger.ts`
2. Log level controlled by `env.LOG_LEVEL` from validated environment (Story 1.6)
3. Structured JSON output (no plain text logging)
4. ISO 8601 timestamps using `pino.stdTimeFunctions.isoTime`
5. Base context includes `env: NODE_ENV`
6. Custom formatter for level field: `{ level: label }`
7. Logger exported as named export for application-wide use
8. ESLint rule configured: No `console.log` in production code
9. Unit tests verify logger configuration and output format

## Tasks / Subtasks

- [ ] Task 1: Install Pino dependency (AC: 1)
  - [ ] Subtask 1.1: Add `pino` package to server/package.json
  - [ ] Subtask 1.2: Run `npm install` to install Pino
- [ ] Task 2: Create logger module (AC: 1, 2, 3, 4, 5, 6, 7)
  - [ ] Subtask 2.1: Create `server/src/shared/logger.ts`
  - [ ] Subtask 2.2: Import `pino` and `env` from validated environment
  - [ ] Subtask 2.3: Configure logger with level from `env.LOG_LEVEL`
  - [ ] Subtask 2.4: Add level formatter: `formatters: { level: (label) => ({ level: label }) }`
  - [ ] Subtask 2.5: Set timestamp format: `timestamp: pino.stdTimeFunctions.isoTime`
  - [ ] Subtask 2.6: Add base context: `base: { env: env.NODE_ENV }`
  - [ ] Subtask 2.7: Export logger as named export
- [ ] Task 3: Configure ESLint rule for console.log (AC: 8)
  - [ ] Subtask 3.1: Add `no-console` rule to server/.eslintrc.json
  - [ ] Subtask 3.2: Verify ESLint fails on `console.log` usage in production code
- [ ] Task 4: Write unit tests (AC: 9)
  - [ ] Subtask 4.1: Create `server/tests/unit/logger.test.ts`
  - [ ] Subtask 4.2: Test logger configuration (level, timestamp, base fields)
  - [ ] Subtask 4.3: Test JSON output format
  - [ ] Subtask 4.4: Test level formatter output
  - [ ] Subtask 4.5: Test contextual logging with additional fields
- [ ] Task 5: Integration and validation (AC: 1-9)
  - [ ] Subtask 5.1: Replace any existing `console.log` with logger in codebase
  - [ ] Subtask 5.2: Verify logger works in index.ts and run-migrations.ts
  - [ ] Subtask 5.3: Run `npm run lint` to verify no console.log violations
  - [ ] Subtask 5.4: Run `npm test` to verify all tests pass
  - [ ] Subtask 5.5: Run `npm run build` to verify TypeScript compilation

## Dev Notes

### Pino Logger Configuration

**Implementation Reference:** [tech-spec-epic-1.md](../tech-spec-epic-1.md#logging-infrastructure) lines 443-486

**Core Configuration:**

```typescript
// ./server/src/shared/logger.ts
import pino from 'pino'
import { env } from './env'

export const logger = pino({
  level: env.LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: env.NODE_ENV,
  },
})
```

**Expected Log Structure:**

```json
{
  "level": "info",
  "time": "2025-10-05T12:34:56.789Z",
  "env": "production",
  "raceId": "NZ-AUK-20251005-R1",
  "duration": 1200,
  "msg": "Race processed"
}
```

**Usage Patterns:**

```typescript
// Info with context
logger.info({ raceId: 'NZ-AUK-20251005-R1', duration: 1200 }, 'Race processed')

// Warning with context
logger.warn({ raceId: 'R2', duration: 18000 }, 'Slow processing detected')

// Error with error object
logger.error({ err: error, raceId: 'R3' }, 'Processing failed')
```

**Key Features:**

1. **Environment-driven log level**: Uses `env.LOG_LEVEL` from Story 1.6 Zod validation
2. **Structured fields**: All logs include contextual data (raceId, duration, etc.)
3. **ISO 8601 timestamps**: `pino.stdTimeFunctions.isoTime` for consistent time format
4. **Base context**: Every log includes `env: NODE_ENV` automatically
5. **Level formatter**: Outputs `"level": "info"` instead of numeric level codes

### ESLint Configuration

**No Console Rule:**

```json
{
  "rules": {
    "no-console": ["error", { "allow": ["warn", "error"] }]
  }
}
```

- **Error** on `console.log` usage (prevents unstructured logging)
- **Allow** `console.warn` and `console.error` for exceptional cases (startup failures before logger initialized)

### Testing Strategy

**Unit Tests** (`tests/unit/logger.test.ts`):

1. Verify logger instance is created with correct configuration
2. Test log level matches `env.LOG_LEVEL`
3. Test JSON output format (parse log output and verify structure)
4. Test timestamp format is ISO 8601
5. Test base context includes `env: NODE_ENV`
6. Test level formatter outputs `{ level: "info" }` format
7. Test contextual logging (additional fields appear in output)

**Integration Points:**

- `server/src/index.ts`: Log server startup events
- `server/src/database/run-migrations.ts`: Log migration execution
- Future stories: All API routes, data processing, error handling

### Project Structure Notes

**Files to Create:**

- `server/src/shared/logger.ts` - Main logger module

**Files to Modify:**

- `server/package.json` - Add `pino` dependency
- `server/.eslintrc.json` - Add `no-console` rule
- `server/tests/unit/logger.test.ts` - Logger unit tests
- `server/src/index.ts` - Replace console output with logger
- `server/src/database/run-migrations.ts` - Replace console output with logger (if any remain)

**Alignment with unified-project-structure:**

- Logger placed in `server/src/shared/` (shared utilities pattern)
- Tests in `server/tests/unit/` (standard test location)
- Named exports following [CODING-STANDARDS.md](../CODING-STANDARDS.md#typescript-best-practices)

### References

- [Tech Spec Epic 1](../tech-spec-epic-1.md#logging-infrastructure) - Lines 443-486 (Logging Infrastructure)
- [Coding Standards](../CODING-STANDARDS.md) - ES modules, TypeScript patterns, testing standards
- [Story 1.6](./story-1.6.md) - Environment validation (provides `env.LOG_LEVEL` and `env.NODE_ENV`)
- [Pino Documentation](https://getpino.io/) - Official Pino logger docs

### Known Dependencies

**Prerequisites:**

- ✅ Story 1.6 completed - Environment validation provides `env.LOG_LEVEL` and `env.NODE_ENV`
- ✅ TypeScript configuration in place from Story 1.1-1.2
- ✅ Testing framework (Vitest) configured

**Follow-up Stories:**

- Story 1.8: Connection Pool - Will use logger for pool events
- Story 1.9: Health Check - Will use logger for health check failures
- Epic 2+: All data processing will use structured logging

## Dev Agent Record

### Context Reference

- [story-context-1.7.xml](../story-context-1.7.xml) - Generated 2025-10-08

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

### Completion Notes List

### File List
