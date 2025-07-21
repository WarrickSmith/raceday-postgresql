# Daily Race Importer Function ✅ Production Deployed

This Appwrite Cloud Function automatically imports horse and harness racing data from the New Zealand TAB API on a daily schedule. **Status: Production deployed and operational** with comprehensive enhancements including timezone handling, automated deployment, and Node.js 22 runtime.

## Overview

- **Function Name**: `daily-race-importer`
- **Runtime**: Node.js 22 (upgraded from Node.js 16)
- **Implementation**: JavaScript-only (migrated from TypeScript for simplified deployment)
- **Schedule**: Daily at 6:00 AM New Zealand time (17:00 UTC)
- **Purpose**: Import AU/NZ Horse and Harness racing meetings and races, excluding Greyhound racing
- **Status**: ✅ **Production deployed and operational**

### Key Features
- **Timezone-aware date handling**: Uses `Pacific/Auckland` timezone for accurate local date determination
- **Automated database setup**: Creates required collections and indexes automatically  
- **Comprehensive logging**: Detailed execution logs with country/category statistics
- **Idempotent operations**: Safe to run multiple times without data duplication
- **Enhanced error handling**: Robust error recovery and detailed error reporting

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
      "runtime": "node-22",
      "execute": ["any"],
      "events": [],
      "schedule": "0 17 * * *",
      "timeout": 300,
      "enabled": true,
      "logging": true,
      "entrypoint": "src/main.js",
      "commands": "npm install",
      "scopes": ["databases.read", "databases.write"]
    }
  ]
}
```

**Recent Configuration Updates**:
- ✅ Runtime upgraded from `node-16.0` to `node-22`
- ✅ Timeout increased from 15 to 300 seconds for reliable execution
- ✅ Proper database scopes configured
- ✅ CRON schedule properly set for daily execution

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

### Automated Deployment (Recommended)

**✅ Enhanced Deployment Process**: This function includes automated deployment scripts with environment management and database setup verification. See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

#### Quick Deployment

1. **Configure Environment** (create `.env` file):
   ```bash
   APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
   APPWRITE_PROJECT_ID=your-project-id
   APPWRITE_API_KEY=your-api-key
   NZTAB_API_BASE_URL=https://api.tab.co.nz
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   npm install -g appwrite-cli  # If not already installed
   ```

3. **Deploy with Environment Management**:
   ```bash
   npm run deploy  # Uses automated script with .env parsing
   ```

**New Deployment Features**:
- 🚀 **Automated environment variable injection** from `.env` files
- 📋 **Pre-deployment validation** of configuration and connectivity
- 🗄️ **Automatic database setup** with collection creation and indexing
- 📊 **Deployment verification** with connection testing

#### Available NPM Scripts

- `npm run deploy` - **Enhanced deployment** with automated environment setup
- `npm run deploy:check` - List functions and validate CLI connection  
- `npm run dev` - Run function locally for testing
- `npm test` - Run comprehensive test suite
- `npm run build` - Compile TypeScript (if using TS version)

#### Database Setup

The function includes **automatic database setup verification**:
- Checks if database and collections exist before processing data
- Automatically creates missing database infrastructure
- Ensures all required collections and attributes are available
- Safe to run multiple times (idempotent operations)

No manual database setup is required - the function will create everything it needs.

### Manual Deployment (Alternative)

If you prefer manual deployment through the Appwrite Console:

1. Create a new function in your Appwrite project
2. Upload the contents of this directory as a ZIP file
3. Configure environment variables in the function settings
4. Set the schedule to `0 17 * * *`
5. Enable the function

### Deployment Verification

After deployment, the function will:
1. **Verify database setup** on first run
2. **Create required collections** if they don't exist
3. **Log detailed execution information** for monitoring
4. **Run on schedule** at 6:00 AM NZ time daily

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
- Use the automated deployment script: `npm run deploy`
- Verify `.env` file contains all required variables
- Check that variable names match exactly (case-sensitive)

#### 2. API Connection Errors

**Error**: `NZTAB API request failed: 500 Internal Server Error`

**Solutions**:
- Check NZTAB API status
- Verify `NZTAB_API_BASE_URL` is correct: `https://api.tab.co.nz`
- Review API rate limiting

#### 3. Database Connection Errors

**Error**: `Failed to create meeting` or `Failed to create race`

**Solutions**:
- Use `npm run deploy` which includes database setup verification
- Verify Appwrite credentials are correct
- Ensure API key has `databases.read` and `databases.write` scopes

#### 4. Date/Timezone Issues (**Recently Fixed**)

**Previous Issue**: Function missing race data due to UTC/local time misalignment

**✅ Fixed**: Function now uses `Pacific/Auckland` timezone for accurate date determination

#### 5. Runtime Version Issues (**Recently Fixed**)

**Previous Issue**: Function deployment failures due to Node.js 16 deprecation

**✅ Fixed**: Function upgraded to Node.js 22 runtime

#### 6. Data Filtering Issues

**Symptom**: No data imported despite API returning results

**Check**:
- Function now logs detailed country/category statistics for debugging
- Verify filtering logic for country (`AUS`, `NZ`) and category (`Thoroughbred Horse Racing`, `Harness`)
- Check logs for detailed filtering information

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
- **Database Setup**: Automatic collection and index creation is idempotent
- **Environment Management**: Deployment scripts safely update configurations

## Performance Considerations

- **Timeout**: Upgraded to 300 seconds (5 minutes) to handle large datasets reliably
- **Memory**: Optimized for processing typical daily race datasets
- **API Rate Limiting**: Includes appropriate delays if needed
- **Database Efficiency**: Uses batch operations with optimized indexing
- **Runtime Performance**: Node.js 22 provides improved performance over Node.js 16
- **Logging Efficiency**: Structured logging with minimal performance impact

## Security

- **Environment Variables**: All sensitive data stored as Appwrite environment variables
- **API Keys**: Never hardcoded in source code
- **Error Logging**: Sensitive information excluded from logs
- **Access Control**: Function restricted to Appwrite execution context