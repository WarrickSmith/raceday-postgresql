# Epic 6: User Authentication

## Story 6.1: Implement user signup

**As a** new user  
**I want** to sign up for an account using an email and password  
**So that** my settings are saved.

#### Tasks

- Add signup UI to frontend.
- Use Appwrite Account API for registration.
- Validate user input.

#### Acceptance Criteria

- [ ] User can sign up successfully.
- [ ] Invalid input is handled gracefully.
- [ ] Account is created in backend.

## Story 6.2: Implement user login

**As a** returning user  
**I want** to log in to my account  
**So that** I can access my alerts and preferences.

#### Tasks

- Add login UI to frontend.
- Use Appwrite Account API for authentication.
- Handle login errors.

#### Acceptance Criteria

- [ ] User can log in successfully.
- [ ] Sessions persist across reloads.
- [ ] Login errors are shown to user.

## Story 6.3: Persist user alert configurations

**As a** user  
**I want** my configured alerts to be associated with my account and persist across sessions  
**So that** I don't have to reconfigure each visit.

#### Tasks

- Store alert config in UserAlertConfigs collection.
- Link config to user account.
- Retrieve alerts on login.

#### Acceptance Criteria

- [ ] Alerts persist for logged-in user.
- [ ] Configurations load automatically on login.
- [ ] No data loss.

---
