# 2. Microservices Backend Architecture

## 2.1. Daily Data Pipeline Functions

The daily data import is now handled by three sequential functions with 10-minute spacing to prevent API rate limiting:

### daily-meetings (17:00 UTC)
- **Specification:** s-1vcpu-512mb
- **Purpose:** Fetch and store race meetings from NZ TAB API
- **Processing:** AU/NZ filtering, batch processing with error isolation
- **Output:** Meeting records in database
- **Duration:** ~60 seconds

### daily-races (17:10 UTC)  
- **Specification:** s-1vcpu-512mb
- **Purpose:** Fetch race details for all stored meetings
- **Processing:** Sequential race processing, relationship linking to meetings
- **Output:** Race records linked to meetings
- **Duration:** ~90 seconds

### daily-entrants (17:20 UTC)
- **Specification:** s-1vcpu-1gb 
- **Purpose:** Fetch initial entrant data for all stored races
- **Processing:** Limited to 20 races with timeout protection, sequential API calls
- **Output:** Entrant records with initial odds data
- **Duration:** ~300 seconds (5 minutes max)

## 2.2. Real-time Functions

### race-data-poller (Dynamic Schedule)
- **Specification:** s-2vcpu-2gb
- **Schedule:** Every minute during race hours
- **Purpose:** Real-time updates for active races
- **Dynamic Intervals:**
  - T-60m to T-20m: 5-minute intervals
  - T-20m to T-10m: 2-minute intervals  
  - T-10m to T-5m: 1-minute intervals
  - T-5m to Start: 15-second intervals
  - Post-start: 5-minute intervals until Final

### alert-evaluator (Event-triggered)
- **Specification:** s-1vcpu-512mb
- **Trigger:** Database events on entrant updates
- **Purpose:** Process user alert configurations and create notifications
- **Processing:** Threshold evaluation, user filtering, notification creation

## 2.3. Enhanced Functions (v4.7)

### money-flow-tracker (Event-triggered)
- **Specification:** s-1vcpu-1gb
- **Trigger:** Database events on entrant odds/pool updates
- **Purpose:** Capture and store incremental money flow changes for timeline visualization
- **Processing:** Calculate time-to-start, polling intervals, incremental amounts, pool percentages
- **Output:** Records in money-flow-history collection aligned with polling windows

### race-pools-aggregator (Event-triggered) 
- **Specification:** s-1vcpu-512mb
- **Trigger:** Database events on entrant pool updates
- **Purpose:** Maintain race-level pool totals for footer display
- **Processing:** Aggregate win/place/quinella/trifecta pools, update race-pools collection
- **Output:** Real-time pool totals for race footer status bar

### jockey-silks-enricher (HTTP-triggered)
- **Specification:** s-1vcpu-512mb
- **Purpose:** Fetch and cache jockey silk data from external sources
- **Processing:** API calls to racing data providers, color analysis, icon generation
- **Output:** Enriched jockey-silks collection with visual data

---
