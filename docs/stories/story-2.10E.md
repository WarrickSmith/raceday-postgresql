# Story 2.10E: Client Application PostgreSQL Migration

Status: Ready

## Story

As a **developer**,
I want **the client application to consume data from the PostgreSQL REST API using snake_case field naming**,
so that **the client can integrate with the new PostgreSQL backend without transformation overhead**.

## Acceptance Criteria

1. **Remove Appwrite Dependencies**: Remove Appwrite SDK packages and related client library files
2. **Replace API Layer**: Replace all Appwrite SDK calls with HTTP fetch calls to PostgreSQL REST API
3. **Update Type Interfaces**: Update all TypeScript interfaces to use snake_case matching PostgreSQL schema
4. **Update Components**: Update all React components to use snake_case props and state
5. **Update Tests**: Update test suite (fixtures, mocks, assertions) to use snake_case
6. **No Runtime Errors**: Application runs without field name mismatch errors
7. **Data Display**: All UI components correctly display data from PostgreSQL API

## Tasks / Subtasks

- [ ] Task 1: Remove Appwrite Dependencies (AC: 1)

  - [ ] Subtask 1.1: Remove `appwrite` package from `client/package.json`
  - [ ] Subtask 1.2: Remove `node-appwrite` package from `client/package.json`
  - [ ] Subtask 1.3: Delete `client/src/lib/appwrite-client.ts`
  - [ ] Subtask 1.4: Delete `client/src/lib/appwrite-server.ts`
  - [ ] Subtask 1.5: Delete `client/src/app/api/race/[id]/appwriteTypes.ts`
  - [ ] Subtask 1.6: Run `npm install` to update lockfile

- [ ] Task 2: Create HTTP Client Utility (AC: 2)

  - [ ] Subtask 2.1: Create `client/src/lib/api-client.ts` with fetch wrapper
  - [ ] Subtask 2.2: Add environment variable support for API base URL
  - [ ] Subtask 2.3: Add error handling and logging utilities
  - [ ] Subtask 2.4: Add TypeScript types for API responses
  - [ ] Subtask 2.5: Add request/response interceptors if needed

- [ ] Task 3: Update Type Interfaces to snake_case (AC: 3)

  - [ ] Subtask 3.1: Update `client/src/types/meetings.ts` - Meeting, Race, Entrant interfaces
  - [ ] Subtask 3.2: Update `client/src/types/racePools.ts` - RacePoolData and related types
  - [ ] Subtask 3.3: Update `client/src/types/moneyFlow.ts` - MoneyFlowHistory types
  - [ ] Subtask 3.4: Update `client/src/types/pollingMetrics.ts` - PollingMetrics types
  - [ ] Subtask 3.5: Remove Appwrite-specific fields (`$id`, `$createdAt`, `$updatedAt`)
  - [ ] Subtask 3.6: Update any remaining type files (alerts, enhancedGrid, etc.)

- [ ] Task 4: Replace API Layer with fetch calls (AC: 2)

  - [ ] Subtask 4.1: Update `client/src/app/api/meetings/[meetingId]/races/route.ts`
  - [ ] Subtask 4.2: Update `client/src/app/api/race/[id]/route.ts`
  - [ ] Subtask 4.3: Update `client/src/app/api/race/[id]/basic/route.ts`
  - [ ] Subtask 4.4: Update `client/src/app/api/race/[id]/money-flow-timeline/route.ts`
  - [ ] Subtask 4.5: Update `client/src/app/api/race/[id]/pools/route.ts`
  - [ ] Subtask 4.6: Update `client/src/app/api/races/upcoming/route.ts`
  - [ ] Subtask 4.7: Update `client/src/app/api/next-scheduled-race/route.ts`
  - [ ] Subtask 4.8: Update `client/src/server/meetings-data.ts`
  - [ ] Subtask 4.9: Update remaining API routes (~5 files)

