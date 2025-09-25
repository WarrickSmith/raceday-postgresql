# Appwrite Query Performance Optimization Plan

## Executive Summary

Analysis of the RaceDay application reveals critical performance bottlenecks causing **45+ second fetch times** for single race data. The primary issues are inefficient Appwrite query patterns, missing compound indexes, and suboptimal data fetching strategies.

## Current Performance Issues

### 1. Critical Bottlenecks Identified
- **Single race queries taking 45+ seconds** (should be 2-5 seconds)
- Race data API fetching excessive related data in single queries
- Money-flow timeline API using inefficient entrant ID array queries
- Missing compound indexes for race-specific data filtering
- Over-fetching data with no result limits or field selection

### 2. Screenshot Analysis Results
From the developer tools network panel:
- Race data fetch: **45.3 seconds**
- Money flow timeline: **43.3 seconds**
- User alert config: **59.9 seconds**
- Race polling: **27.6 seconds**

## Root Cause Analysis

### 1. Inefficient Query Patterns
**Money Flow Timeline API** (`/api/race/[id]/money-flow-timeline/route.ts`):
```typescript
// CURRENT (INEFFICIENT)
Query.equal('entrant', entrantIds), // Scans ALL entrants across ALL races first
Query.equal('raceId', raceId),      // Secondary filter

// OPTIMIZED
Query.equal('raceId', raceId),      // Filter by race FIRST (most selective)
Query.isNotNull('entrant'),         // Then filter for valid entrant data
```

### 2. Excessive Data Fetching (CODEX Issue #1)
**Race API** (`/api/race/[id]/route.ts:232-235`):
```typescript
// CURRENT: Fetches ALL columns for 200+ money-flow records
Query.equal('entrant', entrantIds), // Forces OR-filters across all entrants
Query.limit(200),                   // Returns every column (odds, rawPollingData, etc.)
```

### 3. Meeting Relationship Expansion Overhead (CODEX Issue #2)
**Race API** automatically expands full meeting relationships, "dragging in many unused attributes, inflating payload size and parse time."

### 4. Missing Query Field Selection (CODEX Issue #3)
**No Query.select() usage** - APIs return entire documents instead of only required fields for UI rendering.

### 5. Timeline History Re-fetching (CODEX Issue #4)
**Money-flow timeline** (`route.ts:45`) "repeats multi-entrant query with 2,000-row limit, so every poll downloads entire historical series instead of just new buckets."

### 6. Index Utilization Issues (CODEX Issue #5)
**Relationship attribute filtering** cannot leverage single-field indexes like `idx_race_id`, "leaving Appwrite to filter in memory—matching the ~1 min waits."

## Database Schema Analysis

### Current Index Status (from database-setup.js)
**Adequate Indexes:**
- `races`: `idx_race_id` (unique), `idx_start_time`, `idx_race_number`
- `entrants`: `idx_entrant_id` (unique), `idx_runner_number`, `idx_race_id`
- `money-flow-history`: `idx_timestamp`, `idx_race_id`

**Missing Critical Indexes:**
- `money-flow-history`: **Compound index** `[raceId, entrantId, timeInterval]`
- `entrants`: **Compound index** `[raceId, isScratched]` for active entrant filtering

## Optimization Strategy

### Phase 1: Critical Query Restructuring (Immediate - High Impact)

#### 1.0 Ensure Scalar Keys Are Populated (Foundational Step)
- Update ingestion functions deployed via Appwrite Functions to populate `raceId` on entrants and money-flow documents consistently (backfill existing rows using a maintenance function scheduled via `appwrite.json` CRON).
- Introduce an `entrantId` string attribute on `money-flow-history` (mirrors `entrants.entrantId`) so timeline queries can avoid relationship lookups; backfill the value from the related entrant `$id`.
- Add regression checks that reject new documents missing these scalar keys to keep index utilization predictable.

#### 1.1 Implement Scalar Foreign Keys (CODEX Recommendation)
**Replace relationship queries with indexed scalar keys:**
```typescript
// CURRENT (Race API - Slow relationship query)
Query.equal('race', raceData.$id),

// OPTIMIZED (Use scalar raceId field with index)
Query.equal('raceId', raceId), // Leverages idx_race_id index directly
```

#### 1.2 Add Query.select() Everywhere (CODEX Critical Fix)
**Reduce payload size by 60-70%:**
```typescript
// Race API - Only fetch UI-required fields
Query.select(['$id', 'raceId', 'name', 'startTime', 'status', 'distance', 'meeting'])

// Entrants API - Only fetch display fields
Query.select(['$id', 'entrantId', 'name', 'runnerNumber', 'jockey', 'fixedWinOdds', 'isScratched'])

// Money-flow - Only fetch timeline essentials
Query.select(['raceId', 'entrantId', 'timeInterval', 'incrementalWinAmount', 'incrementalPlaceAmount',
             'fixedWinOdds', 'fixedPlaceOdds', 'pollingTimestamp'])
```
> When using `getDocument`, switch to `listDocuments` with `Query.equal('$id', ...)` if field selection is required, because `getDocument` does not support `Query.select`.

