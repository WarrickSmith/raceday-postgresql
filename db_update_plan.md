# Database Consolidation Plan for Performance Optimization

## Problem Statement
Appwrite Server Functions are experiencing performance issues due to excessive data fetching from NZTAB API and unnecessary data storage/processing, affecting connected client applications.

## Data Flow Analysis - Functions That Process Race Data

### Primary Data Writers (Independent Processing):
1. **daily-meetings** - Creates meetings, races, and entrants (initial import)
2. **daily-races** - Creates/updates races and entrants (comprehensive race details)
3. **enhanced-race-poller** - Updates races, entrants, and money flow (real-time polling)

### Dependent Functions (Call Primary Functions):
4. **daily-initial-data** - Calls `enhanced-race-poller` function (line 211-215)
5. **master-race-scheduler** - Orchestrates polling, calls `enhanced-race-poller`

### Non-Data Functions:
6. **meeting-status-poller** - Only updates meeting status
7. **database-setup** - Schema creation only

## Phase 1: API Parameter Optimization (High Impact, Low Risk)
**Status**: Completed

### Task 1.1: Implement Conditional API Parameters in Enhanced Race Poller
- **Problem**: Enhanced poller fetches all optional data regardless of race status
- **Files**:
  - `server/enhanced-race-poller/src/api-client.js:20-26`
- **Changes**:
  - Add race status parameter to `fetchRaceEventData` function
  - Conditional inclusion of expensive parameters:
    - `with_big_bets=true` only for races with status 'open'/'interim'
    - `with_live_bets=true` only for races with status 'open'/'interim'
    - Keep `with_money_tracker=true`, `with_tote_trends_data=true` (essential)
    - Remove `with_will_pays=true` for finalized/abandoned races
- **Expected Impact**: 35% reduction in API response size for completed races
- **Tests**: Verify money flow timeline functionality preserved

### Task 1.2: Implement Conditional API Parameters in Daily Races
- **Problem**: Daily races function fetches comprehensive data for all races
- **Files**:
  - `server/daily-races/src/api-client.js:70-75`
- **Changes**:
  - Apply same conditional parameter logic as Task 1.1
  - Modify `fetchRaceEventData` to accept optional parameters object
- **Expected Impact**: 30% reduction in initial race data processing time
- **Tests**: Verify initial race import maintains essential data

## Phase 2: Database Schema Optimization (High Impact, Medium Risk)
**Status**: Completed

### Task 2.1: Remove Notifications Collection Entirely
- **Problem**: Unused collection consuming resources
- **Files**:
  - `server/database-setup/src/database-setup.js:41,418,536-577`
- **Changes**: Remove notifications collection from schema setup
- **Expected Impact**: Eliminate unused collection overhead
- **Tests**: Verify no client dependencies exist

### Task 2.2: Optimize Races Collection (Remove unused attributes)
- **Problem**: 74% of races collection attributes unused by client
- **Client Usage**: Only `raceId`, `name`, `raceNumber`, `startTime`, `status`, `distance`, `trackCondition`, `weather`, `type`, `meeting`, `resultsAvailable`, `resultsData`, `dividendsData`, `fixedOddsData`, `resultStatus`
- **Removed From Schema (archived for rollback)**:
  ```
  trackHomeStraight, startType, group, class, gait, genderConditions,
  ageConditions, weightConditions, allowanceConditions, specialConditions,
  jockeyConditions, formGuide, comment, ffwinOptionNumber, fftop3OptionNumber,
  mileRate400, mileRate800, dataSource, description, trackDirection, railPosition
  ```
- **Reinstated After QA Review**:
  ```
  actualStart, toteStartTime, startTimeNz, raceDateNz, trackSurface,
  totalPrizeMoney, entrantCount, fieldSize, positionsPaid, silkUrl,
  silkBaseUrl, videoChannels
  ```
- **Files to Update**:
  - `server/database-setup/src/database-setup.js:784-836`
- **Expected Impact**: 60% reduction in races collection storage

