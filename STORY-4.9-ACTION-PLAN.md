# STORY 4.9 ACTION PLAN: Money Flow Timeline Implementation

## Executive Summary

This document contains the comprehensive action plan for implementing accurate money flow timeline data in the RaceDay application. Based on extensive analysis of the NZ TAB API data structure and identification of critical calculation errors in the current implementation, this plan outlines the complete overhaul needed to display real-time entrant wager data correctly.

## Critical Issues Identified

### 1. 🚨 FUNDAMENTAL CALCULATION ERROR in Server Processing

**File**: `/server/race-data-poller/src/database-utils.js:406-416`

**Current Broken Logic**:
```javascript
// WRONG: Only keeping latest entry per entrant per API call
const entrantMoneyData = {};
for (const entry of moneyTrackerData.entrants) {
    if (entry.entrant_id) {
        entrantMoneyData[entry.entrant_id] = {
            hold_percentage: entry.hold_percentage,
            bet_percentage: entry.bet_percentage
        };
    }
}
```

**Problem**: Multiple entries per entrant represent different bet transactions that must be SUMMED, not overwritten.

**Correct Logic**:
```javascript
// CORRECT: Sum ALL hold_percentage values for each entrant
const entrantMoneyData = {};
for (const entry of moneyTrackerData.entrants) {
    if (entry.entrant_id) {
        if (!entrantMoneyData[entry.entrant_id]) {
            entrantMoneyData[entry.entrant_id] = { hold_percentage: 0, bet_percentage: 0 };
        }
        entrantMoneyData[entry.entrant_id].hold_percentage += (entry.hold_percentage || 0);
        entrantMoneyData[entry.entrant_id].bet_percentage += (entry.bet_percentage || 0);
    }
}
```

### 2. 🚨 INCORRECT TIMELINE INCREMENTAL CALCULATION

**File**: `/client/src/hooks/useMoneyFlowTimeline.ts:190-218`

**Problem**: Client-side incremental calculation is based on incorrect server data and wrong consolidation logic.

### 3. 🚨 WRONG DATA CONSOLIDATION LOGIC

**File**: `/client/src/hooks/useMoneyFlowTimeline.ts:130-149`

**Current Broken Logic**:
```javascript
// WRONG: Using Math.max() instead of summing
totalWinPoolAmount = Math.max(totalWinPoolAmount, point.winPoolAmount || 0);
totalPlacePoolAmount = Math.max(totalPlacePoolAmount, point.placePoolAmount || 0);
consolidatedPercentage = Math.max(consolidatedPercentage, point.poolPercentage);
```

**Correct Logic**:
```javascript
// CORRECT: Sum the values
totalWinPoolAmount += (point.winPoolAmount || 0);
totalPlacePoolAmount += (point.placePoolAmount || 0);
consolidatedPercentage += (point.poolPercentage || 0);
```

### 4. 🚨 POLLING FREQUENCY vs COLUMN HEADERS MISMATCH

**Current Master Scheduler Polling**:
- `-20m to -5m`: 5-minute polling
- `-5m to -1m`: 1-minute polling  
- `-1m to start`: 30-second polling

**Current Timeline Columns**: Fixed 5-minute intervals don't support dynamic frequency

### 5. 🚨 MISSING INCREMENTAL CALCULATION ON SERVER

Database schema has `incrementalAmount` field but server never calculates it properly.

## NZ TAB API Data Structure Analysis

### Money Flow Data Location

**From API Response**:
1. **`tote_pools` section**: Contains Win pool totals (`product_type: "Win"`)
2. **`money_tracker.entrants` array**: Contains individual entrant percentage data

### Hold Percentage Calculation Formula

**Confirmed Formula**: `Win Pool Total × (Runner Hold % ÷ 100) = Runner's Win bet amount`

**Example from real data**:
- Win Pool Total: $8,949.85 
- Take On Hold %: 13%
- Take On Win Amount: $8,949.85 × 0.13 = $1,163.48

### Multiple Entries Per Entrant

**Key Learning**: Multiple `money_tracker.entrants` records for the same `entrant_id` represent:
- Different bet transactions at different times
- Different bet types (hold_percentage vs bet_percentage)
- **MUST BE SUMMED**, not overwritten

### Validation Check

Hold percentages for all runners should sum to ~100% (allowing for rounding errors of ±3%).

## Database Schema Enhancements

### Enhanced MoneyFlowHistory Collection

**Add these fields to existing schema**:

```javascript
// New fields for time-bucketed storage
{ key: 'timeInterval', type: 'integer', required: true }, // Minutes before race start (60, 55, 50, etc.)
{ key: 'intervalType', type: 'string', size: 10, required: true }, // '5m', '1m', '30s'
{ key: 'isConsolidated', type: 'boolean', required: false, default: false }, // Whether this is aggregated data
{ key: 'rawPollingData', type: 'string', size: 2000, required: false }, // JSON of raw polling events for this interval

// Enhanced existing fields
{ key: 'incrementalWinAmount', type: 'integer', required: false }, // Incremental change in win pool
{ key: 'incrementalPlaceAmount', type: 'integer', required: false }, // Incremental change in place pool
{ key: 'bucketDocumentId', type: 'string', size: 100, required: false }, // For upsert operations
```

### Indexes for Performance

```javascript
// Add these indexes for optimized queries
{ key: 'idx_time_interval', fields: ['timeInterval'] },
{ key: 'idx_interval_type', fields: ['intervalType'] },
{ key: 'idx_entrant_interval', fields: ['entrant', 'timeInterval'] },
```

## Server-Side Implementation Plan

### Phase 1: Fix processMoneyTrackerData Function

**File**: `/server/race-data-poller/src/database-utils.js`

