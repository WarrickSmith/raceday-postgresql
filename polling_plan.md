# Client Polling Implementation Plan - RaceDay v4.8 (Revised)

## Executive Summary

This document outlines the revised implementation strategy for a client-side polling system for the RaceDay application, replacing the failing hybrid fetch-and-realtime strategy. The polling strategy provides a predictable, controllable data update mechanism that follows server polling frequencies with an optional 2x multiplier for enhanced data freshness.

### Key Changes from Original Plan

- **Simplified scope**: Remove complex optimizations, caching, and fetch pooling to focus on core functionality
- **New initial task**: Remove all real-time functionality and fix infinite fetch loop
- **Updated polling cadence**: Based on actual backend server functions analysis
- **Fallback values**: Always show '-' instead of dummy values
- **No fetch stacking**: Prevent multiple simultaneous requests for same data
- **Meetings page polling**: Unique 5-minute intervals while races are active
- **Revised monitoring**: Consolidated "Polling Monitor" component with connection status
- **Explicit cleanup**: Every task includes cleanup and validation subtasks

---

## Polling Cadence Reference

The client polling strategy mirrors backend polling cadence with an **optional 2× multiplier** via environment variable:

| Backend Interval | Trigger Window | Default Client Interval | 2x Mode Interval | Notes |
|------------------|----------------|------------------------|------------------|-------|
| 30 minutes | Early open status (>65m before race) | 30 minutes | 15 minutes | Early morning baseline |
| 2.5 minutes | Active period (5-60m before race) | 2.5 minutes | 75 seconds | Active proximity polling |
| 30 seconds | Critical period (≤5m before/after race) | 30 seconds | 15 seconds | Until race status becomes Final |

### Environment Configuration
- `DOUBLE_POLLING_FREQUENCY=true` enables 2x polling frequency (default: false)

---

## Current Architecture Context

### Server Polling Patterns (Reference)

**Master Scheduler**: `/server/master-race-scheduler/src/main.js`

- Runs every 1 minute via CRON
- Coordinates high-frequency polling via enhanced-race-poller

**Dynamic Intervals Based on Race Timing:**

```
T-65m+: 30-minute intervals (baseline capture)
T-5m to T-3m: 30-second intervals (0.5 minutes)
T-3m to Start: 30-second intervals (0.5 minutes)
Post-start: 30-second intervals until Final
```

### API Endpoints Available for Polling

- `/client/src/app/api/race/[id]/route.ts` - Race data
- `/client/src/app/api/race/[id]/money-flow-timeline/route.ts` - Money flow data
- `/client/src/app/api/race/[id]/pools/route.ts` - Pool data
- `/client/src/app/api/race/[id]/entrants/route.ts` - Entrants data

---

## Implementation Tasks

### Task 1: Remove Real-time Functionality and Fix Infinite Loop (Highest Priority)

**Status**: Completed
**Priority**: Critical
**Estimated Effort**: 8 hours

**Problem Statement**:
Remove all client application real-time functionality to reset the application to a simple fetch-only state. Fix the infinite fetch loop on the meetings page that causes excessive API calls.

**Task Details**:

1. **Remove Real-time Hooks and Components**:
   - Delete `/client/src/hooks/useUnifiedRaceRealtime.ts`
   - Delete `/client/src/hooks/useOptimizedRealtime.ts`
   - Remove any other real-time subscription hooks
   - Remove real-time connection monitoring components

   _Progress Update (In Progress)_: Audited client surfaces and began removing all real-time subscriptions and monitoring utilities prior to implementing fetch-only behavior.
   _Completion Update_: Removed legacy real-time subscriptions/monitors and converted race and meetings experiences to single-fetch flows with retry support only.

2. **Fix Infinite Meetings Fetch Loop**:
   - Fix dependency issue in `useMeetingsPolling.tsx` line 176 where `pollMeetings` callback causes infinite re-renders
   - Ensure meetings page correctly does initial fetch but no polling implementation yet

