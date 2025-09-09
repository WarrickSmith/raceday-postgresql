# Money Flow Timeline System Architecture

## Introduction

This document serves as the definitive reference for understanding and implementing the Money Flow Timeline system in RaceDay - a real-time horse racing dashboard. The system tracks betting pool changes over time for each race entrant, providing stakeholders with historical and live money flow visualization.

### Architecture Philosophy

The system follows a **server-heavy, client-light** architecture where:

- **Server functions** perform data acquisition, calculation, and storage
- **Client components** focus on presentation and real-time subscriptions
- **Database** serves as the single source of truth for processed timeline data
- **Polling strategy** adapts to race timing for optimal data capture

### Core Objectives

1. **Historical Persistence**: Money flow data available before, during, and after races
2. **Real-time Updates**: Live data streaming to connected clients
3. **Mathematical Accuracy**: Pool calculations that maintain consistency
4. **Performance Optimization**: Server-side processing to minimize client load

---

## 1. NZTAB API Data Acquisition

### API Endpoints

**Primary Endpoint**: `/affiliates/v1/racing/events/{raceId}`

**Required Parameters**:

- `with_money_tracker=true` - Enables entrant liability tracking
- `with_tote_trends_data=true` - Pool totals and trends
- `will_pays=true` - Additional pool information

### Data Structures

#### Money Tracker Data

```javascript
"money_tracker": {
  "entrants": [
    {
      "entrant_id": "uuid-string",
      "hold_percentage": 4.5,    // General percentage of total hold (NOT pool-specific)
      "bet_percentage": 7.2      // General percentage of total bets (NOT pool-specific)
    }
  ]
}
```

**Important**: The API provides general `hold_percentage` and `bet_percentage` values that represent overall entrant activity across all pool types, NOT Win/Place-specific percentages.

#### Pool Data

```javascript
"tote_pools": [
  {
    "product_type": "Win",     // Pool type: Win, Place, Quinella, etc.
    "total": 45320.50,        // Total pool amount in dollars
    "status": "OPEN"          // Pool status
  }
]

// Individual entrant pool amounts are typically found in:
"entrants": [
  {
    "entrant_id": "uuid-string",
    "win_pool_amount": 2341.50,    // Dollars bet on this entrant to Win
    "place_pool_amount": 1456.25   // Dollars bet on this entrant to Place
  }
]
```

### Race Status Progression

- **Open**: Active betting, data collection continues
- **Closed**: Betting closed, race has started
- **Interim**: Race finished, results pending
- **Final**: Race results confirmed, final payouts determined
- **Abandoned**: Race cancelled

### Expected Data Results

- **Response frequency**: Every 10 seconds during active polling
- **Data validation**: Hold percentages should sum to ~100% across all entrants
- **Pool growth**: Pool totals only increase (increase between time intervals may be proportionally greater for one entrant over another resulting in changed pool % for entrants)

---

## 2. Server-Side Data Processing (Appwrite Functions)

### Self-Contained Function Architecture

Four independent Appwrite functions handle different polling scenarios:

#### 2.1 enhanced-race-poller

- **Purpose**: Consolidated and improved race polling with mathematical validation
- **Features**: Enhanced data quality scoring, mathematical consistency checks, dual-phase polling
- **Trigger**: HTTP requests with advanced polling logic
- **Deployment**: `npm run deploy:enhanced-race-poller`
- **Testing**: `npm run enhanced-race-poller`

#### 2.2 race-data-poller

- **Purpose**: Individual race polling on-demand (legacy function)
- **Trigger**: HTTP requests with raceId parameter
- **Deployment**: `npm run deploy:poller`
- **Testing**: `npm run poller`

#### 2.3 single-race-poller

- **Purpose**: Single race monitoring with detailed logging (legacy function)
- **Trigger**: HTTP requests or scheduled events
- **Deployment**: `npm run deploy:single-race`
- **Testing**: `npm run single-race`

