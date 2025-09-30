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

## 2.2. Live Data Polling Functions

**Note**: These functions poll external APIs and update Appwrite database. Client applications poll Appwrite via Next.js API routes with coordinated cadence.

### enhanced-race-poller (HTTP-triggered, Master Coordination)
- **Specification:** s-2vcpu-2gb
- **Trigger:** HTTP requests with advanced polling logic
- **Purpose:** Consolidated race polling with mathematical validation and data quality scoring
- **Features:** 
  - Enhanced data quality scoring and consistency checks
  - Mathematical validation of pool sums and percentages
  - Dual-phase polling: early morning baseline capture + high-frequency critical periods
  - Server-heavy processing with pre-calculated incremental amounts
- **Dynamic Intervals:**
  - T-65m+: 30-minute intervals (early morning baseline)
  - T-60m to T-5m: 2.5-minute intervals (active period)
  - T-5m to T-3m: 30-second intervals (critical approach)
  - T-3m to Start: 30-second intervals (ultra-critical)
  - Post-start: 30-second intervals until Final

### master-race-scheduler (Scheduled, Autonomous Coordination)
- **Specification:** s-1vcpu-512mb
- **Schedule:** Every 1 minute (CRON minimum interval)
- **Purpose:** Autonomous coordination of all race polling activities
- **Processing:** Delegates high-frequency polling to enhanced-race-poller internal loops
- **Coordination:** Manages polling schedules across multiple races simultaneously

### race-data-poller (Dynamic Schedule, Legacy)
- **Specification:** s-2vcpu-2gb
- **Schedule:** Every minute during race hours
- **Purpose:** Real-time updates for active races (legacy function)
- **Status:** Maintained for backward compatibility, enhanced-race-poller recommended
- **Dynamic Intervals (Legacy):** See enhanced-race-poller for current production intervals

### single-race-poller (HTTP-triggered, Legacy)
- **Specification:** s-1vcpu-1gb
- **Trigger:** HTTP requests with raceId parameter
- **Purpose:** Individual race monitoring with detailed logging (legacy function)
- **Status:** Maintained for specific use cases, enhanced-race-poller recommended

### batch-race-poller (Scheduled, Legacy)
- **Specification:** s-1vcpu-2gb
- **Trigger:** Scheduled batch operations
- **Purpose:** Multiple race processing for efficiency (legacy function)
- **Status:** Maintained for batch scenarios, master-race-scheduler recommended

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
