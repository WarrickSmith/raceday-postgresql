# 5. Key Architectural Improvements

## 5.1. Resource Management

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

## 5.2. Error Handling & Resilience

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

## 5.3. Real-time Performance

- **Frontend:** WebSocket subscriptions with throttled updates (max 10/second)
- **Backend:** Event-driven alert evaluation triggered by database changes
- **Latency:** Sub-2-second updates from backend to frontend
- **Connection Health:** Automatic reconnection and health monitoring

---
