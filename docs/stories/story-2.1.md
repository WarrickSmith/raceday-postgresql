# Story 2.1: NZ TAB API Client with Axios

Status: ContextReadyDraft

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

- [ ] Create `server/src/clients/nztab.ts` Axios instance with required headers, timeout, and shared logger wiring.
- [ ] Extend `fetchRaceData` to build status-aware query params and return `RaceDataSchema`-validated payloads.
- [ ] Update `server/src/shared/env.ts` (and associated tests) to include NZ TAB partner config surfaced in `.env.example`.
- [ ] Implement structured logging helpers for fetch attempts and integrate with existing Pino logger.
- [ ] Add Vitest unit tests covering success, retry success, retry exhaustion, and 4xx early exit scenarios.
- [ ] Document any new configuration toggles or operational notes in `docs/runbooks/nztab-credential-preflight.md` if the interface changes.

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

TBD

### Debug Log References

### Completion Notes List

### File List
