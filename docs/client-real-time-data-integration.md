# Client Real-Time Data Integration Guide

## Overview

This document outlines how the RaceDay client application integrates with the Appwrite backend to provide real-time race data with historical trend analysis. The system enables live betting market visualization with comprehensive odds movement tracking.

> **Related Documentation**: For advanced real-time implementation patterns, complex subscription management, and server-side data processing architecture, see [Money Flow Timeline System Architecture](./Money-Flow-Timeline-System-Architecture.md).

> **Advanced Example**: The Money Flow Timeline system demonstrates sophisticated real-time patterns including race status-based subscription management, debounced updates, and server-heavy processing architecture that can be applied to other real-time features.

## Data Architecture

### Primary Collections

#### `entrants` Collection - Current State Data
**Purpose**: Real-time subscription target for live race data
**Subscription Pattern**: Primary data source for live UI updates

**Key Fields for Real-Time Updates:**
```javascript
{
  entrantId: "uuid",
  name: "Horse Name",  
  runnerNumber: 1,
  
  // Live Odds (updated every poll)
  fixedWinOdds: 2.25,     // Fixed odds for win
  fixedPlaceOdds: 1.45,   // Fixed odds for place  
  poolWinOdds: 2.7,       // Pool odds for win
  poolPlaceOdds: 3.3,     // Pool odds for place
  
  // Market Status (changes frequently)
  favourite: true,         // Current favourite status
  mover: false,           // Significant movement indicator
  isScratched: false,     // Withdrawal status
  scratchTime: null,      // When scratched (timestamp)
  
  // Race Context
  race: "race-uuid",      // Race relationship
  lastUpdated: "2025-07-30T22:59:25.565Z"
}
```

#### `odds-history` Collection - Historical Trend Data
**Purpose**: Time-series data for odds trend analysis and charts
**Query Pattern**: On-demand historical data fetching

**Fields:**
```javascript
{
  entrant: "entrant-uuid",     // Relationship to entrants
  odds: 2.25,                  // Odds value at this timestamp
  type: "fixed_win",           // Odds type: fixed_win, fixed_place, pool_win, pool_place
  eventTimestamp: "2025-07-30T22:59:25.565Z"
}
```

#### `money-flow-history` Collection - Money Flow Trend Data
**Purpose**: Time-series data for money flow analysis and market sentiment
**Query Pattern**: On-demand historical money flow data fetching

**Fields:**
```javascript
{
  entrant: "entrant-uuid",     // Relationship to entrants
  holdPercentage: 15.5,        // Money held percentage (hold_percentage or bet_percentage)
  type: "hold_percentage",     // Flow type: hold_percentage, bet_percentage
  eventTimestamp: "2025-07-31T01:31:39.863Z"
}
```

## Real-Time Data Architecture

### Two-Function Polling Strategy

**Baseline Polling (race-data-poller)**:
- Scheduled every 5 minutes
- Maintains 1-hour window of race data
- Sustainable background data maintenance

**Dynamic Polling (single-race-poller)**:
- HTTP-triggered by client applications
- On-demand polling for specific races
- Enables true 15-second intervals when needed

## Real-Time Subscription Implementation

