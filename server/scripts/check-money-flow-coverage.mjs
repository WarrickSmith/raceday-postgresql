#!/usr/bin/env node
/**
 * Quick money-flow coverage check for a given raceId.
 * - Queries `money-flow-history` for bucketed (timeInterval) docs, falls back to legacy (timeToStart)
 * - Summarizes entrant coverage and critical interval coverage (60..0)
 *
 * Env vars (any of the following are accepted):
 * - NEXT_PUBLIC_APPWRITE_ENDPOINT or APPWRITE_ENDPOINT
 * - NEXT_PUBLIC_APPWRITE_PROJECT_ID or APPWRITE_PROJECT_ID
 * - APPWRITE_API_KEY
 *
 * Usage:
 *   node server/scripts/check-money-flow-coverage.mjs <raceId>
 */

import 'dotenv/config'
import { Client, Databases, Query } from 'node-appwrite'

function getEnv(name, fallbackName) {
  return process.env[name] || (fallbackName ? process.env[fallbackName] : undefined)
}

const endpoint = getEnv('NEXT_PUBLIC_APPWRITE_ENDPOINT', 'APPWRITE_ENDPOINT')
const projectId = getEnv('NEXT_PUBLIC_APPWRITE_PROJECT_ID', 'APPWRITE_PROJECT_ID')
const apiKey = process.env.APPWRITE_API_KEY

if (!endpoint || !projectId || !apiKey) {
  console.error('Missing Appwrite env. Required: NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, APPWRITE_API_KEY (or APPWRITE_ENDPOINT/APPWRITE_PROJECT_ID).')
  process.exit(2)
}

const raceId = process.argv[2] || process.env.RACE_ID
if (!raceId) {
  console.error('Usage: node server/scripts/check-money-flow-coverage.mjs <raceId>')
  process.exit(2)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const databases = new Databases(client)
const databaseId = process.env.DATABASE_ID || 'raceday-db'

const TIMELINE_SELECT_FIELDS = [
  '$id', '$createdAt', 'raceId', 'entrantId', 'timeInterval', 'timeToStart', 'intervalType',
  'holdPercentage', 'incrementalWinAmount', 'incrementalPlaceAmount', 'winPoolAmount', 'placePoolAmount',
  'fixedWinOdds', 'fixedPlaceOdds', 'poolWinOdds', 'poolPlaceOdds', 'eventTimestamp', 'pollingTimestamp'
]

async function fetchAll(queryParts, maxPages = 20, limit = 200) {
  let cursorAfter
  const all = []
  for (let i = 0; i < maxPages; i++) {
    const queries = [
      ...queryParts,
      Query.select(TIMELINE_SELECT_FIELDS),
      Query.orderAsc('$createdAt'),
      Query.limit(limit)
    ]
    if (cursorAfter) queries.push(Query.cursorAfter(cursorAfter))
    const resp = await databases.listDocuments(databaseId, 'money-flow-history', queries)
    all.push(...resp.documents)
    if (!resp.documents.length || resp.documents.length < limit) break
    cursorAfter = resp.documents[resp.documents.length - 1].$id
  }
  return all
}

function resolveEntrantId(doc) {
  if (doc.entrantId) return String(doc.entrantId)
  const ent = doc.entrant
  if (!ent) return 'unknown'
  if (typeof ent === 'string') return ent
  if (typeof ent === 'object') {
    if (typeof ent.entrantId === 'string') return ent.entrantId
    if (typeof ent.$id === 'string') return ent.$id
    if (typeof ent.id === 'string' || typeof ent.id === 'number') return String(ent.id)
  }
  return 'unknown'
}

function analyze(documents) {
  const result = {
    totalDocuments: documents.length,
    entrants: new Map(),
    intervalsCovered: new Set(),
  }

  const criticalIntervals = [60,55,50,45,40,35,30,25,20,15,10,5,4,3,2,1,0]

  for (const doc of documents) {
    const entrantId = resolveEntrantId(doc)
    const interval = typeof doc.timeInterval === 'number' ? doc.timeInterval : (typeof doc.timeToStart === 'number' ? doc.timeToStart : null)
    if (interval === null) continue
    result.intervalsCovered.add(interval)
    if (!result.entrants.has(entrantId)) {
      result.entrants.set(entrantId, { count: 0, intervals: new Set() })
    }
    const ent = result.entrants.get(entrantId)
    ent.count++
    ent.intervals.add(interval)
  }

  const entrantsCoverage = []
  for (const [entrantId, data] of result.entrants.entries()) {
    const intervals = Array.from(data.intervals).sort((a, b) => b - a)
    const missingCritical = criticalIntervals.filter((i) => !intervals.includes(i))
    entrantsCoverage.push({
      entrantId,
      documentCount: data.count,
      intervalsCovered: intervals,
      missingCriticalIntervals: missingCritical,
    })
  }

  entrantsCoverage.sort((a, b) => b.documentCount - a.documentCount)

  return {
    totalDocuments: result.totalDocuments,
    entrantsCovered: entrantsCoverage.length,
    distinctIntervals: Array.from(result.intervalsCovered).sort((a, b) => b - a),
    entrantsCoverage,
  }
}

;(async () => {
  try {
    // Bucketed first
    let docs = await fetchAll([
      Query.equal('raceId', raceId),
      Query.equal('type', 'bucketed_aggregation'),
      Query.isNotNull('timeInterval'),
      Query.greaterThan('timeInterval', -65),
      Query.lessThan('timeInterval', 66),
    ])

    let bucketed = true
    if (docs.length === 0) {
      // Fallback to legacy
      bucketed = false
      docs = await fetchAll([
        Query.equal('raceId', raceId),
        Query.isNotNull('timeToStart'),
        Query.greaterThan('timeToStart', -65),
        Query.lessThan('timeToStart', 66),
      ])
    }

    const summary = analyze(docs)
    const sample = summary.entrantsCoverage.slice(0, 5).map((e) => ({
      entrant: e.entrantId.slice(-8),
      docs: e.documentCount,
      intervals: e.intervalsCovered.slice(0, 10)
    }))

    console.log(JSON.stringify({
      raceId,
      bucketed,
      totalDocuments: summary.totalDocuments,
      entrantsCovered: summary.entrantsCovered,
      distinctIntervals: summary.distinctIntervals,
      sampleEntrants: sample,
    }, null, 2))
  } catch (err) {
    console.error('Coverage check failed:', err?.message || err)
    process.exit(1)
  }
})()

