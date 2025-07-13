# System Architecture Document: RaceDay v1.4

*   **Project:** RaceDay
*   **Version:** 1.4
*   **Author:** BMad Architect Agent
*   **Date:** 2025-07-11 08:34:48
*   **Status:** Final

## 1. System Overview

The RaceDay application uses a serverless backend (Appwrite Cloud), a decoupled Next.js frontend, and real-time data synchronization.

---

## 2. Appwrite Database Schema

### 2.1. Collection: Meetings

**Purpose:**  
Stores information about a single race meeting.

#### Tasks
- Define schema in Appwrite for Meetings.
- Index by date, country, raceType.

#### Acceptance Criteria
- [ ] All required fields are present.
- [ ] Meetings can be queried by date/country/raceType.

### 2.2. Collection: Races

**Purpose:**  
Stores details for a single race, linked to a Meeting.

#### Tasks
- Define schema in Appwrite for Races.
- Link races to meetings via relationship attribute.

#### Acceptance Criteria
- [ ] Races are linked to Meetings.
- [ ] All race metadata is stored.

### 2.3. Collection: Entrants

**Purpose:**  
Stores details for each horse in a race.

#### Tasks
- Define schema in Appwrite for Entrants.
- Link entrants to races via relationship attribute.

#### Acceptance Criteria
- [ ] Entrant records are linked to races.
- [ ] All entrant metadata is stored.

### 2.4. Collection: OddsHistory

**Purpose:**  
A log of all odds fluctuations for an entrant.

#### Tasks
- Define schema for OddsHistory.
- Link to Entrant via relationship.

#### Acceptance Criteria
- [ ] Odds history is recorded for all entrants.
- [ ] History can be queried by entrant/timestamp.

### 2.5. Collection: MoneyFlowHistory

**Purpose:**  
A log of money flow changes for an entrant.

#### Tasks
- Define schema for MoneyFlowHistory.
- Link to Entrant via relationship.

#### Acceptance Criteria
- [ ] Money flow history is recorded for all entrants.
- [ ] History can be queried by entrant/timestamp.

### 2.6. Collection: UserAlertConfigs

**Purpose:**  
Stores alert configurations for each user.

#### Tasks
- Define schema for UserAlertConfigs.
- Link alert configs to userId.

#### Acceptance Criteria
- [ ] Alert configs persist for users.
- [ ] Alerts can be queried/updated.

### 2.7. Collection: Notifications

**Purpose:**  
Temporary store for real-time alert notifications.

#### Tasks
- Define schema for Notifications.
- Set permissions so only the user can read their notifications.
- Implement cleanup (delete after sent).

#### Acceptance Criteria
- [ ] Notifications are sent to correct user.
- [ ] Documents are removed after delivery.

---

## 3. Backend Services (Appwrite Functions)

### 3.1. Function: daily-race-importer

**Purpose:**  
Fetch and store all race meetings and races for the current day from the TAB API.

#### Tasks
- Configure function with CRON schedule.
- Fetch meetings/races from TAB API.
- Store/update documents in Meetings and Races collections.

#### Acceptance Criteria
- [ ] Function runs at midnight UTC.
- [ ] All meetings/races for the day are stored.
- [ ] Errors are logged/surfaced.

### 3.2. Function: race-data-poller

**Purpose:**  
Poll active races for updates at dynamic intervals.

#### Tasks
- Query active races needing polling.
- Fetch detailed race/entrant data from TAB API.
- Update Entrants, OddsHistory, MoneyFlowHistory.
- Invoke alert-evaluator with new data.

#### Acceptance Criteria
- [ ] Polling occurs per race schedule.
- [ ] Data is current in all collections.
- [ ] alert-evaluator is triggered as needed.

### 3.3. Function: alert-evaluator

**Purpose:**  
Evaluate race/entrant data against user alert configurations and create notifications.

#### Tasks
- Compare new data to UserAlertConfigs.
- Create Notification document if alert is triggered.

#### Acceptance Criteria
- [ ] Alerts are triggered per user config.
- [ ] Notifications are created and sent.

---

## 4. Frontend & Real-Time Communication

### 4.1. Real-Time Data Sync

**Purpose:**  
Synchronize frontend dashboard/grid with backend data via Appwrite Realtime.

#### Tasks
- Subscribe to Appwrite Realtime channels for Entrants, Notifications.
- Update UI in response to live data.

#### Acceptance Criteria
- [ ] Data updates propagate to UI <2s.
- [ ] Alerts/notifications appear in real-time.

### 4.2. Authentication

**Purpose:**  
Handle user sign-up, login, and session management.

#### Tasks
- Integrate Appwrite Account API in Next.js frontend.
- Support signup, login, logout, session persistence.

#### Acceptance Criteria
- [ ] Users can register, log in, and log out.
- [ ] Sessions persist until logout.

---

## 5. Dependencies

- Stable access to the NZ TAB API (`openapi.json`).
- Next.js and Appwrite documentation must be referenced for all implementation work.