#!/usr/bin/env node
/**
 * Helper script to get valid race IDs for testing
 * Fetches recent races from the database that can be used for testing batch-race-poller
 */

import { Client, Databases, Query } from 'node-appwrite';
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

async function getTestRaceIds() {
  try {
    console.log('🔍 Fetching Test Race IDs');
    console.log('=========================\n');

    // Initialize Appwrite client
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT || '')
      .setProject(process.env.APPWRITE_PROJECT_ID || '')
      .setKey(process.env.APPWRITE_API_KEY || '');

    const databases = new Databases(client);

    // Fetch recent races that aren't finalized
    console.log('📊 Querying recent races...');
    const races = await databases.listDocuments('raceday-db', 'races', [
      Query.orderDesc('$createdAt'),
      Query.limit(10),
      Query.notEqual('status', ['Final'])
    ]);

    if (races.documents.length === 0) {
      console.log('❌ No suitable races found for testing');
      console.log('\n💡 This could mean:');
      console.log('   - No races in database');
      console.log('   - All races are finalized');
      console.log('   - Database connection issues');
      return;
    }

    console.log(`✅ Found ${races.documents.length} suitable races for testing\n`);

    // Display race information
    console.log('📋 Available Test Races:');
    console.log('========================');
    
    races.documents.forEach((race, index) => {
      const shortId = race.$id.slice(-8);
      const startTime = new Date(race.startTime).toLocaleString();
      console.log(`${index + 1}. ${race.name}`);
      console.log(`   ID: ${race.$id} (short: ${shortId})`);
      console.log(`   Status: ${race.status}`);
      console.log(`   Start: ${startTime}`);
      console.log('');
    });

    // Provide copy-paste ready commands
    console.log('🚀 Ready-to-use Test Commands:');
    console.log('==============================');
    
    // For 3 races
    if (races.documents.length >= 3) {
      const threeRaceIds = races.documents.slice(0, 3).map(r => r.$id);
      console.log('📊 Test with 3 races (recommended):');
      console.log(`npm run test:batch-race-poller -- --raceIds "${threeRaceIds.join(',')}"`);
      console.log('');
    }

    // For 5 races
    if (races.documents.length >= 5) {
      const fiveRaceIds = races.documents.slice(0, 5).map(r => r.$id);
      console.log('📊 Test with 5 races (maximum efficiency):');
      console.log(`npm run test:batch-race-poller -- --raceIds "${fiveRaceIds.join(',')}"`);
      console.log('');
    }

    // Single race for comparison
    if (races.documents.length >= 1) {
      const singleRaceId = races.documents[0].$id;
      console.log('🏇 Test with single race (for comparison):');
      console.log(`npm run test:batch-race-poller -- --raceIds "${singleRaceId}"`);
      console.log('');
    }

    // Direct function execution commands
    console.log('🔧 Direct Appwrite CLI Commands:');
    console.log('=================================');
    
    if (races.documents.length >= 3) {
      const threeRaceIds = races.documents.slice(0, 3).map(r => r.$id);
      console.log('appwrite functions createExecution \\');
      console.log('  --functionId batch-race-poller \\');
      console.log(`  --body '{"raceIds": ["${threeRaceIds.join('", "')}"]}' \\`);
      console.log('  --async true');
      console.log('');
    }

    // Export for other scripts
    console.log('📤 Export Race IDs:');
    console.log('===================');
    const allRaceIds = races.documents.map(r => r.$id);
    console.log('All race IDs (JSON):');
    console.log(JSON.stringify(allRaceIds, null, 2));

    console.log('\n✅ Race ID fetching completed!');
    console.log('\n💡 Tip: Save these IDs for repeated testing');

  } catch (error) {
    console.error('❌ Failed to fetch race IDs:', error.message);
    
    if (error.message.includes('Project with the requested ID could not be found')) {
      console.log('\n💡 Make sure your .env file contains the correct:');
      console.log('   - APPWRITE_ENDPOINT');
      console.log('   - APPWRITE_PROJECT_ID');
      console.log('   - APPWRITE_API_KEY');
    }
    
    if (error.message.includes('Collection with the requested ID could not be found')) {
      console.log('\n💡 Make sure the "races" collection exists in database "raceday-db"');
    }

    process.exit(1);
  }
}

// Run the script
getTestRaceIds();