3. **Reset Race Pages to Fetch-Only**:
   - Update race page components to only do initial data fetch
   - Remove all polling logic from race components
   - Ensure proper TypeScript types with no 'any' types

4. **Clean Up Legacy Code**:
   - Remove all real-time subscription imports and dependencies
   - Delete unused real-time test files and utilities
   - Remove obsolete connection context providers
   - Clean up any commented-out real-time code
   - Remove unused types and interfaces related to real-time functionality

5. **Validation Steps** (before marking task complete):
   - Run TypeScript checks (`npx tsc --noEmit`)
   - Run ESLint (`npm run lint`)
   - Run tests (`npm test`)
   - Verify no 'any' types introduced
   - Confirm no unused imports or dead code remains
   - Test with Playwright MCP server to ensure pages load correctly

**Reference Information**:
- Current real-time hooks: `useUnifiedRaceRealtime.ts`, `useOptimizedRealtime.ts`
- Meetings infinite loop: `useMeetingsPolling.tsx:176`
- Race page components using real-time functionality

**Acceptance Criteria**:
- [ ] All real-time subscription functionality removed
- [ ] Meetings page infinite fetch loop fixed
- [ ] Race pages display initial data correctly without polling
- [ ] No TypeScript errors or 'any' types
- [ ] All tests pass with ESLint compliance
- [ ] Application loads correctly with basic fetch functionality
- [ ] All legacy code cleaned up with no dead imports or files

**Testing Requirements**:
- Use Playwright MCP server to test page loads and data display
- Allow time for web pages to fetch and render from busy server
- Verify no excessive API calls or infinite loops

---

### Task 2: Create Client-Side Polling Infrastructure

**Status**: Not Started
**Priority**: Critical
**Estimated Effort**: 12 hours

**Problem Statement**:
Create a clean, simple polling infrastructure that follows backend server frequencies with optional 2x multiplier for enhanced data freshness.

**Task Details**:

1. **Create Core Polling Hook** (`/client/src/hooks/useRacePolling.ts`):
   ```typescript
   interface PollingConfig {
     raceId: string
     raceStartTime: string
     raceStatus: string
     initialData: RaceData
     onDataUpdate: (data: RaceData) => void
     onError: (error: Error) => void
   }

   export function useRacePolling(config: PollingConfig) {
     // Simple dynamic interval calculation
     // Basic polling state management
     // Simple error handling without complex retry logic
     // Stop when race status becomes 'final'
   }
   ```

2. **Implement Cadence Calculator**:
   - Early morning (>65m): 30min default, 15min with DOUBLE_POLLING_FREQUENCY
   - Active (5-60m): 2.5min default, 75s with DOUBLE_POLLING_FREQUENCY
   - Critical (≤5m): 30s default, 15s with DOUBLE_POLLING_FREQUENCY
   - Use actual server function intervals from analysis

3. **Add Simple Polling Lifecycle**:
   - Start polling only after initial data loads successfully
   - Active/stopped states (no complex pause/resume)
   - Automatic stop when race status becomes 'final' or 'abandoned'

4. **Basic Error Handling**:
   - Simple retry with exponential backoff (no circuit breakers initially)
   - Request deduplication to prevent stacking API calls
   - Fallback to showing '-' for missing data (no dummy values)

5. **Clean Up Legacy Code**:
   - Remove any references to old polling implementations
   - Clean up unused polling-related types or utilities
   - Remove obsolete API client methods if any
   - Delete any temporary or experimental polling files

6. **Validation Steps** (before marking task complete):
   - Run TypeScript checks (`npx tsc --noEmit`)
   - Run ESLint (`npm run lint`)
   - Run tests (`npm test`)
   - Verify no 'any' types introduced
   - Confirm no unused imports or dead code remains
   - Test polling intervals with Playwright MCP server

**Reference Information**:
- Server intervals: `/server/master-race-scheduler/src/main.js` lines 918-969
- Enhanced poller: `/server/enhanced-race-poller/src/main.js`

