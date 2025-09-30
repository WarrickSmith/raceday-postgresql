# Phase 2 – Index Provisioning

Goal: Provide Appwrite indexes that align with the scalar-key query patterns introduced in Phase 1.

Prerequisite: Phase 1 completed and verified (scalar keys raceId and entrantId populated on relevant documents; ingestion enforces them).

## Indexes Added
- entrants: `idx_race_active` on [`raceId`, `isScratched`]
- money-flow-history: `idx_race_entrant_time` on [`raceId`, `entrantId`, `timeInterval`]

These compound indexes enable fast race-scoped filtering, active entrant lists, and efficient timeline bucket lookups without relationship scans.

## Deployment Sequence (Safe Rollout)
- Confirm Phase 1 is complete: scalar-key-maintenance logs show 0 missing keys for 3 consecutive runs.
- Verify attributes exist and are available in Appwrite for both collections:
  - entrants: `raceId` (string), `isScratched` (boolean)
  - money-flow-history: `raceId` (string), `entrantId` (string), `timeInterval` (integer)
- Schedule a low-traffic window (indexes build in background and can add write overhead while building).
- Run the database setup function to provision indexes:
  - From project root: `npm --prefix server run database-setup`
  - Required env (in `server/.env`): `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`
- Monitor function logs for index creation steps and any retries.

## Verification
- Console: Appwrite Database → `entrants` and `money-flow-history` → Indexes contain the above keys and show status available.
- Scripted (optional):
  - From `server/database-setup`: `node src/verify-indexes.js`
  - Output lists presence for expected indexes. Example keys: `idx_race_active`, `idx_race_entrant_time`.

## Rollback/Recovery
- Index creation is idempotent; reruns skip existing indexes.
- If creation fails transiently, rerun the setup after confirming attributes report status available.
- If unexpected query regressions occur, indexes can be dropped via Appwrite console and recreated during the next window.

## Notes & Risks
- Create during low traffic to minimize write contention while indexes build.
- Ensure queries for Phase 3 utilize these fields/orderings to benefit from compound indexes.
- Keep monitoring enabled during rollout and capture durations before/after where feasible.

## Change Summary
- Code: `server/database-setup/src/database-setup.js` adds the two compound indexes with safety checks.
- Utility: `server/database-setup/src/verify-indexes.js` to report index presence.
- This document: Operator runbook for safe provisioning and validation.