### Task 2.3: Optimize Entrants Collection (Remove unused attributes)
- **Problem**: 50% of entrants collection attributes unused by client
- **Client Usage**: Only `entrantId`, `name`, `runnerNumber`, `jockey`, `trainerName`, `isScratched`, `race`, `winOdds`, `placeOdds`, `poolWinOdds`, `poolPlaceOdds`, `holdPercentage`, `silkColours`, `silkUrl64`, `silkUrl128`
- **Removed From Schema (archived for rollback)**:
  ```
  apprenticeIndicator, gear, weight, allocatedWeight, totalWeight, allowanceWeight,
  marketName, primaryMarket, settlingLengths, age, sex, colour, foalingDate,
  sire, dam, breeding, owners, trainerLocation, country, prizeMoney, bestTime,
  lastTwentyStarts, winPercentage, placePercentage, rating, handicapRating,
  classLevel, firstStartIndicator, formComment, dataSource
  ```
- **Reinstated After QA Review**:
  ```
  barrier, raceId
  ```
- **Files to Update**:
  - `server/database-setup/src/database-setup.js:1004-1044`
- **Expected Impact**: 45% reduction in entrants collection storage

### Phase 2 Removal Audit Log
- **Collections removed**:
  - `notifications` (unused Appwrite collection removed to reduce maintenance overhead)
- **Races collection attributes archived for potential rollback**:
  ```
  trackHomeStraight, startType, group, class, gait, genderConditions,
  ageConditions, weightConditions, allowanceConditions, specialConditions,
  jockeyConditions, formGuide, comment, ffwinOptionNumber, fftop3OptionNumber,
  mileRate400, mileRate800, dataSource, description, trackDirection, railPosition
  ```
- **Races attributes reinstated after QA**:
  ```
  actualStart, toteStartTime, startTimeNz, raceDateNz, trackSurface,
  totalPrizeMoney, entrantCount, fieldSize, positionsPaid, silkUrl,
  silkBaseUrl, videoChannels
  ```
- **Entrants collection attributes archived for potential rollback**:
  ```
  apprenticeIndicator, gear, weight, allocatedWeight, totalWeight, allowanceWeight,
  marketName, primaryMarket, settlingLengths, age, sex, colour, foalingDate,
  sire, dam, breeding, owners, trainerLocation, country, prizeMoney, bestTime,
  lastTwentyStarts, winPercentage, placePercentage, rating, handicapRating,
  classLevel, firstStartIndicator, formComment, dataSource
  ```
- **Entrants attributes reinstated after QA**:
  ```
  barrier, raceId
  ```

## Phase 3: Data Processor Optimization (Medium Impact, Low Risk)
**Status**: Completed

### Task 3.1: Update Daily Meetings Data Processing
- **Problem**: Processes unused race/entrant attributes
- **Files**:
  - `server/daily-meetings/src/database-utils.js:74-150` (meetings processing)
- **Changes**:
  - Remove processing for unused race attributes identified in Task 2.2
  - Streamline meeting document creation (already optimized)
- **Expected Impact**: 20% reduction in initial meeting processing time

### Task 3.2: Update Daily Races Data Processing
- **Problem**: Transforms and stores unused data
- **Files**:
  - `server/daily-races/src/database-utils.js:140-150` (race processing)
  - `server/daily-races/src/data-processors.js:89-135` (race transformation)
- **Changes**:
  - Remove transformation logic for unused attributes from `transformRaceData`
  - Update race document creation to exclude unused fields
  - Update entrant processing to exclude unused attributes from `transformEntrantData`
- **Expected Impact**: 40% reduction in race data processing time

### Task 3.3: Update Enhanced Race Poller Processing
- **Problem**: Processes comprehensive data unnecessarily
- **Files**:
  - `server/enhanced-race-poller/src/database-utils.js:400+` (race/entrant processing)
- **Changes**:
  - Streamline race document updates to exclude unused attributes
  - Optimize entrant processing to focus on essential data only
  - Maintain all money flow and pool processing (critical for timeline)
- **Expected Impact**: 35% reduction in polling processing time

## Phase 4: Self-Contained Function Updates (Critical)
**Status**: Not Started

### Task 4.1: Ensure Data Consistency Across Functions
- **Problem**: Three functions independently process race data with different logic
- **Functions Requiring Identical Updates**:
  - `daily-meetings/src/database-utils.js` (meeting/race creation)
  - `daily-races/src/database-utils.js` (race/entrant creation)
  - `enhanced-race-poller/src/database-utils.js` (race/entrant updates)
