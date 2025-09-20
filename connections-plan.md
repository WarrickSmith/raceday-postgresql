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

### Task 5: Optimize Channel Selection Strategy

**Status**:

- ► Not Started
- In Progress
- Complete

**Priority**: Medium
**Impact**: Further reduces connection overhead

**Problem**: Current channel selection creates too many document-specific subscriptions when collection-level filtering could be more efficient.

**Strategy**:

1. Analyze which subscriptions benefit from document-specific vs collection-level channels
2. Implement client-side filtering for collection-level subscriptions
3. Reduce total channel count per race page subscription
4. Maintain same real-time functionality with fewer channels

### Task 6: Implement Connection Pooling

**Status**:

- ► Not Started
- In Progress
- Complete

**Priority**: Medium
**Impact**: Enables connection reuse across components

**Problem**: Each hook creates independent Appwrite client connections instead of sharing a connection pool.

**Strategy**:

1. Create centralized connection manager for WebSocket pooling
2. Implement connection sharing between compatible hooks
3. Add connection lifecycle management
4. Maintain proper cleanup and error handling

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
