# CODEC Cloud Prompt: RaceDay Polling Tasks

Use this prompt when executing any remaining task from `polling_plan_REVISED.md` on the RaceDay repository.

---

## Purpose
Deliver the selected task to production quality. Keep the scope limited to the specific task while preserving the stability of the existing polling implementation.

## Core References
- **Primary roadmap:** `polling_plan_REVISED.md` (choose one open task at a time and quote the section while working).
- **Historical context:** `polling_plan.md` for legacy rationale.
- **Query foundations:** `query-implementation-plan.md` and `query-optimization-plan.md` for backend/indexing expectations.
- **Architecture notes:** `CLAUDE.md`, `README.md`, and `.env.example`.
- **UI reference:** `polling-monitor.png`.

Review the referenced documents before making changes. If the plan references external systems (e.g., Appwrite), document any required operator steps or scripts.

## Required Workflow
1. **Identify the task.** Copy the exact task heading and checklist from `polling_plan_REVISED.md`. Confirm no prerequisites remain unfinished.
2. **Assess impact.** List affected features, integrations, and any risky areas. Flag blockers before coding.
3. **Plan the change.** Describe the approach, including data model updates, API work, client hooks/components, and configuration changes.
4. **Implement incrementally.**
   - Update code, types, and configuration with strong typing (no `any`).
   - Remove superseded legacy logic when instructed.
   - Keep commits logically scoped to the task.
5. **Testing expectations.** Run and record:
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm test`
   - Any task-specific checks (e.g., Playwright scenarios, performance benchmarks, cURL header verifications).
   Document manual validation when automation is unavailable.
6. **Documentation & Ops.** Update markdown/runbooks, `.env.example`, and comments to reflect new behaviour, toggles, or operational steps.
7. **Report results.** Prepare a summary covering:
   - Task name and key deliverables.
   - Files touched and major changes.
   - Test results with command outputs.
   - Follow-up actions, risks, or open questions.

## Guardrails
- Do not modify future tasks unless explicitly required for the current one; note any dependencies you uncover.
- Maintain consistency with Next.js App Router patterns and Appwrite best practices (indexed queries, incremental loading, request deduplication).
- Ensure polling respects backend cadence windows and documented environment toggles (`DOUBLE_POLLING_FREQUENCY`, `NEXT_PUBLIC_POLLING_ENABLED`, `NEXT_PUBLIC_POLLING_DEBUG_MODE`, `NEXT_PUBLIC_POLLING_TIMEOUT`).
- Preserve existing accessibility, UX, and error handling standards; render '-' placeholders for missing data where specified.
- When introducing caching or compression, verify headers and payload size improvements without breaking clients.
- Remove deprecated real-time artifacts, tests, and utilities when encountered.

Use this prompt verbatim at the start of each CODEC Cloud session to execute the next task in the plan.
