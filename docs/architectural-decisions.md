# Architectural Decision Records (ADR)

**Project:** Raceday PostgreSQL Migration
**Date:** 2025-10-05
**Architect:** Winston (BMAD System Architect)

---

## ADR-001: Transform Location Strategy

**Status:** Accepted

**Context:**
Money flow calculations are CPU-intensive and currently bottlenecked in Appwrite Functions. We need to decide where these transforms should execute in the new architecture.

**Decision:**
**Hybrid Approach** - Node.js for primary transforms + PostgreSQL for data operations

**Options Considered:**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Pure Node.js** | Flexible, debuggable, version controlled | Many DB round trips for data-dependent calculations | ❌ Rejected |
| **Pure PostgreSQL** | Data stays in DB, set-based operations fast | Stored procedures hard to maintain/debug | ❌ Rejected |
| **Hybrid** | Best of both worlds, right tool for each job | Requires coordination between layers | ✅ **Selected** |

**Implementation:**
- **Node.js handles:**
  - Business logic (money flow calculations)
  - API client logic (NZ TAB fetching)
  - Orchestration (parallel processing)

- **PostgreSQL handles:**
  - Bulk UPSERT operations
  - Time-series aggregations
  - Data validation constraints
  - Materialized views for queries

**Consequences:**
- ✅ Maintainable transform logic in TypeScript
- ✅ Performant bulk database operations
- ✅ Clear separation of concerns
- ⚠️ Requires careful design of data contracts between layers

---

## ADR-002: Execution Model (Monolith vs Microservices)

**Status:** Accepted

**Context:**
Need to decide on application architecture. Should we split into microservices (scheduler, transformer, API) or keep as monolith?

**Decision:**
**Monolith Architecture** with internal parallelization

**Rationale:**

**Why Monolith Wins:**

1. **Performance Requirements:**
   - Need <15s for 5 concurrent races
   - Microservices = network latency between services (milliseconds add up)
   - Monolith = in-process communication (microseconds)

2. **Resource Efficiency:**
   - Single connection pool shared across all operations
   - No duplicate code deployment
   - Memory-efficient within single process

3. **Operational Simplicity:**
   - One container to manage and monitor
   - Simpler CI/CD pipeline
   - Easier debugging and troubleshooting

4. **Use Case Fit:**
   - Single bounded context (race data processing)
   - Tight coupling is beneficial (all components need same data)
   - No independent scaling requirements

**When Microservices Would Be Better (Not Applicable Here):**
- Different scaling needs per component
- Independent deployment cycles required
- Team boundaries requiring separation
- Polyglot persistence needs

**Monolith Structure:**
```
server/ (single deployable)
├── scheduler/     # Dynamic polling
├── fetchers/      # NZ TAB API
├── transformers/  # Money flow calcs
├── database/      # PostgreSQL ops
└── api/           # Client endpoints
```

**Consequences:**
- ✅ Minimal latency (in-process communication)
- ✅ Shared connection pool (efficient)
- ✅ Simpler operations
- ⚠️ Must design for internal modularity
- ⚠️ Future: May extract API layer if needed

---

## ADR-003: Concurrency Strategy

**Status:** Accepted

**Context:**
Need to achieve 2x performance through parallelization. Node.js is single-threaded by default. How do we handle 5 concurrent races with CPU-intensive transforms?

**Decision:**
**Worker Threads for CPU-bound + Promise.all() for I/O-bound**

**Pattern:**
```typescript
// CPU-intensive transforms → Worker Threads
const transformed = await workerPool.exec(rawData);

// I/O-bound operations → Promise.all()
const results = await Promise.allSettled(
  races.map(async (race) => {
    const data = await fetch(race);      // I/O
    const transformed = await worker();  // CPU (worker)
    await write(transformed);            // I/O
  })
);
```

**Why This Works:**

1. **Worker Threads for Transforms:**
   - Money flow calculations are CPU-intensive
   - Workers offload from main event loop
   - Can utilize multiple CPU cores
   - Isolated execution (no memory conflicts)