#### 2.4 batch-race-poller

- **Purpose**: Multiple race processing for efficiency (legacy function)
- **Trigger**: Scheduled batch operations
- **Deployment**: `npm run deploy:batch-race-poller`
- **Testing**: `npm run batch-race-poller`

### Code Duplication Strategy

**Rationale**: Each function is completely self-contained for Appwrite deployment

- **database-utils.js**: Identical across all functions
- **Dependencies**: Each function includes full node_modules
- **Environment**: Individual .env configuration per function
- **Benefits**: Independent deployment, isolated failures, scalable execution
  **Implementation note:** All Appwrite-based server functions must import and use the Appwrite SDK's Query helpers (for example: `Query.equal`, `Query.greaterThan`, `Query.orderAsc`). Omitting the `Query` import will cause runtime failures in listDocuments queries and lead to fallback behaviour where every record is treated as a baseline. Ensure each function module imports Query alongside other Appwrite helpers, e.g.:

```javascript
import { ID, Query } from 'node-appwrite'
```

### Enhanced Polling Strategy

#### Master Scheduler Coordination

- **Master scheduler** runs every 1 minute (CRON minimum interval)
- **High-frequency polling** delegated to enhanced-race-poller internal loops
- **Autonomous coordination** for all race polling activities

#### Dynamic Interval Timing Based on Race Start

**Updated Strategy**:
```javascript
// Pre-race polling intervals
if (timeToStart > 65) intervalType = '5m'    // 5-minute intervals (early baseline)
else if (timeToStart > 30) intervalType = '5m' // 5-minute intervals  
else if (timeToStart > 5) intervalType = '1m'  // 1-minute intervals
else if (timeToStart > 3) intervalType = '30s' // 30-second intervals (-5m to -3m)
else if (timeToStart > 0) intervalType = '15s' // 15-second intervals (-3m to start)
else intervalType = '15s' // Live updates (post-start until Final)

// Post-race polling
// After Interim status: 30s polling until Final, then stop
```

#### Dual-Phase Polling

- **Early Morning Phase**: Captures 65m+ baseline data for enhanced calculations
- **High-Frequency Phase**: 15-second polling during critical pre-start and live periods

### Expected Processing Results

- **API calls**: 1 per race per polling interval
- **Document creation**: 3-10 documents per poll (entrants × types)
- **Processing time**: <2 seconds per race
- **Error handling**: Enhanced graceful degradation with mathematical validation
- **Data quality scoring**: Automated validation with consistency scores (0-100)
- **Mathematical validation**: Automatic pool sum validation and entrant percentage checks

---

## 3. Money Flow Calculation Logic

### 3.1 Timeline Interval Mapping

**Fixed Pre-Start Intervals**: 60m, 55m, 50m, 45m, 40m, 35m, 30m, 25m, 20m, 15m, 10m, 5m, 4m, 3m, 2m, 1m, 0

**Dynamic Post-Start Intervals**: -0.5m (-30s), -1m, -1.5m (-1:30m), -2m, -2.5m, -3m...

```javascript
function getTimelineInterval(timeToStartMinutes) {
  // Pre-start intervals
  if (timeToStartMinutes >= 60) return 60
  if (timeToStartMinutes >= 55) return 55
  // ... continuing pattern
  if (timeToStartMinutes >= 0) return 0

  // Post-start intervals
  if (timeToStartMinutes >= -0.5) return -0.5
  if (timeToStartMinutes >= -1) return -1
  // ... continuing pattern
}
```

### 3.2 Baseline Calculation (60m Column)

**Purpose**: Establish absolute pool amounts at 60m mark for Win and Place pools separately
**Data source**: Poll from 65m+ to capture recent baseline
**Calculation Strategy**:

```javascript
// Use actual pool amounts from API, not calculated percentages
winPoolAmount = entrantData.win_pool_amount * 100 // Convert to cents
placePoolAmount = entrantData.place_pool_amount * 100 // Convert to cents

// Alternative: Calculate from total pools if individual amounts unavailable
winPoolAmount = totalWinPool * (holdPercentage / 100) * 100 // Fallback method
placePoolAmount = totalPlacePool * (holdPercentage / 100) * 100 // Fallback method
```

**Expected Result**: Separate Win and Place absolute amounts (e.g., Win: $2,341, Place: $1,456) representing money on entrant at 60m for each pool type

### 3.3 Incremental Calculation Logic

**Core Formula**: `incrementalAmount = currentPoolAmount - previousIntervalAmount`

#### Chronological Bucket Query

```javascript
// Query for previous interval (next higher timeInterval value)
const previousQuery = await databases.listDocuments(
  databaseId,
  'money-flow-history',
  [
    Query.equal('entrant', entrantId),
    Query.equal('raceId', raceId),
    Query.equal('type', 'bucketed_aggregation'),
    Query.greaterThan('timeInterval', currentInterval),
Robust previous-bucket lookup algorithm:
1. Query for the nearest previous bucket where timeInterval > currentInterval, ordered ascending, limit 1 (this should return the chronologically closest previous bucket).
2. If no immediate previous bucket is found, query for any prior bucket with non-zero pool data (e.g., Query.notEqual('winPoolAmount', 0)) ordered ascending, limit 1 — this handles gaps where one or more intermediate bucket writes were missed.
3. If still no previous bucket is found, apply the documented fallback policy (baseline vs non-first behavior).
Log concise status information for these steps (match counts and interval IDs). Avoid dumping full document arrays into production logs; reserve full dumps for debug mode only.
    Query.orderAsc('timeInterval'),
    Query.limit(1),
  ]
)

// Calculate increments for both Win and Place pools
incrementalWinAmount = currentWinAmount - (prevDoc.winPoolAmount || 0)
incrementalPlaceAmount = currentPlaceAmount - (prevDoc.placePoolAmount || 0)

// Store separate records for Win and Place if needed
// OR store combined record with both incremental amounts
```

### 3.4 Multiple Polls Within Bucket Period

**Scenario**: Multiple API calls between 55m and 50m
**Handling**: Each new poll overwrites the bucket total
**Logic**: Always use most recent data for time interval
**Result**: Final bucket shows increment from 55m to most recent poll in 50m period

### 3.5 Expected Data Consistency

Fallback policy when previous bucket is unavailable:

- If the timeInterval corresponds to a first/baseline bucket (e.g. 60 or 55): treat the record as baseline and set the increment equal to the current pool total (incrementalWinAmount = winPoolAmount, incrementalPlaceAmount = placePoolAmount).
- If the timeInterval is a non-first bucket and no previous bucket is found: store incrementalWinAmount and incrementalPlaceAmount as explicit 0 (not null). This makes the server’s intent unambiguous and allows the client to display '—' for no change while preserving arithmetic correctness in timeline sums.

- **No negative increments**: Pool amounts only increase
- **Sum validation**: All entrant increments = total pool growth
- **Mathematical check**: `Σ(entrant_increments) = current_pool_total - previous_pool_total`

---

## 4. Database Storage Strategy (Appwrite Collections)

### 4.1 money-flow-history Collection

**Purpose**: Store all money flow data with multiple document types

#### Document Type: win_pool_data

```javascript
{
  entrant: "entrant-uuid",           // Relationship to entrants collection
  raceId: "race-uuid",              // Race identifier
  holdPercentage: 4.5,              // General API percentage (for reference)
  betPercentage: 7.2,               // General API percentage (for reference)
  type: "win_pool_data",            // Document type identifier
  timeToStart: 45,                  // Minutes to race start
  timeInterval: 45,                 // Timeline bucket
  intervalType: "1m",               // Polling frequency indicator
  eventTimestamp: "2025-08-28T...", // When event occurred
  pollingTimestamp: "2025-08-28...", // When data was collected
  winPoolAmount: 123450,            // Win pool amount in cents
  poolType: "win",                  // Pool-specific classification
  // Calculate Win-specific percentage:
  winPoolPercentage: 6.2            // winPoolAmount / totalWinPool * 100
}
```