- [ ] Task 5: Update React Components (AC: 4)

  - [ ] Subtask 5.1: Update meeting and race display components to use snake_case props
  - [ ] Subtask 5.2: Update entrant display components (runner cards, grids) to use snake_case
  - [ ] Subtask 5.3: Update money flow and odds display components to use snake_case
  - [ ] Subtask 5.4: Update race pools and dividends components to use snake_case
  - [ ] Subtask 5.5: Update navigation and utility components to use snake_case
  - [ ] Subtask 5.6: Update any chart/visualization components to use snake_case

- [ ] Task 6: Update Test Suite (AC: 5, 6)

  - [ ] Subtask 6.1: Update unit test fixtures to use snake_case
  - [ ] Subtask 6.2: Update component test assertions to expect snake_case
  - [ ] Subtask 6.3: Update integration test mocks to return snake_case
  - [ ] Subtask 6.4: Run full test suite and fix any remaining failures
  - [ ] Subtask 6.5: Add regression tests for snake_case field access

- [ ] Task 7: Update Environment and Configuration (AC: 2)

  - [ ] Subtask 7.1: Update `.env.example` with PostgreSQL API base URL
  - [ ] Subtask 7.2: Remove Appwrite environment variables
  - [ ] Subtask 7.3: Update documentation for environment setup
  - [ ] Subtask 7.4: Update deployment configuration if needed

- [ ] Task 8: Quality Assurance (AC: 6, 7)
  - [ ] Subtask 8.1: Run `npm run lint` - verify zero lint errors
  - [ ] Subtask 8.2: Run `npm run build` - verify successful build
  - [ ] Subtask 8.3: Run `npm run test -- --run` - verify all tests pass
  - [ ] Subtask 8.4: Manual testing - verify all meetings/races display
  - [ ] Subtask 8.5: Manual testing - verify all entrant data displays
  - [ ] Subtask 8.6: Manual testing - verify money flow and odds display
  - [ ] Subtask 8.7: Check browser console for field name errors

## Dev Notes

### Context & Background

This story implements **Client Application PostgreSQL Migration** as part of the Story 2.10 split sequence. It completes the migration from Appwrite to PostgreSQL by updating the client application to consume data from the new PostgreSQL-backed REST API.

**Story 2.10 Split Sequence:**

- **Story 2.10A** (Code Quality Foundation) - ✅ COMPLETE - Server migrated to snake_case
- **Story 2.10B** (Database Infrastructure & Partitions) - ✅ COMPLETE
- **Story 2.10C** (Data Pipeline Processing) - ✅ COMPLETE
- **Story 2.10D** (Integration & Performance Validation) - ✅ COMPLETE - REST API endpoints built
- **Story 2.10E** (Client Application PostgreSQL Migration) - ← THIS STORY

**Key Migration Objectives:**

1. **Remove Appwrite SDK**: Replace Appwrite client libraries with standard HTTP fetch
2. **API Integration**: Call PostgreSQL REST API endpoints (`/api/meetings`, `/api/races`, `/api/entrants`)
3. **Type System Migration**: Update all TypeScript interfaces to snake_case matching PostgreSQL schema
4. **Component Updates**: Update all React components to access snake_case properties
5. **Zero Runtime Errors**: Ensure application runs without field name mismatch errors

**Strategic Importance:**

This story is the **final client-side migration step** required before Epic 2 completion. It ensures:

- Client calls the new PostgreSQL REST API instead of Appwrite
- Client and server use consistent snake_case naming conventions
- No Appwrite dependencies remain in the client codebase
- TypeScript catches all field name mismatches at compile time
- Clean separation between PostgreSQL and legacy Appwrite contracts

### Architecture Alignment

**Architecture Decision** [Source: Story 2.10D validation, security best practices]

**✅ Correct Approach: REST API with HTTP fetch**

- Client uses standard `fetch()` or `axios` to call server REST API
- Server already has `/api/meetings`, `/api/races`, `/api/entrants` endpoints (Story 2.10D)
- No database credentials exposed to browser
- Follows standard three-tier architecture (Client → API → Database)

**❌ Rejected Approach: Direct PostgreSQL client libraries**

