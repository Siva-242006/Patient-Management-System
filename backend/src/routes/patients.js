import { Router } from 'express';
import {
  validateCreatePatient,
  validateGetPatientsQuery,
  validateDueTodayQuery,
  validateId
} from '../utils/validate.js';
import {
  createPatient,
  getPatients,
  getDueTodayPatients,
  completeFollowUp
} from '../services/patientService.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { requireJsonContent } from '../middleware/contentType.js';

export function createPatientsRouter({ writeLimiter, db } = {}) {
  const router = Router();
  const writeLimit = writeLimiter || ((req, res, next) => next());

  // GET /patients/due-today
  router.get('/due-today', (req, res, next) => {
    try {
      const val = validateDueTodayQuery(req.query);
      if (!val.valid) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation failed', val.errors);
      }
      const result = getDueTodayPatients({ includeOverdue: val.includeOverdue }, db);
      const message = val.includeOverdue
        ? 'Due today along with overdue patients retrieved'
        : 'Due today patients retrieved';
      return successResponse(
        res,
        200,
        result.patients,
        message,
        { count: result.patients.length, date: result.date }
      );
    } catch (err) {
      next(err);
    }
  });

  // GET /patients
  router.get('/', (req, res, next) => {
    try {
      const val = validateGetPatientsQuery(req.query);
      if (!val.valid) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation failed', val.errors);
      }
      const patients = getPatients({ status: val.status }, db);
      return successResponse(
        res,
        200,
        patients,
        'Patients retrieved',
        { count: patients.length }
      );
    } catch (err) {
      next(err);
    }
  });

  // POST /patients
  router.post('/', writeLimit, requireJsonContent, (req, res, next) => {
    try {
      const val = validateCreatePatient(req.body);
      if (!val.valid) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation failed', val.errors);
      }
      const patient = createPatient(val.data, db);
      return successResponse(res, 201, patient, 'Patient added');
    } catch (err) {
      if (err.code === 'CONFLICT') {
        return errorResponse(res, 409, 'CONFLICT', err.message);
      }
      next(err);
    }
  });

  // PATCH /patients/:id/complete
  router.patch('/:id/complete', writeLimit, (req, res, next) => {
    try {
      const val = validateId(req.params.id);
      if (!val.valid) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', 'Validation failed', val.errors);
      }
      const updated = completeFollowUp(val.id, db);
      return successResponse(res, 200, updated, 'Follow-up marked as completed');
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

export default createPatientsRouter();
