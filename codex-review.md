# RaceDay Appwrite Realtime Review

## Highlights
- Unified race hook waits for initial data before opening a realtime socket, then upgrades channels as documents become known, aligning with Appwrite's hybrid "fetch then subscribe" guidance (`client/src/hooks/useUnifiedRaceRealtime.ts:225`, `client/src/hooks/useUnifiedRaceRealtime.ts:937`).
- Navigation triggers an explicit cleanup signal so the hook tears down the current subscription and clears throttled work, reducing the chance of orphaned channels when changing races (`client/src/hooks/useUnifiedRaceRealtime.ts:385`, `client/src/hooks/useUnifiedRaceRealtime.ts:401`).
- Navigation UI calls the cleanup trigger before pushing a new route, so client-side transitions and back/forward actions reuse the same channel only when needed (`components/race-view/RaceNavigation.tsx:44`).

## Findings & Recommendations

### 1. Channel Scope For Race Resources
- The race page still listens to collection-wide pool and money-flow channels (`client/src/hooks/useUnifiedRaceRealtime.ts:189`). Even though the reducer filters events by `raceId`, Appwrite will still push every pool and money-flow message for the whole meeting day through the socket. Persist the fetched pool document id (already available via `$id`) and substitute a document-specific channel once known (e.g. `databases.raceday-db.collections.race-pools.documents.<docId>`). Consider moving money-flow updates behind a race-scoped view or API aggregation so the realtime layer only receives one "live timeline" document per race.
- Entrant subscriptions fall back to the entire entrants collection until the initial fetch completes. After entrants load the hook re-subscribes with per-document channels, but you can short-circuit the fallback by grabbing the entrant ids from `initialEntrants` and seeding channel construction before the first subscribe call.

### 2. Meetings Page Subscriptions Are Broad
- `useRealtimeMeetings` subscribes to the entire meetings and races collections (`client/src/hooks/useRealtimeMeetings.tsx:99`). For busy race days this pushes every event (including irrelevant venues) across the connection, and the handler re-fetches first-race times on each hit. Maintain a map of active meeting ids and race ids and subscribe only to those document channels; when the visible meeting list changes, diff the set and add/remove channels without opening a second websocket.
- `NextScheduledRaceButton` mounts its own collection-wide race subscription (`client/src/components/dashboard/NextScheduledRaceButton.tsx:84`). Because the meetings hook already receives every race update, expose a callback or shared observable so the button can piggy-back on the existing stream instead of duplicating channel listeners and fetches.

### 3. Cleanup & Orphaned Connection Handling
- Race navigation correctly dispatches `triggerSubscriptionCleanup`, and the hook drains outstanding timers before disconnecting (`components/race-view/RaceNavigation.tsx:44`, `client/src/hooks/useUnifiedRaceRealtime.ts:409`). Retain the short drain delay so Appwrite can unregister channels before a new subscription starts; if navigation stays on the same race id consider checking for redundant cleanup calls to avoid unnecessary disconnect/reconnect cycles.
- Meetings view subscriptions only tear down on component unmount (`client/src/hooks/useRealtimeMeetings.tsx:188`). If the dashboard gains tabbed layouts or client-side routing, add a similar cleanup signal so the meetings socket can pause when the page is hidden.

### 4. Configuration For Self-Hosted Appwrite
- The browser client pulls `NEXT_PUBLIC_APPWRITE_*` keys (`client/src/lib/appwrite-client.ts:6`), while the public README instructs operators to set `APPWRITE_ENDPOINT` / `APPWRITE_PROJECT_ID` without the `NEXT_PUBLIC_` prefix (`README.md:29`). Update the documentation or support both names to avoid silent fallbacks to the placeholder endpoint.
- For self-hosted deployments with self-signed TLS certificates, expose an opt-in `NEXT_PUBLIC_APPWRITE_SELF_SIGNED=true` (and equivalent server-side flag) that calls `.setSelfSigned(true)` on both the web and server clients. Otherwise realtime websocket negotiation will fail when the certificate chain is not trusted (`client/src/lib/appwrite-client.ts:13`, `client/src/lib/appwrite-server.ts:12`).
- Document websocket expectations in `.env.example`—Appwrite recommends the same origin for HTTPS and WSS. Clarify that the endpoint must be externally reachable and not blocked by proxies, and highlight any tuning (e.g. `APPWRITE_REALTIME_MAX_CONNECTIONS`) your self-hosted instance requires.

### 5. Unified Subscription Reuse
- The race page hook already multiplexes multiple child channels onto one subscription call (`client/src/hooks/useUnifiedRaceRealtime.ts:977`). Consider promoting that hook (or a lighter variant) for other real-time features so the entire UI shares the same channel registry instead of each component managing its own arrays. That will make it easier to enforce the "single subscription with child channels" best practice project-wide.

## Suggested Next Steps
1. Capture pool and money-flow document ids during initial data fetch and narrow the realtime channels accordingly.
2. Refactor meetings realtime logic to maintain a per-meeting channel set and remove the redundant subscription from `NextScheduledRaceButton`.
3. Align environment variable names between code and documentation, and add a self-hosted TLS toggle + guidance for websocket connectivity.
