# Real-Time Connection Performance Resolution Plan

## Executive Summary

This development plan consolidates findings from three comprehensive architectural reviews to address critical real-time connection performance issues in the RaceDay client application. The plan prioritizes tasks from highest to lowest impact, ensuring compliance with the hybrid "fetch-then-subscribe" architecture and single unified subscription model with proper connection boundaries.

## Architecture Compliance Requirements

### Hybrid Architecture Principles
- **Initial Data Fetch**: Components must fetch baseline data before establishing real-time subscriptions
- **Single Unified Subscription**: One WebSocket connection per page/context with multiple channels
- **Clear Connection Boundaries**: Proper establishment → subscribe → disconnect cycle during navigation
- **Document-Specific Targeting**: Narrow subscriptions to specific documents when IDs are available
- **Clean Navigation Disconnects**: Explicit cleanup signals before route transitions

### Critical Constraints
- **No Broad Collection Subscriptions**: Avoid collection-wide channels as database grows
- **Self-Hosted Appwrite Implementation**: Optimize for local server, not cloud deployment
- **Separate Page Subscriptions**: Meetings and Race pages maintain independent, optimized subscription strategies

---

## High Impact Tasks (Critical - Week 1)

### Task 1: Fix Meetings Page Over-Subscription
**Status**:
- Not Started
- In Progress
- ► Complete

**Priority**: Critical
**Impact**: 70% reduction in unnecessary network traffic

**Problem**: The `useRealtimeMeetings.tsx` hook subscribes to entire `meetings` and `races` collections, receiving every race update across all venues instead of just displayed meetings.

**Strategy**:
1. Remove the broad `races` collection subscription entirely
2. Maintain only document-specific `meetings` subscriptions for visible meetings
3. Use meeting IDs from initial data fetch to create targeted channels
4. Remove chronological recalculation logic that triggers on race updates

**Key Resources**:
- File: `/client/src/hooks/useRealtimeMeetings.tsx:99`
- Architecture Guide: `/docs/client-real-time-data-integration.md#primary-subscription-strategy`
- Reference Implementation: `useUnifiedRaceRealtime.ts` document-specific pattern

**Implementation Details**:
- Replace `'databases.raceday-db.collections.races.documents'` with meeting-specific channels
- Preserve existing connection state management and retry logic
- Update subscription array to use meeting document IDs from initial fetch
- Remove race-triggered `firstRaceTime` recalculation

### Task 2: Remove NextScheduledRaceButton Redundant Subscription
**Status**:
- Not Started
- In Progress
- ► Complete

**Priority**: Critical
**Impact**: Eliminates duplicate collection-wide race subscription

**Problem**: `NextScheduledRaceButton.tsx:84` creates additional races collection subscription while meetings hook already receives all race updates.

**Strategy**:
1. Remove independent subscription from NextScheduledRaceButton component
2. Create shared observable or callback mechanism in meetings hook
3. Expose race update stream for button component consumption
4. Ensure button updates piggyback on existing meetings subscription

**Key Resources**:
- File: `/client/src/components/dashboard/NextScheduledRaceButton.tsx:84`
- Parent Hook: `/client/src/hooks/useRealtimeMeetings.tsx`
- Pattern Reference: Shared subscription patterns in unified hook

**Implementation Details**:
- Remove `client.subscribe` call from button component
- Add `onRaceUpdate` callback to meetings hook interface
- Expose filtered race updates relevant to button functionality
- Update component to consume shared data stream

### Task 3: Eliminate Redundant Pool Data Subscriptions
**Status**:
- Not Started
- In Progress
- ► Complete

**Priority**: Critical
**Impact**: Prevents WebSocket connection duplication

**Problem**: The legacy `useRacePoolData` hook maintained its own Appwrite subscription, creating a second WebSocket connection alongside `useUnifiedRaceRealtime` and undermining the unified model.

**Strategy**:
1. Remove the legacy `useRacePoolData` hook to eliminate duplicate subscriptions
2. Teach `useUnifiedRaceRealtime` to fetch initial pool documents in addition to handling real-time updates
3. Update race page components to rely exclusively on unified hook data for pool totals
4. Reset pool state between races to prevent stale data during navigation

**Key Resources**:
- Hook: `/client/src/hooks/useUnifiedRaceRealtime.ts`
- Component: `/client/src/components/race-view/RacePoolsSection.tsx`
- Component: `/client/src/components/race-view/RaceFooter.tsx`

**Implementation Details**:
- Add guarded initial pool fetch within the unified hook and stamp `lastPoolUpdate` when no document exists
- Clear pool state when the active race changes to avoid leaking data across navigation
- Remove `useRacePoolData` usage and simplify `RacePoolsSection` to present unified data with lightweight loading states
- Streamline `RaceFooter` props now that pool data always comes from the unified hook

