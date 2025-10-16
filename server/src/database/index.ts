// Database module exports
export { pool, closePool, poolConfig } from './pool.js'
export { withTransaction, DatabaseWriteError, type BulkUpsertResult } from './bulk-upsert.js'
export {
  insertMoneyFlowHistory,
  insertOddsHistory,
  getPartitionTableName,
  verifyPartitionExists,
  ensurePartition,
  ensureUpcomingPartitions,
  validatePartitionBeforeWrite,
  PartitionNotFoundError,
  type OddsRecord,
} from './time-series.js'