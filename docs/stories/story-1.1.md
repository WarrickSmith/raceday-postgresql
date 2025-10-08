# Story 1.1: PostgreSQL 18 Database Configuration & Project Setup

Status: Done

## Story

As a developer,
I want the project structure prepared and PostgreSQL 18 configured for the raceday application,
so that I have a clean foundation ready for building the new backend infrastructure.

## Acceptance Criteria

1. Existing ./server folder renamed to ./server-old for reference
2. New ./server folder created with initial structure
3. Server environment variables configured for PostgreSQL connection
4. Client environment variables updated to point to new backend
5. Database connection verified from Node.js application
6. .env and .env.example files created/updated appropriately
7. Connection credentials documented for existing PostgreSQL 18 instance

## Tasks / Subtasks

- [x] Prepare project structure (AC: 1, 2)
  - [x] Rename existing ./server folder to ./server-old (contains Appwrite functions)
  - [x] Create new ./server folder for Node.js backend
  - [x] Create ./server/src directory structure (src/, tests/, workers/, database/)
  - [x] Initialize package.json in ./server (Node.js 22, TypeScript 5.7+)
  - [x] Note: Project-level .gitignore already handles ./server/.env exclusion
- [x] Create server environment configuration (AC: 3, 6)
  - [x] Create ./server/.env for development
  - [x] Add DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres (default credentials)
  - [x] Add NZTAB_API_URL (from existing server-old config)
  - [x] Add PORT=7000, NODE_ENV=development, LOG_LEVEL=info
  - [x] Add UV_THREADPOOL_SIZE=8, MAX_WORKER_THREADS=3, DB_POOL_MAX=10
  - [x] Create ./server/.env.example template with documentation
- [x] Update client environment configuration (AC: 4, 6)
  - [x] Update ./client/.env.local: Replace NEXT_PUBLIC_APPWRITE_ENDPOINT with backend URL
  - [x] Add NEXT_PUBLIC_API_URL=http://localhost:7000/api
  - [x] Remove obsolete Appwrite variables (APPWRITE_ENDPOINT, PROJECT_ID, API_KEY)
  - [x] Keep existing polling configuration variables (POLLING_ENABLED, POLLING_TIMEOUT, etc.)
  - [x] Update ./client/.env.example to reflect new backend configuration
- [x] Update docker-compose.yml (AC: 3, 4)
  - [x] Note existing docker-compose.yml is for client only (Appwrite-based)
  - [x] Will need new postgres and server services in future story
  - [x] Document that current docker-compose.yml will be replaced/extended
- [x] Verify PostgreSQL 18 instance (AC: 7)
  - [x] Connect to existing PostgreSQL instance (localhost:5432)
  - [x] Verify PostgreSQL version is 18 (Confirmed: 18.0)
  - [x] Verify pgAdmin is accessible (admin@admin.com/admin)
  - [x] Verify pgAgent is installed and running for job scheduling (Confirmed)
  - [x] Document connection details in ./server/.env.example
  - [x] Note: 'raceday' database will be created in Story 1.2
- [x] Test database connectivity (AC: 5)
  - [x] Install pg package in ./server: npm install pg
  - [x] Install dotenv package: npm install dotenv
  - [x] Create simple connection test script: ./server/test-connection.js (ES6 modules)
  - [x] Execute SELECT 1 query to verify connectivity
  - [x] Test connection string format is correct
  - [x] Verify connection succeeds to 'postgres' database (raceday DB created in 1.2)

## Dev Notes

### Architecture Context

- **Reference:** [tech-spec-epic-1.md](../tech-spec-epic-1.md) - Lines 376-421 (Environment Configuration)
- **Reference:** [architecture-specification.md](../architecture-specification.md) - Lines 773-792, 1083-1123
- **Reference:** [PRD-raceday-postgresql-2025-10-05.md](../PRD-raceday-postgresql-2025-10-05.md) - Lines 504-510 (Preparation Phase)
- **Existing Infrastructure:** PostgreSQL 18 instance running with pgAdmin and pgAgent

