# NZ TAB Credential Pre-Flight Checklist

## Purpose
- Ensure the data pipeline team enters each sprint with working NZ TAB access.
- Catch expiring or missing credential values before we start high-volume polling.
- Provide a repeatable log for compliance and stakeholder assurance.

## When to Run
1. Two business days before each pipeline sprint kickoff.
2. After any credential rotation or NZ TAB notification.

## Required Inputs
1. Access to the shared secrets vault entry `NZ TAB – RaceDay` (owner: Platform Ops).
2. Portainer (or Docker stack) environment variable editor rights for the pipeline runner.
3. Local `.env` template (`server/.env.example`) for reference values.
4. Terminal access to run validation commands from the `server` project root.

## Pre-Flight Steps
1. **Review Vault Record**
   - Confirm `From Email`, `Partner Name`, `Partner ID`, and `API Base URL` match the latest NZ TAB onboarding email.
   - Check the vault record for expiry notes or policy changes.
2. **Update Sprint Log**
   - Append a dated entry to `docs/retrospectives/epic-001-retro-2025-10-08.md` (Action Item Outcomes section) noting that the pre-flight is in progress.
3. **Validate Pipeline Environment Variables**
   - In Portainer → Stacks → `raceday-pipeline`, open the environment variable editor.
   - Confirm the following variables are present and non-empty:
     - `NZTAB_API_URL`
     - `NZTAB_FROM_EMAIL`
     - `NZTAB_PARTNER_NAME`
     - `NZTAB_PARTNER_ID`
   - If any value is missing or outdated, update it immediately and record the change in the sprint log.
4. **Sync Local Templates**
   - Verify `server/.env.example` reflects the same values (or safe defaults).
   - Run `npm run lint -- --quiet` from `server/` to confirm the file parses correctly after edits.
5. **Smoke-Test the Credentials**
   - From `server/`, run:
     ```bash
     curl -sS -D /tmp/nztab-headers.txt \
       -H "From: ${NZTAB_FROM_EMAIL}" \
       -H "X-Partner: ${NZTAB_PARTNER_NAME}" \
       -H "X-Partner-ID: ${NZTAB_PARTNER_ID}" \
       "${NZTAB_API_URL%/}/racing/meetings?date=$(date -u +%Y-%m-%d)" | head
     ```
   - Expected: HTTP 200 in `/tmp/nztab-headers.txt` and JSON payload in stdout.
   - Investigate any 4xx/5xx responses immediately and alert the Platform Ops owner.
6. **Log Completion**
   - Record the outcome (✅ / ⚠️ / ❌) with notes in the sprint kickoff agenda doc.
   - Post a summary in the #pipeline Slack channel tagging the Data Pipeline Lead.

## Escalation Path
1. Any authentication failure → escalate to Platform Ops within 2 hours.
2. Rate-limit or API errors → notify Product Owner to adjust sprint scope.
3. Repeated failures → schedule an emergency sync with NZ TAB support contact.

## Artifacts to Attach
1. `/tmp/nztab-headers.txt` (HTTP headers for the smoke test).
2. Curl command output snippet (sanitised, no sensitive data).
3. Screenshot of updated Portainer environment variables (mask sensitive values).