**Acceptance Criteria**:
- [ ] Polling intervals match backend frequency exactly (with optional 2x multiplier)
- [ ] Polling starts only after initial data load succeeds
- [ ] Polling stops automatically for completed races
- [ ] Simple error handling prevents request storms
- [ ] No TypeScript errors or 'any' types
- [ ] ESLint compliance
- [ ] All legacy code cleaned up

**Testing Requirements**:
- Test polling intervals with Playwright MCP server
- Verify no fetch stacking for same data requests
- Allow adequate time for server response testing

---

### Task 3: Implement Dynamic Polling Intervals

**Status**: Not Started
**Priority**: High
**Estimated Effort**: 6 hours

**Problem Statement**:
Client polling intervals need to dynamically adjust based on race timing and status, following the backend frequency requirements with optional 2x multiplier.

**Task Details**:

1. **Create Simple Interval Calculation**:
   ```typescript
   function calculatePollingInterval(
     timeToStart: number,
     raceStatus: string,
     doubleFrequency: boolean = false
   ): number {
     const multiplier = doubleFrequency ? 0.5 : 1;
     if (timeToStart > 65) return 30 * 60 * 1000 * multiplier; // 30min or 15min
     if (timeToStart > 5) return 2.5 * 60 * 1000 * multiplier; // 2.5min or 75s
     return 30 * 1000 * multiplier; // 30s or 15s
   }
   ```

2. **Add Race Status Awareness**:
   - Stop polling when status becomes 'final' or 'abandoned'
   - Handle race status transitions cleanly
   - No complex timing calculations initially

3. **Environment Variable Integration**:
   - Read `DOUBLE_POLLING_FREQUENCY` from environment
   - Default to false if not configured
   - Add to `.env.example` with documentation

4. **Clean Up Legacy Code**:
   - Remove any old interval calculation methods
   - Clean up unused timing utilities
   - Remove obsolete race status handling code
   - Delete any experimental timing implementations

5. **Validation Steps** (before marking task complete):
   - Run TypeScript checks (`npx tsc --noEmit`)
   - Run ESLint (`npm run lint`)
   - Run tests (`npm test`)
   - Verify no 'any' types introduced
   - Confirm no unused imports or dead code remains
   - Test both normal and double frequency modes with Playwright

**Acceptance Criteria**:
- [ ] Client intervals match backend frequencies per analysis
- [ ] DOUBLE_POLLING_FREQUENCY environment variable works correctly
- [ ] Polling stops when race status becomes 'final'
- [ ] No TypeScript errors or 'any' types
- [ ] Added to `.env.example` with developer notes
- [ ] All legacy code cleaned up

**Testing Requirements**:
- Test with both normal and double frequency modes
- Verify polling stops correctly when races finish
- Use Playwright to validate timing behavior

---

### Task 4: Add Simple Error Handling and Fallbacks

**Status**: Not Started
**Priority**: High
**Estimated Effort**: 4 hours

**Problem Statement**:
Polling requires basic error handling and graceful degradation without complex circuit breakers or caching initially.

**Task Details**:

1. **Simple Exponential Backoff**:
   ```typescript
   class SimplePollingErrorHandler {
     private retryCount = 0
     private maxRetries = 3
     private baseDelay = 1000

     calculateBackoffDelay(): number {
       return Math.min(this.baseDelay * Math.pow(2, this.retryCount), 10000)
     }
   }
   ```

2. **Prevent Request Stacking**:
   - Check if request is already in progress before making new request
   - Cancel previous request if new one starts
   - Essential for money flow data to prevent conflicts

3. **Fallback to '-' Values**:
   - Show '-' for missing odds, money values, pool totals
   - No dummy/fake values that confuse users
   - Clear indication when data is not available

4. **Clean Up Legacy Code**:
   - Remove old error handling utilities or classes
   - Clean up unused fallback value constants or methods
   - Remove obsolete request management code
   - Delete any complex retry or circuit breaker implementations

