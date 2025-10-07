# Story 1.5: Docker Configuration for Node.js Server

Status: ContextReadyDraft

## Story

As a developer,
I want Docker container configured for Node.js 22 server with separate deployment from client,
so that I can run the server application with consistent resource allocation on independent infrastructure.

## Acceptance Criteria

1. Dockerfile created for Node.js 22 LTS Alpine base image
2. Multi-stage build (dependencies → build → runtime)
3. Container CPU limit: 4 cores
4. Container memory limit: 4GB
5. Health check configured (curl localhost:7000/health)
6. Environment variables passed via docker-compose
7. Volume mounts for logs (if needed)
8. Container restart policy: unless-stopped
9. Separate docker-compose.yml file for server deployment (independent from client)
10. Server API accessible on port 7000 (externally mapped from container port 3000)

## Tasks / Subtasks

- [ ] Task 1: Create server Dockerfile with multi-stage build (AC: 1, 2)
  - [ ] Subtask 1.1: Create builder stage with Node.js 22 Alpine
  - [ ] Subtask 1.2: Add TypeScript build step
  - [ ] Subtask 1.3: Create production runtime stage with minimal dependencies
- [ ] Task 2: Create server docker-compose.yml in server directory (AC: 9, 10)
  - [ ] Subtask 2.1: Define server service with resource limits (AC: 3, 4)
  - [ ] Subtask 2.2: Add PostgreSQL service configuration
  - [ ] Subtask 2.3: Configure environment variable passing (AC: 6)
  - [ ] Subtask 2.4: Configure health check using /health endpoint (AC: 5)
  - [ ] Subtask 2.5: Add volume mounts for logs if needed (AC: 7)
  - [ ] Subtask 2.6: Set restart policy to unless-stopped (AC: 8)
  - [ ] Subtask 2.7: Map container port 3000 to host port 7000 (AC: 10)
- [ ] Task 3: Move existing client docker-compose.yml to client directory (AC: 9)
  - [ ] Subtask 3.1: Move docker-compose.yml to /client/docker-compose.yml
  - [ ] Subtask 3.2: Update any path references in client docker-compose.yml
  - [ ] Subtask 3.3: Test client deployment still works from new location
- [ ] Task 4: Update documentation for dual-deployment model
  - [ ] Subtask 4.1: Document server deployment process (docker-compose up from /server)
  - [ ] Subtask 4.2: Document client deployment process (docker-compose up from /client)
  - [ ] Subtask 4.3: Update developer-quick-start.md with both deployment paths
  - [ ] Subtask 4.4: Document port allocation (client: 3444, server: 7000)
- [ ] Task 5: Test server container deployment
  - [ ] Subtask 5.1: Build server Docker image successfully
  - [ ] Subtask 5.2: Verify container starts with correct resource limits
  - [ ] Subtask 5.3: Verify health check responds correctly at port 7000
  - [ ] Subtask 5.4: Verify environment variables are passed correctly

## Dev Notes

### Architecture Context

This story implements separate Docker deployment configurations for client and server applications, aligning with the two-platform deployment strategy where client and server will be deployed independently.

