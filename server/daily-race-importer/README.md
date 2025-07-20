# Daily Race Importer Function

This Appwrite Cloud Function automatically imports horse and harness racing data from the New Zealand TAB API on a daily schedule.

## Overview

- **Function Name**: `daily-race-importer`
- **Runtime**: Node.js v22.17.0+
- **Schedule**: Daily at 6:00 AM New Zealand time (17:00 UTC / 18:00 UTC during DST)
- **Purpose**: Import AU/NZ Horse and Harness racing meetings and races, excluding Greyhound racing

## Configuration

### Environment Variables

The following environment variables must be configured in the Appwrite Function settings:

```bash
# Appwrite Configuration
APPWRITE_ENDPOINT=https://appwrite.warricksmith.com/v1
APPWRITE_PROJECT_ID=your_project_id_here
APPWRITE_API_KEY=your_api_key_here

# NZTAB API Configuration
NZTAB_API_BASE_URL=https://api.tab.co.nz
```

### Function Configuration (appwrite.json)

```json
{
  "projectId": "{{APPWRITE_PROJECT_ID}}",
  "functions": [
    {
      "$id": "daily-race-importer",
      "name": "Daily Race Importer",
      "runtime": "node-22.0",
      "execute": ["any"],
      "events": [],
      "schedule": "0 17 * * *",
      "timeout": 300,
      "enabled": true,
      "logging": true,
      "entrypoint": "src/main.js",
      "commands": "npm install"
    }
  ]
}
```

## Data Flow

1. **Fetch**: Retrieves racing data from NZTAB API for the current date
2. **Filter**: Excludes Greyhound racing, keeps only AU/NZ Horse/Harness racing
3. **Transform**: Converts API data to Appwrite database document format
4. **Upsert**: Updates existing records or creates new ones in the database

## Database Collections

The function interacts with these Appwrite database collections:

- **Database ID**: `raceday-db`
- **Meetings Collection**: `meetings`
- **Races Collection**: `races`

### Meeting Document Structure

```typescript
{
  meetingId: string;        // UUID from NZTAB API
  meetingName: string;      // Meeting name
  country: string;          // 'AUS' or 'NZL'
  raceType: string;         // 'Thoroughbred Horse Racing' or 'Harness'
  date: string;             // ISO date string
  status: string;           // 'active'
}
```

### Race Document Structure

```typescript
{
  raceId: string;           // UUID from NZTAB API
  name: string;             // Race name
  raceNumber: number;       // Race number within meeting
  startTime: string;        // ISO datetime string
  distance?: number;        // Race distance in meters
  trackCondition?: string;  // Track condition
  weather?: string;         // Weather conditions
  status: string;           // Race status from API
  meeting: string;          // Reference to meeting document ID
}
```

## Deployment Guide

### Prerequisites

1. **Appwrite Cloud Project**: Ensure you have an active Appwrite Cloud project
2. **Database Setup**: Run the database setup script from the main project:
   ```bash
   cd client
   npm run setup:appwrite
   ```

### Deployment Steps

1. **Install Appwrite CLI** (if not already installed):
   ```bash
   npm install -g appwrite-cli
   ```

2. **Login to Appwrite**:
   ```bash
   appwrite login
   ```

3. **Deploy Function**:
   ```bash
   cd server/daily-race-importer
   appwrite deploy function
   ```

4. **Configure Environment Variables**:
   - Go to your Appwrite Console
   - Navigate to Functions > daily-race-importer > Settings
   - Add the required environment variables listed above

5. **Enable Function**:
   - Ensure the function is enabled in the Appwrite Console
   - Verify the CRON schedule is set correctly: `0 17 * * *`

### Alternative Manual Deployment

If using the Appwrite Console directly:

1. Create a new function in your Appwrite project
2. Upload the contents of this directory as a ZIP file
3. Configure environment variables in the function settings
4. Set the schedule to `0 17 * * *`
5. Enable the function

## Monitoring and Troubleshooting

### Logs

Function execution logs are available in the Appwrite Console:
- Navigate to Functions > daily-race-importer > Logs
- Logs include detailed information about:
  - Function start/completion times
  - API fetch results
  - Data filtering statistics
  - Database operation results
  - Error details with stack traces

### Common Issues

#### 1. Environment Variable Errors

**Error**: `Missing required environment variables`

**Solution**: 
- Verify all required environment variables are set in the function configuration
- Check that variable names match exactly (case-sensitive)

#### 2. API Connection Errors

**Error**: `NZTAB API request failed: 500 Internal Server Error`

**Solutions**:
- Check NZTAB API status
- Verify `NZTAB_API_BASE_URL` is correct
- Review API rate limiting

#### 3. Database Connection Errors

**Error**: `Failed to create meeting` or `Failed to create race`

**Solutions**:
- Verify Appwrite credentials are correct
- Check that the database and collections exist
- Ensure API key has appropriate permissions

#### 4. Data Filtering Issues

**Symptom**: No data imported despite API returning results

**Check**:
- Verify filtering logic for country (`AUS`, `NZL`) and category (`Thoroughbred Horse Racing`, `Harness`)
- Check API response format hasn't changed

### Expected Execution Statistics

A typical successful run should show:
- **Total meetings fetched**: 10-50 (varies by day)
- **Filtered meetings**: 5-30 (after filtering for AU/NZ Horse/Harness)
- **Meetings processed**: Same as filtered meetings
- **Races processed**: 50-300 (varies by day and number of meetings)

### Error Monitoring

The function includes comprehensive error handling and logging:

1. **Structured Logging**: All log entries include timestamps and context
2. **Error Classification**: Different error types are clearly identified
3. **Stack Traces**: Full error details for debugging
4. **Statistics Tracking**: Import counts for monitoring data quality

## Testing

### Unit Tests

Run the test suite:
```bash
npm install
npm test
```

### Manual Testing

1. **Test Environment Variables**:
   ```bash
   node -e "console.log(process.env.APPWRITE_ENDPOINT ? 'Set' : 'Missing')"
   ```

2. **Test API Connectivity**:
   ```bash
   curl "https://api.tab.co.nz/affiliates/v1/racing/list?date_from=$(date +%Y-%m-%d)&date_to=$(date +%Y-%m-%d)"
   ```

### Local Development

For local testing without Appwrite execution:

```bash
npm run build
node dist/main.js
```

Note: You'll need to mock the Appwrite context object for local testing.

## Function Idempotency

The function is designed to be idempotent:
- **Upsert Operations**: Uses update-or-create pattern for database operations
- **Safe Re-runs**: Can be run multiple times for the same date without duplicating data
- **Error Recovery**: Failed executions can be safely retried

## Performance Considerations

- **Timeout**: Set to 300 seconds (5 minutes) to handle large datasets
- **Memory**: Optimized for processing typical daily race datasets
- **API Rate Limiting**: Includes appropriate delays if needed
- **Database Efficiency**: Uses batch operations where possible

## Security

- **Environment Variables**: All sensitive data stored as Appwrite environment variables
- **API Keys**: Never hardcoded in source code
- **Error Logging**: Sensitive information excluded from logs
- **Access Control**: Function restricted to Appwrite execution context