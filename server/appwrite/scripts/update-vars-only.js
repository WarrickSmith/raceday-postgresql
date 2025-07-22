#!/usr/bin/env node
import { execSync } from 'child_process';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '../.env') });

const functionId = process.argv[2];
if (!functionId) {
  console.error('Usage: npm run vars:daily or npm run vars:poller');
  process.exit(1);
}

async function updateVariablesOnly() {
  console.log(`📋 Updating environment variables for ${functionId} (no redeploy)...`);
  
  // Parse .env and update variables
  const envPath = join(__dirname, '../.env');
  const envContent = readFileSync(envPath, 'utf8');
  const envVars = {};
  
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  });
  
  for (const [key, value] of Object.entries(envVars)) {
    try {
      // Try to create new variable first
      await execCommand(`appwrite functions create-variable --function-id ${functionId} --key "${key}" --value "${value}"`);
      console.log(`   ✅ Created ${key}`);
    } catch (error) {
      // Variable might exist, try update
      try {
        // List variables to get the variable ID
        const listOutput = await execCommand(`appwrite functions list-variables --function-id ${functionId}`, true);
        const variables = JSON.parse(listOutput);
        const existingVar = variables.variables?.find(v => v.key === key);
        
        if (existingVar) {
          await execCommand(`appwrite functions update-variable --function-id ${functionId} --variable-id ${existingVar.$id} --value "${value}"`);
          console.log(`   ✅ Updated ${key}`);
        } else {
          console.log(`   ⚠️ Variable ${key} not found for update`);
        }
      } catch (updateError) {
        console.log(`   ⚠️ Failed to set ${key}: ${updateError.message}`);
      }
    }
  }
  
  console.log('✅ Variables updated without function redeployment!');
}

function execCommand(command, returnOutput = false) {
  return new Promise((resolve, reject) => {
    try {
      const result = execSync(command, { stdio: returnOutput ? 'pipe' : 'pipe' });
      resolve(returnOutput ? result.toString() : undefined);
    } catch (error) {
      reject(error);
    }
  });
}

updateVariablesOnly();