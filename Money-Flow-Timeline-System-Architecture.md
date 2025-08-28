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

Three independent Appwrite functions handle different polling scenarios:

#### 2.1 race-data-poller

- **Purpose**: Individual race polling on-demand
- **Trigger**: HTTP requests with raceId parameter
- **Deployment**: `npm run deploy:poller`
- **Testing**: `npm run poller`

#### 2.2 single-race-poller

- **Purpose**: Single race monitoring with detailed logging
- **Trigger**: HTTP requests or scheduled events
- **Deployment**: `npm run deploy:single-race`
- **Testing**: `npm run single-race`

#### 2.3 batch-race-poller

- **Purpose**: Multiple race processing for efficiency
- **Trigger**: Scheduled batch operations
- **Deployment**: `npm run deploy:batch-race-poller`
- **Testing**: `npm run batch-race-poller`

### Code Duplication Strategy

**Rationale**: Each function is completely self-contained for Appwrite deployment

- **database-utils.js**: Identical across all functions
- **Dependencies**: Each function includes full node_modules
- **Environment**: Individual .env configuration per function
- **Benefits**: Independent deployment, isolated failures, scalable execution

### Polling Strategy

#### Interval Timing Based on Race Start

```javascript
if (timeToStart > 30) intervalType = '5m' // 5-minute intervals
else if (timeToStart > 5) intervalType = '1m' // 1-minute intervals
else if (timeToStart > 0) intervalType = '30s' // 30-second intervals
else intervalType = 'live' // Live updates
```

### Expected Processing Results

- **API calls**: 1 per race per polling interval
- **Document creation**: 3-10 documents per poll (entrants × types)
- **Processing time**: <2 seconds per race
- **Error handling**: Graceful degradation with logging

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

- **3 document types per polling cycle**: hold, bet, bucketed_aggregation
- **Document volume**: ~50-100 documents per race (17 intervals × 3 types × variable entrants)
- **Storage growth**: Linear with number of races and polling frequency
- **Query performance**: Indexed on entrant, raceId, timeInterval, type fields

---

## 5. Client-Side Presentation Layer

### 5.1 React Hook: useMoneyFlowTimeline

**Purpose**: Fetch and subscribe to money flow data
**Location**: `/client/src/hooks/useMoneyFlowTimeline.ts`

#### API Endpoint

`/api/race/[id]/money-flow-timeline?entrants=comma,separated,ids`

#### Data Transformation

```typescript
interface EntrantMoneyFlowTimeline {
  entrantId: string
  dataPoints: Map<number, MoneyFlowDataPoint> // timeInterval -> data
}

interface MoneyFlowDataPoint {
  timeInterval: number // Timeline bucket (60, 55, 50...)
  incrementalAmount: number // Amount added in this interval
  poolType: 'win' | 'place' // Pool classification
  timestamp: string // When data was recorded
  poolAmount?: number // Optional absolute pool amount
}
```

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

**Subscription Strategy**: Appwrite real-time subscriptions to money-flow-history collection
**Update Frequency**: Live updates as server functions create new documents
**UI Responsiveness**: Value flash animations for changed amounts

### 5.4 Expected Display Results

**60m Column**: Shows absolute amount (e.g., "$2,341")
**Subsequent Columns**: Show incremental changes (e.g., "+$127", "+$43"). There will not be -ve increments
**Empty Cells**: Show "—" for no data or zero increment
**Active Column**: Highlighted based on current time relative to race start

---

## 6. Race Status Handling Strategy

### 6.1 Open Status

- **Polling**: Active at determined intervals
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

#### Deployment Commands

```bash
npm run deploy:meetings          # Deploy daily-meetings function
npm run deploy:races            # Deploy daily-races function
npm run deploy:poller           # Deploy race-data-poller function
npm run deploy:single-race      # Deploy single-race-poller function
npm run deploy:batch-race-poller # Deploy batch-race-poller function
npm run deploy:master-scheduler  # Deploy master-race-scheduler function
```

#### Local Testing Commands

```bash
npm run meetings               # Run daily-meetings locally
npm run races                 # Run daily-races locally
npm run poller                # Run race-data-poller locally
npm run single-race           # Run single-race-poller locally
npm run batch-race-poller     # Run batch-race-poller locally
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

**Server Functions**:

- `/server/race-data-poller/src/database-utils.js`
- `/server/single-race-poller/src/database-utils.js`
- `/server/batch-race-poller/src/database-utils.js`

**Client Components**:

- `/client/src/components/race-view/EnhancedEntrantsGrid.tsx`
- `/client/src/hooks/useMoneyFlowTimeline.ts`

**API Routes**:

- `/client/src/app/api/race/[id]/money-flow-timeline/route.ts`

**Configuration**:

- `/server/.env` - Environment variables
- `/server/package.json` - NPM scripts
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

This document serves as the complete reference for understanding, implementing, and maintaining the Money Flow Timeline system in RaceDay.

### NZTAB API Information

**API Documentation**: https://api.tab.co.nz/affiliates/v1/
**API Openapi specification**: /home/warrick/Dev/raceday/docs/nztab/openapi.json
