# Raceday PostgreSQL - Developer Quick Start

**Last Updated:** 2025-10-08
**Architecture:** See [architecture-specification.md](./architecture-specification.md)
**Technical Specifications:** See [tech-spec-epic-1.md](./tech-spec-epic-1.md)
**Product Requirements:** See [PRD-raceday-postgresql-2025-10-05.md](./PRD-raceday-postgresql-2025-10-05.md)

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

### 2. Start Database & Server (Docker)

**Option A: Full Stack (Server + PostgreSQL)**

```bash
# From server directory
cd server
docker-compose up --build -d

# Wait for healthy status
docker-compose ps

# Server accessible at http://localhost:7000
# PostgreSQL accessible at localhost:5432
```

**Option B: Database Only (for local development)**

```bash
# From server directory
cd server
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

**Local Development (no Docker):**

```bash
cd server
npm run dev
# Server runs on http://localhost:7000
```

**Docker Development:**

```bash
cd server
docker-compose up --build
# Server runs on http://localhost:7000
```

---

## Docker Deployment

### Dual-Deployment Architecture

The project uses **separate docker-compose configurations** for client and server:

**Server Deployment** (`/server/docker-compose.yml`):

- Node.js 22 server application only
- **PostgreSQL deployed independently** (not included in server compose)
- Port 7000 (external) → Port 7000 (container)
- Resource limits: 4 CPU cores, 4GB memory

**Client Deployment** (`/client/docker-compose.yml`):

- Next.js client application
- Port 3444 (external) → Port 3000 (container)

**Database Deployment**:

- PostgreSQL 18 is deployed separately (managed independently)
- Server connects via DB component variables (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME)

### Deploy Server Stack

**Prerequisites:** PostgreSQL must be running and accessible

```bash
cd server

# Create .env file with database connection details
# See .env.example for all available variables
cat > .env << EOF
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=raceday
NZTAB_API_URL=https://api.tab.co.nz
EOF

docker-compose up --build -d

# Verify service
docker-compose ps

# Check health
curl http://localhost:7000/health
```

### Deploy Client Stack

```bash
cd client
docker-compose --env-file .env.local up --build -d

# Verify
docker-compose ps

# Check health
curl http://localhost:3444/api/health
```

### Production Deployment (Portainer or Docker Desktop)

All stacks deploy independently:

1. **PostgreSQL Database**: Deploy separately (not managed by app docker-compose files)

   - Use native PostgreSQL installation, managed service, or separate container
   - Ensure accessible from server container

2. **Server Stack**: Deploy from `/server/docker-compose.yml`

   - Set environment variables (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, NZTAB_API_URL, etc.) in Portainer UI or .env
   - Node.js server application only
   - External port: 7000

3. **Client Stack**: Deploy from `/client/docker-compose.yml`
   - Set environment variables in Portainer UI or .env.local
   - Next.js application only
   - External port: 3444

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

| Operation          | Target | Current Appwrite |
| ------------------ | ------ | ---------------- |
| Single race        | <2s    | ~6-10s           |
| 5 concurrent races | <15s   | >30s             |
| Database write     | <300ms | N/A              |
| API response       | <100ms | N/A              |

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
      const rawData = await fetchRaceData(race.id)
      const transformed = await transformInWorker(rawData)
      await bulkUpsertRaceData(transformed)
    })
  )
  return results
}
```

### 2. Dynamic Scheduler

**`src/scheduler/index.ts`**

```typescript
// Adjusts polling frequency based on race start time
if (minutesToStart <= 5) {
  intervalMs = 15000 // 15 seconds (2x improvement!)
} else if (minutesToStart <= 15) {
  intervalMs = 30000 // 30 seconds
} else {
  intervalMs = 60000 // 1 minute
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
# Application logs (from /server directory)
cd server
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
console.log('[Worker] Processing:', workerData.raceId)

// Monitor worker pool
import { performance } from 'perf_hooks'
const start = performance.now()
const result = await transformInWorker(data)
console.log('Transform took:', performance.now() - start, 'ms')
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

## Common Development Commands

### Development Workflow

```bash
# Start development server with hot reload
npm run dev
# Server runs on http://localhost:7000