```javascript
/**
 * Process money tracker data with time-bucketed storage and correct aggregation
 */
export async function processMoneyTrackerData(databases, databaseId, moneyTrackerData, context, raceId = 'unknown', racePoolData = null, raceStatus = null) {
    if (!moneyTrackerData || !moneyTrackerData.entrants || !Array.isArray(moneyTrackerData.entrants)) {
        context.log('No money tracker entrants data available', { raceId });
        return 0;
    }

    // Skip processing money tracker data for finalized races
    if (raceStatus === 'Final' || raceStatus === 'Finalized' || raceStatus === 'Abandoned') {
        context.log('Skipping money tracker processing for finalized race', { 
            raceId, 
            raceStatus,
            reason: 'Finalized races have 0% values for hold/bet percentages'
        });
        return 0;
    }

    let entrantsProcessed = 0;
    
    // CORRECT AGGREGATION: Sum all entries per entrant_id
    const entrantMoneyData = {};
    
    for (const entry of moneyTrackerData.entrants) {
        if (entry.entrant_id) {
            if (!entrantMoneyData[entry.entrant_id]) {
                entrantMoneyData[entry.entrant_id] = { 
                    hold_percentage: 0, 
                    bet_percentage: 0 
                };
            }
            // SUM all percentages for the entrant (multiple bet transactions)
            entrantMoneyData[entry.entrant_id].hold_percentage += (entry.hold_percentage || 0);
            entrantMoneyData[entry.entrant_id].bet_percentage += (entry.bet_percentage || 0);
        }
    }
    
    // Save bucketed money flow history for each entrant
    for (const [entrantId, moneyData] of Object.entries(entrantMoneyData)) {
        const success = await saveTimeBucketedMoneyFlowHistory(databases, databaseId, entrantId, moneyData, context, raceId, racePoolData);
        if (success) {
            entrantsProcessed++;
        }
    }
    
    context.log('Processed money tracker data with correct aggregation', {
        raceId,
        totalEntries: moneyTrackerData.entrants.length,
        uniqueEntrants: Object.keys(entrantMoneyData).length,
        entrantsProcessed,
        racePoolDataAvailable: !!racePoolData,
        sampleAggregation: Object.entries(entrantMoneyData).slice(0, 3).map(([id, data]) => ({
            entrantId: id.slice(-8),
            holdPercentage: data.hold_percentage,
            betPercentage: data.bet_percentage
        }))
    });
    
    return entrantsProcessed;
}
```

### Phase 2: Implement Time-Bucketed Storage

**New Function**: `saveTimeBucketedMoneyFlowHistory`

```javascript
/**
 * Save money flow history with intelligent time bucketing for dynamic frequency display
 */
async function saveTimeBucketedMoneyFlowHistory(databases, databaseId, entrantId, moneyData, context, raceId = null, racePoolData = null) {
    if (!moneyData || (typeof moneyData.hold_percentage === 'undefined' && typeof moneyData.bet_percentage === 'undefined')) {
        return false;
    }

    try {
        const timestamp = new Date().toISOString();
        
        // Calculate time intervals and determine bucket type
        let timeToStart = null;
        let intervalType = '5m'; // default
        let timeInterval = null;
        
        if (raceId) {
            try {
                const race = await databases.getDocument(databaseId, 'races', raceId);
                if (race.startTime) {
                    const raceStartTime = new Date(race.startTime);
                    const currentTime = new Date();
                    timeToStart = Math.round((raceStartTime.getTime() - currentTime.getTime()) / (1000 * 60));
                    
                    // Determine bucket type and interval based on proximity to race start
                    if (timeToStart >= 5) {
                        // Far from start: 5-minute buckets (60, 55, 50, 45, etc.)
                        intervalType = '5m';
                        timeInterval = Math.ceil(timeToStart / 5) * 5; // Round up to nearest 5
                    } else if (timeToStart >= 1) {
                        // Close to start: 1-minute buckets (4, 3, 2, 1)
                        intervalType = '1m';
                        timeInterval = Math.ceil(timeToStart);
                    } else {
                        // Very close/started: 30-second buckets (-0.5, 0, 0.5, 1, etc.)
                        intervalType = '30s';
                        timeInterval = Math.round(timeToStart * 2) / 2; // Round to nearest 0.5
                    }
                }
            } catch (error) {
                context.warn('Could not calculate timeToStart for money flow history', { raceId, entrantId });
            }
        }
        
        // Create bucket-based document ID for upsert operations
        const bucketDocId = `${entrantId}_${timeInterval}_${intervalType}`;
        
        // Check if bucket already exists for this interval
        let existingBucket = null;
        try {
            existingBucket = await databases.getDocument(databaseId, 'money-flow-history', bucketDocId);
        } catch (error) {
            if (error.code !== 404) throw error;
        }
        
        // Calculate pool amounts using correct formula
        const holdPercent = (moneyData.hold_percentage || 0) / 100;
        const currentWinAmount = Math.round((racePoolData?.winPoolTotal || 0) * holdPercent);
        const currentPlaceAmount = Math.round((racePoolData?.placePoolTotal || 0) * holdPercent);
        
        let incrementalWinAmount = currentWinAmount;
        let incrementalPlaceAmount = currentPlaceAmount;
        
        // Calculate incremental amounts if this is an update within same bucket
        if (existingBucket) {
            incrementalWinAmount = currentWinAmount - (existingBucket.winPoolAmount || 0);
            incrementalPlaceAmount = currentPlaceAmount - (existingBucket.placePoolAmount || 0);
        }
        
        const bucketDoc = {
            entrant: entrantId,
            holdPercentage: moneyData.hold_percentage,
            betPercentage: moneyData.bet_percentage,
            type: 'hold_percentage',
            eventTimestamp: timestamp,
            pollingTimestamp: timestamp,
            timeToStart: timeToStart,
            timeInterval: timeInterval,
            intervalType: intervalType,
            winPoolAmount: currentWinAmount,
            placePoolAmount: currentPlaceAmount,
            incrementalAmount: incrementalWinAmount, // Pre-calculated incremental for win pool
            incrementalWinAmount: incrementalWinAmount,
            incrementalPlaceAmount: incrementalPlaceAmount,
            poolType: 'win',
            isConsolidated: false,
            bucketDocumentId: bucketDocId,
            rawPollingData: JSON.stringify({
                originalTimeToStart: timeToStart,
                pollingTimestamp: timestamp,
                holdPercentage: moneyData.hold_percentage,
                betPercentage: moneyData.bet_percentage,
                calculationDetails: {
                    racePoolWinTotal: racePoolData?.winPoolTotal || 0,
                    racePoolPlaceTotal: racePoolData?.placePoolTotal || 0,
                    holdPercentDecimal: holdPercent
                }
            })
        };
        
        // Upsert the bucket document
        await performantUpsert(databases, databaseId, 'money-flow-history', bucketDocId, bucketDoc, context);
        
        context.log('Saved time-bucketed money flow data', {
            entrantId: entrantId.slice(-8),
            timeInterval,
            intervalType,
            holdPercentage: moneyData.hold_percentage,
            winAmount: currentWinAmount,
            incrementalWin: incrementalWinAmount,
            isUpdate: !!existingBucket
        });
        
        return true;
    } catch (error) {
        context.error('Failed to save time-bucketed money flow history', {
            entrantId,
            raceId,
            holdPercentageValue: moneyData.hold_percentage,
            betPercentageValue: moneyData.bet_percentage,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return false;
    }
}
```

