# Epic 1: Project Scaffolding

## Story 1.1: Scaffold Next.js frontend with TypeScript

**As a** developer  
**I want** to initialize a Next.js project in the root directory using TypeScript and a `/src` folder  
**So that** the frontend codebase is clean, modern, and maintainable.

#### Tasks
- Run `npx create-next-app@latest` with TypeScript and `/src` directory options.
- Set up initial folder structure: `/src`, `/public`, `/styles`.
- Add example starter page (`src/pages/index.tsx`).
- Commit initial codebase to main branch.

#### Acceptance Criteria
- [ ] Next.js app is initialized with TypeScript.
- [ ] All code is inside `/src`.
- [ ] App runs locally with `npm run dev`.

## Story 1.2: Create .env file for Appwrite configuration

**As a** developer  
**I want** an `.env.local` file with keys for Appwrite project ID, endpoint, and any other secrets  
**So that** sensitive configuration is kept out of source control.

#### Tasks
- Create `.env.local` in the root directory.
- Add `NEXT_PUBLIC_APPWRITE_PROJECT_ID`, `NEXT_PUBLIC_APPWRITE_ENDPOINT`, etc.
- Update `.gitignore` to exclude `.env.local`.

#### Acceptance Criteria
- [ ] `.env.local` file exists and is excluded from git.
- [ ] Next.js frontend loads config from `.env.local`.

## Story 1.3: Scaffold Appwrite Cloud project and database

**As a** developer  
**I want** a reproducible script to programmatically configure Appwrite project, database, and collections, including user labels for 'user' and 'admin'  
**So that** setup is automated, repeatable, and ready for role-based routing and admin restriction in the application.

#### Tasks
- Write setup script (`scripts/appwrite-setup.ts` or `.js`) using Appwrite Node.js SDK.
- Script creates database, all required collections, and sets up relationships.
- Script creates user labels for 'user' and 'admin' roles for future role-based routing and admin screen restrictions.
- Script is runnable both manually (`node scripts/appwrite-setup.ts`) and programmatically (via CI/CD).
- Document usage in README.

#### Acceptance Criteria
- [ ] Script creates all required Appwrite resources.
- [ ] Script creates user labels 'user' and 'admin'.
- [ ] Script is idempotent (safe to run multiple times).
- [ ] Script usage documented in README.

---
