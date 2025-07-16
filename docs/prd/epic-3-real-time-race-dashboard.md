# Epic 3: Real-Time Race Dashboard

## Story 3.1: Display race meetings chronologically

**As a** user  
**I want** to see a list of all race meetings for the current day, ordered chronologically by the first race of the meeting  
**So that** I can easily scan upcoming races.

#### Tasks

- Query the backend for today's meetings and races.
- Sort meetings by the earliest race start time.
- Render the meeting list in the dashboard view.

#### Acceptance Criteria

- [ ] Meetings are displayed in chronological order.
- [ ] The list updates in real-time as new meetings are added or removed.
- [ ] No duplicate meetings are shown.

## Story 3.2: Expand meetings to show races

**As a** user  
**I want** to expand a meeting to see all races within it, showing the race number, race name, and start time  
**So that** I can view race details at a glance.

#### Tasks

- Implement expand/collapse UI for each meeting.
- Fetch and display race details per meeting.
- Ensure races are shown in order.

#### Acceptance Criteria

- [ ] Races are correctly grouped under their meetings.
- [ ] Race details are shown when a meeting is expanded.
- [ ] UI supports expand/collapse interaction.

## Story 3.3: Display real-time race status

**As a** user  
**I want** to see the status of each race (Open, Closed, Running, Finalized) update in real-time on the dashboard  
**So that** I know which races are active.

#### Tasks

- Subscribe to race status updates from backend.
- Display current status for each race.
- Visually differentiate race status.

#### Acceptance Criteria

- [ ] Status updates occur in real-time (<2s latency).
- [ ] Status is visually clear and accessible.
- [ ] Status matches backend values.

## Story 3.4: Navigate to Detailed Race View

**As a** user  
**I want** to be able to click on a race to navigate to its Detailed Race View  
**So that** I can see deeper race details.

#### Tasks

- Implement clickable race rows.
- Route user to the detailed race view page.
- Pass race ID as parameter.

#### Acceptance Criteria

- [ ] Clicking a race opens the correct detailed view.
- [ ] URL updates to reflect selected race.
- [ ] No navigation errors.

---
