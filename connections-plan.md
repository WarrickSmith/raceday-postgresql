# Appwrite Connection Leak Resolution Plan

## Executive Summary

This development plan addresses critical Appwrite database connection leak issues causing "Too many connections" errors in the RaceDay client application. The plan prioritizes eliminating unnecessary real-time subscriptions while maintaining user experience, particularly removing the 60+ simultaneous connections from the meetings page and optimizing remaining real-time connections for race pages.

## Architecture Compliance Requirements

### Connection Management Principles

- **Minimize Real-Time Scope**: Use real-time subscriptions only where essential (race pages, not meetings)
- **Proper Connection Lifecycle**: Establish → subscribe → clean disconnect cycle with adequate drain periods
- **Smart Polling Strategy**: Replace real-time with intelligent polling where user experience allows
- **Connection Pooling**: Reuse connections where possible, avoid connection proliferation
- **Graceful Degradation**: Fallback mechanisms when connection limits are reached

### Critical Constraints

- **Appwrite Connection Limits**: Database has finite connection pool, currently exhausted
- **Navigation-Triggered Leaks**: Fast navigation doesn't allow proper connection cleanup
- **Multiple Hook Subscriptions**: Each component creating independent connections
- **Insufficient Drain Delays**: 250ms too short for Appwrite's connection termination process

---

## High Impact Tasks (Critical - Week 1)

### Task 1: Remove Real-Time from Meetings Page

**Status**:

- Not Started
- In Progress
- ► Complete

**Priority**: Critical
**Impact**: 60+ connection reduction (80% of current connection load)

**Problem**: The `useRealtimeMeetings.tsx` hook creates up to 60 simultaneous document-specific subscriptions for meetings, plus collection-level subscriptions for races. The meetings page doesn't require real-time updates - periodic fetching provides sufficient user experience.

**Strategy**:

1. Replace `useRealtimeMeetings` hook with periodic fetch-based approach
2. Implement smart polling (60 second intervals) for meetings data refresh
3. Maintain NextScheduledRaceButton functionality using existing API polling
4. Preserve all UI/UX including error handling, loading states, and race navigation

**Key Resources**:

- File: `/client/src/hooks/useRealtimeMeetings.tsx` (REMOVE)
- Component: `/client/src/components/dashboard/MeetingsListClient.tsx` (MODIFY)
- API: `/client/src/app/api/meetings` (existing, leverage for polling)
- Reference: `NextScheduledRaceButton.tsx` already uses polling pattern

**Implementation Details**:

- Create `useMeetingsPolling` hook to replace real-time subscription
- Implement intelligent refresh intervals based on race timing proximity
- Remove `client.subscribe` calls and connection management from meetings context
- Keep `onRaceUpdate` signal mechanism for button component coordination
- Maintain meeting selection, race prefetching, and navigation functionality

### Task 2: Increase Connection Drain Delay

**Status**:

- Not Started
- In Progress
- ► Complete

**Priority**: High
**Impact**: Prevents connection leaks during navigation

**Problem**: The current 250ms drain delay in `SubscriptionCleanupContext.tsx` is insufficient for Appwrite's connection termination process. New connections are created before old ones fully close, causing accumulation.

**Strategy**:

1. Increase `DEFAULT_DRAIN_DELAY` from 250ms to 1000ms
2. Add immediate cleanup trigger on navigation start
3. Implement connection state tracking to prevent new subscriptions during cleanup
4. Add emergency cleanup for stuck connections

**Key Resources**:

- File: `/client/src/contexts/SubscriptionCleanupContext.tsx:8`
- Hook: `/client/src/hooks/useUnifiedRaceRealtime.ts` (cleanup integration)
- Hook: `/client/src/hooks/useRealtimeMeetings.tsx` (if retained)

**Implementation Details**:

- Change `DEFAULT_DRAIN_DELAY = 250` to `DEFAULT_DRAIN_DELAY = 1000`
- Update `NAVIGATION_DRAIN_DELAY` export accordingly
- Add connection count tracking for monitoring
- Implement immediate unsubscribe on route change events

### Task 3: Fix Race Page Connection Upgrade Leaks

**Status**:

- Not Started
- In Progress
- ► Complete

**Priority**: High
**Impact**: Eliminates connection leaks during race-results document discovery

**Problem**: `useUnifiedRaceRealtime.ts` performs connection "upgrades" when race-results documents are discovered, but doesn't properly clean up the previous connection before creating a new one with additional channels.

**Strategy**:

1. Remove dynamic subscription upgrade logic that leaks connections
2. Start with maximum channel set from the beginning (including potential race-results)
3. Use event filtering instead of subscription changes to handle document discovery
4. Implement proper connection replacement with full cleanup cycle

**Key Resources**:

- File: `/client/src/hooks/useUnifiedRaceRealtime.ts:780-820` (upgrade logic)
- Pattern: Document-specific subscription strategy
- Context: Race status transitions that trigger upgrades

**Implementation Details**:

- Remove `useEffect` for dynamic subscription upgrade
- Include race-results channels in initial `getChannels()` call
- Use `events.some()` filtering to ignore irrelevant race-results events
- Add connection replacement function with proper cleanup sequence
- Ensure single subscription per race page throughout lifecycle

### Task 4: Add Connection Count Monitoring

**Status**:

- Not Started
- In Progress
- ► Complete

**Priority**: Medium
**Impact**: Prevents future connection leaks through early detection

**Problem**: No visibility into active connection count or connection health, making it difficult to detect and prevent future leaks.

**Strategy**:

1. Create development-time connection monitoring dashboard (toggle dropdown row from bottom of race header component above race body (entrants grid))
2. Add connection count tracking to Appwrite client wrapper
3. Implement connection health metrics and alerts
4. Create fallback mechanism when connection limits approached

**Key Resources**:

- File: `/client/src/lib/appwrite-client.ts` (wrap client)
- New: `/client/src/components/dev/ConnectionMonitor.tsx`
- Context: Development environment only

**Implementation Details**:

- Wrap Appwrite client to track active subscriptions
- Add connection count display (toggle dropdown row from bottom of race header component above race body (entrants grid))
- Implement warning thresholds (>10 connections)
- Create emergency fallback to disable real-time if limits exceeded
- Add connection health metrics (average latency, failure rates)

---

## Medium Impact Tasks (Week 2)

### Task 5: Optimize Channel Selection Strategy (REVISED)

**Status**:

- Not Started
- In Progress
- ► Complete

**Priority**: Medium
**Impact**: Reduces connection overhead while preventing performance-killing collection-level subscriptions

**Problem**: The original approach would create severe performance issues by subscribing to entire collections (`money-flow-history.documents`, `race-results.documents`) that continuously grow, pushing irrelevant data for all races to every client. Current individual entrant document subscriptions (20+ channels per race) are also inefficient.

**Optimized Strategy**: Race-Specific Channel Filtering

**Key Implementation Requirements**:

1. **Database Schema Updates**:
   - Add `raceId` attribute to `entrants` collection for efficient race-based filtering
   - Remove obsolete attributes: `isEmergency`, `emergencyPosition` (approaching attribute limits)
   - Create `raceId` index for `entrants` collection for optimal performance
   - Add `raceId` attribute to `race-results` collection with index
   - Verify existing `raceId` in `money-flow-history` collection (already present)

2. **Channel Selection Optimization**:
   - Replace 20+ individual entrant document subscriptions with single race-scoped channel
   - Use race-specific filtering: `entrants.documents.raceId.{raceId}`
   - Apply same pattern to money-flow and race-results collections
   - Maintain client-side event filtering for race-specific processing

3. **Server Function Updates**:
   - Update `enhanced-race-poller` function to populate `raceId` in entrant records
   - Update race-results creation to include `raceId` field
   - Verify money-flow-history already includes `raceId` (confirmed present)

4. **Client Hook Updates**:
   - Modify `getChannels()` in `useUnifiedRaceRealtime.ts` to use race-scoped channels
   - Replace individual document subscriptions with attribute-based channel selection
   - Maintain identical real-time functionality with optimized delivery

**Performance Benefits**:
- Reduces channel count from 20+ per race to 3-4 channels
- Eliminates irrelevant data push from growing collections
- Improves navigation performance with cleaner connection lifecycle
- Prevents future performance degradation as data volumes grow
- Follows Appwrite best practices for attribute-based channel filtering

**Files Affected**:
- `/server/database-setup/src/database-setup.js` (schema updates)
- `/client/src/hooks/useUnifiedRaceRealtime.ts` (channel selection)
- `/server/functions/enhanced-race-poller/` (raceId population)

**Implementation Sequence**:
1. Database schema updates (add raceId, indexes, remove obsolete attributes)
2. Server function updates (populate raceId in new records)
3. Client hook optimization (race-scoped channel selection)
4. Testing and validation (verify real-time delivery works correctly)

### ~~Task 6: Implement Connection Pooling~~ (REMOVED)

**Status**: Removed - Counterproductive

**Reason for Removal**: Connection pooling would reintroduce the exact performance and data contamination problems that Tasks 1 and 5 are designed to solve.

**Why Connection Pooling is Problematic**:
- Forces ALL channels to be active simultaneously across components
- Creates data contamination (components receive irrelevant notifications)
- Increases unnecessary server-to-client data push from Appwrite
- Breaks clean per-page connection lifecycle
- Creates tight coupling between unrelated components

**Current Architecture is Optimal**: The existing `useUnifiedRaceRealtime.ts` approach with connection monitoring via `appwrite-client.ts` already provides the benefits (tracking, metrics, emergency fallback) without the drawbacks.

---

## Expected Results

### Immediate Impact (After Task 1-3)

- **Eliminate "Too many connections" errors** from Appwrite database
- **Reduce active connections by 80%** (from 60+ to <10)
- **Maintain identical user experience** on meetings page
- **Preserve NextScheduledRaceButton functionality** with same information display
- **Fix navigation-triggered connection leaks** in race pages

### Long-term Benefits (After Task 4-6)

- **Proactive connection leak detection** and prevention
- **Improved application performance** through reduced connection overhead
- **Better resource utilization** of Appwrite instance
- **Enhanced monitoring and debugging** capabilities
- **Scalable connection management** for future features

### User Experience Preservation

- **Meetings page**: Identical functionality with 30-60 second data refresh
- **NextScheduledRaceButton**: Unchanged behavior with live countdown and race detection
- **Race pages**: Full real-time experience maintained with optimized connections
- **Navigation**: Improved performance with proper connection cleanup
- **Error handling**: Enhanced connection failure recovery

## Risk Mitigation

### Data Freshness Concerns

- **Meetings polling**: Intelligent intervals based on race timing proximity
- **API caching**: Leverage existing revalidation strategies
- **Fallback mechanisms**: Maintain user polling option if needed

### Performance Impact

- **Polling overhead**: Minimal compared to 60+ WebSocket connections
- **Memory usage**: Reduced due to fewer active subscriptions
- **Network traffic**: More predictable and manageable

### Implementation Risks

- **Gradual rollout**: Implement tasks incrementally with testing
- **Feature flags**: Enable/disable new polling behavior
- **Monitoring**: Track performance metrics during transition