### Phase 3: Validation Function

```javascript
/**
 * Validate that hold percentages sum to ~100% for debugging
 */
async function validateHoldPercentages(entrantMoneyData, context, raceId) {
    const totalHoldPercentage = Object.values(entrantMoneyData)
        .reduce((sum, data) => sum + (data.hold_percentage || 0), 0);
    
    const isValid = totalHoldPercentage >= 97 && totalHoldPercentage <= 103;
    
    context.log('Hold percentage validation', {
        raceId,
        totalHoldPercentage,
        expectedRange: '97-103%',
        isValid,
        entrantCount: Object.keys(entrantMoneyData).length
    });
    
    if (!isValid) {
        context.warn('Hold percentages do not sum to ~100%', {
            raceId,
            totalHoldPercentage,
            deviation: Math.abs(100 - totalHoldPercentage),
            possibleCauses: [
                'API rounding errors',
                'Real-time data fluctuations',
                'Incorrect aggregation logic'
            ]
        });
    }
    
    return isValid;
}
```

## Client-Side Implementation Plan

### Phase 1: Update API Route

**File**: `/client/src/app/api/race/[id]/money-flow-timeline/route.ts`

```javascript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/appwrite-server';
import { Query } from 'node-appwrite';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const entrantIds = searchParams.get('entrants')?.split(',') || [];
    const { id: raceId } = await params;

    if (!raceId) {
      return NextResponse.json(
        { error: 'Race ID is required' },
        { status: 400 }
      );
    }

    if (entrantIds.length === 0) {
      return NextResponse.json(
        { error: 'Entrant IDs are required' },
        { status: 400 }
      );
    }

    const { databases } = await createServerClient();
    const databaseId = 'raceday-db';

    // Fetch bucketed money flow history with optimized queries
    const response = await databases.listDocuments(
      databaseId,
      'money-flow-history',
      [
        Query.equal('entrant', entrantIds),
        Query.greaterThan('timeInterval', -60), // Only last hour of data
        Query.lessThan('timeInterval', 60),     // Only next hour of data
        Query.orderAsc('timeInterval'),         // Order by time interval
        Query.limit(2000) // Enough for high-frequency data
      ]
    );

    return NextResponse.json({
      success: true,
      documents: response.documents,
      total: response.total,
      raceId,
      entrantIds,
      bucketedData: true,
      queryOptimizations: [
        'Time interval filtering',
        'Bucketed storage',
        'Pre-calculated incrementals'
      ]
    });

  } catch (error) {
    console.error('Error fetching money flow timeline:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch money flow timeline data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
```

### Phase 2: Enhanced Timeline Hook

**File**: `/client/src/hooks/useMoneyFlowTimeline.ts`

```javascript
/**
 * Generate dynamic timeline columns based on race status and proximity to start
 */
const generateTimelineColumns = (raceStartTime: Date, raceStatus: string) => {
    const now = new Date();
    const timeToStart = (raceStartTime.getTime() - now.getTime()) / (1000 * 60);
    const columns = [];
    
    if (raceStatus === 'Open') {
        // Far from start: 5-minute intervals
        if (timeToStart > 5) {
            for (let t = 60; t >= 5; t -= 5) {
                if (t <= timeToStart + 5) {
                    columns.push({ 
                        interval: t, 
                        type: '5m', 
                        label: `-${t}m`,
                        isActive: true 
                    });
                }
            }
        }
        
        // Close to start: 1-minute intervals
        if (timeToStart <= 10) {
            for (let t = Math.min(5, Math.ceil(timeToStart)); t >= 1; t -= 1) {
                columns.push({ 
                    interval: t, 
                    type: '1m', 
                    label: `-${t}m`,
                    isActive: true 
                });
            }
        }
        
        // Very close: 30-second intervals
        if (timeToStart <= 2) {
            const thirtySecondIntervals = [1, 0.5, 0, -0.5, -1, -1.5, -2];
            for (const t of thirtySecondIntervals) {
                if (t >= timeToStart - 2) {
                    const label = t >= 0 ? `-${t * 60}s` : `+${Math.abs(t) * 60}s`;
                    columns.push({ 
                        interval: t, 
                        type: '30s', 
                        label,
                        isActive: true 
                    });
                }
            }
        }
    } else {
        // Race closed/running: continue 30-second intervals for historical view
        for (let t = 1; t >= -10; t -= 0.5) {
            const label = t >= 0 ? `-${t * 60}s` : `+${Math.abs(t) * 60}s`;
            columns.push({ 
                interval: t, 
                type: '30s', 
                label,
                isActive: t >= timeToStart - 1 // Only recent data is "active"
            });
        }
    }
    
    return columns.sort((a, b) => b.interval - a.interval); // Sort descending (earliest first)
};
```

### Phase 3: Simplified Data Processing

