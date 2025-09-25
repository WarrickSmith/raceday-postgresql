import { Client, Databases, Query } from 'node-appwrite'
import {
  computeEntrantScalarUpdate,
  computeMoneyFlowScalarUpdate,
  deriveEntrantIdFromEntrantDocument,
  deriveRaceIdFromEntrantDocument,
  isMissingScalar,
  sanitizeString,
  shouldSkipUpdate
} from './backfill-helpers.js'

const DEFAULT_DATABASE_ID = 'raceday-db'
const DEFAULT_BATCH_SIZE = 100

function getBatchSize() {
  const parsed = Number.parseInt(process.env['SCALAR_KEY_BATCH_SIZE'] || `${DEFAULT_BATCH_SIZE}`, 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_BATCH_SIZE
  }
  return Math.min(parsed, 500) // keep batches reasonable for Appwrite limits
}

function logStructured(context, level, message, details = {}) {
  const payload = { level, message, ...details }
  if (level === 'error' && typeof context?.error === 'function') {
    context.error(message, details)
    return
  }

  const serialised = JSON.stringify(payload)
  if (typeof context?.log === 'function') {
    context.log(serialised)
  } else {
    console.log(serialised)
  }
}

function ensureEnv(context) {
  const required = ['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY']
  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

async function backfillEntrants(databases, databaseId, context, batchSize) {
  const stats = { scanned: 0, updated: 0, warnings: 0 }
  let cursor = null

  while (true) {
    const queries = [Query.limit(batchSize), Query.orderAsc('$id')]
    if (cursor) {
      queries.push(Query.cursorAfter(cursor))
    }

    const response = await databases.listDocuments(databaseId, 'entrants', queries)
    if (!response.documents.length) {
      break
    }

    for (const doc of response.documents) {
      const missingEntrantId = isMissingScalar(doc.entrantId)
      const missingRaceId = isMissingScalar(doc.raceId)

      if (!missingEntrantId && !missingRaceId) {
        continue
      }

      stats.scanned++
      const update = computeEntrantScalarUpdate(doc)

      if (shouldSkipUpdate(update)) {
        stats.warnings++
        logStructured(context, 'warn', 'Entrant document missing scalar keys and could not be backfilled', {
          entrantDocumentId: doc.$id,
          hasRelationshipRace: sanitizeString(doc.race) !== null
        })
        continue
      }

      await databases.updateDocument(databaseId, 'entrants', doc.$id, update)
      stats.updated++
    }

    if (response.documents.length < batchSize) {
      break
    }

    cursor = response.documents[response.documents.length - 1].$id
  }

  return stats
}

async function resolveEntrantDetails(databases, databaseId, entrantCache, context, entrantReference) {
  const entrantId = sanitizeString(entrantReference)
  if (!entrantId) {
    return null
  }

  if (entrantCache.has(entrantId)) {
    return entrantCache.get(entrantId)
  }

  try {
    const entrantDoc = await databases.getDocument(databaseId, 'entrants', entrantId)
    const info = {
      entrantId: deriveEntrantIdFromEntrantDocument(entrantDoc),
      raceId: deriveRaceIdFromEntrantDocument(entrantDoc)
    }
    entrantCache.set(entrantId, info)
    return info
  } catch (error) {
    entrantCache.set(entrantId, null)
    logStructured(context, 'warn', 'Unable to load entrant for scalar resolution', {
      entrantId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return null
  }
}

async function backfillMoneyFlow(databases, databaseId, context, batchSize) {
  const stats = { scanned: 0, updated: 0, warnings: 0 }
  const entrantCache = new Map()
  let cursor = null

  while (true) {
    const queries = [Query.limit(batchSize), Query.orderAsc('$id')]
    if (cursor) {
      queries.push(Query.cursorAfter(cursor))
    }

    const response = await databases.listDocuments(databaseId, 'money-flow-history', queries)
    if (!response.documents.length) {
      break
    }

    for (const doc of response.documents) {
      const missingEntrantId = isMissingScalar(doc.entrantId)
      const missingRaceId = isMissingScalar(doc.raceId)

      if (!missingEntrantId && !missingRaceId) {
        continue
      }

      stats.scanned++
      let update = computeMoneyFlowScalarUpdate(doc)

      const needsLookup =
        (missingEntrantId && !update.entrantId) ||
        (missingRaceId && !update.raceId)

      if (needsLookup) {
        const entrantReference = sanitizeString(doc.entrantId) || sanitizeString(doc.entrant)
        if (entrantReference) {
          const entrantInfo = await resolveEntrantDetails(databases, databaseId, entrantCache, context, entrantReference)
          const augmentedDoc = {
            ...doc,
            entrantId: doc.entrantId ?? update.entrantId,
            raceId: doc.raceId ?? update.raceId
          }
          const entrantDerivedUpdate = computeMoneyFlowScalarUpdate(augmentedDoc, entrantInfo)
          update = { ...update, ...entrantDerivedUpdate }
        }
      }

      if (shouldSkipUpdate(update)) {
        stats.warnings++
        logStructured(context, 'warn', 'Money flow document missing scalar keys and could not be backfilled', {
          documentId: doc.$id,
          entrantRef: sanitizeString(doc.entrant) || sanitizeString(doc.entrantId) || 'unknown'
        })
        continue
      }

      await databases.updateDocument(databaseId, 'money-flow-history', doc.$id, update)
      stats.updated++
    }

    if (response.documents.length < batchSize) {
      break
    }

    cursor = response.documents[response.documents.length - 1].$id
  }

  return stats
}

export default async function main(context) {
  const start = Date.now()
  try {
    ensureEnv(context)

    const endpoint = process.env['APPWRITE_ENDPOINT']
    const projectId = process.env['APPWRITE_PROJECT_ID']
    const apiKey = process.env['APPWRITE_API_KEY']
    const databaseId = process.env['DATABASE_ID'] || DEFAULT_DATABASE_ID
    const batchSize = getBatchSize()

    logStructured(context, 'info', 'Starting scalar key maintenance run', {
      databaseId,
      batchSize
    })

    const client = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey)

    const databases = new Databases(client)

    const entrantStats = await backfillEntrants(databases, databaseId, context, batchSize)
    const moneyFlowStats = await backfillMoneyFlow(databases, databaseId, context, batchSize)

    const durationMs = Date.now() - start

    const result = {
      success: true,
      entrants: entrantStats,
      moneyFlow: moneyFlowStats,
      durationMs
    }

    logStructured(context, 'info', 'Scalar key maintenance completed', result)

    if (moneyFlowStats.warnings > 0 || entrantStats.warnings > 0) {
      logStructured(context, 'warn', 'Scalar key maintenance completed with unresolved documents', {
        entrantsWithIssues: entrantStats.warnings,
        moneyFlowWithIssues: moneyFlowStats.warnings
      })
    }

    return result
  } catch (error) {
    logStructured(context, 'error', 'Scalar key maintenance failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error && error.stack ? error.stack.split('\n')[0] : undefined
    })
    throw error
  }
}
