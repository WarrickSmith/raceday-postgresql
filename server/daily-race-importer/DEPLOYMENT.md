# Daily Race Importer - Deployment Guide

This guide covers the available deployment methods for the daily race importer function.

## Prerequisites

1. **Appwrite CLI**: Install globally if not already installed
   ```bash
   npm install -g appwrite-cli
   ```

2. **Environment Variables**: Configure your Appwrite credentials
   ```bash
   export APPWRITE_ENDPOINT="https://cloud.appwrite.io/v1"
   export APPWRITE_PROJECT_ID="your-project-id"
   export APPWRITE_API_KEY="your-api-key"
   ```

3. **Appwrite CLI Configuration**: Configure the CLI (one-time setup)
   ```bash
   appwrite client \
     --endpoint $APPWRITE_ENDPOINT \
     --project-id $APPWRITE_PROJECT_ID \
     --key $APPWRITE_API_KEY
   ```

## Deployment Methods

### Method 1: NPM Scripts (Recommended)

We've added several deployment scripts to `package.json`:

#### Deploy Function
```bash
npm run deploy
```
- Builds the TypeScript code
- Interactive deployment with function selection/creation
- Uses the latest `appwrite push functions` command
- Handles both initial deployment and updates

#### Check Function Status
```bash
npm run deploy:check
```
- Lists all functions in your Appwrite project
- Useful for verifying function existence and configuration
- Validates your CLI connection without deploying

### Method 2: Manual CLI Commands

#### Build and Deploy
```bash
# Build the function
npm run build

# Deploy using Appwrite CLI (interactive)
appwrite push functions
```

#### Check Function Status
```bash
appwrite functions get --function-id daily-race-importer
```

### Method 3: Deployment Script

Use the provided deployment script for more control:

```bash
# Standard deployment
./deploy.sh

# Validation check (verify configuration)
./deploy.sh --dry-run

# View help
./deploy.sh --help
```

## Deployment Process

When you run any deployment method, the following happens:

1. **Build**: TypeScript code is compiled to JavaScript in the `dist/` directory
2. **Package**: Appwrite CLI packages the function code and dependencies
3. **Upload**: Function is uploaded to your Appwrite project
4. **Deploy**: Function is deployed and becomes available for execution

## Environment Configuration

### Required Environment Variables
- `APPWRITE_ENDPOINT`: Your Appwrite instance URL
- `APPWRITE_PROJECT_ID`: Your project ID from Appwrite console
- `APPWRITE_API_KEY`: API key with function deployment permissions

### Function Environment Variables
The function itself requires these environment variables to be set in Appwrite:
- `APPWRITE_ENDPOINT`: Appwrite endpoint for database operations
- `APPWRITE_PROJECT_ID`: Project ID for database operations  
- `APPWRITE_API_KEY`: API key for database operations
- `NZTAB_API_BASE_URL`: (Optional) NZTAB API base URL

## Verification

After deployment, verify the function is working:

1. **Check Function Status** in Appwrite Console
2. **View Logs** in the Functions section
3. **Test Execution** by triggering the function manually
4. **Monitor Scheduled Execution** (6:00 AM NZ time daily)

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify API key has correct permissions
   - Check endpoint and project ID are correct

2. **Build Failures**
   - Run `npm run build` locally to check for TypeScript errors
   - Ensure all dependencies are installed

3. **Deployment Timeouts**
   - Check network connection
   - Try deploying during off-peak hours

4. **Function Runtime Errors**
   - Check function logs in Appwrite Console
   - Verify environment variables are set correctly

### Debug Commands

```bash
# Check CLI configuration
appwrite client

# List all functions
appwrite functions list

# Get function details
appwrite functions get --function-id daily-race-importer

# View function executions and logs
appwrite functions list-executions --function-id daily-race-importer
```

## Security Best Practices

1. **API Key Security**
   - Use environment variables, never commit API keys
   - Rotate API keys regularly (every 1-3 months)
   - Grant minimal required permissions

2. **Deployment Security**
   - Only deploy from trusted environments
   - Use secure CI/CD pipelines for production deployments
   - Monitor deployment logs for unauthorized access

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run deploy` | Deploy functions interactively |
| `npm run deploy:check` | List functions and check CLI connection |
| `./deploy.sh` | Full deployment with validation |
| `./deploy.sh --dry-run` | Validate configuration without deploying |