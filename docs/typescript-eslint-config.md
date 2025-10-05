# TypeScript & ESLint Configuration

**Project:** Raceday PostgreSQL Migration
**Node.js Version:** 22 LTS (minimum)
**TypeScript Version:** 5.7+
**Policy:** Strict TypeScript, Zero `any` types, Zero lint errors

---

## TypeScript Configuration (tsconfig.json)

```json
{
  "compilerOptions": {
    /* Language and Environment */
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",

    /* Type Checking - STRICT MODE */
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "alwaysStrict": true,

    /* Additional Checks */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,

    /* Emit */
    "outDir": "./dist",
    "rootDir": "./src",
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,
    "removeComments": true,
    "importHelpers": true,
    "downlevelIteration": true,

    /* Interop Constraints */
    "isolatedModules": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "allowSyntheticDefaultImports": true,

    /* Skip Lib Check (for performance) */
    "skipLibCheck": true,

    /* Experimental */
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,

    /* Advanced */
    "resolveJsonModule": true,
    "allowJs": false,
    "checkJs": false
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.spec.ts",
    "**/*.test.ts"
  ],
  "ts-node": {
    "require": ["tsconfig-paths/register"],
    "transpileOnly": true,
    "files": true,
    "compilerOptions": {
      "module": "CommonJS"
    }
  }
}
```

---

## ESLint Configuration (.eslintrc.json)

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2023,
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "plugins": [
    "@typescript-eslint",
    "import"
  ],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/strict-type-checked",
    "plugin:@typescript-eslint/stylistic-type-checked",
    "airbnb-typescript/base"
  ],
  "rules": {
    /* TypeScript Specific - NO ANY TYPES */
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-return": "error",
    "@typescript-eslint/no-unsafe-argument": "error",

    /* Strict Type Safety */
    "@typescript-eslint/strict-boolean-expressions": "error",
    "@typescript-eslint/no-unnecessary-condition": "error",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    "@typescript-eslint/prefer-optional-chain": "error",
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/consistent-type-imports": ["error", {
      "prefer": "type-imports",
      "fixStyle": "inline-type-imports"
    }],

    /* Code Quality */
    "@typescript-eslint/naming-convention": [
      "error",
      {
        "selector": "default",
        "format": ["camelCase"]
      },
      {
        "selector": "variable",
        "format": ["camelCase", "UPPER_CASE"]
      },
      {
        "selector": "parameter",
        "format": ["camelCase"],
        "leadingUnderscore": "allow"
      },
      {
        "selector": "typeLike",
        "format": ["PascalCase"]
      },
      {
        "selector": "enumMember",
        "format": ["UPPER_CASE"]
      },
      {
        "selector": "interface",
        "format": ["PascalCase"],
        "custom": {
          "regex": "^I[A-Z]",
          "match": false
        }
      }
    ],

    /* Performance */
    "@typescript-eslint/prefer-readonly": "error",
    "@typescript-eslint/prefer-readonly-parameter-types": "off",

    /* Best Practices */
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/promise-function-async": "error",
    "@typescript-eslint/require-await": "error",

    /* Imports */
    "import/order": ["error", {
      "groups": [
        "builtin",
        "external",
        "internal",
        ["parent", "sibling"],
        "index"
      ],
      "newlines-between": "always",
      "alphabetize": {
        "order": "asc",
        "caseInsensitive": true
      }
    }],
    "import/no-default-export": "error",
    "import/prefer-default-export": "off",

    /* General */
    "no-console": ["error", { "allow": ["warn", "error"] }],
    "no-debugger": "error",
    "prefer-const": "error",
    "no-var": "error",
    "eqeqeq": ["error", "always"],
    "curly": ["error", "all"],
    "brace-style": ["error", "1tbs"],
    "max-len": ["error", { "code": 120, "ignoreStrings": true, "ignoreTemplateLiterals": true }]
  },
  "overrides": [
    {
      "files": ["*.test.ts", "*.spec.ts"],
      "rules": {
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-explicit-any": "off"
      }
    }
  ],
  "ignorePatterns": [
    "dist/",
    "node_modules/",
    "coverage/",
    "*.js"
  ]
}
```

---

## Prettier Configuration (.prettierrc.json)

```json
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf",
  "bracketSpacing": true,
  "bracketSameLine": false
}
```

---

## Package.json Scripts

```json
{
  "name": "raceday-postgresql-server",
  "version": "1.0.0",
  "description": "High-performance race data processing server",
  "engines": {
    "node": ">=22.0.0",
    "npm": ">=10.0.0"
  },
  "type": "module",
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\"",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:perf": "jest --testPathPattern=performance",
    "validate": "npm run type-check && npm run lint && npm run format:check && npm test",
    "precommit": "npm run validate"
  },
  "dependencies": {
    "express": "^4.21.2",
    "pg": "^8.13.1",
    "axios": "^1.7.9",
    "node-cron": "^3.0.3",
    "pino": "^9.5.0",
    "dotenv": "^16.4.7",
    "helmet": "^8.0.0",
    "compression": "^1.7.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "@types/node": "^22.10.2",
    "@types/express": "^5.0.0",
    "@types/pg": "^8.11.10",
    "@types/compression": "^1.7.5",
    "@typescript-eslint/eslint-plugin": "^8.19.1",
    "@typescript-eslint/parser": "^8.19.1",
    "eslint": "^9.17.0",
    "eslint-config-airbnb-typescript": "^18.0.0",
    "eslint-plugin-import": "^2.31.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.14",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "nodemon": "^3.1.9",
    "prettier": "^3.4.2"
  }
}
```

---

## Type Safety Patterns

### 1. Replace `any` with Proper Types

**❌ NEVER DO THIS:**
```typescript
function processData(data: any): any {
  return data.value;
}
```

**✅ DO THIS:**
```typescript
import { type z } from 'zod';

