# Phase 5 Implementation Plan: Real-Time Data Flow Enhancement

## Backgrond Knowledge Required for Context

- Ensure you review the background Money Flow Architecture document at docs/Money-Flow-Timeline-System-Architecture.md to understand the concepts of how data is polled, and aggrigated into 'buckets' for display on the client in timeline colums.
- Ensure you review the Brief document at /home/warrick/Dev/raceday/UI-UX Brief.txt to understand the current issues and deficiencies with the current implementation.
- Review this current plan document to understand how the issues from the brief are being addressed.

## Problem Statement

The Race Page money flow grid is not receiving and displaying enough real-time data regularly enough to be effective in its primary purpose to rapidly display changes in entrant (runner) money pool amounts and odds at regular enough frequency periods to properly populate the defined timeline columns.

### Key Issues Identified:

1. **Insufficient Polling Frequency**: Timeline shows gaps of 10+ minutes with consecutive "—" values across all entrants
2. **Race Status Update Failures**: Race showed "DELAYED 63:44" but actually started at scheduled time (status became CLOSED)
3. **Complex Function Coordination**: Three separate polling functions with duplicated logic causing scheduling conflicts
4. **Client-Side Performance Issues**: Excessive console logging and 14+ second active column switching delays
5. **Database Schema Gaps**: Missing critical fields for proper race filtering and timeline calculations

### Evidence from Screenshots:

- **Screenshot 1**: Race shows "DELAYED 63:44" with sparse timeline data and many empty cells ("—")
- **Screenshot 2**: After refresh, race shows "CLOSED" with results, indicating subscription didn't update in real-time
- Timeline columns show significant gaps with no data between intervals despite active betting periods

## Task Summary & Progress Tracking

### Status Legend

- 🟡 **Pending** - Not started
- 🔵 **In Progress** - Currently being worked on
- 🟢 **Complete** - Finished successfully

### Current Phase 5 Tasks

| Task ID | Status | Priority | Task Name                             | Dependencies | Description                                                  |
| ------- | ------ | -------- | ------------------------------------- | ------------ | ------------------------------------------------------------ |
| **A1**  | 🟡     | HIGH     | Database Schema Enhancements          | None         | Add missing fields and indexes for timeline calculations     |
| **A2**  | 🟡     | HIGH     | Unified Polling Architecture          | A1           | Replace 3 separate functions with enhanced-race-poller       |
| **A3**  | 🟡     | HIGH     | Enhanced Master Scheduler             | A2           | Fix 30s gaps with 2.5min intervals during critical periods   |
| **A4**  | 🟡     | LOW      | Daily Initialization Functions Review | A1           | Review timing and compatibility with new schema              |
| **A5**  | 🟡     | MEDIUM   | Server-Side Incremental Calculations  | A1, A2       | Add mathematical validation and consistency checks           |
| **B1**  | 🟡     | HIGH     | Subscription Architecture Fix         | A2           | Fix real-time status updates not reaching UI                 |
| **B2**  | 🟡     | MEDIUM   | Timeline Processing Optimization      | B1           | Reduce 14+ second active column switching delays             |
| **B3**  | 🟡     | LOW      | Performance & Logging Cleanup         | B2           | Remove excessive console logging, add performance monitoring |
| **B4**  | 🟡     | LOW      | Data Display Enhancements             | B1, B2       | Add loading states and data freshness indicators             |
| **C1**  | 🟡     | MEDIUM   | Race Status Coordination              | A2, B1       | Ensure status changes propagate properly across system       |
| **C2**  | 🟡     | MEDIUM   | Data Validation & Quality Assurance   | A5           | Add comprehensive data quality validation and monitoring     |

### Developer Instructions

#### 🎯 **Next Task Recommendation**: Start with **Task A1** (Database Schema Enhancements)

- **Why**: Foundation task - other tasks depend on these database changes
- **Files**: `/server/daily-meetings/src/database-setup.js`
- **Estimated Time**: 2-3 hours
- **Validation**: Schema changes deployed and indexes created successfully

#### 📋 **Current Status Summary**

- **Total Tasks**: 11
- **Pending**: 11 (100%)
- **In Progress**: 0 (0%)
- **Complete**: 0 (0%)