5. **Validation Steps** (before marking task complete):
   - Run TypeScript checks (`npx tsc --noEmit`)
   - Run ESLint (`npm run lint`)
   - Run tests (`npm test`)
   - Verify no 'any' types introduced
   - Confirm no unused imports or dead code remains
   - Test error scenarios with network interruptions using Playwright

**Acceptance Criteria**:
- [ ] No stacked requests for same data
- [ ] Shows '-' for missing values (no dummy data)
- [ ] Simple retry logic works without complex patterns
- [ ] User sees clear data state indicators
- [ ] All legacy error handling code cleaned up

**Testing Requirements**:
- Test error scenarios with network interruptions
- Verify no request stacking occurs
- Validate fallback value display

---

### Task 5: Add Polling Coordination Logic

**Status**: Not Started
**Priority**: High
**Estimated Effort**: 6 hours

**Problem Statement**:
Multiple data sources (race data, entrants, pools, money flow) need simple coordinated polling without complex optimizations initially.

**Task Details**:

1. **Simple Polling Coordinator**:
   ```typescript
   interface RaceDataSources {
     race: RaceData
     entrants: Entrant[]
     pools: PoolData
     moneyFlow: MoneyFlowData[]
   }

   export function useCoordinatedRacePolling(
     raceId: string,
     initialData: any
   ): RaceDataSources {
     // Simple sequential API calls
     // Same polling interval for all data sources
     // Basic error handling
   }
   ```

2. **Sequential Request Pattern**:
   - Make API calls in sequence, not parallel initially
   - 200ms delays between requests to prevent server overload
   - Same polling interval for all data types (no separate money flow polling)

3. **Simple Data Consistency**:
   - All data sources use same polling interval
   - Basic timestamp tracking
   - No complex version management initially

4. **Clean Up Legacy Code**:
   - Remove old coordination or orchestration code
   - Clean up unused data source management utilities
   - Remove obsolete batch processing implementations
   - Delete any complex data synchronization code

5. **Validation Steps** (before marking task complete):
   - Run TypeScript checks (`npx tsc --noEmit`)
   - Run ESLint (`npm run lint`)
   - Run tests (`npm test`)
   - Verify no 'any' types introduced
   - Confirm no unused imports or dead code remains
   - Test coordinated polling with Playwright

**Acceptance Criteria**:
- [ ] All race data sources poll together at same interval
- [ ] Sequential requests prevent server overload
- [ ] No complex optimizations initially
- [ ] Same cadence for all data including money flow
- [ ] All legacy coordination code cleaned up

**Testing Requirements**:
- Verify coordinated polling with Playwright
- Test server load with sequential requests
- Allow time for busy server responses

---

### Task 6: Create Meetings Page Polling

**Status**: Not Started
**Priority**: Medium
**Estimated Effort**: 4 hours

**Problem Statement**:
Meetings page needs separate polling schedule of 5-minute intervals while races are active, providing race details for navigation buttons.

**Task Details**:

1. **Create Meetings Polling Hook**:
   - 5-minute polling intervals while active races exist
   - Stop polling when all races finished
   - Provide data for Next Scheduled and Next Race buttons

2. **Fix Infinite Loop**:
   - Remove `pollMeetings` from useEffect dependency array in `useMeetingsPolling.tsx`
   - Ensure proper cleanup and no infinite re-renders

3. **Navigation Integration**:
   - Meeting polling should provide race details for navigation
   - Support Next Scheduled Race and Next Race buttons on both meetings and race pages

4. **Clean Up Legacy Code**:
   - Remove old meetings polling implementations
   - Clean up unused meeting-related utilities
   - Remove obsolete navigation or routing code
   - Delete any experimental meetings polling approaches

5. **Validation Steps** (before marking task complete):
   - Run TypeScript checks (`npx tsc --noEmit`)
   - Run ESLint (`npm run lint`)
   - Run tests (`npm test`)
   - Verify no 'any' types introduced
   - Confirm no unused imports or dead code remains
   - Test meetings polling and navigation with Playwright

