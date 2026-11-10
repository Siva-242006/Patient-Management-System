import { getToday, isValidCalendarDate, addDays } from './dates.js';
import { MESSAGE_MIN, MESSAGE_MAX } from './constants.js';

export function validateCreatePatient(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {
      valid: false,
      errors: [{ field: 'body', issue: 'must be a JSON object' }]
    };
  }

  const errors = [];
  const allowedFields = new Set(['name', 'phone', 'consultationDate', 'followUpDate']);
  const requiredFields = ['name', 'phone', 'consultationDate', 'followUpDate'];

  // Check for unknown fields
  for (const key of Object.keys(body)) {
    if (!allowedFields.has(key)) {
      errors.push({ field: key, issue: 'unknown field' });
    }
  }

  // Check for missing required fields
  for (const field of requiredFields) {
    if (!(field in body)) {
      errors.push({ field, issue: 'is required' });
    }
  }

  // Check for non-string types
  for (const field of requiredFields) {
    if (field in body && typeof body[field] !== 'string') {
      errors.push({ field, issue: 'must be a string' });
    }
  }

  const normalized = {};

  // Validate name
  if (typeof body.name === 'string') {
    const trimmed = body.name.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2 || trimmed.length > 100) {
      errors.push({ field: 'name', issue: 'must be 2-100 characters' });
    } else if (!/^\p{L}[\p{L}\p{M} .'-]*$/u.test(trimmed)) {
      errors.push({
        field: 'name',
        issue: 'must start with a letter and contain only letters, spaces, dots, hyphens, and apostrophes'
      });
    } else {
      normalized.name = trimmed;
    }
  }

  // Validate phone
  if (typeof body.phone === 'string') {
    if (body.phone.length > 20) {
      errors.push({ field: 'phone', issue: 'must not exceed 20 characters' });
    } else {
      const stripped = body.phone.replace(/[ -]/g, '');
      if (/^\+91[6-9]\d{9}$/.test(stripped)) {
        normalized.phone = stripped;
      } else if (/^91[6-9]\d{9}$/.test(stripped)) {
        normalized.phone = `+${stripped}`;
      } else if (/^[6-9]\d{9}$/.test(stripped)) {
        normalized.phone = `+91${stripped}`;
      } else {
        errors.push({
          field: 'phone',
          issue: 'must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9'
        });
      }
    }
  }

  // Validate consultationDate
  let consultValid = false;
  if (typeof body.consultationDate === 'string') {
    if (!isValidCalendarDate(body.consultationDate)) {
      errors.push({ field: 'consultationDate', issue: 'must be a valid date in YYYY-MM-DD format' });
    } else {
      const today = getToday();
      const minDate = addDays(today, -365);
      if (body.consultationDate > today) {
        errors.push({ field: 'consultationDate', issue: 'cannot be in the future' });
      } else if (body.consultationDate < minDate) {
        errors.push({ field: 'consultationDate', issue: 'cannot be older than 365 days' });
      } else {
        consultValid = true;
        normalized.consultationDate = body.consultationDate;
      }
    }
  }

  // Validate followUpDate
  let followUpValid = false;
  if (typeof body.followUpDate === 'string') {
    if (!isValidCalendarDate(body.followUpDate)) {
      errors.push({ field: 'followUpDate', issue: 'must be a valid date in YYYY-MM-DD format' });
    } else {
      followUpValid = true;
      normalized.followUpDate = body.followUpDate;
    }
  }

  // Cross-field date checks (only if both are valid dates and consultationDate within range)
  if (consultValid && followUpValid) {
    const maxFollowUp = addDays(normalized.consultationDate, 365);
    if (normalized.followUpDate < normalized.consultationDate) {
      errors.push({ field: 'followUpDate', issue: 'must be on or after consultation date' });
    } else if (normalized.followUpDate > maxFollowUp) {
      errors.push({ field: 'followUpDate', issue: 'cannot be more than 365 days after consultation date' });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: errors.length === 0 ? normalized : null
  };
}

export function validateGetPatientsQuery(query) {
  const errors = [];
  const allowed = new Set(['status']);

  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) {
      errors.push({ field: key, issue: 'unknown query parameter' });
    }
  }

  if (Array.isArray(query.status)) {
    errors.push({ field: 'status', issue: 'duplicate query parameter not allowed' });
  } else if (query.status !== undefined) {
    if (query.status !== 'pending' && query.status !== 'completed') {
      errors.push({ field: 'status', issue: 'must be pending or completed' });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    status: query.status
  };
}