#### 🔄 **Recommended Task Order**

1. **Phase A (Backend)**: A1 → A2 → A3 → A5 → A4
2. **Phase B (Client)**: B1 → B2 → B4 → B3
3. **Phase C (Integration)**: C1 → C2

#### ⚠️ **Critical Dependencies**

- A1 must be completed before A2, A5, B1
- A2 must be completed before A3, B1, C1
- B1 must be completed before B2, B4, C1

---

## Implementation Strategy

### Part A: Backend Data Management Enhancement

#### Task A1: Database Schema Enhancements

**Current Problem**: Missing critical fields for proper timeline calculations and race filtering
**Files to Modify**:

- `/server/daily-meetings/src/database-setup.js`

**Changes Required**:

```javascript
// Enhanced money-flow-history collection fields
{ key: 'type', type: 'string', size: 30 }, // Extend to support 'bucketed_aggregation'
{ key: 'totalPoolAmount', type: 'integer' }, // Total pool for calculations
{ key: 'intervalType', type: 'string', size: 10 }, // '10m', '5m', '2m', '1m', '30s'
{ key: 'winPoolPercentage', type: 'float' }, // Win-specific percentage
{ key: 'placePoolPercentage', type: 'float' }, // Place-specific percentage
{ key: 'dataQualityScore', type: 'integer' }, // 0-100 data completeness
{ key: 'mathematicallyConsistent', type: 'boolean' }, // Pool sum validation
{ key: 'pollingLatencyMs', type: 'integer' }, // Performance monitoring
{ key: 'isStale', type: 'boolean' }, // Data freshness indicator
```

**Additional Indexes Required**:

- `idx_race_id` (critical missing index for race filtering)
- `idx_data_quality_score` (for filtering reliable data)
- `idx_is_stale` (for freshness queries)

#### Task A2: Unified Polling Architecture

**Current Problem**: Three separate functions (race-data-poller, single-race-poller, batch-race-poller) with duplicated logic
**Solution**: Create unified `enhanced-race-poller` function

**Files to Create**:

- `/server/enhanced-race-poller/src/main.js`
- `/server/enhanced-race-poller/src/api-client.js` (consolidated from existing functions)
- `/server/enhanced-race-poller/src/database-utils.js` (enhanced with new validation)
- `/server/enhanced-race-poller/src/error-handlers.js`
- `/server/enhanced-race-poller/package.json`

**Key Features**:

- Intelligent race filtering based on status and proximity to start time
- Dynamic batch sizing (1-10 races) based on urgency
- Enhanced error handling and recovery mechanisms
- Mathematical validation of pool consistency
- Performance monitoring and latency tracking

**Notes**

- Existing Appwrite server race-data-poller correctly processes race and moneyflow data (older DB schema) and should be used as a reference.
- The existing Appwrite race-data-poller uses utility functions in utils.js to help manage Appwrite MariaDB limitation in some attrin=bute types and collection attribute number limitations. You should research these limitations and reference the working functions.
- Always test the new unified polling archihitecture function by running it in the local terminal and verify correct DB data for money flow, before deploying the new function.

#### Task A3: Enhanced Master Scheduler

**Current Problem**: 30-second gaps during critical 5m-0s period
**File to Modify**: `/server/master-race-scheduler/src/main.js`

**Enhanced Polling Schedule** (Corrected based on mathematical requirements):

```javascript
// Early baseline polling (9:00am NZ - 60m before race)
if (timeToStart > 60) return 30 // Every 30 minutes (baseline for 60m column)
// Active polling (60m - 5m before race)
else if (timeToStart > 5)
  return 2.5 // Every 2.5 minutes (guarantees 5m column coverage)
// Critical period (5m - 0s)
else if (timeToStart > 0) return 0.5 // Every 30 seconds (1m column coverage)
// Post-start polling
else if (raceStatus === 'Open') return 0.5 // Every 30 seconds until Closed
else if (raceStatus === 'Closed' || raceStatus === 'Running')
  return 0.5 // Until Interim
else if (raceStatus === 'Interim') return 2 // Every 2 minutes until Final
else return null // Stop polling Final/Abandoned races
```

