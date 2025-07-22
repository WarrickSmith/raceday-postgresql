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

Deploy functions with configuration and environment variables:

```bash
npm run deploy:daily     # Deploy daily-race-importer
npm run deploy:poller    # Deploy race-data-poller
npm run deploy          # Deploy all functions (basic)
```

The deployment script (`scripts/deploy-with-vars.js`) performs:
1. Deploys function code and configuration from `appwrite.json`
2. Adds environment variables from `.env` file
3. Preserves CRON schedules, scopes, and timeout settings

### Post-Deployment Step Required

After deploying via CLI, you must manually **redeploy the function** in the Appwrite console to activate the latest configuration. This is a known limitation of the CLI deployment process.

1. Go to Appwrite Functions console
2. Select your deployed function
3. Click "Redeploy" or "Deploy" to activate the latest configuration
4. Verify the function shows as "Live"

## Environment Variables Management

Update environment variables only (without full deployment):

```bash
npm run vars:daily      # Update daily-race-importer variables
npm run vars:poller     # Update race-data-poller variables  
npm run vars:all        # Update all function variables
```

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