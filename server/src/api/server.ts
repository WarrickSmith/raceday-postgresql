import express, { type Express } from 'express'
import helmet from 'helmet'
import compression from 'compression'
import { healthRouter } from './routes/health.js'
import { clientCompatibilityRouter } from './routes/client-compatibility.js'

export const createServer = (): Express => {
  const app = express()

  // Security middleware
  app.use(helmet())

  // Compression middleware
  app.use(compression())

  // JSON parsing middleware
  app.use(express.json())

  // Health check route
  app.use('/health', healthRouter)
  // Client compatibility API
  app.use('/api', clientCompatibilityRouter)

  return app
}