**Critical Design Logic**:

- **30-minute early polling**: Ensures 60m column has real pool data (not empty)
- **2.5-minute intervals**: Mathematical guarantee to hit every 5-minute column boundary
- **30-second critical**: Covers every 1-minute column during final approach
- **Column integrity**: Polling frequency always higher than column resolution

**Enhancements**:

- Priority scheduling for races in critical periods (5m-0s)
- Dynamic race grouping for optimal batch sizes
- Comprehensive logging for debugging polling gaps
- Race completion detection to stop unnecessary polling

#### Task A4: Daily Initialization Functions Review

**Current Functions Analysis**:

- `daily-meetings`: Runs at 8:00 PM NZ - Creates meeting and race structure
- `daily-races`: Runs after daily-meetings - Populates race details and entrants
- `daily-initial-data`: Runs at 8:30 PM NZ - Creates baseline odds and money flow data

**Impact on Enhanced Polling Strategy**:

**✅ No Changes Required for**:

- `daily-meetings`: Meeting structure setup remains unchanged
- `daily-races`: Race and entrant population works with enhanced schema
- `meeting-status-poller`: 30-minute meeting status checks are independent of race polling

**⚠️ Potential Enhancement for**:

- `daily-initial-data`: Currently runs at 8:30 PM NZ, but our strategy needs baseline data from 9:00 AM NZ - This should be ok and is a low priority to check at the end of implementation.
- **Consideration**: The 8:30 PM initial data creates overnight baseline, then 9:00 AM polling begins the day's money flow tracking. Note raceday execution time are for NZ standard time not UTC, so CRON jobs are created to take into account local NZ time.
- **Conclusion**: Current timing works - overnight baseline + 9:00 AM start covers full day cycle

**Files That May Need Minor Updates**:

- `/server/daily-initial-data/src/main.js`: Ensure it creates proper baseline data for 60m columns
- Database schema updates will automatically be available to all daily functions via shared database-setup.js

#### Task A5: Server-Side Incremental Calculations

**Current Problem**: Inconsistent client-side calculations and missing mathematical validation
**Files to Enhance**:

- `/server/enhanced-race-poller/src/database-utils.js`
- All existing polling function database-utils.js files (maintain consistency)

**Key Improvements**:

```javascript
// Enhanced bucket calculation logic
const calculateIncrementalAmounts = async (
  entrantId,
  currentData,
  databases
) => {
  // Query for previous bucket
  const previousBucket = await findPreviousBucket(
    entrantId,
    currentData.timeInterval
  )

  // Calculate Win and Place increments separately
  const incrementalWin =
    currentData.winPoolAmount - (previousBucket?.winPoolAmount || 0)
  const incrementalPlace =
    currentData.placePoolAmount - (previousBucket?.placePoolAmount || 0)

  // Validate increments (should not be negative)
  if (incrementalWin < 0 || incrementalPlace < 0) {
    logger.warn('Negative increment detected', {
      entrantId,
      incrementalWin,
      incrementalPlace,
    })
  }

  return { incrementalWin, incrementalPlace }
}

// Mathematical consistency validation
const validatePoolConsistency = (entrantIncrements, totalPoolGrowth) => {
  const sumOfIncrements = entrantIncrements.reduce((sum, inc) => sum + inc, 0)
  const difference = Math.abs(sumOfIncrements - totalPoolGrowth)
  const isConsistent = difference / totalPoolGrowth < 0.01 // Within 1%

  return {
    isConsistent,
    difference,
    consistencyScore: Math.max(0, 100 - (difference / totalPoolGrowth) * 100),
  }
}
```

### Part B: Client-Side Real-Time Improvements

#### Task B1: Subscription Architecture Fix

**Current Problem**: Race status changes not reaching UI in real-time
**File to Modify**: `/client/src/hooks/useAppwriteRealtime.ts`

**Key Fixes**:

```typescript
// Enhanced subscription channels with proper filtering
const setupSubscriptions = () => {
  // Race-specific subscription with better event filtering
  const raceChannel = `databases.raceday-db.collections.races.documents.${raceId}`
  const moneyFlowChannel = `databases.raceday-db.collections.money-flow-history.documents`

  const unsubscribe = client.subscribe(
    [raceChannel, moneyFlowChannel],
    (response) => {
      // Enhanced event processing with race filtering
      const isRaceEvent = response.events?.some(
        (event) =>
          event.includes(`races.${raceId}`) ||
          (event.includes('races') && response.payload?.$id === raceId)
      )

      const isMoneyFlowEvent = response.events?.some(
        (event) =>
          event.includes('money-flow-history') &&
          (response.payload?.raceId === raceId ||
            entrantIds.includes(response.payload?.entrant))
      )

      if (isRaceEvent) {
        processRaceUpdate(response.payload)
      } else if (isMoneyFlowEvent) {
        processMoneyFlowUpdate(response.payload)
      }
    }
  )
}
```

**Additional Improvements**:

- Connection health monitoring with automatic reconnection
- Subscription status indicators for debugging
- Optimized update throttling (reduce from 250ms to 100ms during critical periods)

#### Task B2: Timeline Processing Optimization

**Current Problem**: 14+ second delays in active column switching
**File to Modify**: `/client/src/hooks/useMoneyFlowTimeline.ts`

**Key Optimizations**:

```typescript
// Smart column activation based on race timing
const calculateActiveColumn = useCallback(() => {
  const now = new Date()
  const raceStart = new Date(race.startTime)
  const timeToStartMinutes = (raceStart.getTime() - now.getTime()) / (1000 * 60)

  // Determine active column with more frequent updates during critical period
  let activeInterval
  if (timeToStartMinutes > 60) activeInterval = 60
  else if (timeToStartMinutes > 55) activeInterval = 55
  // ... continuing pattern with 30-second precision for 5m-0s period
  else if (timeToStartMinutes > 0.5)
    activeInterval = Math.ceil(timeToStartMinutes)
  else if (timeToStartMinutes > 0) activeInterval = 0
  else activeInterval = Math.floor(-timeToStartMinutes) // Post-start columns

  return activeInterval
}, [race.startTime])

// Update active column every second during critical period
useEffect(() => {
  const now = new Date()
  const raceStart = new Date(race.startTime)
  const timeToStartMinutes = (raceStart.getTime() - now.getTime()) / (1000 * 60)

  // More frequent updates during critical 5m-0s period
  const updateInterval =
    timeToStartMinutes <= 5 && timeToStartMinutes >= 0 ? 1000 : 5000

  const interval = setInterval(() => {
    setActiveColumn(calculateActiveColumn())
  }, updateInterval)

  return () => clearInterval(interval)
}, [race.startTime, calculateActiveColumn])
```

#### Task B3: Performance & Logging Cleanup

**Current Problem**: Excessive console logging impacting client performance
**Files to Clean**:

- `/client/src/hooks/useAppwriteRealtime.ts`
- `/client/src/hooks/useMoneyFlowTimeline.ts`
- `/client/src/hooks/useRealtimeRace.ts`
- `/client/src/components/race-view/EnhancedEntrantsGrid.tsx`

**Logging Strategy**:

```typescript
// Development-only debug logging
const DEBUG = process.env.NODE_ENV === 'development'

// Replace excessive console.log with conditional logging
const debugLog = (message: string, data?: any) => {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`, data)
  }
}

// Keep essential error logging
const errorLog = (message: string, error: any) => {
  console.error(`[ERROR] ${message}`, error)
}

// Performance monitoring for critical operations
const performanceLog = (operation: string, startTime: number) => {
  const duration = Date.now() - startTime
  if (duration > 1000) {
    // Log only slow operations
    console.warn(`[PERF] ${operation} took ${duration}ms`)
  }
}
```

#### Task B4: Data Display Enhancements

**Current Problem**: Empty "—" cells don't indicate data freshness or loading states
**File to Modify**: `/client/src/components/race-view/EnhancedEntrantsGrid.tsx`

**UI Improvements**:

```typescript
// Enhanced cell display with freshness indicators
const formatTimelineCell = (entrantId: string, interval: number) => {
  const cellData = getEntrantDataForInterval(entrantId, interval, poolType)
  const lastUpdate = getLastUpdateTime(entrantId, interval)
  const isStale = lastUpdate && Date.now() - lastUpdate.getTime() > 60000 // 1 minute
  const isPending = isPollingInterval(interval)

  if (isPending) {
    return <LoadingSpinner size="sm" />
  } else if (cellData === '—') {
    return (
      <span className={isStale ? 'text-gray-400' : 'text-gray-600'}>—</span>
    )
  } else {
    return (
      <span
        className={`${
          isStale ? 'text-orange-500' : 'text-green-600'
        } font-mono`}
      >
        {cellData}
        {isStale && <StaleDataIcon />}
      </span>
    )
  }
}

