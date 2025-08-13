# 4. Database Schema (Appwrite)

## 4.1. Core Collections

```sql
-- meetings: Race meeting information
meetingId (string, unique), meetingName (string), country (string, indexed),
raceType (string, indexed), date (datetime, indexed), status (string)

-- races: Individual races linked to meetings  
raceId (string, unique), name (string), raceNumber (integer, indexed),
startTime (datetime, indexed), status (string), actualStart (datetime),
meeting (relationship → meetings)

-- entrants: Horse entries linked to races
entrantId (string, unique), name (string), runnerNumber (integer, indexed),
winOdds (float), placeOdds (float), holdPercentage (float),
isScratched (boolean), race (relationship → races)

-- odds-history: Time-series odds data for sparklines
odds (float), eventTimestamp (datetime, indexed), type (string),
entrant (relationship → entrants)

-- money-flow-history: NEW - Time-series money flow data for timeline visualization
winPoolAmount (float), placePoolAmount (float), totalPoolAmount (float),
poolPercentage (float), incrementalAmount (float), pollingTimestamp (datetime, indexed),
timeToStart (integer), pollingInterval (string), entrant (relationship → entrants)

-- race-pools: NEW - Race-level pool totals tracking
winPoolTotal (float), placePoolTotal (float), quinellaPoolTotal (float),
trifectaPoolTotal (float), lastUpdated (datetime), race (relationship → races)

-- jockey-silks: NEW - Jockey silk color and pattern data
silkId (string, unique), primaryColor (string), secondaryColor (string),
pattern (string), iconUrl (string), jockeyName (string, indexed)

-- user-alert-configs: User notification preferences  
userId (string, indexed), alertType (string), threshold (float),
enabled (boolean), entrant (relationship → entrants)

-- notifications: Real-time alert delivery
userId (string, indexed), title (string), message (string),
type (string), read (boolean), raceId (string), entrantId (string)
```

## 4.2. Optimized Indexes

- **meetings:** idx_date, idx_country, idx_race_type, idx_meeting_id (unique)
- **races:** idx_race_id (unique), idx_start_time, idx_status
- **entrants:** idx_entrant_id (unique), idx_runner_number
- **odds-history:** idx_timestamp, idx_entrant_timestamp (compound)
- **money-flow-history:** idx_polling_timestamp, idx_entrant_polling (compound), idx_time_to_start
- **race-pools:** idx_race_id (unique), idx_last_updated
- **jockey-silks:** idx_silk_id (unique), idx_jockey_name
- **user-alert-configs:** idx_user_id, idx_user_entrant (compound)

---
