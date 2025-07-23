# Kanban Board

## Backlog

### Epic 1: Project Scaffolding
*All stories completed*

### Epic 2: Backend Data Polling & Persistence

- [ ] Story 2.0: Refactor existing monolithic function to nested Appwrite CLI structure
- [ ] Story 2.1: Create daily data pipeline functions using nested Appwrite CLI structure
- [ ] Story 2.2: Implement dynamic real-time polling function using nested Appwrite CLI structure
- [ ] Story 2.3: Implement data persistence logic
- [ ] Story 2.4: Implement secure API credential handling

### Epic 3: Real-Time Race Dashboard

- [ ] Story 3.1: Display race meetings chronologically
- [ ] Story 3.2: Expand meetings to show races
- [ ] Story 3.3: Display real-time race status
- [ ] Story 3.4: Navigate to Detailed Race View

### Epic 4: Detailed Race View

- [ ] Story 4.1: Display detailed race header
- [ ] Story 4.2: Create entrants data grid
- [ ] Story 4.3: Display Money Flow column
- [ ] Story 4.4: Display odds history sparkline
- [ ] Story 4.5: Implement automatic data updates
- [ ] Story 4.6: Implement race navigation buttons

### Epic 5: Alerting System

- [ ] Story 5.1: Create Alerts Configuration UI
- [ ] Story 5.2: Configure odds change alert
- [ ] Story 5.3: Configure money flow alert
- [ ] Story 5.4: Implement visual row flash alert
- [ ] Story 5.5: Implement toast notifications for alerts
- [ ] Story 5.6: Implement global audible alert toggle

### Epic 6: User Authentication

- [ ] Story 6.1: Implement user signup
- [ ] Story 6.2: Implement user login
- [ ] Story 6.3: Persist user alert configurations

### Epic 7: Race Filtering

- [ ] Story 7.1: Create filter controls UI
- [ ] Story 7.2: Implement filtering by Country
- [ ] Story 7.3: Implement filtering by Race Type
- [ ] Story 7.4: Apply filters to navigation
- [ ] Story 7.5: Persist filters during session

## To Do

- [ ] Story 2.0: Refactor existing monolithic function to nested Appwrite CLI structure

## In Progress

*No stories currently in progress*

## Needs Rework (Architecture Change Impact)

- [⚠️] Story 2.1: Create daily race import function → **IMPLEMENTED BUT NEEDS REFACTORING** 
  - *Status: Work completed on feat/story-2.1 branch*
  - *Issue: Monolithic daily-race-importer doesn't match new 3-function architecture*
  - *Required: Refactor to 3 separate functions using nested CLI structure (after Story 2.0)*
- [⚠️] Story 2.2: Implement dynamic polling function → **IMPLEMENTED BUT NEEDS UPDATES**
  - *Status: Work completed on feat/story-2.2 branch*  
  - *Issue: race-data-poller may not use nested CLI structure properly*
  - *Required: Update to use nested CLI structure with shared utilities (after Story 2.0)*

## Done

- [x] Story 1.1: Next.js Initialization - Brownfield Addition
- [x] Story 1.2: Appwrite Environment and CI/CD Pipeline Setup  
- [x] Story 1.3: Scaffold Appwrite Cloud project and database
