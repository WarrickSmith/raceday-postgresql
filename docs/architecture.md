# System Architecture Document: RaceDay v2.0

- **Project:** RaceDay
- **Version:** 2.0 (Microservices Refactoring)
- **Author:** Winston (Architect)
- **Date:** 2025-07-23
- **Status:** Final

## 1. System Overview

The RaceDay application uses a **microservices backend architecture** (Appwrite Cloud), a decoupled Next.js frontend, and real-time data synchronization. This version refactors the previous monolithic data import function into specialized pipeline functions to eliminate resource contention and hanging issues.

**Key Architectural Changes in v2.0:**
- Monolithic `daily-race-importer` broken into 3 specialized functions
- Sequential pipeline execution with proper resource allocation
- Enhanced error handling and timeout protection
- Optimized data fetching strategy with real-time invalidation

---

## 2. Microservices Backend Architecture

### 2.1. Daily Data Pipeline Functions

The daily data import is now handled by three sequential functions with 10-minute spacing to prevent API rate limiting:

#### daily-meetings (17:00 UTC)
- **Specification:** s-1vcpu-512mb
- **Purpose:** Fetch and store race meetings from NZ TAB API
- **Processing:** AU/NZ filtering, batch processing with error isolation
- **Output:** Meeting records in database
- **Duration:** ~60 seconds

#### daily-races (17:10 UTC)  
- **Specification:** s-1vcpu-512mb
- **Purpose:** Fetch race details for all stored meetings
- **Processing:** Sequential race processing, relationship linking to meetings
- **Output:** Race records linked to meetings
- **Duration:** ~90 seconds

#### daily-entrants (17:20 UTC)
- **Specification:** s-1vcpu-1gb 
- **Purpose:** Fetch initial entrant data for all stored races
- **Processing:** Limited to 20 races with timeout protection, sequential API calls
- **Output:** Entrant records with initial odds data
- **Duration:** ~300 seconds (5 minutes max)

### 2.2. Real-time Functions

#### race-data-poller (Dynamic Schedule)
- **Specification:** s-2vcpu-2gb
- **Schedule:** Every minute during race hours
- **Purpose:** Real-time updates for active races
- **Dynamic Intervals:**
  - T-60m to T-20m: 5-minute intervals
  - T-20m to T-10m: 2-minute intervals  
  - T-10m to T-5m: 1-minute intervals
  - T-5m to Start: 15-second intervals
  - Post-start: 5-minute intervals until Final

#### alert-evaluator (Event-triggered)
- **Specification:** s-1vcpu-512mb
- **Trigger:** Database events on entrant updates
- **Purpose:** Process user alert configurations and create notifications
- **Processing:** Threshold evaluation, user filtering, notification creation

---

## 3. Frontend Architecture (Next.js 15+)

### 3.1. Data Fetching Strategy

**Primary Pattern: SWR + Real-time Invalidation**

```typescript
// Smart caching with real-time updates
const { meetings, isLoading } = useMeetings(filters);

// Real-time cache invalidation
useRealtime(
  'databases.raceday-db.collections.meetings.documents',
  (update) => {
    mutate(); // Invalidate SWR cache on backend updates
  }
);
```

**Benefits:**
- Initial data loads from cache (< 500ms)
- Real-time updates without polling overhead
- Automatic cache invalidation when backend functions update data
- Graceful degradation on connection issues

### 3.2. Component Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── (main)/page.tsx    # Dashboard with meetings list
│   └── race/[id]/page.tsx # Race detail with entrants grid
├── components/
│   ├── dashboard/         # MeetingsList, FilterControls
│   ├── race/             # EntrantsGrid, OddsSparkline
│   └── alerts/           # AlertsModal, NotificationToast
├── hooks/                # useRealtime, useMeetings, useRaceData
└── services/             # API service layer
```

---

## 4. Database Schema (Appwrite)

### 4.1. Core Collections

```sql
-- meetings: Race meeting information
meetingId (string, unique), meetingName (string), country (string, indexed),
raceType (string, indexed), date (datetime, indexed), status (string)

-- races: Individual races linked to meetings  
raceId (string, unique), name (string), raceNumber (integer, indexed),
startTime (datetime, indexed), status (string), actualStart (datetime),
meeting (relationship → meetings)

-- entrants: Horse entries linked to races
entrantId (string, unique), name (string), runnerNumber (integer, indexed),
winOdds (float), placeOdds (float), holdPercentage (float),
isScratched (boolean), race (relationship → races)

-- odds-history: Time-series odds data for sparklines
odds (float), eventTimestamp (datetime, indexed), type (string),
entrant (relationship → entrants)

-- user-alert-configs: User notification preferences  
userId (string, indexed), alertType (string), threshold (float),
enabled (boolean), entrant (relationship → entrants)

