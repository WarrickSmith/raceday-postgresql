#!/usr/bin/env node
import { execSync } from 'child_process';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const email = process.env.APPWRITE_EMAIL;
const password = process.env.APPWRITE_PASSWORD;

if (!endpoint || !projectId || !email || !password) {
  console.error('❌ Missing required environment variables in .env file:');
  console.error('   - APPWRITE_ENDPOINT');
  console.error('   - APPWRITE_PROJECT_ID');
  console.error('   - APPWRITE_EMAIL');
  console.error('   - APPWRITE_PASSWORD');
  process.exit(1);
}

console.log('🔑 Logging into Appwrite CLI...');
console.log(`📍 Endpoint: ${endpoint}`);
console.log(`🏗️  Project: ${projectId}`);
console.log(`👤 Email: ${email}`);

try {
  // Set client configuration
  console.log('⚙️  Setting client configuration...');
  const clientCommand = `appwrite client --endpoint "${endpoint}" --project-id "${projectId}"`;
  execSync(clientCommand, { stdio: 'inherit' });
  
  // Login with user credentials
  console.log('🔐 Authenticating with user credentials...');
  const loginCommand = `appwrite login --email "${email}" --password "${password}"`;
  execSync(loginCommand, { stdio: 'inherit' });
  
  console.log('✅ Appwrite CLI login successful!');
} catch (error) {
  console.error('❌ Failed to login to Appwrite CLI:', error.message);
  process.exit(1);
}