const RaceDataSchema = z.object({
  raceId: z.string(),
  name: z.string(),
  entrants: z.array(z.object({
    id: z.string(),
    name: z.string(),
    odds: z.number(),
  })),
});

type RaceData = z.infer<typeof RaceDataSchema>;

function processData(data: unknown): RaceData {
  return RaceDataSchema.parse(data);
}
```

### 2. Use `unknown` for External Data

**✅ NZ TAB API Response:**
```typescript
import axios, { type AxiosResponse } from 'axios';

async function fetchRaceData(raceId: string): Promise<RaceData> {
  const response: AxiosResponse<unknown> = await axios.get(
    `${process.env.NZTAB_API_URL}/races/${raceId}`
  );

  // Validate with Zod
  return RaceDataSchema.parse(response.data);
}
```

### 3. Strict Null Checks

**✅ Handle undefined/null explicitly:**
```typescript
interface Entrant {
  id: string;
  winOdds: number | null;  // Explicit nullable
}

function getOdds(entrant: Entrant): number {
  if (entrant.winOdds === null) {
    throw new Error(`No odds available for entrant ${entrant.id}`);
  }
  return entrant.winOdds;
}
```

### 4. Database Query Types

**✅ Type-safe PostgreSQL queries:**
```typescript
import { type Pool, type QueryResult } from 'pg';

interface RaceRow {
  race_id: string;
  name: string;
  race_number: number;
  start_time: Date;
  status: string;
  meeting_id: string;
}

async function getRace(pool: Pool, raceId: string): Promise<RaceRow> {
  const result: QueryResult<RaceRow> = await pool.query<RaceRow>(
    'SELECT * FROM races WHERE race_id = $1',
    [raceId]
  );

  const race = result.rows[0];
  if (!race) {
    throw new Error(`Race not found: ${raceId}`);
  }

  return race;
}
```

### 5. Worker Thread Types

**✅ Type-safe worker communication:**
```typescript
import { Worker, type MessagePort } from 'worker_threads';

interface WorkerInput {
  type: 'transform';
  raceId: string;
  rawData: RaceData;
}

interface WorkerOutput {
  type: 'success' | 'error';
  raceId: string;
  transformedData?: TransformedRaceData;
  error?: string;
}

function createWorker(): Worker {
  const worker = new Worker('./transformWorker.ts');

  worker.on('message', (message: unknown) => {
    // Validate message type
    if (!isWorkerOutput(message)) {
      throw new Error('Invalid worker message');
    }
    handleWorkerOutput(message);
  });

  return worker;
}

function isWorkerOutput(value: unknown): value is WorkerOutput {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'raceId' in value
  );
}
```

### 6. Express Request/Response Types

**✅ Type-safe API handlers:**
```typescript
import { type Request, type Response, type NextFunction } from 'express';

interface GetRacesQuery {
  meetingId: string;
}

interface GetRacesResponse {
  races: RaceRow[];
}

async function getRacesHandler(
  req: Request<object, GetRacesResponse, object, GetRacesQuery>,
  res: Response<GetRacesResponse>,
  next: NextFunction
): Promise<void> {
  try {
    const { meetingId } = req.query;

    if (!meetingId) {
      res.status(400).json({ error: 'meetingId required' } as any);
      return;
    }

    const races = await getRacesByMeeting(meetingId);
    res.json({ races });
  } catch (error) {
    next(error);
  }
}
```

---

## Zod Runtime Validation

### Why Zod?

Zod provides runtime type validation, replacing `any` types with safe validation:

**Example: NZ TAB API Response Validation**

```typescript
import { z } from 'zod';

