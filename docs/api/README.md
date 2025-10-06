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
