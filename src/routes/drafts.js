import { Router } from 'express';
import {
  validateId,
  validateGenerateDraftsBody,
  validateApproveDraftBody,
  validateGetDraftsQuery
} from '../utils/validate.js';
import {
  generateDrafts,
  getDrafts,
  approveDraft,
  rejectDraft
} from '../services/draftService.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { getDraftsSummary } from '../services/summaryService.js';

export function createDraftsRouter({ generateLimiter, writeLimiter, db, aiOptions } = {}) {
  const router = Router();
  const generateLimit = generateLimiter || ((req, res, next) => next());
  const writeLimit = writeLimiter || ((req, res, next) => next());

  // POST /drafts/generate
  router.post('/generate', generateLimit, async (req, res, next) => {
    try {
      const val = validateGenerateDraftsBody(req.body);
      if (!val.valid) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation failed', val.errors);
      }

      const result = await generateDrafts(val.data, { db, aiOptions });
      return successResponse(res, result.status, result.data, result.message);
    } catch (err) {
      next(err);
    }
  });

  // GET /drafts
  router.get('/', (req, res, next) => {
    try {
      const val = validateGetDraftsQuery(req.query);
      if (!val.valid) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation failed', val.errors);
      }

      const drafts = getDrafts({ status: val.status }, db);
      return successResponse(res, 200, drafts, 'Drafts retrieved', { count: drafts.length });
    } catch (err) {
      next(err);
    }
  });

  // GET /drafts/summary
  router.get('/summary', async (req, res, next) => {
    try {
      if (Object.keys(req.query).length > 0) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation failed', [
          { field: 'query', issue: 'query parameters not allowed' }
        ]);
      }

      const summary = await getDraftsSummary({ db, aiOptions });
      return successResponse(res, 200, summary, 'Summary retrieved');
    } catch (err) {
      next(err);
    }
  });

  // PATCH /drafts/:id/approve
  router.patch('/:id/approve', writeLimit, (req, res, next) => {
    try {
      const valId = validateId(req.params.id);
      if (!valId.valid) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation failed', valId.errors);
      }

      const valBody = validateApproveDraftBody(req.body);
      if (!valBody.valid) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation failed', valBody.errors);
      }

      const updated = approveDraft(valId.id, valBody.data.message, db);
      return successResponse(
        res,
        200,
        updated,
        'Approved, ready to send (simulated). No message was sent.'
      );
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        return errorResponse(res, 404, 'NOT_FOUND', err.message);
      }
      if (err.code === 'CONFLICT') {
        return errorResponse(res, 409, 'CONFLICT', err.message);
      }
      next(err);
    }
  });

  // PATCH /drafts/:id/reject
  router.patch('/:id/reject', writeLimit, (req, res, next) => {
    try {
      const valId = validateId(req.params.id);
      if (!valId.valid) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation failed', valId.errors);
      }

      const updated = rejectDraft(valId.id, db);
      return successResponse(res, 200, updated, 'Draft rejected. No message was sent.');
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        return errorResponse(res, 404, 'NOT_FOUND', err.message);
      }
      if (err.code === 'CONFLICT') {
        return errorResponse(res, 409, 'CONFLICT', err.message);
      }
      next(err);
    }
  });

  return router;
}

export default createDraftsRouter();
