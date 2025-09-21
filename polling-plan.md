# Race Page Polling Migration Plan

## Overview
- **Objective**: Replace the current hybrid "initial fetch + Appwrite realtime subscription" strategy on the race detail page with a pure HTTP polling model that starts immediately after the initial data load succeeds.
- **Scope**: All client-side race data (race core data, pools, enhanced entrants, money flow timeline, fixed win/place odds, race results) must be refreshed exclusively via scheduled fetches. No WebSocket/Appwrite realtime channels may remain.
- **Key Principle**: Mirror backend polling cadence defined in `server/master-race-scheduler/src/main.js` and `server/enhanced-race-poller/src/main.js`, but execute client polling at **2× the backend frequency** (e.g., backend 30s → client 15s, backend 2.5m → client ~75s, backend 30m → client 15m) until the race status transitions to `final`.

## Polling Cadence Reference
| Backend Interval | Trigger Window (examples) | Required Client Interval | Notes |
| --- | --- | --- | --- |
| 30 minutes | Early open status baseline windows (`calculateRequiredPollingInterval` branch returning `30`) | 15 minutes | Ensures timeline has same minimum history coverage, twice as frequent as backend. |
| 2.5 minutes | -20m to -5m race window (`calculateRequiredPollingInterval` returning `2.5`) | 75 seconds | Maintain twice-the-frequency requirement while staying under a 90s cap for UI freshness. |
| 1 minute | Any backend HTTP-triggered polls that run at 60s cadence (e.g., internal enhanced loops when backlog occurs) | 30 seconds | Applies to fallback or recovery loops. |
| 30 seconds | Ultra-critical, critical, post-start windows handled in enhanced poller internal loops | 15 seconds | Continue until race status becomes `final`; stop afterwards. |

> **Note**: The client poll scheduler must tolerate backend optimizations (locks, skipped polls) by independently enforcing the client-side minimum cadence while avoiding request storms. Use race status, start time, and last successful fetch timestamps to adjust timers.

## Tasks

### Task 1: Catalogue Existing Realtime Dependencies
- **Problem Statement**: The race page still imports `client/src/hooks/useUnifiedRaceRealtime.ts`, `SubscriptionCleanupContext`, and realtime-specific UI state (e.g., connection monitor). A precise inventory is required before removing realtime logic.
- **Current Status**: Not Started
- **Task Details**:
  - Audit `RacePageContent`, `RaceDataHeader`, `EnhancedEntrantsGrid`, `RaceFooter`, and supporting contexts to document every dependency on realtime state (connection health, cleanup signals, subscription upgrade logic).
  - Identify data fields sourced only from realtime payloads (e.g., `moneyFlowUpdateTrigger`, `lastEntrantsUpdate`).
  - Record all `/api` endpoints currently used for initial fetches to confirm they can serve as polling targets.
  - Produce an internal checklist enumerating files that must be refactored when realtime logic is removed.
- **Reference Information**:
  - `client/src/hooks/useUnifiedRaceRealtime.ts`
  - `client/src/components/race-view/RacePageContent.tsx`
  - `client/src/contexts/SubscriptionCleanupContext.tsx`
  - `client/src/components/dev/ConnectionMonitor.tsx`

### Task 2: Design Polling Scheduler and State Model
- **Problem Statement**: A reusable polling coordinator is needed to orchestrate staggered fetches for race metadata, entrants, pools, money flow, odds, and results at the correct cadence once the initial fetch succeeds.
- **Current Status**: Not Started
- **Task Details**:
  - Define a single source of truth (e.g., `useRacePollingData` hook) that accepts `raceId` and initial payload, manages timers, and exposes consolidated state similar to the current realtime hook.
  - Encode backend-aligned intervals using race status and `startTime` heuristics described in `calculateRequiredPollingInterval` (client interval = backend interval ÷ 2, with minimum 15 seconds during critical periods).
  - Ensure polling begins only after `RaceContext.loadRaceData` resolves successfully and stops when race status is `final` or `abandoned`.
  - Include exponential backoff and error handling to prevent thundering herd behavior if an API route fails.
  - Produce diagrams or pseudocode documenting timer transitions for developers.