- Would expose database credentials in browser (security risk)
- Violates separation of concerns
- Not compatible with serverless/edge deployments

**API Endpoints (Built in Story 2.10D):**

```typescript
// Server REST API (Express on port 3000)
GET /api/meetings?date=2025-10-21&raceType=thoroughbred
GET /api/races?meetingId=NZ-Ellerslie-20251021
GET /api/entrants?raceId=NZ-Ellerslie-20251021-R1
```

**Response Format (snake_case):**

```typescript
// Meetings endpoint response
{
  "meeting_id": "NZ-Ellerslie-20251021",
  "meeting_name": "Ellerslie",
  "country": "NZ",
  "race_type": "thoroughbred",
  "date": "2025-10-21",
  "status": "active"
}

// Races endpoint response
{
  "race_id": "NZ-Ellerslie-20251021-R1",
  "race_number": 1,
  "name": "Race 1",
  "start_time": "2025-10-21T13:00:00.000+13:00",  // Pacific/Auckland
  "meeting_id": "NZ-Ellerslie-20251021",
  "status": "open"
}

// Entrants endpoint response
{
  "entrant_id": "entrant-123",
  "runner_number": 1,
  "name": "Runner Name",
  "fixed_win_odds": 3.5,
  "fixed_place_odds": 1.8,
  "is_scratched": false,
  "race_id": "NZ-Ellerslie-20251021-R1"
}
```

**Field Naming Convention Migration:**

| Appwrite (camelCase)     | PostgreSQL (snake_case)                 | Notes                           |
| ------------------------ | --------------------------------------- | ------------------------------- |
| `$id`                    | `meeting_id` / `race_id` / `entrant_id` | Remove Appwrite metadata fields |
| `$createdAt`             | `created_at`                            | Standard timestamps             |
| `$updatedAt`             | `updated_at`                            | Standard timestamps             |
| `meetingId`              | `meeting_id`                            | Consistent snake_case           |
| `meetingName`            | `meeting_name`                          | Consistent snake_case           |
| `raceType`               | `race_type`                             | Consistent snake_case           |
| `raceNumber`             | `race_number`                           | Consistent snake_case           |
| `startTime`              | `start_time`                            | Consistent snake_case           |
| `actualStart`            | `actual_start`                          | Consistent snake_case           |
| `runnerNumber`           | `runner_number`                         | Consistent snake_case           |
| `fixedWinOdds`           | `fixed_win_odds`                        | Consistent snake_case           |
| `fixedPlaceOdds`         | `fixed_place_odds`                      | Consistent snake_case           |
| `isScratched`            | `is_scratched`                          | Consistent snake_case           |
| `meeting` (relationship) | `meeting_id` (foreign key)              | Direct ID reference             |

### Dependencies & Completion Criteria

**This Story Depends On:**

- Story 2.10A (Code Quality Foundation) - ✅ COMPLETE - Server uses snake_case
- Story 2.10D (Integration & Performance Validation) - ✅ COMPLETE - REST API endpoints built

**This Story Blocks:**

- Story 2.11-2.16 (Epic 2 advanced features)
- Epic 5 (Migration & Deployment - Shadow Mode)

**Completion Criteria:**

1. Appwrite packages removed from `package.json`
2. All TypeScript interfaces use snake_case field names
3. All API calls use `fetch()` to PostgreSQL REST API endpoints
4. All React components access snake_case properties
5. Client test suite passes with zero failures (`npm run test -- --run`)
6. Lint passes with zero errors (`npm run lint`)
7. Build succeeds (`npm run build`)
8. Application runs without field name errors
9. All UI components display data correctly

### Project Structure Notes

**Files to Delete:**

- `client/src/lib/appwrite-client.ts` - Appwrite client SDK wrapper
- `client/src/lib/appwrite-server.ts` - Appwrite server SDK wrapper
- `client/src/app/api/race/[id]/appwriteTypes.ts` - Appwrite type definitions

**Files to Create:**

