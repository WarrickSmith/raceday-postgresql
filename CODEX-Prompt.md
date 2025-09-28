# CODEX Cloud Prompt: RaceDay Polling Tasks

Use this prompt when executing any remaining task from `polling_plan_REVISED.md` on the RaceDay repository.

---

## Purpose

Deliver the selected task to production quality. Keep the scope limited to the specific task while preserving the stability of the existing polling implementation.

## Task Placeholder

Paste the **current task** from `polling_plan_REVISED.md` here:

[TASK TO IMPLEMENT]

This will be the single source of truth for what is implemented and referenced throughout this prompt.

---

## Core References

- **Primary roadmap:** `polling_plan_REVISED.md` (choose one open task at a time and paste it above).
- **Historical context:** `polling_plan.md` for legacy rationale.
- **Query foundations:** `query-implementation-plan.md` and `query-optimization-plan.md` for backend/indexing expectations.
- **Architecture notes:** `CLAUDE.md`, `README.md`, and `.env.example`.
- **UI reference:** `polling-monitor.png`.

Review the referenced documents before making changes. If the plan references external systems (e.g., Appwrite), document any required operator steps or scripts.

---

## Required Workflow

1. **Set Task Status → `Not Started`.**

   - Confirm prerequisites are met.
   - Verify dependencies with other tasks.

2. **Move Task Status → `In Progress`.**

   - **Assess impact:** List affected features, integrations, and risks.
   - **Plan the change:** Describe approach (data model, API, client hooks/components, config).
   - **Implement incrementally:**
     - Update code, types, and configs with strong typing (no `any`).
     - Remove superseded legacy logic only if instructed.
     - Keep commits logically scoped to the task.

3. **Testing Expectations.**

   - Run and record:
     - `npx tsc --noEmit`
     - `npm run lint`
     - `npm test`
   - Confirm no TypeScript errors, lint errors, or use of `any`.
   - Perform any task-specific checks (Playwright, performance benchmarks, cURL validations).
   - Document manual validation if automation is unavailable.

4. **Documentation & Ops.**

   - Update `polling_plan_REVISED.md` acceptance criteria for this task.
   - Update `.env.example`, markdown/runbooks, and inline comments as needed.

5. **Move Task Status → `Completed`.**
   - Only after:
     - All tests and checks pass cleanly.
     - Acceptance criteria updated.
     - Deliverables summarized.

---

## Reporting

Prepare a summary covering:

- Task name and key deliverables.
- Files touched and major changes.
- Test results with command outputs.
- Updated acceptance criteria.
- Follow-up actions, risks, or open questions.

---

## Guardrails

- Do not modify future tasks unless required for the current one; note dependencies if uncovered.
- Maintain consistency with Next.js App Router and Appwrite best practices.
- Ensure polling respects backend cadence and documented environment toggles:
  - `DOUBLE_POLLING_FREQUENCY`
  - `NEXT_PUBLIC_POLLING_ENABLED`
  - `NEXT_PUBLIC_POLLING_DEBUG_MODE`
  - `NEXT_PUBLIC_POLLING_TIMEOUT`
- Preserve accessibility, UX, and error handling (render `'-'` placeholders for missing data).
- When introducing caching/compression, confirm payload/headers improve without breaking clients.
- Remove deprecated real-time artifacts/tests/utilities when encountered.