> **Advanced Patterns**: The [Money Flow Timeline System](./Money-Flow-Timeline-System-Architecture.md#real-time-updates) demonstrates unified subscription architecture with intelligent filtering and race status awareness that extends these foundational patterns.

### Primary Subscription Strategy

**Subscribe to `entrants` collection for live updates:**

```javascript
import { Client, Databases, Query } from 'appwrite';

const client = new Client()
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('your-project-id');

const databases = new Databases(client);

// Enhanced subscription with error handling and cleanup
const subscription = client.subscribe(
  'databases.raceday-db.collections.entrants.documents', 
  response => {
    const entrant = response.payload;
    
    // Update UI with latest data
    updateEntrantInUI(entrant);
    
    // Trigger trend recalculation if needed
    if (isDisplayingTrends(entrant.entrantId)) {
      refreshTrendChart(entrant.entrantId);
    }
  }
);
```

### Enhanced Subscription Patterns

**Race Status-Aware Subscription Management**:

```javascript
function useRaceSubscription(raceId, raceStatus) {
  useEffect(() => {
    // Skip subscriptions for completed races to preserve final state
    const isRaceComplete = 
      raceStatus && ['Final', 'Finalized', 'Abandoned', 'Cancelled'].includes(raceStatus);
    
    if (isRaceComplete) {
      return; // No subscription needed for completed races
    }

    // Set up subscription with proper error handling
    let unsubscribe = null;
    
    try {
      unsubscribe = client.subscribe(
        `databases.raceday-db.collections.entrants.documents`,
        response => {
          const updatedEntrant = response.payload;
          
          // Only process updates for our race (entrant filtering)
          if (updatedEntrant.race === raceId) {
            // Debounce rapid updates with small delay
            setTimeout(() => {
              updateRaceData(updatedEntrant);
            }, 500);
          }
        }
      );
    } catch (subscriptionError) {
      console.error('Failed to establish subscription:', subscriptionError);
      // Continue without real-time updates if subscription fails
    }

    return () => {
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (error) {
          console.warn('Error unsubscribing:', error);
        }
      }
    };
  }, [raceId, raceStatus]);
}
```

**Unified Subscription with Intelligent Filtering**:

```javascript
// Single subscription channel with intelligent filtering (recommended approach)
function useUnifiedRaceSubscription(entrantIds, raceStatus) {
  useEffect(() => {
    if (!entrantIds.length || 
        ['Final', 'Finalized', 'Abandoned', 'Cancelled'].includes(raceStatus)) {
      return;
    }

    const unsubscribe = client.subscribe(
      ['databases.raceday-db.collections.entrants.documents'],
      response => {
        const updatedEntrant = response.payload;
        
        // Check if this update affects our entrants
        const isRelevantUpdate = entrantIds.includes(updatedEntrant.entrantId);
        
        if (isRelevantUpdate) {
          // Debounced update to handle rapid changes
          setTimeout(() => {
            processEntrantUpdate(updatedEntrant);
          }, 500);
        }
      }
    );

    return () => unsubscribe?.();
  }, [entrantIds.join(','), raceStatus]);
}
```

### Historical Data Queries

**Fetch odds history for trend analysis:**

```javascript
// Get odds history for a specific entrant
async function getOddsHistory(entrantId, oddsType = 'fixed_win', limit = 50) {
  const history = await databases.listDocuments('raceday-db', 'odds-history', [
    Query.equal('entrant', entrantId),
    Query.equal('type', oddsType),
    Query.orderDesc('eventTimestamp'),
    Query.limit(limit)
  ]);
  
  return history.documents;
}

// Get odds history for all entrants in a race
async function getRaceOddsHistory(raceId, oddsType = 'fixed_win') {
  // First get all entrants for the race
  const entrants = await databases.listDocuments('raceday-db', 'entrants', [
    Query.equal('race', raceId)
  ]);
  
  // Then get history for each entrant
  const historyPromises = entrants.documents.map(entrant => 
    getOddsHistory(entrant.entrantId, oddsType)
  );
  
  const histories = await Promise.all(historyPromises);
  return histories;
}

// Get money flow history for a specific entrant
async function getMoneyFlowHistory(entrantId, flowType = 'hold_percentage', limit = 50) {
  const history = await databases.listDocuments('raceday-db', 'money-flow-history', [
    Query.equal('entrant', entrantId),
    Query.equal('type', flowType),
    Query.orderDesc('eventTimestamp'),
    Query.limit(limit)
  ]);
  
  return history.documents;
}

// Get combined odds and money flow data for comprehensive analysis
async function getCombinedHistory(entrantId, limit = 50) {
  const [oddsHistory, moneyFlowHistory] = await Promise.all([
    getOddsHistory(entrantId, 'fixed_win', limit),
    getMoneyFlowHistory(entrantId, 'hold_percentage', limit)
  ]);
  
  return {
    odds: oddsHistory,
    moneyFlow: moneyFlowHistory
  };
}
```

## Frontend Implementation Patterns

### React Hook for Race Data

**Enhanced Hook with Modern Patterns**:

```javascript
import { useState, useEffect, useCallback } from 'react';
import { client, databases } from './appwrite-config';

export function useRaceData(raceId, raceStatus) {
  const [entrants, setEntrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  const loadRaceData = useCallback(async () => {
    if (!raceId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await databases.listDocuments('raceday-db', 'entrants', [
        Query.equal('race', raceId),
        Query.orderAsc('runnerNumber')
      ]);
      
      setEntrants(response.documents);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load race data');
      console.error('Error loading race data:', err);
    } finally {
      setLoading(false);
    }
  }, [raceId]);
  
  useEffect(() => {
    // Initial data load
    loadRaceData();
    
    // Skip real-time subscriptions for completed races
    const isRaceComplete = 
      raceStatus && ['Final', 'Finalized', 'Abandoned', 'Cancelled'].includes(raceStatus);
    
    if (isRaceComplete) {
      return; // Race is complete, skip subscription
    }
    
    // Set up real-time subscription with error handling
    let unsubscribe = null;
    
    try {
      unsubscribe = client.subscribe(
        `databases.raceday-db.collections.entrants.documents`,
        response => {
          const updatedEntrant = response.payload;
          
          // Only update if it's for our race (entrant filtering)
          if (updatedEntrant.race === raceId) {
            // Debounce rapid updates
            setTimeout(() => {
              setEntrants(prev => 
                prev.map(entrant => 
                  entrant.entrantId === updatedEntrant.entrantId 
                    ? updatedEntrant 
                    : entrant
                )
              );
              setLastUpdate(new Date());
            }, 500);
          }
        }
      );
    } catch (subscriptionError) {
      console.error('Failed to establish subscription:', subscriptionError);
      // Continue without real-time updates if subscription fails
    }
    
    return () => {
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (error) {
          console.warn('Error unsubscribing:', error);
        }
      }
    };
  }, [raceId, raceStatus, loadRaceData]);
  
  return { 
    entrants, 
    loading, 
    error, 
    lastUpdate, 
    refetch: loadRaceData 
  };
}
```

### Trend Calculation Utilities

```javascript
// Calculate trend from historical data
export function calculateTrend(currentOdds, historicalData) {
  if (!historicalData || historicalData.length < 2) {
    return { trend: 'stable', changePercent: 0 };
  }
  
  const previousOdds = historicalData[1].odds; // Second most recent
  const change = currentOdds - previousOdds;
  const changePercent = ((change / previousOdds) * 100).toFixed(1);
  
  return {
    trend: change > 0 ? 'drifting' : change < 0 ? 'shortening' : 'stable',
    changePercent: parseFloat(changePercent),
    previousOdds,
    currentOdds
  };
}

// Get trend classification for UI styling
export function getTrendClass(trend) {
  switch (trend) {
    case 'shortening': return 'trend-shortening'; // Green
    case 'drifting': return 'trend-drifting';     // Red  
    default: return 'trend-stable';               // Grey
  }
}
```

### Component Example: EntrantCard

```jsx
import { useState, useEffect } from 'react';
import { getOddsHistory, calculateTrend, getTrendClass } from './utils';

export function EntrantCard({ entrant }) {
  const [trend, setTrend] = useState(null);
  const [showChart, setShowChart] = useState(false);
  
  useEffect(() => {
    const loadTrend = async () => {
      const history = await getOddsHistory(entrant.entrantId, 'fixed_win', 10);
      const trendData = calculateTrend(entrant.fixedWinOdds, history);
      setTrend(trendData);
    };
    
    loadTrend();
  }, [entrant.fixedWinOdds, entrant.entrantId]);
  
  return (
    <div className={`entrant-card ${getTrendClass(trend?.trend)}`}>
      <div className="entrant-header">
        <span className="runner-number">({entrant.runnerNumber})</span>
        <h3 className="entrant-name">{entrant.name}</h3>
        {entrant.favourite && <span className="favourite-star">⭐</span>}
        {entrant.mover && <span className="mover-badge">🔥</span>}
        {entrant.isScratched && <span className="scratched">❌</span>}
      </div>
      
      <div className="odds-display">
        <div className="odds-value">
          <span className="current-odds">{entrant.fixedWinOdds}</span>
          <TrendArrow direction={trend?.trend} />
        </div>
        
        {trend && (
          <div className="trend-info">
            <span className={`change-percent ${getTrendClass(trend.trend)}`}>
              {trend.changePercent > 0 ? '+' : ''}{trend.changePercent}%
            </span>
            <span className="previous-odds">
              (was {trend.previousOdds})
            </span>
          </div>
        )}
      </div>
      
      <button 
        onClick={() => setShowChart(!showChart)}
        className="trend-chart-toggle"
      >
        {showChart ? 'Hide' : 'Show'} Chart
      </button>
      
      {showChart && <OddsChart entrantId={entrant.entrantId} />}
    </div>
  );
}
```

## Performance Considerations

### Modern Subscription Management

**Enhanced Best Practices:**
- **Unified subscriptions**: Use single subscription channels with intelligent filtering instead of multiple subscriptions
- **Race status awareness**: Disable subscriptions for completed races to preserve final state and reduce unnecessary processing
- **Debounced updates**: Implement 500ms delays for rapid updates to prevent UI thrashing
- **Comprehensive error handling**: Always wrap subscriptions in try/catch blocks with graceful degradation
- **Proper cleanup**: Include error handling in unsubscribe functions
- **Server-heavy processing**: Rely on pre-calculated server data rather than client-side computations

### Server-Heavy Architecture Principles

**Recommended Approach:**
```javascript
// Server provides pre-calculated data, client displays
function useServerCalculatedData(raceId) {
  // Server handles all complex calculations
  // Client receives ready-to-display data
  // Minimal client-side processing for optimal performance
  
  const processServerUpdate = (serverData) => {
    // Trust server calculations - no client processing needed
    // Server provides: incremental amounts, percentages, trends
    // Client simply displays the pre-calculated values
    return serverData; // Direct use of server-calculated data
  };
}

### Enhanced Caching Strategy

```javascript
// Enhanced cache with race status awareness
const enhancedDataCache = new Map();

async function getCachedData(entrantId, dataType, limit, raceStatus) {
  const cacheKey = `${entrantId}-${dataType}-${limit}`;
  
  if (enhancedDataCache.has(cacheKey)) {
    const cached = enhancedDataCache.get(cacheKey);
    
    // Longer cache for completed races (permanent), shorter for active races
    const cacheExpiry = ['Final', 'Finalized', 'Abandoned'].includes(raceStatus) 
      ? Infinity // Cache completed race data permanently
      : 30000;    // 30 seconds for active races
    
    if (Date.now() - cached.timestamp < cacheExpiry) {
      return cached.data;
    }
  }
  
  const data = await getData(entrantId, dataType, limit);
  enhancedDataCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
    raceStatus
  });
  
  return data;
}