- **Requirements**:
  - All three functions must process identical essential attributes
  - Remove same unused attributes from all processors
  - Maintain identical field mapping and validation logic
  - Preserve existing relationship structures

### Task 4.2: Update Dependent Function Integration
- **Problem**: `daily-initial-data` and `master-race-scheduler` rely on enhanced-race-poller
- **Files**:
  - `daily-initial-data/src/main.js:211-215` (function call)
  - `master-race-scheduler/src/main.js` (orchestration logic)
- **Actions**:
  - Verify these functions continue working with optimized enhanced-race-poller
  - Test integration after enhanced-race-poller optimization
  - No direct changes needed (they call functions, don't process data directly)

## Phase 5: Testing and Validation (Critical)
**Status**: Not Started

### Task 5.1: Database Schema Migration Testing
- **Files**: All database-dependent functionality
- **Actions**:
  - Test optimized schema creation with `server/database-setup/src/database-setup.js`
  - Verify existing data compatibility with reduced schema
  - Test client application with optimized data structure
- **Required Tests**: `npm run test`, `npm run lint`, `npm run typecheck`
- **Exit Criteria**: Zero TypeScript errors, no 'any' types, all tests passing

### Task 5.2: API Integration Testing
- **Actions**:
  - Test conditional API parameters across all race status scenarios
  - Verify money flow data integrity maintained
  - Test race status transitions with optimized parameters
- **Success Criteria**: Money flow timeline accuracy preserved

### Task 5.3: Cross-Function Consistency Validation
- **Actions**:
  - Test all three data-writing functions produce consistent race/entrant documents
  - Verify `daily-initial-data` and `master-race-scheduler` integration works
  - Test complete data flow from daily import to real-time updates
- **Success Criteria**: Data consistency across all processing functions

### Task 5.4: Performance Validation
- **Actions**:
  - Benchmark API response times pre/post optimization
  - Measure database write operation performance
  - Test client application responsiveness improvements
- **Success Criteria**:
  - 40%+ reduction in API processing time
  - 55%+ reduction in database storage overhead
  - Improved real-time data responsiveness

## Implementation Notes
- Each function is self-contained with independent deployment
- Changes must be replicated across `daily-meetings`, `daily-races`, and `enhanced-race-poller`
- All functions must maintain identical essential data processing logic
- CRON schedules in appwrite.json use UTC time
- Preserve all money flow timeline functionality (Story 4.9)
- Test `daily-initial-data` integration after `enhanced-race-poller` changes

## Risk Mitigation
- **Data Consistency**: Implement identical attribute processing across all three data functions
- **Integration Testing**: Verify `daily-initial-data` function calls work with optimized `enhanced-race-poller`
- **Rollback Plan**: Maintain original database schema and function versions
- **Incremental Deployment**: Deploy one function at a time with thorough testing

## Expected Outcomes
- **API Performance**: 35% reduction in data fetching overhead
- **Database Performance**: 55% reduction in storage and processing overhead
- **System Scalability**: Better handling of concurrent race polling and updates
- **Client Performance**: Improved real-time responsiveness and reduced data transfer

## Task Status Tracking

### Phase 1: API Parameter Optimization
- [ ] Task 1.1: Implement conditional API parameters in enhanced-race-poller
- [ ] Task 1.2: Implement conditional API parameters in daily-races

### Phase 2: Database Schema Optimization
- [x] Task 2.1: Remove notifications collection entirely
- [x] Task 2.2: Optimize races collection (remove 25 unused attributes)
- [x] Task 2.3: Optimize entrants collection (remove 23 unused attributes)

### Phase 3: Data Processor Optimization
- [x] Task 3.1: Update daily meetings data processing
- [x] Task 3.2: Update daily races data processing
- [x] Task 3.3: Update enhanced race poller processing

### Phase 4: Self-Contained Function Updates
- [ ] Task 4.1: Ensure data consistency across functions
- [ ] Task 4.2: Update dependent function integration

### Phase 5: Testing and Validation
- [ ] Task 5.1: Database schema migration testing
- [ ] Task 5.2: API integration testing
- [ ] Task 5.3: Cross-function consistency validation
- [ ] Task 5.4: Performance validation
