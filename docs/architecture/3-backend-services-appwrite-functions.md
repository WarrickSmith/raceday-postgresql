# Backend Services: Appwrite Functions (v2.0)

## Overview

RaceDay v2.0 implements a **microservices backend architecture** using Appwrite Functions. The previous monolithic `daily-race-importer` has been refactored into specialized functions that eliminate resource contention and hanging issues.

## Function Architecture

### Sequential Daily Pipeline

The daily data import follows a **sequential pipeline** with 10-minute spacing to prevent API rate limiting:

```
17:00 UTC → daily-meetings    (s-1vcpu-512mb, ~60s)
    ↓
17:10 UTC → daily-races      (s-1vcpu-512mb, ~90s)  
    ↓
17:20 UTC → daily-entrants   (s-1vcpu-1gb, ~300s)
```

### Real-time Functions

```
race-data-poller    (s-2vcpu-2gb, every minute)
alert-evaluator     (s-1vcpu-512mb, event-triggered)
```

---

## Function Specifications

### 1. daily-meetings

**Purpose:** Fetch and store race meetings from NZ TAB API with country and race type filtering

**Schedule:** `0 17 * * *` (5:00 PM UTC daily)  
**Resource Specification:** `s-1vcpu-512mb`  
**Timeout:** 300 seconds (5 minutes)  
**Expected Duration:** ~60 seconds

**Processing Logic:**
```javascript
export default async function main(context) {
  // 1. Fetch today's meetings from NZ TAB API
  const meetings = await fetchTodaysMeetings(nztabBaseUrl, context);
  
  // 2. Filter for AU/NZ horse racing only
  const filteredMeetings = meetings.filter(meeting => 
    ['AU', 'NZ'].includes(meeting.country) &&
    ['Thoroughbred Horse Racing', 'Harness Horse Racing'].includes(meeting.category_name)
  );
  
  // 3. Process in batches with error isolation
  for (const meeting of filteredMeetings) {
    try {
      await upsertMeeting(meeting, databases, context);
    } catch (error) {
      context.error(`Failed to process meeting ${meeting.meeting}`, { error: error.message });
      // Continue with next meeting - error isolation
    }
  }
  
  return { meetingsProcessed: filteredMeetings.length };
}
```

**Key Features:**
- Country filtering (AU/NZ only)
- Race type filtering (Thoroughbred/Harness only)
- Individual error isolation - failed meetings don't stop processing
- Upsert pattern (update-first, create-on-404)
- Database schema setup if needed

---

### 2. daily-races

**Purpose:** Fetch race details for all meetings imported by daily-meetings

**Schedule:** `10 17 * * *` (5:10 PM UTC daily)  
**Resource Specification:** `s-1vcpu-512mb`  
**Timeout:** 300 seconds  
**Expected Duration:** ~90 seconds

**Processing Logic:**
```javascript
export default async function main(context) {
  // 1. Get meetings stored by daily-meetings function
  const meetings = await databases.listDocuments('raceday-db', 'meetings', [
    Query.greaterThanEqual('date', todayISO),
    Query.equal('status', 'active')
  ]);
  
  // 2. Process races for each meeting
  for (const meeting of meetings.documents) {
    try {
      // Fetch race details from NZ TAB API
      const meetingDetails = await fetchMeetingDetails(meeting.meetingId, context);
      
      // Process each race in the meeting
      for (const race of meetingDetails.races) {
        await upsertRace(race, meeting.meetingId, databases, context);
      }
    } catch (error) {
      context.error(`Failed to process races for meeting ${meeting.meetingId}`, { 
        error: error.message 
      });
      // Continue with next meeting
    }
  }
}
```

**Key Features:**
- Depends on daily-meetings completion
- Sequential race processing within each meeting
- Relationship linking (races → meetings)
- Race metadata storage (distance, track condition, weather)
- Error isolation per meeting

---

### 3. daily-entrants

**Purpose:** Fetch initial entrant data for races imported by daily-races

**Schedule:** `20 17 * * *` (5:20 PM UTC daily)  
**Resource Specification:** `s-1vcpu-1gb`  
**Timeout:** 300 seconds  
**Expected Duration:** ~300 seconds (5 minutes max)