### Task 4: Implement Coordinated Navigation Cleanup
**Status**:
- Not Started
- In Progress
- ► Complete

**Priority**: Critical
**Impact**: Eliminates orphaned connections during navigation

**Problem**: Navigation cleanup uses fixed drain periods without coordination across multiple subscriptions, potentially leaving orphaned connections and lingering sockets during route transitions and Fast Refresh.

**Strategy**:
1. Extend existing `triggerSubscriptionCleanup` pattern from race navigation
2. Create centralized cleanup coordinator for all page subscriptions
3. Orchestrate drain timing across meetings, race, and button hooks before route changes
4. Integrate with Next.js navigation events and Fast Refresh lifecycle hooks

**Key Resources**:
- File: `/components/race-view/RaceNavigation.tsx:44` (existing cleanup pattern)
- Hook: `/client/src/hooks/useUnifiedRaceRealtime.ts:409` (cleanup implementation)
- Documentation: `/docs/client-real-time-data-integration.md#enhanced-subscription-patterns`

**Implementation Details**:
- Implement shared cleanup signal/context consumed by all realtime hooks
- Emit navigation intent events from router transitions and button handlers
- Ensure meetings and race hooks acknowledge cleanup before establishing new channels
- Add regression coverage for rapid navigation and Fast Refresh scenarios

---

## Medium Impact Tasks (Important - Week 2)

### Task 5: Optimize Channel Subscriptions to Document-Level
**Status**:
- Not Started
- In Progress
- ► Complete

**Priority**: High
**Impact**: 50% reduction in irrelevant event processing

**Problem**: Several subscriptions use collection-level channels when document-specific channels are available, receiving unnecessary updates for all documents.

**Strategy**:
1. Identify pool document IDs during initial data fetch
2. Replace collection-level pool subscriptions with document-specific channels
3. Update money-flow subscriptions to use race-scoped channels
4. Implement progressive channel upgrading as document IDs become available

**Key Resources**:
- File: `/client/src/hooks/useUnifiedRaceRealtime.ts:189`
- Documentation: `/docs/Money-Flow-Timeline-System-Architecture.md#channel-scope-for-race-resources`
- Appwrite Docs: Document-specific subscription patterns

**Implementation Details**:
- Capture pool document `$id` from initial fetch response
- Replace `databases.raceday-db.collections.race-pools.documents` with `databases.raceday-db.collections.race-pools.documents.${poolDocumentId}`
- Implement fallback to collection-level if document ID unavailable
- Add progressive channel upgrading when IDs become known

### Task 6: Optimize Entrant Subscription Initialization
**Status**:
- Not Started
- In Progress
- ► Complete

**Priority**: Medium
**Impact**: Faster initial subscription establishment

**Problem**: Entrant subscriptions fall back to collection-level until initial fetch completes, when entrant IDs are already available from initial data.

**Strategy**:
1. Extract entrant IDs from `initialEntrants` prop before first subscription
2. Pre-populate document-specific channels using known entrant IDs
3. Eliminate collection-level fallback when entrant data is available
4. Maintain fallback only when no initial entrant data provided but the fallback should be to display '-', not use collection-level data.

**Key Resources**:
- File: `/client/src/hooks/useUnifiedRaceRealtime.ts`
- Documentation: Document-specific subscription patterns
- Reference: Progressive channel upgrading implementation

**Implementation Details**:
- Check `initialEntrants` array for existing entrant IDs
- Build document-specific channels from initial data
- Skip collection-level fallback when IDs available
- Preserve fallback behavior for scenarios without initial data

### Task 6a: Show Race Results Visually
**Status**:
- ► Not Started
- In Progress
- Complete

**Priority**: Medium
**Impact**: User can immediately identify 1st, 2nd and 3rd place finishers with visual highlighting

**Problem**: When race results are available for 1st, 2nd or 3rd place positions, these are not immediately obvious to the user. Results can be pre-existing (when reviewing finalized races) or appear dynamically when race status changes to 'interim' or 'final' during live races. The background cell colours for an Entrant's silk, runner number and runner name (the first three cells ONLY) should change to 'Gold', 'Silver', or 'Bronze' colours to represent 1st, 2nd or 3rd place respectively. Use pastel colours approximating 'yellowish', 'greyish' and 'brownish' with appropriate text colour contrast.

**Target Cells (ONLY these three cells):**
- Silk cell (jockey silk image)
- Runner number cell
- Runner name cell
These are the first three cells in each entrant row in the EnhancedEntrantsGrid - NO other cells should be modified.

