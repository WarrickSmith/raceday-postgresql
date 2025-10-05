# Meeting Status Poller

Targeted polling function for meeting-level status changes that are not captured by race-specific polling functions.

## Purpose

This function addresses Task 5 requirements by ensuring meeting-level data remains up-to-date for real-time subscriptions on the meetings page. It focuses on meeting-level changes that race pollers don't capture:

- Meeting status (cancelled, postponed, delayed)
- Meeting-level weather and track conditions
- Meeting venue information changes
- Rail position updates
- Track surface/direction changes

## Architecture

- **Triggered by:** master-race-scheduler every 30 minutes during active racing periods
- **Data Source:** NZ TAB API meetings endpoint
- **Target Collection:** `meetings` collection in Appwrite database
- **Update Strategy:** Efficient field-by-field comparison and selective updates

## Integration

The function is integrated into the master-race-scheduler and will be triggered automatically every 30 minutes when racing is active. This ensures:

1. Meeting-level data stays fresh throughout the racing day
2. Real-time subscriptions have current data to propagate to the UI
3. More efficient than full daily-meetings refresh
4. Maintains clean separation from race-specific data polling

## Deployment

```bash
# Deploy the function
npm run deploy:meeting-status

# Test execution
npm run meeting-status

# Update environment variables only
npm run vars:meeting-status
```

## Data Flow

1. **master-race-scheduler** triggers meeting-status-poller every 30 minutes
2. **meeting-status-poller** fetches fresh meeting data from NZ TAB API
3. Compares with existing database records
4. Updates only changed fields in the `meetings` collection
5. **useRealtimeMeetings hook** receives database changes via Appwrite real-time subscriptions
6. **Meetings page components** automatically update with latest meeting status

## Performance

- Specification: s-1vcpu-1gb (lightweight polling)
- Timeout: 300 seconds (5 minutes)
- Updates only changed fields to minimize database operations
- Parallel processing for multiple meeting updates