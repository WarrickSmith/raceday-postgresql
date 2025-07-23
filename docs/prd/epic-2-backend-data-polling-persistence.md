# Epic 2: Backend Data Polling & Persistence

## Story 2.0: Refactor existing monolithic function to nested Appwrite CLI structure

**As a** developer  
**I need** to refactor the existing monolithic `daily-race-importer` work into the new nested Appwrite CLI structure  
**So that** existing progress is preserved while transitioning to the microservices architecture.

#### Tasks

- Review existing `daily-race-importer` implementation and identify reusable components.
- Extract shared utilities (API calls, data parsing, database operations) into common modules within nested CLI structure.
- Create base nested Appwrite CLI structure with shared utilities for the 4 microservice functions.
- Migrate existing TAB API integration code into shared utilities.
- Migrate existing database persistence logic into shared modules.
- Set up deployment configuration for individual functions using existing Appwrite CLI commands.
- Preserve any working timeout protection and error handling from existing implementation.

#### Acceptance Criteria

- [ ] Existing monolithic function work is successfully migrated to nested structure.
- [ ] Shared utilities are created for API calls, data parsing, and database operations.
- [ ] Base nested CLI structure is ready for individual function implementations.
- [ ] No functional regression from existing working components.
- [ ] Deployment configuration supports individual function deployment.
- [ ] All existing timeout protection and error handling is preserved.
- [ ] Foundation is ready for Stories 2.1 and 2.2 implementation.

## Story 2.1: Create daily data pipeline functions using nested Appwrite CLI structure

**As the** system  
**I need** three separate Appwrite functions (`daily-meetings`, `daily-races`, `daily-entrants`) implemented using the existing nested CLI structure  
**So that** data import is reliable, prevents resource contention, and leverages existing shared utilities without code duplication.

#### Tasks

- Create `daily-meetings` function using nested Appwrite CLI structure, scheduled at 17:00 UTC to fetch and store race meetings with AU/NZ filtering.
- Create `daily-races` function using nested Appwrite CLI structure, scheduled at 17:10 UTC to fetch race details for all stored meetings.
- Create `daily-entrants` function using nested Appwrite CLI structure, scheduled at 17:20 UTC to fetch initial entrant data with timeout protection.
- Leverage existing shared utilities and common code through nested structure to avoid duplication.
- Implement sequential processing with error isolation - continue processing on individual failures.
- Add 15-second timeouts on all external API calls to prevent hanging.
- Deploy each function separately using existing Appwrite CLI deployment commands.

#### Acceptance Criteria

- [ ] Three separate Appwrite functions deployed using nested CLI structure with shared utilities.
- [ ] Functions execute sequentially with 10-minute spacing to prevent API rate limiting.
- [ ] `daily-meetings` completes within 60 seconds and stores meeting records.
- [ ] `daily-races` completes within 90 seconds and links races to meetings.
- [ ] `daily-entrants` processes up to 20 races within 300 seconds with initial odds data.
- [ ] Individual processing failures don't fail entire pipeline.
- [ ] All functions have proper timeout protection and error handling.
- [ ] Pipeline success rate >99% for reliable daily data import.
- [ ] Code reuse achieved through nested structure without sacrificing microservices independence.

## Story 2.2: Implement dynamic real-time polling function using nested Appwrite CLI structure

**As the** system  
**I need** an intelligent `race-data-poller` function implemented using the existing nested CLI structure that adapts its frequency based on race timing  
**So that** users get optimal data freshness without overwhelming the API while leveraging existing shared utilities.

#### Tasks

- Create `race-data-poller` function using nested Appwrite CLI structure with every-minute base schedule.
- Leverage existing shared utilities and common code through nested structure for API calls and data processing.
- Implement dynamic polling intervals based on time-to-start:
  - T-60m to T-20m: 5-minute intervals
  - T-20m to T-10m: 2-minute intervals  
  - T-10m to T-5m: 1-minute intervals
  - T-5m to Start: 15-second intervals
  - Post-start: 5-minute intervals until Final
- Fetch latest entrant data with odds and money flow updates using shared API utilities.
- Store updates in database with proper timestamp indexing.
- Implement timeout protection and error handling for API calls.
- Deploy as separate function using existing Appwrite CLI deployment commands.

#### Acceptance Criteria

- [ ] `race-data-poller` function deployed using nested CLI structure with shared utilities.
- [ ] Polling frequency adapts automatically based on race timing.
- [ ] Function completes within 120 seconds using max 1.5GB memory.
- [ ] Real-time updates have <2s latency from backend to frontend.
- [ ] No missed critical updates during high-frequency periods.
- [ ] Code reuse achieved through nested structure for API calls and data processing.
- [ ] Function operates independently while sharing common utilities.
- [ ] Polling stops efficiently after race finalization.
- [ ] Function success rate >99.5% during peak racing periods.

## Story 2.3: Implement data persistence logic

**As the** system  
**I need** to parse EventRaceDetails and store relevant data into Meetings, Races, Entrants, OddsHistory, and MoneyFlowHistory collections  
**So that** the frontend can display complete data.

#### Tasks

- Parse EventRaceDetails from API.
- Map data to database schema.
- Store/append data correctly.

#### Acceptance Criteria

- [ ] All collections are updated as needed.
- [ ] Data matches API source.
- [ ] No data loss or corruption.

## Story 2.4: Implement secure API credential handling

**As the** system  
**I need** to securely use affiliate credentials stored as environment variables within Appwrite Function  
**So that** API credentials are not exposed.

#### Tasks

- Store API credentials in environment variables.
- Access credentials in function code.
- Prevent credential leaks/logging.

#### Acceptance Criteria

- [ ] Credentials are never exposed in logs.
- [ ] API calls use correct credentials.
- [ ] Security is validated.

---
