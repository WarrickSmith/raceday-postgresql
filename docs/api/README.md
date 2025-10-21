# NZ TAB API Documentation

This directory contains API specifications and documentation for the New Zealand TAB (Totalisator Agency Board) API.

## OpenAPI Specification

**File:** [nztab-openapi.json](./nztab-openapi.json)

The OpenAPI 3.0 specification for the NZ TAB Affiliates API provides complete schema definitions for all API endpoints, request parameters, and response structures.

### Key Features

#### NZ Timezone Fields

The API provides timezone-specific fields that eliminate the need for timezone conversion:

- **`race_date_nz`** - Starting day of the event in NZST or NZDT (format: `YYYY-MM-DD`)
- **`start_time_nz`** - Starting time of the event in NZST or NZDT (format: `HH:MM`)

**Implementation Note:** These fields should be preferred over UTC fields for partition keys and racing day identification, as they align with business logic and partition strategy (see Story 1.3).

#### Race Status-Based Fetch Parameters

The API supports conditional fetch parameters that optimize payload size based on race status:

| Parameter | Available When Status | Description |
|-----------|----------------------|-------------|
| `with_tote_trends_data` | `open` | Money flow trends (critical pre-race data) |
| `with_money_tracker` | `open` | Real-time betting patterns |
| `with_big_bets` | `open` | Large bet notifications |
| `with_live_bets` | `open` | Live betting activity |
| `with_will_pays` | `open` | Potential payout calculations |
| `with_results` | `interim`, `closed` | Race results (NOT available during `open`) |
| `with_dividends` | `closed` | Final dividends |

**Performance Impact:** Using status-based parameters reduces API payload size by 40-60% for non-critical races.

#### Race Status Values

- **`open`** - Pre-race, odds and betting data available
- **`interim`** - Race finished, preliminary results available
- **`closed`** - Final results and dividends confirmed
- **`abandoned`** - Race cancelled

### Usage in Code

```typescript
// Example: Fetching race data with appropriate parameters
import { fetchRaceData } from '../fetchers/nztab.js';

// For open races (pre-race)
const openRaceData = await fetchRaceData(raceId, {
  with_tote_trends_data: true,
  with_money_tracker: true,
  with_big_bets: true,
  with_live_bets: true,
  with_will_pays: true,
});

// For finished races (interim/closed)
const finishedRaceData = await fetchRaceData(raceId, {
  with_results: true,
  with_dividends: status === 'closed',
});

// Use NZ timezone fields directly
const raceDate = openRaceData.race_date_nz;  // YYYY-MM-DD in NZ timezone
const partitionName = `money_flow_history_${raceDate.replace(/-/g, '_')}`;
```

## Related Documentation

- [API Research Findings](../research-findings-nztab-api.md) - Validated API behavior, rate limits, and best practices
- [Architecture Specification](../architecture-specification.md) - System architecture and API integration
- [Tech Spec Epic 1](../tech-spec-epic-1.md) - Database foundation and data models

## API Access

**Base URL:** `https://api.tab.co.nz/affiliates/v1`

**Required Headers:**
```javascript
{
  "From": "ws@baybox.co.nz",
  "X-Partner": "Warrick Smith",
  "X-Partner-ID": "Private Developer"
}
```

**Note:** These headers are mandatory for all API requests to avoid being blocked or rate limited.

## API Refresh Rate

The NZ TAB API refreshes data every **15 seconds**. Polling faster than this provides no benefit as the source data does not update more frequently.

**Recommended Polling Intervals:**
- ≤5 minutes to start: 15 seconds (matches API refresh)
- 5-15 minutes to start: 30 seconds
- >15 minutes to start: 60 seconds

## Version Information

- **OpenAPI Version:** 3.0
- **API Version:** v1 (Affiliates API)
- **Last Updated:** 2025-10-07
- **Specification Size:** ~124 KB

## Tools

