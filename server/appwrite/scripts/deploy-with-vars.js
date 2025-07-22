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
    
    // Step 4: Safe restart function to apply variables while preserving schedule
    await safeRestartFunction(functionId);
    
    console.log('🎉 Deployment complete with live environment variables!');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

async function safeRestartFunction(functionId) {
  try {
    console.log(`🔄 Safely restarting function while preserving schedule...`);
    
    // Get current function configuration
    const functionInfo = JSON.parse(await execCommand(`appwrite functions get --function-id ${functionId} --json`, true));
    const currentSchedule = functionInfo.schedule;
    const currentEnabled = functionInfo.enabled;
    
    console.log(`   Current schedule: ${currentSchedule || 'None'}`);
    console.log(`   Current enabled: ${currentEnabled}`);
    
    if (currentSchedule) {
      // Method: Update a non-critical field to force restart
      const currentLogging = functionInfo.logging;
      const functionName = functionInfo.name;
      
      // Toggle logging to force restart
      await execCommand(`appwrite functions update --function-id ${functionId} --name "${functionName}" --logging ${!currentLogging}`);
      console.log('   Toggled logging to force restart...');
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Restore original logging setting
      await execCommand(`appwrite functions update --function-id ${functionId} --name "${functionName}" --logging ${currentLogging}`);
      console.log('   Restored original logging setting...');
      
      // Verify schedule is still intact
      const updatedInfo = JSON.parse(await execCommand(`appwrite functions get --function-id ${functionId} --json`, true));
      
      if (updatedInfo.schedule === currentSchedule) {
        console.log('✅ Function restarted successfully with schedule preserved!');
      } else {
        console.log('⚠️ Schedule may have been affected, restoring...');
        // Restore schedule if it was lost
        await execCommand(`appwrite functions update --function-id ${functionId} --name "${functionName}" --schedule "${currentSchedule}"`);
        console.log('✅ Schedule restored!');
      }
    } else {
      // No schedule to preserve, safe to use enabled toggle
      const functionName = functionInfo.name;
      await execCommand(`appwrite functions update --function-id ${functionId} --name "${functionName}" --enabled false`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      await execCommand(`appwrite functions update --function-id ${functionId} --name "${functionName}" --enabled true`);
      console.log('✅ Function restarted (no schedule to preserve)');
    }
    
    // Optional: Trigger a test execution to verify
    try {
      console.log('🧪 Testing function with new variables...');
      await execCommand(`appwrite functions create-execution --function-id ${functionId} --data '{"deploymentTest": true}'`);
      console.log('✅ Test execution successful!');
    } catch (testError) {
      console.log('⚠️ Test execution failed, but function should be running with new variables');
    }
    
  } catch (error) {
    console.error('⚠️ Safe restart failed:', error.message);
    console.log('💡 Variables updated but may require manual function restart');
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