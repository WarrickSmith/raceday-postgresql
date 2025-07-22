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
  console.error('Usage: npm run deploy:daily or npm run deploy:poller');
  process.exit(1);
}

async function deployWithVariables() {
  try {
    console.log(`🚀 Deploying function: ${functionId}`);
    
    // Deploy function first
    execSync(`appwrite push functions --function-id ${functionId}`, { stdio: 'inherit' });
    
    console.log('📋 Updating environment variables...');
    
    // Parse .env file and update variables individually
    const envPath = join(__dirname, '../.env');
    const envContent = readFileSync(envPath, 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          // Skip deployment-only variables that shouldn't be in function runtime
          const keyName = key.trim();
          if (!['APPWRITE_EMAIL', 'APPWRITE_PASSWORD'].includes(keyName)) {
            envVars[keyName] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
          }
        }
      }
    });
    
    // Update variables without redeploying
    for (const [key, value] of Object.entries(envVars)) {
      try {
        // Try to create new variable first (most common case)
        await execCommand(`appwrite functions create-variable --function-id ${functionId} --key "${key}" --value "${value}"`);
        console.log(`   ✅ Created ${key}`);
      } catch (error) {
        // If create fails, try to update existing variable
        try {
          // List variables to get the variable ID
          const listOutput = await execCommand(`appwrite functions list-variables --function-id ${functionId} --json`, true);
          const variables = JSON.parse(listOutput);
          const existingVar = variables.variables?.find(v => v.key === key);
          
          if (existingVar) {
            await execCommand(`appwrite functions update-variable --function-id ${functionId} --variable-id ${existingVar.$id} --value "${value}"`);
            console.log(`   ✅ Updated ${key}`);
          } else {
            console.log(`   ⚠️ Failed to set ${key}: Variable not found`);
          }
        } catch (updateError) {
          console.log(`   ⚠️ Failed to set ${key}: ${updateError.message}`);
        }
      }
    }
    
    // Step 4: Restart function to apply variables immediately
    await restartFunction(functionId);
    
    console.log('🎉 Deployment complete with live environment variables!');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

async function restartFunction(functionId) {
  try {
    console.log(`🔄 Restarting function to apply new variables...`);
    
    // Get current function info to preserve settings
    const functionInfo = JSON.parse(await execCommand(`appwrite functions get --function-id ${functionId} --json`, true));
    
    // Toggle enabled status to force restart
    await execCommand(`appwrite functions update --function-id ${functionId} --name "${functionInfo.name}" --enabled false`);
    console.log('   Function disabled...');
    
    // Wait for the change to take effect
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await execCommand(`appwrite functions update --function-id ${functionId} --name "${functionInfo.name}" --enabled true`);
    console.log('   Function re-enabled...');
    
    // Wait for restart
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('✅ Function restarted with new variables live!');
    
    // Optional: Trigger a test execution to verify
    try {
      console.log('🧪 Testing function with new variables...');
      await execCommand(`appwrite functions create-execution --function-id ${functionId} --data '{"deploymentTest": true}'`);
      console.log('✅ Test execution successful!');
    } catch (testError) {
      console.log('⚠️ Test execution failed, but function should be running with new variables');
    }
    
  } catch (error) {
    console.error('⚠️ Failed to restart function:', error.message);
    console.log('💡 You may need to manually restart the function in the Appwrite console');
  }
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

deployWithVariables();