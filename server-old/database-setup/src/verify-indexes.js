import { Client, Databases } from 'node-appwrite'

async function main() {
  const endpoint = process.env['APPWRITE_ENDPOINT']
  const projectId = process.env['APPWRITE_PROJECT_ID']
  const apiKey = process.env['APPWRITE_API_KEY']
  const databaseId = process.env['APPWRITE_DATABASE_ID'] || 'raceday-db'

  if (!endpoint || !projectId || !apiKey) {
    console.error('Missing required env: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY')
    process.exit(1)
  }

  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
  const databases = new Databases(client)

  async function report(collectionId, expectedIndexes) {
    const col = await databases.getCollection(databaseId, collectionId)
    const present = (key) => col.indexes.some((i) => i.key === key)
    const results = expectedIndexes.map((k) => ({ key: k, exists: present(k) }))
    return { collectionId, indexes: results }
  }

  const reports = []
  reports.push(
    await report('entrants', ['idx_entrant_id', 'idx_runner_number', 'idx_race_id', 'idx_race_active'])
  )
  reports.push(
    await report('money-flow-history', [
      'idx_timestamp',
      'idx_time_interval',
      'idx_interval_type',
      'idx_polling_timestamp',
      'idx_race_id',
      'idx_race_entrant_time',
    ])
  )

  console.log(JSON.stringify({ databaseId, reports }, null, 2))
}

main().catch((err) => {
  console.error('Verification failed:', err?.message || err)
  process.exit(2)
})

