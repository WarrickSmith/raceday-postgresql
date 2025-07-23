#!/usr/bin/env node
import { execSync } from 'child_process';

const functionId = process.argv[2];
if (!functionId) {
  console.error('Usage: npm run deploy:daily or npm run deploy:poller');
  process.exit(1);
}

async function deployFunction() {
  try {
    console.log('🚀 Deploying function...');
    
    // Deploy function configuration from appwrite.json
    console.log('📦 Deploying function configuration from appwrite.json...');
    execSync(`echo "YES" | appwrite push functions --function-id ${functionId}`, { stdio: 'inherit' });
    
    console.log('✅ Deployment complete!');
    console.log('');
    console.log('⚠️  IMPORTANT: Environment Variables Setup Required');
    console.log('');
    console.log('📋 To configure environment variables, choose ONE of the following options:');
    console.log('');
    console.log('   Option 1 (Recommended): Global Project Variables');
    console.log('   • Go to Appwrite Console → Project Settings → Variables');
    console.log('   • Add your environment variables globally (applies to all functions)');
    console.log('');
    console.log('   Option 2: Function-specific Variables');
    console.log('   • Go to Appwrite Console → Functions → [Your Function] → Variables');
    console.log('   • Add environment variables specific to this function');
    console.log('');
    console.log('🎯 Verify in Appwrite console that scopes, schedule, and variables are correct');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

deployFunction();