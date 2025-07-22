# Appwrite Functions

Consolidated Appwrite functions for the RaceDay application following 2024 best practices.

## Functions

- **daily-race-importer**: Imports race data daily at 6:00 AM NZ time
- **race-data-poller**: Polls for race data updates every 5 minutes

## Structure

This project uses the recommended single `appwrite.json` configuration with shared utilities in the `shared/` directory. Functions are organized by business domain rather than technical concerns.

## Setup

1. Install dependencies: `npm install`
2. Install Appwrite CLI globally: `npm run install-cli`
3. Copy `.env.example` to `.env` and configure your values
4. Login to Appwrite: `npm run login`

## Local Development (Non-Docker)

- Run daily importer locally: `npm run daily`
- Run race poller locally: `npm run poller`

Local development uses Node.js directly (no Docker) with mock Appwrite context for testing.

## Deployment

- Deploy all functions: `npm run deploy` 
- Deploy specific function: `npm run deploy:daily` or `npm run deploy:poller`

The single `appwrite.json` manages all function configurations and deployments.

## Management

- Check function status: `npm run status`
- Execute functions remotely: `npm run execute`
- Logout from CLI: `npm run logout`

## Shared Code

Shared utilities like database setup are in `shared/utils/` and imported using relative paths. This avoids Docker requirements while enabling code reuse.