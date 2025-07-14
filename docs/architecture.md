# System Architecture Document: RaceDay v1.4

- **Project:** RaceDay
- **Version:** 1.4
- **Author:** BMad Architect Agent
- **Date:** 2025-07-11 08:34:48
- **Status:** Final

## 1. System Overview

The RaceDay application uses a serverless backend (Appwrite Cloud), a decoupled Next.js frontend, and real-time data synchronization.

---

## 2. Appwrite Database Schema

### 2.1. Collection: Meetings

**Purpose:**  
Stores information about a single race meeting.

- Define schema in Appwrite for Meetings.
- Index by date, country, raceType.

- [ ] All required fields are present.
- [ ] Meetings can be queried by date/country/raceType.

### 2.2. Collection: Races

**Purpose:**  
Stores details for a single race, linked to a Meeting.

- Define schema in Appwrite for Races.
- Link races to meetings via relationship attribute.

- [ ] Races are linked to Meetings.
- [ ] All race metadata is stored.

### 2.3. Collection: Entrants

**Purpose:**  
Stores details for each horse in a race.

- Define schema in Appwrite for Entrants.
- Link entrants to races via relationship attribute.

- [ ] Entrant records are linked to races.
- [ ] All entrant metadata is stored.

### 2.4. Collection: OddsHistory

**Purpose:**  
A log of all odds fluctuations for an entrant.

- Define schema for OddsHistory.
- Link to Entrant via relationship.

- [ ] Odds history is recorded for all entrants.
- [ ] History can be queried by entrant/timestamp.

### 2.5. Collection: MoneyFlowHistory

**Purpose:**  
A log of money flow changes for an entrant.

- Define schema for MoneyFlowHistory.
- Link to Entrant via relationship.

- [ ] Money flow history is recorded for all entrants.
- [ ] History can be queried by entrant/timestamp.

### 2.6. Collection: UserAlertConfigs

**Purpose:**  
Stores alert configurations for each user.

- Define schema for UserAlertConfigs.
- Link alert configs to userId.

- [ ] Alert configs persist for users.
- [ ] Alerts can be queried/updated.

### 2.7. Collection: Notifications

**Purpose:**  
Temporary store for real-time alert notifications.

- Define schema for Notifications.
- Set permissions so only the user can read their notifications.
- Implement cleanup (delete after sent).

- [ ] Notifications are sent to correct user.
- [ ] Documents are removed after delivery.

---

## 3. Backend Services (Appwrite Functions)

### 3.1. Function: daily-race-importer

**Purpose:**  
Fetch and store all race meetings and races for the current day from the TAB API.

- Configure function with CRON schedule.
- Fetch meetings/races from TAB API.
- Store/update documents in Meetings and Races collections.

- [ ] Function runs at midnight UTC.
- [ ] All meetings/races for the day are stored.
- [ ] Errors are logged/surfaced.

### 3.2. Function: race-data-poller

**Purpose:**  
Poll active races for updates at dynamic intervals.

- Query active races needing polling.
- Fetch detailed race/entrant data from TAB API.
- Update Entrants, OddsHistory, MoneyFlowHistory.
- Invoke alert-evaluator with new data.

- [ ] Polling occurs per race schedule.
- [ ] Data is current in all collections.
- [ ] alert-evaluator is triggered as needed.

### 3.3. Function: alert-evaluator

**Purpose:**  
Evaluate race/entrant data against user alert configurations and create notifications.

- Compare new data to UserAlertConfigs.
- Create Notification document if alert is triggered.

- [ ] Alerts are triggered per user config.
- [ ] Notifications are created and sent.

---

## 4. Frontend & Real-Time Communication

### 4.1. Real-Time Data Sync

**Purpose:**  
Synchronize frontend dashboard/grid with backend data via Appwrite Realtime.

- Subscribe to Appwrite Realtime channels for Entrants, Notifications.
- Update UI in response to live data.

- [ ] Data updates propagate to UI <2s.
- [ ] Alerts/notifications appear in real-time.

### 4.2. Authentication

**Purpose:**  
Handle user sign-up, login, and session management.

- Integrate Appwrite Account API in Next.js frontend.
- Support signup, login, logout, session persistence.

- [ ] Users can register, log in, and log out.
- [ ] Sessions persist until logout.

---

## 6. Tech Stack

### 6.1. Frontend

- **Framework:** Next.js (latest version)
- **Language:** TypeScript
- **UI Framework:** Tailwind CSS (or similar utility-first framework)
- **State Management:** Appwrite SDK / SWR
- **Real-time:** Appwrite Realtime Subscriptions

### 6.2. Backend

- **Platform:** Appwrite Cloud (latest version)
- **Language:** Node.js (v22.17.0+)
- **SDK:** Appwrite Node.js SDK (v17.0.0+)

### 6.3. Data Source

- **Primary API:** New Zealand TAB API

---

## 7. Source Tree

The project will follow a standard Next.js `src` directory structure.

```
/
|-- .env.local
|-- .gitignore
|-- next.config.js
|-- package.json
|-- README.md
|-- tsconfig.json
|-- public/
|   |-- favicons/
|-- src/
|   |-- app/
|   |   |-- (api)/               # API routes and server actions
|   |   |-- (auth)/              # Auth pages (login, signup)
|   |   |-- (main)/              # Core application layout and pages
|   |   |   |-- layout.tsx
|   |   |   |-- page.tsx         # Main dashboard
|   |   |   |-- race/[id]/       # Detailed race view
|   |-- components/
|   |   |-- common/              # Reusable UI components (buttons, modals)
|   |   |-- layout/              # Layout components (header, sidebar)
|   |   |-- dashboard/           # Dashboard-specific components
|   |   |-- race-view/           # Race view-specific components
|   |-- lib/
|   |   |-- appwrite.ts          # Appwrite client configuration
|   |   |-- utils.ts             # Utility functions
|   |-- hooks/                   # Custom React hooks
|   |-- services/                # Backend service interactions
|   |-- styles/
|   |   |-- globals.css
|-- scripts/
    |-- appwrite-setup.ts      # Appwrite project setup script
```

---

## 8. Coding Standards

### 8.1. General

- **Language:** All code must be written in TypeScript.
- **Formatting:** Code will be formatted using Prettier with the configuration defined in `.prettierrc`.
- **Linting:** ESLint will be used to enforce code quality, with rules defined in `.eslintrc.json`.
- **Naming Conventions:**
  - Components: `PascalCase` (e.g., `RaceGrid.tsx`)
  - Functions/Variables: `camelCase` (e.g., `fetchRaceData`)
  - Types/Interfaces: `PascalCase` (e.g., `interface RaceDetails`)
- **Comments:** Code should be self-documenting where possible. Complex logic must be accompanied by explanatory comments.

### 8.2. Frontend (Next.js)

- **Component Structure:** Components should be small and focused on a single responsibility.
- **Data Fetching:** Use Server-Side Rendering (SSR) or Server Actions for initial data loads. Use SWR for client-side data fetching and re-validation.
- **State Management:** Prefer local component state. For global state, use React Context or a lightweight state management library if necessary.
- **Styling:** Use a utility-first CSS framework like Tailwind CSS. Avoid inline styles.

### 8.3. Backend (Appwrite Functions)

- **Error Handling:** All functions must include robust error handling and logging.
- **Environment Variables:** All secrets and configuration variables must be stored as environment variables in the Appwrite console, not hardcoded.
- **Idempotency:** Where possible, functions that modify data should be idempotent.

---

## 9. Dependencies

- Stable access to the NZ TAB API (`openapi.json`).
- Next.js and Appwrite documentation must be referenced for all implementation work.
