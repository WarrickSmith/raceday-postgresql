# Story 2.4: Money Flow Calculation Transform Logic

Status: ContextReadyDraft

## Story

As a backend developer,
I want money flow calculation logic extracted from server-old and implemented in worker threads,
so that I can transform raw NZ TAB race data into calculated money flow patterns that enable high-frequency betting analysis.

## Acceptance Criteria

1. Transform logic extracted from `./server-old` codebase and refactored to TypeScript with strict types [docs/epic-stories-2025-10-05.md:308](../epic-stories-2025-10-05.md#L308).
2. Money flow calculations implemented per-race, per-entrant, over time producing structured time-series records [docs/epic-stories-2025-10-05.md:309](../epic-stories-2025-10-05.md#L309).
3. Calculations include: `hold_percentage`, `bet_percentage`, `win_pool_percentage`, `place_pool_percentage` derived from pool amounts and entrant odds [docs/epic-stories-2025-10-05.md:310](../epic-stories-2025-10-05.md#L310), [docs/tech-spec-epic-2.md:169](../tech-spec-epic-2.md#L169).
4. Calculations include incremental amounts (change from previous poll) to track money flow deltas between polling cycles [docs/epic-stories-2025-10-05.md:311](../epic-stories-2025-10-05.md#L311), [docs/tech-spec-epic-2.md:169](../tech-spec-epic-2.md#L169).
5. Calculations include: `time_to_start`, `time_interval`, `interval_type` metadata to enable interval-based analytics queries [docs/epic-stories-2025-10-05.md:312](../epic-stories-2025-10-05.md#L312), [docs/tech-spec-epic-2.md:169](../tech-spec-epic-2.md#L169).
6. Transform accepts `RaceData` (validated via Zod from Story 2.1/2.2), returns `TransformedRace` payload containing normalized meetings, races, entrants, and time-series records [docs/epic-stories-2025-10-05.md:313](../epic-stories-2025-10-05.md#L313), [docs/tech-spec-epic-2.md:93](../tech-spec-epic-2.md#L93).
7. Transform logic validated against `server-old` outputs using regression test fixtures to ensure calculation fidelity during migration [docs/epic-stories-2025-10-05.md:314](../epic-stories-2025-10-05.md#L314), [docs/tech-spec-epic-2.md:169](../tech-spec-epic-2.md#L169).
8. Zero `any` types in transform logic; all calculations use explicit TypeScript types with Zod runtime validation [docs/epic-stories-2025-10-05.md:315](../epic-stories-2025-10-05.md#L315), [docs/CODING-STANDARDS.md:172](../CODING-STANDARDS.md#L172).
9. Transform worker implementation updated in `server/src/workers/transformWorker.ts` to replace placeholder logic with production calculations [docs/stories/story-2.3.md:83](story-2.3.md#L83).
10. Pure functions implemented for all calculations (no side effects, no external state mutation) following functional programming principles [docs/CODING-STANDARDS.md:108](../CODING-STANDARDS.md#L108).
11. Money flow calculations execute within worker thread target duration budget (<1s transform time per race contributing to <2s total processing target) [docs/tech-spec-epic-2.md:117](../tech-spec-epic-2.md#L117), [docs/solution-architecture.md:616](../solution-architecture.md#L616).

## Tasks / Subtasks

- [ ] Locate and extract money flow calculation logic from `server-old` (AC: 1)
  - [ ] Search `server-old` codebase for money flow calculation functions
  - [ ] Identify calculation formulas for hold_percentage, bet_percentage, pool percentages
  - [ ] Document legacy calculation logic and data dependencies
  - [ ] Extract test fixtures or sample data from `server-old` for validation
- [ ] Create money flow calculation utilities module (AC: 3, 4, 5, 10)
  - [ ] Create `server/src/workers/money-flow.ts` with pure calculation functions
  - [ ] Implement `calculateHoldPercentage(entrant, pool): number`
  - [ ] Implement `calculateBetPercentage(entrant, pool): number`
  - [ ] Implement `calculatePoolPercentages(entrant, winPool, placePool): {win_pool_percentage, place_pool_percentage}`
  - [ ] Implement `calculateIncrementalDelta(current, previous): number` for money flow changes
  - [ ] Implement `calculateTimeMetadata(raceStartTime, currentTime): {time_to_start, time_interval, interval_type}`
  - [ ] All functions must be pure (no side effects, deterministic)
  - [ ] Add TypeScript strict types for all parameters and return values
- [ ] Define transform output types (AC: 6, 8)
  - [ ] Create or enhance `TransformedRace` interface in `server/src/workers/messages.ts`
  - [ ] Define `TransformedEntrant` interface with all calculated fields
  - [ ] Define `MoneyFlowRecord` interface for time-series inserts
  - [ ] Define Zod schemas for runtime validation of transform outputs
  - [ ] Ensure zero `any` types in all type definitions
- [ ] Implement transform worker logic (AC: 2, 6, 9, 11)
  - [ ] Update `server/src/workers/transformWorker.ts` message handler
  - [ ] Import money flow calculation utilities
  - [ ] Implement per-race transform: extract meetings, races from RaceData
  - [ ] Implement per-entrant transform: apply money flow calculations to each entrant
  - [ ] Build time-series records for money_flow_history inserts
  - [ ] Construct TransformedRace payload with all normalized data
  - [ ] Add error handling for malformed data or calculation failures
  - [ ] Ensure transform completes within performance budget (<1s target)
- [ ] Create regression test fixtures (AC: 7)
  - [ ] Export sample RaceData from `server-old` (or capture from NZ TAB API)
  - [ ] Export corresponding money flow calculation outputs from `server-old`
  - [ ] Store fixtures in `server/tests/fixtures/money-flow-legacy/`
  - [ ] Document fixture sources and expected values
- [ ] Write unit tests for money flow calculations (AC: 3, 4, 5, 7, 10)
  - [ ] Test `calculateHoldPercentage` with various pool scenarios
  - [ ] Test `calculateBetPercentage` with edge cases (zero pools, scratched entrants)
  - [ ] Test `calculatePoolPercentages` for win and place pool distributions
  - [ ] Test `calculateIncrementalDelta` with increasing/decreasing pools
  - [ ] Test `calculateTimeMetadata` for various time-to-start intervals
  - [ ] Validate all calculations against legacy fixtures (regression tests)
  - [ ] Ensure all tests pass with 100% coverage on calculation logic
- [ ] Write integration tests for transform worker (AC: 6, 9, 11)
  - [ ] Test worker receives RaceData message and returns TransformedRace
  - [ ] Test transform produces correct structure (meetings, races, entrants, time-series)
  - [ ] Test transform performance (measure duration, assert <1s)
  - [ ] Test error handling for invalid RaceData payloads
  - [ ] Test worker integration with WorkerPool exec() method
  - [ ] Validate Zod schemas successfully parse transform outputs

## Dev Notes

### Requirements Context Summary

Story 2.4 delivers the CPU-intensive money flow transformation logic that converts raw NZ TAB API payloads into calculated analytics (hold percentages, bet percentages, pool distributions, incremental deltas, and time-based intervals). This capability directly fulfills PRD FR004 ("Transform raw race data into money flow analytics") and enables the 2× performance improvement target by offloading these calculations to dedicated worker threads established in Story 2.3.

The transform must reproduce server-old's proven calculation formulas to maintain continuity during migration, validated through regression tests against legacy fixtures per tech-spec AC6 [docs/tech-spec-epic-2.md:169](../tech-spec-epic-2.md#L169). All calculations execute per-race, per-entrant, over time, producing structured money_flow_history records that feed downstream API queries and client betting decisions [docs/PRD-raceday-postgresql-2025-10-05.md](../PRD-raceday-postgresql-2025-10-05.md).

Story 2.3 delivered the WorkerPool infrastructure with placeholder transform hooks; Story 2.4 populates those hooks with production-ready calculation logic extracted from `./server-old`. The worker receives validated `RaceData` from Story 2.1's NZ TAB client [docs/stories/story-2.1.md](story-2.1.md), applies money flow formulas, and returns `TransformedRace` payloads ready for Story 2.5's bulk UPSERT operations.

The transform must execute within <1s per race to meet the overall <2s single-race processing target defined in tech-spec NFR and solution architecture performance baselines [docs/tech-spec-epic-2.md:117](../tech-spec-epic-2.md#L117), [docs/solution-architecture.md:616](../solution-architecture.md#L616).

### Project Structure Notes

Story 2.4 extends the existing `server/src/workers/` module established in Story 2.3 [docs/stories/story-2.3.md:76](story-2.3.md#L76):

**Files to Create/Modify:**
- `server/src/workers/money-flow.ts` - Pure calculation functions (new file)
- `server/src/workers/transformWorker.ts` - Enhanced with production transform logic (modify existing)
- `server/src/workers/messages.ts` - Extended with TransformedRace types (modify existing)
- `server/tests/fixtures/money-flow-legacy/` - Regression test fixtures (new directory)
- `server/tests/unit/workers/money-flow.test.ts` - Unit tests for calculations (new file)
- `server/tests/integration/workers/transform-worker.integration.test.ts` - Integration tests (new file)

**Type Dependencies:**
- Import `RaceData` from `server/src/clients/nztab-types.ts` (Story 2.2) [docs/stories/story-2.2.md:93](story-2.2.md#L93)
- Import worker message schemas from `server/src/workers/messages.ts` (Story 2.3)

**Coding Standards Alignment:**
- ES modules (ESM) exclusively per [docs/CODING-STANDARDS.md:19](../CODING-STANDARDS.md#L19)
- Functional programming: pure functions, no side effects [docs/CODING-STANDARDS.md:108](../CODING-STANDARDS.md#L108)
- Zero `any` types enforced by TypeScript strict mode [docs/CODING-STANDARDS.md:172](../CODING-STANDARDS.md#L172)
- File naming: kebab-case (`money-flow.ts`) [docs/CODING-STANDARDS.md:284](../CODING-STANDARDS.md#L284)

**Legacy Code Extraction:**
The money flow calculation logic resides in `./server-old` and must be:
1. Located and documented (identify calculation formulas)
2. Refactored to TypeScript with strict types
3. Adapted to Zod-validated NZ TAB payloads
4. Validated against legacy fixtures for calculation fidelity

### References

- [docs/epic-stories-2025-10-05.md:300](../epic-stories-2025-10-05.md#L300) - Story 2.4 definition
- [docs/tech-spec-epic-2.md:43](../tech-spec-epic-2.md#L43) - Worker Pool module specification
- [docs/tech-spec-epic-2.md:93](../tech-spec-epic-2.md#L93) - workerPool.exec API contract
- [docs/tech-spec-epic-2.md:169](../tech-spec-epic-2.md#L169) - Money flow calculation requirements (AC6)
- [docs/tech-spec-epic-2.md:117](../tech-spec-epic-2.md#L117) - Performance target (<1s transform)
- [docs/solution-architecture.md:616](../solution-architecture.md#L616) - Performance targets table
- [docs/PRD-raceday-postgresql-2025-10-05.md](../PRD-raceday-postgresql-2025-10-05.md) - FR004 money flow analytics
- [docs/stories/story-2.1.md](story-2.1.md) - NZ TAB API client (RaceData source)
- [docs/stories/story-2.2.md](story-2.2.md) - Type definitions (RaceData, Zod schemas)
- [docs/stories/story-2.3.md](story-2.3.md) - Worker pool infrastructure
- [docs/CODING-STANDARDS.md](../CODING-STANDARDS.md) - ES modules, functional programming, TypeScript strict mode

## Dev Agent Record

### Context Reference

- [story-context-2.4.xml](story-context-2.4.xml) - Generated 2025-10-11

### Agent Model Used

claude-sonnet-4-5-20250929 (Sonnet 4.5)

### Debug Log References

### Completion Notes List

### File List

## Change Log

**2025-10-11** - Story 2.4 created by Bob (Scrum Master agent)

- Initial story draft generated from Epic 2 requirements
- Acceptance criteria extracted from epics file (lines 300-318) and tech spec (AC6, line 169)
- Tasks structured for legacy code extraction, calculation utilities, transform implementation, and comprehensive testing
- Dev notes aligned with Story 2.3 worker infrastructure and Story 2.2 type definitions
- Project structure notes document files to create/modify and coding standards alignment
- References compiled from tech spec, solution architecture, PRD, and previous stories
