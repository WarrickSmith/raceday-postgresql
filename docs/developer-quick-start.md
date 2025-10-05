# Raceday PostgreSQL - Developer Quick Start

**Last Updated:** 2025-10-05
**Architecture:** See [architecture-specification.md](./architecture-specification.md)

---

## Quick Setup (5 Minutes)

### Prerequisites
- **Node.js 22 LTS** (minimum v22.0.0) - **REQUIRED**
- Docker & Docker Compose
- Git
- npm 10+ (comes with Node.js 22)

### 1. Clone & Setup
```bash
# Already on raceday-postgresql branch
cd /home/warrick/Dev/raceday-postgresql

# Install dependencies
cd server
npm install

# Set up environment
cp .env.example .env
# Edit .env with your NZ TAB API credentials
```

### 2. Start Database
```bash
# From project root
docker-compose up -d postgres

# Wait for healthy status
docker-compose ps
```

### 3. Run Migrations
```bash
cd server
npm run migrate
```

### 4. Start Development Server
```bash
npm run dev
```

---

## Architecture At-a-Glance

```
NZ TAB API → Fetcher → Worker Threads → Bulk UPSERT → PostgreSQL
                           ↓
                    Client API ← HTTP ← Client App
```

**Key Decisions:**
- **Monolith** (not microservices)
- **Hybrid transforms** (Node.js + PostgreSQL)
- **Worker threads** for CPU-intensive calculations
- **Bulk UPSERT** for database writes
- **4 CPU cores** optimal allocation

---

## Performance Targets

| Operation | Target | Current Appwrite |
|-----------|--------|------------------|
| Single race | <2s | ~6-10s |
| 5 concurrent races | <15s | >30s |
| Database write | <300ms | N/A |
| API response | <100ms | N/A |

---

## Project Structure

```
server/
├── src/
│   ├── scheduler/      # Dynamic polling logic
│   ├── fetchers/       # NZ TAB API clients
│   ├── transformers/   # Money flow calculations
│   ├── database/       # PostgreSQL operations
│   ├── api/            # REST endpoints
│   └── shared/         # Utilities, types
├── workers/            # Worker thread scripts
└── tests/              # Unit, integration, perf tests
```

---

## Key Files to Understand

### 1. Race Processor (Orchestrator)
**`src/scheduler/processor.ts`**
```typescript
// Coordinates: Fetch → Transform → Write
export async function processRaces(races: Race[]) {
  const results = await Promise.allSettled(
    races.map(async (race) => {
      const rawData = await fetchRaceData(race.id);
      const transformed = await transformInWorker(rawData);
      await bulkUpsertRaceData(transformed);
    })
  );
  return results;
}
```

### 2. Dynamic Scheduler
**`src/scheduler/index.ts`**
```typescript
// Adjusts polling frequency based on race start time
if (minutesToStart <= 5) {
  intervalMs = 15000;  // 15 seconds (2x improvement!)
} else if (minutesToStart <= 15) {
  intervalMs = 30000;  // 30 seconds
} else {
  intervalMs = 60000;  // 1 minute
}
```

### 3. Bulk Database Operations
**`src/database/operations.ts`**
```typescript
// Multi-row UPSERT with conditional updates
INSERT INTO entrants (...) VALUES ($1...), ($2...)
ON CONFLICT (entrant_id) DO UPDATE SET
  win_odds = EXCLUDED.win_odds
WHERE entrants.win_odds IS DISTINCT FROM EXCLUDED.win_odds;
```

---

## Common Tasks

### Extract Business Logic from server-old
```bash
# Reference these files in server-old:
# - Money flow calculations
# - Polling frequency algorithm
# - Data transformation rules

# Copy to new structure:
cp server-old/functions/transform.js server/src/transformers/moneyflow.ts
# Then refactor to TypeScript
```

### Run Performance Benchmarks
```bash
npm run test:perf

# Expected output:
# ✓ Single race processing < 2s
# ✓ 5 concurrent races < 15s
# ✓ Bulk write < 300ms
```

### Monitor Live Performance
```bash
# Application logs
docker-compose logs -f server

# Database metrics
docker-compose exec postgres psql -U raceday -c "
  SELECT pid, now() - query_start as duration, query
  FROM pg_stat_activity
  WHERE state = 'active';
"
```

### Debug Worker Threads
```typescript
// Add logging in workers/transformWorker.ts
console.log('[Worker] Processing:', workerData.raceId);

// Monitor worker pool
import { performance } from 'perf_hooks';
const start = performance.now();
const result = await transformInWorker(data);
console.log('Transform took:', performance.now() - start, 'ms');
```

---

## Database Quick Reference

### Key Tables
- `meetings` - Race meetings
- `races` - Individual races
- `entrants` - Horse entries
- `money_flow_history` - Time-series money flow (partitioned)
- `odds_history` - Time-series odds (partitioned)
- `race_pools` - Pool totals

