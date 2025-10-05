# Raceday PostgreSQL - Coding Standards

**Version:** 1.0
**Date:** 2025-10-06
**Applies To:** All server-side Node.js/TypeScript code

---

## Overview

This project follows modern ES6+ JavaScript standards with TypeScript, emphasizing functional programming principles, immutability, and type safety. All code must be written using ES modules (ESM) and conform to strict TypeScript configuration.

---

## Core Principles

### 1. Modern ES6+ Standards

**ES Modules (ESM) - MANDATORY**
```typescript
// ✅ CORRECT - ES modules
import { Pool } from 'pg'
import dotenv from 'dotenv'

export const createPool = () => new Pool()

// ❌ INCORRECT - CommonJS (not allowed)
const { Pool } = require('pg')
module.exports = { createPool }
```

**Arrow Functions**
```typescript
// ✅ CORRECT - Arrow functions for functional patterns
const processRaces = async (races) => {
  return races.map(race => transformRace(race))
}

// ❌ INCORRECT - Traditional function (use only for methods)
function processRaces(races) {
  return races.map(function(race) {
    return transformRace(race)
  })
}
```

**Async/Await over Callbacks**
```typescript
// ✅ CORRECT - Async/await
const fetchRaceData = async (raceId: string) => {
  const data = await pool.query('SELECT * FROM races WHERE id = $1', [raceId])
  return data.rows[0]
}

// ❌ INCORRECT - Callbacks
const fetchRaceData = (raceId: string, callback) => {
  pool.query('SELECT * FROM races WHERE id = $1', [raceId], (err, data) => {
    callback(err, data.rows[0])
  })
}
```

**Const/Let (Never Var)**
```typescript
// ✅ CORRECT
const maxRetries = 3
let currentAttempt = 0

// ❌ INCORRECT
var maxRetries = 3
```

**Destructuring**
```typescript
// ✅ CORRECT
const { raceId, meetingId, status } = race
const [first, second, ...rest] = entrants

// ❌ INCORRECT
const raceId = race.raceId
const meetingId = race.meetingId
const first = entrants[0]
const second = entrants[1]
```

**Template Literals**
```typescript
// ✅ CORRECT
const message = `Race ${raceId} starts at ${startTime}`

// ❌ INCORRECT
const message = 'Race ' + raceId + ' starts at ' + startTime
```

**Optional Chaining & Nullish Coalescing**
```typescript
// ✅ CORRECT
const winnerName = race?.winner?.name ?? 'Unknown'

// ❌ INCORRECT
const winnerName = race && race.winner && race.winner.name || 'Unknown'
```

---

### 2. Functional Programming Principles

**Pure Functions**
```typescript
// ✅ CORRECT - Pure function
const calculateMoneyFlow = (currentPool: number, previousPool: number): number => {
  return currentPool - previousPool
}

// ❌ INCORRECT - Side effects
let totalFlow = 0
const calculateMoneyFlow = (currentPool: number, previousPool: number) => {
  totalFlow += currentPool - previousPool  // Mutating external state
  return totalFlow
}
```

**Immutability**
```typescript
// ✅ CORRECT - Creating new objects
const updatedRace = { ...race, status: 'completed' }
const activeEntrants = entrants.filter(e => e.isActive)

// ❌ INCORRECT - Mutating objects
race.status = 'completed'
entrants.splice(0, 1)
```

**Array Methods over Loops**
```typescript
// ✅ CORRECT - Functional array methods
const entrantIds = entrants.map(e => e.id)
const activeRaces = races.filter(r => r.status === 'active')
const totalPool = pools.reduce((sum, pool) => sum + pool.amount, 0)

// ❌ INCORRECT - Traditional loops
const entrantIds = []
for (let i = 0; i < entrants.length; i++) {
  entrantIds.push(entrants[i].id)
}
```

