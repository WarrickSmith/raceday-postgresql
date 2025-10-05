# Technical Requirements Summary

**Project:** Raceday PostgreSQL Migration
**Last Updated:** 2025-10-05
**Status:** Requirements Finalized

---

## 🎯 Core Requirements

### Node.js & Runtime
- ✅ **Minimum Version:** Node.js 22 LTS (v22.0.0+)
- ✅ **Package Manager:** npm 10+
- ✅ **Module System:** ESM (ECMAScript Modules)

### TypeScript
- ✅ **Version:** TypeScript 5.7+
- ✅ **Strict Mode:** Enabled (all strict flags)
- ✅ **No `any` Types:** Enforced by ESLint
- ✅ **No Implicit Types:** All functions/variables explicitly typed
- ✅ **Null Safety:** Strict null checks enabled

### Code Quality
- ✅ **Zero Lint Errors:** ESLint with strict TypeScript rules
- ✅ **Zero Type Errors:** TypeScript compiler in strict mode
- ✅ **Code Formatting:** Prettier enforced
- ✅ **Pre-commit Validation:** Husky + lint-staged

---

## 📦 Dependencies (Node.js 22 Compatible)

### Production Dependencies

| Package | Version | Purpose | Node 22 Status |
|---------|---------|---------|----------------|
| express | ^4.21.2 | HTTP server & routing | ✅ Compatible |
| pg | ^8.13.1 | PostgreSQL client | ✅ Compatible |
| axios | ^1.7.9 | HTTP client (NZ TAB API) | ✅ Compatible |
| node-cron | ^3.0.3 | Job scheduling | ✅ Compatible |
| pino | ^9.5.0 | High-performance logging | ✅ Compatible |
| dotenv | ^16.4.7 | Environment configuration | ✅ Compatible |
| helmet | ^8.0.0 | Security headers | ✅ Compatible |
| compression | ^1.7.5 | Response compression | ✅ Compatible |
| zod | ^3.23.8 | Runtime type validation | ✅ Compatible |

### Development Dependencies

| Package | Version | Purpose | Node 22 Status |
|---------|---------|---------|----------------|
| typescript | ^5.7.2 | TypeScript compiler | ✅ Compatible |
| @types/node | ^22.10.2 | Node.js 22 type definitions | ✅ Required |
| @types/express | ^5.0.0 | Express types | ✅ Compatible |
| @types/pg | ^8.11.10 | PostgreSQL types | ✅ Compatible |
| @typescript-eslint/eslint-plugin | ^8.19.1 | TypeScript linting | ✅ Compatible |
| @typescript-eslint/parser | ^8.19.1 | TypeScript parser for ESLint | ✅ Compatible |
| eslint | ^9.17.0 | Code linting | ✅ Compatible |
| eslint-config-airbnb-typescript | ^18.0.0 | Airbnb TypeScript style | ✅ Compatible |
| jest | ^29.7.0 | Testing framework | ✅ Compatible |
| ts-jest | ^29.2.5 | TypeScript Jest transformer | ✅ Compatible |
| prettier | ^3.4.2 | Code formatting | ✅ Compatible |
| husky | ^9.1.7 | Git hooks | ✅ Compatible |
| lint-staged | ^15.2.11 | Pre-commit linting | ✅ Compatible |

---

## 🔒 Type Safety Requirements

### 1. No `any` Types Allowed

**❌ FORBIDDEN:**
```typescript
function process(data: any): any { }
const result: any = fetchData();
```

**✅ REQUIRED:**
```typescript
import { z } from 'zod';

const DataSchema = z.object({
  id: z.string(),
  value: z.number(),
});

type Data = z.infer<typeof DataSchema>;

function process(data: Data): ProcessedData { }
const result: Data = DataSchema.parse(fetchData());
```

### 2. Strict TypeScript Configuration

**tsconfig.json - Required Settings:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 3. Runtime Validation with Zod

**All External Data Must Be Validated:**

- ✅ NZ TAB API responses → Zod schemas
- ✅ Database query results → Typed interfaces
- ✅ Worker thread messages → Validated types
- ✅ Environment variables → Parsed and validated
- ✅ User inputs → Schema validation

### 4. ESLint Strict Rules

**Required ESLint Rules:**
```json
{
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-return": "error",
  "@typescript-eslint/strict-boolean-expressions": "error",
  "@typescript-eslint/no-floating-promises": "error"
}
```

---

