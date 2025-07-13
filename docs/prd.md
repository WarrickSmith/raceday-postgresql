# Product Requirements Document: RaceDay v1.5 (MVP)

- **Product:** RaceDay
- **Version:** 1.5 (MVP)
- **Author:** BMad PM Agent
- **Date:** 2025-07-11 09:06:08
- **Status:** Final

## 1. Introduction & Vision

### 1.1. Vision

To provide horse racing enthusiasts with a powerful, real-time data visualization tool that uncovers market insights by tracking odds and money flow dynamics, enabling them to spot significant trends faster and more effectively than any other tool on the market.

### 1.2. Problem Statement

Monitoring horse racing market data is a fragmented and manual process. Bettors and enthusiasts lack a unified, real-time view of how odds and pool money are fluctuating across multiple races and jurisdictions. They cannot easily detect sudden, significant shifts that might indicate market opportunities or insider knowledge, forcing them to rely on less timely data or cumbersome manual checks.

### 1.3. Target Audience & Personas

- **Primary Persona:** The Data-Driven Enthusiast ("Alex")
  - **Description:** Alex is a semi-professional bettor or a serious racing enthusiast who believes that market data holds the key to smarter decisions. They are tech-savvy, analytical, and comfortable interpreting charts and data grids.
  - **Goals:** To identify horses with significant, unusual betting patterns (e.g., a last-minute surge in money, a dramatic odds drop). To monitor multiple races simultaneously without missing a beat, and to focus only on the races that matter to them.
  - **Frustrations:** Existing platforms are slow, require manual refreshing, and don't offer configurable alerts on the specific metrics Alex cares about. It's hard to filter out the noise from races in countries or of types they don't follow.

## 2. Product Goals & Success Metrics (MVP)

- **Goal 1:** Deliver a stable, real-time view of race data for all available events.
  - **Metric:** System uptime > 99.9%.
  - **Metric:** Data latency from the TAB API to the user's screen is less than 2 seconds.
- **Goal 2:** Empower users to identify significant market movements through visualization and alerts.
  - **Metric:** 80% of active users will have configured at least one custom alert within their first month.
  - **Metric:** User feedback indicates the tool provides actionable insights.
- **Goal 3:** Provide robust filtering to allow users to focus on relevant races.
  - **Metric:** Over 50% of user sessions utilize the filtering functionality, indicating its value.
- **Goal 4:** Establish a scalable and reliable technical foundation for future feature growth.
  - **Metric:** The architecture (as defined by the Architect) is successfully implemented with no critical deviations.

## 3. Developer's Note

All development work must reference the latest official documentation for our key frameworks to ensure best practices and security.

