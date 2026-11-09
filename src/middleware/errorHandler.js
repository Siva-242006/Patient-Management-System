import { errorResponse } from '../utils/response.js';

export function errorHandler(err, req, res, next) {
  if (err.type === 'entity.too.large' || err.status === 413) {
    return errorResponse(res, 413, 'PAYLOAD_TOO_LARGE', 'Request payload exceeds 10kb limit');
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Malformed JSON in request body');
  }

  if (err.code === 'VALIDATION_ERROR') {
    return errorResponse(res, 400, 'VALIDATION_ERROR', err.message, err.details);
  }

  if (err.code === 'NOT_FOUND') {
    return errorResponse(res, 404, 'NOT_FOUND', err.message);
  }

  if (err.code === 'CONFLICT') {
    return errorResponse(res, 409, 'CONFLICT', err.message);
  }

  // Never leak stack traces, SQL errors, or file paths
  if (process.env.NODE_ENV !== 'test') {
    console.error('Unhandled server error:', err.message);
  }

  return errorResponse(res, 500, 'INTERNAL_ERROR', 'Internal server error');
}
