# NZTAB API Sample Responses

This directory contains real NZTAB API response data organized for reference, testing, and development.

## Purpose

- **API Reference**: Real-world examples of NZTAB API response structures
- **Test Fixtures**: Source data for regression testing (see `/server/tests/fixtures/`)
- **Schema Validation**: Reference for Zod schema definitions in `/server/src/clients/nztab-types.ts`
- **Development**: Understanding actual API behavior vs OpenAPI specification

## Contents

### API Endpoint Documentation

- **`endpoints-reference.txt`**: List of all NZTAB API endpoints with URL patterns
- **`money-pool-calculation-guide.md`**: Detailed guide for extracting and calculating money flow percentages from API responses

### Sample Response Files

All files are JSON responses from production NZTAB API endpoints:

- **`race-event-full-response.json`**: Complete race event with `with_money_tracker=true` and `with_tote_trends_data=true`
  - Includes money_tracker.entrants[] data
  - Contains tote_trends XML data for pool calculations
  - Sample race: Awapuni Synthetic, 2025-07-17
  
- **`meetings-list-response.json`**: List of all meetings for a given date
  - Endpoint: `/affiliates/v1/racing/meetings`
  
- **`races-list-response.json`**: List of all races with date filtering
  - Endpoint: `/affiliates/v1/racing/list?date_from=today`
  
- **`meeting-detail-response.json`**: Detailed meeting information by ID
  - Endpoint: `/affiliates/v1/racing/meetings/:id?enc=json`
  
- **`meeting-extras-response.json`**: Extra meeting data (weather, track conditions, etc.)
  - Endpoint: `/affiliates/v1/racing/extras/:id?enc=json`

## Key Data Structures

### money_tracker

The `money_tracker` object provides hold and bet percentages per entrant:

```json
{
  "money_tracker": {
    "entrants": [
      {
        "entrant_id": "uuid-string",
        "hold_percentage": 11,
        "bet_percentage": 9
      }
    ]
  }
}
```

**Important Notes:**
- Percentages are **integers** (e.g., `11` = 11%, not 0.11)
- Multiple entries per `entrant_id` can exist (historical snapshots)
- Zero values indicate scratched or non-backed runners
- To get this data, use `with_money_tracker=true` query parameter

### Required Query Parameters

To get complete race data with money flow information:

```
GET /affiliates/v1/racing/events/{id}?with_money_tracker=true&with_tote_trends_data=true&with_will_pays=true
```

## Related Documentation

- **OpenAPI Spec**: `/docs/api/nztab-openapi.json`
- **Type Definitions**: `/server/src/clients/nztab-types.ts`
- **Test Fixtures**: `/server/tests/fixtures/money-flow-legacy/`
- **Story 2.4**: `/docs/stories/story-2.4.md` - Money flow calculation implementation

## Source

All sample data was collected from NZTAB production API on 2025-07-17 and organized on 2025-10-11 for Story 2.4 development and testing.
