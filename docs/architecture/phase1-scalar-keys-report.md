# Phase 1 – Data Hygiene & Scalar Keys

## Completed Tasks
- Added `entrantId` scalar attribute to the `money-flow-history` schema and bumped schema version to `4.1.0`.
- Introduced the `scalar-key-maintenance` Appwrite Function to backfill missing `raceId`/`entrantId` values and log unresolved documents.
- Hardened daily importers and the enhanced race poller to refuse writes when scalar identifiers are absent and to stamp the new attribute on every money-flow document.
- Documented the new operational workflow and enforcement expectations in the database architecture guide.

## Validation
- `npm install` + `npm test` inside `server/scalar-key-maintenance` (Node test suite for helper logic).

## Follow-up / Risks
- Disable the scheduled `scalar-key-maintenance` function once three consecutive runs report zero unresolved documents to avoid unnecessary reads.
- Phase 2 relies on the new scalar attributes being fully populated before index creation; monitor function logs until no warnings remain.
