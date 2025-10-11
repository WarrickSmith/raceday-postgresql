# Money Flow Legacy Fixtures

This directory contains regression test fixtures extracted from real NZTAB API responses to validate Story 2.4 money flow calculations against production data.

## Purpose

These fixtures serve Story 2.4 AC7: "Transform logic validated against server-old outputs using regression test fixtures to ensure calculation fidelity during migration."

## Data Source

All fixtures are derived from:
- **NZTAB API Endpoint:** `/affiliates/v1/racing/events/{id}`
- **Required Parameters:** `with_money_tracker=true`, `with_tote_trends_data=true`
- **Sample Responses:** Stored in `/docs/api/nztab-samples/`

## Fixture Structure

### race-with-money-tracker.json

Real race from Awapuni Synthetic (2025-07-17) containing:

**Input Data:**
- `race_data`: Complete race payload with entrants, pools, and money_tracker
- `money_tracker.entrants[]`: Array of objects with `entrant_id`, `hold_percentage`, `bet_percentage`

**Expected Calculations:**
- Pool amounts in cents: `(poolTotal * hold_percentage / 100) * 100`
- Pool percentages: Calculated from entrant pool amount / total pool
- Time metadata: Interval bucketing based on time-to-start
- Incremental deltas: Change from previous bucket (first bucket = current amounts)

## money_tracker API Structure

The NZTAB API provides money flow data in `data.money_tracker.entrants[]`:

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

**Key Points:**
1. `hold_percentage` and `bet_percentage` are **integers** (e.g., `11` = 11%, not 0.11)
2. Multiple entries per `entrant_id` can exist (historical snapshots from polling)
3. Zero values indicate scratched or non-backed runners
4. For current transform, use most recent entry per entrant

## References

- Story 2.4: `/docs/stories/story-2.4.md`
- NZTAB API Samples: `/docs/api/nztab-samples/`
- server-old extraction: `/server-old/enhanced-race-poller/src/database-utils.js:435-993`