// Define schema
const EntrantSchema = z.object({
  id: z.string(),
  name: z.string(),
  runnerNumber: z.number().int().positive(),
  winOdds: z.number().nullable(),
  placeOdds: z.number().nullable(),
  isScratched: z.boolean(),
});

const RaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  raceNumber: z.number().int().positive(),
  startTime: z.string().datetime(),
  status: z.enum(['upcoming', 'in_progress', 'completed', 'abandoned']),
  entrants: z.array(EntrantSchema),
});

// Infer TypeScript types from schema
type Entrant = z.infer<typeof EntrantSchema>;
type Race = z.infer<typeof RaceSchema>;

// Use in API client
async function fetchRaceFromNZTAB(raceId: string): Promise<Race> {
  const response = await axios.get<unknown>(`/api/races/${raceId}`);

  // Runtime validation - throws if invalid
  return RaceSchema.parse(response.data);
}

// Partial validation
const PartialRaceSchema = RaceSchema.partial();

// Safe parsing (returns success/error object)
function parseRaceData(data: unknown): Race | null {
  const result = RaceSchema.safeParse(data);

  if (!result.success) {
    console.error('Validation failed:', result.error);
    return null;
  }

  return result.data;
}
```

---

## Pre-commit Validation

### Git Hooks (Husky)

**Additional Dependencies:**
```json
{
  "husky": "^9.1.7",
  "lint-staged": "^15.2.11"
}
```

**Setup Script:**
```bash
npx husky init
echo "npm run precommit" > .husky/pre-commit
```

**.lintstagedrc.json:**
```json
{
  "*.ts": [
    "eslint --fix",
    "prettier --write",
    "bash -c 'tsc --noEmit'"
  ]
}
```

---

## CI/CD Validation Pipeline

### GitHub Actions (.github/workflows/validate.yml)

```yaml
name: Validate

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  validate:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [22.x]

    steps:
    - uses: actions/checkout@v4

    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}

    - name: Install dependencies
      run: npm ci

    - name: Type check
      run: npm run type-check

    - name: Lint
      run: npm run lint

    - name: Format check
      run: npm run format:check

    - name: Run tests
      run: npm test

    - name: Build
      run: npm run build
```

---

## Error Handling Patterns

### Type-safe Error Classes

```typescript
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

class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly query: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// Usage
async function processRace(raceId: string): Promise<void> {
  try {
    // ... processing logic
  } catch (error) {
    if (error instanceof Error) {
      throw new RaceProcessingError(
        `Failed to process race ${raceId}`,
        raceId,
        error
      );
    }
    throw error;
  }
}
```

---

## Validation Checklist

### Pre-deployment Validation

- [ ] `npm run type-check` - Zero TypeScript errors
- [ ] `npm run lint` - Zero ESLint errors
- [ ] `npm run format:check` - All files formatted
- [ ] `npm test` - All tests passing
- [ ] `npm run build` - Build succeeds
- [ ] No `any` types in codebase (search: `grep -r ": any" src/`)
- [ ] All external data validated with Zod
- [ ] All async functions have proper error handling

### Code Review Checklist

- [ ] No `@ts-ignore` or `@ts-expect-error` comments
- [ ] All function parameters typed (no implicit any)
- [ ] All API responses validated
- [ ] Database queries use typed interfaces
- [ ] Worker thread messages typed
- [ ] Error handling uses custom error classes
- [ ] No `console.log` in production code (use logger)

---

## Migration from server-old

### Finding and Replacing `any` Types

```bash
# Find all any types
grep -r "any" server-old/src/

# Common patterns to replace:
# 1. External API responses → Zod schemas
# 2. Database results → typed interfaces
# 3. Worker messages → typed message contracts
# 4. Express handlers → properly typed
```

### Strategy:

1. **Extract business logic** (money flow calculations)
2. **Define types first** (create interfaces/schemas)
3. **Validate at boundaries** (API responses, DB queries)
4. **Build incrementally** (one module at a time)
5. **Validate continuously** (run lint/type-check frequently)

---

## Summary

**Requirements:**
- ✅ Node.js 22 LTS minimum
- ✅ TypeScript 5.7+ with strict mode
- ✅ Zero `any` types allowed
- ✅ Zero lint errors policy
- ✅ All external data validated with Zod
- ✅ Pre-commit hooks enforce standards
- ✅ CI/CD validates on every PR

**Benefits:**
- 🛡️ Type safety prevents runtime errors
- 🚀 Better IDE autocomplete and refactoring
- 📚 Self-documenting code
- 🐛 Catch bugs at compile time
- 🔒 Secure against invalid data

---

**Next Steps:**
1. Set up project with provided configs
2. Install dependencies (Node 22 compatible versions)
3. Configure TypeScript strict mode
4. Set up ESLint and Prettier
5. Add Zod for runtime validation
6. Implement pre-commit hooks
