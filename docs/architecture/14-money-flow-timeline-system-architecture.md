# 14. Money Flow Timeline System Architecture

## 14.1. System Overview

The Money Flow Timeline system provides comprehensive tracking and visualization of betting pool changes over time for each race entrant. This system follows a **server-heavy, client-light** architecture where server functions perform data acquisition, calculation, and storage, while client components focus on presentation and real-time subscriptions.

**Core Architecture Principles:**
- **NZTAB API Integration:** Direct polling of betting pool data with `with_money_tracker=true` and `with_tote_trends_data=true` parameters
- **Mathematical Validation:** Server-side validation of pool sums and percentage consistency
- **Timeline Calculation:** Pre-calculated incremental amounts stored in database for optimal client performance
- **Real-Time Updates:** Live streaming of money flow changes to connected clients

## 14.2. NZTAB API Data Acquisition

**Primary Endpoint:** `/affiliates/v1/racing/events/{raceId}`
**Required Parameters:**
- `with_money_tracker=true` - Enables entrant liability tracking with `hold_percentage` and `bet_percentage`
- `with_tote_trends_data=true` - Provides pool totals and trend information
- `will_pays=true` - Additional pool information for validation

**Expected Data Structures:**
```javascript
"money_tracker": {
  "entrants": [
    {
      "entrant_id": "uuid-string",
      "hold_percentage": 4.5,    // General percentage across all pool types
      "bet_percentage": 7.2      // General percentage across all pool types
    }
  ]
},
"tote_pools": [
  {
    "product_type": "Win",     // Pool type: Win, Place, Quinella, etc.
    "total": 45320.50,        // Total pool amount in dollars
    "status": "OPEN"          // Pool status
  }
],
"entrants": [
  {
    "entrant_id": "uuid-string",
    "win_pool_amount": 2341.50,    // Dollars bet on this entrant to Win
    "place_pool_amount": 1456.25   // Dollars bet on this entrant to Place
  }
]
```

## 14.3. Enhanced Server Processing

**Self-Contained Function Architecture:**
- `enhanced-race-poller` - Consolidated polling with mathematical validation and data quality scoring
- `master-race-scheduler` - Autonomous coordination with 1-minute CRON intervals
- `race-data-poller` (legacy) - Maintained for backward compatibility
- `single-race-poller` (legacy) - Individual race monitoring
- `batch-race-poller` (legacy) - Multiple race processing

**Dynamic Polling Strategy:**
```javascript
// Enhanced polling intervals based on race timing
if (timeToStart > 65) intervalType = '5m'    // Baseline capture
else if (timeToStart > 30) intervalType = '5m' // Early period  
else if (timeToStart > 5) intervalType = '1m'  // Pre-race buildup
else if (timeToStart > 3) intervalType = '30s' // Critical period
else if (timeToStart > 0) intervalType = '15s' // Final countdown
else intervalType = '15s' // Live updates until Final
```

## 14.4. Timeline Calculation Logic

**Fixed Timeline Intervals:** 60m, 55m, 50m, 45m, 40m, 35m, 30m, 25m, 20m, 15m, 10m, 5m, 4m, 3m, 2m, 1m, 0, -0.5m, -1m, -1.5m, -2m, etc.

**Baseline Calculation (60m Column):**
```javascript
// Establish absolute pool amounts at 60m mark
winPoolAmount = entrantData.win_pool_amount * 100 // Convert to cents
placePoolAmount = entrantData.place_pool_amount * 100 // Convert to cents

// Alternative calculation from total pools if needed
winPoolAmount = totalWinPool * (holdPercentage / 100) * 100
placePoolAmount = totalPlacePool * (holdPercentage / 100) * 100
```

**Incremental Calculation:**
```javascript
// Core formula for money flow changes
incrementalWinAmount = currentWinAmount - (previousDoc.winPoolAmount || 0)
incrementalPlaceAmount = currentPlaceAmount - (previousDoc.placePoolAmount || 0)

// Fallback policy for missing previous buckets
if (isFirstBucket) {
  incrementalWinAmount = winPoolAmount
  incrementalPlaceAmount = placePoolAmount
} else if (!previousBucket) {
  incrementalWinAmount = 0 // Explicit zero for display as '—'
  incrementalPlaceAmount = 0
}
```

## 14.5. Database Storage Strategy

**Document Type: bucketed_aggregation**
```javascript
{
  entrant: "entrant-uuid",           // Relationship to entrants collection
  raceId: "race-uuid",              // Race identifier
  type: "bucketed_aggregation",     // Pre-calculated timeline data
  timeInterval: 45,                 // Timeline bucket (60, 55, 50...)
  intervalType: "1m",               // Polling frequency indicator
  winPoolAmount: 123450,            // Absolute Win amount in cents
  placePoolAmount: 67890,           // Absolute Place amount in cents
  winPoolPercentage: 6.2,           // Win-specific percentage
  placePoolPercentage: 4.8,         // Place-specific percentage
  incrementalWinAmount: 5670,       // Win pool increment in cents
  incrementalPlaceAmount: 2340,     // Place pool increment in cents
  pollingTimestamp: "2025-08-28...", // When data was collected
  eventTimestamp: "2025-08-28...",   // When event occurred
  poolType: "combined",             // Contains both Win and Place data
  isConsolidated: false             // Processing status
}
```

## 14.6. Client-Side Implementation

**React Hook: useMoneyFlowTimeline**
- Dual-path data fetching: bucketed aggregation with legacy fallback
- Race status-based subscription management
- Extended timeline range: -65 to +66 intervals
- Unified real-time subscriptions with intelligent filtering

**Timeline Grid Component Architecture:**
- Fixed left columns: Runner, Win Odds, Place Odds (sticky)
- Scrollable center: Timeline columns with horizontal scrolling
- Fixed right columns: Pool Total, Pool % (sticky)
- Value flash animations for changed amounts

**Display Logic:**
```typescript
interface MoneyFlowDataPoint {
  timeInterval: number // Timeline bucket (60, 55, 50...)
  incrementalWinAmount: number // Server pre-calculated Win increment
  incrementalPlaceAmount: number // Server pre-calculated Place increment
  winPoolAmount?: number // Win pool amount in cents
  placePoolAmount?: number // Place pool amount in cents
  timestamp: string // When data was recorded
}
```

## 14.7. Mathematical Validation & Quality Assurance

**Pool Sum Validation:**
```javascript
// Win pool validation
const totalWinIncrement = entrantIncrements.reduce(
  (sum, entrant) => sum + entrant.incrementalWinAmount, 0
)
const winPoolGrowth = currentWinPoolTotal - previousWinPoolTotal
const isWinConsistent = Math.abs(totalWinIncrement - winPoolGrowth) < 0.01

// Place pool validation
const totalPlaceIncrement = entrantIncrements.reduce(
  (sum, entrant) => sum + entrant.incrementalPlaceAmount, 0
)
const placePoolGrowth = currentPlacePoolTotal - previousPlacePoolTotal
const isPlaceConsistent = Math.abs(totalPlaceIncrement - placePoolGrowth) < 0.01
```

**Data Quality Scoring:**
- Automatic consistency checks for pool percentage sums (~100%)
- Mathematical validation of incremental amounts
- Logging of negative increments for investigation
- Data integrity scoring (0-100) for enhanced functions

## 14.8. Development & Testing Tools

**Enhanced NPM Scripts:**
```bash