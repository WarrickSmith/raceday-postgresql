# 8. Coding Standards

## 8.1. General

- **Language:** Frontend code must be written in TypeScript. Backend Appwrite functions must be written in JavaScript.
- **Formatting:** Code will be formatted using Prettier with the configuration defined in `.prettierrc`.
- **Linting:** ESLint will be used to enforce code quality, with rules defined in `.eslintrc.json`.
- **Naming Conventions:**
  - Components: `PascalCase` (e.g., `RaceGrid.tsx`)
  - Functions/Variables: `camelCase` (e.g., `fetchRaceData`)
  - Types/Interfaces: `PascalCase` (e.g., `interface RaceDetails`)
- **Comments:** Code should be self-documenting where possible. Complex logic must be accompanied by explanatory comments.

## 8.2. Frontend (Next.js)

- **Language:** TypeScript exclusively for all frontend code
- **Component Structure:** Components should be small and focused on a single responsibility.
- **Data Fetching:** Use Server-Side Rendering (SSR) or Server Actions for initial data loads. Use SWR for client-side data fetching and re-validation.
- **State Management:** Prefer local component state. For global state, use React Context or a lightweight state management library if necessary.
- **Styling:** Use a utility-first CSS framework like Tailwind CSS. Avoid inline styles.

## 8.3. Backend (Appwrite Functions)

- **Language:** JavaScript exclusively for all Appwrite functions (no TypeScript compilation required)
- **Error Handling:** All functions must include robust error handling and logging.
- **Environment Variables:** All secrets and configuration variables must be stored as environment variables in the Appwrite console, not hardcoded.
- **Idempotency:** Where possible, functions that modify data should be idempotent.

---