### Project Structure Migration

**Before (Appwrite-based):**

```
raceday-postgresql/
├── .gitignore                 # Project-level (already handles .env exclusions)
├── docker-compose.yml         # Client-only (Appwrite configuration)
├── server/                    # Appwrite serverless functions
│   ├── .env                   # Appwrite credentials
│   ├── appwrite.json
│   ├── daily-initial-data/
│   ├── daily-meetings/
│   ├── daily-races/
│   ├── enhanced-race-poller/
│   └── master-race-scheduler/
├── client/
│   ├── .env.local             # Appwrite endpoint configuration
│   └── .env.example           # Appwrite template
└── docs/
```

**After (Node.js/PostgreSQL):**

```
raceday-postgresql/
├── .gitignore                 # Project-level (no changes needed)
├── docker-compose.yml         # TO BE UPDATED (add postgres + server services)
├── server-old/                # Appwrite functions (RENAMED - for reference)
│   ├── .env                   # Keep for NZ TAB API credentials
│   └── [all existing Appwrite functions]
├── server/                    # NEW Node.js/PostgreSQL backend
│   ├── src/                   # Source code
│   ├── tests/                 # Unit & integration tests
│   ├── workers/               # Worker threads
│   ├── database/              # Migrations & schema
│   ├── .env                   # Development config (gitignored)
│   ├── .env.example           # Template (committed)
│   ├── package.json           # Node.js 22, TypeScript 5.7+
│   └── test-connection.js     # Database connectivity test
├── client/
│   ├── .env.local             # UPDATED - new backend URL
│   └── .env.example           # UPDATED - new backend template
└── docs/
    └── stories/
```

### Environment Variable Specifications

**./server/.env (New Development Configuration):**

```bash
# Environment
NODE_ENV=development

# Database (PostgreSQL 18 - existing instance)
# Note: 'raceday' database created in Story 1.2
DATABASE_URL=postgresql://raceday_user:your-password@localhost:5432/raceday

# NZ TAB API (copy from ./server-old/.env)
NZTAB_API_URL=https://api.tab.co.nz
NZTAB_API_KEY=your-api-key-here

# Server
PORT=7000
LOG_LEVEL=info

# Performance Tuning
UV_THREADPOOL_SIZE=8
MAX_WORKER_THREADS=3
DB_POOL_MAX=10
```

**./server/.env.example (New Template with Documentation):**

```bash
# Environment
NODE_ENV=development

# Database (PostgreSQL 18 - existing instance)
# Format: postgresql://[user]:[password]@[host]:[port]/[database]
# The 'raceday' database will be created in Story 1.2 via migration script
# For initial testing, you can use the default 'postgres' database
DATABASE_URL=postgresql://raceday_user:your-password@localhost:5432/raceday

# NZ TAB API Configuration
NZTAB_API_URL=https://api.tab.co.nz
NZTAB_API_KEY=your-api-key-here

# Server Configuration
PORT=7000                       # Server port (default: 3000)
LOG_LEVEL=info                  # Logging level: debug, info, warn, error

# Performance Tuning
UV_THREADPOOL_SIZE=8            # Node.js thread pool size
MAX_WORKER_THREADS=3            # Worker threads for CPU-intensive tasks
DB_POOL_MAX=10                  # Max PostgreSQL connections
```

**./client/.env.local (Updated - Remove Appwrite):**

