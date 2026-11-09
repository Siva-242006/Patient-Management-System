import { errorResponse } from '../utils/response.js';

export function requireJsonContent(req, res, next) {
  if (req.method === 'POST') {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.toLowerCase().includes('application/json')) {
      return errorResponse(
        res,
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json'
      );
    }
  }
  next();
}