**Dynamic Behavior Requirements**:
- Highlighting must apply immediately when results become available during race viewing
- Must update dynamically during live races when status changes from 'Open' to 'interim' or 'final'
- Must work for both pre-existing results (historical races) and real-time result updates
- Should maintain existing hover, selection, and interaction functionality
- Color highlighting should override normal cell background but preserve accessibility

**Strategy**:
1. Create position detection utility to match entrants with race results by runner number
2. Implement color utility for position-based styling using Tailwind CSS pastel colors
3. Modify ONLY the main entrant cell (containing silk/runner number/name) to apply position highlighting
4. Add accessibility support for screen readers to announce finishing positions
5. Test with both historical finalized races and live race result updates

**Key Resources**:
- File: `/client/src/components/race-view/EnhancedEntrantsGrid.tsx` (main runner cell around lines 1398-1440)
- Hook: `useUnifiedRaceRealtime` for results data access
- Context: `useRace()` for accessing race results via `raceData.race.resultsData`
- Types: `RaceResult` interface in `/client/src/types/racePools.ts` (lines 37-50)

**Implementation Details**:
- Access results through `raceData.race.resultsData` from RaceContext
- Match entrants to results by comparing `entrant.runnerNumber` with `result.runner_number` or `result.runnerNumber`
- Apply highlighting ONLY to the main runner cell (td element containing silk, number, and name)
- Use Tailwind pastel classes: 1st=`bg-amber-100 text-amber-900`, 2nd=`bg-gray-100 text-gray-900`, 3rd=`bg-orange-100 text-orange-900`
- Only highlight when race status is 'interim' or 'final' and results are available
- Ensure proper color contrast and accessibility compliance
- Update ARIA labels to announce finishing positions to screen readers
- DO NOT modify WinOddsCell, PlaceOddsCell, or any other cells beyond the main runner information cell

### Task 7: Fix Hard-coded Appwrite Project ID
**Status**:
- ► Not Started
- In Progress
- Complete

**Priority**: Medium
**Impact**: Proper environment configuration compliance

**Problem**: Application uses hard-coded project ID 'racedaytest111' instead of environment variable reference.

**Strategy**:
1. Replace hard-coded project ID with environment variable reference
2. Update client-side .env.example to include proper project ID placeholder
3. Ensure all client-side references use NEXT_PUBLIC_APPWRITE_PROJECT_ID
4. Verify no server functions are affected (client-only change)

**Key Resources**:
- File: `/client/.env.example`
- Configuration: `/client/src/lib/appwrite-client.ts`
- Documentation: Environment variable patterns in project

**Implementation Details**:
- Search codebase for 'racedaytest111' occurrences in client directory
- Replace with `process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID`
- Update .env.example with clear project ID placeholder
- Test environment variable fallback behavior

### Task 8: Implement Connection Health Monitoring
**Status**:
- ► Not Started
- In Progress
- Complete

**Priority**: Medium
**Impact**: Visibility into connection performance and issues

**Problem**: No visibility into active connections, subscription health, or performance metrics for debugging real-time issues.

**Strategy**:
1. Create connection health tracking in subscription hooks
2. Implement metrics collection for connection establishment time, message latency
3. Add development-mode monitoring display
4. Track orphaned connections and cleanup effectiveness

**Key Resources**:
- Pattern: Connection state management in `useRealtimeMeetings.tsx:12`
- Reference: Performance logging in `useUnifiedRaceRealtime.ts:62`
- Documentation: Monitoring patterns in architectural guides

**Implementation Details**:
- Add connection health state to subscription hooks
- Implement metrics tracking for key performance indicators
- Create development-mode health display component
- Add logging for connection lifecycle events

---

## Low Impact Tasks (Enhancement - Week 3)

### Task 9: Add Environment Variable Validation
**Status**:
- ► Not Started
- In Progress
- Complete

**Priority**: Low
**Impact**: Better developer experience and error detection

**Problem**: Missing Appwrite environment variables fall back to placeholder values without clear error indication.

**Strategy**:
1. Enhance environment variable validation in appwrite-client.ts
2. Add descriptive error messages for missing configuration
3. Implement development-mode configuration health check
4. Provide clear guidance for environment setup

**Key Resources**:
- File: `/client/src/lib/appwrite-client.ts:6`
- Pattern: Existing validation logic
- Documentation: Environment configuration guidance

**Implementation Details**:
- Enhance validation with specific error messages
- Add configuration health check utility
- Implement development-mode startup validation
- Provide actionable error messages with setup guidance

### Task 10: Create Real-Time Performance Dashboard (Low Priority Monitoring)
**Status**:
- ► Not Started
- In Progress
- Complete

**Priority**: Low
**Impact**: Development and debugging tool for connection analysis

**Problem**: No integrated tool for monitoring real-time connection performance, subscription health, or debugging connection issues during development.

