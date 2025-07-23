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

## Story 5.2: Configure odds change alert

**As a** user  
**I want** to set a percentage increase/decrease threshold for Win odds over a specific time window  
**So that** I get notified about market moves.

#### Tasks

- Add UI controls for odds threshold and time window.
- Store alert config in backend.
- Evaluate odds changes in backend.

#### Acceptance Criteria

- [ ] User can set odds change alert.
- [ ] Alert triggers when condition is met.
- [ ] Notification is delivered to user.

## Story 5.3: Configure money flow alert

**As a** user  
**I want** to set a percentage increase threshold for Money Flow (hold_percentage)  
**So that** I get notified about large bets.

#### Tasks

- Add UI controls for money flow alert.
- Store config in backend.
- Evaluate money flow changes.

#### Acceptance Criteria

- [ ] User can set money flow alert.
- [ ] Alert triggers when condition is met.
- [ ] Notification is delivered to user.

## Story 5.4: Implement visual row flash alert

**As a** user  
**I want** the corresponding row in the race grid to flash visually for 5 seconds when an alert triggers  
**So that** I notice important changes.

#### Tasks

- Implement visual flash feedback in grid.
- Trigger flash when alert is received.

#### Acceptance Criteria

- [ ] Row flashes when alert triggers.
- [ ] Flash lasts 5 seconds.
- [ ] No false positives.

## Story 5.5: Implement toast notifications for alerts

**As a** user  
**I want** a toast notification to appear on my screen with a summary when an alert triggers  
**So that** I am immediately informed.

#### Tasks

- Design toast notification component.
- Display toast on alert trigger.
- Include summary details in notification.

#### Acceptance Criteria

- [ ] Toast appears for each alert.
- [ ] Summary is accurate and complete.
- [ ] Toast is dismissible.

## Story 5.6: Implement global audible alert toggle

**As a** user  
**I want** to enable/disable a global, audible alert that triggers one minute before the start of any race in my filtered view  
**So that** I am aware of upcoming races.

#### Tasks

- Add audible alert toggle to UI.
- Implement audio notification logic.
- Respect user filter settings.

#### Acceptance Criteria

- [ ] Audible alert triggers as expected.
- [ ] User can toggle alert on/off.
- [ ] Alert only applies to filtered races.



---
