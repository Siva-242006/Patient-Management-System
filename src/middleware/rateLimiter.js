import rateLimit from 'express-rate-limit';
import { errorResponse } from '../utils/response.js';

export function createRateLimiters(options = {}) {
  const generalMax = options.generalMax ?? parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
  const writeMax = options.writeMax ?? parseInt(process.env.RATE_LIMIT_WRITE_MAX || '30', 10);
  const enabled = options.enabled !== false;

  if (!enabled) {
    const noop = (req, res, next) => next();
    return { generalLimiter: noop, writeLimiter: noop };
  }

  const handler = (req, res) => {
    return errorResponse(res, 429, 'RATE_LIMITED', 'Too many requests, please try again later');
  };

  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: generalMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler
  });

  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: writeMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler
  });

  return { generalLimiter, writeLimiter };
}
