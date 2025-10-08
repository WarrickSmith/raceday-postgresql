import { Router, type Request, type Response } from 'express'
import { checkDatabase } from '../../health/database.js'
import { logger } from '../../shared/logger.js'

export const healthRouter = Router()

healthRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const dbHealth = await checkDatabase()

    if (!dbHealth.healthy) {
      const errorMessage = dbHealth.message ?? 'Unknown error'
      logger.error(
        { err: new Error(errorMessage) },
        'Health check failed: database unhealthy'
      )

      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: dbHealth.message ?? 'Database connection failed',
      })
      return
    }

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      workers: 'operational',
    })
  } catch (err) {
    const error = err as Error
    logger.error({ err: error }, 'Health check failed: unexpected error')

    const errorMessage = error.message
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: errorMessage.length > 0 ? errorMessage : 'Internal server error',
    })
  }
})