**Function Composition**
```typescript
// ✅ CORRECT - Small, composable functions
const fetchRace = async (id: string) => { /* ... */ }
const transformRace = (race: RawRace) => { /* ... */ }
const saveRace = async (race: Race) => { /* ... */ }

const processRace = async (id: string) => {
  const rawRace = await fetchRace(id)
  const transformedRace = transformRace(rawRace)
  return saveRace(transformedRace)
}

// ❌ INCORRECT - Monolithic function
const processRace = async (id: string) => {
  // 100+ lines of mixed concerns
}
```

---

### 3. TypeScript Best Practices

**Strict Typing - No Any**
```typescript
// ✅ CORRECT
interface RaceData {
  id: string
  status: 'pending' | 'active' | 'completed'
  entrants: Entrant[]
}

const fetchRace = async (id: string): Promise<RaceData> => { /* ... */ }

// ❌ INCORRECT
const fetchRace = async (id: any): Promise<any> => { /* ... */ }
```

**Type Inference**
```typescript
// ✅ CORRECT - Let TypeScript infer obvious types
const raceId = 'R123'  // inferred as string
const maxEntrants = 20  // inferred as number

// ❌ INCORRECT - Redundant type annotations
const raceId: string = 'R123'
const maxEntrants: number = 20
```

**Interface vs Type**
```typescript
// ✅ CORRECT - Interface for object shapes
interface Race {
  id: string
  status: RaceStatus
}

// ✅ CORRECT - Type for unions/intersections
type RaceStatus = 'pending' | 'active' | 'completed'
type RaceWithMeeting = Race & { meetingId: string }

// ❌ INCORRECT - Type for simple object shapes
type Race = {
  id: string
  status: RaceStatus
}
```

**Runtime Validation with Zod**
```typescript
// ✅ CORRECT - Validate external data
import { z } from 'zod'

const RaceSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'active', 'completed']),
  entrants: z.array(EntrantSchema)
})

const validateRaceData = (data: unknown) => RaceSchema.parse(data)
```

**Named Exports over Default**
```typescript
// ✅ CORRECT - Named exports
export const fetchRace = async (id: string) => { /* ... */ }
export const transformRace = (race: RawRace) => { /* ... */ }

// ❌ INCORRECT - Default export
export default async function(id: string) { /* ... */ }
```

---

### 4. Code Quality Standards

**ESLint Configuration**
- Zero errors policy (warnings allowed during development)
- Use `@typescript-eslint/recommended`
- Enforce consistent return types
- Require explicit function return types for public APIs

**Prettier Configuration**
```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "arrowParens": "avoid"
}
```

**File Organization**
```
max-lines: 300 lines per file
max-function-length: 50 lines per function
one-export-per-file: Prefer focused modules
```

**Naming Conventions**
```typescript
// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3
const DATABASE_TIMEOUT_MS = 5000

// Variables/Functions: camelCase
const raceProcessor = createProcessor()
const fetchRaceData = async () => { /* ... */ }

// Interfaces/Types: PascalCase
interface RaceData { /* ... */ }
type RaceStatus = 'pending' | 'active'

// Files: kebab-case
// race-processor.ts, money-flow-calculator.ts
```

---

### 5. Error Handling

**Use Explicit Error Types**
```typescript
// ✅ CORRECT
class DatabaseError extends Error {
  constructor(message: string, public readonly query: string) {
    super(message)
    this.name = 'DatabaseError'
  }
}

const fetchRace = async (id: string): Promise<Race> => {
  try {
    const result = await pool.query('SELECT * FROM races WHERE id = $1', [id])
    if (!result.rows[0]) {
      throw new Error(`Race ${id} not found`)
    }
    return result.rows[0]
  } catch (error) {
    if (error instanceof DatabaseError) {
      // Handle database errors
    }
    throw error
  }
}
```

---

### 6. Testing Standards

**Test File Naming**
```
src/race-processor.ts     → tests/unit/race-processor.test.ts
src/api/routes.ts         → tests/integration/api-routes.test.ts
```

