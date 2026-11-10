import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRateLimiters } from './middleware/rateLimiter.js';
import { requestLogger } from './middleware/logger.js';
import { notFoundHandler } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createPatientsRouter } from './routes/patients.js';
import { createDraftsRouter } from './routes/drafts.js';
import { validateAiMode } from './services/aiService.js';
import { successResponse } from './utils/response.js';
import { getDb } from './db.js';

export function createApp(options = {}) {
  // Validate AI_MODE early (fails fast if invalid)
  validateAiMode(options.aiMode || (options.aiOptions && options.aiOptions.aiMode) || process.env.AI_MODE || 'ai');

  const app = express();

  // Security: disable x-powered-by & use helmet defaults
  app.disable('x-powered-by');
  app.use(helmet());

  // Body parsing: 10kb limit and strict JSON parsing
  app.use(express.json({ limit: '10kb', strict: true }));

  // Request logger (privacy-safe: method, path, status, duration only)
  app.use(requestLogger);

  // Rate limiting (configurable via options)
  const { generalLimiter, writeLimiter, generateLimiter } = createRateLimiters(options.rateLimit || {});
  app.use(generalLimiter);

  // Database initialization
  const db = options.db || getDb(options.dbPath);

  // Health check endpoint
  app.get('/health', (req, res) => {
    return successResponse(res, 200, { status: 'ok' }, 'Service is healthy');
  });

  // Patients routes
  app.use('/patients', createPatientsRouter({ writeLimiter, db }));

  // Drafts routes
  const aiOptions = { ...(options.aiMode ? { aiMode: options.aiMode } : {}), ...(options.aiOptions || {}) };
  app.use('/drafts', createDraftsRouter({ generateLimiter, writeLimiter, db, aiOptions }));

  // Static files: serve built frontend if available
  const distPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
  if (options.serveStatic !== false && fs.existsSync(distPath)) {
    app.use(express.static(distPath, { index: 'index.html', dotfiles: 'ignore' }));
    app.get('/', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 404 handler for unknown routes
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}

const defaultApp = createApp();
export default defaultApp;