```javascript
/**
 * Process bucketed timeline data (much simpler since server does the heavy lifting)
 */
const processBucketedTimelineData = (documents: ServerMoneyFlowPoint[], entrantIds: string[]) => {
    const entrantDataMap = new Map<string, EntrantMoneyFlowTimeline>();
    
    for (const entrantId of entrantIds) {
        // Filter documents for this entrant
        const entrantDocs = documents.filter(doc => {
            const docEntrantId = typeof doc.entrant === 'string' ? doc.entrant : doc.entrant?.entrantId;
            return docEntrantId === entrantId;
        });
        
        // Sort by time interval (server should handle this but ensure correct order)
        const sortedDocs = entrantDocs.sort((a, b) => (b.timeInterval || 0) - (a.timeInterval || 0));
        
        // Transform to timeline data points (server has pre-calculated incrementals)
        const dataPoints: MoneyFlowDataPoint[] = sortedDocs.map(doc => ({
            $id: doc.$id,
            $createdAt: doc.$createdAt,
            $updatedAt: doc.$updatedAt,
            entrant: entrantId,
            pollingTimestamp: doc.pollingTimestamp || doc.$createdAt,
            timeToStart: doc.timeToStart || 0,
            timeInterval: doc.timeInterval || 0,
            intervalType: doc.intervalType || '5m',
            winPoolAmount: doc.winPoolAmount || 0,
            placePoolAmount: doc.placePoolAmount || 0,
            totalPoolAmount: (doc.winPoolAmount || 0) + (doc.placePoolAmount || 0),
            poolPercentage: doc.holdPercentage || 0,
            incrementalAmount: doc.incrementalAmount || 0, // Pre-calculated by server
            incrementalWinAmount: doc.incrementalWinAmount || 0,
            incrementalPlaceAmount: doc.incrementalPlaceAmount || 0,
            pollingInterval: doc.intervalType === '30s' ? 0.5 : doc.intervalType === '1m' ? 1 : 5
        }));
        
        // Calculate trend and metadata
        const latestPoint = dataPoints[dataPoints.length - 1];
        const secondLatestPoint = dataPoints.length > 1 ? dataPoints[dataPoints.length - 2] : null;
        
        let trend: 'up' | 'down' | 'neutral' = 'neutral';
        let significantChange = false;
        
        if (latestPoint && secondLatestPoint) {
            const percentageChange = latestPoint.poolPercentage - secondLatestPoint.poolPercentage;
            trend = percentageChange > 0.5 ? 'up' : percentageChange < -0.5 ? 'down' : 'neutral';
            significantChange = Math.abs(percentageChange) >= 5;
        }

        entrantDataMap.set(entrantId, {
            entrantId,
            dataPoints,
            latestPercentage: latestPoint?.poolPercentage || 0,
            trend,
            significantChange
        });
    }
    
    return entrantDataMap;
};
```

## Database Migration Plan

### Step 1: Schema Updates

**Add new attributes to `money-flow-history` collection**:

```javascript
// In database-setup.js ensureMoneyFlowHistoryCollection function
const newRequiredAttributes = [
    // Existing attributes remain unchanged
    { key: 'holdPercentage', type: 'float', required: false },
    { key: 'betPercentage', type: 'float', required: false },
    { key: 'eventTimestamp', type: 'datetime', required: true },
    { key: 'type', type: 'string', size: 20, required: true },
    { key: 'pollingTimestamp', type: 'datetime', required: false },
    { key: 'timeToStart', type: 'integer', required: false },
    { key: 'winPoolAmount', type: 'integer', required: false },
    { key: 'placePoolAmount', type: 'integer', required: false },
    { key: 'incrementalAmount', type: 'integer', required: false },
    { key: 'poolType', type: 'string', size: 10, required: false },
    
    // NEW ATTRIBUTES for bucketed storage
    { key: 'timeInterval', type: 'integer', required: false }, // Minutes before race start
    { key: 'intervalType', type: 'string', size: 10, required: false }, // '5m', '1m', '30s'
    { key: 'incrementalWinAmount', type: 'integer', required: false }, // Win pool increment
    { key: 'incrementalPlaceAmount', type: 'integer', required: false }, // Place pool increment
    { key: 'isConsolidated', type: 'boolean', required: false, default: false }, // Aggregated data flag
    { key: 'bucketDocumentId', type: 'string', size: 100, required: false }, // For upserts
    { key: 'rawPollingData', type: 'string', size: 2000, required: false }, // JSON debug data
];
```

### Step 2: Index Optimization

```javascript
// Add performance indexes
const newIndexes = [
    { key: 'idx_time_interval', fields: ['timeInterval'] },
    { key: 'idx_interval_type', fields: ['intervalType'] },
    { key: 'idx_entrant_interval', fields: ['entrant', 'timeInterval'] },
    { key: 'idx_polling_timestamp', fields: ['pollingTimestamp'] },
];
```

### Step 3: Data Migration Strategy

```javascript
/**
 * Optional: Migrate existing money flow data to bucketed format
 * Run this as a one-time migration function
 */
export async function migrateExistingMoneyFlowData(databases, databaseId, context) {
    context.log('Starting money flow data migration to bucketed format...');
    
    // Get all existing non-bucketed data
    const existingData = await databases.listDocuments(databaseId, 'money-flow-history', [
        Query.isNull('timeInterval'), // Old data won't have timeInterval
        Query.limit(10000)
    ]);
    
    let migrated = 0;
    let skipped = 0;
    
    for (const doc of existingData.documents) {
        try {
            // Calculate timeInterval from existing timeToStart
            if (doc.timeToStart !== undefined) {
                const timeToStart = doc.timeToStart;
                let intervalType = '5m';
                let timeInterval = timeToStart;
                
                if (timeToStart >= 5) {
                    intervalType = '5m';
                    timeInterval = Math.ceil(timeToStart / 5) * 5;
                } else if (timeToStart >= 1) {
                    intervalType = '1m';
                    timeInterval = Math.ceil(timeToStart);
                } else {
                    intervalType = '30s';
                    timeInterval = Math.round(timeToStart * 2) / 2;
                }
                
                // Update document with new fields
                await databases.updateDocument(databaseId, 'money-flow-history', doc.$id, {
                    timeInterval,
                    intervalType,
                    isConsolidated: false,
                    incrementalWinAmount: doc.incrementalAmount || 0,
                    incrementalPlaceAmount: 0,
                    bucketDocumentId: `${doc.entrant}_${timeInterval}_${intervalType}_migrated`
                });
                
                migrated++;
            } else {
                skipped++;
            }
        } catch (error) {
            context.error('Failed to migrate money flow document', {
                documentId: doc.$id,
                error: error.message
            });
            skipped++;
        }
    }
    
    context.log('Money flow data migration completed', {
        totalDocuments: existingData.documents.length,
        migrated,
        skipped
    });
}
```

## Testing and Validation Plan

### 1. Server-Side Unit Tests