**Reference Information**:
- Current infinite loop: `useMeetingsPolling.tsx:176`
- Navigation buttons: `NextScheduledRaceButton` component

**Acceptance Criteria**:
- [ ] Meetings poll every 5 minutes when races are active
- [ ] Infinite fetch loop completely resolved
- [ ] Navigation buttons work correctly with polling data
- [ ] No TypeScript errors or 'any' types
- [ ] All legacy meetings code cleaned up

**Testing Requirements**:
- Verify 5-minute polling intervals
- Test navigation functionality with Playwright
- Ensure no infinite loops occur

---

### Task 7: Client Configuration and Monitoring (Moved up)

**Status**: Not Started
**Priority**: Medium
**Estimated Effort**: 8 hours

**Problem Statement**:
Polling behavior needs to be configurable and monitorable for debugging once basic infrastructure is in place.

**Task Details**:

1. **Consolidate Monitoring Display**:
   - Move all monitoring data into expandable "Polling Monitor" component above Enhanced Entrants Grid
   - Keep only Latency and Status in race page header permanently
   - Remove real-time subscription counters (Connections, Channels) as no longer needed

2. **Environment Configuration**:
   ```typescript
   // .env.local variables
   DOUBLE_POLLING_FREQUENCY=false
   NEXT_PUBLIC_POLLING_ENABLED=true
   NEXT_PUBLIC_POLLING_DEBUG_MODE=false
   NEXT_PUBLIC_POLLING_TIMEOUT=10000
   ```

3. **Polling Monitor Component**:
   - Rename to "Polling Monitor" (not Connection Monitor)
   - Visible only in development mode with .env.local toggle
   - Focus on race page data polling metrics
   - Reference `polling-monitor.png` for component example

4. **Basic Metrics Tracking**:
   - Track request counts, error rates, latency per endpoint
   - Simple success/failure rates
   - No complex caching or performance optimizations initially

5. **Clean Up Legacy Code**:
   - Remove old connection monitoring components
   - Clean up unused real-time subscription counters
   - Remove obsolete monitoring utilities or metrics
   - Delete any complex performance tracking implementations

6. **Validation Steps** (before marking task complete):
   - Run TypeScript checks (`npx tsc --noEmit`)
   - Run ESLint (`npm run lint`)
   - Run tests (`npm test`)
   - Verify no 'any' types introduced
   - Confirm no unused imports or dead code remains
   - Test development mode toggle with Playwright

**Reference Information**:
- Monitor component example: `polling-monitor.png` in project root
- Current monitoring components in race header and footer

**Acceptance Criteria**:
- [ ] Polling Monitor component displays correctly in development mode
- [ ] Essential race header display maintained (Latency, Status)
- [ ] Obsolete real-time counters removed
- [ ] All environment variables added to .env.example with documentation
- [ ] Component positioned above Enhanced Entrants Grid
- [ ] All legacy monitoring code cleaned up

**Testing Requirements**:
- Test development mode toggle functionality
- Verify component layout with Playwright
- Validate monitoring metrics accuracy

---

### Task 8: Update Race Page Components for Polling Integration

**Status**: Not Started
**Priority**: Medium
**Estimated Effort**: 6 hours

**Problem Statement**:
Race page components need to integrate with new polling hooks while maintaining user experience.

**Task Details**:

1. **Update Core Components**:
   - `RacePageContent.tsx`: Integrate with polling hooks
   - `EnhancedEntrantsGrid.tsx`: Handle polling data updates
   - `RaceDataHeader.tsx`: Show polling status
   - `RaceFooter.tsx`: Display polling metadata

2. **Remove Real-time Integration**:
   - Remove all real-time subscription code
   - Remove real-time connection monitoring
   - Clean up any subscription cleanup logic

3. **Polling Status Indicators**:
   - Show when data is being updated vs current
   - Display last update timestamps
   - Clear error messaging when polling fails

4. **Data Display Updates**:
   - Components re-render on polling data updates
   - Show '-' for missing values (no dummy data)
   - Maintain existing animations and visual feedback

