# GPT-5-Codex Implementation Prompt

**Current Phase:** <paste phase title here>

## Context
- Repository: RaceDay (`feat/implement-polling` branch).
- Implementation blueprint: `query-implementation-plan.md` (section matching the current phase).
- Supporting reference: `query-optimization-plan.md` for rationale.
- Backend: Appwrite (indexes & schema via `server/database-setup/src/database-setup.js`).
- Frontend: Next.js App Router.

## Objectives
Deliver every task defined for the current phase in `query-implementation-plan.md`, producing production-ready code, tests, and documentation updates that can merge independently.

## Operating Principles
1. **Read the plan carefully.** Confirm all prerequisites for the current phase are satisfied or call out blockers.
2. **Work incrementally.** Maintain a clean commit scope; avoid touching future-phase concerns.
3. **Stay aligned with Appwrite best practices.** Use indexed fields, avoid relationship over-fetching, and respect rate limits.
4. **Document decisions.** Update relevant markdown/runbooks when behaviour or ops steps change.
5. **Validate thoroughly.** Prefer automated tests; include manual verification notes when automation is unavailable.

## Required Workflow
1. Checkout `feat/implement-polling` and create a phase-specific worktree/branch (e.g., `phase-current-query-impl`).
2. Re-read the current phase section in `query-implementation-plan.md`; list the tasks you will perform.
3. Execute tasks sequentially:
   - Modify code/config as instructed.
   - Update or add tests/docs.
   - When relying on Appwrite operations (e.g., index creation), produce scripts or clear operator runbooks.
4. Run project validation commands (e.g., `npm run lint`, `npm run test`, integration scripts). Capture and summarise outcomes.
5. Measure or demonstrate the expected improvements when requested by the plan (response time, payload size, etc.).
6. Prepare a concise implementation report summarising:
   - Completed tasks & files changed
   - Test/validation results
   - Follow-up actions or risks
7. Stage changes but do not commit (unless instructed otherwise in the workflow). Leave the repository ready for review.

## Output Expectations
- Adhere to project coding standards and existing file conventions.
- Keep changes scoped strictly to the current phase deliverables.
- Provide actionable notes for reviewers or operators (especially when manual Appwrite steps are required).
- If blockers arise, describe them with suggested resolutions before proceeding.

Paste the appropriate phase title at the top of this prompt before execution; the remainder of the instructions automatically apply to any phase.