- `client/src/lib/api-client.ts` - HTTP fetch wrapper for PostgreSQL REST API
- `client/src/lib/api-types.ts` - TypeScript types for API responses (snake_case)

**Files to Update (Type Definitions):**

- `client/src/types/meetings.ts` - Meeting, Race, Entrant, MeetingWithRaces interfaces
- `client/src/types/racePools.ts` - RacePoolData, RaceResult, PoolDividend types
- `client/src/types/moneyFlow.ts` - MoneyFlowHistory, EntrantMoneyFlowTimeline types
- `client/src/types/pollingMetrics.ts` - PollingMetrics types
- `client/src/types/alerts.ts` - Alert types
- `client/src/types/enhancedGrid.ts` - Grid display types

**Files to Update (API Routes - ~13 files):**

- `client/src/app/api/meetings/[meetingId]/races/route.ts`
- `client/src/app/api/meetings/[meetingId]/status/route.ts`
- `client/src/app/api/race/[id]/route.ts`
- `client/src/app/api/race/[id]/basic/route.ts`
- `client/src/app/api/race/[id]/money-flow-timeline/route.ts`
- `client/src/app/api/race/[id]/pools/route.ts`
- `client/src/app/api/races/upcoming/route.ts`
- `client/src/app/api/next-scheduled-race/route.ts`
- `client/src/app/api/user-alert-configs/route.ts`
- `client/src/app/api/user-alert-configs/reset/route.ts`
- `client/src/app/api/health/route.ts`
- `client/src/server/meetings-data.ts`
- `client/src/services/**/*.ts` (if present)

**Files to Update (React Components):**

- All components in `client/src/components/` that display meeting, race, entrant data
- All pages in `client/src/app/` that consume API data

**Files to Update (Tests):**

- All test files in `client/src/__tests__/` and `client/src/**/*.test.ts`
- All test fixtures and mocks

### Testing Strategy

**Type Safety Validation:**

- TypeScript compiler will catch all field name mismatches
- Run `tsc --noEmit` to verify type correctness
- Fix all type errors before running application

**Unit Test Updates:**

- Update all test fixtures to use snake_case field names
- Update test mocks to return snake_case responses
- Update test assertions to expect snake_case properties
- Ensure test coverage for all updated components

**Integration Testing:**

- Test API integration with real PostgreSQL backend
- Verify data flows correctly from REST API to UI
- Test all user interactions and navigation
- Verify error handling for failed API calls

**Manual Testing Checklist:**

1. Start PostgreSQL backend server (`cd server && npm run dev`)
2. Start Next.js client (`cd client && npm run dev`)
3. Meetings list displays correctly with all fields
4. Race details show correct data (times, names, status)
5. Entrant information displays (names, numbers, odds, scratched status)
6. Money flow data renders correctly
7. Race results and dividends display correctly
8. Navigation between meetings and races works
9. No console errors related to undefined properties
10. Timestamps display with Pacific/Auckland timezone

### Performance Considerations

**Migration Impact:**

- Zero runtime performance impact (HTTP fetch vs Appwrite SDK similar performance)
- No data transformation overhead (direct snake_case field access)
- Smaller bundle size (removing Appwrite SDK ~100KB+)
- Faster builds (fewer dependencies)

**HTTP Client Best Practices:**

- Use `fetch()` with proper error handling
- Add request timeout (5-10 seconds)
- Add retry logic for transient failures
- Add response caching if needed
- Use `AbortController` for request cancellation

**TypeScript Compilation:**

- Expect initial compilation errors (field name mismatches)
- Use TypeScript errors as migration checklist
- Fix systematically: types → API layer → components → tests

### Known Risks & Mitigations

**Risk: Missed Field Name References**

Some field accesses may be string-based or dynamic, missing TypeScript checks.

_Mitigation:_

- Search codebase for old field names (e.g., `meetingId`, `raceId`)
- Use ESLint rules to catch string literal property access
- Thorough manual testing to catch runtime errors
- Browser console monitoring during testing

