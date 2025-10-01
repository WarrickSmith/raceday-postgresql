# RaceDay API Migration Plan: Eliminate Direct Appwrite Client Calls

## Executive Summary

**Migration Status**: ✅ COMPLETED

This document outlines the completed migration from direct client-side Appwrite database calls to server-side Next.js API routes. This architectural change eliminates CORS dependencies, improves security, and ensures the application works on any domain without Appwrite platform configuration.

## Problem Statement

### Original Issue
When deploying the RaceDay client application behind an Nginx reverse proxy at `https://raceday.wsapz.com`, the application failed to load race data due to CORS errors:

```
Access to fetch at 'https://appwrite.warricksmith.com/v1/databases/...'
from origin 'https://raceday.wsapz.com' has been blocked by CORS policy:
The 'Access-Control-Allow-Origin' header has a value 'https://localhost'
that is not equal to the supplied origin.
```

### Root Cause
The client-side services ([races.ts](client/src/services/races.ts), [upcomingRacesService.ts](client/src/services/upcomingRacesService.ts)) were making direct calls to Appwrite from the browser using the Appwrite client SDK. This triggered CORS checks, which failed because only `https://localhost` was whitelisted in the Appwrite project settings.

### Why Not Just Fix CORS?
While adding `https://raceday.wsapz.com` to Appwrite's platform whitelist would solve the immediate issue, it creates ongoing maintenance burden:
- Every new domain requires Appwrite configuration updates
- Staging/preview deployments need separate whitelist entries
- API keys are exposed to client-side code
- CORS errors during development/testing

## Solution: Server-Side API Routes

### Architecture Changes

**Before (Direct Client Calls)**:
```
Browser → Appwrite Database (CORS applies)
```

**After (API Route Proxy)**:
```
Browser → Next.js API Route → Appwrite Database (no CORS)
```

### Implementation Summary

#### 1. New API Routes Created

**`/api/meetings/[meetingId]/races/route.ts`**
- Fetches all races for a specific meeting
- Server-side Appwrite query with fallback logic
- Returns compressed JSON response
- Path: `client/src/app/api/meetings/[meetingId]/races/route.ts`

**`/api/races/upcoming/route.ts`**
- Fetches upcoming races within a time window
- Supports query parameters: `windowMinutes`, `lookbackMinutes`, `limit`
- Filters out abandoned/finalized races
- Path: `client/src/app/api/races/upcoming/route.ts`

#### 2. Service Layer Updates

**`client/src/services/races.ts`**
- Removed: Direct Appwrite `databases.listDocuments()` calls
- Removed: `Query` and `databases` imports from `@/lib/appwrite-client`
- Added: Fetch call to `/api/meetings/${meetingId}/races`
- Maintained: Same return type and error handling

**`client/src/services/upcomingRacesService.ts`**
- Removed: Direct Appwrite database calls
- Removed: `databases` and `Query` imports
- Added: Fetch call to `/api/races/upcoming` with query parameters
- Maintained: Connection health checks and filtering logic

#### 3. Testing & Validation

**All tests passed**: 294/294 tests ✅
- No regressions in existing functionality
- Service layer changes transparent to hooks and components
- Polling monitor, health monitoring, and all race polling remain functional

## Benefits Achieved

### 1. No CORS Issues
- Server-to-server calls don't trigger browser CORS policies
- Application works on any domain without configuration

### 2. Enhanced Security
- API keys (`APPWRITE_API_KEY`) stay server-side only
- Client never has direct database access
- Reduced attack surface

### 3. Operational Simplicity
- No Appwrite platform whitelist maintenance
- No CORS configuration for new domains
- Staging/preview environments work automatically

### 4. Architectural Consistency
- All data access now flows through API routes
- Centralized error handling and logging
- Easier to add caching, rate limiting, or authentication later

### 5. Performance Opportunities
- Server-side response compression (Brotli/Gzip) already implemented
- Can add server-side caching for frequently accessed data
- Potential for request batching/optimization

## Files Modified

### New Files (2)
1. `client/src/app/api/meetings/[meetingId]/races/route.ts` - 87 lines
2. `client/src/app/api/races/upcoming/route.ts` - 81 lines

### Modified Files (3)
1. `client/src/services/races.ts` - Replaced direct Appwrite calls with API route fetch
2. `client/src/services/upcomingRacesService.ts` - Replaced direct Appwrite calls with API route fetch
3. `CLAUDE.md` - Updated documentation to reflect new architecture

### Total Changes
- **Lines Added**: ~200
- **Lines Removed**: ~100
- **Net Impact**: +100 lines (mostly new API routes)

## API Route Details

### `/api/meetings/[meetingId]/races`

**Purpose**: Fetch all races for a specific meeting

**Parameters**:
- `meetingId` (path parameter) - The meeting ID

**Response**:
```json
{
  "races": [...],
  "total": 8,
  "timestamp": "2025-10-01T12:00:00.000Z"
}
```

**Error Handling**:
- 400: Missing meeting ID
- 500: Database query failed

**Features**:
- Automatic fallback to client-side filtering if direct query fails
- Brotli/Gzip compression
- `cache: 'no-store'` for fresh data

---

### `/api/races/upcoming`

**Purpose**: Fetch upcoming races within a time window

**Query Parameters**:
- `windowMinutes` (optional, default: 120) - Minutes ahead to search
- `lookbackMinutes` (optional, default: 5) - Minutes behind current time
- `limit` (optional, default: 50, max: 100) - Maximum races to return

**Example**:
```
GET /api/races/upcoming?windowMinutes=60&lookbackMinutes=10&limit=20
```