2. **Promise.all() for I/O:**
   - Fetching from NZ TAB (network I/O)
   - Database writes (disk I/O)
   - Node.js event loop handles efficiently
   - No CPU blocking

**Resource Allocation (4 CPU cores):**
- 1 core: Main event loop (scheduler, API, orchestration)
- 3 cores: Worker threads (transforms)
- Leaves headroom for PostgreSQL client operations

**Alternatives Considered:**
- **Cluster mode:** Rejected (process overhead, harder coordination)
- **External queue (Redis/Bull):** Rejected (adds latency, complexity)
- **Pure async/await:** Rejected (CPU work blocks event loop)

**Consequences:**
- ✅ Efficient CPU utilization
- ✅ Non-blocking I/O operations
- ✅ Can process 5 races in parallel
- ⚠️ Worker pool needs lifecycle management

---

## ADR-004: Database Write Strategy

**Status:** Accepted

**Context:**
Database writes are a major bottleneck. Need to write ~200 rows per race (entrants, money flow, odds) efficiently.

**Decision:**
**Multi-row UPSERT with ON CONFLICT and conditional updates**

**Pattern:**
```sql
INSERT INTO entrants (id, name, odds, ...)
VALUES
  ($1, $2, $3, ...),
  ($9, $10, $11, ...),
  -- all entrants in single statement
ON CONFLICT (entrant_id)
DO UPDATE SET
  win_odds = EXCLUDED.win_odds,
  place_odds = EXCLUDED.place_odds
WHERE
  entrants.win_odds IS DISTINCT FROM EXCLUDED.win_odds
  OR entrants.place_odds IS DISTINCT FROM EXCLUDED.place_odds;
```

**Why This Strategy:**

1. **Single Round Trip:**
   - All entrants for race in one INSERT
   - One database connection
   - One network call
   - Massive performance gain vs row-by-row

2. **Handles Insert + Update:**
   - ON CONFLICT handles both cases
   - No need to check existence first
   - Atomic operation

3. **Conditional Update (WHERE clause):**
   - Only updates when data actually changed
   - Prevents unnecessary writes
   - Reduces WAL (Write-Ahead Log) overhead
   - 30-50% write reduction in practice

4. **Transaction Scope:**
   - Single transaction per race
   - All-or-nothing consistency
   - Rollback on any error

**Performance Impact:**
- Row-by-row INSERT: ~2-5s for 20 entrants
- Bulk UPSERT: ~200ms for 20 entrants
- **10-25x faster** 🚀

**Time-Series Data (Money Flow, Odds):**
- Always INSERT (append-only, no updates needed)
- Use COPY for bulk efficiency
- Partitioned by date for query performance

**Consequences:**
- ✅ <300ms write target achievable
- ✅ Atomic per-race transactions
- ✅ Reduced unnecessary writes
- ⚠️ Must build multi-row VALUES carefully (SQL injection risk - use parameterized queries)

---

## ADR-005: Docker Resource Allocation

**Status:** Accepted

**Context:**
Need to optimize Docker container CPU allocation for 5 concurrent race processing.

**Decision:**
**4 CPU cores, 4GB RAM**

**Calculation:**

**CPU Allocation:**
```
Main Event Loop:        1 core  (scheduler, API, orchestration)
Worker Thread Pool:     3 cores (transforms - one per worker)
PostgreSQL Client:      shared  (I/O-bound, doesn't need dedicated core)
                        -------
Total:                  4 cores
```

