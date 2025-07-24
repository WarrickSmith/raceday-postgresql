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
    const { default: main } = await import(`../${functionName}/src/main.js`);
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