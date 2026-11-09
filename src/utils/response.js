export function successResponse(res, statusCode, data, message, extras = {}) {
  const payload = {
    success: true,
    data,
    message,
    ...extras
  };
  return res.status(statusCode).json(payload);
}

export function errorResponse(res, statusCode, code, message, details = null) {
  const errorObj = {
    code,
    message
  };
  if (details && Array.isArray(details) && details.length > 0) {
    errorObj.details = details;
  }
  return res.status(statusCode).json({
    success: false,
    error: errorObj
  });
}
