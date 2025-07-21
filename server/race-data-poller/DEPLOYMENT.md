# Race Data Poller - Deployment Guide

This guide covers deploying the race data poller function to Appwrite Cloud.

## Prerequisites

- Appwrite CLI installed globally: `npm install -g appwrite-cli`
- Appwrite Cloud account with configured project
- Project created and configured (same project as daily-race-importer)

## Environment Variables Setup

Before deployment, ensure these environment variables are configured in your Appwrite function:

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

## Deployment Steps

### 1. Login to Appwrite CLI

```bash
cd /path/to/raceday/server/race-data-poller
appwrite login
```

### 2. Initialize Function

```bash
# Initialize with your project ID
appwrite init function

# Follow prompts:
# - Function ID: race-data-poller
# - Function Name: race-data-poller
# - Runtime: node-22
# - Entrypoint: src/main.js
```

### 3. Deploy Function

```bash
# Deploy the function to Appwrite Cloud
appwrite functions deploy

# Or if you have multiple functions, specify the function ID
appwrite functions deploy --function-id race-data-poller
```

### 4. Set Environment Variables

```bash
# Set required environment variables
appwrite functions updateVariable \
  --function-id race-data-poller \
  --key APPWRITE_ENDPOINT \
  --value "https://appwrite.warricksmith.com/v1"

appwrite functions updateVariable \
  --function-id race-data-poller \
  --key APPWRITE_PROJECT_ID \
  --value "your_project_id_here"

appwrite functions updateVariable \
  --function-id race-data-poller \
  --key APPWRITE_API_KEY \
  --value "your_api_key_here"

# Optional: Set custom NZTAB API base URL if needed
appwrite functions updateVariable \
  --function-id race-data-poller \
  --key NZTAB_API_BASE_URL \
  --value "https://api.tab.co.nz"
```

### 5. Test Deployment

Test the function deployment by executing it manually:

```bash
# Execute function manually
appwrite functions createExecution --function-id race-data-poller
```

## Function Configuration

The function is configured with the following specifications:

- **Runtime**: Node.js 22
- **Timeout**: 300 seconds (5 minutes)
- **Memory**: 1GB (s-1vcpu-1gb specification)
- **Trigger**: HTTP endpoint (manual/scheduled)
- **Permissions**: `any` (can be triggered by anyone)

## Integration with Schedulers

The race data poller is designed to be called by external scheduling systems. Here are integration options:

### 1. GitHub Actions (Recommended)

Create a workflow that calls the function at regular intervals:

```yaml
# .github/workflows/race-polling.yml
name: Race Data Polling
on:
  schedule:
    - cron: "*/1 * * * *" # Every minute during race hours
    - cron: "*/5 * * * *" # Every 5 minutes during low activity

jobs:
  poll-race-data:
    runs-on: ubuntu-latest
    steps:
      - name: Poll Race Data
        run: |
          curl -X POST "${{ secrets.RACE_POLLER_ENDPOINT }}" \
               -H "Content-Type: application/json"
```

### 2. Cron Job

Set up a cron job on a server to call the function:

```bash
# Call every minute during race hours (example for NZ timezone)
*/1 18-23 * * * curl -X POST "https://your-function-endpoint" > /dev/null 2>&1
```

### 3. External Monitoring Services

Use services like UptimeRobot, Pingdom, or similar to periodically call the function endpoint.

### 4. Cloud Scheduler Services

- **AWS CloudWatch Events/EventBridge**: Schedule Lambda to call the function
- **Google Cloud Scheduler**: Direct HTTP calls to function endpoint
- **Azure Logic Apps**: Timer-triggered workflows

## Monitoring and Logging

### View Function Logs

```bash
# View recent executions and logs
appwrite functions listExecutions --function-id race-data-poller

# Get specific execution logs
appwrite functions getExecution \
  --function-id race-data-poller \
  --execution-id YOUR_EXECUTION_ID
```

### Function Metrics

Monitor the function performance through:

1. **Appwrite Console**: View execution statistics, success rates, and performance metrics
2. **Function Logs**: Detailed polling statistics and error information
3. **Database Monitoring**: Track data update frequencies and volumes

### Key Metrics to Monitor

- **Execution Success Rate**: Should be > 95%
- **Execution Duration**: Should complete within 60-120 seconds typically
- **Races Processed**: Number of races polled per execution
- **Entrants Updated**: Number of entrant records updated
- **API Response Times**: NZTAB API call performance

## Troubleshooting

### Common Issues

1. **Environment Variables Missing**

   ```bash
   # Check if all variables are set
   appwrite functions getVariables --function-id race-data-poller
   ```

2. **Database Connection Issues**
   - Verify API key has necessary database permissions
   - Check project ID matches your Appwrite project
   - Ensure database collections exist (run setup script first)

3. **NZTAB API Issues**
   - Check API authentication headers
   - Monitor for rate limiting (429 responses)
   - Verify API endpoint URLs

4. **Function Timeout**
   - Increase timeout if processing many races
   - Optimize database queries for better performance
   - Consider batch processing limits

### Debug Mode

For debugging, you can modify the function temporarily to increase logging:

```javascript
// Add more verbose logging in main.js
context.log("Debug: Detailed race information", {
  raceDetails: race,
  pollingInterval: interval,
  apiResponse: data,
});
```

## Performance Optimization

### Recommended Scheduling

Based on the dynamic polling strategy, optimize your scheduler:

1. **High Frequency**: Every 15-30 seconds during peak race times
2. **Medium Frequency**: Every 2-5 minutes during normal hours
3. **Low Frequency**: Every 10-15 minutes during off-peak hours

### Resource Scaling

The function is designed to handle:

- **Concurrent Races**: Up to 20-30 active races simultaneously
- **Entrants per Race**: Up to 24 entrants per race
- **API Calls**: Multiple NZTAB API calls per execution

Monitor and adjust the memory/CPU specification if needed based on actual usage patterns.

## Security Considerations

1. **API Key Security**: Store API keys securely in Appwrite environment variables
2. **Function Permissions**: Consider restricting to specific users if needed
3. **Rate Limiting**: Implement client-side rate limiting for NZTAB API calls
4. **Data Validation**: All API responses are validated before database updates

## Maintenance

### Regular Tasks

1. **Monitor Logs**: Check for errors and performance issues weekly
2. **Update Dependencies**: Keep Node.js dependencies current
3. **API Changes**: Monitor NZTAB API for schema changes
4. **Performance Review**: Analyze execution times and optimize as needed

### Backup Strategy

The function primarily updates data, but consider:

- Database backups through Appwrite
- Configuration backups (environment variables, function settings)
- Code versioning through Git
