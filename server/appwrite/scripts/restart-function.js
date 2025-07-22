#!/usr/bin/env node
import { execSync } from 'child_process';

const functionId = process.argv[2];
if (!functionId) {
  console.error('Usage: npm run restart:daily or npm run restart:poller');
  process.exit(1);
}

async function restartFunction(functionId) {
  try {
    console.log(`🔄 Restarting function ${functionId} to refresh variables...`);
    
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
    
    console.log('✅ Function restarted successfully!');
    
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

restartFunction(functionId);