## ✅ Pre-Deployment Validation Checklist

### Code Quality
- [ ] `npm run type-check` - Zero TypeScript errors
- [ ] `npm run lint` - Zero ESLint errors
- [ ] `npm run format:check` - All files formatted
- [ ] `npm test` - All tests passing
- [ ] `npm run build` - Build succeeds
- [ ] No `any` types (search: `grep -r ": any" src/`)
- [ ] All external data validated with Zod

### Type Safety Audit
- [ ] No `@ts-ignore` or `@ts-expect-error` comments
- [ ] All function parameters explicitly typed
- [ ] All API responses validated with Zod
- [ ] All database queries use typed interfaces
- [ ] Worker thread messages have type contracts
- [ ] Error handling uses typed error classes
- [ ] No `console.log` in production code

### Performance
- [ ] <15s processing for 5 concurrent races
- [ ] <300ms database write per race
- [ ] <100ms API response time
- [ ] Worker threads properly pooled
- [ ] Database connections pooled efficiently

---

## 🚀 Development Workflow

### Initial Setup

```bash
# Verify Node.js version (must be 22+)
node --version  # Should output v22.x.x

# Install dependencies
npm install

# Verify all tools work
npm run type-check
npm run lint
npm run format:check
npm test
```

### Development Cycle

```bash
# 1. Start development server
npm run dev

# 2. Make changes to code

# 3. Validate before commit
npm run validate  # Runs: type-check + lint + format + test

# 4. Commit (pre-commit hook runs automatically)
git add .
git commit -m "feat: add race processor"
```

### Pre-Commit Hook (Automatic)

When you commit, Husky automatically runs:
1. TypeScript type checking
2. ESLint validation
3. Prettier formatting
4. Relevant tests

**Commit is blocked if any step fails.**

---

## 📋 Code Standards

### Naming Conventions

```typescript
// Variables & Functions: camelCase
const raceData = fetchRaceData();
async function processRace(raceId: string) { }

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const DATABASE_URL = process.env.DATABASE_URL;

// Types & Interfaces: PascalCase
interface RaceData { }
type ProcessedRace = { };

// NO 'I' prefix for interfaces
interface UserData { }  // ✅ Good
interface IUserData { } // ❌ Bad

// Enums: PascalCase with UPPER_CASE members
enum RaceStatus {
  UPCOMING = 'UPCOMING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}
```

### Import Organization

```typescript
// 1. Built-in Node.js modules
import { Worker } from 'worker_threads';

// 2. External dependencies
import express from 'express';
import { z } from 'zod';

// 3. Internal modules (absolute imports)
import { pool } from '@/database/pool';
import { logger } from '@/shared/logger';

// 4. Relative imports
import { transformRace } from './transformer';
import type { RaceData } from './types';
```

### Error Handling

```typescript
// Custom typed error classes
class RaceProcessingError extends Error {
  constructor(
    message: string,
    public readonly raceId: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'RaceProcessingError';
  }
}

// Usage
try {
  await processRace(raceId);
} catch (error) {
  if (error instanceof Error) {
    throw new RaceProcessingError(
      `Failed to process race`,
      raceId,
      error
    );
  }
  throw error;
}
```

### Async/Await

```typescript
// Always use async/await (not callbacks or .then())
async function fetchRaceData(raceId: string): Promise<RaceData> {
  const response = await axios.get<unknown>(`/api/races/${raceId}`);
  return RaceDataSchema.parse(response.data);
}

// Handle promises properly (no floating promises)
// ❌ Bad - floating promise
processRace(raceId);

// ✅ Good - awaited or void
await processRace(raceId);
// or
void processRace(raceId); // If intentionally fire-and-forget
```

---

## 🧪 Testing Requirements

### Test Coverage

- [ ] Unit tests for all business logic
- [ ] Integration tests for database operations
- [ ] Performance tests for <15s target
- [ ] API endpoint tests for client compatibility

### Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('RaceProcessor', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('should process single race in <2s', async () => {
    const start = performance.now();
    await processRace('test-race-id');
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(2000);
  });

  it('should validate race data with Zod', async () => {
    const invalidData = { invalid: 'data' };

    await expect(
      RaceDataSchema.parse(invalidData)
    ).rejects.toThrow();
  });
});
```

---

## 📚 Documentation Requirements

### Code Documentation

```typescript
/**
 * Processes race data by fetching from NZ TAB, transforming,
 * and writing to PostgreSQL database.
 *
 * @param raceId - Unique identifier for the race
 * @returns Promise resolving to processing duration in ms
 * @throws {RaceProcessingError} If processing fails
 *
 * @example
 * ```typescript
 * const duration = await processRace('NZ-AUK-20251005-R1');
 * console.log(`Processed in ${duration}ms`);
 * ```
 */
