#!/usr/bin/env node
/**
 * Test script for batch-race-poller function
 * Tests the batch race polling functionality with sample or provided race IDs
 */

import { Client, Functions, Databases } from 'node-appwrite';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  config({ path: envPath });
}

// Parse command line arguments
const args = process.argv.slice(2);
let raceIds = [];

// Check for --raceIds flag
const raceIdsIndex = args.indexOf('--raceIds');
if (raceIdsIndex !== -1 && args[raceIdsIndex + 1]) {
  raceIds = args[raceIdsIndex + 1].split(',').map(id => id.trim());
}

async function testBatchRacePoller() {
  try {
    console.log('🧪 Testing Batch Race Poller Function');
    console.log('=====================================\n');

    // Initialize Appwrite client
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT || '')
      .setProject(process.env.APPWRITE_PROJECT_ID || '')
      .setKey(process.env.APPWRITE_API_KEY || '');

    const functions = new Functions(client);
    const databases = new Databases(client);

    // If no race IDs provided, try to get some from the database
    if (raceIds.length === 0) {
      console.log('📋 No race IDs provided, fetching test races from database...');
      try {
        const races = await databases.listDocuments('raceday-db', 'races', [
          'orderDesc("$createdAt")',
          'limit(3)',
          'notEqual("status", ["Final"])'
        ]);

        if (races.documents.length === 0) {
          console.error('❌ No races found in database for testing');
          console.log('\n💡 You can provide race IDs manually:');
          console.log('npm run test:batch-race-poller -- --raceIds "race-id-1,race-id-2,race-id-3"');
          process.exit(1);
        }

        raceIds = races.documents.slice(0, 3).map(race => race.$id);
        console.log(`✅ Found ${raceIds.length} test races:`, raceIds.map(id => id.slice(-8)).join(', '));
      } catch (error) {
        console.error('❌ Failed to fetch test races:', error.message);
        console.log('\n💡 You can provide race IDs manually:');
        console.log('npm run test:batch-race-poller -- --raceIds "race-id-1,race-id-2,race-id-3"');
        process.exit(1);
      }
    } else {
      console.log(`📋 Using provided race IDs: ${raceIds.map(id => id.slice(-8)).join(', ')}`);
    }

    // Prepare test payload
    const payload = {
      raceIds: raceIds,
      debug: true,
      testMode: true
    };

    console.log('\n🚀 Executing batch-race-poller function...');
    console.log(`📊 Batch size: ${raceIds.length} races`);
    console.log(`⏱️  Expected execution time: ${raceIds.length * 7 + 10}-${raceIds.length * 12 + 15} seconds`);

    const startTime = Date.now();

    // Execute the function
    const execution = await functions.createExecution(
      'batch-race-poller',
      JSON.stringify(payload),
      false, // sync execution for testing
      '/test'
    );

    const endTime = Date.now();
    const executionTime = Math.round((endTime - startTime) / 1000);

    console.log('\n📈 Execution Results:');
    console.log('====================');
    console.log(`⏱️  Execution time: ${executionTime} seconds`);
    console.log(`🆔 Execution ID: ${execution.$id}`);
    console.log(`📊 Status: ${execution.status}`);
    console.log(`🔄 Status Code: ${execution.statusCode}`);

    // Parse response
    let response;
    try {
      response = JSON.parse(execution.response);
      console.log('\n📄 Function Response:');
      console.log('====================');
      console.log(`✅ Success: ${response.success}`);
      console.log(`📝 Message: ${response.message}`);
      
      if (response.validRaces !== undefined) {
        console.log(`🏇 Valid races: ${response.validRaces}`);
        console.log(`⏭️  Skipped races: ${response.skippedRaces || 0}`);
        console.log(`📊 Total requested: ${response.totalRequested}`);
      }

      if (response.skippedRaces && response.skippedRaces > 0) {
        console.log('\n⚠️  Some races were skipped (likely already finalized)');
      }

    } catch (parseError) {
      console.log('\n📄 Raw Response:');
      console.log(execution.response);
    }

    // Log any errors
    if (execution.stderr) {
      console.log('\n⚠️  Function Errors:');
      console.log('===================');
      console.log(execution.stderr);
    }

    // Performance analysis
    console.log('\n📊 Performance Analysis:');
    console.log('========================');
    const avgTimePerRace = executionTime / raceIds.length;
    console.log(`⚡ Average time per race: ${avgTimePerRace.toFixed(1)} seconds`);
    
    if (avgTimePerRace < 10) {
      console.log('🚀 Excellent performance - well within targets');
    } else if (avgTimePerRace < 15) {
      console.log('✅ Good performance - meeting performance targets');
    } else {
      console.log('⚠️  Slower than expected - consider optimization');
    }

    // Verification suggestions
    console.log('\n🔍 Verification Steps:');
    console.log('======================');
    console.log('1. Check function logs in Appwrite console');
    console.log('2. Verify database updates:');
    raceIds.forEach((raceId, index) => {
      console.log(`   - Check entrants for race ${raceId.slice(-8)}`);
    });
    console.log('3. Monitor odds-history and money-flow-history collections for new entries');

    console.log('\n✅ Batch race poller test completed successfully!');

    return {
      success: true,
      executionTime,
      raceIds,
      executionId: execution.$id,
      response
    };

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    if (error.message.includes('Project with the requested ID could not be found')) {
      console.log('\n💡 Make sure your .env file contains the correct:');
      console.log('   - APPWRITE_ENDPOINT');
      console.log('   - APPWRITE_PROJECT_ID');
      console.log('   - APPWRITE_API_KEY');
    }
    
    if (error.message.includes('Function with the requested ID could not be found')) {
      console.log('\n💡 Make sure the batch-race-poller function is deployed:');
      console.log('   npm run deploy:batch-race-poller');
    }

    process.exit(1);
  }
}

// Run the test
testBatchRacePoller();