**Test Structure**
```typescript
import { describe, it, expect } from 'vitest'

describe('calculateMoneyFlow', () => {
  it('should return positive flow when pool increases', () => {
    const result = calculateMoneyFlow(1000, 800)
    expect(result).toBe(200)
  })

  it('should return negative flow when pool decreases', () => {
    const result = calculateMoneyFlow(800, 1000)
    expect(result).toBe(-200)
  })
})
```

---

## Package.json Configuration

All server code must include:
```json
{
  "type": "module",
  "engines": {
    "node": ">=22.0.0"
  }
}
```

---

## tsconfig.json Configuration

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "target": "ES2022",
    "moduleResolution": "node",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  }
}
```

---

## Enforcement

### Validation Commands

**Run Before Every Commit:**
```bash
# 1. TypeScript Compilation (MANDATORY - must pass with 0 errors)
npm run build
# OR for type-check only (no output files)
tsc --noEmit

# 2. ESLint Validation (MANDATORY - must pass with 0 errors, 0 warnings)
npm run lint

# 3. Code Formatting (MANDATORY - auto-fix)
npm run format

# 4. Test Suite (MANDATORY - all tests must pass)
npm test -- --run

# 5. Security Scan (MANDATORY - review before commit)
npm audit
```

### Pre-commit Hook Configuration

**Recommended:** Install Husky + lint-staged for automatic validation

```bash
# Install pre-commit tools
npm install -D husky lint-staged

# Initialize husky
npx husky init

# Add pre-commit hook
echo "npx lint-staged" > .husky/pre-commit
```

**package.json configuration:**
```json
{
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "prettier --write",
      "tsc --noEmit"
    ]
  }
}
```

### CI/CD Pipeline Requirements

**Mandatory Quality Gates:**
```yaml
# .github/workflows/quality-gates.yml (example)
name: Quality Gates

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      # GATE 1: TypeScript Compilation
      - name: TypeScript Build
        run: npm run build

      # GATE 2: ESLint Validation
      - name: ESLint Check
        run: npm run lint

      # GATE 3: Test Suite
      - name: Run Tests
        run: npm test -- --run

      # GATE 4: Security Audit
      - name: Security Scan
        run: npm audit --audit-level=high
```

### Definition of Done Compliance

All code must satisfy the **Definition of Done** before marking a story complete:
- ✅ Zero TypeScript errors
- ✅ Zero ESLint errors/warnings
- ✅ No `any` types (strict enforcement)
- ✅ All tests passing
- ✅ Code formatted with Prettier
- ✅ No high/critical security vulnerabilities

**Reference:** [DEFINITION-OF-DONE.md](./DEFINITION-OF-DONE.md)

### Code Review Checklist

**Reviewers must verify:**
- [ ] TypeScript compilation clean (`npm run build`)
- [ ] ESLint passes without warnings (`npm run lint`)
- [ ] No `any` types in code (search for `: any` and `as any`)
- [ ] Tests cover new/modified code
- [ ] ES modules used exclusively (no `require()`)
- [ ] Functional programming patterns followed
- [ ] Error handling implemented properly
- [ ] Security best practices followed

### Enforcement Timeline

- **Pre-commit Hooks:** Local validation before code is committed
- **CI/CD Pipeline:** Automated validation on push/PR
- **Code Review:** Manual verification by reviewers
- **Story Completion:** Validated against Definition of Done

### Continuous Improvement

- **Standards Review:** Quarterly review of coding standards
- **Team Feedback:** Update based on retrospectives
- **Tool Updates:** Keep ESLint/TypeScript/Prettier versions current
- **Documentation:** This document evolves with team practices

---

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [ES6 Features](https://github.com/lukehoban/es6features)
- [Functional Programming in TypeScript](https://github.com/gcanti/fp-ts)
- [Zod Documentation](https://zod.dev/)

---

**Last Updated:** 2025-10-06
**Maintainer:** Warrick
**Review Cycle:** Quarterly