**Processing Logic:**
```javascript
export default async function main(context) {
  // 1. Get races stored by daily-races function
  const races = await databases.listDocuments('raceday-db', 'races', [
    Query.greaterThanEqual('startTime', todayISO),
    Query.orderAsc('startTime')
  ]);
  
  // 2. Limit to 20 races to prevent timeout
  const racesToProcess = races.documents.slice(0, 20);
  
  // 3. Process races sequentially (not in parallel)
  for (const race of racesToProcess) {
    try {
      // Fetch race event data with 15-second timeout
      const raceEventData = await Promise.race([
        fetchRaceEventData(nztabBaseUrl, race.raceId, context),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Timeout for race ${race.raceId}`)), 15000)
        )
      ]);
      
      // Process entrants for this race
      if (raceEventData?.entrants) {
        await processEntrants(race.raceId, raceEventData.entrants, databases, context);
      }
      
      // API politeness delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      context.error(`Failed to process entrants for race ${race.raceId}`, { 
        error: error.message 
      });
      // Continue with next race - error isolation
    }
  }
}
```

**Key Features:**
- **Race Limit:** Maximum 20 races processed to prevent timeout
- **Sequential Processing:** One race at a time with 1-second delays
- **Timeout Protection:** 15-second timeout per API call
- **Enhanced Parameters:** Uses `with_tote_trends_data=true` for complete data
- **Fallback Logic:** Uses `runners` if `entrants` field is empty
- **Memory Management:** Explicit garbage collection hints between batches

---

### 4. race-data-poller

**Purpose:** Real-time polling of active races for dynamic data updates

**Schedule:** `*/1 * * * *` (Every minute)  
**Resource Specification:** `s-2vcpu-2gb`  
**Timeout:** 300 seconds  
**Expected Duration:** ~120 seconds

**Dynamic Polling Intervals:**
- **T-60m to T-20m:** 5-minute intervals
- **T-20m to T-10m:** 2-minute intervals  
- **T-10m to T-5m:** 1-minute intervals
- **T-5m to Start:** 15-second intervals
- **Post-start:** 5-minute intervals until Final

**Processing Logic:**
```javascript
export default async function main(context) {
  const now = new Date();
  
  // 1. Query races needing polling (within time window, not Final)
  const activeRaces = await databases.listDocuments('raceday-db', 'races', [
    Query.greaterThanEqual('startTime', twoHoursAgo.toISOString()),
    Query.lessThanEqual('startTime', oneHourFromNow.toISOString()),
    Query.notEqual('status', 'Final'),
    Query.orderAsc('startTime')
  ]);

  // 2. Process each race based on its polling schedule
  for (const race of activeRaces.documents) {
    const pollingInterval = calculatePollingInterval(race.startTime, now);
    
    if (shouldPollRace(race, now, pollingInterval)) {
      try {
        // Fetch latest race data
        const raceEventData = await fetchRaceEventData(nztabBaseUrl, race.raceId, context);
        
        // Update race status and actual start time
        await updateRaceStatus(race, raceEventData, databases, context);
        
        // Update entrant odds and money flow
        await updateEntrantsData(race.raceId, raceEventData, databases, context);
        
      } catch (error) {
        context.error(`Failed to poll race ${race.raceId}`, { error: error.message });
        // Continue with next race - error isolation
      }
    }
  }
}
```

**Key Features:**
- **Smart Polling:** Dynamic intervals based on race timing
- **Race Status Updates:** Detects status changes and actual start times
- **Odds Tracking:** Creates odds history records for sparklines
- **Money Flow Monitoring:** Tracks hold percentage changes
- **Alert Triggering:** Triggers alert-evaluator on data changes

---

### 5. alert-evaluator

**Purpose:** Evaluate data changes against user alert configurations

**Trigger:** Database events on entrant updates  
**Resource Specification:** `s-1vcpu-512mb`  
**Timeout:** 60 seconds  
**Expected Duration:** ~30 seconds

**Event Triggers:**
```json
{
  "events": ["databases.*.collections.entrants.documents.*.update"]
}
```

**Processing Logic:**
```javascript
export default async function main(context) {
  // 1. Extract entrant data from event payload
  const entrantUpdate = context.req.body;
  const entrantId = entrantUpdate.$id;
  
  // 2. Get active alert configurations for this entrant
  const alertConfigs = await databases.listDocuments('raceday-db', 'user-alert-configs', [
    Query.equal('entrant', entrantId),
    Query.equal('enabled', true)
  ]);
  
  // 3. Evaluate each alert configuration
  for (const alertConfig of alertConfigs.documents) {
    try {
      const shouldTrigger = await evaluateAlertThreshold(
        alertConfig, 
        entrantUpdate, 
        databases, 
        context
      );
      
      if (shouldTrigger) {
        await createNotification(alertConfig, entrantUpdate, databases, context);
      }
    } catch (error) {
      context.error(`Failed to evaluate alert ${alertConfig.$id}`, { 
        error: error.message 
      });
      // Continue with next alert - error isolation
    }
  }
}
```

**Key Features:**
- **Event-Driven:** Triggered automatically by database changes
- **User-Specific:** Evaluates alerts only for affected entrant
- **Threshold Logic:** Supports odds change and money flow alerts
- **Real-time Delivery:** Creates notifications for immediate delivery
- **Error Isolation:** Failed alerts don't affect other users

---

## Error Handling Strategy

### Individual Error Isolation

```javascript
// All functions use this pattern to prevent cascade failures
for (const item of items) {
  try {
    await processItem(item);
  } catch (error) {
    context.error(`Failed to process item ${item.id}`, { error: error.message });
    // Continue with next item - don't fail entire batch
  }
}
```

### Timeout Protection

```javascript
// All external API calls protected with timeouts
const result = await Promise.race([
  externalApiCall(params),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('API timeout')), 15000)
  )
]);
```

### Structured Logging

```javascript
// Consistent logging format across all functions
context.log('Operation completed', {
  functionName: 'daily-meetings',
  duration: Date.now() - startTime,
  recordsProcessed: count,
  // Never log sensitive data (API keys, user data)
});
```

---

## Resource Management

### Memory Optimization

```javascript
// Explicit memory management in daily functions
for (let i = 0; i < items.length; i += BATCH_SIZE) {
  const batch = items.slice(i, i + BATCH_SIZE);
  await processBatch(batch);
  
  // Memory cleanup hint
  batch.length = 0;
  if (global.gc) {
    global.gc();
  }
}
```

### API Rate Limiting

```javascript
// Sequential processing with politeness delays
for (const item of items) {
  await processItem(item);
  await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay
}
```

---

## Monitoring and Observability

### Function Metrics

Each function logs structured metrics:

```javascript
context.log('Function execution completed', {
  functionName: 'daily-meetings',
  duration: executionTime,
  memoryUsage: process.memoryUsage(),
  recordsProcessed: count,
  apiCalls: apiCallCount,
  errors: errorCount
});
```

### Performance Targets

| Function | Max Duration | Max Memory | Success Rate |
|----------|-------------|------------|--------------|
| daily-meetings | 60s | 200MB | >99.5% |
| daily-races | 90s | 300MB | >99.5% |
| daily-entrants | 300s | 800MB | >99% |
| race-data-poller | 120s | 1.5GB | >99.5% |
| alert-evaluator | 30s | 100MB | >99.9% |

---

## Deployment Configuration

### appwrite.json

```json
{
  "functions": [
    {
      "$id": "daily-meetings",
      "name": "Daily Meetings Import",
      "runtime": "node-22",
      "specification": "s-1vcpu-512mb",
      "schedule": "0 17 * * *",
      "timeout": 300,
      "enabled": true,
      "logging": true,
      "entrypoint": "src/main.js"
    },
    {
      "$id": "daily-races",
      "name": "Daily Races Import", 
      "runtime": "node-22",
      "specification": "s-1vcpu-512mb",
      "schedule": "10 17 * * *",
      "timeout": 300,
      "enabled": true,
      "logging": true,
      "entrypoint": "src/main.js"
    },
    {
      "$id": "daily-entrants",
      "name": "Daily Entrants Import",
      "runtime": "node-22", 
      "specification": "s-1vcpu-1gb",
      "schedule": "20 17 * * *",
      "timeout": 300,
      "enabled": true,
      "logging": true,
      "entrypoint": "src/main.js"
    },
    {
      "$id": "race-data-poller",
      "name": "Race Data Poller",
      "runtime": "node-22",
      "specification": "s-2vcpu-2gb",
      "schedule": "*/1 * * * *",
      "timeout": 300,
      "enabled": true,
      "logging": true,
      "entrypoint": "src/main.js"
    },
    {
      "$id": "alert-evaluator",
      "name": "Alert Evaluator",
      "runtime": "node-22",
      "specification": "s-1vcpu-512mb",
      "events": ["databases.*.collections.entrants.documents.*.update"],
      "timeout": 60,
      "enabled": true,
      "logging": true,
      "entrypoint": "src/main.js"
    }
  ]
}
```

---

## Migration from v1.4

### Breaking Changes

1. **Function Removal:** `daily-race-importer` function removed
2. **New Functions:** 5 new specialized functions deployed
3. **Scheduling:** Changed from single execution to staggered pipeline
4. **Resource Specs:** Updated compute specifications per function

### Migration Steps

1. **Deploy New Functions:**
   ```bash
   cd server/appwrite
   appwrite push function daily-meetings
   appwrite push function daily-races
   appwrite push function daily-entrants
   appwrite push function race-data-poller
   appwrite push function alert-evaluator
   ```

2. **Remove Old Function:**
   ```bash
   appwrite delete function daily-race-importer
   ```

3. **Monitor Pipeline:**
   - Check logs at 17:00 UTC for daily-meetings
   - Check logs at 17:10 UTC for daily-races  
   - Check logs at 17:20 UTC for daily-entrants
   - Verify data flow: meetings → races → entrants

4. **Validate Real-time:**
   - Monitor race-data-poller execution every minute
   - Verify odds updates in frontend
   - Test alert notifications

---

## Conclusion

The RaceDay v2.0 microservices backend architecture eliminates the hanging function issues through:

- **Resource Right-Sizing:** Appropriate compute allocation per function
- **Sequential Processing:** Prevents API overwhelming and resource contention  
- **Error Isolation:** Individual failures don't cascade across the pipeline
- **Timeout Protection:** All external calls have 15-second timeouts
- **Memory Management:** Explicit cleanup and batch processing limits

This architecture is production-ready and designed for immediate deployment on existing Appwrite Cloud infrastructure.