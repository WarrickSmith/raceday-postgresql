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