```bash
# Backend API (New Node.js server - replaces Appwrite)
NEXT_PUBLIC_API_URL=http://localhost:7000/api

# REMOVED - Appwrite configuration no longer needed:
# NEXT_PUBLIC_APPWRITE_ENDPOINT=...
# NEXT_PUBLIC_APPWRITE_PROJECT_ID=...
# APPWRITE_API_KEY=...

# Client-side logging (KEEP - still relevant)
NEXT_PUBLIC_LOG_LEVEL=ERROR

# Client polling controls (KEEP - still relevant)
NEXT_PUBLIC_POLLING_ENABLED=true
NEXT_PUBLIC_POLLING_DEBUG_MODE=false
NEXT_PUBLIC_POLLING_TIMEOUT=5000

# Polling monitor UI (KEEP - development feature)
NEXT_PUBLIC_ENABLE_POLLING_MONITOR=false

# Health monitoring (KEEP - still relevant)
NEXT_PUBLIC_ENABLE_HEALTH_MONITORING=true
NEXT_PUBLIC_HEALTH_CHECK_INTERVAL_MS=180000
```

**./client/.env.example (Updated Template):**

```bash
# Backend API Configuration
NEXT_PUBLIC_API_URL=http://localhost:7000/api

# Client-side logging level (DEBUG, INFO, WARN, ERROR, SILENT)
NEXT_PUBLIC_LOG_LEVEL=ERROR

# Client polling controls
NEXT_PUBLIC_POLLING_ENABLED=true
NEXT_PUBLIC_POLLING_DEBUG_MODE=false
NEXT_PUBLIC_POLLING_TIMEOUT=5000

# Enable polling monitor UI (development feature only)
NEXT_PUBLIC_ENABLE_POLLING_MONITOR=false

# Health monitoring configuration
NEXT_PUBLIC_ENABLE_HEALTH_MONITORING=true
NEXT_PUBLIC_HEALTH_CHECK_INTERVAL_MS=180000
```

### Existing .gitignore Coverage

**Project-level .gitignore already handles:**

```gitignore
# Line 39-40: All .env files except .env.example
.env*
!.env.example

# Line 52-54: Server-specific .env files
/server/.env
/server/*/.env
```

**No changes needed to .gitignore** - existing configuration already excludes ./server/.env and includes .env.example files.

### PostgreSQL 18 Instance Details

**Existing Infrastructure:**

- PostgreSQL 18 running in Docker (or direct install)
- Default database: `postgres`
- Management tools: pgAdmin (web-based administration)
- Job scheduling: pgAgent (cron-like scheduling)

**Database Creation Strategy:**

- Story 1.1: Verify connection to existing PostgreSQL instance
- Story 1.2: Create 'raceday' database via migration script
- Story 1.2: Create database user 'raceday_user' with permissions

**Connection Test Script (./server/test-connection.js):**

```javascript
require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function testConnection() {
  try {
    const result = await pool.query('SELECT 1 as test')
    console.log('✅ Database connection successful:', result.rows[0])
    await pool.end()
    process.exit(0)
  } catch (error) {
    console.error('❌ Database connection failed:', error.message)
    process.exit(1)
  }
}

testConnection()
```

### Migration from Appwrite

**server-old/ Reference:**

- Contains Appwrite serverless functions
- Source of business logic for extraction:
  - Money flow calculations (enhanced-race-poller/)
  - Polling frequency algorithms (master-race-scheduler/)
  - NZ TAB API integration patterns
  - Data transformation rules
- Preserve NZTAB_API_URL and NZTAB_API_KEY from ./server-old/.env

**docker-compose.yml Update (Future Story):**

- Current: Client-only deployment (Appwrite backend)
- Future: Add postgres service + server service
- Keep client service for development
- Story 1.5 will handle complete Docker configuration

### References