#### Document Type: place_pool_data

```javascript
{
  // Same structure as win_pool_data but:
  placePoolAmount: 67890,           // Place pool amount in cents
  poolType: "place",                // Pool-specific classification
  // Calculate Place-specific percentage:
  placePoolPercentage: 4.8          // placePoolAmount / totalPlacePool * 100
}
```

#### Document Type: bucketed_aggregation

```javascript
{
  entrant: "entrant-uuid",
  raceId: "race-uuid",
  holdPercentage: 4.5,              // General API percentage (for reference)
  betPercentage: 7.2,               // General API percentage (for reference)
  type: "bucketed_aggregation",     // Pre-calculated timeline data
  timeToStart: 45,
  timeInterval: 45,
  intervalType: "1m",
  winPoolAmount: 123450,            // Absolute Win amount in cents
  placePoolAmount: 67890,           // Absolute Place amount in cents
  winPoolPercentage: 6.2,           // Calculated Win-specific percentage
  placePoolPercentage: 4.8,         // Calculated Place-specific percentage
  incrementalAmount: 5670,          // Backwards compatibility (combined)
  incrementalWinAmount: 5670,       // Win pool increment in cents
  incrementalPlaceAmount: 2340,     // Place pool increment in cents
  pollingTimestamp: "2025-08-28...",
  eventTimestamp: "2025-08-28...",
  poolType: "combined",             // Contains both Win and Place data
  isConsolidated: false             // Processing status
}
```

**Recommended Storage Strategy**: Store combined records with both Win and Place data in each `bucketed_aggregation` document, rather than separate records. This approach:

- Reduces document count by 50%
- Maintains data consistency between pools
- Simplifies client queries
- Provides both pool types in a single timeline query

### 4.2 Data Validation Requirements

**Critical Fields**: Never null/undefined

- `entrant`: Valid entrant UUID
- `raceId`: Valid race UUID
- `timeInterval`: Valid timeline bucket number
- `intervalType`: Valid polling frequency string
- `winPoolAmount/placePoolAmount`: Numeric values (can be 0)
- `incrementalWinAmount/incrementalPlaceAmount`: Numeric values (can be 0)
- `winPoolPercentage/placePoolPercentage`: Calculated values based on actual pool amounts

**Relationship Integrity**:

- `entrant` field must reference valid entrants collection document
- `raceId` field must reference valid races collection document

### 4.3 Expected Storage Results

Client contract for incremental fields and display:

- Server provides `incrementalWinAmount`, `incrementalPlaceAmount`, and/or `incrementalAmount` (stored in cents). The client should:

  - Prefer pool-specific incremental fields (incrementalWinAmount / incrementalPlaceAmount) when present.
  - Fall back to `incrementalAmount` or `0` when pool-specific fields are absent.
  - Treat `0` as "no change" and render an em-dash (—) in timeline cells.
  - Log or flag negative incremental values for investigation (these are unusual and indicate potential data issues).

- **3 document types per polling cycle**: hold, bet, bucketed_aggregation
- **Document volume**: ~50-100 documents per race (17 intervals × 3 types × variable entrants)
- **Storage growth**: Linear with number of races and polling frequency
- **Query performance**: Indexed on entrant, raceId, timeInterval, type fields

---

## 5. Client-Side Presentation Layer

> **Related Documentation**: For foundational client-side real-time integration patterns, Appwrite setup, and general React hooks, see [Client Real-Time Data Integration Guide](./client-real-time-data-integration.md).

### 5.1 React Hook: useMoneyFlowTimeline

**Purpose**: Fetch and subscribe to money flow data with unified real-time subscriptions
**Location**: `/client/src/hooks/useMoneyFlowTimeline.ts`

