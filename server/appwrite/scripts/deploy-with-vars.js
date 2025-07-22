#!/usr/bin/env node
import { execSync } from 'child_process';
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '../.env') });

const functionId = process.argv[2];
if (!functionId) {
  console.error('Usage: npm run deploy:daily or npm run deploy:poller');
  process.exit(1);
}

async function deployWithPreservedConfig() {
  try {
    console.log('🚀 Deploying function with preserved configuration...');
    
    // Step 1: Deploy function first (preserves scopes, schedule, timeout from appwrite.json)
    console.log('📦 Deploying function configuration from appwrite.json...');
    execSync(`echo "YES" | appwrite push functions --function-id ${functionId}`, { stdio: 'inherit' });
    
    // Step 2: Add environment variables via CLI (without restart)
    console.log('📋 Adding environment variables...');
    const envVars = parseEnvFile(join(__dirname, '../.env'));
    
    for (const [key, value] of Object.entries(envVars)) {
      try {
        // Try to create new variable first (most common case)
        await execCommand(`appwrite functions create-variable --function-id ${functionId} --key "${key}" --value "${value}"`);
        console.log(`   ✅ Created ${key}`);
      } catch (error) {
        // If create fails, try to update existing variable
        try {
          const listOutput = await execCommand(`appwrite functions list-variables --function-id ${functionId} --json`, true);
          const variables = JSON.parse(listOutput);
          const existingVar = variables.variables?.find(v => v.key === key);
          
          if (existingVar) {
            await execCommand(`appwrite functions update-variable --function-id ${functionId} --variable-id ${existingVar.$id} --key "${key}" --value "${value}"`);
            console.log(`   ✅ Updated ${key}`);
          } else {
            console.log(`   ⚠️ Failed to set ${key}: Variable not found`);
          }
        } catch (updateError) {
          console.log(`   ⚠️ Failed to set ${key}: ${updateError.message}`);
        }
      }
    }
    
    console.log('✅ Deployment complete!');
    console.log('💡 Function deployed with preserved configuration - no restart needed');
    console.log('🎯 Check Appwrite console to verify scopes, schedule, and variables are all correct');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

function parseEnvFile(filePath) {
  const envContent = readFileSync(filePath, 'utf8');
  const envVars = {};
  
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const keyName = key.trim();
        // Skip deployment-only variables that shouldn't be in function runtime
        if (!['APPWRITE_EMAIL', 'APPWRITE_PASSWORD'].includes(keyName)) {
          envVars[keyName] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    }
  });
  
  return envVars;
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

deployWithPreservedConfig();