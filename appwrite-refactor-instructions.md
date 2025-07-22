# Appwrite Functions Refactoring Instructions

## Objective
Refactor the current duplicated Appwrite function structure to eliminate code duplication, consolidate npm scripts, and create a streamlined development and deployment workflow.

## Current Structure Analysis
```
server/
├── daily-race-importer/
│   ├── functions/daily-race-importer/
│   ├── node_modules/
│   ├── .env, package.json, etc.
└── race-data-poller/
    ├── node_modules/
    ├── .env, package.json, etc.
```

## Target Structure
```
server/
└── appwrite/
    ├── functions/
    │   ├── daily-race-importer/
    │   │   ├── src/
    │   │   │   ├── main.js
    │   │   │   └── database-setup.js
    │   │   └── package.json (function-specific)
    │   └── race-data-poller/
    │       ├── src/
    │       │   └── main.js
    │       └── package.json (function-specific)
    ├── shared/
    │   └── utils/
    │       └── database-setup.js (shared utilities)
    ├── node_modules/
    ├── appwrite.json (single consolidated config)
    ├── .env
    ├── .env.example
    ├── package.json (root package with scripts)
    └── README.md
```

## Step-by-Step Refactoring Instructions

### 1. Create New Directory Structure
```bash
# Create the new consolidated structure
mkdir -p server/appwrite/functions/daily-race-importer/src
mkdir -p server/appwrite/functions/race-data-poller/src
mkdir -p server/appwrite/shared/utils
mkdir -p server/appwrite/scripts
```

### 2. Move and Consolidate Function Code

### 2. Move and Consolidate Function Code

#### Daily Race Importer:
- Move `server/daily-race-importer/functions/daily-race-importer/src/main.js` → `server/appwrite/functions/daily-race-importer/src/main.js`
- Move `server/daily-race-importer/functions/daily-race-importer/src/database-setup.js` → `server/appwrite/shared/utils/database-setup.js` (for sharing)
- Update import in main.js: `import { ensureDatabaseSetup } from '../../shared/utils/database-setup.js';`

#### Race Data Poller:
- Move `server/race-data-poller/src/main.js` → `server/appwrite/functions/race-data-poller/src/main.js`
- Update any imports to use shared utilities from `../../shared/utils/`

### 3. Create Consolidated Package.json
Create `server/appwrite/package.json`:

```json
{
  "name": "appwrite-functions",
  "version": "1.0.0",
  "description": "Consolidated Appwrite functions for RaceDay application",
  "type": "module",
  "scripts": {
    "install-cli": "npm install -g appwrite-cli",
    "login": "node scripts/login.js",
    "logout": "appwrite logout",
    "status": "appwrite functions list",
    "deploy": "appwrite push functions",
    "deploy:daily": "appwrite push functions --function-id daily-race-importer",
    "deploy:poller": "appwrite push functions --function-id race-data-poller",
    "daily": "node scripts/run-function.js daily-race-importer",
    "poller": "node scripts/run-function.js race-data-poller",
    "execute": "node scripts/execute-function.js"
  },
  "dependencies": {
    "node-appwrite": "^17.0.0",
    "dotenv": "^16.0.0"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

### 4. Create Individual Function Package.json Files
Each function needs a minimal package.json for deployment:

#### `server/appwrite/functions/daily-race-importer/package.json`:
```json
{
  "name": "daily-race-importer",
  "version": "1.0.0",
  "type": "module",
  "main": "src/main.js",
  "dependencies": {
    "node-appwrite": "^17.0.0"
  }
}
```

#### `server/appwrite/functions/race-data-poller/package.json`:
```json
{
  "name": "race-data-poller", 
  "version": "1.0.0",
  "type": "module",
  "main": "src/main.js",
  "dependencies": {
    "node-appwrite": "^17.0.0"
  }
}
```

### 5. Create Single Consolidated appwrite.json
Create `server/appwrite/appwrite.json` (following current best practices):

```json
{
  "projectId": "racedaytest250701",
  "projectName": "RaceDayTest", 
  "functions": [
    {
      "$id": "daily-race-importer",
      "name": "Daily Race Importer",
      "runtime": "node-22",
      "path": "functions/daily-race-importer",
      "execute": ["any"],
      "events": [],
      "schedule": "0 17 * * *",
      "timeout": 300,
      "enabled": true,
      "logging": true,
      "entrypoint": "src/main.js",
      "commands": "npm install",
      "scopes": [
        "databases.read",
        "databases.write",
        "collections.read", 
        "collections.write",
        "attributes.read",
        "attributes.write",
        "indexes.read",
        "indexes.write",
        "documents.read",
        "documents.write"
      ]
    },
    {
      "$id": "race-data-poller", 
      "name": "Race Data Poller",
      "runtime": "node-22",
      "path": "functions/race-data-poller",
      "execute": ["any"],
      "events": [],
      "schedule": "*/5 * * * *",
      "timeout": 300,
      "enabled": true,
      "logging": true,
      "entrypoint": "src/main.js", 
      "commands": "npm install",
      "scopes": [
        "databases.read",
        "databases.write",
        "documents.read",
        "documents.write"
      ]
    }
  ]
}
```

### 6. Create Non-Docker Local Runner Scripts

#### `server/appwrite/scripts/run-function.js`:
```javascript
#!/usr/bin/env node
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from parent directory
config({ path: join(__dirname, '../.env') });

const functionName = process.argv[2];
if (!functionName) {
  console.error('❌ Please specify a function name: npm run daily OR npm run poller');
  process.exit(1);
}

