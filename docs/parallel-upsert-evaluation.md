# Parallel UPSERT Execution Evaluation - Story 2.5

**Date:** 2025-10-12
**Author:** Amelia (Developer Agent)
**Context:** Medium-priority follow-up from Story 2.5 Senior Developer Review

## Executive Summary

Evaluated parallel execution of meetings + races UPSERTs (independent tables) before entrants UPSERT (dependent table). **Recommendation: Maintain sequential execution** due to minimal performance gains, increased complexity, and connection pool constraints.

## Current Implementation (Sequential)

```typescript
// server/src/pipeline/race-processor.ts:72-92
const meetingResult = transformed.meeting !== null && transformed.meeting !== undefined
  ? await bulkUpsertMeetings([transformed.meeting])
  : { rowCount: 0, duration: 0 }

const raceResult = transformed.race !== null && transformed.race !== undefined
  ? await bulkUpsertRaces([...])
  : { rowCount: 0, duration: 0 }

const entrantResult = await bulkUpsertEntrants(transformed.entrants)
```

**Characteristics:**
- Meetings → Races → Entrants (serial execution)
- Each operation holds pooled connection for duration of transaction
- Straightforward error handling and logging
- Total write time = sum of individual durations

## Proposed Parallel Implementation

```typescript
// Parallel execution of independent tables
const [meetingResult, raceResult] = await Promise.all([
  transformed.meeting
    ? bulkUpsertMeetings([transformed.meeting])
    : Promise.resolve({ rowCount: 0, duration: 0 }),
  transformed.race
    ? bulkUpsertRaces([...])
    : Promise.resolve({ rowCount: 0, duration: 0 })
])

// Sequential for dependent table
const entrantResult = await bulkUpsertEntrants(transformed.entrants)
```

**Characteristics:**
- Meetings + Races execute concurrently
- Entrants waits for both to complete (foreign key dependency)
- Requires 2 simultaneous pooled connections during overlap period
- More complex error correlation (which table failed?)

## Performance Analysis

### Timing Data from Integration Tests

From [bulk-upsert.integration.test.ts](../server/tests/integration/database/bulk-upsert.integration.test.ts):

| Operation | Typical Duration | Notes |
|-----------|------------------|-------|
| Meeting UPSERT | 1-7 ms | Single row, lightweight |
| Race UPSERT | 1-7 ms | Single row, 8 fields |
| Entrant UPSERT (20 rows) | 2-4 ms | Multi-row, 22 fields × 20 |

**Sequential Total:** ~10-15 ms
**Parallel Total (theoretical):** ~max(7ms, 7ms) + 4ms = ~11 ms
**Net Savings:** 3-4 ms per race (~20-30% improvement)

### Bottleneck Analysis

Current performance profile:
- **Transform phase:** 50-200 ms (worker thread CPU-bound)
- **Write phase:** 10-15 ms (database I/O)
- **Network fetch:** 100-500 ms (external API latency)

**Observation:** Write phase is already <5% of total race processing time. Optimizing from 15ms → 11ms saves <2% of end-to-end latency.

### Connection Pool Impact

From [tech-spec-epic-2.md:104-108](tech-spec-epic-2.md#L104):
- Pool max: 10 connections
- Concurrent race processing: up to 5 races (maxConcurrency=5)

**Sequential:** 5 races × 1 connection = 5 connections peak
**Parallel:** 5 races × 2 connections = 10 connections peak

**Risk:** Operating at 100% pool capacity increases contention, potential for connection exhaustion under load spikes.

## Complexity vs. Benefit Trade-offs

### Code Complexity

| Aspect | Sequential | Parallel | Impact |
|--------|-----------|----------|--------|
| Error handling | Single try/catch per operation | Aggregated Promise.all failures | Medium |
| Logging correlation | Linear race context | Need to correlate concurrent logs | Low |
| Debugging | Straightforward stack traces | Interleaved async operations | Medium |
| Testing | Current tests validate | New concurrency edge cases | High |

### Failure Scenarios

**Sequential:**
- Meeting fails → race/entrants never attempted (fast fail)
- Clear causality chain for debugging

**Parallel:**
- Meeting succeeds, race fails → need rollback coordination?
- Both fail → which error to surface first?
- Harder to trace root cause in production logs

## Recommendations

### Primary Recommendation: **Maintain Sequential Execution**

**Rationale:**
1. **Minimal Performance Gain:** 3-4ms savings (2% of total latency) doesn't justify complexity
2. **Connection Pool Safety:** Keeps peak usage at 50% capacity, leaving headroom for spikes
3. **Simplicity:** Current code is testable, debuggable, and maintainable
4. **AC8 Compliance:** Already meets <300ms budget with 150ms+ margin

### Alternative: Defer Until Performance Bottleneck Emerges

If future profiling reveals write phase becomes >20% of total latency:
1. **Optimize database first:**
   - Review indexes (EXPLAIN ANALYZE already documented)
   - Consider batch size tuning for entrants UPSERT
   - Evaluate prepared statement caching
2. **Then consider parallelization** if database tuning insufficient

### Implementation Guidance (If Pursued)

If parallel execution is needed in future:

```typescript
// Recommended pattern with explicit error handling
async function parallelWritePhase(transformed: TransformedRaceData): Promise<WriteMetrics> {
  const independentOps = []

  if (transformed.meeting) {
    independentOps.push(
      bulkUpsertMeetings([transformed.meeting])
        .catch(err => ({ error: 'meeting', cause: err }))
    )
  }

  if (transformed.race) {
    independentOps.push(
      bulkUpsertRaces([transformed.race])
        .catch(err => ({ error: 'race', cause: err }))
    )
  }

  const results = await Promise.allSettled(independentOps)

  // Check for failures and aggregate errors
  const failures = results
    .filter(r => r.status === 'rejected')
    .map(r => (r as PromiseRejectedResult).reason)

  if (failures.length > 0) {
    throw new AggregatedWriteError(failures)
  }

  // Sequential for dependent table
  return bulkUpsertEntrants(transformed.entrants)
}
```

**Additional Requirements:**
- New error class `AggregatedWriteError` for multi-table failures
- Enhanced logging to correlate concurrent operations
- Integration tests for race conditions
- Connection pool monitoring (see pg-pool-monitor below)

## Connection Pool Monitoring (Related)

To support future parallel execution decisions, recommend integrating [pg-pool-monitor](https://github.com/justmoon/node-pg-pool-monitor) (next action item):

```typescript
import { monitor } from 'pg-pool-monitor'

monitor(pool, {
  refreshInterval: 1000,
  logger: (stats) => {
    logger.info({
      poolSize: stats.poolSize,
      idleCount: stats.idleCount,
      waitingCount: stats.waitingCount,
      totalCount: stats.totalCount
    }, 'Connection pool metrics')
  }
})
```

## References

- [Story 2.5 Review Notes](../docs/stories/story-2.5.md#L225-L331)
- [Race Processor Implementation](../server/src/pipeline/race-processor.ts#L72-L92)
- [Tech Spec Connection Pool Budget](../docs/tech-spec-epic-2.md#L104-L108)
- [Integration Test Performance Data](../server/tests/integration/database/bulk-upsert.integration.test.ts#L397-L435)

## Decision

**Status:** Sequential execution maintained
**Justification:** Premature optimization - current implementation meets all performance targets with simpler codebase
**Future Review:** Revisit if profiling shows write phase >20% of latency or <300ms budget threatened