#### API Endpoint

`/api/race/[id]/money-flow-timeline?entrants=comma,separated,ids`

#### Enhanced Data Handling

**Dual-Path Data Fetching**:
- **Primary**: Bucketed aggregation data with pre-calculated incremental amounts
- **Fallback**: Legacy timeToStart data for backward compatibility
- **Extended Range**: -65 to +66 intervals for comprehensive timeline coverage

#### Data Transformation

```typescript
interface EntrantMoneyFlowTimeline {
  entrantId: string
  dataPoints: Array<MoneyFlowDataPoint> // Chronologically sorted data points
  latestPercentage: number
  trend: 'up' | 'down' | 'neutral'
  significantChange: boolean
}

interface MoneyFlowDataPoint {
  timeInterval: number // Timeline bucket (60, 55, 50...)
  incrementalAmount: number // Server pre-calculated amount
  incrementalWinAmount: number // Server pre-calculated Win pool increment
  incrementalPlaceAmount: number // Server pre-calculated Place pool increment
  poolType: 'win' | 'place' | 'combined' // Pool classification
  timestamp: string // When data was recorded
  poolAmount?: number // Optional absolute pool amount
  winPoolAmount?: number // Win pool amount in cents
  placePoolAmount?: number // Place pool amount in cents
}
```

#### Race Status-Based Subscription Management

- **Active Races**: Live real-time subscriptions enabled
- **Completed Races**: Subscriptions disabled to preserve final state
- **Debounced Updates**: 500ms delay to handle rapid data changes

### 5.2 Timeline Grid Component

**Location**: `/client/src/components/race-view/EnhancedEntrantsGrid.tsx`

#### Column Architecture

- **Fixed Left**: Runner, Win Odds, Place Odds (sticky)
- **Scrollable Center**: Timeline columns (60m through post-start)
- **Fixed Right**: Pool Total, Pool % (sticky)

#### Timeline Column Generation

```typescript
// Static pre-start columns
const preStartColumns = [
  60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 4, 3, 2, 1, 0,
]

// Dynamic post-start columns (if race delayed)
const postStartColumns = generatePostStartColumns(raceStatus, actualStartTime)

// Combined timeline
const timelineColumns = [...preStartColumns, ...postStartColumns]
```

### 5.3 Real-time Updates

**Enhanced Subscription Strategy**: 
- **Channel Format**: `databases.raceday-db.collections.money-flow-history.documents`
- **Unified Subscription**: Single subscription channel for all money flow updates
- **Entrant Filtering**: Real-time filtering to only process relevant entrant updates
- **Update Frequency**: Live updates as server functions create new documents
- **UI Responsiveness**: Value flash animations for changed amounts with `useValueFlash` hook

**Server-Heavy Architecture**:
- **No Client Processing**: Server provides pre-calculated incremental amounts
- **Data Integrity**: All calculations performed and validated server-side
- **Performance**: Minimized client-side computation for optimal responsiveness

### 5.4 Expected Display Results

**60m Column**: Shows absolute amount (e.g., "$2,341")
**Subsequent Columns**: Show incremental changes (e.g., "+$127", "+$43"). There will not be -ve increments
**Empty Cells**: Show "—" for no data or zero increment
**Active Column**: Highlighted based on current time relative to race start

---

## 6. Race Status Handling Strategy

### 6.1 Open Status

- **Polling**: Active at determined intervals
  Logging guidance:
- Use concise status logs for bucket lookups (e.g., "previous-bucket matched", "previous-bucket not found", with entrantId and timeInterval).
- Avoid dumping full document arrays to production logs — reserve document-level dumps for debug mode only.
- Log negative incremental values (if any) as warnings along with entrantId and interval to enable investigation.
- **Data Collection**: All document types created
- **Client Updates**: Live subscription active
- **Display**: Current active column highlighted

### 6.2 Closed Status

