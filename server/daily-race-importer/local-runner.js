import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: `${__dirname}/.env` });

// Create a mock Appwrite context that matches the function signature
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
  },
  
  debug: (message, data = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] DEBUG:`, message);
    if (Object.keys(data).length > 0) {
      console.log('  Data:', JSON.stringify(data, null, 2));
    }
  },
  
  // Add other context properties if needed
  req: {},
  res: {}
};

// Validate required environment variables
const requiredVars = [
  'APPWRITE_ENDPOINT',
  'APPWRITE_PROJECT_ID', 
  'APPWRITE_API_KEY'
];

console.log('🔧 Checking environment variables...');
const missingVars = requiredVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  console.error('Please ensure your .env file contains all required variables.');
  process.exit(1);
}

console.log('✅ All required environment variables found');
console.log('📊 Starting Daily Race Import Function locally...');
console.log('─'.repeat(60));

async function runFunction() {
  try {
    // Import the main function
    const { default: main } = await import('./dist/main.js');
    
    // Execute the function with mock context
    const result = await main(mockContext);
    
    console.log('─'.repeat(60));
    console.log('✅ Function execution completed successfully!');
    console.log('📊 Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.log('─'.repeat(60));
    console.error('❌ Function execution failed:');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run the function
runFunction();