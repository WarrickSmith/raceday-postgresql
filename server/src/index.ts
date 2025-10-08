import { createServer } from 'node:http';
import { URL } from 'node:url';
import { env } from './shared/env.js';
import { logger } from './shared/logger.js';
import { closePool } from './database/pool.js';
import { checkDatabase } from './health/database.js';

// Simple HTTP server with health endpoint
const server = createServer((req, res) => {
  // Parse URL for query parameters
  const url = new URL(req.url ?? '/', `http://localhost:${String(env.PORT)}`);

  // Health check endpoint
  if (url.pathname === '/health' && req.method === 'GET') {
    const deep = url.searchParams.get('deep') === 'true';

    res.setHeader('Content-Type', 'application/json');

    if (deep) {
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

server.listen(env.PORT, '0.0.0.0', () => {
  logger.info({ port: env.PORT }, `Server listening on port ${String(env.PORT)}`);
  logger.info('Health endpoint available at /health');
  logger.info('Deep health check available at /health?deep=true');
});

// Graceful shutdown
let isShuttingDown = false;

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (isShuttingDown) {
    logger.warn({ signal }, 'Shutdown already in progress');
    return;
  }
  isShuttingDown = true;

  logger.info({ signal }, 'Shutting down gracefully');

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err?: Error | null) => {
        if (err != null) {
          reject(err);
          return;
        }
        logger.info('HTTP server closed');
        resolve();
      });
    });
  } catch (err) {
    logger.error({ err }, 'Error closing HTTP server');
  }

  await closePool(signal);

  process.exit(0);
};

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
