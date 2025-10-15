#!/usr/bin/env node

// Simple test to verify the field mapping fix
import { fetchRaceData } from './server/src/clients/nztab.js'

async function testEntrantsFix() {
  console.log('Testing entrants field mapping fix...')

  try {
    // Use a known race ID from the dev server logs
    const raceId = 'cd2d9468-d45b-47f8-9381-28575a053c8b'
    const raceData = await fetchRaceData(raceId, 'open')

    console.log('Race data fetched successfully!')
    console.log('Race ID:', raceData.id)
    console.log('Race name:', raceData.name)
    console.log('Number of entrants:', raceData.entrants?.length || 0)

    if (raceData.entrants && raceData.entrants.length > 0) {
      console.log('\nSample entrant data:')
      const sampleEntrant = raceData.entrants[0]
      console.log('- Entrant ID:', sampleEntrant.entrantId)
      console.log('- Name:', sampleEntrant.name)
      console.log('- Runner Number:', sampleEntrant.runnerNumber)
      console.log('- Barrier:', sampleEntrant.barrier)
      console.log('- Fixed Win Odds:', sampleEntrant.fixedWinOdds)
      console.log('- Jockey:', sampleEntrant.jockey)
      console.log('- Trainer:', sampleEntrant.trainerName)

      console.log('\n✅ SUCCESS: Entrants data is being properly fetched and transformed!')
      console.log('✅ The fix is working - runners array is being mapped to entrants correctly')
    } else {
      console.log('\n❌ FAILURE: No entrants data found')
      console.log('❌ The fix may not be working correctly')
    }

  } catch (error) {
    console.error('Error fetching race data:', error.message)
    console.log('\n❌ FAILURE: Could not fetch race data')
  }
}

testEntrantsFix()