-- notifications: Real-time alert delivery
userId (string, indexed), title (string), message (string),
type (string), read (boolean), raceId (string), entrantId (string)
```

### 4.2. Optimized Indexes

- **meetings:** idx_date, idx_country, idx_race_type, idx_meeting_id (unique)
- **races:** idx_race_id (unique), idx_start_time, idx_status
- **entrants:** idx_entrant_id (unique), idx_runner_number
- **odds-history:** idx_timestamp, idx_entrant_timestamp (compound)
- **user-alert-configs:** idx_user_id, idx_user_entrant (compound)

---

## 5. Key Architectural Improvements

### 5.1. Resource Management

**Previous Issues (v1.4):**
- Single monolithic function trying to do everything
- Resource contention and memory exhaustion
- Functions hanging for hours during entrant processing
- No timeout protection on external API calls

**Solutions (v2.0):**
- Right-sized compute resources per function type
- Sequential processing with 1-second delays between API calls
- 15-second timeouts on all external API calls
- Explicit memory management with garbage collection hints
- Limited batch processing (max 20 races for daily-entrants)

### 5.2. Error Handling & Resilience

```javascript
// Individual error isolation - continue processing on failures
for (const race of races) {
  try {
    await processRace(race);
  } catch (error) {
    context.error(`Failed to process race ${race.id}`, { error: error.message });
    // Continue with next race - don't fail entire batch
  }
}

// Timeout protection for all API calls
const raceData = await Promise.race([
  fetchRaceEventData(nztabBaseUrl, raceId, context),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Timeout for race ${raceId}`)), 15000)
  )
]);
```

### 5.3. Real-time Performance

- **Frontend:** WebSocket subscriptions with throttled updates (max 10/second)
- **Backend:** Event-driven alert evaluation triggered by database changes
- **Latency:** Sub-2-second updates from backend to frontend
- **Connection Health:** Automatic reconnection and health monitoring

---

## 6. Deployment Architecture

### 6.1. Function Specifications

```json
{
  "functions": [
    {
      "$id": "daily-meetings",
      "specification": "s-1vcpu-512mb",
      "schedule": "0 17 * * *",
      "timeout": 300
    },
    {
      "$id": "daily-races", 
      "specification": "s-1vcpu-512mb",
      "schedule": "10 17 * * *",
      "timeout": 300
    },
    {
      "$id": "daily-entrants",
      "specification": "s-1vcpu-1gb",
      "schedule": "20 17 * * *", 
      "timeout": 300
    },
    {
      "$id": "race-data-poller",
      "specification": "s-2vcpu-2gb",
      "schedule": "*/1 * * * *",
      "timeout": 300
    },
    {
      "$id": "alert-evaluator",
      "specification": "s-1vcpu-512mb",
      "events": ["databases.*.collections.entrants.documents.*.update"],
      "timeout": 60
    }
  ]
}
```

### 6.2. Deployment Pipeline

- **Frontend:** Vercel deployment with automatic builds on main branch
- **Backend:** Individual function deployment via Appwrite CLI
- **Database:** Idempotent schema setup via client/scripts/appwrite-setup.ts
- **Monitoring:** Built-in Appwrite Console + structured logging

---

## 7. Performance Characteristics

### 7.1. Function Performance Targets

| Function | Max Duration | Max Memory | Success Rate |
|----------|-------------|------------|--------------|
| daily-meetings | 60s | 200MB | >99.5% |
| daily-races | 90s | 300MB | >99.5% |
| daily-entrants | 300s | 800MB | >99% |
| race-data-poller | 120s | 1.5GB | >99.5% |
| alert-evaluator | 30s | 100MB | >99.9% |

### 7.2. Frontend Performance Targets

- **Initial Load:** < 500ms for cached data
- **Real-time Updates:** < 2s latency
- **Core Web Vitals:** LCP < 2.5s, FID < 100ms, CLS < 0.1
- **Bundle Size:** < 250KB initial, < 50KB per route

---

## 8. Migration from v1.4

### 8.1. Breaking Changes

- `daily-race-importer` function removed, replaced with 3-function pipeline
- Function resource specifications updated
- Scheduling changed from single daily execution to staggered pipeline
- Error handling improved with better isolation and logging

### 8.2. Data Compatibility  

- All existing database collections remain unchanged
- New attributes added: races.actualStart, races.silkUrl, entrants.silkUrl
- Existing data preserved, new pipeline populates additional fields

### 8.3. Deployment Steps

1. Deploy updated appwrite.json configuration
2. Deploy new microservices functions
3. Remove old daily-race-importer function
4. Monitor pipeline execution starting at 17:00 UTC
5. Verify data flow: meetings → races → entrants → real-time updates

---

## 9. Success Metrics

### 9.1. Technical Metrics

- **Zero hanging functions:** All functions complete within timeout limits
- **Pipeline reliability:** >99% daily pipeline success rate
- **Data completeness:** >95% of races have complete entrant data
- **Real-time latency:** <2s from backend update to frontend display

### 9.2. Business Metrics

- **User experience:** Sub-second dashboard load times
- **Data freshness:** Real-time odds updates during race hours
- **System reliability:** >99.9% uptime during peak racing periods
- **Alert delivery:** >99% successful notification delivery

---

## 10. Conclusion

The RaceDay v2.0 microservices architecture eliminates the resource contention and hanging issues of the monolithic approach while providing better scalability, observability, and maintainability. The sequential pipeline design with proper resource allocation ensures reliable daily data import, while the optimized real-time system provides excellent user experience with sub-2-second update latency.

This architecture is production-ready and designed for immediate deployment on the existing Appwrite Cloud infrastructure.