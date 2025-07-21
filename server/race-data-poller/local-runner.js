import main from './src/main.js';
import dotenv from 'dotenv';

// Load environment variables from .env file if it exists
dotenv.config();

// Mock Appwrite function context for local development
const mockContext = {
  log: (...args) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] LOG:`, ...args);
  },
  error: (...args) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ERROR:`, ...args);
  },
  req: {
    method: 'GET',
    headers: {},
    query: {},
    body: '{}'
  },
  res: {
    json: (data) => console.log('Response:', JSON.stringify(data, null, 2)),
    send: (data) => console.log('Response:', data)
  }
};

// Set default environment variables for local testing
process.env.APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://appwrite.warricksmith.com/v1';
process.env.APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID || 'racedaytest250701';
process.env.NZTAB_API_BASE_URL = process.env.NZTAB_API_BASE_URL || 'https://api.tab.co.nz';

console.log('🏁 Starting Race Data Poller (Local Development Mode)');
console.log('Environment:');
console.log('- APPWRITE_ENDPOINT:', process.env.APPWRITE_ENDPOINT);
console.log('- APPWRITE_PROJECT_ID:', process.env.APPWRITE_PROJECT_ID);
console.log('- NZTAB_API_BASE_URL:', process.env.NZTAB_API_BASE_URL);
console.log('- APPWRITE_API_KEY:', process.env.APPWRITE_API_KEY ? '[SET]' : '[NOT SET]');
console.log('');

if (!process.env.APPWRITE_API_KEY) {
  console.error('⚠️  WARNING: APPWRITE_API_KEY is not set. The function will fail when trying to connect to the database.');
  console.error('   Set this environment variable or create a .env file with your API key.');
  console.log('');
}

try {
  const result = await main(mockContext);
  console.log('');
  console.log('✅ Function completed successfully');
  console.log('Final result:', JSON.stringify(result, null, 2));
} catch (error) {
  console.log('');
  console.error('❌ Function failed with error:', error.message);
  if (error.stack) {
    console.error('Stack trace:', error.stack);
  }
  process.exit(1);
}