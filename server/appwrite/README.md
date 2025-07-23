# Appwrite Functions

Consolidated Appwrite functions for the RaceDay application.

## Functions

- **daily-race-importer**: Imports race data daily at 6:00 AM NZ time (CRON: `0 17 * * *`)
- **race-data-poller**: Polls for race data updates every 5 minutes during race hours (CRON: `*/5 21-23,0-11 * * *`)

## Setup

1. Install dependencies: `npm install`
2. Install Appwrite CLI globally: `npm run install-cli`
3. Copy `.env.example` to `.env` and configure your values
4. Login to Appwrite: `npm run login`

## Local Development

- Run daily importer locally: `npm run daily`
- Run race poller locally: `npm run poller`

Local development uses Node.js directly with mock Appwrite context for testing.

## Deployment

### CLI-Based Deployment (Recommended)

Deploy functions with configuration:

```bash
npm run deploy:daily     # Deploy daily-race-importer
npm run deploy:poller    # Deploy race-data-poller
npm run deploy          # Deploy all functions (basic)
```

The deployment script (`scripts/deploy.js`) performs:
1. Deploys function code and configuration from `appwrite.json`
2. Preserves CRON schedules, scopes, and timeout settings

### Environment Variables Setup Required

**Important**: After deployment, you must configure environment variables. Choose one option:

**Option 1 (Recommended): Global Project Variables**
1. Go to Appwrite Console → Project Settings → Variables
2. Add your environment variables globally (applies to all functions)

**Option 2: Function-specific Variables** 
1. Go to Appwrite Console → Functions → [Your Function] → Variables
2. Add environment variables specific to each function

Using global project variables is recommended as it simplifies management across multiple functions.

## Environment Variables Management

With global project variables configured in the Appwrite console, environment variables are automatically available to all functions. No additional deployment steps are required for variable updates.

If you need to update variables for individual functions only:

```bash
npm run vars:daily      # Update daily-race-importer variables
npm run vars:poller     # Update race-data-poller variables  
npm run vars:all        # Update all function variables
```

**Note**: These scripts are primarily for legacy support. Global project variables are the recommended approach.

## Function Configuration

All function settings are managed via `appwrite.json`:
- CRON schedules
- Database scopes and permissions
- Timeout settings (300s)
- Runtime configuration (node-22)
- Entry points and build commands

**Important**: Avoid using restart scripts as they reset permissions and timeout settings.

## Management

- Check function status: `npm run status`
- Execute functions remotely: `npm run execute`
- Logout from CLI: `npm run logout`