```javascript
/**
 * Test money tracker data aggregation logic
 */
export function testMoneyTrackerAggregation() {
    // Test case: Multiple entries for same entrant should be summed
    const mockMoneyTrackerData = {
        entrants: [
            { entrant_id: 'take-on-123', hold_percentage: 5, bet_percentage: 4 },
            { entrant_id: 'take-on-123', hold_percentage: 2, bet_percentage: 3 },
            { entrant_id: 'take-on-123', hold_percentage: 3, bet_percentage: 1 },
            { entrant_id: 'other-horse-456', hold_percentage: 8, bet_percentage: 7 }
        ]
    };
    
    // Expected results after aggregation
    const expected = {
        'take-on-123': { hold_percentage: 10, bet_percentage: 8 }, // 5+2+3, 4+3+1
        'other-horse-456': { hold_percentage: 8, bet_percentage: 7 }
    };
    
    // Test the aggregation logic
    const result = aggregateMoneyTrackerData(mockMoneyTrackerData);
    
    console.assert(result['take-on-123'].hold_percentage === 10, 'Take On hold percentage should sum to 10');
    console.assert(result['take-on-123'].bet_percentage === 8, 'Take On bet percentage should sum to 8');
    console.assert(result['other-horse-456'].hold_percentage === 8, 'Other horse should have correct values');
}
```

### 2. Integration Testing

```javascript
/**
 * Test end-to-end money flow calculation
 */
export async function testEndToEndMoneyFlow(raceId = '279dc587-bb6e-4a56-b7e5-70d78b942ddd') {
    // Use the real race from research data
    const winPoolTotal = 8949.85; // From final API response
    const takeOnHoldPercentage = 13; // Final aggregated percentage
    const expectedTakeOnAmount = Math.round(winPoolTotal * (takeOnHoldPercentage / 100));
    
    console.log('Testing end-to-end money flow calculation:', {
        winPoolTotal,
        takeOnHoldPercentage,
        expectedTakeOnAmount, // Should be 1163
        formula: 'winPoolTotal × (holdPercentage ÷ 100)'
    });
    
    // This should match the progression we observed:
    // 70m before: $120.65 (9% of $1,340.52)
    // +2m after: $1,163.48 (13% of $8,949.85)
}
```

### 3. Client-Side Validation

```javascript
/**
 * Validate timeline display logic
 */
export function testTimelineColumnGeneration() {
    const mockRaceStart = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    const columns = generateTimelineColumns(mockRaceStart, 'Open');
    
    // Should generate appropriate columns for 10 minutes before start
    console.assert(columns.some(col => col.type === '1m'), 'Should include 1-minute intervals');
    console.assert(!columns.some(col => col.type === '30s'), 'Should not include 30-second intervals yet');
    
    // Test very close to start
    const closeRaceStart = new Date(Date.now() + 1 * 60 * 1000); // 1 minute from now
    const closeColumns = generateTimelineColumns(closeRaceStart, 'Open');
    
    console.assert(closeColumns.some(col => col.type === '30s'), 'Should include 30-second intervals when close');
}
```

## Deployment Strategy

### Phase 1: Database Schema Update (Low Risk)
1. Deploy database schema changes
2. Add new attributes and indexes
3. Existing functionality continues to work

### Phase 2: Server Function Updates (Medium Risk)
1. Deploy updated `processMoneyTrackerData` function
2. Deploy new `saveTimeBucketedMoneyFlowHistory` function
3. Enable validation and logging
4. Monitor for correct aggregation

### Phase 3: Client Updates (High Risk)
1. Deploy new API route
2. Deploy updated timeline hook
3. Update grid components
4. Test real-time updates

### Phase 4: Optimization and Cleanup (Low Risk)
1. Optional data migration
2. Remove old unused fields
3. Performance monitoring and tuning

## Monitoring and Debugging

### 1. Server-Side Logging

```javascript
/**
 * Enhanced logging for money flow processing
 */
context.log('Money flow processing debug', {
    raceId,
    raceStatus,
    moneyTrackerRawEntries: moneyTrackerData.entrants.length,
    uniqueEntrantsFound: Object.keys(entrantMoneyData).length,
    holdPercentageValidation: {
        totalPercentage: Object.values(entrantMoneyData).reduce((sum, data) => sum + data.hold_percentage, 0),
        expectedRange: '97-103%',
        isValid: /* validation result */
    },
    poolData: {
        winPoolTotal: racePoolData?.winPoolTotal,
        placePoolTotal: racePoolData?.placePoolTotal,
        source: 'tote_pools array'
    },
    timeContext: {
        timeToStart: /* calculated time */,
        intervalType: /* determined interval */,
        pollingFrequency: /* actual frequency */
    }
});
```

### 2. Client-Side Debug Information

```javascript
/**
 * Debug panel for money flow timeline
 */
const debugInfo = {
    dataSource: 'bucketed server storage',
    aggregationMethod: 'server-side summed percentages',
    incrementalCalculation: 'pre-calculated on server',
    columnsGenerated: columns.length,
    entrantsWithData: Array.from(timelineData.values()).filter(d => d.dataPoints.length > 0).length,
    lastPollingUpdate: lastUpdate,
    realTimeSubscription: /* subscription status */,
    validationChecks: {
        holdPercentageSum: /* client-side validation */,
        incrementalAccuracy: /* cross-check calculations */,
        timelineContinuity: /* check for gaps in data */
    }
};

console.log('💰 Money Flow Timeline Debug:', debugInfo);
```

## Success Criteria

### 1. Data Accuracy
- ✅ Hold percentages sum to 97-103% for each polling event
- ✅ Win pool amounts match manual calculation: `Pool Total × (Hold % ÷ 100)`
- ✅ Incremental amounts show actual new wagers between polling intervals
- ✅ Timeline displays real money flow, not dummy fallback data

### 2. Performance
- ✅ Timeline loads within 2 seconds for races with 10+ entrants
- ✅ Real-time updates appear within 5 seconds of server polling
- ✅ High-frequency (30-second) polling doesn't cause client performance issues
- ✅ Database queries optimized with appropriate indexes

### 3. User Experience
- ✅ Dynamic column generation based on race proximity
- ✅ Smooth transition from 5m → 1m → 30s intervals
- ✅ Accurate "incremental wager" amounts in timeline cells
- ✅ Real-time updates continue until race status changes from 'Open'

### 4. Reliability
- ✅ No data loss during high-frequency polling periods
- ✅ Graceful handling of API timeouts or connection issues
- ✅ Consistent data across multiple concurrent users
- ✅ Proper error handling and fallback states

## Research Data Reference