**Why 3 Workers (not 5)?**
- 5 races don't all transform simultaneously
- Fetch and Write are I/O-bound (don't need CPU)
- 3 workers can handle 5 races with queueing
- Avoids context switching overhead

**Execution Flow:**
```
Race 1: Fetch(I/O) → Transform(Worker 1) → Write(I/O)
Race 2: Fetch(I/O) → Transform(Worker 2) → Write(I/O)
Race 3: Fetch(I/O) → Transform(Worker 3) → Write(I/O)
Race 4: Fetch(I/O) → Transform(Worker 1) → Write(I/O)  # Worker 1 finished
Race 5: Fetch(I/O) → Transform(Worker 2) → Write(I/O)  # Worker 2 finished
```

**Memory Allocation (4GB):**
- Node.js heap: ~2GB
- Worker threads: ~1GB (3 × ~333MB)
- PostgreSQL client buffers: ~500MB
- OS/overhead: ~500MB

**Docker Configuration:**
```yaml
services:
  server:
    cpus: '4.0'
    mem_limit: 4g
    environment:
      UV_THREADPOOL_SIZE: 8  # Increase default libuv pool
```

**Alternative Considered:**
- **8 CPU cores:** Rejected (diminishing returns, cost inefficient)
- **2 CPU cores:** Rejected (insufficient for 3 workers + main)

**Consequences:**
- ✅ Optimal cost/performance ratio
- ✅ Can process 5 races efficiently
- ✅ Room for PostgreSQL operations
- ⚠️ Monitor CPU usage, scale if needed

---

## ADR-006: Database Partitioning Strategy

**Status:** Accepted

**Context:**
Time-series tables (money_flow_history, odds_history) will grow rapidly. Need efficient storage and query performance.

**Decision:**
**Range partitioning by date (daily partitions)**

**Implementation:**
```sql
CREATE TABLE money_flow_history (
  ...
  event_timestamp TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (event_timestamp);

-- Daily partitions
CREATE TABLE money_flow_history_2025_10_05
  PARTITION OF money_flow_history
  FOR VALUES FROM ('2025-10-05') TO ('2025-10-06');
```

**Why Daily Partitions:**

1. **Query Performance:**
   - Most queries filter by date ("today's races")
   - Partition pruning eliminates irrelevant data
   - Index scans much faster on smaller partitions

2. **Data Lifecycle:**
   - Easy to archive old partitions (DETACH)
   - Can drop old data without VACUUM overhead
   - Backup/restore individual days

3. **Write Performance:**
   - New data goes to "hot" partition (likely in memory)
   - No index bloat on old partitions
   - Better cache utilization

**Automated Partition Management:**
```sql
-- Create tomorrow's partition (run daily at midnight)
CREATE OR REPLACE FUNCTION create_tomorrow_partitions() ...

-- Archive old partitions after 30 days
CREATE OR REPLACE FUNCTION archive_old_partitions() ...
```

**Retention Policy:**
- Keep 30 days online (partitioned)
- Detach older partitions to archive storage
- Cold storage after 90 days (if needed)

**Alternative Considered:**
- **No partitioning:** Rejected (table bloat, slow queries)
- **Weekly partitions:** Rejected (partitions too large for daily queries)
- **Hash partitioning:** Rejected (can't prune by date efficiently)

**Consequences:**
- ✅ Fast queries (partition pruning)
- ✅ Efficient archival
- ✅ Controlled table growth
- ⚠️ Must automate partition creation

---

## ADR-007: API Compatibility Strategy

**Status:** Accepted

**Context:**
Client application currently uses Appwrite API. Migration should minimize client changes.

**Decision:**
**Near drop-in replacement** - same endpoints, same response formats

**Approach:**

1. **Endpoint Mapping:**
   ```
   Appwrite:      GET /databases/{db}/collections/races/documents
   New API:       GET /api/races?meetingId=X

   # Keep query patterns, change URL structure
   ```

2. **Response Format:**
   ```json
   // Keep same JSON structure client expects
   {
     "race_id": "...",
     "name": "...",
     "entrants": [...],
     "odds_history": [...]
   }
   ```

3. **Migration Path:**
   - Deploy new API in parallel
   - Feature flag: `USE_NEW_API=true`
   - Gradual client migration
   - Deprecate Appwrite endpoints

**Client Changes Required:**
- Update API base URL
- Update authentication (if changed)
- No business logic changes

**Why Not 100% Drop-in:**
- Appwrite has specific document structure
- Some fields may rename for clarity
- Opportunity to improve response efficiency

**Consequences:**
- ✅ Minimal client disruption
- ✅ Faster migration
- ✅ Can improve API design
- ⚠️ Document breaking changes clearly

---

## ADR-008: Error Handling & Resilience

**Status:** Accepted

**Context:**
System must be resilient to failures (NZ TAB API down, database errors, worker crashes).

**Decision:**
**Circuit breaker pattern + graceful degradation**

**Strategies:**

1. **NZ TAB API Failures:**
   ```typescript
   // Exponential backoff with circuit breaker
   const fetcher = new CircuitBreaker(fetchNZTAB, {
     timeout: 5000,
     errorThreshold: 50,    // Open circuit after 50% errors
     resetTimeout: 30000,   // Try again after 30s
   });

   // Fallback: Use cached data
   try {
     return await fetcher.fire(raceId);
   } catch (err) {
     return getCachedData(raceId);
   }
   ```

2. **Database Errors:**
   ```typescript
   // Transaction with retry
   await retryWithBackoff(async () => {
     const client = await pool.connect();
     try {
       await client.query('BEGIN');
       await bulkUpsert(...);
       await client.query('COMMIT');
     } catch (err) {
       await client.query('ROLLBACK');
       throw err;
     } finally {
       client.release();
     }
   }, { maxRetries: 3 });
   ```

3. **Worker Thread Crashes:**
   ```typescript
   worker.on('error', (err) => {
     logger.error('Worker crashed', err);
     restartWorker();  // Auto-restart
   });

   // Periodic health check
   setInterval(() => {
     if (!worker.isHealthy()) {
       recreateWorker();
     }
   }, 30000);
   ```

4. **Graceful Degradation:**
   - API returns partial data if some races fail
   - Processing continues for successful races
   - Alert on failures, don't crash

**Monitoring:**
- Track error rates per component
- Alert if error threshold exceeded
- Automatic recovery where possible

**Consequences:**
- ✅ System remains operational during partial failures
- ✅ Automatic recovery from transient errors
- ✅ Better user experience (partial data > no data)
- ⚠️ Complexity in error handling code

---

## ADR-009: Migration Approach

**Status:** Accepted

**Context:**
Need to migrate from Appwrite to new stack with zero downtime and minimal risk.

**Decision:**
**Shadow mode → Gradual cutover with feature flags**

**Migration Phases:**

**Phase 1: Shadow Mode (Week 5, Day 1-2)**
```
NZ TAB API
    ↓
    ├─→ Appwrite (active, serving clients)
    └─→ New Stack (passive, validation only)
        ↓
    Compare outputs
```
- Both systems run in parallel
- New stack processes data but doesn't serve clients
- Compare outputs for accuracy
- Fix discrepancies before cutover

**Phase 2: Gradual Cutover (Week 5, Day 3-4)**
```typescript
// Feature flag per client/percentage
if (shouldUseNewBackend(clientId)) {
  return newAPI.getRaces(meetingId);
} else {
  return appwriteAPI.getRaces(meetingId);
}

// Rollout:
// Day 3: 10% traffic → new stack
// Day 4 AM: 50% traffic → new stack
// Day 4 PM: 100% traffic → new stack
```

**Phase 3: Decommission (Week 6)**
- Monitor for 1 week
- Keep Appwrite as hot standby
- If stable, decommission Appwrite

**Rollback Plan:**
```typescript
// Feature flag for instant rollback
if (EMERGENCY_ROLLBACK) {
  return appwriteAPI;  // All traffic back to Appwrite
}
```

**Success Criteria:**
- ✅ <15s processing validated in shadow mode
- ✅ Data consistency verified
- ✅ No errors during 10% traffic
- ✅ Performance metrics met at 50% traffic
- ✅ User feedback positive

**Alternative Considered:**
- **Big bang cutover:** Rejected (too risky)
- **Blue-green deployment:** Rejected (need comparison period)

**Consequences:**
- ✅ Zero downtime migration
- ✅ Data validation before cutover
- ✅ Instant rollback capability
- ⚠️ Requires dual operation for 1-2 weeks

---

## ADR-010: Observability Strategy

**Status:** Accepted

**Context:**
Need to monitor performance, detect issues, and debug problems in production.

**Decision:**
**Structured logging (Pino) + performance metrics + health checks**

**Implementation:**

**1. Structured Logging:**
```typescript
import pino from 'pino';

const logger = pino({
  level: 'info',
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Usage
logger.info({ raceId: 'R1', duration: 1200 }, 'Race processed');
logger.warn({ raceId: 'R2', duration: 18000 }, 'Slow processing');
logger.error({ err, raceId: 'R3' }, 'Processing failed');
```

**2. Performance Metrics:**
```typescript
// Track key operations
const metrics = {
  raceProcessingTime: histogram('race_processing_seconds'),
  fetchDuration: histogram('nztab_fetch_seconds'),
  transformDuration: histogram('transform_seconds'),
  writeDuration: histogram('db_write_seconds'),
  dbPoolConnections: gauge('db_pool_connections'),
};

// Usage
const start = performance.now();
await processRace(race);
metrics.raceProcessingTime.observe(performance.now() - start);
```

**3. Health Checks:**
```typescript
app.get('/health', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    workers: checkWorkerPool(),
    nztab: await checkNZTABAPI(),
  };

  const healthy = Object.values(checks).every(c => c.status === 'ok');
  res.status(healthy ? 200 : 503).json(checks);
});
```

**4. Alerting Rules:**
- **Critical:** Processing >15s for 3 consecutive cycles
- **Critical:** Database pool exhausted
- **Warning:** Processing >10s
- **Warning:** API response >500ms

**Dashboard Metrics:**
- Race processing time (p50, p95, p99)
- Database write latency
- Worker pool utilization
- Error rates by component

**Alternative Considered:**
- **Prometheus + Grafana:** Future enhancement (current: logs only)
- **APM tools (New Relic, DataDog):** Deferred (cost consideration)

**Consequences:**
- ✅ Visibility into performance bottlenecks
- ✅ Quick issue detection
- ✅ Structured logs for debugging
- ⚠️ Need external aggregation for production

---

## Summary: Key Architectural Decisions

| ADR | Decision | Impact |
|-----|----------|--------|
| **001** | Hybrid transforms (Node.js + PostgreSQL) | Maintainable logic + performant operations |
| **002** | Monolith architecture | Minimal latency, simple operations |
| **003** | Worker threads + Promise.all() | Efficient CPU/I/O parallelization |
| **004** | Multi-row UPSERT with conditionals | <300ms writes (10-25x faster) |
| **005** | 4 CPU cores, 4GB RAM | Optimal resource allocation |
| **006** | Daily partitioning | Fast queries, easy archival |
| **007** | Near drop-in API replacement | Minimal client disruption |
| **008** | Circuit breakers + graceful degradation | Resilient to failures |
| **009** | Shadow mode → gradual cutover | Zero-downtime migration |
| **010** | Structured logging + metrics | Production observability |

---

## Expected Performance Improvement

### Current State (Appwrite)
- Single race: ~6-10s
- 5 concurrent races: >30s (missing updates)
- Polling frequency: 30s
- Data freshness: 30-60s old

### Target State (Node.js/PostgreSQL)
- Single race: ~1.2s ✅
- 5 concurrent races: ~6-9s ✅
- Polling frequency: 15s ✅
- Data freshness: 15-30s old ✅

### Improvement Summary
- **Processing speed:** 2-5x faster
- **Polling frequency:** 2x faster
- **Data freshness:** 2x fresher
- **Competitive advantage:** Users detect insider patterns 2x faster

---

**Document Control:**
- **Version:** 1.0
- **Last Updated:** 2025-10-05
- **Next Review:** After Phase 1 completion

**References:**
- [Architecture Specification](./architecture-specification.md)
- [Developer Quick Start](./developer-quick-start.md)
- [Brainstorming Session Results](./brainstorming-session-results-2025-10-05.md)
