# Project Brief: RaceDay (Final)

*   **Date:** 2025-07-11
*   **Author:** Warrick Smith (via BMad Orchestrator)
*   **Version:** 1.0

## 1. Project Vision & Goal

To create "RaceDay," a specialized, desktop-first web application for real-time monitoring of New Zealand Gallops and Trotting horse races. The application will empower users to detect and visualize significant market movements by tracking odds fluctuations and "money flow" (pool percentage per horse), supported by a configurable alert system.

## 2. Core User Stories (MVP)

*   **As a user, I want to see a dashboard of all of today's race meetings and the races within them, so I can get a quick overview.**
*   **As a user, I want to select a specific race and view detailed information for all entrants, including their current Win/Place odds, saddlecloth number, and jockey/trainer.**
*   **As a user, I want to see the percentage of the total pool money (`hold_percentage`) for each horse to track the "money flow."**
*   **As a user, I want to view the historical fluctuation of Win/Place odds for a horse, with timestamps, to understand market trends.**
*   **As a user, I want to configure percentage-based alerts for changes in money flow and odds, so I can be notified of significant market activity.**
*   **As a user, I want the race data to update automatically in real-time without needing to refresh the page.**
*   **As a user, I want to navigate easily between races and jump to the next starting race.**

## 3. Key Features & Functionality

### 3.1. Race Monitoring & Display
*   **Race Dashboard:** Display a list of upcoming races for the day, grouped by meeting.
*   **Detailed Race View:**
    *   Show entrants, saddlecloth numbers, jockey/trainer.
    *   Display `race_status` (e.g., "Open," "Closed," "Running," "Finalized").
    *   Display results post-race.
    *   **UI Inspiration:** The UI will be guided by the `BT Main Screen.JPG` screenshot, featuring a data-dense grid.

### 3.2. Data Tracking & Visualization
*   **Money Flow Tracking:** Track and display the `hold_percentage` from the `EntrantLiability` object for each horse.
*   **Odds Fluctuation Tracking:** Monitor and visualize `flucs_with_timestamp` for each horse's Win and Place odds. Sparklines or similar micro-charts should be used for at-a-glance visualization.

### 3.3. Configurable Alerts
*   **Threshold Configuration:** Users must be able to set percentage-based change thresholds for:
    1.  `hold_percentage` (Money Flow)
    2.  Win/Place Odds
*   **Notification System:** When a threshold is breached, the system will trigger a visual notification within the UI, such as a flash on the relevant data row and a toast pop-up. (Browser/Push notifications are post-MVP).

### 3.4. User Management
*   **Authentication:** Users will need to create an account and log in.
*   **Roles:** The system will initially support a `user` role. The architecture must accommodate a future `admin` role for data management.

## 4. Technical Architecture & Stack

### 4.1. Frontend
*   **Framework:** Next.js (latest version)
*   **Language:** TypeScript
*   **Structure:** `src/` directory, App Router
*   **Key Features:** Server-Side Rendering (SSR), Server Actions.
*   **Real-time:** The client will subscribe to the Appwrite backend for real-time data updates.

### 4.2. Backend
*   **Platform:** Appwrite (latest Cloud version)
*   **SDK:** Node.js SDK (v17.0.0+)
*   **Node.js Version:** 22.17.0
*   **Core Components:**
    *   **Appwrite Database:** To persist all racing data.
    *   **Appwrite Authentication:** To manage user accounts and roles.
    *   **Appwrite Functions:** To host the serverless backend logic.

### 4.3. Data Source
*   **API:** New Zealand TAB API (as defined in `openapi.json`).
*   **API Authentication:** The API does not require authentication, but affiliate details (from a `.env` file) must be included in request headers.
*   **Data Access:** The backend will primarily use the `GET /affiliates/v1/racing/meetings` and `GET /affiliates/v1/racing/events/{id}` endpoints.

## 5. Backend Polling & Data Persistence Logic

A daily, automated backend process will be responsible for fetching and storing race data.

### 5.1. Data Collections (Appwrite Database)
*   `Meetings`: Stores meeting information.
*   `Races`: Stores race details, linked to a Meeting.
*   `Entrants`: Stores horse/runner information, linked to a Race.
*   `OddsHistory`: Stores timestamped odds fluctuations (`flucs_with_timestamp`).
*   `MoneyFlowHistory`: Stores timestamped `hold_percentage` data.
*   **Data Retention:** All fetched data will be stored indefinitely. A future admin interface will provide capabilities for data management and archival/deletion.

### 5.2. Polling Service (Appwrite Function)
1.  **Daily Initialization:** Once per day, the service will fetch all of the day's meetings and their associated races from the TAB API to populate the local `Meetings` and `Races` collections.
2.  **Dynamic Polling per Race:** For each race, a process will monitor its `advertised_start` time and initiate polling one hour prior, adjusting frequency based on the configured rules:
    *   **T-60m to T-20m:** Poll every 5 minutes.
    *   **T-20m to T-10m:** Poll every 2 minutes.
    *   **T-10m to T-5m:** Poll every 1 minute.
    *   **T-5m to Start:** Poll every 15 seconds.
    *   **Post-Start to Finalized:** Poll every 5 minutes until results are confirmed.
3.  **Data Storage:** On each poll, update the relevant collections. New odds and money flow data points will be added to the `OddsHistory` and `MoneyFlowHistory` collections, creating a persistent log of market movements.