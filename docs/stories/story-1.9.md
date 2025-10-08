# Story 1.9: Health Check Endpoint

Status: ContextReadyDraft

## Story

As a developer and operations team member,
I want a `/health` endpoint that verifies system health,
so that I can monitor database connectivity and ensure the application is operational.

## Acceptance Criteria

1. Express server replaces the native HTTP server, binding to `env.PORT` and serving as the application entry point ([solution-architecture.md](../solution-architecture.md#api-design), [tech-spec-epic-1.md](../tech-spec-epic-1.md#health-check-endpoint)).
2. GET `/health` endpoint returns 200 OK with structured JSON when system is healthy: `{ status: 'healthy', timestamp: ISO8601, database: 'connected', workers: 'operational' }` ([tech-spec-epic-1.md](../tech-spec-epic-1.md#health-check-endpoint), [architecture-specification.md](../architecture-specification.md#health-checks)).
3. Health check verifies PostgreSQL connectivity via `pool.query('SELECT 1')` and returns 503 Service Unavailable with error details if database check fails ([tech-spec-epic-1.md](../tech-spec-epic-1.md#health-check-endpoint), [solution-architecture.md](../solution-architecture.md#high-level-architecture)).
4. Worker pool health check placeholder returns `workers: 'operational'` (hardcoded true until Epic 2 implements worker pool) ([tech-spec-epic-1.md](../tech-spec-epic-1.md#health-check-endpoint)).
5. Health check failures log structured error messages via Pino logger for observability ([architecture-specification.md](../architecture-specification.md#logging-strategy), [tech-spec-epic-1.md](../tech-spec-epic-1.md#logging-infrastructure)).
6. Docker healthcheck configuration uses `/health` endpoint with appropriate timeout and retry settings ([tech-spec-epic-1.md](../tech-spec-epic-1.md#docker-configuration), [solution-architecture.md](../solution-architecture.md#deployment-architecture)).
7. Express server includes security middleware (helmet) and compression for production readiness ([solution-architecture.md](../solution-architecture.md#api-design), [architecture-specification.md](../architecture-specification.md#dependencies)).

## Tasks / Subtasks

- [ ] Task 1: Set up Express server infrastructure (AC: 1, 7)
  - [ ] Install production dependencies: express, helmet, compression
  - [ ] Install dev dependencies: @types/express, @types/compression
  - [ ] Create `server/src/api/server.ts` with Express app configuration including helmet, compression, and JSON middleware
  - [ ] Configure Express to listen on `env.PORT` with startup logging via Pino
- [ ] Task 2: Implement /health route (AC: 2-5)
  - [ ] Create `server/src/api/routes/health.ts` with GET /health handler
  - [ ] Implement database connectivity check using shared pool from `server/src/database/pool.ts`
  - [ ] Add worker health placeholder (hardcoded `true` until Epic 2)
  - [ ] Return 200 with structured JSON `{ status, timestamp, database, workers }` on success
  - [ ] Return 503 with error details on failure
  - [ ] Log health check failures via Pino logger with error context
- [ ] Task 3: Migrate server entry point (AC: 1)
  - [ ] Update `server/src/index.ts` to import and start Express server instead of native HTTP
  - [ ] Remove inline HTTP server and health check logic
  - [ ] Preserve environment validation and logging initialization
  - [ ] Ensure graceful shutdown hooks (SIGTERM/SIGINT) remain intact
- [ ] Task 4: Update Docker healthcheck configuration (AC: 6)
  - [ ] Update `docker-compose.yml` healthcheck to use `curl -f http://localhost:3000/health`
  - [ ] Set interval=30s, timeout=10s, retries=3 per specification
  - [ ] Update `server/Dockerfile` healthcheck to match docker-compose configuration
- [ ] Task 5: Add integration tests for health endpoint (AC: 2-5)
  - [ ] Create integration test verifying 200 OK response when database is connected
  - [ ] Create integration test verifying 503 response when database is unavailable
  - [ ] Verify response JSON structure matches specification
  - [ ] Confirm error logging occurs on failures

## Dev Notes

### Requirements Context Summary

Epic 1 Story 1.9 requires implementing a production-ready `/health` endpoint using Express framework, replacing the current native HTTP server implementation. The endpoint must verify PostgreSQL connectivity and provide structured health status for Docker healthcheck and monitoring systems ([tech-spec-epic-1.md](../tech-spec-epic-1.md#health-check-endpoint), [solution-architecture.md](../solution-architecture.md#api-design)).

The tech spec prescribes Express as the HTTP framework with helmet for security headers and compression for response optimization. The health endpoint serves as the foundation for the API layer that will be expanded in Epic 3 ([architecture-specification.md](../architecture-specification.md#api-design), [solution-architecture.md](../solution-architecture.md#epic-3-rest-api-layer)).

### Technical Considerations

- **Express Migration:** This story transitions from the native Node.js HTTP server to Express, establishing the framework pattern for all future API endpoints. The migration should preserve existing functionality (environment validation, logging, graceful shutdown) while introducing the Express route structure.

- **Shared Pool Integration:** Health check must use the shared PostgreSQL pool from Story 1.8 (`server/src/database/pool.ts`) rather than creating ad-hoc connections. This ensures consistent connection management and observability.

- **Worker Pool Placeholder:** Until Epic 2 implements the worker thread pool, the health check should hardcode `workers: 'operational'`. This provides the complete health check contract while allowing Story 1.9 to be completed independently.

- **Docker Healthcheck:** The Docker healthcheck configuration must use the `/health` endpoint to enable container orchestration systems to detect unhealthy instances. The curl-based check should fail fast (10s timeout) and retry appropriately (3 times) before marking the container unhealthy.

- **Error Handling:** Health check failures must log via Pino with structured error context (error message, stack trace if available) to support production debugging. The 503 response should include the error message but avoid exposing sensitive internal details.

### Testing Strategy

Integration tests should verify both success and failure paths. For the success case, the test should start the server, connect to PostgreSQL, and assert a 200 response with correct JSON structure. For the failure case, simulate database unavailability (e.g., invalid connection string) and verify 503 response with error logging.

Unit tests for the route handler are optional given the simplicity of the logic, but integration tests are mandatory to validate the full request-response cycle and Docker healthcheck compatibility.

### Project Structure Notes

**New Files:**
- `server/src/api/server.ts` - Express application configuration
- `server/src/api/routes/health.ts` - Health check route handler

**Modified Files:**
- `server/src/index.ts` - Entry point now starts Express server
- `docker-compose.yml` - Updated healthcheck configuration
- `server/Dockerfile` - Updated healthcheck configuration
- `server/package.json` - Added Express dependencies

**Alignment with Architecture:**
This structure matches the target architecture defined in [solution-architecture.md](../solution-architecture.md#component-directory-structure) where API routes live under `server/src/api/routes/` and the Express server is configured in `server/src/api/server.ts`. Future API endpoints (Epic 3) will follow this same pattern.

### References

- [tech-spec-epic-1.md](../tech-spec-epic-1.md) - Health Check Endpoint specification (lines 550-609)
- [solution-architecture.md](../solution-architecture.md) - API Design section (lines 363-410)
- [architecture-specification.md](../architecture-specification.md) - Health Checks (lines 1030-1068)
- [CODING-STANDARDS.md](../CODING-STANDARDS.md) - Express and error handling patterns
- Story 1.8 - Shared PostgreSQL pool implementation

## Dev Agent Record

### Context Reference

- [Story Context 1.9](/home/warrick/Dev/raceday-postgresql/docs/story-context-1.1.9.xml) - Generated 2025-10-08

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
