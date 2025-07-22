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