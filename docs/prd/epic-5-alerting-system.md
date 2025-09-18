# Epic 5: Alerting System

## Story 5.1: Create Alerts Configuration UI

**As a** user  
**I want** to access an "Alerts Configuration" modal or screen from the Detailed Race View  
**So that** I can customize my alerts.

#### Tasks

- Design Alerts Configuration modal.
- Link modal from Detailed Race View.
- Save user alert preferences.

#### Acceptance Criteria

- [ ] Modal opens from race view.
- [ ] User can configure and save alerts.
- [ ] Saved alerts persist for user.

## Story 5.2: Implement Visual Alert Calculation Engine

**As a** developer
**I want** to create a calculation engine for visual alert indicators
**So that** percentage changes in money amounts and odds can be accurately computed and displayed.

#### Tasks

- Create percentage change calculation logic for Money amounts:
  - Calculate each entrant's contribution as percentage of total money added in that specific timeframe only
  - Compare current timeframe percentage vs previous timeframe percentage
  - Only show increases (current % > previous %), no decreases
- Create percentage change calculation logic for Win Odds:
  - Calculate percentage decrease (shortening) compared to previous timeframe for same entrant
  - Only show when odds shorten (decrease), indicating increased confidence
- Implement indicator threshold matching system (5-10% through 50%+)
- Build foundation service that reads user alert configuration from database

#### Acceptance Criteria

- [ ] Money percentage calculations use timeframe-specific totals, not cumulative pool totals
- [ ] Money indicators only show increases, never decreases
- [ ] Odds calculations show shortening (decreases) only for Win Odds
- [ ] Calculation engine integrates with existing alert configuration from Story 5.1
- [ ] Threshold matching correctly maps percentage changes to configured indicator ranges
- [ ] Unit tests cover both money and odds calculation scenarios

## Story 5.3: Apply Visual Alerts to Enhanced Entrants Grid

**As a** user
**I want** to see visual background color indicators on cells in the Enhanced Entrants Grid
**So that** I can quickly identify significant changes in money flow and odds movements.

#### Tasks

- Integrate alert calculation engine with Enhanced Entrants Grid component
- Apply background color indicators to Win Money, Place Money, and Win Odds columns based on current view toggle
- Handle real-time data updates to recalculate and reapply indicators
- Ensure indicators only show for enabled thresholds from user configuration
- Respect Win/Place/Odds selector button state for which logic to apply

#### Acceptance Criteria

- [ ] Background colors appear on cells when percentage thresholds are exceeded
- [ ] Colors match the configured indicator colors from user's alert configuration
- [ ] Only enabled indicators from configuration are displayed
- [ ] Visual indicators update in real-time as new race data arrives
- [ ] Indicators correctly switch between money and odds logic based on view selector
- [ ] No indicators shown for scratched horses

## Story 5.4: Implement Global Audible Alert Toggle

**As a** user  
**I want** to enable/disable a global, audible alert that triggers one minute before the start of any scheduled race starttime, irrespective of where I am in the application, meetings or race pages.  
**So that** I am aware of upcoming races.

#### Tasks

- Add audible alert toggle to UI (placeholder already on the Enhanced entrants title row).
- Implement audio notification logic.
- Respect user filter settings.

#### Acceptance Criteria

- [ ] Audible alert triggers as expected.
- [ ] User can toggle alert on/off.
- [ ] Alert only applies to filtered races.

NOTE: There is an audio mp3 file at /home/warrick/Dev/raceday/race_start.mp3 to use for the audible announce,emt. This will need to be relocated to an appropriate application resource directory.

---
