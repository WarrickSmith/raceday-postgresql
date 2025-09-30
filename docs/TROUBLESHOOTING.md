# RaceDay Troubleshooting Guide

This guide provides solutions to common issues encountered when operating the RaceDay application with its polling-based architecture.

## Table of Contents

1. [Connection Issues](#connection-issues)
2. [Polling Problems](#polling-problems)
3. [Performance Issues](#performance-issues)
4. [Development Debugging](#development-debugging)
5. [Environment Configuration](#environment-configuration)

---

## Connection Issues

### Problem: "Connected" status stuck but no data updates

**Symptoms:**
- Connection indicator shows "Connected"
- No new data appearing in UI
- Last update timestamp not changing

**Diagnosis:**
```bash
# Check browser console for polling errors
# Look for failed fetch requests to /api/race/* or /api/meetings
```

**Solutions:**
1. Check if polling is enabled:
   ```env
   NEXT_PUBLIC_POLLING_ENABLED=true
   ```

2. Verify backend health manually:
   ```bash
   curl https://your-appwrite-endpoint/v1/health
   ```

3. Check browser Network tab for failed requests:
   - Look for 5XX errors indicating backend issues
   - Look for timeout errors (default timeout: 5000ms)

4. Enable debug logging to see polling activity:
   ```env
   NEXT_PUBLIC_POLLING_DEBUG_MODE=true
   ```

### Problem: Polling requests failing with 5XX errors

**Symptoms:**
- Connection status flips between "Connected" and "Disconnected"
- Console shows 500/502/503 errors
- UI shows "Connection Lost" messages

**Diagnosis:**
```bash
# Check Appwrite function logs
# Verify database is responding
# Check for backend resource exhaustion
```

**Solutions:**
1. Verify Appwrite backend is healthy:
   - Check Appwrite Console for function errors
   - Review function execution logs for failures
   - Verify database connectivity in Appwrite

2. Check rate limiting:
   - Verify you're not exceeding API rate limits
   - Consider reducing polling frequency temporarily:
     ```env
     NEXT_PUBLIC_DOUBLE_POLLING_FREQUENCY=false
     ```

3. Scale backend resources if needed:
   - Review Appwrite function specifications
   - Consider upgrading function resources (CPU/memory)

### Problem: Health monitoring not running

**Symptoms:**
- No periodic health checks in Network tab
- Connection state never auto-recovers after outage
- Manual retry required every time

**Diagnosis:**
```bash
# Check environment configuration
grep HEALTH_MONITORING client/.env.local
```

**Solutions:**
1. Verify health monitoring is enabled:
   ```env
   NEXT_PUBLIC_ENABLE_HEALTH_MONITORING=true  # Default: true
   ```

2. Check health check interval configuration:
   ```env
   NEXT_PUBLIC_HEALTH_CHECK_INTERVAL_MS=180000  # Default: 3 minutes
   ```

3. Verify health endpoint is accessible:
   ```bash
   curl http://localhost:3000/api/health
   # Should return: {"status":"healthy"}
   ```

---

## Polling Problems

### Problem: Data not updating in real-time

**Symptoms:**
- Race data appears static
- No updates visible even during active races
- Polling appears to have stopped

**Diagnosis:**
```bash
# Enable polling monitor to see request metrics
# Check if polling is enabled
# Verify connection state is "connected"
```

**Solutions:**
1. Verify polling is enabled:
   ```env
   NEXT_PUBLIC_POLLING_ENABLED=true
   ```

2. Check connection state:
   - Look for connection indicator in UI
   - If "Disconnected", trigger manual retry
   - Review console logs for connection failures

3. Enable polling monitor (development):
   ```env
   NEXT_PUBLIC_ENABLE_POLLING_MONITOR=true
   ```
   - Check request counts are incrementing
   - Verify error rate is low (<5%)
   - Review cadence compliance metrics

4. Verify backend functions are running:
   - Check `master-race-scheduler` is executing every 1 minute
   - Verify `enhanced-race-poller` is accessible
   - Review server function logs for errors

### Problem: Polling too slow/fast

**Symptoms:**
- Data updates don't match expected cadence
- Too many requests causing performance issues
- Not enough requests missing important updates

**Diagnosis:**
```bash
# Check DOUBLE_POLLING_FREQUENCY setting
# Review polling monitor metrics for actual vs expected cadence
# Check browser Performance tab for request timing
```

**Solutions:**
1. Review polling frequency configuration:
   ```env
   # Default cadence (recommended):
   NEXT_PUBLIC_DOUBLE_POLLING_FREQUENCY=false

   # Double frequency (use cautiously):
   NEXT_PUBLIC_DOUBLE_POLLING_FREQUENCY=true
   ```

2. **Expected Cadence Windows:**
   - **T-65m+**: 30-minute intervals (early morning baseline)
   - **T-60m to T-5m**: 2.5-minute intervals (active period)
   - **T-5m to T-3m**: 30-second intervals (critical approach)
   - **T-3m to Start**: 30-second intervals (ultra-critical)
   - **Post-start**: 30-second intervals until Final

3. If doubling frequency, monitor backend load:
   - Watch Appwrite function execution counts
   - Check for rate limit warnings
   - Review function execution times

### Problem: Requests timing out

**Symptoms:**
- Console shows AbortError or timeout errors
- Connection indicator flips to "Disconnected" frequently
- Some requests succeed, others timeout

**Diagnosis:**
```bash
# Check timeout configuration
grep POLLING_TIMEOUT client/.env.local

# Review Network tab for slow requests
# Check backend response times in Appwrite console
```

**Solutions:**
1. Increase timeout if backend is slow:
   ```env
   NEXT_PUBLIC_POLLING_TIMEOUT=10000  # Increase to 10 seconds
   ```

   **Note:** Default is 5000ms (5 seconds) for fast failure. Only increase if backend consistently needs more time.

2. Optimize backend response times:
   - Review database query performance
   - Ensure compound indexes are in place
   - Check for missing Query.select optimizations
   - Verify compression is enabled

3. Check network latency:
   - Use browser DevTools Network tab
   - Look for slow DNS resolution
   - Check for geographic distance to Appwrite region

### Problem: Cadence not matching backend

**Symptoms:**
- Polling monitor shows cadence drift warnings
- Data seems stale compared to expected update frequency
- Race timing calculations seem incorrect

**Diagnosis:**
```bash
# Enable polling monitor to see actual vs expected cadence
# Check browser timezone matches race timezone (NZ)
# Verify startTime from API is correct
```

**Solutions:**
1. Verify race start time is correct:
   - Check `race.startTime` value in API response
   - Ensure timezone handling is correct (NZ time)

2. Review interval calculation logic:
   - `useRacePolling` calculates time-to-start
   - Dynamic intervals adjust based on this calculation
   - Any DST issues could cause miscalculation

3. Check for clock skew:
   - Verify system clock is accurate
   - Check browser time matches server time
   - Use NTP to sync system clock if needed

---

## Performance Issues

### Problem: Large payload sizes

**Symptoms:**
- Slow page loads
- High data usage
- Long request times in Network tab
- No "Content-Encoding: br" or "gzip" in response headers

**Diagnosis:**
```bash
# Check response headers in Network tab
# Look for Content-Encoding header
# Compare payload sizes (raw vs compressed)
```

**Solutions:**
1. Verify compression is enabled:
   - Check `Accept-Encoding: br, gzip` in request headers
   - Verify `Content-Encoding: br` or `gzip` in response headers

2. For Next.js API routes:
   - Compression should be automatic for responses >1KB
   - Check `/api/race/[id]/route.ts` has compression helper

3. For Appwrite functions:
   - Each function should have inline compression helper
   - Verify function code includes Brotli/Gzip logic
   - Check function logs for compression errors

4. Expected compression ratios:
   - Should see 60-70% payload reduction
   - Example: 100KB raw → 30-40KB compressed

### Problem: High request latency

**Symptoms:**
- Polling monitor shows high average latency (>2 seconds)
- Slow UI updates
- Users report laggy experience

**Diagnosis:**
```bash
# Enable polling monitor to see latency metrics
# Check Network tab for slow requests
# Review Appwrite function execution times
```

**Solutions:**
1. Check polling monitor metrics:
   - Average latency should be <500ms for API routes
   - Backend function latency varies (1-5s typical)

2. Optimize database queries:
   - Verify compound indexes are in place:
     - `idx_race_entrant_time` on money-flow-history
     - `idx_race_active` on entrants
   - Use `Query.select` to reduce payload
   - Implement cursor-based pagination where appropriate

3. Review backend function performance:
   - Check function execution logs in Appwrite
   - Look for slow database queries
   - Monitor function cold starts

4. Check network path:
   - Run traceroute to Appwrite endpoint
   - Verify geographic proximity to Appwrite region
   - Consider CDN if available

### Problem: Browser memory issues

**Symptoms:**
- Browser tab becomes slow or unresponsive
- DevTools shows high memory usage
- UI animations stutter
- Browser asks to "Wait" or "Kill" page

**Diagnosis:**
```bash
# Open browser DevTools > Memory tab
# Take heap snapshot and analyze
# Check for retained objects or memory leaks
```

**Solutions:**
1. Disable polling monitor in production:
   ```env
   NEXT_PUBLIC_ENABLE_POLLING_MONITOR=false
   ```

2. Reduce polling frequency if memory grows:
   ```env
   NEXT_PUBLIC_DOUBLE_POLLING_FREQUENCY=false
   ```

3. Check for memory leaks:
   - Review `useEffect` cleanup functions
   - Ensure `clearInterval` is called in cleanup
   - Verify abort controllers are used correctly

4. Limit historical data:
   - Money flow timeline should only load T-60m data
   - Implement data pruning for old entries
   - Consider pagination for large datasets

---

## Development Debugging

### Problem: Need to see polling activity

**Solution:**

Enable debug logging and polling monitor:

```env
# Enable detailed console logging
NEXT_PUBLIC_POLLING_DEBUG_MODE=true

# Enable polling monitor UI (collapsible panel on race pages)
NEXT_PUBLIC_ENABLE_POLLING_MONITOR=true

# Optional: Enable verbose logging level
NEXT_PUBLIC_LOG_LEVEL=DEBUG
```

**What You'll See:**
- Console logs for each polling request
- Request start/end timing
- Connection state changes
- Health check execution
- Polling interval calculations

**Polling Monitor Features:**
- Request counts by endpoint
- Error rates and failure counts
- Average latency per endpoint
- Cadence compliance tracking
- Recent activity log
- Visual alerts for issues

### Problem: Need to inspect failed requests

**Solution:**

1. Open browser DevTools > Network tab
2. Filter by "Fetch/XHR"
3. Look for red (failed) requests
4. Click on failed request to see:
   - Request headers
   - Response status code
   - Response body (error details)
   - Timing breakdown

5. Enable "Preserve log" to keep requests across page navigations

### Problem: Need to test connection recovery

**Solution:**

1. Simulate backend outage:
   ```bash
   # Stop Appwrite locally, or block network in DevTools
   # Network tab > Offline mode
   ```

2. Observe:
   - Connection indicator shows "Disconnected"
   - User sees "Connection Lost" message
   - Polling stops (no new requests)
   - Health checks continue (every 3 minutes)

3. Restore connection:
   - Re-enable network
   - Wait for next health check (max 3 minutes)
   - Or click "Retry Connection" button

4. Verify:
   - Connection indicator shows "Connected"
   - Polling resumes automatically
   - Data updates appear

### Problem: Need to debug polling cadence

**Solution:**

Enable polling monitor and check cadence tracking:

```env
NEXT_PUBLIC_ENABLE_POLLING_MONITOR=true
```

Monitor will show:
- **Expected interval**: Based on race timing
- **Actual interval**: Measured between requests
- **Cadence drift**: Difference between expected and actual
- **Warnings**: If drift exceeds threshold

Cadence issues could indicate:
- System clock skew
- Timer drift (browser throttling)
- Race start time miscalculation
- DST/timezone issues

---

## Environment Configuration

### Problem: Unsure which environment variables are set

**Solution:**

Check your `.env.local` file:

```bash
cd client
cat .env.local
```

Compare against `.env.example`:

```bash
cd client
diff .env.local .env.example
```

### Problem: Environment variables not taking effect

**Symptoms:**
- Changed `.env.local` but behavior unchanged
- Settings seem to use default values

**Solutions:**

1. **Restart development server:**
   ```bash
   cd client
   # Stop server (Ctrl+C)
   npm run dev
   ```

2. **Verify variable naming:**
   - Client-side variables MUST start with `NEXT_PUBLIC_`
   - Server-side variables do NOT use `NEXT_PUBLIC_`
   - Example:
     ```env
     NEXT_PUBLIC_POLLING_ENABLED=true  # ✅ Client
     APPWRITE_API_KEY=secret           # ✅ Server
     POLLING_ENABLED=true              # ❌ Won't work on client
     ```

3. **Check for typos:**
   - Variable names are case-sensitive
   - `NEXT_PUBLIC_POLLING_ENABLED` ≠ `NEXT_PUBLIC_POLLING_ENABLE`

4. **Rebuild if deploying:**
   ```bash
   cd client
   npm run build
   npm run start
   ```

### Polling Configuration Reference

```env
# Core Polling Controls
NEXT_PUBLIC_POLLING_ENABLED=true              # Enable/disable polling (default: true)
NEXT_PUBLIC_POLLING_DEBUG_MODE=false          # Debug logging (default: false)
NEXT_PUBLIC_POLLING_TIMEOUT=5000              # Request timeout in ms (default: 5000)
NEXT_PUBLIC_DOUBLE_POLLING_FREQUENCY=false    # 2x polling frequency (default: false)

# Health Monitoring
NEXT_PUBLIC_ENABLE_HEALTH_MONITORING=true     # Enable health checks (default: true)
NEXT_PUBLIC_HEALTH_CHECK_INTERVAL_MS=180000   # Health check interval (default: 180000 = 3 min)

# Development Tools
NEXT_PUBLIC_ENABLE_POLLING_MONITOR=false      # Polling metrics UI (default: false)
NEXT_PUBLIC_LOG_LEVEL=ERROR                   # Logging level (default: ERROR)
```

### Getting Help

If you've tried these troubleshooting steps and still have issues:

1. **Check project documentation:**
   - [CLAUDE.md](../CLAUDE.md) - Project overview and architecture
   - [polling_plan_REVISED.md](../polling_plan_REVISED.md) - Polling implementation details
   - [OPERATIONAL_RUNBOOK.md](./OPERATIONAL_RUNBOOK.md) - Operational procedures

2. **Review commit history:**
   ```bash
   git log --grep="polling\|connection\|health" --oneline -20
   ```

3. **Check test suite:**
   ```bash
   cd client
   npm test
   ```

4. **File an issue:**
   - Include environment details (OS, browser, Node version)
   - Attach relevant console logs
   - Describe steps to reproduce
   - Include screenshot if UI-related
