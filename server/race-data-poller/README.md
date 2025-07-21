# race-data-poller

Dynamic polling function for race data based on start time. Implements the precise polling schedule defined in the project brief for real-time race updates.

## 🧰 Usage

### POST /

- Executes dynamic polling for races based on their start times
- Returns polling statistics and processed race data

**Response**

Sample `200` Response:

```json
{
  "success": true,
  "message": "Race data polling completed",
  "statistics": {
    "racesProcessed": 5,
    "entrantsUpdated": 48,
    "oddsHistoryRecords": 12,
    "moneyFlowRecords": 8
  }
}
```

## ⚙️ Configuration

| Setting           | Value                   |
| ----------------- | ----------------------- |
| Runtime           | Node (22.0)             |
| Entrypoint        | `src/main.js`           |
| Build Commands    | `npm install`           |
| Permissions       | `any`                   |
| Timeout (Seconds) | 300                     |
| Trigger           | HTTP (manual/scheduled) |

## 🔒 Environment Variables

### Required Variables

| Variable              | Description                                | Example                                |
| --------------------- | ------------------------------------------ | -------------------------------------- |
| `APPWRITE_ENDPOINT`   | Appwrite server endpoint                   | `https://appwrite.warricksmith.com/v1` |
| `APPWRITE_PROJECT_ID` | Your Appwrite project ID                   | `racedaytest250701`                    |
| `APPWRITE_API_KEY`    | Appwrite API key with database permissions | `your_api_key_here`                    |

### Optional Variables

| Variable             | Description        | Default                 |
| -------------------- | ------------------ | ----------------------- |
| `NZTAB_API_BASE_URL` | NZTAB API base URL | `https://api.tab.co.nz` |

## 🏁 Polling Strategy

The function implements dynamic polling intervals based on time to race start:

- **T-60m to T-20m**: Poll every 5 minutes
- **T-20m to T-10m**: Poll every 2 minutes
- **T-10m to T-5m**: Poll every 1 minute
- **T-5m to Start**: Poll every 15 seconds
- **Post-Start to Final**: Poll every 5 minutes until results are confirmed

Where 'T' is the specific race scheduled start time (`advertised_start`).