// Create mock Appwrite context
const mockContext = {
  log: (message, data = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] LOG:`, message);
    if (Object.keys(data).length > 0) {
      console.log('  Data:', JSON.stringify(data, null, 2));
    }
  },
  error: (message, data = {}) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ERROR:`, message);
    if (Object.keys(data).length > 0) {
      console.error('  Data:', JSON.stringify(data, null, 2));
    }
  }
};

// Validate environment variables
const requiredVars = ['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  process.exit(1);
}

console.log(`🚀 Starting ${functionName} locally (non-Docker)...`);

async function runFunction() {
  try {
    const { default: main } = await import(`../functions/${functionName}/src/main.js`);
    const result = await main(mockContext);
    console.log('✅ Function completed successfully!');
    console.log('📊 Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Function execution failed:', error.message);
    if (error.stack) console.error('Stack:', error.stack);
    process.exit(1);
  }
}

runFunction();
```

### 7. Create Utility Scripts

#### `server/appwrite/scripts/login.js`:
```javascript
#!/usr/bin/env node
import { execSync } from 'child_process';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '../.env') });

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const email = process.env.APPWRITE_EMAIL;
const password = process.env.APPWRITE_PASSWORD;

if (!endpoint || !projectId || !email || !password) {
  console.error('❌ Missing required environment variables in .env file');
  process.exit(1);
}

try {
  console.log('🔑 Logging into Appwrite CLI...');
  execSync(`appwrite client --endpoint "${endpoint}" --project-id "${projectId}"`, { stdio: 'inherit' });
  execSync(`appwrite login --email "${email}" --password "${password}"`, { stdio: 'inherit' });
  console.log('✅ Appwrite CLI login successful!');
} catch (error) {
  console.error('❌ Failed to login:', error.message);
  process.exit(1);
}
```

#### `server/appwrite/scripts/execute-function.js`:
```javascript
#!/usr/bin/env node
import { execSync } from 'child_process';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '../.env') });

try {
  console.log('📋 Fetching available functions...');
  const output = execSync('appwrite functions list', { encoding: 'utf8' });
  console.log(output);
  
  console.log('\n🎯 Available quick execution commands:');
  console.log('  npm run daily     - Run daily-race-importer locally');
  console.log('  npm run poller    - Run race-data-poller locally');
  console.log('\n📡 To execute remotely, use:');
  console.log('  appwrite functions create-execution --function-id <function-id>');
  
} catch (error) {
  console.error('❌ Failed to list functions:', error.message);
  process.exit(1);
}
```

### 8. Create Consolidated Environment Files

#### `server/appwrite/.env.example`:
```bash
# Appwrite Configuration
APPWRITE_ENDPOINT=https://your-appwrite-instance.com/v1
APPWRITE_PROJECT_ID=your_project_id_here

# Appwrite User Credentials (for CLI deployment operations)
APPWRITE_EMAIL=your_email@example.com
APPWRITE_PASSWORD=your_password_here

# Appwrite API Key (for function runtime operations)
APPWRITE_API_KEY=your_api_key_here

# NZTAB API Configuration
NZTAB_API_BASE_URL=https://api.tab.co.nz
```

### 9. Create Consolidated README

#### `server/appwrite/README.md`:
```markdown
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
```

### 10. Migration Steps

1. **Create the new structure** as outlined above
2. **Move existing code** from both function directories to the new consolidated structure:
   - Move function source files to `functions/[function-name]/src/`
   - Move shared utilities to `shared/utils/`
   - Update import paths in function files
3. **Copy .env file** from either existing function directory to `server/appwrite/.env`
4. **Install dependencies** in the root: `cd server/appwrite && npm install`
5. **Update shared imports** in function files to use relative paths to `../../shared/utils/`
6. **Test locally** using `npm run daily` and `npm run poller` (non-Docker)
7. **Deploy** using `npm run deploy` (single appwrite.json configuration)
8. **Verify deployment** using `npm run status`
9. **Clean up** old directories after successful migration

### 11. Key Differences from Docker Approach

- **No Docker dependency**: Local functions run directly with Node.js
- **Single appwrite.json**: Follows current best practices for multi-function projects
- **Shared utilities**: Code reuse through relative imports instead of Docker volumes
- **Individual function package.json**: Each function has minimal package.json for deployment
- **Simplified local testing**: Direct Node.js execution with mock context

## Benefits Achieved

✅ **Single configuration file** - Follows 2024 best practices  
✅ **Shared code reuse** - Without Docker complexity  
✅ **server/appwrite/functions structure** - As requested  
✅ **Consolidated .env management** - Single source of truth  
✅ **Streamlined npm scripts** - Short, memorable commands  
✅ **Local testing capability** - No Docker required  
✅ **Modern deployment** - Single appwrite.json approach  
✅ **CLI management scripts** - Login, status, logout functionality the new consolidated structure
3. **Copy .env file** from either existing function directory to the new root
4. **Test locally** using `npm run daily` and `npm run poller`
5. **Deploy** using `npm run deploy`
6. **Verify deployment** using `npm run status`
7. **Clean up** old directories after successful migration

### 10. Environment Variable Deployment

The deployment process will automatically handle environment variables. The Appwrite CLI will prompt for function selection and deploy all configured environment variables from your `.env` file.

## Benefits Achieved

✅ **Single package.json and node_modules** - Eliminates duplication
✅ **Consolidated .env management** - Single source of truth
✅ **Streamlined npm scripts** - Short, memorable commands
✅ **Local testing capability** - Easy function testing
✅ **Automated deployment** - With environment variable handling
✅ **CLI management scripts** - Login, status, logout functionality
✅ **Generic execution script** - Lists and executes any function

This structure provides a clean, maintainable foundation for your Appwrite functions with minimal duplication and maximum efficiency.