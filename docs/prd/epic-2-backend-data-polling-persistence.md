# Epic 2: Backend Data Polling & Persistence

## Story 2.1: Create daily race import function

**As the** system  
**I need** a serverless function that runs daily to fetch all meetings and races from the TAB API for the current day  
**So that** race data is always up to date.

#### Tasks

- Configure Appwrite Function with CRON schedule.
- Fetch meetings and races from TAB API.
- Store/update documents in database.

#### Acceptance Criteria

- [ ] Function runs at midnight UTC.
- [ ] All meetings and races for the day are imported.
- [ ] Errors are logged and surfaced.

## Story 2.2: Implement dynamic polling function

**As the** system  
**I need** to trigger a dynamic polling process for each race based on its start time  
**So that** live data is accurate.

#### Tasks

- Schedule polling intervals per race.
- Fetch latest race/entrant data from API.
- Store updates in database.

#### Acceptance Criteria

- [ ] Polling adapts to race schedule.
- [ ] Entrant data is current.
- [ ] No missed updates.

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
