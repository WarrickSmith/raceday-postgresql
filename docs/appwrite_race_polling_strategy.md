# **Appwrite Dynamic Horse Race Polling – Development Brief**

## **1. Objective**
Design and implement a **server-side polling system** within Appwrite that dynamically adjusts polling frequency for horse races based on each race’s advertised start time and post-start status.  
The system should avoid client-triggered polling, optimize resource usage, and maintain flexibility for frequent schedule changes.

---

## **2. Functional Requirements**

### **2.1 Race Data Lifecycle & Polling Rules**
For each race:
- **T–60m to T–20m** → Poll every **5 minutes**
- **T–20m to T–10m** → Poll every **2 minutes**
- **T–10m to T–5m** → Poll every **1 minute**
- **T–5m to Start** → Poll every **15 seconds**
- **Post-Start to Finalized** → Poll every **5 minutes** until race results are confirmed.

Races can start within minutes of each other, meaning multiple polling windows may overlap.

---

### **2.2 High-Level Approach**
1. **One Master Scheduler Function**:
   - Runs on a **fixed cron schedule** (every 15 seconds).
   - Reads all upcoming or active races from Appwrite Database.
   - Determines polling interval for each race based on current time and rules.
   - Tracks `last_poll_time` for each race to prevent redundant calls.
   - Decides whether to:
     - Trigger a **single-race poller** function.
     - Trigger a **batch poller** function with multiple race IDs.
   
2. **Single-Race Poller Function**:
   - Fetches race data for one race.
   - Updates the race’s DB record.
   - Optimized for high-frequency, low-latency updates.

3. **Batch Poller Function**:
   - Accepts an array of race IDs.
   - Fetches data for all races in one request (if external API supports multi-fetch) or multiple requests in parallel.
   - Updates DB records for all races.
   - Used for efficiency when multiple races share the same polling window.

---

## **3. Detailed Flow**

### **3.1 Master Scheduler**
- **Trigger:** Fixed cron schedule (`*/15 * * * * *` → every 15 seconds).
- **Logic Flow:**
  1. Query `races` collection:
     - Filter by `status != finalized`.
     - Include `advertised_start` and `last_poll_time`.
  2. For each race:
     - Calculate time to start (`T–x`).
     - Determine current polling interval.
     - If `now - last_poll_time >= interval`, mark race as due.
  3. Group due races:
     - If `dueRaces.length === 1` → call single-race poller.
     - If `dueRaces.length > 1` → call batch poller with race IDs.
  4. Update `last_poll_time` in DB after triggering polling.

---

### **3.2 Single-Race Poller**
- **Input:** `{ raceId: string }`
- **Process:**
  1. Fetch race data from external API.
  2. Parse and transform API data as needed.
  3. Update race document in Appwrite Database.
  4. Return updated race info (for logging).

---

### **3.3 Batch Poller**
- **Input:** `{ raceIds: string[] }`
- **Process:**
  1. If external API supports batch fetch:
     - Send one request with all race IDs.
  2. Else:
     - Fetch each race in parallel using `Promise.all`.
  3. Update each race document in DB.
  4. Return list of updated race IDs.

---

## **4. Database Structure**

**Collection:** `races`

| Field             | Type        | Description                                    |
|-------------------|------------|------------------------------------------------|
| `$id`             | string     | Race unique ID                                 |
| `advertised_start`| datetime   | Scheduled start time of the race               |
| `status`          | string     | Race status (`scheduled`, `in_progress`, `finalized`) |
| `last_poll_time`  | datetime   | Last time data was polled                      |
| `...`             | any        | Other race metadata (track, location, odds, etc.) |

---

## **5. External API Considerations**
- Check if race data provider supports **multi-race queries** to minimize HTTP requests.
- Ensure rate limits are respected — batch polling helps reduce total calls.

---

## **6. Execution & Performance**
- **Parallelism:** Appwrite functions execute asynchronously; batch polling reduces container spin-ups.
- **Concurrency Limits:** Verify `APPWRITE_FUNCTIONS_CONCURRENCY` setting if self-hosted.
- **Execution Time:** Each poll function should finish well within Appwrite’s function timeout (default 900s).
- **Error Handling:**
  - Retry failed polls on next master scheduler run.
  - Log API errors to a `poll_logs` collection for diagnostics.

---

## **7. Security**
- **API Keys:** Store external API credentials in Appwrite Function environment variables.
- **Permissions:**  
  - Master Scheduler: `databases.read`, `databases.write`, `functions.write`
  - Pollers: `databases.write`
- Use **server-side SDK** (Node.js recommended) inside functions.

---

## **8. Example Decision Logic (Pseudocode)**

```js
const dueRaces = [];

for (const race of races) {
  const timeToStart = race.advertised_start - now;
  const interval = getPollingInterval(timeToStart, race.status);

  if (now - race.last_poll_time >= interval) {
    dueRaces.push(race);
  }
}

if (dueRaces.length === 1) {
  createExecution("singleRacePoller", { raceId: dueRaces[0].$id });
} else if (dueRaces.length > 1) {
  createExecution("batchRacePoller", { raceIds: dueRaces.map(r => r.$id) });
}
```

---

## **9. Deliverables**
1. **Master Scheduler Function** (Node.js Appwrite Function)
2. **Single-Race Poller Function** (Node.js Appwrite Function)
3. **Batch Poller Function** (Node.js Appwrite Function)
4. **Database Schema** for `races` and optional `poll_logs`
5. **Environment Configuration** for API keys and endpoints
6. **Deployment Instructions** for Appwrite Functions with proper cron schedule

---

## **10. Future Enhancements**
- Dynamic adjustment of master scheduler frequency based on nearest upcoming race.
- Webhook support if external provider offers event push.
- Poller function self-throttling based on API rate limits.
- In-memory caching between polls to detect changes before writing to DB.
