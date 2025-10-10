import { z } from 'zod'
import { RaceDataSchema } from '../clients/nztab-types.js'

export const workerRequestSchema = z.object({
  taskId: z.string().uuid(),
  payload: RaceDataSchema,
})

export type WorkerRequest = z.infer<typeof workerRequestSchema>

export const transformedRaceSchema = z.object({
  raceId: z.string().min(1),
  raceName: z.string().min(1),
  status: z.enum(['open', 'closed', 'interim', 'final', 'abandoned']),
  transformedAt: z.string().datetime(),
  metrics: z.object({
    entrantCount: z.number().int().nonnegative(),
    poolFieldCount: z.number().int().nonnegative(),
  }),
  payload: RaceDataSchema,
})

export type TransformedRace = z.infer<typeof transformedRaceSchema>

const workerResultSuccessSchema = z.object({
  status: z.literal('ok'),
  taskId: z.string().uuid(),
  durationMs: z.number().nonnegative(),
  result: transformedRaceSchema,
})

const workerResultFailureSchema = z.object({
  status: z.literal('error'),
  taskId: z.string().uuid(),
  durationMs: z.number().nonnegative(),
  error: z.object({
    name: z.string().min(1),
    message: z.string().min(1),
    stack: z.string().optional(),
  }),
})

export type WorkerResultSuccess = z.infer<typeof workerResultSuccessSchema>
export type WorkerResultFailure = z.infer<typeof workerResultFailureSchema>

export const workerResultSchema = z.discriminatedUnion('status', [
  workerResultSuccessSchema,
  workerResultFailureSchema,
])

export type WorkerResult = z.infer<typeof workerResultSchema>

export const createWorkerSuccessMessage = (
  taskId: string,
  durationMs: number,
  result: TransformedRace
): WorkerResultSuccess =>
  workerResultSuccessSchema.parse({
    status: 'ok',
    taskId,
    durationMs,
    result,
  })

export const createWorkerErrorMessage = (
  taskId: string,
  durationMs: number,
  error: { name: string; message: string; stack?: string }
): WorkerResultFailure =>
  workerResultFailureSchema.parse({
    status: 'error',
    taskId,
    durationMs,
    error,
  })
