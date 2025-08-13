# Batch Race Poller Function

**Function ID**: `batch-race-poller`  
**Runtime**: Node.js 22  
**Specification**: s-2vcpu-2gb  
**Timeout**: 600 seconds  

## Overview

The Batch Race Poller is an HTTP-triggered Appwrite function designed for efficient multi-race polling. It processes 3-5 races simultaneously with optimized resource utilization, coordinated API rate limiting, and comprehensive error isolation.

## Architecture

This function implements **Tier 2** of the four-tier polling architecture:

- **Tier 1**: `race-data-poller` - Baseline 5-minute polling for 1-hour window
- **Tier 2**: `batch-race-poller` - **THIS FUNCTION** - Efficient multi-race processing
- **Tier 3**: `single-race-poller` - Individual high-frequency polling for critical timing
- **Tier 4**: Next.js server actions - Intelligent coordination and strategy selection

## Key Features

### 🚀 Performance Optimizations
- **Shared Database Connection**: Single connection pool for all race processing
- **Coordinated API Rate Limiting**: 1.2-second delays between NZ TAB API calls
- **Optimized Resource Utilization**: s-2vcpu-2gb specification for batch processing
- **Background Processing**: Immediate HTTP response with deferred processing

### 🛡️ Error Handling
- **Race-Level Isolation**: One race failure doesn't stop others
- **Comprehensive Error Collection**: Detailed error reporting and logging
- **Graceful Degradation**: Continues processing even with partial failures
- **Validation and Filtering**: Skips finalized races automatically

### 📊 Processing Features
- **Multi-Collection Updates**: Handles entrants, odds-history, money-flow-history
- **Batch Processing Summary**: Detailed success/failure metrics
- **Processing Time Tracking**: Performance monitoring and reporting

## Function Payload

### Request Format
```json
{
  "raceIds": ["race-uuid-1", "race-uuid-2", "race-uuid-3"]
}
```

### Response Format (Immediate - 202 Accepted)
```json
{
  "success": true,
  "message": "Batch race polling initiated for 3 races",
  "validRaces": 3,
  "skippedRaces": 0,
  "totalRequested": 3,
  "note": "Data processing in progress, check database for updates"
}
```

## Manual Testing

### Prerequisites

1. **Environment Setup**: Ensure `.env` file contains required variables:
   ```env
   APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
   APPWRITE_PROJECT_ID=your-project-id
   APPWRITE_API_KEY=your-api-key
   NZTAB_API_BASE_URL=https://api.tab.co.nz
   ```

2. **Valid Race IDs**: You need actual race document IDs from the database.

### Method 1: Using Server NPM Scripts (Recommended)

```bash
# From the server directory
cd /path/to/raceday/server

# Test with sample race IDs
npm run test:batch-race-poller

# Test with custom race IDs
npm run batch-race-poller -- --raceIds "race-id-1,race-id-2,race-id-3"

# Deploy and test in one command
npm run deploy:batch-race-poller && npm run test:batch-race-poller
```

### Method 2: Direct Function Execution via Appwrite CLI

```bash
# Execute function directly
appwrite functions createExecution \
  --functionId batch-race-poller \
  --body '{"raceIds": ["race-id-1", "race-id-2", "race-id-3"]}' \
  --async false

# For async execution (recommended for testing)
appwrite functions createExecution \
  --functionId batch-race-poller \
  --body '{"raceIds": ["race-id-1", "race-id-2", "race-id-3"]}' \
  --async true
```

### Method 3: HTTP Request Testing

```bash
# Using curl (replace with your actual endpoint and project)
curl -X POST "https://cloud.appwrite.io/v1/functions/batch-race-poller/executions" \
  -H "Content-Type: application/json" \
  -H "X-Appwrite-Project: your-project-id" \
  -H "X-Appwrite-Key: your-api-key" \
  -d '{"raceIds": ["race-id-1", "race-id-2", "race-id-3"]}'
```

### Method 4: Using Node.js Script

```javascript
// test-batch-poller.js
import { Client, Functions } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const functions = new Functions(client);

const testRaceIds = [
  "your-race-id-1",
  "your-race-id-2", 
  "your-race-id-3"
];

try {
  const execution = await functions.createExecution(
    'batch-race-poller',
    JSON.stringify({ raceIds: testRaceIds }),
    false, // async
    '/batch-test'
  );
  
  console.log('Execution Result:', execution);
} catch (error) {
  console.error('Test failed:', error);
}
```

## Getting Valid Race IDs for Testing

### Method 1: Database Query
```bash
# Get recent races from your database
appwrite databases listDocuments \
  --databaseId raceday-db \
  --collectionId races \
  --queries 'limit(10)' \
  --queries 'orderDesc("$createdAt")'
```

### Method 2: Server Script
```bash
# Use the server helper script
npm run get-test-race-ids
```

### Method 3: Next.js App
Navigate to your race pages in the app and check the URLs - the race IDs will be in the URL path.

## Monitoring Test Results

### 1. Check Function Logs
```bash
# View function execution logs
appwrite functions listExecutions --functionId batch-race-poller

# Get specific execution details
appwrite functions getExecution --functionId batch-race-poller --executionId [execution-id]
```

### 2. Database Verification
After testing, verify that data was updated:

```bash
# Check entrants were updated
appwrite databases listDocuments \
  --databaseId raceday-db \
  --collectionId entrants \
  --queries 'equal("race", ["your-race-id"])'

# Check odds history was created
appwrite databases listDocuments \
  --databaseId raceday-db \
  --collectionId odds-history \
  --queries 'orderDesc("$createdAt")' \
  --queries 'limit(5)'
```

### 3. Performance Monitoring
Monitor the execution time and resource usage:
- Expected execution time: 15-45 seconds for 3-5 races
- Memory usage should be efficient with shared connections
- API calls should be rate-limited to respect NZ TAB quotas

## Troubleshooting

### Common Issues

1. **"Missing required parameter: raceIds"**
   - Ensure payload includes `raceIds` array
   - Check JSON formatting

2. **"Batch size too large"**
   - Maximum 10 races per batch
   - Split large batches into multiple calls

3. **"No valid races to process"**
   - Check that race IDs exist in database
   - Verify races aren't already finalized

4. **"Race validation failed"**
   - Ensure races exist and are accessible
   - Check database permissions

5. **Timeout Issues**
   - Function has 600s timeout
   - Reduce batch size if hitting timeout

### Debug Mode
Enable detailed logging by adding debug parameter:
```json
{
  "raceIds": ["race-id-1", "race-id-2"],
  "debug": true
}
```

## Performance Expectations

### Normal Operation
- **3 races**: ~15-20 seconds total execution time
- **5 races**: ~25-35 seconds total execution time
- **API rate limiting**: 1.2 seconds between race API calls
- **Success rate**: >95% under normal conditions

### Resource Usage
- **CPU**: Efficient with s-2vcpu specification
- **Memory**: Optimized with connection pooling
- **Network**: Coordinated API calls to prevent rate limiting

## Integration with Next.js Server Actions

This function is designed to be called by Next.js server actions via the intelligent polling coordination system:

```typescript
// Example usage from server action
import { coordinateIntelligentPolling } from '@/app/actions/race-polling';

// This will automatically choose batch vs individual polling
const result = await coordinateIntelligentPolling();
```

## Security Considerations

- Function requires proper API key authentication
- Race validation prevents unauthorized data access
- Error messages sanitized to prevent information leakage
- Rate limiting protects external API quotas

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-08-12 | Initial implementation with batch processing, error isolation, and performance optimization |