- **Reference Information**:
  - `client/src/hooks/useUnifiedRaceRealtime.ts` (state shape expectations)
  - `client/src/contexts/RaceContext.tsx` (initial fetch lifecycle)
  - `server/master-race-scheduler/src/main.js` (`calculateRequiredPollingInterval` logic)
  - `server/enhanced-race-poller/src/main.js` (internal 30s loops for critical windows)

### Task 3: Implement Poll-Based Data Fetching Hook
- **Problem Statement**: The existing `useUnifiedRaceRealtime` hook establishes Appwrite subscriptions and cannot satisfy the polling requirement.
- **Current Status**: Not Started
- **Task Details**:
  - Replace `useUnifiedRaceRealtime` with the new polling hook from Task 2, removing all `client.subscribe` usage and connection state handling.
  - Implement batched fetches that reuse existing API routes (`/api/race/[id]`, `/api/race/[id]/money-flow-timeline`, pools/results endpoints). Consider staggering calls within each cycle to avoid simultaneous requests.
  - Maintain memoized state updates so UI consumers (`RacePageContent`, entrants grid, footer) continue to receive merged data structures.
  - Ensure hook broadcasts change signals (e.g., incrementing `moneyFlowUpdateTrigger`) to keep timeline components synchronized.
- **Reference Information**:
  - `client/src/hooks/useUnifiedRaceRealtime.ts`
  - `client/src/app/api/race/[id]/route.ts`
  - `client/src/app/api/race/[id]/money-flow-timeline/route.ts`
  - `client/src/app/api/race/[id]/pools/route.ts` (or equivalent pool data API)

### Task 4: Update Race Page Components to Consume Polling State
- **Problem Statement**: UI components currently expect realtime-specific props (connection health, cleanup signals) and must transition to polling-driven data flows.
- **Current Status**: Not Started
- **Task Details**:
  - Update `RacePageContent` to use the new polling hook and remove subscription cleanup wiring.
  - Refactor `RaceDataHeader`, `EnhancedEntrantsGrid`, `RaceFooter`, and alerts UI to rely on polling-derived timestamps and freshness indicators instead of realtime metadata.
  - Remove or replace the developer `ConnectionMonitor` with a lightweight polling diagnostics panel (optional) or eliminate it entirely.
  - Confirm money flow timeline refresh logic triggers `useMoneyFlowTimeline.refetch()` when `moneyFlowUpdateTrigger` increments.
- **Reference Information**:
  - `client/src/components/race-view/RacePageContent.tsx`
  - `client/src/components/race-view/RaceDataHeader.tsx`
  - `client/src/components/race-view/EnhancedEntrantsGrid.tsx`
  - `client/src/components/race-view/RaceFooter.tsx`
  - `client/src/components/dev/ConnectionMonitor.tsx`

### Task 5: Extend Money Flow Timeline Hook for Polling Coordination
- **Problem Statement**: `useMoneyFlowTimeline` currently performs a single fetch and relies on realtime triggers. It needs internal polling aligned with the new cadence.
- **Current Status**: Not Started
- **Task Details**:
  - Introduce interval-based refetching within `useMoneyFlowTimeline`, activated by the polling scheduler or directly using the same cadence calculations.
  - Ensure win/place pool increments, fixed odds, and tote odds update together per polling cycle to maintain timeline consistency.
  - Halt timeline polling once race status is `final` and preserve last-known values for replay.
  - Optimize network usage by deduplicating simultaneous timeline fetches across components (e.g., via shared context or SWR cache).
- **Reference Information**:
  - `client/src/hooks/useMoneyFlowTimeline.ts`
  - `client/src/components/race-view/EnhancedEntrantsGrid.tsx`
  - `server/enhanced-race-poller/src/main.js` (money flow document shape expectations)