// Active column highlighting with smooth transitions
const getColumnClasses = (interval: number) => {
  const isActive = interval === activeColumn
  const isNext = interval === getNextActiveColumn()

  return classNames('timeline-column transition-all duration-300', {
    'bg-blue-100 border-blue-300 shadow-md': isActive,
    'bg-blue-50 border-blue-200': isNext,
    'hover:bg-gray-50': !isActive && !isNext,
  })
}
```

### Part C: Data Flow Consolidation

#### Task C1: Race Status Coordination

**Current Problem**: Status changes not properly coordinated between functions and clients
**Files to Enhance**:

- All server polling functions
- `/client/src/hooks/useRealtimeRace.ts`

**Status Change Detection**:

```javascript
// Server-side status change tracking
const trackRaceStatusChange = async (
  raceId,
  oldStatus,
  newStatus,
  databases
) => {
  const statusChangeTimestamp = new Date().toISOString()
  const updateData = {
    status: newStatus,
    lastStatusChange: statusChangeTimestamp,
  }

  // Add specific timestamps for important status changes
  if (newStatus === 'Final' || newStatus === 'Finalized') {
    updateData.finalizedAt = statusChangeTimestamp
  } else if (newStatus === 'Abandoned') {
    updateData.abandonedAt = statusChangeTimestamp
  } else if (newStatus === 'Closed') {
    updateData.bettingClosedAt = statusChangeTimestamp
  }

  await databases.updateDocument('raceday-db', 'races', raceId, updateData)

  // Log status change for monitoring
  console.log(`Race ${raceId} status changed: ${oldStatus} → ${newStatus}`, {
    timestamp: statusChangeTimestamp,
    raceId: raceId.slice(-8), // Last 8 chars for privacy
  })
}
```

#### Task C2: Data Validation & Quality Assurance

**Current Problem**: No validation of mathematical consistency in pool data
**Implementation**: Add to all server polling functions

**Validation Logic**:

```javascript
const validateRacePoolData = async (raceData, entrantData) => {
  const validationResults = {
    isValid: true,
    errors: [],
    warnings: [],
    consistencyScore: 100,
  }

  // Validate pool sum consistency
  const totalWinPool =
    raceData.tote_pools?.find((p) => p.product_type === 'Win')?.total || 0
  const totalPlacePool =
    raceData.tote_pools?.find((p) => p.product_type === 'Place')?.total || 0

  const sumWinAmounts = entrantData.reduce(
    (sum, e) => sum + (e.win_pool_amount || 0),
    0
  )
  const sumPlaceAmounts = entrantData.reduce(
    (sum, e) => sum + (e.place_pool_amount || 0),
    0
  )

  const winConsistency = Math.abs(totalWinPool - sumWinAmounts) / totalWinPool
  const placeConsistency =
    Math.abs(totalPlacePool - sumPlaceAmounts) / totalPlacePool

  if (winConsistency > 0.05) {
    // >5% difference
    validationResults.errors.push(
      `Win pool sum mismatch: ${winConsistency * 100}%`
    )
    validationResults.isValid = false
  }

  if (placeConsistency > 0.05) {
    // >5% difference
    validationResults.errors.push(
      `Place pool sum mismatch: ${placeConsistency * 100}%`
    )
    validationResults.isValid = false
  }

  // Calculate overall consistency score
  validationResults.consistencyScore = Math.max(
    0,
    100 - (winConsistency + placeConsistency) * 50
  )

  return validationResults
}