The OpenAPI specification can be viewed using:
- [Swagger UI](https://editor.swagger.io/) - Paste the JSON content
- [Redoc](https://redocly.github.io/redoc/) - Alternative documentation viewer
- [Postman](https://www.postman.com/) - Import for API testing

## Future Enhancements

- [ ] Generate TypeScript types from OpenAPI spec using `openapi-typescript`
- [ ] Add API mock server for testing (using `prism` or similar)
- [ ] Create automated API contract tests
- [ ] Document all available endpoints and their use cases

## Client Compatibility REST API (PostgreSQL Backend)

Story 2.10E introduces an internal REST layer that mirrors the legacy Appwrite contract so the client can consume PostgreSQL data without transformation. The endpoints live under the Express server (`server/src/api/routes/client-compatibility.ts`) and use snake_case responses.

### Database Prerequisites

- `race_results` table (JSONB payloads for results/dividends/fixed odds)
- `user_alert_configs` table (per-user indicator configuration)

### Endpoints

| Method | Route | Description | Key Query Params |
| ------ | ----- | ----------- | ---------------- |
| GET | `/api/race-pools` | Returns pool totals and metadata for a race | `raceId` (required) |
| GET | `/api/race-results` | Returns race results JSON (results, dividends, odds flags) | `raceId` (required) |
| GET | `/api/money-flow-timeline` | Returns bucketed or legacy money-flow timeline data with interval coverage analysis | `raceId`, `entrants` (comma separated), `poolType`, `limit`, `cursorAfter`, `createdAfter` |
| GET | `/api/user-alert-configs` | Returns user alert indicators, creating defaults when none exist | `userId` (optional, defaults to `Default User`) |
| POST | `/api/user-alert-configs` | Upserts indicator configuration and audible alert toggle | Body: `{ user_id, indicators, audible_alerts_enabled }` |
| GET | `/api/races/upcoming` | Lists upcoming races within a time window, excluding finalised races | `windowMinutes`, `lookbackMinutes`, `limit` |
| GET | `/api/races/next-scheduled` | Returns the next scheduled race (or `null` when none exist) | — |

### Response Conventions

- All fields use snake_case to match the PostgreSQL schema and Story 2.10A conventions.
- Timestamps are returned in ISO 8601 with the Pacific/Auckland offset (no trailing `Z`).
- Money-flow timeline responses include:
  - `documents`: sorted timeline records (bucketed first, legacy fallback)
  - `interval_coverage`: summary + per-entrant coverage metadata
  - `query_optimizations`: notes mirroring client expectations
  - `next_cursor` / `next_created_at`: pagination cursors
- User alert config responses include:
- `user_id`
- `indicators` (six entries, ordered by `display_order`)
- `toggle_all`
- `audible_alerts_enabled`

### Example Payloads

#### GET `/api/race-pools`

```http
GET /api/race-pools?raceId=NZ-AUK-20251005-R1
```

```json
{
  "race_id": "NZ-AUK-20251005-R1",
  "win_pool_total": 50000,
  "place_pool_total": 30000,
  "quinella_pool_total": 10000,
  "trifecta_pool_total": 5000,
  "exacta_pool_total": 2500,
  "first4_pool_total": 1500,
  "total_race_pool": 99000,
  "currency": "$",
  "data_quality_score": 95,
  "extracted_pools": 6,
  "last_updated": "2025-10-21T11:55:00.000+13:00"
}
```

#### GET `/api/race-results`

```http
GET /api/race-results?raceId=NZ-AUK-20251005-R1
```

```json
{
  "race_id": "NZ-AUK-20251005-R1",
  "results_available": true,
  "results_data": [
    { "position": 1, "entrant_id": "ENT-001", "margin": "0.2L" }
  ],
  "dividends_data": [
    { "pool": "Win", "dividend": 3.4 }
  ],
  "fixed_odds_data": {
    "ENT_001": { "fixed_win": 3.5, "fixed_place": 1.8 }
  },
  "result_status": "final",
  "photo_finish": false,
  "stewards_inquiry": false,
  "protest_lodged": false,
  "result_time": "2025-10-21T12:45:00.000+13:00",
  "created_at": "2025-10-21T12:40:00.000+13:00",
  "updated_at": "2025-10-21T12:45:00.000+13:00"
}
```

#### GET `/api/money-flow-timeline`

```http
GET /api/money-flow-timeline?raceId=NZ-AUK-20251005-R1&entrants=ENT-001,ENT-002&poolType=win&limit=5
```

```json
{
  "success": true,
  "race_id": "NZ-AUK-20251005-R1",
  "entrant_ids": ["ENT-001", "ENT-002"],
  "pool_type": "win",
  "bucketed_data": true,
  "documents": [
    {
      "id": 12345,
      "race_id": "NZ-AUK-20251005-R1",
      "entrant_id": "ENT-001",
      "type": "bucketed_aggregation",
      "time_interval": 5,
      "hold_percentage": 15.2,
      "win_pool_amount": 50000,
      "event_timestamp": "2025-10-21T11:55:00.000+13:00",
      "created_at": "2025-10-21T11:55:05.000+13:00"
    }
  ],
  "interval_coverage": {
    "summary": {
      "totalDocuments": 3,
      "entrantsCovered": 2,
      "intervalsCovered": [5, 1, -2],
      "criticalPeriodGaps": []
    },
    "entrants": [
      { "entrant_id": "ENT-001", "documentCount": 3, "intervalsCovered": [5, 1, -2] }
    ]
  },
  "next_cursor": "12345",
  "next_created_at": "2025-10-21T11:55:05.000+13:00",
  "limit": 5,
  "created_after": null,
  "query_optimizations": [
    "Scalar filters on race_id and entrant_id",
    "Time interval filtering",
    "Bucketed storage",
    "Pre-calculated incrementals",
    "Cursor-based incremental retrieval (id & created_at)",
    "Extended range (-65 to +66)",
    "Includes Win pool incrementals and totals",
    "Includes fixed win odds snapshots",
    "Includes pool win odds snapshots",
    "Client can filter for Win view"
  ]
}
```

#### GET `/api/user-alert-configs`

```http
GET /api/user-alert-configs?userId=Default%20User
```

```json
{
  "user_id": "Default User",
  "toggle_all": true,
  "audible_alerts_enabled": true,
  "indicators": [
    {
      "indicator_id": "5c78453b-2a8c-4c66-b5d2-1bb8bfd2f741",
      "indicator_type": "percentage_range",
      "percentage_range_min": 5,
      "percentage_range_max": 10,
      "color": "#E5E7EB",
      "is_default": true,
      "enabled": true,
      "display_order": 1,
      "created_at": "2025-10-21T09:00:00.000+13:00",
      "updated_at": "2025-10-21T09:00:00.000+13:00",
      "audible_alerts_enabled": true
    }
  ]
}
```

#### POST `/api/user-alert-configs`

```http
POST /api/user-alert-configs
Content-Type: application/json

{
  "user_id": "Default User",
  "audible_alerts_enabled": false,
  "indicators": [
    {
      "indicator_id": "5c78453b-2a8c-4c66-b5d2-1bb8bfd2f741",
      "indicator_type": "percentage_range",
      "percentage_range_min": 5,
      "percentage_range_max": 10,
      "color": "#FFFFFF",
      "is_default": true,
      "enabled": false,
      "display_order": 1
    }
  ]
}
```

```json
{
  "success": true,
  "user_id": "Default User",
  "toggle_all": false,
  "audible_alerts_enabled": false,
  "indicators": [
    {
      "indicator_id": "5c78453b-2a8c-4c66-b5d2-1bb8bfd2f741",
      "display_order": 1,
      "enabled": false,
      "color": "#FFFFFF"
    }
  ]
}
```

#### GET `/api/races/upcoming`

```http
GET /api/races/upcoming?windowMinutes=120&lookbackMinutes=5&limit=5
```

```json
{
  "races": [
    {
      "race_id": "NZ-AUK-20251005-R1",
      "meeting_id": "NZ-AUK-20251005",
      "name": "Race 1 - Maiden",
      "race_number": 1,
      "start_time": "2025-10-21T12:30:00.000+13:00",
      "status": "open",
      "actual_start": null,
      "created_at": "2025-10-21T09:00:00.000+13:00",
      "updated_at": "2025-10-21T09:00:00.000+13:00"
    }
  ],
  "total": 1,
  "timestamp": "2025-10-21T11:05:00.000+13:00",
  "window": {
    "lower_bound": "2025-10-21T10:05:00.000Z",
    "upper_bound": "2025-10-21T12:05:00.000Z",
    "window_minutes": 120,
    "lookback_minutes": 5
  }
}
```

#### GET `/api/races/next-scheduled`

```http
GET /api/races/next-scheduled
```

```json
{
  "race_id": "NZ-AUK-20251005-R1",
  "meeting_id": "NZ-AUK-20251005",
  "name": "Race 1 - Maiden",
  "race_number": 1,
  "start_time": "2025-10-21T12:30:00.000+13:00",
  "status": "open",
  "actual_start": null,
  "created_at": "2025-10-21T09:00:00.000+13:00",
  "updated_at": "2025-10-21T09:00:00.000+13:00"
}
```

Refer to `server/tests/integration/api/client-compatibility.test.ts` for example requests and assertions covering every endpoint.
