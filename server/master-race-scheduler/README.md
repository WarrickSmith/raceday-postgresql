# Master Race Scheduler

Autonomous server-side polling coordinator for horse race data updates.

## Purpose

This function serves as the central coordinator for all race polling activities. It runs every 15 seconds and:

1. Analyzes all active races to determine polling requirements
2. Calculates optimal polling intervals based on race timing
3. Intelligently selects between batch and individual polling functions
4. Tracks last poll times to prevent redundant polling
5. Respects New Zealand racing hours (7:00am-12:00pm NZST)

## Architecture

- **Cron Schedule**: Every 15 seconds (`*/15 * * * * *`)
- **Resource Specification**: s-1vcpu-1gb
- **Timezone Awareness**: Only active during NZ racing hours
- **Function Triggering**: Uses Appwrite Functions SDK to trigger batch or single race pollers

## Polling Intervals

- **T-60m→T-20m**: Poll every 5 minutes
- **T-20m→T-10m**: Poll every 2 minutes  
- **T-10m→T-5m**: Poll every 1 minute
- **T-5m→Start**: Poll every 15 seconds
- **Post-Start (Closed)→Interim**: Poll every 30 seconds
- **Interim→Final**: Poll every 5 minutes