- **Polling**: Continues for delayed starts
- **Data Collection**: Maintains timeline integrity
- **Client Updates**: Live updates continue
- **Display**: May trigger post-start column generation

### 6.3 Interim Status

- **Polling**: Continues until Final status
- **Data Collection**: Captures in-race money movements
- **Client Updates**: Live updates active
- **Display**: Post-start columns visible

### 6.4 Final Status

- **Polling**: Stops after final data capture
- **Data Collection**: Preserves complete historical record
- **Client Updates**: Data remains available for viewing
- **Display**: Complete timeline preserved

### 6.5 Abandoned Status

- **Polling**: Smart handling based on existing data
- **Logic**: Continue if historical data exists, skip if no prior activity
- **Data Preservation**: Maintains partial timeline if race was abandoned mid-process
- **Display**: Shows data up to abandonment point

### Expected Behavior

- **Navigation Persistence**: Full timeline data available when returning to race
- **Historical Review**: Complete money flow history for analysis
- **Data Integrity**: No loss of information across status transitions

---

## 7. Development & Testing Tools

### 7.1 NPM Scripts (Server Functions)

> **Related Documentation**: For general performance considerations, caching strategies, and client-side optimization patterns, see [Client Real-Time Data Integration Guide](./client-real-time-data-integration.md#performance-considerations).

#### Deployment Commands

```bash
npm run deploy:meetings          # Deploy daily-meetings function
npm run deploy:races            # Deploy daily-races function
npm run deploy:enhanced-race-poller # Deploy enhanced-race-poller function (recommended)
npm run deploy:poller           # Deploy race-data-poller function (legacy)
npm run deploy:single-race      # Deploy single-race-poller function (legacy)
npm run deploy:batch-race-poller # Deploy batch-race-poller function (legacy)
npm run deploy:master-scheduler  # Deploy master-race-scheduler function
```

#### Local Testing Commands

Post-deploy validation checklist:

- Poll a race repeatedly across multiple intervals and verify that the sum of entrant incremental amounts for an interval equals the total pool growth for that interval (Σ(entrant_increments) == current_pool_total - previous_pool_total).
- Confirm stable pools produce zero incremental amounts for subsequent non-first buckets (incrementalWinAmount/incrementalPlaceAmount === 0).
- Confirm client displays '—' for zero increments and '+$N' for positive increments.
- If any negative increments are detected, log them and investigate whether they are due to pool corrections or data inconsistencies.

```bash
npm run meetings               # Run daily-meetings locally
npm run races                 # Run daily-races locally
npm run enhanced-race-poller   # Run enhanced-race-poller locally (recommended)
npm run poller                # Run race-data-poller locally (legacy)
npm run single-race           # Run single-race-poller locally (legacy)
npm run batch-race-poller     # Run batch-race-poller locally (legacy)
npm run master-scheduler      # Run master-race-scheduler locally
```

#### Environment Management

```bash
npm run vars:all              # Update environment variables for all functions
npm run vars:poller          # Update variables for specific function
```

### 7.2 Environment Configuration

**Location**: `/home/warrick/Dev/raceday/server/.env`

**Required Variables**:

- `APPWRITE_ENDPOINT`: Appwrite server URL
- `APPWRITE_PROJECT_ID`: Project identifier
- `APPWRITE_API_KEY`: Server function authentication key
- `NZTAB_API_BASE_URL`: NZTAB API base URL

Project has theses specified in /home/warrick/Dev/raceday/server/.env for development testing

### 7.3 Local Function Testing

#### Manual Execution

```bash
echo '{"raceId": "race-uuid-here"}' | npm run single-race
```

#### Expected Output

- Environment validation confirmation
- API call logging with response data
- Document creation confirmations
- Processing statistics and timings

### 7.4 Database Inspection

#### Direct Database Query (Example)

```javascript
// Check recent documents
const recent = await databases.listDocuments(
  'raceday-db',
  'money-flow-history',
  [Query.orderDesc('$createdAt'), Query.limit(10)]
)

// Check bucketed documents
const bucketed = await databases.listDocuments(
  'raceday-db',
  'money-flow-history',
  [Query.equal('type', 'bucketed_aggregation'), Query.limit(5)]
)
```

### 7.5 Client Testing (Playwright)

**Important**: Allow adequate rendering time for data population

```javascript
// Navigate to race page
await page.goto('/race/race-uuid-here')

// Wait for data loading
await page.waitForTimeout(3000) // Allow for API calls and rendering

// Verify timeline columns
const timelineColumns = await page
  .locator('[data-testid="timeline-column"]')
  .count()
expect(timelineColumns).toBeGreaterThan(15) // Should have 17+ columns

// Check for money flow data
const moneyFlowCells = await page.locator('[data-testid="money-flow-cell"]')
expect(await moneyFlowCells.first()).not.toContainText('—') // Should have data
```

---

## 8. Data Flow Validation & Troubleshooting

### 8.1 Mathematical Consistency Checks

#### Pool Sum Validation (Win and Place Separate)

```javascript
// Win pool validation
const totalWinIncrement = entrantIncrements.reduce(
  (sum, entrant) => sum + entrant.incrementalWinAmount,
  0
)
const winPoolGrowth = currentWinPoolTotal - previousWinPoolTotal
const isWinConsistent = Math.abs(totalWinIncrement - winPoolGrowth) < 0.01

// Place pool validation
const totalPlaceIncrement = entrantIncrements.reduce(
  (sum, entrant) => sum + entrant.incrementalPlaceAmount,
  0
)
const placePoolGrowth = currentPlacePoolTotal - previousPlacePoolTotal
const isPlaceConsistent = Math.abs(totalPlaceIncrement - placePoolGrowth) < 0.01
```

#### Pool-Specific Percentage Validation

```javascript
// Win pool percentages should sum to ~100%
const totalWinPercentage = entrants.reduce(
  (sum, entrant) => sum + entrant.winPoolPercentage,
  0
)
const isWinValid = totalWinPercentage >= 97 && totalWinPercentage <= 103

// Place pool percentages should sum to ~100%
const totalPlacePercentage = entrants.reduce(
  (sum, entrant) => sum + entrant.placePoolPercentage,
  0
)
const isPlaceValid = totalPlacePercentage >= 97 && totalPlacePercentage <= 103

// General API percentages (for reference only - may not sum to 100%)
const totalHoldPercentage = entrants.reduce(
  (sum, entrant) => sum + entrant.holdPercentage,
  0
)
```

### 8.2 Common Issues & Diagnostics

#### Issue: Timeline Shows "—" Dashes

**Diagnosis**:

- Check if `bucketed_aggregation` documents exist
- Verify `entrant` and `raceId` fields are not null
- Confirm `timeInterval` matches expected timeline columns

#### Issue: Null Values in Database

**Diagnosis**:

- Verify race document exists with valid `startTime`
- Check API response contains `money_tracker` data
- Confirm `racePoolData` is not null during processing

#### Issue: Mathematical Inconsistencies

**Diagnosis**:

- Validate Win pool percentages sum to ~100% (calculated from pool amounts)
- Validate Place pool percentages sum to ~100% (calculated from pool amounts)
- Note: General API `hold_percentage`/`bet_percentage` may NOT sum to 100% (they represent overall activity)
- Check chronological bucket queries return correct previous interval
- Verify pool amounts are converted to cents consistently
- Ensure Win and Place pool data is processed separately

### 8.3 Expected System Performance

**API Response Time**: <500ms for single race data
**Database Write Time**: <100ms per document
**Client Data Loading**: <2 seconds for full timeline
**Real-time Update Latency**: <1 second from server to client

### 8.4 Monitoring & Alerting

**Key Metrics**:

- Document creation success rate (>95%)
- API call success rate (>99%)
- Mathematical consistency rate (>98%)
- Client subscription connection rate (>95%)

**Alert Conditions**:

- No documents created for active race in 10+ minutes
- Hold percentage sum deviates >5% from 100%
- Client timeline shows >50% empty cells for active race

---

## 9. Additional Reference Information

### 9.1 Key File Locations

**Enhanced Server Functions**:

- `/server/enhanced-race-poller/src/database-utils.js` - Enhanced validation and processing
- `/server/master-race-scheduler/src/main.js` - Autonomous polling coordination

**Legacy Server Functions**:

- `/server/race-data-poller/src/database-utils.js`
- `/server/single-race-poller/src/database-utils.js`
- `/server/batch-race-poller/src/database-utils.js`

**Client Components**:

- `/client/src/components/race-view/EnhancedEntrantsGrid.tsx` - Timeline grid with flash animations
- `/client/src/hooks/useMoneyFlowTimeline.ts` - Unified real-time subscription management
- `/client/src/hooks/useValueFlash.ts` - Value change animation handling

**API Routes**:

- `/client/src/app/api/race/[id]/money-flow-timeline/route.ts` - Dual-path data fetching

**Configuration**:

- `/server/.env` - Environment variables
- `/server/package.json` - NPM scripts including enhanced functions
- `/server/appwrite.json` - Function deployment config

### 9.2 Database Collections Schema

**money-flow-history Collection**:

- Primary indexes: entrant, raceId, timeInterval, type
- Composite indexes: [entrant, raceId, type], [raceId, timeInterval]
- Document size: ~500 bytes average
- Expected volume: 10,000+ documents per race meeting

**Related Collections**:

- `races`: Race information with startTime
- `entrants`: Entrant details and relationships
- `meetings`: Race meeting context

### 9.3 Security Considerations

**API Keys**: Server-only access, never exposed to client
**Data Privacy**: Entrant IDs anonymized in logs (last 8 characters only)
**Rate Limiting**: Polling intervals respect NZTAB API limits
**Input Validation**: All API responses validated before database storage

### 9.4 Scalability Notes

**Horizontal Scaling**: Functions can run in parallel across multiple regions
**Database Scaling**: Appwrite Cloud handles automatic scaling
**Client Optimization**: Data pre-aggregated server-side for fast client loading
**Caching Strategy**: Timeline data cached in client state, refreshed on subscription updates
**Enhanced Processing**: Mathematical validation and data quality scoring for reliable scaling

### 9.5 Recent Architecture Improvements (Current Branch)

#### Enhanced Server Architecture
- **Enhanced Race Poller**: Consolidated polling with mathematical validation and data quality scoring
- **Master Scheduler**: Autonomous coordination with 1-minute CRON intervals and delegated high-frequency polling
- **Dual-Phase Polling**: Early morning baseline capture plus high-frequency critical period polling

#### Improved Client Integration
- **Unified Subscriptions**: Single real-time channel with intelligent entrant filtering
- **Server-Heavy Processing**: Pre-calculated incremental amounts eliminate client-side computation
- **Race Status Awareness**: Smart subscription management based on race completion status

#### Database Query Enhancements
- **Dual-Path Fetching**: Bucketed aggregation with legacy fallback support
- **Extended Range**: -65 to +66 intervals for comprehensive timeline coverage
- **Critical Filter Fix**: Proper raceId filtering in database queries

#### Development Workflow Improvements
- **Enhanced Validation**: Automatic mathematical consistency checks and pool sum validation
- **Improved Error Handling**: Graceful degradation with detailed logging and debugging support
- **Legacy Function Support**: Maintains backward compatibility while promoting enhanced functions

This document serves as the complete reference for understanding, implementing, and maintaining the Money Flow Timeline system in RaceDay, incorporating all recent architectural improvements and enhancements from the current development branch.

### NZTAB API Information

**API Documentation**: https://api.tab.co.nz/affiliates/v1/
**API Openapi specification**: /home/warrick/Dev/raceday/docs/nztab/openapi.json