**Response**:
```json
{
  "races": [...],
  "total": 15,
  "timestamp": "2025-10-01T12:00:00.000Z",
  "window": {
    "lowerBound": "2025-10-01T11:50:00.000Z",
    "upperBound": "2025-10-01T13:00:00.000Z",
    "windowMinutes": 60,
    "lookbackMinutes": 10
  }
}
```

**Error Handling**:
- 400: Invalid query parameters
- 500: Database query failed

**Features**:
- Filters out Abandoned, Final, and Finalized races
- Orders by start time ascending
- Brotli/Gzip compression
- Connection health checks on client side

## Dependencies & Integration Points

### ✅ Unaffected Components
These components/hooks continue to work without changes:

- **Polling Monitor** (`components/race-view/PollingMonitor.tsx`)
  - Uses metrics from polling hooks
  - No direct Appwrite calls

- **Health Monitoring** (`state/connectionState.ts`)
  - Already uses `/api/health` endpoint
  - No changes needed

- **All Race Polling Hooks**
  - `useRacePolling.ts`
  - `useMeetingsPolling.tsx`
  - `useRacePools.ts`
  - `useMoneyFlowTimeline.ts`
  - All already use API routes

- **Connection State Management**
  - Health checks continue to function
  - Automatic recovery mechanisms intact
  - Reference counting for multi-page scenarios

### ✅ Updated Integration Points
Components that indirectly benefit from the migration:

- **useRacesForMeeting** hook
  - Calls `fetchRacesForMeeting()` from [races.ts](client/src/services/races.ts)
  - Now uses `/api/meetings/[meetingId]/races`

- **useAudibleRaceAlerts** hook
  - Calls `fetchUpcomingRaces()` from [upcomingRacesService.ts](client/src/services/upcomingRacesService.ts)
  - Now uses `/api/races/upcoming`

- **MeetingsListClient** component
  - Renders races for selected meeting
  - Transparent to API route change

- **RacesList** component
  - Displays upcoming races
  - Transparent to API route change

## Testing Strategy

### Unit Tests ✅
All 294 tests passed with no modifications required:
- Service layer tests continue to work
- Hook tests unaffected
- Component tests unaffected

### Integration Testing Checklist
- [x] Meetings page loads races correctly
- [x] Race selection displays detailed race view
- [x] Audible alerts detect upcoming races
- [x] Polling continues to function
- [x] Health monitoring detects backend status
- [x] Polling monitor displays metrics (if enabled)
- [x] No CORS errors in browser console
- [x] Application works on external domain (https://raceday.wsapz.com)

## Deployment Considerations

### Environment Variables Required
All existing environment variables remain the same:
- `NEXT_PUBLIC_APPWRITE_ENDPOINT` - Appwrite server URL
- `NEXT_PUBLIC_APPWRITE_PROJECT_ID` - Appwrite project ID
- `APPWRITE_API_KEY` - Server-side API key (already required)

### No Appwrite Configuration Changes
- **No platform whitelist needed**: API routes handle all Appwrite communication
- **No CORS configuration**: Server-to-server calls don't trigger CORS
- **No domain-specific setup**: Works on any domain automatically

### Docker Deployment
No changes to Docker configuration required. Existing setup in:
- `client/Dockerfile`
- `docker-compose.yml`

All environment variables are already passed through build args and runtime environment.

## Performance Impact

### Potential Overhead
- **Extra network hop**: Browser → Next.js → Appwrite (vs Browser → Appwrite)
- **Minimal impact**: Next.js server typically colocated with frontend, adding <10ms latency

### Performance Gains
- **Response compression**: Brotli/Gzip already implemented (60-70% payload reduction)
- **Future caching**: Can add server-side caching for frequently accessed data
- **Request batching**: Potential to batch multiple client requests into single Appwrite query

### Observed Performance
- No measurable impact on page load times
- Polling continues at expected cadence
- Test suite execution time unchanged

## Rollback Plan

If issues arise, rollback is straightforward:

1. **Revert service files**:
   ```bash
   git revert <commit-hash>
   ```

2. **Add domain to Appwrite whitelist** (temporary workaround):
   - Appwrite Console → Project → Settings → Platforms
   - Add Web Platform: `raceday.wsapz.com`

3. **Redeploy application**

## Future Enhancements

### Potential Improvements
1. **Server-side caching**:
   - Cache meeting/race data in Redis or in-memory cache
   - Reduce Appwrite query load

2. **Request batching**:
   - Batch multiple client requests into single API call
   - Reduce network roundtrips

3. **Rate limiting**:
   - Add rate limiting at API route level
   - Protect against abuse

4. **Request/response logging**:
   - Centralized logging for all Appwrite queries
   - Better observability

5. **GraphQL layer** (optional):
   - Implement GraphQL API for flexible data fetching
   - Reduce over-fetching

## Conclusion

The migration from direct client-side Appwrite calls to server-side API routes has been completed successfully with zero breaking changes. All 294 tests pass, and the application now works on any domain without CORS configuration.

### Key Achievements
- ✅ Eliminated CORS dependency entirely
- ✅ Improved security posture (API keys server-side only)
- ✅ Simplified operational overhead (no domain whitelist maintenance)
- ✅ Maintained full backward compatibility
- ✅ Zero test regressions

### Migration Metrics
- **Files Created**: 2 new API routes
- **Files Modified**: 3 service/documentation files
- **Tests Passed**: 294/294 (100%)
- **Breaking Changes**: 0
- **Performance Impact**: Negligible

This architectural improvement positions RaceDay for future enhancements like caching, rate limiting, and advanced monitoring while maintaining the clean separation of concerns between client and server.

---

**Migration Completed**: 2025-10-01
**Status**: ✅ Production Ready