5. **Clean Up Legacy Code**:
   - Remove all real-time subscription imports from components
   - Clean up unused component props related to real-time
   - Remove obsolete component state or effects
   - Delete any commented-out real-time integration code

6. **Validation Steps** (before marking task complete):
   - Run TypeScript checks (`npx tsc --noEmit`)
   - Run ESLint (`npm run lint`)
   - Run tests (`npm test`)
   - Verify no 'any' types introduced
   - Confirm no unused imports or dead code remains
   - Test component rendering and updates with Playwright

**Acceptance Criteria**:
- [ ] Components render correctly with polling data
- [ ] All real-time subscription code removed
- [ ] User experience remains smooth and responsive
- [ ] Loading states and error handling work properly
- [ ] Data updates are visually clear to users
- [ ] All legacy component code cleaned up

**Testing Requirements**:
- Test component rendering with Playwright
- Verify smooth data updates and animations
- Validate error state handling

---

### Task 9: Testing and Validation

**Status**: Not Started
**Priority**: High
**Estimated Effort**: 8 hours

**Problem Statement**:
Ensure polling provides excellent data quality and user experience while meeting backend frequency requirements.

**Task Details**:

1. **Integration Testing**:
   ```typescript
   describe('Polling Data Consistency', () => {
     it('should follow backend polling frequencies')
     it('should handle race status transitions correctly')
     it('should stop polling when race status becomes final')
     it('should prevent request stacking')
     it('should show fallback values correctly')
   })
   ```

2. **Playwright Testing**:
   - Load testing under various race conditions
   - Network interruption scenarios
   - Background tab behavior
   - Mobile device compatibility
   - Allow extra time for busy server responses

3. **Environment Variable Testing**:
   - Test both normal and double frequency modes
   - Verify development mode toggles work correctly
   - Validate configuration documentation

4. **Clean Up Legacy Code**:
   - Remove old test files related to real-time functionality
   - Clean up unused test utilities or mocks
   - Remove obsolete test configuration or setup files
   - Delete any experimental or temporary test implementations

5. **Validation Steps** (before marking task complete):
   - Run TypeScript checks (`npx tsc --noEmit`)
   - Run ESLint (`npm run lint`)
   - Run all tests (`npm test`)
   - Verify no 'any' types introduced
   - Confirm no unused imports or dead code remains
   - Complete full Playwright test suite execution

**Reference Information**:
- Current testing patterns in `/client/src/hooks/__tests__/`
- Playwright MCP server for browser testing

**Acceptance Criteria**:
- [ ] All integration tests pass
- [ ] Polling frequencies validated against backend
- [ ] Error recovery works in failure scenarios
- [ ] User experience tested across devices
- [ ] Environment configuration fully validated
- [ ] All legacy test code cleaned up

**Testing Requirements**:
- Use Playwright MCP server for comprehensive testing
- Allow adequate time for server responses and rendering
- Test both normal and double frequency configurations

---

### Task 10: Update Architecture Documentation

**Status**: Not Started
**Priority**: Low
**Estimated Effort**: 4 hours

**Problem Statement**:
The polling implementation requires updated documentation to reflect the simplified approach and removal of real-time functionality.

**Task Details**:

1. **Update Core Documentation**:
   - Update CLAUDE.md to reflect polling-only architecture
   - Document environment variables and their usage
   - Remove real-time subscription references

2. **Add Polling-Specific Documentation**:
   - Document backend polling frequency matching
   - Add troubleshooting guide for polling issues
   - Document the simplified approach rationale

3. **Clean Up Obsolete References**:
   - Remove real-time subscription documentation
   - Update hook usage examples
   - Clean up connection monitoring references

4. **Clean Up Legacy Code**:
   - Remove old documentation files related to real-time
   - Clean up unused documentation assets or images
   - Remove obsolete architecture diagrams
   - Delete any outdated README or guide files

