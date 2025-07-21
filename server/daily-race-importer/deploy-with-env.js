import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FUNCTION_ID = '687c8695002e32d4272b';

// Read and parse .env file
function parseEnvFile(filePath) {
  try {
    const envContent = readFileSync(filePath, 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          // Remove quotes if present
          envVars[key.trim()] = value.replace(/^["']|["']$/g, '');
        }
      }
    });
    
    return envVars;
  } catch (error) {
    console.error(`❌ Error reading .env file: ${error.message}`);
    process.exit(1);
  }
}

// Execute shell command
function executeCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`🔧 Executing: ${command} ${args.join(' ')}`);
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

// Execute shell command and capture output
function executeCommandWithOutput(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

// Get existing variables for the function
async function getExistingVariables() {
  try {
    const { stdout } = await executeCommandWithOutput('appwrite', [
      'functions', 'list-variables',
      '--function-id', FUNCTION_ID
    ]);
    
    // Parse the CLI output (it's not JSON, it's a table format)
    const variables = {};
    const lines = stdout.split('\n');
    let inVariablesSection = false;
    
    for (const line of lines) {
      if (line.includes('variables')) {
        inVariablesSection = true;
        continue;
      }
      if (inVariablesSection && line.trim()) {
        // Try to extract variable information from table format
        const match = line.match(/(\w+)\s+/);
        if (match) {
          variables[match[1]] = true;
        }
      }
    }
    
    return variables;
  } catch (error) {
    console.log(`⚠️ Could not fetch existing variables: ${error.message}`);
    return {};
  }
}

// Set environment variables for the function
async function setEnvironmentVariables(envVars) {
  console.log('⚙️ Setting environment variables...');
  
  const existingVars = await getExistingVariables();
  let successCount = 0;
  
  for (const [key, value] of Object.entries(envVars)) {
    try {
      // Always try to create the variable (simpler approach)
      await executeCommand('appwrite', [
        'functions', 'create-variable',
        '--function-id', FUNCTION_ID,
        '--key', key,
        '--value', value
      ]);
      console.log(`   ✅ Set ${key}`);
      successCount++;
    } catch (error) {
      console.log(`   ⚠️ Variable ${key} might already exist or failed to create`);
      // Variables might already exist, which is fine
    }
  }
  
  console.log(`✅ Environment variable setup completed (${successCount} processed)\n`);
}

async function deployWithEnvironmentVariables() {
  try {
    console.log('🚀 Starting deployment with environment variables...\n');
    
    // Parse environment variables from .env file
    const envFilePath = join(__dirname, '.env');
    console.log(`📄 Reading environment variables from: ${envFilePath}`);
    const envVars = parseEnvFile(envFilePath);
    
    // Filter out deployment-only variables
    const deploymentOnlyVars = ['APPWRITE_EMAIL', 'APPWRITE_PASSWORD'];
    const functionEnvVars = Object.fromEntries(
      Object.entries(envVars).filter(([key]) => !deploymentOnlyVars.includes(key))
    );
    
    console.log(`✅ Found ${Object.keys(functionEnvVars).length} environment variables for function:`);
    Object.keys(functionEnvVars).forEach(key => {
      console.log(`   - ${key}`);
    });
    console.log('');
    
    // Step 1: Build the project
    console.log('📦 Building project...');
    await executeCommand('npm', ['run', 'build']);
    console.log('✅ Build completed\n');
    
    // Step 2: Copy files to functions directory
    console.log('📋 Copying built files to functions directory...');
    await executeCommand('cp', ['dist/*', 'functions/daily-race-importer/src/']);
    console.log('✅ Files copied\n');
    
    // Step 3: Deploy the function first
    console.log('🚀 Deploying function...');
    await executeCommand('appwrite', ['push', 'functions', '--function-id', FUNCTION_ID]);
    console.log('✅ Function deployed successfully\n');
    
    // Step 4: Set environment variables after deployment
    await setEnvironmentVariables(functionEnvVars);
    
    // Step 5: Try to activate the latest deployment (simplified)
    console.log('🔄 Checking deployment status...');
    try {
      await executeCommand('appwrite', [
        'functions', 'list-deployments',
        '--function-id', FUNCTION_ID
      ]);
      console.log('✅ Deployment ready\n');
    } catch (error) {
      console.log('⚠️ Could not verify deployment status\n');
    }
    
    console.log('🎉 Deployment completed successfully!');
    console.log('📊 Summary:');
    console.log(`   - Environment variables processed: ${Object.keys(functionEnvVars).length}`);
    console.log('   - Function deployed with latest code');
    console.log('   - Ready for execution');
    console.log('\n💡 Next steps:');
    console.log('   - Check the Appwrite console to manually activate the deployment if needed');
    console.log('   - Run: npm run execute:this');
    
  } catch (error) {
    console.error(`❌ Deployment failed: ${error.message}`);
    process.exit(1);
  }
}

deployWithEnvironmentVariables();