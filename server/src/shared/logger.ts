import pino from 'pino'
import { env } from './env.js'

export const logger = pino({
  level: env.LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: env.NODE_ENV,
  },
})