**Strategy**:
1. Create toggleable dashboard component accessible via button in race page header
2. Display active subscriptions, connection metrics, message rates
3. Show connection health indicators and orphaned connection detection
4. Implement as development-only feature with production safety guards

**Key Resources**:
- Location: Next to user configuration button in race page header
- Pattern: Configuration UI patterns in existing header components
- Data Source: Connection health monitoring from Task 7

**Implementation Details**:
- Create dashboard component with subscription metrics display
- Add toggle button next to user configuration settings
- Implement real-time metrics collection and display
- Include connection health indicators and cleanup status
- Add production safety guards to exclude from builds

---

## Performance Optimizations Section

### Possible Performance Improvements for Self-Hosted Appwrite

#### Server-Side Configuration
**_APP_WORKER_PER_CORE Setting**:
- Current default: 6 workers per core
- Recommended for high-concurrency: 8-10 workers per core
- Monitor CPU usage and adjust accordingly
- Setting: Add `_APP_WORKER_PER_CORE=10` to server .env file

#### Connection Optimization Settings
**Enhanced Environment Variables** (possible client-side additions):
```bash
# WebSocket Optimization
NEXT_PUBLIC_APPWRITE_REALTIME_ENDPOINT=wss://appwrite.warricksmith.com/v1/realtime
NEXT_PUBLIC_APPWRITE_CONNECTION_TIMEOUT=30000
NEXT_PUBLIC_APPWRITE_RETRY_ATTEMPTS=3
NEXT_PUBLIC_APPWRITE_RECONNECT_DELAY=1000

# Performance Settings
NEXT_PUBLIC_SUBSCRIPTION_THROTTLE_MS=50
NEXT_PUBLIC_CONNECTION_DRAIN_MS=100
```

#### Self-Hosted TLS Configuration
**Self-Signed Certificate Support**:
- Add optional `NEXT_PUBLIC_APPWRITE_SELF_SIGNED=true` environment variable
- Call `.setSelfSigned(true)` on client when enabled
- Required for self-hosted deployments with self-signed certificates
- Prevents WebSocket negotiation failures with untrusted certificate chains

#### Database Query Optimization
**Indexing Strategy**:
- Ensure indexes on frequently queried fields: `entrant`, `raceId`, `timeInterval`, `type`
- Composite indexes for money-flow-history collection: `[entrant, raceId, type]`, `[raceId, timeInterval]`
- Monitor query performance for real-time subscription filters

#### Caching Strategy Enhancement
**Race Status-Aware Caching**:
- Longer cache expiry for completed races (permanent cache)
- Shorter cache (30 seconds) for active races
- Implement cache invalidation on race status changes
- Use connection health metrics to optimize cache timing

---

## Implementation Timeline

### Week 1 - Critical Issues
- Days 1-2: Fix Meetings Page Over-Subscription (Task 1)
- Days 3-4: Eliminate Redundant Pool Data Subscriptions (Task 2)
- Day 5: Remove NextScheduledRaceButton Redundant Subscription (Task 3)

### Week 2 - Important Optimizations
- Days 1-2: Optimize Channel Subscriptions to Document-Level (Task 4)
- Days 3-4: Implement Coordinated Navigation Cleanup (Task 5)
- Day 5: Fix Hard-coded Appwrite Project ID (Task 6)

### Week 3 - Enhancements
- Days 1-2: Implement Connection Health Monitoring (Task 7)
- Days 3-4: Optimize Entrant Subscription Initialization (Task 8)
- Day 5: Add Environment Variable Validation (Task 9) + Performance Dashboard (Task 10)

## Success Metrics

### Expected Performance Improvements
- **90% reduction** in WebSocket connections (multiple → single per page)
- **70% reduction** in unnecessary event processing
- **50% improvement** in connection establishment time
- **100% elimination** of orphaned connections
- **Significant improvement** in "real-time data vs dummy data" issues

### Monitoring Indicators
- Active subscription count per page
- Message processing latency
- Connection establishment time
- Cleanup completion rate
- Orphaned connection detection

---

## Conclusion

This plan addresses the critical real-time connection performance issues while maintaining architectural integrity. The prioritized approach ensures immediate impact from high-priority fixes while building toward comprehensive optimization. The separate subscription strategies for Meetings and Race pages preserve existing efficient patterns while eliminating performance bottlenecks.

Key focus areas:
1. **Eliminate redundant subscriptions** violating Appwrite best practices
2. **Optimize subscription targeting** to reduce unnecessary data flow
3. **Ensure proper cleanup coordination** during navigation
4. **Implement monitoring capabilities** for ongoing performance visibility

Implementation of this plan should resolve the "real data not reaching UI" issues affecting user experience while establishing a robust foundation for scalable real-time functionality.