**Risk: API Endpoint Availability**

PostgreSQL backend server must be running for client to work.

_Mitigation:_

- Document startup sequence in README
- Add health check endpoint validation
- Add graceful error messages when API unavailable
- Consider adding mock API mode for development

**Risk: Environment Configuration**

Missing or incorrect API base URL will cause all requests to fail.

_Mitigation:_

- Provide clear `.env.example` with all required variables
- Add environment variable validation on client startup
- Add helpful error messages for missing configuration
- Document environment setup in README

**Risk: Timezone Handling**

Client must correctly parse and display Pacific/Auckland timestamps.

_Mitigation:_

- Server already returns ISO 8601 with timezone offset (Story 2.10D)
- Use JavaScript `Date` parsing (handles timezone offsets)
- Test with both NZST (+12:00) and NZDT (+13:00) examples
- Document timezone behavior in code comments

### References

**Epic & Story Documentation:**

- [epics.md](../epics.md#L208-L234) - Story 2.10E definition
- [tech-spec-epic-2.md](../tech-spec-epic-2.md) - Epic 2 technical specification
- [solution-architecture.md](../solution-architecture.md) - System architecture

**Dependency Stories:**

- [story-2.10A.md](./story-2.10A.md) - Code Quality Foundation (server snake_case migration)
- [story-2.10D.md](./story-2.10D.md) - Integration & Performance Validation (REST API endpoints)

**API Contract:**

- Server API endpoints: `/api/meetings`, `/api/races`, `/api/entrants`
- Response format: snake_case JSON matching PostgreSQL schema
- Timestamps: ISO 8601 with Pacific/Auckland offset

### Migration Example

**Before (Appwrite SDK):**

```typescript
// Type definition
interface Meeting {
  $id: string
  $createdAt: string
  $updatedAt: string
  meetingId: string
  meetingName: string
  raceType: string
}

// API call
import { databases, Query } from '@/lib/appwrite-server'

const response = await databases.listDocuments('raceday-db', 'meetings', [
  Query.equal('date', '2025-10-21'),
  Query.limit(20),
])

const meetings: Meeting[] = response.documents

// Component usage
const MeetingCard = ({ meeting }: { meeting: Meeting }) => {
  return (
    <div>
      <h2>{meeting.meetingName}</h2>
      <p>Type: {meeting.raceType}</p>
    </div>
  )
}
```

**After (PostgreSQL REST API):**

```typescript
// Type definition
interface Meeting {
  meeting_id: string
  meeting_name: string
  race_type: string
  country: string
  date: string
  status: string
  created_at: string
  updated_at: string
}

// API call
import { apiClient } from '@/lib/api-client'

const meetings: Meeting[] = await apiClient.get('/api/meetings', {
  params: { date: '2025-10-21' },
})

// Component usage
const MeetingCard = ({ meeting }: { meeting: Meeting }) => {
  return (
    <div>
      <h2>{meeting.meeting_name}</h2>
      <p>Type: {meeting.race_type}</p>
    </div>
  )
}
```

### Environment Configuration

**Before (Appwrite):**

```bash
# .env.local
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=raceday-project-id
APPWRITE_API_KEY=secret-api-key
```

**After (PostgreSQL REST API):**

```bash
# .env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:7000
# Optional: Add API key if implementing authentication
NEXT_PUBLIC_API_KEY=optional-api-key
```

## Dev Agent Record

### Context Reference

- [story-context-2.10E.xml](./story-context-2.10E.xml) - Generated 2025-10-21

### Agent Model Used

<!-- Model name and version will be added during implementation -->

### Debug Log References

<!-- Debug logs will be added during implementation -->

### Completion Notes List

<!-- Completion notes will be added during implementation -->

### File List

<!-- Files modified will be listed during implementation -->

## Change Log

| Date       | Change                                  | Author  |
| ---------- | --------------------------------------- | ------- |
| 2025-10-21 | Story updated with REST API approach    | warrick |
| 2025-10-21 | Story created via create-story workflow | warrick |