**Test Race ID**: `279dc587-bb6e-4a56-b7e5-70d78b942ddd` (CHRISTCHURCH CASINO 30TH SI AWARDS)
**Test Entrant**: "Take On" (entrant_id: `160ed8d2-37d0-4823-b3ec-0bc54ed047f1`, runner #5)

**Verified Money Flow Progression**:
- 70m before: $120.65 (9% of $1,340.52 win pool)
- 35m before: $218.14 (10% of $2,181.43 win pool)  
- 20m before: $269.49 (10% of $2,694.91 win pool)
- +2m after: $1,163.48 (13% of $8,949.85 win pool)

**Key Formula Validation**: `Win Pool Total × (Aggregated Hold Percentage ÷ 100) = Entrant Win Amount`

## Conclusion

This comprehensive action plan addresses all identified issues with the money flow timeline implementation. The key insight is that **multiple money_tracker entries per entrant must be summed, not overwritten**, and that **server-side bucketed storage with pre-calculated incrementals** will provide the performance and accuracy needed for real-time high-frequency money flow display.

The implementation prioritizes **data accuracy first**, then **performance optimization**, ensuring that the timeline displays actual wager amounts rather than dummy fallback data.

#### Step 1.1: Replace State-Dependent Logic
**File**: `/home/warrick/Dev/raceday/client/src/components/race-view/EnhancedEntrantsGrid.tsx`

**Remove these state variables (Lines 175-176)**:
```typescript
// REMOVE:
const [maxPostStartMinutes, setMaxPostStartMinutes] = useState(0)
const [hasShownPostStartColumns, setHasShownPostStartColumns] = useState(false)
```

**Replace timeline column generation logic (Lines 477-592)**:
```typescript
// NEW DATA-DRIVEN APPROACH:
const timelineColumns = useMemo(() => {
  const raceStart = new Date(currentRaceStartTime)
  const current = currentTime
  const timeToRaceMs = raceStart.getTime() - current.getTime()
  const timeToRaceMinutes = Math.floor(timeToRaceMs / (1000 * 60))
  const raceStatus = liveRace?.status || 'Open'
  
  // Calculate max post-start from existing timeline data (DATA-DRIVEN)
  let maxPostStartFromData = 0
  if (timelineData && timelineData.size > 0) {
    for (const [entrantId, entrantData] of timelineData) {
      if (entrantData.dataPoints && entrantData.dataPoints.length > 0) {
        const maxTimeToStart = Math.max(...entrantData.dataPoints.map(p => Math.abs(p.timeToStart || 0)))
        maxPostStartFromData = Math.max(maxPostStartFromData, maxTimeToStart)
      }
    }
  }
  
  // Calculate actual post-start minutes
  const actualPostStartMinutes = timeToRaceMinutes < 0 ? Math.abs(timeToRaceMinutes) : 0
  
  // Use maximum of actual time or data-driven max for persistence
  const effectiveMaxPostStart = Math.max(actualPostStartMinutes, maxPostStartFromData)
  
  // Pre-scheduled timeline milestones (unchanged)
  const preScheduledMilestones = [
    -60, -55, -50, -45, -40, -35, -30, -25, -20, -15, -10, -5, -4, -3, -2, -1, -0.5, 0
  ]
  
  const columns: TimelineColumn[] = []
  
  // Add pre-scheduled milestones (unchanged)
  preScheduledMilestones.forEach((interval) => {
    // ... existing milestone logic ...
  })
  
  // Add post-scheduled columns based on data or actual time (FIXED LOGIC)
  const shouldShowPostStartColumns = 
    effectiveMaxPostStart > 0 || 
    ['Final', 'Interim', 'Closed'].includes(raceStatus)
  
  if (shouldShowPostStartColumns && effectiveMaxPostStart > 0) {
    const dynamicIntervals: number[] = []
    
    // 30-second intervals for first 2 minutes
    if (effectiveMaxPostStart <= 2) {
      const thirtySecondIntervals = Math.ceil(effectiveMaxPostStart * 2)
      for (let i = 1; i <= thirtySecondIntervals; i++) {
        dynamicIntervals.push(i * 0.5)
      }
    }
    
    // Then minute intervals
    if (effectiveMaxPostStart > 2) {
      dynamicIntervals.push(0.5, 1.0, 1.5, 2.0)
      const additionalMinutes = Math.floor(effectiveMaxPostStart) - 2
      for (let i = 1; i <= additionalMinutes && i <= 10; i++) {
        dynamicIntervals.push(2 + i)
      }
    }
    
    // Add post-start columns
    dynamicIntervals.forEach((interval) => {
      const timestamp = new Date(raceStart.getTime() + interval * 60 * 1000)
      const label = interval < 1 ? `+${(interval * 60).toFixed(0)}s` : `+${interval}m`
      
      columns.push({
        label,
        interval,
        timestamp: timestamp.toISOString(),
        isScheduledStart: false,
        isDynamic: raceStatus === 'Open'
      })
    })
  }
  
  return columns.sort((a, b) => a.interval - b.interval)
}, [currentRaceStartTime, currentTime, liveRace?.status, timelineData])
```

### Phase 2: Pool Data Display Logic Correction (Critical - 2 hours)

#### Step 2.1: Fix Pool Calculation Hierarchy
**File**: `/home/warrick/Dev/raceday/client/src/components/race-view/EnhancedEntrantsGrid.tsx`

**Update pool calculation logic (Lines 282-379)**:
```typescript
const entrantsWithPoolData = useMemo(() => {
  if (!entrants || entrants.length === 0) return []
  
  console.log('🔍 Pool calculation debug:', {
    entrantsCount: entrants.length,
    timelineDataAvailable: timelineData?.size > 0,
    racePoolDataAvailable: !!racePoolData
  })
  
  return entrants.map(entrant => {
    if (entrant.isScratched) {
      return {
        ...entrant,
        moneyFlowTimeline: undefined
      }
    }
    
    // NEW PRIORITY HIERARCHY (FIXED):
    // Priority 1: Real entrant holdPercentage (must be > 0)
    let poolPercentage: number | undefined = undefined
    let dataSource = 'none'
    
    if (entrant.holdPercentage && entrant.holdPercentage > 0) {
      poolPercentage = entrant.holdPercentage
      dataSource = 'entrant_real_data'
      console.log(`✅ Using real entrant data for ${entrant.name}: ${poolPercentage}%`)
    }
    
    // Priority 2: Timeline latest percentage (only if entrant data missing)
    const entrantTimeline = timelineData?.get(entrant.$id)
    if (!poolPercentage && entrantTimeline && entrantTimeline.dataPoints.length > 0) {
      const latestPercentage = entrantTimeline.latestPercentage
      if (latestPercentage && latestPercentage > 0) {
        poolPercentage = latestPercentage
        dataSource = 'timeline_data'
        console.log(`✅ Using timeline data for ${entrant.name}: ${poolPercentage}%`)
      }
    }
    
    // Priority 3: NO DUMMY DATA - return undefined if no real data
    if (!poolPercentage) {
      console.log(`⚠️ No real data for ${entrant.name}, returning undefined (NO DUMMY DATA)`)
      return {
        ...entrant,
        moneyFlowTimeline: entrantTimeline,
        poolMoney: undefined // CRITICAL: undefined instead of dummy data
      }
    }
    
    // Calculate with real percentage only
    const holdPercentageDecimal = poolPercentage / 100
    const winPoolInDollars = Math.round((racePoolData?.winPoolTotal || 0) / 100) 
    const placePoolInDollars = Math.round((racePoolData?.placePoolTotal || 0) / 100)
    const winPoolContribution = winPoolInDollars * holdPercentageDecimal
    const placePoolContribution = placePoolInDollars * holdPercentageDecimal
    const totalPoolContribution = winPoolContribution + placePoolContribution
    
    console.log(`💰 Real calculation for ${entrant.name}:`, {
      poolPercentage,
      winPoolContribution: winPoolContribution.toFixed(0),
      placePoolContribution: placePoolContribution.toFixed(0),
      totalPoolContribution: totalPoolContribution.toFixed(0),
      dataSource
    })
    
    return {
      ...entrant,
      moneyFlowTimeline: entrantTimeline,
      poolMoney: {
        win: winPoolContribution,
        place: placePoolContribution,
        total: totalPoolContribution,
        percentage: poolPercentage
      }
    }
  })
}, [entrants, racePoolData, timelineData, poolViewState.activePool])
```

#### Step 2.2: Update Display Functions to Handle Undefined Data
**File**: `/home/warrick/Dev/raceday/client/src/components/race-view/EnhancedEntrantsGrid.tsx`

**Update getPoolAmount and getPoolPercentage functions**:
```typescript
const getPoolAmount = useCallback((entrant: Entrant): number | undefined => {
  // RETURN UNDEFINED INSTEAD OF 0 when no poolMoney
  if (!entrant.poolMoney) return undefined
  
  switch (poolViewState.activePool) {
    case 'win':
      return entrant.poolMoney.win || 0
    case 'place':
      return entrant.poolMoney.place || 0
    default:
      return entrant.poolMoney.total || 0
  }
}, [poolViewState.activePool])

const getPoolPercentage = useCallback((entrant: Entrant): number | undefined => {
  if (entrant.isScratched) return 0
  
  // RETURN UNDEFINED INSTEAD OF FALLBACK when no poolMoney
  if (!entrant.poolMoney) return undefined
  
  // Calculate percentage based on selected pool type
  switch (poolViewState.activePool) {
    case 'win':
      const totalWinPool = entrantsWithPoolData.reduce((sum, e) => 
        !e.isScratched && e.poolMoney ? sum + (e.poolMoney.win || 0) : sum, 0)
      return totalWinPool > 0 ? ((entrant.poolMoney.win || 0) / totalWinPool) * 100 : 0
    
    case 'place':
      const totalPlacePool = entrantsWithPoolData.reduce((sum, e) => 
        !e.isScratched && e.poolMoney ? sum + (e.poolMoney.place || 0) : sum, 0)
      return totalPlacePool > 0 ? ((entrant.poolMoney.place || 0) / totalPlacePool) * 100 : 0
    
    default:
      return entrant.poolMoney.percentage || 0
  }
}, [poolViewState.activePool, entrantsWithPoolData])
```

### Phase 3: Timeline Data Processing Enhancement (Medium - 1.5 hours)

#### Step 3.1: Improve Timeline Interval Matching
**File**: `/home/warrick/Dev/raceday/client/src/components/race-view/EnhancedEntrantsGrid.tsx`

**Update getTimelineData function (Lines 620-751)**:
```typescript
const getTimelineData = useCallback((entrantId: string, interval: number): string => {
  const entrant = sortedEntrants.find((e) => e.$id === entrantId)
  if (!entrant || entrant.isScratched) return '—'

  const entrantTimeline = timelineData?.get(entrant.$id)
  if (entrantTimeline && entrantTimeline.dataPoints && entrantTimeline.dataPoints.length > 0) {
    const sortedDataPoints = [...entrantTimeline.dataPoints].sort((a, b) => {
      const aTime = a.timeToStart !== undefined ? a.timeToStart : Infinity
      const bTime = b.timeToStart !== undefined ? b.timeToStart : Infinity
      return bTime - aTime
    })
    
    // IMPROVED MATCHING: Find closest within INCREASED tolerance
    const targetTimeToStart = Math.abs(interval)
    let bestMatch = null
    let bestTimeDiff = Infinity
    
    for (const point of sortedDataPoints) {
      if (point.timeToStart !== undefined) {
        const timeDiff = Math.abs(point.timeToStart - targetTimeToStart)
        if (timeDiff < bestTimeDiff && timeDiff <= 15) { // INCREASED from 10 to 15 minutes
          bestTimeDiff = timeDiff
          bestMatch = point
        }
      }
    }
    
    if (bestMatch) {
      const poolType = poolViewState.activePool
      let currentAmount = 0
      
      if (poolType === 'win' && bestMatch.winPoolAmount !== undefined) {
        currentAmount = bestMatch.winPoolAmount
      } else if (poolType === 'place' && bestMatch.placePoolAmount !== undefined) {
        currentAmount = bestMatch.placePoolAmount
      } else {
        const winAmount = bestMatch.winPoolAmount || 0
        const placeAmount = bestMatch.placePoolAmount || 0
        currentAmount = winAmount + placeAmount
      }
      
      // Find chronologically previous point for incremental calculation
      const chronologicallyPrevious = sortedDataPoints.find(point => 
        point.timeToStart !== undefined && 
        point.timeToStart > bestMatch.timeToStart &&
        point.$id !== bestMatch.$id
      )
      
      if (chronologicallyPrevious) {
        let previousAmount = 0
        if (poolType === 'win' && chronologicallyPrevious.winPoolAmount !== undefined) {
          previousAmount = chronologicallyPrevious.winPoolAmount
        } else if (poolType === 'place' && chronologicallyPrevious.placePoolAmount !== undefined) {
          previousAmount = chronologicallyPrevious.placePoolAmount
        } else {
          const winAmount = chronologicallyPrevious.winPoolAmount || 0
          const placeAmount = chronologicallyPrevious.placePoolAmount || 0
          previousAmount = winAmount + placeAmount
        }
        
        const incrementalAmount = currentAmount - previousAmount
        
        if (Math.abs(incrementalAmount) < 1) {
          return '$0'
        } else if (incrementalAmount > 0) {
          return `+$${Math.round(incrementalAmount).toLocaleString()}`
        } else {
          return `-$${Math.round(Math.abs(incrementalAmount)).toLocaleString()}`
        }
      } else {
        // First data point - show total if significant
        if (currentAmount > 0) {
          return `$${Math.round(currentAmount).toLocaleString()}`
        }
      }
    }
  }

  return '—'
}, [sortedEntrants, timelineData, poolViewState.activePool])
```

#### Step 3.2: Enhance Real-time Data Synchronization
**File**: `/home/warrick/Dev/raceday/client/src/hooks/useMoneyFlowTimeline.ts`

**Add force refresh mechanism**:
```typescript
const [forceRefresh, setForceRefresh] = useState(0)

// Enhanced subscription to trigger immediate recalculation
useEffect(() => {
  // ... existing subscription setup ...
  
  unsubscribe = client.subscribe(
    'databases.raceday-db.collections.money-flow-history.documents',
    (response: any) => {
      if (response.payload && entrantIds.includes(response.payload.entrant)) {
        console.log('💰 Money flow update received, triggering refresh:', response)
        
        // Force immediate recalculation
        setForceRefresh(prev => prev + 1)
        
        // Refetch data
        fetchTimelineData()
      }
    }
  )
}, [raceId, entrantIds, forceRefresh])
```

## Testing Procedures

### Phase 1 Testing: Timeline Persistence
**Test Race**: `279dc587-bb6e-4a56-b7e5-70d78b942ddd` (CHRISTCHURCH CASINO 30TH SI AWARDS)

1. **Before Fix**: Navigate to race, observe 22 columns → refresh → observe 18 columns
2. **After Fix**: Navigate to race, observe 22 columns → refresh → verify 22 columns persist
3. **Validation**: Post-start columns (+30s, +1m, +1.5m, +2m) remain visible after refresh

### Phase 2 Testing: Pool Data Accuracy
1. **Real Data Display**: Verify UI shows "28%" instead of "14.29%" for entrants with real data
2. **No Dummy Data**: Ensure "..." displays instead of "$12" when no real data available
3. **Mathematical Validation**: Pool amounts sum to footer totals exactly
4. **Pool Toggle**: Win/Place buttons show different real values, not identical dummy values

### Phase 3 Testing: Timeline Data Flow
1. **Timeline Values**: Verify "+$344" type values instead of repetitive "+$583"
2. **Real-time Updates**: Monitor live data changes reflect in UI within 10 seconds
3. **Incremental Accuracy**: Timeline shows actual money flow changes, not artifacts

## Implementation Schedule

### Day 1 (Immediate - Critical Issues)
- [ ] **Hour 1-3**: Implement Phase 1 (Timeline Persistence)
  - Remove state dependencies
  - Implement data-driven column generation
  - Test column persistence through refresh
- [ ] **Hour 4-6**: Implement Phase 2 (Pool Data Logic)
  - Fix pool calculation hierarchy
  - Remove dummy data fallbacks
  - Test real data display

### Day 2 (Medium Priority)
- [ ] **Hour 1-2**: Implement Phase 3 (Timeline Enhancement)
  - Improve interval matching tolerance
  - Add real-time synchronization
- [ ] **Hour 3-4**: Comprehensive Testing
  - Test with live race data
  - Validate mathematical consistency
  - Performance testing

### Day 3 (Validation & Documentation)
- [ ] **Hour 1-2**: Production Testing
  - Deploy to staging environment
  - Test with multiple race scenarios
- [ ] **Hour 3-4**: Documentation & Handoff
  - Update technical documentation
  - Create user acceptance criteria

## Success Criteria

### Critical Success Factors
1. ✅ **Timeline Persistence**: Post-start columns (22 total) persist through page refresh
2. ✅ **Real Data Display**: Pool percentages show real values (28%, not 14.29%)
3. ✅ **No Dummy Data**: Loading states or "..." instead of fake "$12" values
4. ✅ **Mathematical Accuracy**: Pool amounts sum to footer totals exactly
5. ✅ **Timeline Accuracy**: Incremental values show real money flow ("+$344", not "+$583")

### Validation Metrics
- **Timeline Columns**: 100% persistence (22 before = 22 after refresh)
- **Real Data Usage**: 0% dummy data when real data available
- **Mathematical Consistency**: 100% accuracy in pool total calculations
- **Real-time Performance**: <10 second latency from API update to UI display
- **User Experience**: Clear distinction between real data and loading states

## Risk Mitigation

### Technical Risks
1. **Performance Impact**: Monitor component re-render frequency after removing state
2. **Data Loading**: Ensure graceful handling during initial data fetch
3. **Real-time Stability**: Validate subscription performance under load

### Rollback Strategy
- Maintain backup branch: `backup/story-4.9-current-state`
- Test in development environment first
- Deploy incrementally with monitoring
- Immediate rollback capability if issues detected

## Files to Modify

### Primary Files (High Impact)
1. **`/home/warrick/Dev/raceday/client/src/components/race-view/EnhancedEntrantsGrid.tsx`**
   - Lines 175-176: Remove state variables
   - Lines 477-592: Timeline column generation logic
   - Lines 282-379: Pool calculation hierarchy
   - Lines 620-751: Timeline data matching

2. **`/home/warrick/Dev/raceday/client/src/hooks/useMoneyFlowTimeline.ts`**
   - Real-time subscription enhancement
   - Force refresh mechanism

### Estimated Code Changes
- **Remove**: 10 lines (state variables)
- **Modify**: 200 lines (logic improvements)  
- **Add**: 50 lines (new data-driven approach)
- **Total Impact**: ~260 lines across 2 files

## Technical Notes

This action plan resolves all three critical issues through coordinated fixes:

1. **Timeline Persistence** → Data-driven column generation eliminates state dependency
2. **Pool Data Accuracy** → Proper fallback hierarchy prioritizes real API data
3. **Timeline Flow** → Enhanced interval matching and real-time synchronization

The solution maintains existing architecture while fixing fundamental data flow issues that were causing user confusion between real and dummy data displays.