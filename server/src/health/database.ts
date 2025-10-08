import { pool } from '../database/pool.js'

interface DatabaseHealth {
  healthy: boolean
  message?: string
}

const checkDatabase = async (): Promise<DatabaseHealth> => {
  try {
    const result = await pool.query('SELECT 1')
    return { healthy: result.rowCount === 1 }
  } catch (err) {
    const error = err as Error
    return { healthy: false, message: error.message }
  }
}

export { checkDatabase }
