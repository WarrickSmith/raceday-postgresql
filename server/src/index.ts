import { createServer } from 'node:http';
import { URL } from 'node:url';
import { Pool } from 'pg';
import { env, buildDatabaseUrl } from './shared/env.js';
import { logger } from './shared/logger.js';

let dbPool: Pool | null = null;

// Initialize database pool if DATABASE_URL or DB_HOST is configured
const initDbPool = (): void => {
  try {
    dbPool = new Pool({
      connectionString: buildDatabaseUrl(env),
      max: 1, // Minimal pool for health checks only
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    dbPool.on('error', (err) => {
      logger.error({ err }, 'Database pool error');
    });
  } catch {
    logger.warn('Database pool initialization skipped - DB not configured');
  }
};

// Check database connectivity
const checkDatabase = async (): Promise<{
  healthy: boolean;
  message?: string;
}> => {
  if (dbPool === null) {
    return { healthy: false, message: 'Database not configured' };
  }

  try {
    const result = await dbPool.query('SELECT 1');
    return { healthy: result.rowCount === 1 };
  } catch (err) {
    const error = err as Error;
    return { healthy: false, message: error.message };
  }
};

// Simple HTTP server with health endpoint
const server = createServer((req, res) => {
  // Parse URL for query parameters
  const url = new URL(req.url ?? '/', `http://localhost:${String(env.PORT)}`);

  // Health check endpoint
  if (url.pathname === '/health' && req.method === 'GET') {
    const deep = url.searchParams.get('deep') === 'true';

    res.setHeader('Content-Type', 'application/json');

    if (deep && dbPool !== null) {
      // Deep health check - includes database connectivity
      void checkDatabase()
        .then((dbHealth) => {
          const status = dbHealth.healthy ? 'healthy' : 'unhealthy';
          const statusCode = dbHealth.healthy ? 200 : 503;

          res.writeHead(statusCode);
          res.end(
            JSON.stringify({
              status,
              timestamp: new Date().toISOString(),
              port: env.PORT,
              database: dbHealth,
            }),
          );
        })
        .catch((err: unknown) => {
          logger.error({ err }, 'Health check error');
          res.writeHead(503);
          res.end(
            JSON.stringify({
              status: 'unhealthy',
              timestamp: new Date().toISOString(),
              port: env.PORT,
              database: { healthy: false, message: 'Check failed' },
            }),
          );
        });
    } else {
      // Shallow health check - server is running
      res.writeHead(200);
      res.end(
        JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          port: env.PORT,
        }),
      );
    }
    return;
  }

  // Default 404
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not Found' }));
});

// Initialize database pool
initDbPool();

server.listen(env.PORT, '0.0.0.0', () => {
  logger.info({ port: env.PORT }, `Server listening on port ${String(env.PORT)}`);
  logger.info('Health endpoint available at /health');
  logger.info('Deep health check available at /health?deep=true');
});

// Graceful shutdown
const shutdown = async (): Promise<void> => {
  logger.info('Shutting down gracefully');

  server.close(() => {
    logger.info('HTTP server closed');
  });

  if (dbPool !== null) {
    try {
      await dbPool.end();
      logger.info('Database pool closed');
    } catch (err) {
      logger.error({ err }, 'Error closing database pool');
    }
  }

  process.exit(0);
};

process.on('SIGTERM', () => {
  void shutdown();
});

process.on('SIGINT', () => {
  void shutdown();
});