5. **Validation Steps** (before marking task complete):
   - Run TypeScript checks (`npx tsc --noEmit`)
   - Run ESLint (`npm run lint`)
   - Run tests (`npm test`)
   - Verify documentation accuracy with implemented code
   - Confirm no dead links or obsolete references remain
   - Review documentation completeness

**Reference Information**:
- Current documentation: `/CLAUDE.md`
- Original polling plan for reference structure

**Acceptance Criteria**:
- [ ] Documentation reflects polling-only architecture
- [ ] Environment variables fully documented
- [ ] Real-time references removed
- [ ] Troubleshooting guides are actionable
- [ ] All legacy documentation cleaned up

---

## Implementation Timeline

### Phase 1: Reset and Foundation (Tasks 1-2)
**Duration**: 3 weeks
**Priority**: Critical path - must complete before other tasks

1. Remove real-time functionality and fix infinite loop (Task 1)
2. Create basic polling infrastructure (Task 2)

### Phase 2: Core Implementation (Tasks 3-6)
**Duration**: 3 weeks
**Priority**: Essential functionality

3. Dynamic polling intervals (Task 3)
4. Error handling and fallbacks (Task 4)
5. Polling coordination (Task 5)
6. Meetings page polling (Task 6)

### Phase 3: Integration and Quality (Tasks 7-9)
**Duration**: 3 weeks
**Priority**: User experience and monitoring

7. Configuration and monitoring (Task 7)
8. Race page integration (Task 8)
9. Testing and validation (Task 9)

### Phase 4: Documentation (Task 10)
**Duration**: 1 week
**Priority**: Maintainability

10. Update documentation (Task 10)

**Total Estimated Duration**: 10 weeks

---

## Success Metrics

### Technical Metrics
- **Polling Frequency Compliance**: Client intervals match backend frequencies exactly (with optional 2x)
- **No Request Stacking**: Multiple concurrent requests for same data eliminated
- **Error Rate**: Polling error rate below 5%
- **Clean Data Display**: All fallback values show '-' instead of dummy data
- **Code Quality**: Zero 'any' types, full ESLint compliance, no dead code

### User Experience Metrics
- **Perceived Performance**: Smooth data updates without confusion
- **Reliability**: Consistent and predictable data delivery
- **Error Recovery**: Clear messaging when polling encounters issues

### Development Metrics
- **Code Simplicity**: Clean, maintainable polling implementation
- **No Complex Patterns**: Avoid optimizations like caching, circuit breakers initially
- **TypeScript Compliance**: No 'any' types, full type safety
- **Test Coverage**: Comprehensive Playwright and unit test coverage
- **Legacy Cleanup**: No unused code or imports remaining

---

## Risk Mitigation

### High-Risk Areas
1. **Infinite Loop Regression**: Fix meetings polling dependency issue permanently
2. **Request Stacking**: Ensure robust deduplication especially for money flow data
3. **Backend Load**: Monitor server impact of polling frequency changes
4. **User Confusion**: Clear fallback values ('-') instead of dummy data
5. **Code Debt**: Systematic cleanup prevents accumulation of dead code

### Implementation Risks
1. **Scope Creep**: Resist adding complex optimizations until core functionality proven
2. **Performance**: Monitor polling impact on mobile devices and battery life
3. **Testing Coverage**: Ensure Playwright tests account for busy server response times
4. **Legacy Issues**: Thorough cleanup prevents conflicts with old code

---

## Conclusion

This revised implementation plan focuses on creating a robust, simple polling system that replaces the failing real-time functionality. The approach prioritizes:

- **Reliability**: Simple, predictable polling patterns
- **Maintainability**: Clean code without complex optimizations initially, with systematic cleanup
- **User Experience**: Clear data states and smooth updates
- **Flexibility**: Environment-configurable polling frequencies
- **Code Quality**: Comprehensive cleanup and validation at every step

Success depends on methodical implementation, thorough testing with realistic server conditions, systematic cleanup of legacy code, and maintaining focus on core functionality over premature optimization.