# Story 2.2: NZ TAB API Response Type Definitions

Status: Ready

## Story

As a backend developer,
I want comprehensive Zod schemas and TypeScript types for all NZ TAB API response shapes,
so that the pipeline validates external data at runtime and ensures type-safe data flow with zero `any` types.

## Acceptance Criteria

1. Zod schemas defined for RaceData, Entrant, Odds, Pool, and MeetingData that match NZ TAB API response structure and Appwrite field mappings from database-setup.js [server-old/database-setup/src/database-setup.js:942-980](../../server-old/database-setup/src/database-setup.js#L942-L980).
2. TypeScript types inferred from Zod schemas using `z.infer<>` with no `any` types anywhere in the type definitions, enforced by strict TypeScript configuration [docs/CODING-STANDARDS.md:169](../CODING-STANDARDS.md#L169).
3. All external API responses validated with `schema.parse()` or `schema.safeParse()` before use in the pipeline, emitting structured validation errors on failure [docs/tech-spec-epic-2.md:167](../tech-spec-epic-2.md#L167).
4. Validation errors logged with structured details (field path, expected type, actual value, error reason) using Pino logger for debugging API contract changes [docs/epic-stories-2025-10-05.md:274](../epic-stories-2025-10-05.md#L274).
5. No `any` types used in type definitions or validation code, verified by ESLint strict rules (`npm run lint`) and TypeScript build (`npm run build`) [docs/epic-stories-2025-10-05.md:275](../epic-stories-2025-10-05.md#L275).
6. Example test cases covering valid API responses, invalid status enums, missing required fields, and malformed nested structures to guard against API drift [docs/epic-stories-2025-10-05.md:276](../epic-stories-2025-10-05.md#L276).
7. Schemas align with Appwrite legacy fields: `fixedWinOdds`/`fixedPlaceOdds` for entrants (float), `holdPercentage`/`betPercentage` for money flow calculations, datetime fields for all timestamps per database-setup.js mappings [server-old/database-setup/src/database-setup.js:959-962](../../server-old/database-setup/src/database-setup.js#L959-L962), [docs/tech-spec-epic-2.md:66](../tech-spec-epic-2.md#L66).
8. Schemas use `.passthrough()` to allow additional fields from API while validating critical fields required by transform (Story 2.4) and database layers (Story 2.5), enabling API evolution without breaking changes [docs/tech-spec-epic-2.md:92](../tech-spec-epic-2.md#L92).

## Tasks / Subtasks

- [ ] Create `server/src/clients/nztab-types.ts` with Zod schemas for all NZ TAB response shapes (AC: 1, 7, 8)
  - [ ] Define `MeetingDataSchema` with meetingId, meetingName, country, raceType, date, status fields
  - [ ] Define `EntrantSchema` with entrantId, name, runnerNumber, fixedWinOdds, fixedPlaceOdds, isScratched, barrier
  - [ ] Define `OddsSchema` for odds history tracking (type, odds, eventTimestamp)
  - [ ] Define `PoolSchema` for win/place pool amounts and totals
  - [ ] Define `RaceDataSchema` composing Meeting, Entrants array, Pools, with raceId, name, status, startTime
- [ ] Export TypeScript types via `z.infer<>` for pipeline module consumption (AC: 2, 5)
- [ ] Extend or refactor `RaceDataSchema` from Story 2.1 into comprehensive schema set, maintaining backward compatibility
- [ ] Add Vitest unit tests in `server/tests/unit/nztab-types.test.ts` (AC: 6)
  - [ ] Test valid NZ TAB response fixtures pass validation
  - [ ] Test invalid status enum values trigger validation errors with details
  - [ ] Test missing required fields (raceId, entrantId) fail validation
  - [ ] Test malformed nested structures (invalid odds, null pools) are caught
  - [ ] Test `.passthrough()` allows extra fields without failing
- [ ] Document schema design decisions in JSDoc comments with references to database-setup.js and OpenAPI spec (AC: 1, 7)
- [ ] Verify zero `any` types via `npm run build` and `npm run lint` (AC: 5)

## Dev Notes

### Requirements Context Summary

Story 2.2 establishes the type safety foundation for the entire data pipeline by creating comprehensive Zod schemas that validate NZ TAB API responses at runtime while providing compile-time TypeScript types. This directly supports PRD NFR009 (runtime validation via Zod for all external data) and the architecture's zero-tolerance policy for `any` types [docs/PRD-raceday-postgresql-2025-10-05.md:189](../PRD-raceday-postgresql-2025-10-05.md#L189), [docs/CODING-STANDARDS.md:171](../CODING-STANDARDS.md#L171).

The schemas must align with Appwrite's legacy field mappings from database-setup.js (fixedWinOdds/fixedPlaceOdds for entrants, holdPercentage/betPercentage for money flow) to ensure the transform layer (Story 2.4) and bulk UPSERT operations (Story 2.5) receive correctly shaped data. The NZ TAB OpenAPI spec provides the authoritative API contract, with `EntrantLiability` schema confirming bet_percentage and hold_percentage fields [docs/api/nztab-openapi.json:45-57].

Using `.passthrough()` on schemas allows the API to evolve with new fields without breaking validation, while strict validation of critical fields (raceId, status enums, odds values) catches malformed responses before they corrupt the pipeline. Structured validation error logging enables rapid debugging when NZ TAB changes their API contract.

### Project Structure Notes

Story 2.1 established the NZ TAB client at `server/src/clients/nztab.ts` with a basic `RaceDataSchema` for initial validation [docs/stories/story-2.1.md:74](story-2.1.md#L74). Story 2.2 extends this by creating a comprehensive type definition module (`server/src/clients/nztab-types.ts`) that the client, transform workers (Story 2.3-2.4), and database writers (Story 2.5-2.6) will import.

Appwrite database-setup.js reveals the exact field names and types that PostgreSQL schemas must replicate:
- Entrants: `fixedWinOdds` (float), `fixedPlaceOdds` (float), `runnerNumber` (integer), `isScratched` (boolean)
- Races: `raceId` (string, 50 chars), `startTime` (datetime), `status` (string with enum constraint)
- Meetings: `meetingId` (string, 50 chars), `date` (datetime), `raceType` ('thoroughbred' | 'harness')

No unified-project-structure.md exists, so follow architecture-specification.md guidance for module placement under `server/src/clients/` [docs/architecture-specification.md:1165]. All imports must use ESM syntax with `.js` extensions per Node.js 22 standards [docs/CODING-STANDARDS.md:19](../CODING-STANDARDS.md#L19).

### References

- [docs/epic-stories-2025-10-05.md:263](../epic-stories-2025-10-05.md#L263) - Story 2.2 definition
- [docs/tech-spec-epic-2.md:89](../tech-spec-epic-2.md#L89) - RaceDataSchema specification
- [docs/PRD-raceday-postgresql-2025-10-05.md:189](../PRD-raceday-postgresql-2025-10-05.md#L189) - NFR009 Zod validation requirement
- [server-old/database-setup/src/database-setup.js:942](../../server-old/database-setup/src/database-setup.js#L942) - Appwrite entrants schema
- [docs/CODING-STANDARDS.md:216](../CODING-STANDARDS.md#L216) - Zod validation patterns

## Dev Agent Record

### Context Reference

- [story-context-2.2.xml](../story-context-2.2.xml) - Generated on 2025-10-10T13:45:00Z

### Agent Model Used

claude-sonnet-4-5-20250929 (Sonnet 4.5)

### Debug Log References

### Completion Notes List

### File List