// State management with race completion awareness
function useRaceStateCache(raceId, raceStatus) {
  const [cachedState, setCachedState] = useState(null);
  
  useEffect(() => {
    // For completed races, preserve final state in cache
    if (['Final', 'Finalized', 'Abandoned'].includes(raceStatus) && cachedState) {
      // Freeze the state for completed races
      return;
    }
    
    // Continue normal updates for active races
    loadFreshData(raceId).then(setCachedState);
  }, [raceId, raceStatus]);
  
  return cachedState;
}
```

### Query Optimization

```javascript
// Efficient race switching - preload data
async function preloadRaceData(raceIds) {
  const preloadPromises = raceIds.map(raceId => 
    databases.listDocuments('raceday-db', 'entrants', [
      Query.equal('race', raceId),
      Query.select(['entrantId', 'name', 'runnerNumber', 'fixedWinOdds', 'favourite', 'isScratched'])
    ])
  );
  
  const results = await Promise.all(preloadPromises);
  return results;
}
```

## Data Flow Summary

1. **Enhanced Backend Polling**: `enhanced-race-poller` function polls NZTAB API with mathematical validation and data quality scoring
2. **Historical Storage**: Before updating `entrants`, odds changes saved to `odds-history` with comprehensive validation
3. **Current State Update**: `entrants` collection updated with pre-calculated, validated data
4. **Real-Time Push**: Appwrite pushes updates to subscribed clients with intelligent filtering
5. **Frontend Update**: React components receive updates with race status awareness and debounced processing
6. **Trend Analysis**: On-demand historical queries enhanced with server-side calculations
7. **Visual Indicators**: UI shows live trends, movements, and status changes with value flash animations

This enhanced architecture enables:
- **Sub-second latency** for live odds updates with mathematical validation
- **Comprehensive trend analysis** with full historical context and data quality assurance  
- **Seamless race switching** with preserved data and intelligent caching
- **Scalable real-time experience** for multiple concurrent users with server-heavy processing
- **Race status awareness** with automatic subscription management for completed races
- **Enhanced error handling** with graceful degradation and comprehensive logging

## Related Advanced Implementation

For a comprehensive example of these patterns in practice, see the [Money Flow Timeline System Architecture](./Money-Flow-Timeline-System-Architecture.md), which demonstrates:

- **Advanced subscription management** with unified channels and intelligent filtering
- **Server-heavy processing** with pre-calculated incremental amounts and mathematical validation
- **Race status-based behavior** with automatic subscription lifecycle management  
- **Enhanced error handling** with comprehensive try/catch blocks and fallback mechanisms
- **Performance optimization** through debounced updates and sophisticated caching strategies