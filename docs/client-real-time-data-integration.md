# Client Real-Time Data Integration Guide

## Overview

This document outlines how the RaceDay client application integrates with the Appwrite backend to provide real-time race data with historical trend analysis. The system enables live betting market visualization with comprehensive odds movement tracking.

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

### Primary Subscription Strategy

**Subscribe to `entrants` collection for live updates:**

```javascript
import { Client, Databases, Query } from 'appwrite';

const client = new Client()
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('your-project-id');

const databases = new Databases(client);

// Subscribe to all entrant updates
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

// Subscribe to specific race entrants only
const raceSubscription = client.subscribe([
  `databases.raceday-db.collections.entrants.documents`,
  `databases.raceday-db.collections.races.documents.${raceId}`
], response => {
  // Handle race-specific updates
  handleRaceUpdate(response.payload);
});
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

```javascript
import { useState, useEffect } from 'react';
import { client, databases } from './appwrite-config';

export function useRaceData(raceId) {
  const [entrants, setEntrants] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Initial data load
    const loadRaceData = async () => {
      const response = await databases.listDocuments('raceday-db', 'entrants', [
        Query.equal('race', raceId),
        Query.orderAsc('runnerNumber')
      ]);
      
      setEntrants(response.documents);
      setLoading(false);
    };
    
    loadRaceData();
    
    // Real-time subscription
    const unsubscribe = client.subscribe(
      `databases.raceday-db.collections.entrants.documents`,
      response => {
        const updatedEntrant = response.payload;
        
        // Only update if it's for our race
        if (updatedEntrant.race === raceId) {
          setEntrants(prev => 
            prev.map(entrant => 
              entrant.entrantId === updatedEntrant.entrantId 
                ? updatedEntrant 
                : entrant
            )
          );
        }
      }
    );
    
    return () => unsubscribe();
  }, [raceId]);
  
  return { entrants, loading };
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

### Subscription Management

**Best Practices:**
- Subscribe to collections, not individual documents for better performance
- Filter subscriptions to relevant races only
- Unsubscribe when components unmount to prevent memory leaks
- Use debouncing for rapid updates to prevent UI thrashing

### Caching Strategy

```javascript
// Cache historical data to reduce API calls
const oddsHistoryCache = new Map();

async function getCachedOddsHistory(entrantId, oddsType, limit) {
  const cacheKey = `${entrantId}-${oddsType}-${limit}`;
  
  if (oddsHistoryCache.has(cacheKey)) {
    const cached = oddsHistoryCache.get(cacheKey);
    
    // Cache for 30 seconds
    if (Date.now() - cached.timestamp < 30000) {
      return cached.data;
    }
  }
  
  const data = await getOddsHistory(entrantId, oddsType, limit);
  oddsHistoryCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
  
  return data;
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

1. **Backend Polling**: `race-data-poller` function polls NZTAB API every 15-60 seconds
2. **Historical Storage**: Before updating `entrants`, odds changes saved to `odds-history`  
3. **Current State Update**: `entrants` collection updated with latest data
4. **Real-Time Push**: Appwrite pushes updates to subscribed clients instantly
5. **Frontend Update**: React components receive updates and re-render
6. **Trend Analysis**: On-demand historical queries for charts and trend calculation
7. **Visual Indicators**: UI shows live trends, movements, and status changes

This architecture enables:
- **Sub-second latency** for live odds updates
- **Comprehensive trend analysis** with full historical context
- **Seamless race switching** with preserved data
- **Scalable real-time experience** for multiple concurrent users