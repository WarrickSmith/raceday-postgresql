# 3. Backend Services (Appwrite Functions)

## 3.1. Function: daily-race-importer

**Purpose:**  
Fetch and store all race meetings and races for the current day from the TAB API.

### Tasks
- Configure function with CRON schedule.
- Fetch meetings/races from TAB API.
- Store/update documents in Meetings and Races collections.

### Acceptance Criteria
- [ ] Function runs at midnight UTC.
- [ ] All meetings/races for the day are stored.
- [ ] Errors are logged/surfaced.

## 3.2. Function: race-data-poller

**Purpose:**  
Poll active races for updates at dynamic intervals.

### Tasks
- Query active races needing polling.
- Fetch detailed race/entrant data from TAB API.
- Update Entrants, OddsHistory, MoneyFlowHistory.
- Invoke alert-evaluator with new data.

### Acceptance Criteria
- [ ] Polling occurs per race schedule.
- [ ] Data is current in all collections.
- [ ] alert-evaluator is triggered as needed.

## 3.3. Function: alert-evaluator

**Purpose:**  
Evaluate race/entrant data against user alert configurations and create notifications.

### Tasks
- Compare new data to UserAlertConfigs.
- Create Notification document if alert is triggered.

### Acceptance Criteria
- [ ] Alerts are triggered per user config.
- [ ] Notifications are created and sent.

---
