import express from 'express';
import helmet from 'helmet';
import { createRateLimiters } from './middleware/rateLimiter.js';
import { requestLogger } from './middleware/logger.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createPatientsRouter } from './routes/patients.js';
import { successResponse } from './utils/response.js';
import { getDb } from './db.js';

export function createApp(options = {}) {
  const app = express();

  // Security: disable x-powered-by & use helmet defaults
  app.disable('x-powered-by');
  app.use(helmet());

  // Body parsing: 10kb limit and strict JSON parsing
  app.use(express.json({ limit: '10kb', strict: true }));

  // Request logger (privacy-safe: method, path, status, duration only)
  app.use(requestLogger);

  // Rate limiting (configurable via options)
  const { generalLimiter, writeLimiter } = createRateLimiters(options.rateLimit || {});
  app.use(generalLimiter);

  // Database initialization
  const db = options.db || getDb(options.dbPath);

  // Health check endpoint
  app.get('/health', (req, res) => {
    return successResponse(res, 200, { status: 'ok' }, 'Service is healthy');
  });

  // Patients routes
  app.use('/patients', createPatientsRouter({ writeLimiter, db }));

  // 404 handler for unknown routes
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}

const defaultApp = createApp();
export default defaultApp;