# Build for production
npm run build

# Start production server
npm run start

# Run database migrations
npm run migrate
```

### Code Quality

```bash
# Run ESLint
npm run lint

# Fix ESLint issues automatically
npm run lint:fix

# Format code with Prettier
npm run format

# Check code formatting
npm run format:check
```

### Testing Strategy

```bash
# Run all tests
npm test
# or
npm run test
```

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

### Test Coverage

```bash
# Run tests with coverage report
npm run test:coverage
```

---

## Troubleshooting

### Setup Issues

#### Problem: Node.js version mismatch

**Error:** "Engine node version mismatch" or "Unsupported Node.js version"

**Solution:**

```bash
# Check your Node.js version
node --version
# Should be v22.0.0 or higher

# If using nvm (Node Version Manager):
nvm install 22
nvm use 22
nvm alias default 22

# Verify after switching
node --version
```

#### Problem: Docker won't start

**Error:** "Docker daemon not running" or "Cannot connect to Docker daemon"

**Solution:**

```bash
# Check Docker status
docker --version
docker-compose --version

# Start Docker (Linux)
sudo systemctl start docker
sudo systemctl enable docker

# Start Docker Desktop (macOS/Windows)
# Launch Docker Desktop application

# Verify Docker is running
docker ps
```

#### Problem: Database connection failed

**Error:** "Connection refused" or "Authentication failed"

**Solution:**

```bash
# Check PostgreSQL container status
docker-compose ps

# Check PostgreSQL logs
docker-compose logs postgres

# Verify environment variables
cat .env | grep DB_

# Test connection manually
docker-compose exec postgres psql -U postgres -c "\l"

# Common fixes:
# 1. Ensure PostgreSQL is running: docker-compose up -d postgres
# 2. Verify DB_HOST, DB_PORT, DB_USER, DB_PASSWORD in .env
# 3. Check if database exists: docker-compose exec postgres createdb -U postgres raceday
```

#### Problem: Port already in use

**Error:** "Port 7000 is already in use" or "EADDRINUSE"

**Solution:**

```bash
# Find what's using the port
lsof -i :7000
# or on Windows:
netstat -ano | findstr :7000

# Kill the process (replace PID with actual process ID)
kill -9 PID

# Or change the port in .env:
PORT=7001
```

#### Problem: npm install fails

**Error:** "npm ERR!" during dependency installation

**Solution:**

```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Try installing again
npm install

# If still failing, try with legacy peer deps
npm install --legacy-peer-deps
```

### Runtime Issues

#### Problem: Processing > 15s

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
   console.log('Worker pool status:', workerPool.stats())
   ```

**Solutions:**

- Increase `DB_POOL_MAX` (currently 10)
- Add missing indexes
- Restart worker pool
- Review the startup log entry `PostgreSQL pool configured` to confirm the pool metrics (`max`, `min`, `idleTimeoutMillis`, `connectionTimeoutMillis`) and verify that `DB_POOL_MAX` is set correctly for the environment.

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

### Log Files Reference

**Docker Environment:**

```bash
# Server logs
docker-compose logs -f server

# PostgreSQL logs
docker-compose logs -f postgres

# All logs
docker-compose logs -f
```

**Local Development:**

```bash
# Application logs (if configured)
tail -f logs/app.log

# Error logs
tail -f logs/error.log

# Database logs (PostgreSQL)
tail -f /usr/local/var/log/postgres.log
```

---

## Environment Variables

```env
# Database Configuration (required)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=raceday
DB_POOL_MAX=10

# NZ TAB API (required - public API, no key needed)
NZTAB_API_URL=https://api.tab.co.nz

# Server
NODE_ENV=development
PORT=7000
LOG_LEVEL=info
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

_Target: <15s processing for 5 races (2x improvement)_