export function validateDueTodayQuery(query) {
  const errors = [];
  const allowed = new Set(['includeOverdue']);

  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) {
      errors.push({ field: key, issue: 'unknown query parameter' });
    }
  }

  if (Array.isArray(query.includeOverdue)) {
    errors.push({ field: 'includeOverdue', issue: 'duplicate query parameter not allowed' });
  } else if (query.includeOverdue !== undefined) {
    if (query.includeOverdue !== 'true' && query.includeOverdue !== 'false') {
      errors.push({ field: 'includeOverdue', issue: 'must be true or false' });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    includeOverdue: query.includeOverdue === 'true'
  };
}

export function validateId(id) {
  if (typeof id !== 'string' || !/^[1-9][0-9]{0,9}$/.test(id)) {
    return {
      valid: false,
      errors: [{ field: 'id', issue: 'must be a positive integer' }]
    };
  }
  const num = Number(id);
  if (num > 2147483647) {
    return {
      valid: false,
      errors: [{ field: 'id', issue: 'must be a positive integer' }]
    };
  }
  return {
    valid: true,
    id: num
  };
}

export function validateGenerateDraftsBody(body) {
  if (
    body === undefined ||
    body === null ||
    (typeof body === 'object' && Object.keys(body).length === 0 && !Array.isArray(body))
  ) {
    return {
      valid: true,
      errors: [],
      data: { includeOverdue: false }
    };
  }

  if (typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      errors: [{ field: 'body', issue: 'must be a JSON object' }]
    };
  }

  const errors = [];
  const allowed = new Set(['includeOverdue']);

  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      errors.push({ field: key, issue: 'unknown field' });
    }
  }

  let includeOverdue = false;
  if ('includeOverdue' in body) {
    if (typeof body.includeOverdue !== 'boolean') {
      errors.push({ field: 'includeOverdue', issue: 'must be a boolean' });
    } else {
      includeOverdue = body.includeOverdue;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: errors.length === 0 ? { includeOverdue } : null
  };
}

export function validateApproveDraftBody(body) {
  if (
    body === undefined ||
    body === null ||
    (typeof body === 'object' && Object.keys(body).length === 0 && !Array.isArray(body))
  ) {
    return {
      valid: true,
      errors: [],
      data: { message: null }
    };
  }

  if (typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      errors: [{ field: 'body', issue: 'must be a JSON object' }]
    };
  }

  const errors = [];
  const allowed = new Set(['message']);

  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      errors.push({ field: key, issue: 'unknown field' });
    }
  }

  let normalizedMessage = null;
  if ('message' in body) {
    if (typeof body.message !== 'string') {
      errors.push({ field: 'message', issue: 'must be a string' });
    } else {
      const trimmed = body.message.trim();
      let hasError = false;

      if (trimmed.length < MESSAGE_MIN || trimmed.length > MESSAGE_MAX) {
        errors.push({
          field: 'message',
          issue: `must be ${MESSAGE_MIN}-${MESSAGE_MAX} characters`
        });
        hasError = true;
      }

      if (!/\p{L}/u.test(trimmed)) {
        errors.push({
          field: 'message',
          issue: 'must contain letters'
        });
        hasError = true;
      }

      if (/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed)) {
        errors.push({
          field: 'message',
          issue: 'must not contain control characters'
        });
        hasError = true;
      }

      if (!hasError) {
        normalizedMessage = trimmed;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: errors.length === 0 ? { message: normalizedMessage } : null
  };
}

export function validateGetDraftsQuery(query) {
  const errors = [];
  const allowed = new Set(['status']);
  const allowedStatuses = new Set(['pending_review', 'approved', 'rejected', 'cancelled']);

  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) {
      errors.push({ field: key, issue: 'unknown query parameter' });
    }
  }

  if (Array.isArray(query.status)) {
    errors.push({ field: 'status', issue: 'duplicate query parameter not allowed' });
  } else if (query.status !== undefined) {
    if (!query.status || !allowedStatuses.has(query.status)) {
      errors.push({
        field: 'status',
        issue: 'must be pending_review, approved, rejected, or cancelled'
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    status: query.status
  };
}