#### 1.3 Eliminate Meeting Relationship Expansion (CODEX Issue Fix)
**Current Issue**: Race API expands full meeting relationships automatically  
**Solution**:
```typescript
// Option 1: Fetch meeting separately with Query.select
const meetingQuery = await databases.listDocuments('raceday-db', 'meetings', [
  Query.equal('meetingId', meetingId),
  Query.limit(1),
  Query.select(['meetingId', 'meetingName', 'country', 'date'])
])

// Option 2: Denormalize critical meeting fields into race document
// Add: meetingName, country to races collection
```

#### 1.4 Implement Cursor-based Incremental Loading (CODEX Advanced)
**Replace full re-fetches with incremental updates:**
```typescript
// Money-flow timeline - only fetch new data since last update
Query.equal('raceId', raceId),
Query.greaterThan('$createdAt', lastSeenTimestamp), // Cursor-based pagination
Query.limit(100),                                   // Reasonable incremental batch
Query.orderAsc('$createdAt')                        // Chronological order
```
Use `Query.cursorAfter(lastDocumentId)` as an alternative cursor when sequential reads are required.

#### 1.5 Smart Result Limiting (Enhanced)
**Current**: Excessive limits (2000 records) or no limits  
**Optimized**: Context-aware limits
- Money-flow timeline: Max 100 incremental records per poll
- Live entrants: Max 30 per race (field size + scratched)
- Historical data: Max 50 timeline points per entrant

### Phase 2: Database Index Optimization (High Impact)

#### 2.1 Add Critical Compound Indexes
Execute via database setup or Appwrite console once scalar keys are populated:

```javascript
// money-flow-history collection
databases.createIndex(
  'raceday-db',
  'money-flow-history',
  'idx_race_entrant_time',
  'key',
  ['raceId', 'entrantId', 'timeInterval']
)

// entrants collection
databases.createIndex(
  'raceday-db',
  'entrants',
  'idx_race_active',
  'key',
  ['raceId', 'isScratched']
)
```
> Appwrite indexes cannot include relationship attributes; ensure both `raceId` and `entrantId` are standard string attributes before creating the index.

#### 2.2 Verify Existing Index Usage
Review and optimize existing indexes:
- Ensure `idx_race_id` on money-flow-history is being used effectively once scalar keys are populated.
- Confirm `Query.orderAsc('runnerNumber')` aligns with `idx_runner_number`.
- Remove redundant indexes during database setup refactors to keep write overhead low.

### Phase 3: API Response Optimization (Medium Impact)

#### 3.1 Implement Smart Caching
```typescript
// Race basic data: Longer cache for completed races
const cacheTime = raceStatus === 'Final' ? 300 : 30; // 5min vs 30s

response.headers.set(
  'Cache-Control',
  `public, max-age=${cacheTime}, stale-while-revalidate=${cacheTime * 2}`
)
```
Use App Route Segment config in Next.js (`revalidate`) to align server-side caching with these values.

#### 3.2 Add Response Compression
- Enable API response compression for large datasets
- Implement client-side decompression if needed

### Phase 4: Polling Performance Optimization

#### 4.1 Optimize Polling Efficiency (Focus on Query Speed)
```typescript
// CURRENT: Full data re-fetch on every poll
const fetchAllData = () => {
  fetch(`/api/race/${raceId}/money-flow-timeline?entrants=${entrantIds.join(',')}`)
}

// OPTIMIZED: Race-based polling with field selection
const fetchOptimizedData = () => {
  fetch(`/api/race/${raceId}/money-flow-timeline?select=timeline-fields`)
}
```
Ensure polling intervals defined in `polling_plan.md` respect Appwrite rate limits and avoid overlap with scheduled CRON jobs (remember all CRON declarations in `appwrite.json` run in UTC).

#### 4.2 Implement Server-side Caching for Polling
```typescript
// Cache race data server-side between polls to reduce query load
const getCachedRaceData = async (raceId: string) => {
  const cacheKey = `race:${raceId}:data`
  const cached = await cache.get(cacheKey)
  if (cached) return cached

  const freshData = await queryDatabase(raceId)
  await cache.set(cacheKey, freshData, 15) // 15 second cache
  return freshData
}
```

#### 4.3 Progressive Data Loading (Query-Focused)
```typescript
// 1. Load essential race data first (< 1 second target)
const basicRace = await fetch(`/api/race/${raceId}/basic`)

// 2. Load entrants with field selection (< 2 seconds)
const entrants = await fetch(`/api/race/${raceId}/entrants?select=display-fields`)

// 3. Load timeline data with optimized queries (< 3 seconds)
const timeline = await fetch(`/api/race/${raceId}/money-flow-timeline`)
```

## Performance Expectations

### Before Optimization:
- Single race query: **45+ seconds**
- Money-flow timeline: **43+ seconds**
- Total page load: **60+ seconds**

### After Optimization:
- Single race query: **2-5 seconds** (90% improvement)
- Money-flow timeline: **3-6 seconds** (85% improvement)
- Total page load: **8-12 seconds** (80% improvement)

### Database Impact:
- **75-85% reduction** in database read operations
- **60-70% reduction** in data transfer volume
- **50-60% cost reduction** for Appwrite database usage

