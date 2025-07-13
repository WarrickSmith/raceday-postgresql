# 2. Appwrite Database Schema

## 2.1. Collection: Meetings

**Purpose:**  
Stores information about a single race meeting.

- Define schema in Appwrite for Meetings.
- Index by date, country, raceType.

- [ ] All required fields are present.
- [ ] Meetings can be queried by date/country/raceType.

## 2.2. Collection: Races

**Purpose:**  
Stores details for a single race, linked to a Meeting.

- Define schema in Appwrite for Races.
- Link races to meetings via relationship attribute.

- [ ] Races are linked to Meetings.
- [ ] All race metadata is stored.

## 2.3. Collection: Entrants

**Purpose:**  
Stores details for each horse in a race.

- Define schema in Appwrite for Entrants.
- Link entrants to races via relationship attribute.

- [ ] Entrant records are linked to races.
- [ ] All entrant metadata is stored.

## 2.4. Collection: OddsHistory

**Purpose:**  
A log of all odds fluctuations for an entrant.

- Define schema for OddsHistory.
- Link to Entrant via relationship.

- [ ] Odds history is recorded for all entrants.
- [ ] History can be queried by entrant/timestamp.

## 2.5. Collection: MoneyFlowHistory

**Purpose:**  
A log of money flow changes for an entrant.

- Define schema for MoneyFlowHistory.
- Link to Entrant via relationship.

- [ ] Money flow history is recorded for all entrants.
- [ ] History can be queried by entrant/timestamp.

## 2.6. Collection: UserAlertConfigs

**Purpose:**  
Stores alert configurations for each user.

- Define schema for UserAlertConfigs.
- Link alert configs to userId.

- [ ] Alert configs persist for users.
- [ ] Alerts can be queried/updated.

## 2.7. Collection: Notifications

**Purpose:**  
Temporary store for real-time alert notifications.

- Define schema for Notifications.
- Set permissions so only the user can read their notifications.
- Implement cleanup (delete after sent).

- [ ] Notifications are sent to correct user.
- [ ] Documents are removed after delivery.

---