- Next.js: [https://nextjs.org/docs](https://nextjs.org/docs)
- Appwrite: [https://appwrite.io/docs](https://appwrite.io/docs)
- Appwrite Web SDK (Frontend): [https://appwrite.io/docs/references/cloud/client-web](https://appwrite.io/docs/references/cloud/client-web)
- Appwrite Node.js SDK (Backend): [https://appwrite.io/docs/references/cloud/server-nodejs](https://appwrite.io/docs/references/cloud/server-nodejs)

---

## Epic 1: Project Scaffolding

### Story 1.1: Scaffold Next.js frontend with TypeScript

**As a** developer  
**I want** to initialize a Next.js project in the root directory using TypeScript and a `/src` folder  
**So that** the frontend codebase is clean, modern, and maintainable.

##### Tasks

- Run `npx create-next-app@latest` with TypeScript and `/src` directory options.
- Set up initial folder structure: `/src`, `/public`, `/styles`.
- Add example starter page (`src/pages/index.tsx`).
- Commit initial codebase to main branch.

##### Acceptance Criteria

- [ ] Next.js app is initialized with TypeScript.
- [ ] All code is inside `/src`.
- [ ] App runs locally with `npm run dev`.

### Story 1.2: Create .env file for Appwrite configuration

**As a** developer  
**I want** an `.env.local` file with keys for Appwrite project ID, endpoint, and any other secrets  
**So that** sensitive configuration is kept out of source control.

##### Tasks

- Create `.env.local` in the root directory.
- Add `NEXT_PUBLIC_APPWRITE_PROJECT_ID`, `NEXT_PUBLIC_APPWRITE_ENDPOINT`, etc.
- Update `.gitignore` to exclude `.env.local`.

##### Acceptance Criteria

- [ ] `.env.local` file exists and is excluded from git.
- [ ] Next.js frontend loads config from `.env.local`.

### Story 1.3: Scaffold Appwrite Cloud project and database

**As a** developer  
**I want** a reproducible script to programmatically configure Appwrite project, database, and collections, including user labels for 'user' and 'admin'  
**So that** setup is automated, repeatable, and ready for role-based routing and admin restriction in the application.

##### Tasks

- Write setup script (`scripts/appwrite-setup.ts` or `.js`) using Appwrite Node.js SDK.
- Script creates database, all required collections, and sets up relationships.
- Script creates user labels for 'user' and 'admin' roles for future role-based routing and admin screen restrictions.
- Script is runnable both manually (`node scripts/appwrite-setup.ts`) and programmatically (via CI/CD).
- Document usage in README.

##### Acceptance Criteria

- [ ] Script creates all required Appwrite resources.
- [ ] Script creates user labels 'user' and 'admin'.
- [ ] Script is idempotent (safe to run multiple times).
- [ ] Script usage documented in README.

---

## Epic 2: Real-Time Race Dashboard

### Story 2.1: Display race meetings chronologically

**As a** user  
**I want** to see a list of all race meetings for the current day, ordered chronologically by the first race of the meeting  
**So that** I can easily scan upcoming races.

##### Tasks

- Query the backend for today's meetings and races.
- Sort meetings by the earliest race start time.
- Render the meeting list in the dashboard view.

##### Acceptance Criteria

- [ ] Meetings are displayed in chronological order.
- [ ] The list updates in real-time as new meetings are added or removed.
- [ ] No duplicate meetings are shown.

### Story 2.2: Expand meetings to show races

**As a** user  
**I want** to expand a meeting to see all races within it, showing the race number, race name, and start time  
**So that** I can view race details at a glance.

##### Tasks

- Implement expand/collapse UI for each meeting.
- Fetch and display race details per meeting.
- Ensure races are shown in order.

##### Acceptance Criteria

- [ ] Races are correctly grouped under their meetings.
- [ ] Race details are shown when a meeting is expanded.
- [ ] UI supports expand/collapse interaction.

### Story 2.3: Display real-time race status

**As a** user  
**I want** to see the status of each race (Open, Closed, Running, Finalized) update in real-time on the dashboard  
**So that** I know which races are active.

##### Tasks

- Subscribe to race status updates from backend.
- Display current status for each race.
- Visually differentiate race status.

##### Acceptance Criteria

- [ ] Status updates occur in real-time (<2s latency).
- [ ] Status is visually clear and accessible.
- [ ] Status matches backend values.

### Story 2.4: Navigate to Detailed Race View

**As a** user  
**I want** to be able to click on a race to navigate to its Detailed Race View  
**So that** I can see deeper race details.

##### Tasks

- Implement clickable race rows.
- Route user to the detailed race view page.
- Pass race ID as parameter.

##### Acceptance Criteria

- [ ] Clicking a race opens the correct detailed view.
- [ ] URL updates to reflect selected race.
- [ ] No navigation errors.

---

## Epic 3: Detailed Race View

### Story 3.1: Display detailed race header

**As a** user  
**I want** to see a header for the selected race with its name, distance, track condition, and time to start  
**So that** I understand key race details instantly.

##### Tasks

- Design and implement race header component.
- Fetch race metadata from backend.
- Display all required fields.

##### Acceptance Criteria

- [ ] Race header shows correct name, distance, track, and time.
- [ ] Header updates in real-time as race data changes.
- [ ] Layout is consistent with UI spec.

### Story 3.2: Create entrants data grid

**As a** user  
**I want** to see a grid of all entrants in the race, with columns for Runner Name, Saddlecloth #, Jockey, Trainer, current Win Odds, and current Place Odds  
**So that** I can compare runners easily.

##### Tasks

- Design data grid per UI spec.
- Fetch and display entrant data.
- Support sorting/filtering (if required).

##### Acceptance Criteria

- [ ] All entrants are displayed with required columns.
- [ ] Data grid updates in real-time.
- [ ] No missing or duplicate entrants.

### Story 3.3: Display Money Flow column

**As a** user  
**I want** to see a dedicated column displaying the current "Money Flow" (hold_percentage) for each entrant  
**So that** I can track market interest.

##### Tasks

- Add Money Flow column to entrants grid.
- Fetch and display hold_percentage for each entrant.
- Format values per design.

##### Acceptance Criteria

- [ ] Money Flow column is present for every entrant.
- [ ] Values match backend data.
- [ ] Column is visually distinct.

### Story 3.4: Display odds history sparkline

**As a** user  
**I want** to see a sparkline visualization in each row that charts the recent history of the Win odds  
**So that** I can spot trends quickly.

##### Tasks

- Integrate sparkline chart library.
- Fetch odds history for each entrant.
- Render sparkline in grid row.

##### Acceptance Criteria

- [ ] Sparkline chart appears for every entrant.
- [ ] Data matches odds history.
- [ ] Charts update in real-time.

### Story 3.5: Implement automatic data updates

**As a** user  
**I want** to see all data in the grid update automatically without a page refresh  
**So that** I always see the latest info.

##### Tasks

- Subscribe to Appwrite Realtime for data changes.
- Update grid in response to backend events.
- Test for real-time update speed.

##### Acceptance Criteria

- [ ] No manual refresh needed for updates.
- [ ] Data latency is below 2 seconds.
- [ ] No stale data displayed.

### Story 3.6: Implement race navigation buttons

**As a** user  
**I want** navigation buttons to move to Previous Race, Next Race, and Next Scheduled Race  
**So that** I can quickly scan races.

##### Tasks

- Design and implement navigation buttons.
- Handle edge cases (first/last race).
- Ensure buttons update view and URL.

##### Acceptance Criteria

- [ ] Navigation buttons work for all races.
- [ ] Correct race view is displayed after navigation.
- [ ] Buttons are accessible.

---

## Epic 4: Alerting System

### Story 4.1: Create Alerts Configuration UI

**As a** user  
**I want** to access an "Alerts Configuration" modal or screen from the Detailed Race View  
**So that** I can customize my alerts.

##### Tasks

- Design Alerts Configuration modal.
- Link modal from Detailed Race View.
- Save user alert preferences.

##### Acceptance Criteria

- [ ] Modal opens from race view.
- [ ] User can configure and save alerts.
- [ ] Saved alerts persist for user.

### Story 4.2: Configure odds change alert

**As a** user  
**I want** to set a percentage increase/decrease threshold for Win odds over a specific time window  
**So that** I get notified about market moves.

##### Tasks

- Add UI controls for odds threshold and time window.
- Store alert config in backend.
- Evaluate odds changes in backend.

##### Acceptance Criteria

- [ ] User can set odds change alert.
- [ ] Alert triggers when condition is met.
- [ ] Notification is delivered to user.

### Story 4.3: Configure money flow alert

**As a** user  
**I want** to set a percentage increase threshold for Money Flow (hold_percentage)  
**So that** I get notified about large bets.

##### Tasks

- Add UI controls for money flow alert.
- Store config in backend.
- Evaluate money flow changes.

##### Acceptance Criteria

- [ ] User can set money flow alert.
- [ ] Alert triggers when condition is met.
- [ ] Notification is delivered to user.

### Story 4.4: Implement visual row flash alert

**As a** user  
**I want** the corresponding row in the race grid to flash visually for 5 seconds when an alert triggers  
**So that** I notice important changes.

##### Tasks

- Implement visual flash feedback in grid.
- Trigger flash when alert is received.

##### Acceptance Criteria

- [ ] Row flashes when alert triggers.
- [ ] Flash lasts 5 seconds.
- [ ] No false positives.

### Story 4.5: Implement toast notifications for alerts

**As a** user  
**I want** a toast notification to appear on my screen with a summary when an alert triggers  
**So that** I am immediately informed.

##### Tasks

- Design toast notification component.
- Display toast on alert trigger.
- Include summary details in notification.

##### Acceptance Criteria

- [ ] Toast appears for each alert.
- [ ] Summary is accurate and complete.
- [ ] Toast is dismissible.

### Story 4.6: Implement global audible alert toggle

**As a** user  
**I want** to enable/disable a global, audible alert that triggers one minute before the start of any race in my filtered view  
**So that** I am aware of upcoming races.

##### Tasks

- Add audible alert toggle to UI.
- Implement audio notification logic.
- Respect user filter settings.

##### Acceptance Criteria

- [ ] Audible alert triggers as expected.
- [ ] User can toggle alert on/off.
- [ ] Alert only applies to filtered races.

---

## Epic 5: Backend Data Polling & Persistence

### Story 5.1: Create daily race import function

**As the** system  
**I need** a serverless function that runs daily to fetch all meetings and races from the TAB API for the current day  
**So that** race data is always up to date.

##### Tasks

- Configure Appwrite Function with CRON schedule.
- Fetch meetings and races from TAB API.
- Store/update documents in database.

##### Acceptance Criteria

- [ ] Function runs at midnight UTC.
- [ ] All meetings and races for the day are imported.
- [ ] Errors are logged and surfaced.

### Story 5.2: Implement dynamic polling function

**As the** system  
**I need** to trigger a dynamic polling process for each race based on its start time  
**So that** live data is accurate.

##### Tasks

- Schedule polling intervals per race.
- Fetch latest race/entrant data from API.
- Store updates in database.

##### Acceptance Criteria

- [ ] Polling adapts to race schedule.
- [ ] Entrant data is current.
- [ ] No missed updates.

### Story 5.3: Implement data persistence logic

**As the** system  
**I need** to parse EventRaceDetails and store relevant data into Meetings, Races, Entrants, OddsHistory, and MoneyFlowHistory collections  
**So that** the frontend can display complete data.

##### Tasks

- Parse EventRaceDetails from API.
- Map data to database schema.
- Store/append data correctly.

##### Acceptance Criteria

- [ ] All collections are updated as needed.
- [ ] Data matches API source.
- [ ] No data loss or corruption.

### Story 5.4: Implement secure API credential handling

**As the** system  
**I need** to securely use affiliate credentials stored as environment variables within Appwrite Function  
**So that** API credentials are not exposed.

##### Tasks

- Store API credentials in environment variables.
- Access credentials in function code.
- Prevent credential leaks/logging.

##### Acceptance Criteria

- [ ] Credentials are never exposed in logs.
- [ ] API calls use correct credentials.
- [ ] Security is validated.

---

## Epic 6: User Authentication

### Story 6.1: Implement user signup

**As a** new user  
**I want** to sign up for an account using an email and password  
**So that** my settings are saved.

##### Tasks

- Add signup UI to frontend.
- Use Appwrite Account API for registration.
- Validate user input.

##### Acceptance Criteria

- [ ] User can sign up successfully.
- [ ] Invalid input is handled gracefully.
- [ ] Account is created in backend.

### Story 6.2: Implement user login

**As a** returning user  
**I want** to log in to my account  
**So that** I can access my alerts and preferences.

##### Tasks

- Add login UI to frontend.
- Use Appwrite Account API for authentication.
- Handle login errors.

##### Acceptance Criteria

- [ ] User can log in successfully.
- [ ] Sessions persist across reloads.
- [ ] Login errors are shown to user.

### Story 6.3: Persist user alert configurations

**As a** user  
**I want** my configured alerts to be associated with my account and persist across sessions  
**So that** I don't have to reconfigure each visit.

##### Tasks

- Store alert config in UserAlertConfigs collection.
- Link config to user account.
- Retrieve alerts on login.

##### Acceptance Criteria

- [ ] Alerts persist for logged-in user.
- [ ] Configurations load automatically on login.
- [ ] No data loss.

---

## Epic 7: Race Filtering

### Story 7.1: Create filter controls UI

**As a** user  
**I want** to see a set of filter controls on the main dashboard  
**So that** I can focus on relevant races.

##### Tasks

- Design multi-select dropdowns for filters.
- Implement filter logic on frontend.
- Persist filter state in session.

##### Acceptance Criteria

- [ ] Filters are visible and usable.
- [ ] Filter selections update dashboard view.
- [ ] Filters persist during session.

### Story 7.2: Implement filtering by Country

**As a** user  
**I want** to filter displayed meetings and races by one or more Countries  
**So that** I see only preferred locations.

##### Tasks

- Add Country filter control.
- Update dashboard data per filter.
- Test multi-country selection.

##### Acceptance Criteria

- [ ] Only selected countries are shown.
- [ ] Filter updates in real-time.
- [ ] No data bleed from other countries.

### Story 7.3: Implement filtering by Race Type

**As a** user  
**I want** to filter displayed meetings and races by Race Type (e.g., Gallops, Trots)  
**So that** I see only the races I care about.

##### Tasks

- Add Race Type filter control.
- Update dashboard data per filter.
- Support multiple race types.

##### Acceptance Criteria

- [ ] Only selected race types are shown.
- [ ] Filter updates in real-time.
- [ ] No data bleed from other types.

### Story 7.4: Apply filters to navigation

**As a** user  
**I want** my filter selections to apply to all dashboard views and navigational actions (e.g., Next Scheduled Race jumps to next filtered race)  
**So that** navigation respects my preferences.

##### Tasks

- Update navigation logic to respect filters.
- Test navigation with multiple filters.
- Handle edge cases.

##### Acceptance Criteria

- [ ] Navigation only moves to filtered races.
- [ ] No skipped or duplicate races.
- [ ] Filters persist in navigation.

### Story 7.5: Persist filters during session

**As a** user  
**I want** my filter selections to be remembered within my session  
**So that** my view is consistent.

##### Tasks

- Store filter state in session/local storage.
- Restore filters on reload.
- Clear filters on logout.

##### Acceptance Criteria

- [ ] Filters persist during session.
- [ ] Filters reset on logout.
- [ ] No stale filters remain.

---

## 8. Features Out of Scope (Post-MVP)

- Mobile/Tablet responsive design.
- Placing bets or wallet integration.
- Advanced alert notification channels (email, push notifications).
- Admin panel for managing users and data.
- Advanced data analytics or historical reporting dashboards.
- User profile management.
- Saving filter preferences to user profile (session-only for MVP).

## 9. Assumptions & Dependencies

- NZ TAB API (`openapi.json`) is stable, provides necessary data for filtering (Country, Race Type), and its data structures remain consistent.
- Appwrite's real-time subscription service can handle required volume of updates for all concurrent users.
- UI design inspired by reference image is desired direction, with added filter controls.