const saveDataWithValidation = async (
  entrantId,
  bucketData,
  validationResults
) => {
  const documentData = {
    ...bucketData,
    dataQualityScore: validationResults.consistencyScore,
    mathematicallyConsistent: validationResults.isValid,
    validationErrors: JSON.stringify(validationResults.errors),
    lastValidationTime: new Date().toISOString(),
  }

  // Only save data that meets minimum quality threshold
  if (validationResults.consistencyScore >= 70) {
    await databases.createDocument(
      'raceday-db',
      'money-flow-history',
      'unique()',
      documentData
    )
  } else {
    console.warn('Data quality below threshold, not saved', {
      entrantId: entrantId.slice(-8),
      score: validationResults.consistencyScore,
      errors: validationResults.errors,
    })
  }
}
```

## Implementation Phases

### Phase 5A: Backend Foundation (Days 1-3)

1. **Day 1**: Database schema updates and enhanced indexes
2. **Day 2**: Unified polling function development with corrected 2.5-minute intervals
3. **Day 3**: Enhanced master scheduler with mathematical polling guarantees (30min early, 2.5min active, 30s critical)

### Phase 5B: Client Optimization (Days 4-6)

4. **Day 4**: Real-time subscription fixes and connection monitoring
5. **Day 5**: Timeline processing optimization and performance cleanup
6. **Day 6**: UI enhancements for data freshness and loading states

### Phase 5C: Integration & Testing (Days 7-9)

7. **Day 7**: End-to-end testing with live race data
8. **Day 8**: Data validation implementation and mathematical consistency checks
9. **Day 9**: Production deployment, monitoring, and performance validation

## Success Metrics

### Quantitative Targets:

- **Timeline Coverage**: >90% of critical 5m-0s period populated with data (currently <50%)
- **Real-Time Latency**: <2 seconds from database change to UI update (currently >14 seconds)
- **Active Column Switching**: <3 seconds delay when timeline advances (currently >14 seconds)
- **Subscription Uptime**: >98% connection reliability for active races
- **Mathematical Accuracy**: Pool calculations within 1% consistency (validate with existing API totals)
- **Console Log Reduction**: 80% reduction in client-side logging volume

### Qualitative Improvements:

- **No Consecutive Empty Columns**: Eliminate multiple consecutive "—" columns during active betting periods
- **Real-Time Status Updates**: Race status changes appear without requiring page refresh
- **Smooth Timeline Experience**: Seamless column activation and data population
- **Data Quality Indicators**: Visual feedback for stale or missing data
- **Performance Optimization**: Responsive UI during high-frequency updates

## Monitoring & Validation

### Real-Time Monitoring:

- Dashboard showing polling frequency per race (target: every 30s for critical period)
- Client subscription health indicators (connection status, last update times)
- Data quality scores and mathematical consistency metrics
- Timeline column population rates (% of expected data points present)

### Testing Scenarios:

1. **Critical Period Testing**: Monitor 5m-0s period for multiple races simultaneously
2. **Status Change Validation**: Verify DELAYED → CLOSED → INTERIM → FINAL transitions
3. **Mathematical Consistency**: Validate pool increment sums match total growth
4. **Performance Load Testing**: Ensure system handles 10+ active races simultaneously
5. **Subscription Recovery**: Test automatic reconnection after network interruptions

## Risk Mitigation

### Deployment Strategy:

- **Blue-Green Deployment**: Maintain existing functions during enhanced function rollout
- **Feature Flags**: Enable enhanced polling gradually (start with 1 race, expand to all)
- **Rollback Plan**: Ability to quickly revert to existing function architecture
- **Monitoring Alerts**: Immediate notification if polling frequency drops below thresholds

### Data Integrity:

- **Backup Strategy**: Preserve all existing money flow data during schema updates
- **Validation Logging**: Comprehensive logging of data quality issues for investigation
- **Graceful Degradation**: System continues functioning with reduced frequency if issues occur
- **Manual Override**: Ability to manually trigger polling for critical races

This comprehensive plan addresses the root causes of insufficient real-time data updates while improving system architecture, performance, and reliability. The phased approach ensures systematic implementation with validation at each step.