### Task 6: Remove Legacy Realtime Infrastructure and Tech Debt
- **Problem Statement**: Subscription cleanup contexts, connection monitors, and Appwrite realtime utilities become obsolete under a full polling model.
- **Current Status**: Not Started
- **Task Details**:
  - Delete or archive `SubscriptionCleanupContext`, realtime connection monitoring utilities, and Appwrite-specific logging tied to subscriptions.
  - Update `client/src/lib/appwrite-client.ts` to remove unused realtime exports while retaining database clients for fetch-based API routes if necessary.
  - Ensure navigation flows (`RaceProvider`, router transitions) no longer trigger cleanup signals and instead manage polling lifecycle (pause/resume) via React effects.
  - Verify no other features (alerts, dashboards) still rely on removed realtime helpers; coordinate follow-up tasks if they do.
- **Reference Information**:
  - `client/src/contexts/SubscriptionCleanupContext.tsx`
  - `client/src/lib/appwrite-client.ts`
  - `client/src/utils/logging.ts`
  - `client/src/components/ClientRaceView.tsx`

### Task 7: Update Caching, Error Handling, and Testing Strategy
- **Problem Statement**: Polling introduces continuous HTTP traffic that must cooperate with client caches and automated tests.
- **Current Status**: Not Started
- **Task Details**:
  - Review caching layers (`cacheInvalidation`, React Query/SWR equivalents) to ensure stale data is invalidated when polls succeed.
  - Implement retry/backoff strategies and user-facing error states for repeated polling failures (e.g., banner after N consecutive errors).
  - Add unit/integration tests covering polling start/stop behavior, dynamic interval transitions, and final-state termination.
  - Update Playwright or Cypress scenarios to validate UI refresh cadence without realtime dependencies.
- **Reference Information**:
  - `client/src/lib/cache.ts`
  - `client/src/utils/performance.ts`
  - `client/src/__tests__/*`
  - Existing E2E test suites (if applicable)

### Task 8: Revise Architecture and Strategy Documentation
- **Problem Statement**: Documentation still describes a realtime-centric architecture and must reflect the new polling-only approach for accuracy and onboarding.
- **Current Status**: Not Started
- **Task Details**:
  - Update the following documents to describe the polling lifecycle, cadence alignment, and removal of Appwrite realtime dependencies:
    - `docs/Money-Flow-Timeline-System-Architecture.md`
    - `docs/client-real-time-data-integration.md` (rename or annotate to clarify polling model)
    - `docs/architecture/index.md`
    - `docs/architecture/3-frontend-architecture-nextjs-15.md`
    - `docs/architecture/12-client-integration.md`
    - Any other relevant files under `docs/architecture/` referencing realtime behavior.
  - Include diagrams or sequence charts showing client/server polling coordination and stop conditions at race finalization.
  - Communicate the change to stakeholders via release notes or internal changelog entry.
- **Reference Information**:
  - `docs/Money-Flow-Timeline-System-Architecture.md`
  - `docs/client-real-time-data-integration.md`
  - `docs/architecture/*.md`
  - `realtime-plan.md` and `connections-plan.md` (for historical context)

### Task 9: Deployment and Monitoring Follow-Up
- **Problem Statement**: Switching to aggressive polling can stress backend APIs and client performance if not monitored post-release.
- **Current Status**: Not Started
- **Task Details**:
  - Collaborate with backend team to confirm rate limits and ensure Appwrite functions/APIs can handle increased frequency (client polls 2× backend cadence).
  - Instrument client polling with metrics (e.g., using existing logging utility) to track request counts, error rates, and latency.
  - Define rollout plan, feature flags, or staged deployment strategy to mitigate risk.
  - Prepare rollback checklist in case polling causes unacceptable load or user experience degradation.
- **Reference Information**:
  - `client/src/utils/logging.ts`
  - `server/enhanced-race-poller/src/main.js`
  - Infrastructure monitoring dashboards (team-owned)
  - `docs/architecture/9-performance-characteristics.md`
