import { errorResponse } from '../utils/response.js';

export function notFoundHandler(req, res) {
  return errorResponse(res, 404, 'NOT_FOUND', 'Route not found');
}
