#!/usr/bin/env node
import { execSync } from 'child_process';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error('❌ Missing required environment variables in .env file:');
  console.error('   - APPWRITE_ENDPOINT');
  console.error('   - APPWRITE_PROJECT_ID');
  console.error('   - APPWRITE_API_KEY');
  process.exit(1);
}

console.log('🔑 Configuring Appwrite CLI...');
console.log(`📍 Endpoint: ${endpoint}`);
console.log(`🏗️  Project: ${projectId}`);

try {
  const command = `appwrite client --endpoint "${endpoint}" --project-id "${projectId}" --key "${apiKey}"`;
  execSync(command, { stdio: 'inherit' });
  console.log('✅ Appwrite CLI configured successfully!');
} catch (error) {
  console.error('❌ Failed to configure Appwrite CLI:', error.message);
  process.exit(1);
}