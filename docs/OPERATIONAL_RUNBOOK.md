# RaceDay Operational Runbook

This runbook provides operational procedures, monitoring guidelines, and incident response protocols for the RaceDay application's polling-based architecture.

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Health Check System](#health-check-system)
3. [Polling Cadence Coordination](#polling-cadence-coordination)
4. [Incident Response](#incident-response)
5. [Configuration Management](#configuration-management)
6. [Backend Function Coordination](#backend-function-coordination)
7. [Monitoring & Metrics](#monitoring--metrics)

---

## Daily Operations

### Morning Startup Checklist

**Time: 6:00 AM NZ Time (17:00 UTC previous day)**

1. **Verify Daily Data Import:**
   ```bash
   # Check Appwrite function logs for daily-meetings (17:00 UTC)
   # Expected: ~60 seconds execution time
   # Output: Meeting records for current NZ day

   # Check daily-races (17:10 UTC)
   # Expected: ~90 seconds execution time
   # Output: Race records linked to meetings
   ```

2. **Validate Database State:**
   - Confirm meetings exist for current day
   - Verify race counts match expected AU/NZ schedule
   - Check entrant data is populated (initial odds)

3. **Monitor Backend Health:**
   - Check Appwrite dashboard for function errors
   - Verify database is responsive
   - Review API rate limit usage

### Throughout the Day

1. **Monitor Polling Metrics:**
   - Check error rates (<5% acceptable)
   - Review response times (<500ms for API routes)
   - Validate compression ratios (60-70% reduction)

2. **Watch for Alerts:**
   - Backend function failures
   - Database connection issues
   - API rate limit warnings
   - High latency spikes

3. **Peak Load Periods:**
   - T-5m to race start (30-second polling intervals)
   - Multiple concurrent races (check backend load)
   - Peak betting hours (increased user activity)

### End of Day Procedures

1. **Review Daily Metrics:**
   - Total requests processed
   - Error rates and failure patterns
   - Peak load handling
   - Compression effectiveness

2. **Check Data Quality:**
   - Verify race results recorded correctly
   - Confirm money flow data captured
   - Validate pool totals match race data

3. **Plan for Next Day:**
   - Review upcoming race schedule
   - Anticipate high-load periods
   - Schedule maintenance windows if needed

---

## Health Check System

### Overview

The health monitoring system performs periodic backend health checks to ensure polling only occurs when the backend is available.

**Key Components:**
- **Health Endpoint**: `/api/health` - Lightweight Appwrite connectivity check
- **Check Interval**: Default 3 minutes (configurable)
- **Reference Counting**: Continues while at least one page is active
- **Connection States**: `connecting` → `connected` | `disconnected`

### Configuration

```env
# Enable periodic health checks (default: true)
NEXT_PUBLIC_ENABLE_HEALTH_MONITORING=true

# Health check interval in milliseconds (minimum: 60000 = 1 minute)
# Default: 180000 = 3 minutes
NEXT_PUBLIC_HEALTH_CHECK_INTERVAL_MS=180000
```

### How It Works

1. **Initial Connection:**
   - On page load, health check runs immediately
   - Connection state set to `connecting`
   - If successful: `connected`, polling begins
   - If failed: `disconnected`, user sees retry UI

2. **Periodic Monitoring:**
   - Health checks run every 3 minutes (default)
   - Debounced to prevent redundant checks
   - Reference counting for multi-tab scenarios
   - Continues as long as at least one page active

3. **Connection State Guards:**
   - Polling hooks check connection state before requests
   - If `disconnected`, polling pauses
   - User sees connection status indicator
   - Manual retry button available

4. **Automatic Recovery:**
   - When health check succeeds after failure
   - Connection state changes to `connected`
   - Polling resumes automatically
   - No user intervention required

### Monitoring Health Checks

**View in Browser DevTools:**
```
Network tab > Filter: /api/health
- Frequency: Every 3 minutes (default)
- Response: {"status":"healthy"}
- Time: Should be <1 second
```

**Watch Connection State:**
```javascript
// In browser console
// Check current connection state
document.querySelector('[data-connection-status]')?.textContent
// Should show: "Connected" | "Connecting" | "Disconnected"
```

### Troubleshooting Health Checks

**Problem: Health checks not running**
- Verify `NEXT_PUBLIC_ENABLE_HEALTH_MONITORING=true`
- Check browser console for errors
- Ensure page is active (not backgrounded)

**Problem: False disconnections**
- Check health endpoint response time
- Review timeout settings (default: 5s)
- Verify Appwrite backend is stable

**Problem: Slow auto-recovery**
- Default interval is 3 minutes for efficiency
- Can reduce to 1 minute minimum if needed
- Consider UX impact of manual retry button

---

## Polling Cadence Coordination

### Server-Side Polling (Backend)

**Master Scheduler:**
- **Function**: `master-race-scheduler`
- **Schedule**: Every 1 minute via CRON (UTC)
- **Purpose**: Coordinates all race polling activities
- **Delegates to**: `enhanced-race-poller` for high-frequency updates

**Enhanced Race Poller:**
- **Function**: `enhanced-race-poller`
- **Trigger**: HTTP requests from master scheduler
- **Intervals**: Dynamic based on time-to-start
  - T-65m+: 30-minute intervals (early morning baseline)
  - T-60m to T-5m: 2.5-minute intervals (active period)
  - T-5m to T-3m: 30-second intervals (critical approach)
  - T-3m to Start: 30-second intervals (ultra-critical)
  - Post-start: 30-second intervals until Final

### Client-Side Polling (Frontend)

**Polling Hooks:**
- `useRacePolling.ts` - Main race data with dynamic cadence
- `useMeetingsPolling.tsx` - Meeting list (5-minute intervals)
- `useRacePools.ts` - Pool data synchronized with race polling
- `useMoneyFlowTimeline.ts` - Money flow history (on-demand)

**Cadence Calculation:**
```typescript
// Dynamic interval based on time-to-start
function calculatePollingInterval(race: Race): number {
  const timeToStart = calculateTimeToStart(race.startTime);

  if (timeToStart > 65 * 60 * 1000) return 30 * 60 * 1000;  // 30 minutes
  if (timeToStart > 5 * 60 * 1000) return 2.5 * 60 * 1000;  // 2.5 minutes
  if (timeToStart > 3 * 60 * 1000) return 30 * 1000;        // 30 seconds
  return 30 * 1000;                                          // 30 seconds (post-start)
}
```

**Double Frequency Mode:**
```env
# Halves all polling intervals (use cautiously)
NEXT_PUBLIC_DOUBLE_POLLING_FREQUENCY=true

# When enabled:
# - 5 min → 2.5 min
# - 1 min → 30 sec
# - 30 sec → 15 sec
# - 15 sec → 7.5 sec
```

### Coordination Best Practices

1. **Align Client and Server Cadence:**
   - Client intervals should match or be slightly longer than server
   - Avoids polling for data that hasn't been updated yet
   - Server updates first, then client polls

2. **Monitor Cadence Compliance:**
   - Use polling monitor (dev mode) to track drift
   - Expected vs actual interval comparison
   - Alert if drift exceeds threshold

3. **Handle Timezone Correctly:**
   - Race times in NZ timezone
   - Server functions in UTC
   - Client calculates time-to-start in local time
   - DST transitions handled

4. **Respect Backend Limits:**
   - Don't exceed API rate limits
   - Monitor backend function execution counts
   - Scale backend resources if needed
   - Use `DOUBLE_POLLING_FREQUENCY` cautiously

---

## Incident Response

### Incident 1: Backend Outage

**Detection:**
- Connection indicator shows "Disconnected"
- Console shows 5XX errors or timeouts
- Health checks failing
- User reports "Connection Lost" messages

**Immediate Actions:**
1. **Verify Outage Scope:**
   ```bash
   # Test health endpoint
   curl https://your-appwrite-endpoint/v1/health

   # Check Appwrite status page
   # Review Appwrite console for alerts
   ```

2. **Assess Impact:**
   - How many users affected?
   - Which functions are down?
   - Is database accessible?

3. **User Communication:**
   - Users see automatic "Connection Lost" message
   - Manual retry button available
   - No immediate action required for users

**Resolution:**
1. **Restore Backend:**
   - Fix Appwrite issue (see Appwrite console)
   - Verify functions are executing
   - Test database connectivity

2. **Verify Recovery:**
   - Health checks succeed
   - Connection state changes to "connected"
   - Polling resumes automatically

3. **Monitor Post-Outage:**
   - Watch for request backlog
   - Check error rates normalize
   - Verify data consistency

**Post-Incident:**
- Document root cause
- Update runbook if needed
- Consider preventive measures

### Incident 2: Slow Response Times

**Detection:**
- Polling monitor shows high latency (>2s)
- Users report lag or delays
- Backend function execution times elevated
- Network tab shows slow requests

**Immediate Actions:**
1. **Identify Bottleneck:**
   ```bash
   # Check Appwrite function logs
   # Review database query performance
   # Look for slow API calls
   # Check compression is working
   ```

2. **Assess Impact:**
   - Average latency increase?
   - Affecting all endpoints or specific ones?
   - Peak load period or sustained?

3. **Quick Mitigations:**
   - Increase request timeout temporarily
   - Reduce polling frequency if critical
   - Scale backend resources if available

**Resolution:**
1. **Optimize Queries:**
   - Verify compound indexes in place
   - Check `Query.select` usage
   - Review pagination implementation

2. **Check Compression:**
   - Verify response headers include `Content-Encoding`
   - Compression should be automatic >1KB
   - Test compression helpers in functions

3. **Scale Resources:**
   - Upgrade Appwrite function specifications
   - Add database read replicas if supported
   - Consider CDN for static assets

**Post-Incident:**
- Review performance baselines
- Set up latency alerts
- Document optimization steps

### Incident 3: Missing Data Updates

**Detection:**
- Race data appears stale
- Polls succeed but data unchanged
- Backend functions executing but no updates
- Database not reflecting latest race status

**Immediate Actions:**
1. **Verify Data Flow:**
   ```bash
   # Check master scheduler execution
   # Review enhanced-race-poller logs
   # Verify NZ TAB API is responding
   # Check database write permissions
   ```

2. **Assess Impact:**
   - Which races affected?
   - Is polling working but data stale?
   - Backend or frontend issue?

3. **Check Cadence:**
   - Is polling happening at expected intervals?
   - Are server functions executing on schedule?
   - Any CRON scheduling issues?

**Resolution:**
1. **Backend Functions:**
   - Verify `master-race-scheduler` CRON is active
   - Check `enhanced-race-poller` execution logs
   - Test manual function execution

2. **External API:**
   - Verify NZ TAB API is accessible
   - Check for API rate limiting
   - Review API authentication/credentials

3. **Database:**
   - Confirm write permissions
   - Check for database locks
   - Verify indexes not corrupted

**Post-Incident:**
- Add monitoring for stale data
- Set up alerting for missing updates
- Document data flow dependencies

### Incident 4: Client Performance Issues

**Detection:**
- Browser tab slow or unresponsive
- High memory usage in DevTools
- UI animations stutter
- Users report "lag" or "freezing"

**Immediate Actions:**
1. **Profile Performance:**
   ```javascript
   // Browser DevTools > Performance tab
   // Record 10-second profile during issue
   // Look for long tasks, layout thrashing, memory leaks
   ```

2. **Check Memory:**
   ```javascript
   // Browser DevTools > Memory tab
   // Take heap snapshot
   // Look for retained objects, detached DOM nodes
   ```

3. **Quick Mitigations:**
   - Disable polling monitor in production
   - Reduce polling frequency temporarily
   - Ask users to refresh page

**Resolution:**
1. **Code Review:**
   - Check for memory leaks in hooks
   - Verify `useEffect` cleanup functions
   - Ensure `clearInterval` called
   - Review large state objects

2. **Data Management:**
   - Limit historical data loaded
   - Implement data pruning
   - Add pagination for large lists

3. **Optimization:**
   - Use React.memo for expensive components
   - Implement virtualization for long lists
   - Defer non-critical rendering

**Post-Incident:**
- Add performance monitoring
- Set up memory alerts
- Document performance baselines

---

## Configuration Management

### Environment Variables

**Location:** `client/.env.local` (not committed to git)

**Template:** `client/.env.example` (committed to git)

### Polling Configuration

```env
# Core Polling Controls
NEXT_PUBLIC_POLLING_ENABLED=true              # Master toggle
NEXT_PUBLIC_POLLING_DEBUG_MODE=false          # Debug logging
NEXT_PUBLIC_POLLING_TIMEOUT=5000              # Request timeout (ms)
NEXT_PUBLIC_DOUBLE_POLLING_FREQUENCY=false    # 2x frequency

# Server-side override (optional)
DOUBLE_POLLING_FREQUENCY=false                # Matches master scheduler
```

### Health Monitoring Configuration

```env
# Health Checks
NEXT_PUBLIC_ENABLE_HEALTH_MONITORING=true     # Enable health checks
NEXT_PUBLIC_HEALTH_CHECK_INTERVAL_MS=180000   # Check interval (ms, min 60000)
```

### Development Tools Configuration

```env
# Polling Monitor (dev only)
NEXT_PUBLIC_ENABLE_POLLING_MONITOR=false      # Metrics UI panel

# Logging
NEXT_PUBLIC_LOG_LEVEL=ERROR                   # DEBUG|INFO|WARN|ERROR|SILENT
```

### Appwrite Configuration

```env
# Appwrite Backend
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://appwrite.warricksmith.com/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=your_project_id
APPWRITE_API_KEY=your_api_key                 # Server-side only
```

### Updating Configuration

1. **Development:**
   ```bash
   cd client
   # Edit .env.local
   # Restart dev server
   npm run dev
   ```

2. **Production:**
   ```bash
   cd client
   # Edit .env.local
   # Rebuild application
   npm run build
   npm run start
   ```

3. **Vercel/Hosting Platform:**
   - Update environment variables in platform dashboard
   - Trigger redeployment

### Configuration Validation

```bash
# Verify environment variables loaded
cd client
npm run dev

# Check browser console for config values
# Should NOT see actual secrets (only NEXT_PUBLIC_* on client)
```

---

## Backend Function Coordination

### Daily Data Import Pipeline

**Sequence:**
1. `daily-meetings` (17:00 UTC) → Imports meeting data
2. `daily-races` (17:10 UTC) → Imports race data
3. Implicit: Initial entrant data populated from race import

**Monitoring:**
- Check execution logs in Appwrite console
- Verify success status for each function
- Confirm data in database collections

**Failure Handling:**
- Functions have built-in retry logic
- Errors logged to Appwrite console
- Manual re-execution available if needed

### Live Polling Coordination

**Master Scheduler:**
- **Schedule**: Every 1 minute via CRON
- **Role**: Coordinates polling for all active races
- **Delegates**: High-frequency polling to enhanced-race-poller

**Enhanced Race Poller:**
- **Trigger**: HTTP requests from master scheduler
- **Role**: Fetches latest race data from NZ TAB API
- **Processing**: Mathematical validation, data quality scoring
- **Updates**: Race, entrant, pool, and money flow data

**Function Dependencies:**
```
master-race-scheduler (1 min CRON)
  └─> enhanced-race-poller (HTTP)
        └─> NZ TAB API
              └─> Appwrite Database
                    └─> Client API Routes
                          └─> Client Polling Hooks
```

### Compression in Functions

Each Appwrite function includes inline compression helpers for self-contained deployment:

```javascript
// Inline Brotli/Gzip compression helper
function compressResponse(data, acceptEncoding) {
  const json = JSON.stringify(data);

  // Only compress if >1KB
  if (json.length < 1024) {
    return { body: json, headers: { 'Content-Type': 'application/json' } };
  }

  // Brotli preferred, fallback to Gzip
  if (acceptEncoding.includes('br')) {
    const compressed = brotliCompress(json);
    return {
      body: compressed,
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'br'
      }
    };
  } else if (acceptEncoding.includes('gzip')) {
    const compressed = gzipCompress(json);
    return {
      body: compressed,
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip'
      }
    };
  }

  return { body: json, headers: { 'Content-Type': 'application/json' } };
}
```

### Function Deployment

```bash
cd server

# Deploy all functions
npm run deploy

# Deploy specific function
npm run deploy:master-scheduler
npm run deploy:meetings
npm run deploy:races

# Update environment variables
npm run vars:all
```

### Manual Function Execution

```bash
cd server

# Execute daily data import
npm run meetings
npm run races

# Execute polling functions
npm run master-scheduler
npm run poller

# Execute specific race poller
npm run single-race -- --race-id=<raceId>
```

---

## Monitoring & Metrics

### Key Metrics to Track

1. **Polling Performance:**
   - Requests per minute
   - Error rate (<5% target)
   - Average latency (<500ms target)
   - Cadence compliance

2. **Backend Functions:**
   - Execution count
   - Failure rate
   - Average execution time
   - Cold start frequency

3. **Compression:**
   - Compression ratio (60-70% target)
   - Requests with compression enabled
   - Payload size reduction

4. **Health Monitoring:**
   - Health check success rate (>99% target)
   - Auto-recovery time
   - Connection state duration

### Development Monitoring (Polling Monitor)

Enable for detailed metrics during development:

```env
NEXT_PUBLIC_ENABLE_POLLING_MONITOR=true
```

**Features:**
- Request counts by endpoint
- Error rates and recent failures
- Average/P50/P95/P99 latency
- Cadence tracking and drift warnings
- Recent activity log

**Access:**
- Collapsible panel above Enhanced Entrants Grid
- Only visible when enabled (zero overhead when disabled)

### Production Monitoring

**Recommended Tools:**
- Appwrite Console - Function logs and execution metrics
- Browser DevTools - Network tab for request timing
- Server Logs - Error rates and exceptions

**Alerts to Configure:**
- Backend function failures
- High error rate (>5%)
- Slow response times (>2s average)
- Database connection issues
- API rate limit warnings

### Performance Baselines

**Target Metrics:**
- API route latency: <500ms (p95)
- Backend function execution: 1-5s
- Compression ratio: 60-70%
- Error rate: <5%
- Health check uptime: >99%
- Polling cadence drift: <10%

---

## Escalation Procedures

### Level 1: Self-Service

- User follows troubleshooting guide
- Manual connection retry
- Page refresh
- Browser cache clear

### Level 2: Operator Intervention

- Review Appwrite console
- Check function logs
- Verify database health
- Restart functions if needed
- Adjust configuration

### Level 3: Development Team

- Code changes required
- Performance optimization needed
- Architecture review
- Infrastructure scaling

### Level 4: External Dependencies

- Appwrite platform issues
- NZ TAB API outage
- Network/CDN problems
- Hosting platform issues

---

## Maintenance Windows

### Recommended Schedule

**Low-Traffic Periods:**
- Before 6:00 AM NZ time (daily data import)
- After 11:00 PM NZ time (end of racing day)

**Maintenance Activities:**
- Function deployments
- Database schema changes
- Configuration updates
- Performance testing

**Change Management:**
1. Schedule during low-traffic window
2. Notify users if downtime expected
3. Test in staging environment first
4. Monitor post-deployment
5. Have rollback plan ready

---

## Additional Resources

- **CLAUDE.md**: Project overview and architecture
- **TROUBLESHOOTING.md**: Detailed problem-solving guide
- **polling_plan_REVISED.md**: Polling implementation details
- **client/.env.example**: Configuration reference
- **Appwrite Console**: https://cloud.appwrite.io
