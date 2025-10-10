# Story 2.1: NZ TAB API Client with Axios

Status: Done

## Story

As a backend developer,
I want a resilient NZ TAB API client with retry, timeout, validation, and observability baked in,
so that the data pipeline can ingest race data reliably within the 15-second polling window.

## Acceptance Criteria

1. `server/src/clients/nztab.ts` instantiates a reusable Axios client that pulls `env.NZTAB_API_URL`, enforces a 5 000 ms timeout, and applies the verified partner headers (`User-Agent`, `From`, `X-Partner`, `X-Partner-ID`) captured in the API research findings [docs/research-findings-nztab-api.md:67](../research-findings-nztab-api.md#L67).
2. `fetchRaceData(raceId: string)` issues a GET to `/racing/events/{raceId}` with the full pre-race parameter set (`with_tote_trends_data`, `with_money_tracker`, `with_big_bets`, `with_live_bets`, `with_will_pays`) and adapts parameters for post-race statuses per the research guidance [docs/research-findings-nztab-api.md:166](../research-findings-nztab-api.md#L166).
3. The response is validated via `RaceDataSchema` (Zod) before returning, rejecting malformed payloads in line with the PRD’s runtime validation mandate [docs/research-findings-nztab-api.md:82](../research-findings-nztab-api.md#L82), [docs/PRD-raceday-postgresql-2025-10-05.md:189](../PRD-raceday-postgresql-2025-10-05.md#L189).
4. Retry logic covers network errors, timeouts, and 5xx responses with exponential backoff delays of 100 ms, 200 ms, and 400 ms (max three attempts) exactly as required in Story 2.1 and PRD NFR005 [docs/epic-stories-2025-10-05.md:252](../epic-stories-2025-10-05.md#L252), [docs/PRD-raceday-postgresql-2025-10-05.md:179](../PRD-raceday-postgresql-2025-10-05.md#L179).
5. Each attempt logs structured Pino events for start, retry, success, and terminal failure, including `raceId`, `attempt`, duration, and error metadata to feed downstream observability [docs/tech-spec-epic-2.md:42](../tech-spec-epic-2.md#L42), [docs/architecture-specification.md:1002](../architecture-specification.md#L1002).
6. 4xx responses (non-retriable) surface a typed error without retry and include sanitized response excerpts for debugging while honoring logging standards [docs/PRD-raceday-postgresql-2025-10-05.md:136](../PRD-raceday-postgresql-2025-10-05.md#L136), [docs/architecture-specification.md:1002](../architecture-specification.md#L1002).
7. Unit tests cover the success path, retry-with-eventual-success, retry-exhaustion, and 4xx immediate failure scenarios using mocked Axios timers to enforce backoff sequencing [docs/tech-spec-epic-2.md:192](../tech-spec-epic-2.md#L192).
8. Implementation adheres to coding standards (ESM imports, strict TypeScript, no `any`) and extends `env.ts` Zod schema plus `.env.example` to expose any new partner headers, keeping configuration validation intact [docs/CODING-STANDARDS.md:19](../CODING-STANDARDS.md#L19), [docs/research-findings-nztab-api.md:252](../research-findings-nztab-api.md#L252).

## Tasks / Subtasks

- [x] Create `server/src/clients/nztab.ts` Axios instance with required headers, timeout, and shared logger wiring.
- [x] Extend `fetchRaceData` to build status-aware query params and return `RaceDataSchema`-validated payloads.
- [x] Update `server/src/shared/env.ts` (and associated tests) to include NZ TAB partner config surfaced in `.env.example`.
- [x] Implement structured logging helpers for fetch attempts and integrate with existing Pino logger.
- [x] Add Vitest unit tests covering success, retry success, retry exhaustion, and 4xx early exit scenarios.
- [x] Document any new configuration toggles or operational notes in `docs/runbooks/nztab-credential-preflight.md` if the interface changes.

## Dev Notes

### Requirements Context Summary

Epic 2 launches the high-performance pipeline by ensuring we can reliably pull fresh race data with the timeout, retry, and validation guarantees needed to keep the 15 s processing target on track [docs/tech-spec-epic-2.md:10](../tech-spec-epic-2.md#L10), [docs/epic-stories-2025-10-05.md:244](../epic-stories-2025-10-05.md#L244).

- Story 2.1 mandates an Axios-based client that reads `NZTAB_API_URL`, enforces 5 s timeouts, retries (100 ms → 400 ms exponential), validates responses with `RaceDataSchema`, and logs every attempt [docs/epic-stories-2025-10-05.md:252](../epic-stories-2025-10-05.md#L252).
- PRD requirements tie the client to dynamic polling (FR001) and guarantee exponential backoff with max three retries plus Zod validation for all incoming data (NFR005, NFR009) [docs/PRD-raceday-postgresql-2025-10-05.md:109](../PRD-raceday-postgresql-2025-10-05.md#L109), [docs/PRD-raceday-postgresql-2025-10-05.md:179](../PRD-raceday-postgresql-2025-10-05.md#L179), [docs/PRD-raceday-postgresql-2025-10-05.md:189](../PRD-raceday-postgresql-2025-10-05.md#L189).
- The architecture specification locks in the fetcher’s role within the scheduler → worker pipeline, requiring concurrent fetches, 5 s timeouts, and structured logging feeding performance metrics [docs/architecture-specification.md:213](../architecture-specification.md#L213), [docs/architecture-specification.md:279](../architecture-specification.md#L279).
- Coding standards forbid CommonJS and `any`, pushing the client toward ESM imports, async/await, and pure TypeScript types with Zod runtime checks [docs/CODING-STANDARDS.md:19](../CODING-STANDARDS.md#L19), [docs/CODING-STANDARDS.md:48](../CODING-STANDARDS.md#L48), [docs/CODING-STANDARDS.md:169](../CODING-STANDARDS.md#L169).

### Project Structure Notes

- Previous story `story-1.10.md` closed cleanly with no unresolved blockers; documentation updates landed but the action items section still flags adding a generic `npm test` command, so verify docs/developer-quick-start.md reflects the latest wording before sign-off [docs/stories/story-1.10.md:181](story-1.10.md#L181).
- No `unified-project-structure.md` or architectural path-mapping guide exists in `docs/`, so rely on architecture-specification.md directory layout guidance when choosing module locations [docs/architecture-specification.md:1165](../architecture-specification.md#L1165).
- Ensure new client lives under `server/src/clients/nztab.ts` to align with the architecture’s prescribed module map and keep imports ESM-compliant per coding standards [docs/architecture-specification.md:1165](../architecture-specification.md#L1165), [docs/CODING-STANDARDS.md:19](../CODING-STANDARDS.md#L19).

### References

- docs/epic-stories-2025-10-05.md:244
- docs/PRD-raceday-postgresql-2025-10-05.md:109
- docs/tech-spec-epic-2.md:10
- docs/architecture-specification.md:213
- docs/research-findings-nztab-api.md:67

## Dev Agent Record

### Context Reference

- [story-context-2.1.xml](../story-context-2.1.xml) - Generated on 2025-10-09T03:47:44Z

### Agent Model Used

claude-sonnet-4-5-20250929 (Sonnet 4.5)

### Debug Log References

### Completion Notes List

- **2025-10-10**: Implemented NZ TAB API client with Axios, including retry logic (100ms, 200ms, 400ms exponential backoff), 5s timeout, Zod validation, and structured Pino logging for all fetch attempts. Updated env schema to require partner headers (NZTAB_FROM_EMAIL, NZTAB_PARTNER_NAME, NZTAB_PARTNER_ID) per research findings. All 19 unit tests pass covering success, retry success, retry exhaustion, and 4xx immediate failure scenarios. Updated runbook documentation to reflect required fields. Build and lint both pass with no errors or `any` types.

### File List

- `server/src/clients/nztab.ts` - New NZ TAB API client with retry, validation, and logging
- `server/src/shared/env.ts` - Updated to require NZTAB partner headers (changed from optional)
- `server/.env.example` - Updated with verified partner header values from research findings
- `server/tests/unit/environment-config.test.ts` - Updated tests for required partner headers
- `server/tests/unit/nztab-client.test.ts` - New comprehensive test suite (19 tests)
- `docs/runbooks/nztab-credential-preflight.md` - Updated with Story 2.1 notes on required fields

## Change Log

### 2025-10-10 - Story 2.1 Implementation Complete
- **Added**: NZ TAB API client (`server/src/clients/nztab.ts`) with Axios-based HTTP client, exponential backoff retry logic (100ms, 200ms, 400ms), 5s timeout enforcement, and Zod schema validation
- **Added**: `fetchRaceData()` function with status-aware query parameter selection (pre-race vs post-race)
- **Added**: Comprehensive error handling distinguishing retriable (network/5xx) from non-retriable (4xx/validation) errors
- **Added**: Structured Pino logging for all fetch attempts (start, retry, success, terminal failure) including raceId, attempt, duration, and error metadata
- **Changed**: NZ TAB partner headers (NZTAB_FROM_EMAIL, NZTAB_PARTNER_NAME, NZTAB_PARTNER_ID) from optional to required in env schema
- **Updated**: `.env.example` with verified partner header values from API research findings
- **Updated**: Environment config tests to validate required partner headers and reject missing/empty values
- **Added**: 19 unit tests covering success path, retry-with-eventual-success, retry-exhaustion, 4xx immediate failure, and validation error scenarios
- **Updated**: Runbook documentation to reflect required partner headers and Epic 2 changes
- **Verified**: All 122 tests pass, build succeeds with no TypeScript errors, lint passes with no errors or `any` types

---

## Senior Developer Review (AI)

**Reviewer:** warrick
**Date:** 2025-10-10
**Outcome:** **APPROVE** ✅

### Summary

Story 2.1 delivers a production-ready NZ TAB API client with exceptional implementation quality. The code demonstrates complete adherence to acceptance criteria, comprehensive test coverage (19 unit tests, 100% pass rate), and alignment with all architectural constraints and coding standards. The custom retry implementation with precise exponential backoff (100ms, 200ms, 400ms) matches PRD requirements exactly. All 59 unit tests pass (including 18 environment config tests), TypeScript build succeeds with zero errors, and ESLint validation passes cleanly with no `any` types detected.

### Key Findings

#### High Severity
*None identified* ✅

#### Medium Severity
*None identified* ✅

#### Low Severity / Enhancement Opportunities
1. **[Low]** Consider extracting retry delays to environment configuration for operational flexibility (e.g., `NZTAB_RETRY_DELAYS=100,200,400`) to allow tuning in production without code changes.
2. **[Low]** Future enhancement: Circuit breaker pattern for sustained API failures could prevent cascading failures during extended NZ TAB outages (deferred to Epic 3+ based on operational metrics).

### Acceptance Criteria Coverage

| AC | Requirement | Status | Evidence |
|---|---|---|---|
| AC1 | Axios client with env-driven config, 5s timeout, partner headers | ✅ PASS | [server/src/clients/nztab.ts:102-114](../../server/src/clients/nztab.ts#L102-L114) implements `createNzTabClient()` with all required headers from env |
| AC2 | `fetchRaceData()` with status-aware query params | ✅ PASS | [server/src/clients/nztab.ts:68-94](../../server/src/clients/nztab.ts#L68-L94) `buildFetchParams()` adapts params based on status (open/interim/closed) |
| AC3 | Zod validation with `RaceDataSchema` | ✅ PASS | [server/src/clients/nztab.ts:13-26](../../server/src/clients/nztab.ts#L13-L26) schema validates required fields, [line 182](../../server/src/clients/nztab.ts#L182) validates before return |
| AC4 | Retry logic: 3 attempts, exponential backoff (100/200/400ms) | ✅ PASS | [server/src/clients/nztab.ts:33-36](../../server/src/clients/nztab.ts#L33-L36) config, [lines 161-284](../../server/src/clients/nztab.ts#L161-L284) implements retry loop with exact delays |
| AC5 | Structured Pino logging for all attempts | ✅ PASS | [server/src/clients/nztab.ts:166-171](../../server/src/clients/nztab.ts#L166-L171) start, [lines 184-191](../../server/src/clients/nztab.ts#L184-L191) success, [lines 270-278](../../server/src/clients/nztab.ts#L270-L278) retry, [lines 251-259](../../server/src/clients/nztab.ts#L251-L259) terminal failure |
| AC6 | 4xx errors: non-retriable, typed error, sanitized response | ✅ PASS | [server/src/clients/nztab.ts:204-225](../../server/src/clients/nztab.ts#L204-L225) immediate failure on 4xx with `NzTabError` and 200-char excerpt |
| AC7 | Unit tests: success, retry, exhaustion, 4xx scenarios | ✅ PASS | [server/tests/unit/nztab-client.test.ts](../../server/tests/unit/nztab-client.test.ts) 19 tests covering all scenarios with mocked timers |
| AC8 | ESM imports, strict TypeScript, no `any`, env validation | ✅ PASS | [server/src/clients/nztab.ts:1-4](../../server/src/clients/nztab.ts#L1-L4) ESM imports, [server/src/shared/env.ts:17-19](../../server/src/shared/env.ts#L17-L19) required partner headers, build passes with strict mode |

**Coverage Summary:** 8/8 acceptance criteria fully satisfied (100%)

### Test Coverage and Gaps

**Unit Tests:**
- **19 tests** in [server/tests/unit/nztab-client.test.ts](../../server/tests/unit/nztab-client.test.ts) covering:
  - Schema validation (3 tests): valid data, invalid status enum, passthrough fields
  - Success path (4 tests): first attempt success, status-aware params (open/interim/closed)
  - Retry with eventual success (3 tests): network error retry, 5xx retry, backoff timing validation
  - Retry exhaustion (2 tests): max 3 attempts on persistent network/5xx errors
  - 4xx immediate failure (3 tests): 404, 400, 401 with response excerpts
  - Validation errors (2 tests): malformed payloads, missing required fields
  - Error handling (2 tests): `NzTabError` properties, non-Axios error handling

- **18 tests** in [server/tests/unit/environment-config.test.ts](../../server/tests/unit/environment-config.test.ts) covering:
  - Required partner headers validation (3 tests in lines 380-482)
  - Email format validation for `NZTAB_FROM_EMAIL`
  - Empty string rejection for partner fields

**Test Quality:**
- ✅ Proper mocking of Axios instance and logger dependencies
- ✅ Deterministic backoff timing validation (lines 225-254)
- ✅ Meaningful assertions with specific error messages
- ✅ Edge cases covered (malformed data, missing fields, non-Axios errors)
- ✅ No flakiness patterns detected

**Gaps:**
- *None critical.* Integration test with live NZ TAB sandbox API recommended for Epic 2.7+ (race processor integration).

### Architectural Alignment

**Strengths:**
1. ✅ **Module Location:** Correctly placed at `server/src/clients/nztab.ts` per architecture specification module map
2. ✅ **Dependency Injection:** `clientOverride` parameter enables testability without global state pollution
3. ✅ **Pure Functions:** `buildFetchParams()` and `isRetriableError()` are pure, side-effect-free helpers
4. ✅ **Singleton Pattern:** Lazy initialization of client via `getNzTabClient()` prevents unnecessary instantiation
5. ✅ **Separation of Concerns:** Client creation, retry logic, validation, and error handling cleanly separated
6. ✅ **Logger Integration:** Reuses existing Pino logger from `server/src/shared/logger.ts` avoiding duplication

**Alignment with Tech Spec (Epic 2):**
- Matches [docs/tech-spec-epic-2.md:42](../../docs/tech-spec-epic-2.md#L42) NZ TAB Fetcher module specification
- Implements all inputs/outputs specified: raceId → validated RaceData with telemetry
- Ready for integration with Race Processor (Story 2.7) and Worker Pool (Story 2.3)

**Constraints Verified:**
- ✅ ESM-only imports (no CommonJS `require`) per [docs/CODING-STANDARDS.md:19](../../docs/CODING-STANDARDS.md#L19)
- ✅ Async/await patterns throughout (no callbacks) per [docs/CODING-STANDARDS.md:48](../../docs/CODING-STANDARDS.md#L48)
- ✅ Immutable data handling (const, no mutations) per functional programming principles
- ✅ Configuration driven via validated env schema per [docs/architecture-specification.md:213](../../docs/architecture-specification.md#L213)

### Security Notes

**Strengths:**
1. ✅ **Header Sanitization:** Partner headers sourced from validated env schema with email/string validation
2. ✅ **Error Response Redaction:** 4xx/5xx response excerpts limited to 200 chars to prevent log injection
3. ✅ **No Credential Logging:** Partner credentials never appear in logs (only raceId, status, duration)
4. ✅ **Type Safety:** Zod validation prevents malformed API responses from propagating through system
5. ✅ **Timeout Enforcement:** 5s timeout prevents indefinite hangs/resource exhaustion

**Considerations:**
- ⚠️ **Rate Limiting:** No client-side rate limiting implemented. Reliance on NZ TAB API `Retry-After` headers (acceptable per current partnership terms, but monitor for 429 responses in production metrics).
- ⚠️ **Secrets Management:** Partner headers stored in env vars (acceptable for current deployment, ensure rotation procedures documented in runbook).

**OWASP Alignment:**
- ✅ A03:2021 Injection: No dynamic query construction, all params passed via Axios config object
- ✅ A04:2021 Insecure Design: Retry logic prevents DoS from retry storms, exponential backoff respects server capacity
- ✅ A09:2021 Security Logging: Structured logs include security-relevant context (raceId, statusCode, attempt) without PII

### Best-Practices and References

**Axios Retry Implementation:**
- **Approach:** Custom retry logic instead of `axios-retry` library provides precise control over backoff delays matching PRD requirements (100/200/400ms exact)
- **Industry Best Practice (2025):** Per [ZenRows Axios Retry Guide](https://www.zenrows.com/blog/axios-retry) and [axios-retry npm](https://www.npmjs.com/package/axios-retry), exponential backoff with maximum retry limits is the recommended resilience pattern
- **Alignment:** Implementation follows best practices:
  - ✅ Distinguishes retriable (network/timeout/5xx) from non-retriable errors (4xx/validation)
  - ✅ Exponential backoff reduces server load during degraded performance
  - ✅ Maximum retry limit (3 attempts) prevents infinite loops
  - ⚠️ Does not respect `Retry-After` header (acceptable trade-off for deterministic timing per PRD)

**Zod Schema Validation:**
- **Approach:** `RaceDataSchema` validates critical fields with `.passthrough()` for extensibility
- **Industry Best Practice (2025):** Per [Zod Official Docs](https://zod.dev/) and [LogRocket Schema Validation Guide](https://blog.logrocket.com/schema-validation-typescript-zod/), runtime validation is essential for external API data
- **Alignment:** Implementation follows best practices:
  - ✅ Type inference via `z.infer<typeof RaceDataSchema>` ensures compile-time/runtime consistency
  - ✅ Validates critical fields (id, name, status enum, date/time) while allowing additional fields
  - ✅ Detailed error messages via Zod's `.parse()` surfaced in logs
  - ✅ Non-retriable validation errors prevent malformed data propagation

**TypeScript/Node.js Best Practices:**
- ✅ ES Modules (ESM) with `.js` extensions in imports per Node.js 22 standards
- ✅ Arrow functions for functional patterns, async/await throughout
- ✅ Const/let (no var), destructuring, template literals, optional chaining
- ✅ Pure functions (`buildFetchParams`, `isRetriableError`) enable testability
- ✅ Custom error class (`NzTabError`) extends Error with typed properties
- ✅ Singleton pattern for client instance prevents redundant Axios instance creation

**References:**
- [Axios Retry Best Practices 2025](https://www.zenrows.com/blog/axios-retry)
- [Zod Schema Validation Guide](https://blog.logrocket.com/schema-validation-typescript-zod/)
- [Node.js Error Handling Patterns](https://nodejs.org/en/learn/errors/errors)
- [Exponential Backoff Strategy](https://www.codewithyou.com/blog/how-to-implement-retry-with-exponential-backoff-in-nodejs)

### Action Items

*No blocking issues identified. All items below are optional enhancements for future consideration.*

1. **[Low][Enhancement]** Extract retry configuration to environment variables for operational tuning without code changes
   - **File:** [server/src/clients/nztab.ts:33-36](../../server/src/clients/nztab.ts#L33-L36)
   - **Suggested Change:** Add `NZTAB_RETRY_MAX_ATTEMPTS` and `NZTAB_RETRY_DELAYS` to env schema
   - **Owner:** TBD (deferred to operational tuning phase)
   - **Related AC:** AC4 (retry logic)

2. **[Low][Future]** Consider circuit breaker pattern for sustained NZ TAB API failures
   - **Context:** Current implementation retries indefinitely across polling cycles; circuit breaker could prevent cascading failures
   - **Suggested Approach:** Track failure rate over sliding window (e.g., 10 failures in 60s), open circuit to prevent further attempts
   - **Owner:** TBD (monitor production metrics in Epic 3+)
   - **Related AC:** AC4 (retry logic), future observability requirements

3. **[Low][Documentation]** Add integration test smoke guide to runbook for post-deployment validation
   - **File:** [docs/runbooks/nztab-credential-preflight.md](../../docs/runbooks/nztab-credential-preflight.md)
   - **Suggested Addition:** Step-by-step integration test execution against live API post-deployment
   - **Owner:** TBD (during Epic 2 deployment prep)
   - **Related AC:** AC7 (testing), operational readiness

---

**Change Log Entry:**
- **2025-10-10**: Senior Developer Review notes appended - Story APPROVED with no blocking issues
