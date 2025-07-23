# Epic 2: Backend Data Polling & Persistence

## Story 2.1: Create daily data pipeline functions

**As the** system  
**I need** a sequential 3-function pipeline that runs daily to fetch meetings, races, and entrants from the TAB API  
**So that** data import is reliable and prevents resource contention.

#### Tasks

- Create `daily-meetings` function (s-1vcpu-512mb) scheduled at 17:00 UTC to fetch and store race meetings with AU/NZ filtering.
- Create `daily-races` function (s-1vcpu-512mb) scheduled at 17:10 UTC to fetch race details for all stored meetings.
- Create `daily-entrants` function (s-1vcpu-1gb) scheduled at 17:20 UTC to fetch initial entrant data with timeout protection.
- Implement sequential processing with error isolation - continue processing on individual failures.
- Add 15-second timeouts on all external API calls to prevent hanging.
- Configure proper resource specifications per function type.

#### Acceptance Criteria

- [ ] Three functions execute sequentially with 10-minute spacing to prevent API rate limiting.
- [ ] `daily-meetings` completes within 60 seconds and stores meeting records.
- [ ] `daily-races` completes within 90 seconds and links races to meetings.
- [ ] `daily-entrants` processes up to 20 races within 300 seconds with initial odds data.
- [ ] Individual processing failures don't fail entire pipeline.
- [ ] All functions have proper timeout protection and error handling.
- [ ] Pipeline success rate >99% for reliable daily data import.

## Story 2.2: Implement dynamic real-time polling function

**As the** system  
**I need** an intelligent real-time polling function that adapts its frequency based on race timing  
**So that** users get optimal data freshness without overwhelming the API.

#### Tasks

- Create `race-data-poller` function (s-2vcpu-2gb) with every-minute base schedule.
- Implement dynamic polling intervals based on time-to-start:
  - T-60m to T-20m: 5-minute intervals
  - T-20m to T-10m: 2-minute intervals  
  - T-10m to T-5m: 1-minute intervals
  - T-5m to Start: 15-second intervals
  - Post-start: 5-minute intervals until Final
- Fetch latest entrant data with odds and money flow updates.
- Store updates in database with proper timestamp indexing.
- Implement timeout protection and error handling for API calls.

#### Acceptance Criteria

- [ ] Polling frequency adapts automatically based on race timing.
- [ ] Function completes within 120 seconds using max 1.5GB memory.
- [ ] Real-time updates have <2s latency from backend to frontend.
- [ ] No missed critical updates during high-frequency periods.
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
