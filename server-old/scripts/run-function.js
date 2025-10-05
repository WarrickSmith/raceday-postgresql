#!/usr/bin/env node
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables from parent directory
config({ path: join(__dirname, '../.env') })

const functionName = process.argv[2]
if (!functionName) {
  console.error('❌ Please specify a function name')
  console.error('Examples:')
  console.error('  npm run meetings')
  console.error('  npm run races')
  console.error('  npm run poller')
  console.error('  npm run single-race \'{"raceId":"race-uuid"}\'')
  process.exit(1)
}

// Create mock Appwrite context
const mockContext = {
  log: (message, data = {}) => {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] LOG:`, message)
    if (Object.keys(data).length > 0) {
      console.log('  Data:', JSON.stringify(data, null, 2))
    }
  },
  error: (message, data = {}) => {
    const timestamp = new Date().toISOString()
    console.error(`[${timestamp}] ERROR:`, message)
    if (Object.keys(data).length > 0) {
      console.error('  Data:', JSON.stringify(data, null, 2))
    }
  },
  // Mock HTTP request/response for HTTP-triggered functions
  req: {
    body: process.argv[3] || '{}', // Allow passing JSON payload as 3rd argument
    bodyJson: {},
    headers: {},
    method: 'POST',
  },
  res: {
    json: (data, statusCode = 200) => {
      console.log(
        `📤 HTTP Response (${statusCode}):`,
        JSON.stringify(data, null, 2)
      )
      return data
    },
  },
}

// Validate environment variables
const requiredVars = [
  'APPWRITE_ENDPOINT',
  'APPWRITE_PROJECT_ID',
  'APPWRITE_API_KEY',
]
const missingVars = requiredVars.filter((varName) => !process.env[varName])

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars)
  process.exit(1)
}

console.log(`🚀 Starting ${functionName} locally (non-Docker)...`)

// Parse JSON payload if provided for HTTP functions
if (process.argv[3]) {
  try {
    mockContext.req.bodyJson = JSON.parse(process.argv[3])
    console.log(
      '📥 HTTP Payload:',
      JSON.stringify(mockContext.req.bodyJson, null, 2)
    )
  } catch (error) {
    console.error('❌ Invalid JSON payload provided:', process.argv[3])
    process.exit(1)
  }
}

async function runFunction() {
  try {
    const { default: main } = await import(`../${functionName}/src/main.js`)
    const result = await main(mockContext)
    console.log('✅ Function completed successfully!')
    console.log('📊 Result:', JSON.stringify(result, null, 2))

    // Graceful exit: Allow more time for background processing to complete during local testing
    // Increased from 3s to 15s to ensure deferred background tasks (setImmediate) finish before process exits.
    setTimeout(() => {
      console.log('🔄 Gracefully exiting process...')
      process.exit(0)
    }, 15000)
  } catch (error) {
    console.error('❌ Function execution failed:', error.message)
    if (error.stack) console.error('Stack:', error.stack)
    process.exit(1)
  }
}

runFunction()