- [Source: tech-spec-epic-1.md#Environment Configuration] - Environment variables schema
- [Source: architecture-specification.md#Directory Structure] - Appendix B complete structure
- [Source: PRD-raceday-postgresql-2025-10-05.md#Preparation Phase] - Rename server → server-old
- [Source: epic-stories-2025-10-05.md#Story 1.1] - PostgreSQL Database Setup criteria
- [Source: .gitignore] - Lines 39-40, 52-54 (env file exclusions already configured)

## Change Log

| Date       | Version | Description                                           | Author  |
| ---------- | ------- | ----------------------------------------------------- | ------- |
| 2025-10-06 | 0.1     | Initial draft                                         | warrick |
| 2025-10-06 | 1.0     | Story completed - All ACs satisfied, tests passing    | Claude  |
| 2025-10-06 | 1.1     | Senior Developer Review notes appended - APPROVED     | Claude  |

## Dev Agent Record

### Context Reference

- [story-context-1.1.xml](../story-context-1.1.xml) - Generated 2025-10-06

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log

**Implementation Approach:**
1. Renamed existing server/ to server-old/ to preserve Appwrite functions for reference
2. Created new server/ directory with modern ES6+ module structure
3. Configured ES modules in package.json with "type": "module"
4. Updated all environment files to use standard PostgreSQL defaults (postgres/postgres)
5. Created comprehensive coding standards documentation per modern ES6+ requirements
6. Implemented test suite using Vitest with ES6 imports
7. Verified PostgreSQL 18.0 connection and pgAgent installation

**Technical Decisions:**
- ES Modules (ESM): All code uses import/export syntax (not CommonJS require)
- Functional Programming: Arrow functions, async/await, const/let only
- TypeScript 5.7+ with strict mode and Node.js 22 LTS
- Vitest for testing (modern, fast, ES module native)
- Standard PostgreSQL defaults for local development

**Challenges Resolved:**
- Fixed vitest/coverage version mismatch (used @vitest/coverage-v8@2.1.9)
- Corrected timezone test to handle case-sensitive column names
- Updated architecture docs with comprehensive coding standards section

### Completion Notes List

**All Acceptance Criteria Satisfied:**
1. ✅ ./server renamed to ./server-old
2. ✅ New ./server created with src/, tests/, workers/, database/ structure
3. ✅ Server .env configured with DATABASE_URL and all required variables
4. ✅ Client .env.local updated to point to new backend (http://localhost:7000/api)
5. ✅ Database connection verified successfully (PostgreSQL 18.0)
6. ✅ .env and .env.example files created with comprehensive documentation
7. ✅ PostgreSQL credentials documented (postgres/postgres, pgAdmin admin@admin.com/admin)

**Additional Enhancements:**
- Created comprehensive coding standards document (docs/CODING-STANDARDS.md)
- Updated architecture specification with ES6+ coding standards section
- Created TypeScript configuration (tsconfig.json) with strict mode
- Implemented test suite with 14 passing tests (unit + integration)
- Created vitest.config.js for test configuration
- Updated package.json with modern ES module configuration

**Test Results:**
- All tests passing: 14/14 ✅
- Test coverage: Unit (7 tests) + Integration (7 tests)
- Database connectivity verified
- PostgreSQL version confirmed: 18.0
- pgAgent installation confirmed

### File List

**New Files Created:**
- server/package.json - ES module configuration with Node.js 22
- server/tsconfig.json - TypeScript 5.7+ strict configuration
- server/vitest.config.js - Test framework configuration
- server/.env - Development environment variables
- server/.env.example - Environment variable template with documentation
- server/test-connection.js - Database connectivity test (ES6 modules)
- server/tests/unit/environment-config.test.js - Environment validation tests
- server/tests/integration/database-connection.test.js - Database integration tests
- docs/CODING-STANDARDS.md - Comprehensive ES6+ coding standards

**Modified Files:**
- client/.env.local - Removed Appwrite, added backend API URL
- client/.env.example - Updated template for new backend
- docker-compose.yml - Added note about future postgres/server services
- docs/architecture-specification.md - Added Coding Standards section

**Directories Created:**
- server-old/ - Renamed from server/ (Appwrite functions preserved)
- server/src/ - Source code directory
- server/tests/ - Test files directory
- server/tests/unit/ - Unit tests
- server/tests/integration/ - Integration tests
- server/workers/ - Worker threads directory
- server/database/ - Database migrations directory

**Dependencies Installed:**
- pg@^8.13.1 - PostgreSQL client
- dotenv@^16.4.5 - Environment configuration
- vitest@^2.0.0 - Test framework
- @vitest/coverage-v8@2.1.9 - Code coverage

---

## Senior Developer Review (AI)

**Reviewer:** warrick
**Date:** 2025-10-06
**Outcome:** ✅ **APPROVED**

### Summary

Story 1.1 successfully establishes the foundation for the PostgreSQL migration with exemplary adherence to modern ES6+ standards, comprehensive test coverage, and thorough documentation. All 7 acceptance criteria are satisfied with high-quality implementation. The code demonstrates best practices in functional programming, type safety, and test-driven development.

**Key Strengths:**
- Perfect ES6 module adoption (import/export throughout)
- Comprehensive coding standards documentation created proactively
- 14/14 tests passing with excellent coverage
- Architecture documentation updated with standards
- Clean separation: server-old preserved, new server structure organized

**Minor Enhancement Opportunities Identified:** 3 low-severity recommendations for future stories

### Key Findings

#### High Severity
None ✅

#### Medium Severity
None ✅

#### Low Severity

1. **[Low] Add TypeScript type annotations to test-connection.js**
   - **Location:** `server/test-connection.js:10-34`
   - **Issue:** Script uses `.js` extension without explicit TypeScript types
   - **Recommendation:** Rename to `.ts` and add explicit types for error handling
   - **Rationale:** Aligns with strict TypeScript policy in coding standards

2. **[Low] Consider connection pool lifecycle management**
   - **Location:** `server/test-connection.js:6-8`
   - **Issue:** Basic pool configuration without error handling hooks
   - **Recommendation:** Add pool error handlers in future database utilities
   - **Rationale:** Production readiness for Story 1.2+

3. **[Low] Environment variable validation at runtime**
   - **Location:** `server/.env` and test files
   - **Issue:** No runtime validation schema (Zod) yet implemented
   - **Recommendation:** Implement in Story 1.6 per tech spec reference
   - **Rationale:** Fail-fast validation prevents runtime errors

### Acceptance Criteria Coverage

| AC | Status | Evidence | Notes |
|----|--------|----------|-------|
| 1 | ✅ | `server-old/` exists with Appwrite functions | Preserved for business logic extraction |
| 2 | ✅ | `server/` with `src/`, `tests/`, `workers/`, `database/` | Clean structure per architecture spec |
| 3 | ✅ | `server/.env` with DATABASE_URL, all vars | PostgreSQL connection configured |
| 4 | ✅ | `client/.env.local` updated to `http://localhost:7000/api` | Appwrite removed, backend API added |
| 5 | ✅ | Connection verified: PostgreSQL 18.0, pgAgent confirmed | `test-connection.js` executed successfully |
| 6 | ✅ | `.env` and `.env.example` with documentation | Comprehensive inline docs added |
| 7 | ✅ | Credentials documented: postgres/postgres, pgAdmin admin@admin.com | Default credentials specified |

**Coverage:** 7/7 (100%) ✅

### Test Coverage and Gaps

**Test Suite Summary:**
- **Total Tests:** 14 (100% passing)
- **Unit Tests:** 7 (environment configuration validation)
- **Integration Tests:** 7 (database connectivity, version check, pgAgent)
- **Coverage:** Excellent for setup story scope

**Test Quality:**
- ✅ Parameterized queries tested (SQL injection prevention)
- ✅ Connection pool concurrency tested (5 parallel queries)
- ✅ PostgreSQL version assertion (18.x)
- ✅ UTF-8 encoding verification
- ✅ Environment variable format validation

**Gaps (Future Stories):**
- E2E tests (Story 1.4+)
- Error scenario tests (connection failures, timeouts)
- Migration rollback tests (Story 1.2)

**Recommendation:** Test coverage is appropriate for foundational setup story. Expand in Stories 1.2-1.4.

### Architectural Alignment

**Alignment with Architecture Specification:**
- ✅ ES Modules enabled (`"type": "module"` in package.json)
- ✅ Node.js 22 LTS specified (`"engines": {"node": ">=22.0.0"}`)
- ✅ TypeScript 5.7+ configured with strict mode
- ✅ Directory structure matches Appendix B (architecture-specification.md:1083-1123)
- ✅ Environment variables match spec (architecture-specification.md:773-792)

**Alignment with Tech Spec (Epic 1):**
- ✅ PORT=7000 per spec (tech-spec-epic-1.md:376-421)
- ✅ PostgreSQL 18 verified (not 18-alpine yet, Docker in Story 1.5)
- ✅ Connection pool placeholder (full implementation in Story 1.2)
- ✅ .env.example template matches Zod schema structure

**Deviations:**
- None identified ✅

### Security Notes

**Secrets Management:**
- ✅ `.env` files properly excluded in `.gitignore` (lines 39-40, 52-54)
- ✅ `.env.example` committed with placeholder values (not actual credentials)
- ✅ PostgreSQL credentials use defaults (acceptable for local development)
- ⚠️ **[Low]** Production deployment should use secrets manager (noted for Story 1.5)

**Database Security:**
- ✅ Parameterized queries used in tests (SQL injection prevention)
- ✅ Connection string validation in environment tests
- ✅ pgAgent verified (job scheduling security in future stories)

**Dependency Security:**
- ✅ pg@^8.13.1 - No known high/critical CVEs
- ✅ dotenv@^16.4.5 - Secure version
- ⚠️ **[Info]** `npm audit` shows 5 moderate vulnerabilities (dev dependencies only)
- **Recommendation:** Run `npm audit fix` in Story 1.2

### Best-Practices and References

**ES6+ Standards:**
- ✅ Excellent adherence to [docs/CODING-STANDARDS.md](../CODING-STANDARDS.md)
- ✅ Arrow functions, async/await, const/let used consistently
- ✅ Template literals for string interpolation
- ✅ Destructuring in test files (`const { Pool } = pg`)

**Node.js 22 Best Practices:**
- ✅ ES modules native support (no --experimental-modules flag needed)
- ✅ Top-level await available (used in test files)
- Reference: [Node.js 22 ES Modules](https://nodejs.org/docs/latest-v22.x/api/esm.html)

**PostgreSQL Best Practices:**
- ✅ Connection pooling setup (pg.Pool)
- ✅ Graceful shutdown (`pool.end()`)
- Reference: [node-postgres Best Practices](https://node-postgres.com/features/pooling)

**Vitest Best Practices:**
- ✅ `beforeAll`/`afterAll` for test fixtures
- ✅ Descriptive test names (`should verify PostgreSQL version is 18`)
- Reference: [Vitest API](https://vitest.dev/api/)

**Documentation Standards:**
- ✅ Comprehensive inline comments in `.env.example`
- ✅ Change log maintained with version tracking
- ✅ Dev Agent Record populated with implementation notes

### Action Items

**For Story 1.2 (Database Schema):**
1. **[Low Priority]** Convert `test-connection.js` to TypeScript (`.ts` extension)
   - Add explicit type annotations for Pool, error handling
   - Verify with `tsc --noEmit`

2. **[Low Priority]** Run `npm audit fix` to address moderate dev dependency vulnerabilities
   - Review breaking changes before applying
   - Update package-lock.json

3. **[Low Priority]** Implement Zod validation schema for environment variables (per tech spec Epic 1)
   - Create `src/config/env-schema.ts`
   - Validate on application startup
   - Fail-fast with clear error messages

**For Future Stories (1.5+):**
4. **[Info]** Plan secrets management strategy for production (AWS Secrets Manager, Vault, etc.)
5. **[Info]** Add connection pool error handling (`pool.on('error')`) in database utilities

---

**Review Outcome:** ✅ **APPROVED** - No blocking issues. Story ready for integration. Minor enhancements deferred to appropriate future stories.