**Source:** [tech-spec-epic-1.md](../tech-spec-epic-1.md#L270-376)
**Source:** [architecture-specification.md](../architecture-specification.md#L689-807)

### Docker Separation Strategy

**Current State:**
- Single `docker-compose.yml` in project root
- Contains only client (Next.js) service
- Client deployed via Portainer to one Docker platform

**Target State:**
- `/client/docker-compose.yml` - Client deployment (existing service)
- `/server/docker-compose.yml` - Server deployment (new: PostgreSQL + Node.js server)
- Each docker-compose file is independently deployable
- Allows deployment to separate Docker platforms/hosts

**Rationale:**
- Client and server will be deployed to different infrastructure
- Independent scaling and resource allocation
- Cleaner separation of concerns
- Each service can be updated/redeployed independently

### Port Allocation

**Port Mapping:**
- **Client:** External port 3444 → Container port 3000 (existing)
- **Server:** External port 7000 → Container port 3000 (new requirement)
- **PostgreSQL:** External port 5432 → Container port 5432 (database access)

**docker-compose.yml configuration:**
```yaml
server:
  ports:
    - '7000:3000'  # Host 7000 → Container 3000
```

**Environment Variable:**
- Container `PORT=3000` (internal)
- External access via `http://localhost:7000`

### Resource Allocation

**Container Specifications:**
- CPU: 4 cores (matches architecture spec for 5 concurrent race processing)
- Memory: 4GB (sufficient for worker threads + connection pool)
- Restart Policy: `unless-stopped` (automatic recovery)

**Health Check Configuration:**
- Endpoint: `GET /health`
- Internal: `http://localhost:3000/health` (within container)
- External: `http://localhost:7000/health` (from host)
- Interval: 30s
- Timeout: 10s
- Retries: 3
- Start period: 40s (allows application startup time)

**Rationale:** [architecture-specification.md](../architecture-specification.md) Section 7.2 specifies 4 CPU cores and 4GB RAM optimal for 5 concurrent races with worker thread pool.

### Multi-Stage Build Strategy

**Stage 1: Builder**
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
```

**Stage 2: Runtime**
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Benefits:**
- Smaller final image (no dev dependencies or source TypeScript)
- Faster container startup
- Reduced attack surface

**Source:** [tech-spec-epic-1.md](../tech-spec-epic-1.md#L332-376)

### Environment Variables

**Required Variables (passed via docker-compose):**
- `NODE_ENV=production`
- `DATABASE_URL=postgresql://raceday:${DB_PASSWORD}@postgres:5432/raceday`
- `NZTAB_API_URL=${NZTAB_API_URL}`
- `NZTAB_API_KEY=${NZTAB_API_KEY}`
- `PORT=3000` (internal container port)
- `LOG_LEVEL=info`
- `UV_THREADPOOL_SIZE=8`
- `MAX_WORKER_THREADS=3`
- `DB_POOL_MAX=10`

**Source:** [tech-spec-epic-1.md](../tech-spec-epic-1.md#L379-425)

### PostgreSQL Service Configuration

**Server docker-compose.yml should include PostgreSQL:**
```yaml
services:
  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: raceday
      POSTGRES_USER: raceday
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/migrations:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U raceday"]
      interval: 10s
      timeout: 5s
      retries: 5

  server:
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - '7000:3000'  # External port 7000
```

**Source:** [tech-spec-epic-1.md](../tech-spec-epic-1.md#L270-329)

### Testing Strategy

**Integration Tests:**
1. Build server image: `docker build -t raceday-server ./server`
2. Start services: `cd server && docker-compose up -d`
3. Verify health: `curl http://localhost:7000/health` returns 200 OK
4. Check resource limits: `docker inspect raceday-server` shows 4 CPU, 4GB mem
5. Verify restart policy: `docker inspect raceday-server | grep RestartPolicy`

**Client Migration Validation:**
1. Move docker-compose.yml to /client
2. Build client image: `docker build -t raceday-client ./client`
3. Start client: `cd client && docker-compose up -d`
4. Verify client still accessible at port 3444
5. Confirm no broken references to moved file

### Project Structure Notes

**Alignment with unified project structure:**

Current structure:
```
/home/warrick/Dev/raceday-postgresql/
├── docker-compose.yml (client-only, will move)
├── client/
│   └── (Next.js application)
└── server/
    └── (Node.js application)
```

Target structure:
```
/home/warrick/Dev/raceday-postgresql/
├── client/
│   ├── docker-compose.yml (moved here)
│   └── (Next.js application)
└── server/
    ├── docker-compose.yml (new)
    ├── Dockerfile (new)
    └── (Node.js application)
```

**Path Updates Required:**
- Client docker-compose.yml: Change `context: ./client` → `context: .`
- All documentation references to deployment locations
- Health check endpoints updated to use port 7000 for server

### References

- [Source: tech-spec-epic-1.md#Docker-Configuration](../tech-spec-epic-1.md#L270-376) - Complete Docker specifications
- [Source: architecture-specification.md#Deployment-Architecture](../architecture-specification.md#L689-807) - Resource allocation rationale
- [Source: epic-stories-2025-10-05.md#Story-1.5](../epic-stories-2025-10-05.md#L101-116) - Original story acceptance criteria
- [Source: tech-spec-epic-1.md#Environment-Configuration](../tech-spec-epic-1.md#L379-425) - Environment variable schema

## Dev Agent Record

### Context Reference

- [story-context-1.5.xml](../story-context-1.5.xml) - Generated 2025-10-07

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

### Completion Notes List

### File List