async function processRace(raceId: string): Promise<number> {
  // Implementation
}
```

### Type Documentation

```typescript
/**
 * Race data structure from NZ TAB API
 */
interface RaceData {
  /** Unique race identifier (e.g., "NZ-AUK-20251005-R1") */
  id: string;

  /** Race name/title */
  name: string;

  /** Race number within meeting (1-12 typically) */
  raceNumber: number;

  /** ISO 8601 timestamp of race start */
  startTime: string;

  /** Current race status */
  status: 'upcoming' | 'in_progress' | 'completed' | 'abandoned';

  /** Array of race entrants */
  entrants: Entrant[];
}
```

---

## 🔐 Security Requirements

### Environment Variables

```typescript
import { z } from 'zod';

// Validate environment variables at startup
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATABASE_URL: z.string().url(),
  NZTAB_API_URL: z.string().url(),
  NZTAB_API_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive(),
});

// Throws if invalid
export const env = EnvSchema.parse(process.env);

// Usage (typed and validated)
const apiUrl = env.NZTAB_API_URL;
```

### Input Validation

```typescript
// All user/external inputs validated
app.post('/api/races', (req, res) => {
  const result = CreateRaceSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      error: 'Invalid input',
      details: result.error.issues,
    });
  }

  // result.data is now type-safe
  const raceData = result.data;
});
```

---

## 📊 Performance Requirements

### Targets

| Metric | Target | Validation |
|--------|--------|------------|
| Single race processing | <2s | Performance tests |
| 5 concurrent races | <15s | Load testing |
| Database write (per race) | <300ms | Benchmarks |
| API response time | <100ms | Integration tests |
| Memory usage | <2GB | Monitoring |
| CPU usage | <80% (4 cores) | Profiling |

### Monitoring

```typescript
import { performance } from 'perf_hooks';

async function processRaceWithMetrics(raceId: string): Promise<void> {
  const start = performance.now();

  try {
    await processRace(raceId);

    const duration = performance.now() - start;
    logger.info({ raceId, duration }, 'Race processed');

    if (duration > 2000) {
      logger.warn({ raceId, duration }, 'Slow processing detected');
    }
  } catch (error) {
    logger.error({ raceId, error }, 'Processing failed');
    throw error;
  }
}
```

---

## 🎯 Success Criteria

### Technical Compliance

- ✅ Node.js 22 LTS minimum
- ✅ TypeScript 5.7+ strict mode
- ✅ Zero `any` types in codebase
- ✅ Zero lint errors
- ✅ Zero type errors
- ✅ All tests passing
- ✅ 100% external data validation
- ✅ Performance targets met

### Code Quality Metrics

- ✅ Test coverage >80%
- ✅ All functions documented
- ✅ All types exported and documented
- ✅ ESLint complexity score <15
- ✅ No circular dependencies
- ✅ Bundle size optimized

---

## 📖 Reference Documentation

### Primary Documentation

1. **[typescript-eslint-config.md](./typescript-eslint-config.md)** - Complete TypeScript/ESLint setup
2. **[architecture-specification.md](./architecture-specification.md)** - System architecture
3. **[developer-quick-start.md](./developer-quick-start.md)** - Getting started guide

### Configuration Files

All configuration files documented in [typescript-eslint-config.md](./typescript-eslint-config.md):
- tsconfig.json
- .eslintrc.json
- .prettierrc.json
- package.json scripts
- Git hooks setup

---

## ⚠️ Critical Notes

### Breaking Changes from server-old

1. **No `any` types** - All code must be strictly typed
2. **Node.js 22 required** - Cannot use Node.js <22
3. **ESM modules** - No CommonJS (`require`)
4. **Strict null checks** - Must handle undefined/null explicitly
5. **Runtime validation** - All external data must use Zod

### Migration Strategy

1. Extract business logic from server-old
2. Define strict types first
3. Validate all boundaries (API, DB, Workers)
4. Build incrementally with validation
5. Zero tolerance for type/lint errors

---

**Last Updated:** 2025-10-05
**Next Review:** After Phase 1 implementation