## Implementation Timeline

### Week 1: Critical Fixes
- **Day 1**: Add scalar key backfill and compound indexes to money-flow-history
- **Day 2**: Restructure money-flow timeline API query logic
- **Day 3**: Add Query.select() field limiting
- **Day 4**: Implement smart result limits
- **Day 5**: Testing and performance validation

### Week 2: Polling & Caching Optimizations
- **Day 1-2**: Add server-side caching for polling endpoints
- **Day 3-4**: Implement progressive loading pattern for queries
- **Day 5**: Performance monitoring and fine-tuning

## Success Metrics

### Primary KPIs:
1. **Query Response Time**: < 5 seconds for single race (currently 45s)
2. **Data Transfer Size**: < 500KB per race load (currently ~2MB)
3. **Database Read Operations**: < 50 reads per race load (currently 200+)

### Secondary KPIs:
1. **Time to Interactive**: < 10 seconds total page load
2. **Appwrite Usage Cost**: 50-60% reduction in database operations
3. **User Experience**: Sub-5-second race switching

## Risk Mitigation

### 1. Data Accuracy Risk
- **Risk**: Query optimization might affect data completeness
- **Mitigation**: Comprehensive testing with production data samples
- **Validation**: Compare optimized vs current results for accuracy

### 2. Real-time Functionality Risk
- **Risk**: Caching might interfere with live polling expectations
- **Mitigation**: Different cache strategies for live vs completed races
- **Validation**: Test live race polling during active CRON-based ingestion windows

### 3. Index Creation Impact
- **Risk**: Adding indexes might temporarily impact write performance
- **Mitigation**: Schedule index creation during low-usage periods
- **Monitoring**: Watch write operation performance during index creation

## Next Steps

1. **Immediate**: Create scalar key backfill function and required indexes
2. **Phase 1**: Implement money-flow API query restructuring
3. **Phase 2**: Add field selection and smart limits
4. **Phase 3**: Implement caching and progressive loading
5. **Monitoring**: Set up performance dashboards to track improvements

---

## CODEX Query Plan Integration Summary

The following critical optimizations were added based on CODEX Query Plan analysis:

### 🚨 Critical Issues Identified by CODEX:
1. **Relationship Expansion Overhead**: Race API auto-expands full meeting relationships, inflating payloads
2. **Missing Query.select()**: APIs return entire documents instead of UI-required fields only
3. **OR-filter Performance**: `Query.equal('entrant', entrantIds)` forces expensive multi-entrant scans
4. **Historical Re-fetching**: Timeline API downloads entire 2000-row history on every poll
5. **Index Mismatch**: Relationship queries bypass scalar field indexes like `idx_race_id`

### 🎯 Key CODEX Recommendations Integrated:

#### **1. Scalar Foreign Key Strategy**
- Replace `Query.equal('race', raceData.$id)` with `Query.equal('raceId', raceId)`
- Leverage existing `idx_race_id` indexes for 10x query performance

#### **2. Universal Query.select() Implementation**
- Reduce API payloads by 60-70% through field selection
- Target only UI-rendered fields: `runnerNumber`, `holdPercentage`, `fixedWinOdds`, etc.

#### **3. Eliminate Meeting Relationship Expansion**
- Fetch meeting data separately with Query.select() or denormalize into race document
- Remove "unused attributes inflating payload size and parse time"

#### **4. Cursor-based Incremental Updates**
- Replace full timeline re-fetches with `Query.greaterThan('$createdAt', lastSeen)`
- Enable "compact snapshots instead of thousands of raw rows"

#### **5. Polling Query Optimization**
- Focus on making individual poll queries as fast as possible
- Implement server-side caching to reduce database load between polls

### 📊 Enhanced Performance Targets (with CODEX optimizations):
- **Single race query**: 45s → **1-2 seconds** (95% improvement)
- **Payload size**: 2MB → **200-300KB** (85% reduction)
- **Database reads**: 200+ → **10-20 reads** (90% reduction)
- **Polling efficiency**: Full re-fetch → **Cached + incremental queries** (80% polling improvement)

### 🔧 Implementation Priority (CODEX-Enhanced):
1. **Immediate**: Add Query.select() to all API endpoints (fastest win)
2. **Critical**: Implement scalar raceId queries (leverage existing indexes)
3. **High**: Eliminate meeting relationship expansion (payload reduction)
4. **Medium**: Add server-side caching for polling optimization

*This enhanced optimization plan integrates CODEX Query Plan's deep analysis of payload inflation, index utilization, and incremental update patterns to achieve sub-second query performance.*

---

## CODEX Final Amendments
- Added Phase 1 foundational step to populate scalar `raceId`/`entrantId` fields and enforce ingestion hygiene before query changes.
- Updated indexing strategy to rely on new `entrantId` attribute (avoids unsupported relationship indexes) and clarified creation order.
- Documented the limitation of `Query.select` with `getDocument` and advised using `listDocuments` when selective fields are required.
- Inserted guidance to coordinate polling cadence with UTC CRON schedules and Appwrite rate limits to prevent overlapping loads.
