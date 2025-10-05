#!/usr/bin/env node
/**
 * Monitor script for batch-race-poller results
 * Checks database updates and function execution logs after testing
 */

import { Client, Databases, Functions, Query } from 'node-appwrite';
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
const executionId = args[0];

async function monitorBatchResults() {
  try {
    console.log('📊 Monitoring Batch Race Poller Results');
    console.log('=======================================\n');

    // Initialize Appwrite client
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT || '')
      .setProject(process.env.APPWRITE_PROJECT_ID || '')
      .setKey(process.env.APPWRITE_API_KEY || '');

    const functions = new Functions(client);
    const databases = new Databases(client);

    // Get recent function executions
    console.log('🔍 Checking recent function executions...');
    const executions = await functions.listExecutions('batch-race-poller', [
      Query.orderDesc('$createdAt'),
      Query.limit(5)
    ]);

    if (executions.executions.length === 0) {
      console.log('❌ No recent executions found');
      return;
    }

    console.log(`✅ Found ${executions.executions.length} recent executions\n`);

    // Display execution details
    console.log('📋 Recent Executions:');
    console.log('=====================');
    
    executions.executions.forEach((execution, index) => {
      const duration = execution.duration ? `${execution.duration}s` : 'N/A';
      const createdAt = new Date(execution.$createdAt).toLocaleString();
      
      console.log(`${index + 1}. Execution ${execution.$id.slice(-8)}`);
      console.log(`   Status: ${execution.status} (${execution.statusCode})`);
      console.log(`   Duration: ${duration}`);
      console.log(`   Created: ${createdAt}`);
      
      // Parse response if available
      if (execution.response) {
        try {
          const response = JSON.parse(execution.response);
          if (response.validRaces !== undefined) {
            console.log(`   Valid races: ${response.validRaces}, Skipped: ${response.skippedRaces || 0}`);
          }
        } catch (e) {
          // Response not JSON, show truncated
          const truncated = execution.response.slice(0, 100) + (execution.response.length > 100 ? '...' : '');
          console.log(`   Response: ${truncated}`);
        }
      }
      
      if (execution.stderr) {
        console.log(`   ⚠️ Errors: ${execution.stderr.slice(0, 100)}...`);
      }
      console.log('');
    });

    // Check recent database updates
    console.log('📊 Checking Recent Database Updates:');
    console.log('====================================');
    
    // Check entrants updates (last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    try {
      const recentEntrants = await databases.listDocuments('raceday-db', 'entrants', [
        Query.greaterThan('$updatedAt', fiveMinutesAgo),
        Query.orderDesc('$updatedAt'),
        Query.limit(10)
      ]);
      
      console.log(`✅ Entrants updated in last 5 minutes: ${recentEntrants.documents.length}`);
      if (recentEntrants.documents.length > 0) {
        recentEntrants.documents.slice(0, 3).forEach((entrant, index) => {
          const updatedAt = new Date(entrant.$updatedAt).toLocaleString();
          console.log(`   ${index + 1}. ${entrant.name} (${entrant.runnerNumber}) - ${updatedAt}`);
        });
      }
    } catch (error) {
      console.log('⚠️  Could not check entrants updates:', error.message);
    }

    // Check odds history (last 5 minutes)
    try {
      const recentOddsHistory = await databases.listDocuments('raceday-db', 'odds-history', [
        Query.greaterThan('$createdAt', fiveMinutesAgo),
        Query.orderDesc('$createdAt'),
        Query.limit(10)
      ]);
      
      console.log(`✅ Odds history entries in last 5 minutes: ${recentOddsHistory.documents.length}`);
      if (recentOddsHistory.documents.length > 0) {
        const groupedByType = recentOddsHistory.documents.reduce((acc, entry) => {
          acc[entry.type] = (acc[entry.type] || 0) + 1;
          return acc;
        }, {});
        console.log('   Types:', Object.entries(groupedByType).map(([type, count]) => `${type}: ${count}`).join(', '));
      }
    } catch (error) {
      console.log('⚠️  Could not check odds history:', error.message);
    }

    // Check money flow history (last 5 minutes)
    try {
      const recentMoneyFlow = await databases.listDocuments('raceday-db', 'money-flow-history', [
        Query.greaterThan('$createdAt', fiveMinutesAgo),
        Query.orderDesc('$createdAt'),
        Query.limit(10)
      ]);
      
      console.log(`✅ Money flow entries in last 5 minutes: ${recentMoneyFlow.documents.length}`);
      if (recentMoneyFlow.documents.length > 0) {
        const groupedByType = recentMoneyFlow.documents.reduce((acc, entry) => {
          acc[entry.type] = (acc[entry.type] || 0) + 1;
          return acc;
        }, {});
        console.log('   Types:', Object.entries(groupedByType).map(([type, count]) => `${type}: ${count}`).join(', '));
      }
    } catch (error) {
      console.log('⚠️  Could not check money flow history:', error.message);
    }

    // Performance summary
    console.log('\n📈 Performance Summary:');
    console.log('======================');
    
    const successfulExecutions = executions.executions.filter(e => e.status === 'completed');
    const failedExecutions = executions.executions.filter(e => e.status === 'failed');
    
    console.log(`✅ Successful executions: ${successfulExecutions.length}/${executions.executions.length}`);
    console.log(`❌ Failed executions: ${failedExecutions.length}/${executions.executions.length}`);
    
    if (successfulExecutions.length > 0) {
      const avgDuration = successfulExecutions
        .filter(e => e.duration)
        .reduce((sum, e) => sum + e.duration, 0) / successfulExecutions.filter(e => e.duration).length;
      
      if (avgDuration) {
        console.log(`⚡ Average execution time: ${avgDuration.toFixed(1)} seconds`);
        
        if (avgDuration < 30) {
          console.log('🚀 Excellent performance!');
        } else if (avgDuration < 60) {
          console.log('✅ Good performance');
        } else {
          console.log('⚠️  Performance could be improved');
        }
      }
    }

    console.log('\n💡 Tips:');
    console.log('========');
    console.log('- Check Appwrite console for detailed logs');
    console.log('- Monitor function execution dashboard for resource usage');
    console.log('- Use `npm run get-test-race-ids` to find fresh race IDs for testing');

    console.log('\n✅ Monitoring completed!');

  } catch (error) {
    console.error('❌ Monitoring failed:', error.message);
    process.exit(1);
  }
}

// Run the monitoring
monitorBatchResults();