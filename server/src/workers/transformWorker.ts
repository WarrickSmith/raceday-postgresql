import { randomUUID } from 'node:crypto'
import { parentPort } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import {
  workerRequestSchema,
  createWorkerErrorMessage,
  createWorkerSuccessMessage,
  transformedRaceSchema,
} from './messages.js'
import type { TransformedRace } from './messages.js'

if (parentPort == null) {
  throw new Error('transformWorker must be executed as a worker thread')
}

const port = parentPort

const transformRace = (payload: TransformedRace['payload']): TransformedRace => {
  const entrantCount = Array.isArray(payload.entrants) ? payload.entrants.length : 0
  const poolFieldCount =
    payload.pools == null ? 0 : Object.values(payload.pools).filter((value) => value != null).length

  return transformedRaceSchema.parse({
    raceId: payload.id,
    raceName: payload.name,
    status: payload.status,
    transformedAt: new Date().toISOString(),
    metrics: {
      entrantCount,
      poolFieldCount,
    },
    payload,
  })
}

port.on('message', (rawMessage) => {
  const startedAt = performance.now()
  const parsedMessage = workerRequestSchema.safeParse(rawMessage)

  if (!parsedMessage.success) {
    const fallbackTaskId =
      typeof rawMessage === 'object' &&
      rawMessage != null &&
      'taskId' in rawMessage &&
      typeof (rawMessage as { taskId?: unknown }).taskId === 'string'
        ? (rawMessage as { taskId: string }).taskId
        : `invalid-${randomUUID()}`

    port.postMessage(
      createWorkerErrorMessage(fallbackTaskId, performance.now() - startedAt, {
        name: 'ValidationError',
        message: parsedMessage.error.message,
        stack: parsedMessage.error.stack,
      })
    )
    return
  }

  const {
    data: { taskId, payload },
  } = parsedMessage

  try {
    const result = transformRace(payload)
    port.postMessage(createWorkerSuccessMessage(taskId, performance.now() - startedAt, result))
  } catch (error) {
    const err =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'Unknown worker error')

    port.postMessage(
      createWorkerErrorMessage(taskId, performance.now() - startedAt, {
        name: err.name,
        message: err.message,
        stack: err.stack,
      })
    )
  }
})
