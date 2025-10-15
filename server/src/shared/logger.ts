import * as pino from 'pino'
import { env } from './env.js'

export const logger = pino.pino({
  level: env.LOG_LEVEL,
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: env.NODE_ENV,
  },
})
