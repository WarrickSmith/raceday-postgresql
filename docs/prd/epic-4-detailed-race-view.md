# Epic 4: Detailed Race View

## Story 4.1: Display detailed race header

**As a** user  
**I want** to see a header for the selected race with its name, distance, track condition, and time to start  
**So that** I understand key race details instantly.

#### Tasks

- Design and implement race header component.
- Fetch race metadata from backend.
- Display all required fields.

#### Acceptance Criteria

- [ ] Race header shows correct name, distance, track, and time.
- [ ] Header updates in real-time as race data changes.
- [ ] Layout is consistent with UI spec.

## Story 4.2: Create entrants data grid

**As a** user  
**I want** to see a grid of all entrants in the race, with columns for Runner Name, Saddlecloth #, Jockey, Trainer, current Win Odds, and current Place Odds  
**So that** I can compare runners easily.

#### Tasks

- Design data grid per UI spec.
- Fetch and display entrant data.
- Support sorting/filtering (if required).

#### Acceptance Criteria

- [ ] All entrants are displayed with required columns.
- [ ] Data grid updates in real-time.
- [ ] No missing or duplicate entrants.

## Story 4.3: Display Money Flow column

**As a** user  
**I want** to see a dedicated column displaying the current "Money Flow" (hold_percentage) for each entrant  
**So that** I can track market interest.

#### Tasks

- Add Money Flow column to entrants grid.
- Fetch and display hold_percentage for each entrant.
- Format values per design.

#### Acceptance Criteria

- [ ] Money Flow column is present for every entrant.
- [ ] Values match backend data.
- [ ] Column is visually distinct.

## Story 4.4: Display odds history sparkline

**As a** user  
**I want** to see a sparkline visualization in each row that charts the recent history of the Win odds  
**So that** I can spot trends quickly.

#### Tasks

- Integrate sparkline chart library.
- Fetch odds history for each entrant.
- Render sparkline in grid row.

#### Acceptance Criteria

- [ ] Sparkline chart appears for every entrant.
- [ ] Data matches odds history.
- [ ] Charts update in real-time.

## Story 4.5: Implement automatic data updates

**As a** user  
**I want** to see all data in the grid update automatically without a page refresh  
**So that** I always see the latest info.

#### Tasks

- Subscribe to Appwrite Realtime for data changes.
- Update grid in response to backend events.
- Test for real-time update speed.

#### Acceptance Criteria

- [ ] No manual refresh needed for updates.
- [ ] Data latency is below 2 seconds.
- [ ] No stale data displayed.

## Story 4.6: Implement race navigation buttons

**As a** user  
**I want** navigation buttons to move to Previous Race, Next Race, and Next Scheduled Race  
**So that** I can quickly scan races.

#### Tasks

- Design and implement navigation buttons.
- Handle edge cases (first/last race).
- Ensure buttons update view and URL.

#### Acceptance Criteria

- [ ] Navigation buttons work for all races.
- [ ] Correct race view is displayed after navigation.
- [ ] Buttons are accessible.

---