### Useful Queries

**Get active races:**
```sql
SELECT * FROM races
WHERE status IN ('upcoming', 'in_progress')
AND start_time > NOW() - INTERVAL '10 minutes'
ORDER BY start_time;
```

**Latest money flow for race:**
```sql
SELECT e.name, mf.hold_percentage, mf.event_timestamp
FROM entrants e
JOIN money_flow_history mf ON mf.entrant_id = e.entrant_id
WHERE e.race_id = 'NZ-AUK-20251005-R1'
ORDER BY mf.event_timestamp DESC
LIMIT 20;
```

**Performance metrics:**
```sql
-- Table sizes
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Active connections
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
```

---

## API Endpoints

### For Client App (near drop-in Appwrite replacement)

**Get meetings:**
```bash
GET /api/meetings?date=2025-10-05&raceType=thoroughbred
```

**Get races:**
```bash
GET /api/races?meetingId=NZ-AUK-20251005
```

**Get entrants with history:**
```bash
GET /api/entrants?raceId=NZ-AUK-20251005-R1
```

**Health check:**
```bash
GET /health
```

---

## Testing Strategy

### Unit Tests
```bash
npm run test:unit

# Test individual components
# - Transform calculations
# - Database operations
# - API endpoints
```

### Integration Tests
```bash
npm run test:integration

# Test full pipeline
# - Fetch → Transform → Write
# - API → Database queries
```

### Performance Tests
```bash
npm run test:perf

# Validate targets
# - <15s for 5 races
# - <300ms database writes
```

---

## Troubleshooting

### Problem: Processing > 15s

**Check:**
1. Database connection pool exhausted?
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
   ```
2. Slow queries?
   ```sql
   SELECT query, now() - query_start as duration
   FROM pg_stat_activity
   WHERE now() - query_start > interval '1 second';
   ```
3. Worker threads healthy?
   ```typescript
   console.log('Worker pool status:', workerPool.stats());
   ```

**Solutions:**
- Increase `DB_POOL_MAX` (currently 10)
- Add missing indexes
- Restart worker pool

### Problem: Worker thread crashes

**Check logs:**
```bash
docker-compose logs server | grep Worker
```

**Common causes:**
- Memory leak (restart workers periodically)
- Unhandled exceptions (add try-catch)
- Invalid data format (validate inputs)

### Problem: NZ TAB API timeouts

**Check:**
```bash
# Test API connectivity
curl -X GET "https://api.tab.co.nz/..." -H "Authorization: Bearer $API_KEY"
```

**Solutions:**
- Increase fetch timeout (currently 5s)
- Implement retry with exponential backoff
- Cache responses for redundancy

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://raceday:password@localhost:5432/raceday
DB_POOL_MAX=10

# NZ TAB API
NZTAB_API_URL=https://api.tab.co.nz
NZTAB_API_KEY=your-api-key-here

# Server
NODE_ENV=development
PORT=3000
UV_THREADPOOL_SIZE=8

# Workers
MAX_WORKER_THREADS=3

# Logging
LOG_LEVEL=debug  # production: info
```

---

## Migration Checklist

### Phase 1: Setup ✅
- [x] Architecture documented
- [ ] Dev environment running
- [ ] PostgreSQL schema created
- [ ] Business logic extracted from server-old

### Phase 2: Development
- [ ] Database operations implemented
- [ ] Worker threads configured
- [ ] NZ TAB fetcher built
- [ ] Race processor created
- [ ] Dynamic scheduler implemented
- [ ] API endpoints created

### Phase 3: Testing
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Performance benchmarks met (<15s)
- [ ] Client compatibility validated

### Phase 4: Deployment
- [ ] Shadow mode validation
- [ ] Gradual traffic cutover
- [ ] Monitoring dashboards active
- [ ] Appwrite decommissioned

---

## Resources

- **Architecture Spec:** [architecture-specification.md](./architecture-specification.md)
- **Brainstorming Session:** [brainstorming-session-results-2025-10-05.md](./brainstorming-session-results-2025-10-05.md)
- **Legacy Code:** `../server-old/` (reference only)
- **PostgreSQL Docs:** https://www.postgresql.org/docs/16/
- **Node.js Worker Threads:** https://nodejs.org/api/worker_threads.html

---

## Need Help?

**Architecture Questions:** Review [architecture-specification.md](./architecture-specification.md)
**Performance Issues:** Check "Troubleshooting" section above
**Database Questions:** See "Database Quick Reference" section

**Quick Wins:**
1. Extract money flow calculations from server-old first
2. Build single race MVP before scaling to 5
3. Use shadow mode to validate before cutover

---

**Happy Coding! 🚀**

*Target: <15s processing for 5 races (2x improvement)*
