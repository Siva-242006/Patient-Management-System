# Patient Follow-Up System

A backend REST API for managing clinic follow-up appointments and an AI draft workflow for staff review. All patient data is strictly fictional for assessment purposes. No message is ever sent automatically, and no WhatsApp, SMS, or email code exists in the codebase.

## 1. How to Run

Prerequisites: Node.js 20+

```bash
npm install
cp .env.example .env
npm run seed
npm start
```
Server runs at `http://localhost:3000`. Use `npm run dev` for auto-reload.

## 2. Dependencies

Runtime:
- `express`: Minimalist HTTP web framework.
- `better-sqlite3`: Synchronous SQLite database driver.
- `dotenv`: Loads configuration from `.env`.
- `helmet`: Sets secure HTTP headers.
- `express-rate-limit`: Basic IP-based request rate limiting.

Development:
- `supertest`: HTTP assertions for integration testing.
- `node:test`: Built-in Node.js test runner.

## 3. Environment Variables

| Name | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `DB_PATH` | `./data/app.db` | SQLite database file location |
| `APP_TIMEZONE` | `Asia/Kolkata` | Application timezone for date calculations |
| `RATE_LIMIT_MAX` | `100` | Global requests per minute limit |
| `RATE_LIMIT_WRITE_MAX` | `30` | Write requests per minute limit |
| `RATE_LIMIT_GENERATE_MAX` | `5` | Draft generation requests per minute limit |
| `GENERATE_MAX_PER_CALL` | `20` | Maximum patients processed per generate call |
| `AI_MODE` | `ai` | Generation mode: `ai` or `mock` |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Gemini model name |
| `GEMINI_API_KEY` | *(empty)* | Optional Gemini API key; stays in `.env` only and is never logged |

## 4. API Reference

Base URL: `http://localhost:3000`. All requests and responses use JSON. Send `Content-Type: application/json` on requests with a body.

### 4.1 Conventions

**Success response**

```json
{
  "success": true,
  "data": {},
  "message": "Short description"
}
```

List endpoints also include `count`.

**Error response**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "phone", "issue": "must be a string" }
    ]
  }
}
```

`details` appears only for validation errors, and lists every invalid field. The HTTP status is carried in the response status line, not in the body.

**Error codes**

| Code | HTTP status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid body, query parameter or id |
| `NOT_FOUND` | 404 | Record or route does not exist |
| `CONFLICT` | 409 | Action not allowed in the current state, or duplicate |
| `PAYLOAD_TOO_LARGE` | 413 | Request body over 10 KB |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Body not sent as `application/json` |
| `RATE_LIMITED` | 429 | Too many requests from this IP |
| `INTERNAL_ERROR` | 500 | Unexpected server error (no details exposed) |

Every endpoint can also return 413, 415 (when it takes a body), 429 and 500. Only the errors specific to each endpoint are listed below.

### 4.2 Endpoint overview

| Method | Path | Purpose |
|---|---|---|
| POST | `/patients` | Add a patient follow-up record |
| GET | `/patients` | List all patients |
| GET | `/patients/due-today` | List patients whose follow-up is due today |
| PATCH | `/patients/:id/complete` | Mark a follow-up as completed |
| POST | `/drafts/generate` | Generate AI follow-up drafts for due patients |
| GET | `/drafts` | List drafts for review |
| GET | `/drafts/summary` | Today's counts with a readable summary |
| PATCH | `/drafts/:id/approve` | Approve a draft, optionally with edited text |
| PATCH | `/drafts/:id/reject` | Reject a draft |
| GET | `/health` | Health check |

---

### 4.3 Patients

#### POST /patients

Adds a patient. Fictional data only.

**Request body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | string | Yes | 2-100 characters; letters, spaces, `.` `'` `-` only |
| `phone` | string | Yes | 10-digit Indian mobile starting 6-9; optional `+91` or `91` prefix; stored as `+91XXXXXXXXXX` |
| `consultationDate` | string | Yes | `YYYY-MM-DD`, real date, not in the future, within the last 365 days |
| `followUpDate` | string | Yes | `YYYY-MM-DD`, on or after `consultationDate`, within 365 days of it |

Unknown fields, non-string values and arrays are rejected.

**Request**

```bash
curl -s -X POST http://localhost:3000/patients \
  -H "Content-Type: application/json" \
  -d '{"name":"Anita Rao","phone":"98765 43210","consultationDate":"2026-11-01","followUpDate":"2026-11-10"}'
```

**Success: 201 Created**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Anita Rao",
    "phone": "+919876543210",
    "consultationDate": "2026-11-01",
    "followUpDate": "2026-11-10",
    "followUpStatus": "pending",
    "completedAt": null,
    "createdAt": "2026-11-10 05:30:00"
  },
  "message": "Patient added"
}
```

**Errors**

| Status | When |
|---|---|
| 400 | Missing or invalid fields, unknown field, malformed JSON |
| 409 | Same name, phone and follow-up date already exists |

400 example:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "name", "issue": "must be 2-100 characters" },
      { "field": "phone", "issue": "must be a string" }
    ]
  }
}
```

409 example:

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "A follow-up for this patient on this date already exists"
  }
}
```

---

#### GET /patients

Lists patients ordered by follow-up date, then id.

**Query parameters**

| Parameter | Type | Required | Allowed values |
|---|---|---|---|
| `status` | string | No | `pending`, `completed` |

**Request**

```bash
curl -s "http://localhost:3000/patients?status=pending"
```

**Success: 200 OK**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Anita Rao",
      "phone": "+919876543210",
      "consultationDate": "2026-11-01",
      "followUpDate": "2026-11-10",
      "followUpStatus": "pending",
      "completedAt": null,
      "createdAt": "2026-11-10 05:30:00"
    }
  ],
  "message": "Patients retrieved",
  "count": 1
}
```

**Errors**

| Status | When |
|---|---|
| 400 | Invalid, repeated or unknown query parameter |

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "status", "issue": "must be pending or completed" }
    ]
  }
}
```

---

#### GET /patients/due-today

Returns pending patients whose follow-up date is today (computed in `APP_TIMEZONE`).

**Query parameters**

| Parameter | Type | Required | Allowed values |
|---|---|---|---|
| `includeOverdue` | string | No | `true`, `false` (default `false`). When `true`, pending patients with an earlier follow-up date are included. |

**Request**

```bash
curl -s "http://localhost:3000/patients/due-today?includeOverdue=true"
```

**Success: 200 OK**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Anita Rao",
      "phone": "+919876543210",
      "consultationDate": "2026-11-01",
      "followUpDate": "2026-11-10",
      "followUpStatus": "pending",
      "completedAt": null,
      "createdAt": "2026-11-10 05:30:00"
    }
  ],
  "message": "Due today along with overdue patients retrieved",
  "count": 1,
  "date": "2026-11-10"
}
```

The message is `Due today patients retrieved` when `includeOverdue` is `false` or omitted.

**Errors**

| Status | When |
|---|---|
| 400 | `includeOverdue` is not `true` or `false`, or an unknown parameter is sent |

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "includeOverdue", "issue": "must be true or false" }
    ]
  }
}
```

---

#### PATCH /patients/:id/complete

Marks a follow-up as completed. Pending drafts for this patient are cancelled in the same transaction. No body is needed (any body is ignored).

**Path parameters**

| Parameter | Type | Rules |
|---|---|---|
| `id` | integer | Positive integer, no leading zeros, at most 2147483647 |

**Request**

```bash
curl -s -X PATCH http://localhost:3000/patients/1/complete
```

**Success: 200 OK**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Anita Rao",
    "phone": "+919876543210",
    "consultationDate": "2026-11-01",
    "followUpDate": "2026-11-10",
    "followUpStatus": "completed",
    "completedAt": "2026-11-10T05:45:00.000Z",
    "createdAt": "2026-11-10 05:30:00"
  },
  "message": "Follow-up marked as completed"
}
```

**Errors**

| Status | When |
|---|---|
| 400 | `id` is not a valid positive integer |
| 404 | No patient with this id |
| 409 | Follow-up already completed |

400 example:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "id", "issue": "must be a positive integer" }
    ]
  }
}
```

404 example:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Patient not found"
  }
}
```

409 example:

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Follow-up already completed"
  }
}
```

---

### 4.4 Drafts (AI workflow)

Draft fields: `id, patientId, patientName, followUpDate, message, source, status, reviewedAt, createdAt`.
`source` is `ai` or `mock`. `status` is `pending_review`, `approved`, `rejected` or `cancelled`. Phone numbers are never returned.

#### POST /drafts/generate

Creates one draft per due, pending patient who has no draft yet, at most `GENERATE_MAX_PER_CALL` per call. Safe to call repeatedly. Nothing is sent.

**Request body (optional)**

| Field | Type | Required | Rules |
|---|---|---|---|
| `includeOverdue` | boolean | No | Strict `true`/`false` (not a string). Default `false`. No other fields allowed. |

**Request**

```bash
curl -s -X POST http://localhost:3000/drafts/generate \
  -H "Content-Type: application/json" \
  -d '{"includeOverdue":false}'
```

**Success: 201 Created** (at least one draft created)

```json
{
  "success": true,
  "data": {
    "created": [
      {
        "id": 1,
        "patientId": 1,
        "patientName": "Aarav Sharma",
        "followUpDate": "2026-11-10",
        "message": "Hello Aarav, this is a gentle reminder from the clinic about your follow-up visit on 2026-11-10. Please reply to confirm a convenient time or to reschedule. Take care!",
        "source": "mock",
        "status": "pending_review",
        "reviewedAt": null,
        "createdAt": "2026-11-10 05:31:00"
      }
    ],
    "skipped": [],
    "remaining": 0
  },
  "message": "1 draft created (1 mock)"
}
```

**Success: 200 OK** (nothing created). The message is `No patients due` or `All due patients already have drafts`.

**Errors**

| Status | When |
|---|---|
| 400 | Body is not an object, `includeOverdue` is not a boolean, or an unknown field is sent |
| 429 | More than `RATE_LIMIT_GENERATE_MAX` calls per minute |

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "includeOverdue", "issue": "must be a boolean" }
    ]
  }
}
```

---

#### GET /drafts

Lists drafts, with `pending_review` first, then newest first.

**Query parameters**

| Parameter | Type | Required | Allowed values |
|---|---|---|---|
| `status` | string | No | `pending_review`, `approved`, `rejected`, `cancelled` |

**Request**

```bash
curl -s "http://localhost:3000/drafts?status=pending_review"
```

**Success: 200 OK**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "patientId": 1,
      "patientName": "Aarav Sharma",
      "followUpDate": "2026-11-10",
      "message": "Hello Aarav, this is a gentle reminder from the clinic about your follow-up visit on 2026-11-10. Please reply to confirm a convenient time or to reschedule. Take care!",
      "source": "mock",
      "status": "pending_review",
      "reviewedAt": null,
      "createdAt": "2026-11-10 05:31:00"
    }
  ],
  "message": "Drafts retrieved",
  "count": 1
}
```

**Errors**

| Status | When |
|---|---|
| 400 | Invalid, repeated or unknown query parameter |

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "status", "issue": "must be one of: pending_review, approved, rejected, cancelled" }
    ]
  }
}
```

---

#### GET /drafts/summary

Returns today's counts plus a short English summary. No query parameters are accepted.

**Request**

```bash
curl -s http://localhost:3000/drafts/summary
```

**Success: 200 OK**

```json
{
  "success": true,
  "data": {
    "date": "2026-11-10",
    "patients": {
      "total": 6,
      "pending": 5,
      "completed": 1,
      "dueToday": 2,
      "overdue": 1
    },
    "drafts": {
      "total": 2,
      "pendingReview": 2,
      "approved": 0,
      "rejected": 0,
      "cancelled": 0
    },
    "summaryText": "Daily status update for 2026-11-10: We have 6 total patients, with 5 pending follow-up and 1 completed. 2 are due today, 1 is overdue, and there are currently 0 total drafts.",
    "summarySource": "ai",
    "fallbackReason": null
  },
  "message": "Summary retrieved"
}
```

**Field reference**

| Field | Meaning |
|---|---|
| `date` | Application date in `APP_TIMEZONE` (`YYYY-MM-DD`) |
| `patients.total` | All patients |
| `patients.pending` / `completed` | Follow-ups not yet completed / completed |
| `patients.dueToday` / `overdue` | Pending with follow-up date today / before today |
| `drafts.total` | Total follow-up message drafts |
| `drafts.pendingReview` / `approved` / `rejected` | Drafts by review status |
| `drafts.cancelled` | Drafts cancelled automatically when their patient was completed |
| `summaryText` | Readable summary of the counts |
| `summarySource` | `ai` (written by the model) or `mock` (fixed template) |
| `fallbackReason` | `null` when AI was used; otherwise why the template was used (`mock_mode`, `missing_api_key`, `timeout`, `http status code`, `network_error`, `unusable_output`) |

**Fallback example** (AI unavailable or mock mode, same counts):

```json
{
  "success": true,
  "data": {
    "date": "2026-11-10",
    "patients": {
      "total": 6,
      "pending": 5,
      "completed": 1,
      "dueToday": 2,
      "overdue": 1
    },
    "drafts": {
      "total": 2,
      "pendingReview": 2,
      "approved": 0,
      "rejected": 0,
      "cancelled": 0
    },
    "summaryText": "Daily Summary (2026-11-10): 6 total patients (5 pending, 1 completed). 2 due today, 1 overdue. Drafts: 2 total (2 pending review, 0 approved, 0 rejected, 0 cancelled).",
    "summarySource": "mock",
    "fallbackReason": "mock_mode"
  },
  "message": "Summary retrieved"
}
```

Counts are always computed by the server. The model only words the summary and never receives names or phone numbers.

**Errors**

| Status | When |
|---|---|
| 400 | Any query parameter is sent |

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "query", "issue": "query parameters not allowed" }
    ]
  }
}
```

---

#### PATCH /drafts/:id/approve

Approves a draft that is pending review, optionally replacing its text. Nothing is sent.

**Path parameters**

| Parameter | Type | Rules |
|---|---|---|
| `id` | integer | Positive integer, at most 2147483647 |

**Request body (optional)**

| Field | Type | Required | Rules |
|---|---|---|---|
| `message` | string | No | After trimming: 100-500 characters and at least one letter. No other fields allowed. |

**Request**

```bash
curl -s -X PATCH http://localhost:3000/drafts/1/approve \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello Aarav, this is a reminder about your follow-up visit on 2026-11-10. Please reply to let us know if the morning works for you, or if you would like to choose another time. Take care!"}'
```

**Success: 200 OK**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "patientId": 1,
    "patientName": "Aarav Sharma",
    "followUpDate": "2026-11-10",
    "message": "Hello Aarav, this is a reminder about your follow-up visit on 2026-11-10. Please reply to let us know if the morning works for you, or if you would like to choose another time. Take care!",
    "source": "mock",
    "status": "approved",
    "reviewedAt": "2026-11-10T05:40:00.000Z",
    "createdAt": "2026-11-10 05:31:00"
  },
  "message": "Approved, ready to send (simulated). No message was sent."
}
```

**Errors**

| Status | When |
|---|---|
| 400 | Invalid id, message outside 100-500 characters or without letters, unknown field |
| 404 | No draft with this id |
| 409 | Draft is not pending review (already approved, rejected or cancelled) |

400 example:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "message", "issue": "must be 100-500 characters" }
    ]
  }
}
```

404 example:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Draft not found"
  }
}
```

409 example:

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Draft is not pending review"
  }
}
```

---

#### PATCH /drafts/:id/reject

Rejects a draft that is pending review. Does not change the patient's follow-up status. No body is needed.

**Path parameters**

| Parameter | Type | Rules |
|---|---|---|
| `id` | integer | Positive integer, at most 2147483647 |

**Request**

```bash
curl -s -X PATCH http://localhost:3000/drafts/2/reject
```

**Success: 200 OK**

```json
{
  "success": true,
  "data": {
    "id": 2,
    "patientId": 2,
    "patientName": "Diya Patel",
    "followUpDate": "2026-11-10",
    "message": "Hello Diya, this is a gentle reminder from the clinic about your follow-up visit on 2026-11-10. Please reply to confirm a convenient time or to reschedule. Take care!",
    "source": "mock",
    "status": "rejected",
    "reviewedAt": "2026-11-10T05:41:00.000Z",
    "createdAt": "2026-11-10 05:31:00"
  },
  "message": "Draft rejected. No message was sent."
}
```

**Errors**

| Status | When |
|---|---|
| 400 | Invalid id |
| 404 | No draft with this id |
| 409 | Draft is not pending review |

400 example:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "id", "issue": "must be a positive integer" }
    ]
  }
}
```

404 example:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Draft not found"
  }
}
```

409 example:

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Draft is not pending review"
  }
}
```

---

### 4.5 System

#### GET /health

**Request**

```bash
curl -s http://localhost:3000/health
```

**Success: 200 OK**

```json
{
  "success": true,
  "data": {
    "status": "ok"
  },
  "message": "Service is healthy"
}
```

**Errors:** 500 only if the server fails unexpectedly.

## 5. AI Follow-Up Workflow

1. Identify due pending patients.
2. Generate personalized WhatsApp drafts sequentially via Gemini (or mock fallback).
3. Staff reviews pending drafts through the API.
4. Staff approves (optionally with edited text) or rejects each draft.
5. Nothing is ever sent; approved drafts are marked simulated send-ready only.

- Real AI mode: Set `AI_MODE=ai`, specify `GEMINI_MODEL=gemini-3.5-flash`, and provide `GEMINI_API_KEY` in `.env`. Only the patient first name and follow-up date are sent to the model (phone numbers and patient IDs are never forwarded).
- Mock mode: Triggered when `AI_MODE=mock`, `GEMINI_API_KEY` is missing, or the Gemini API call fails, times out, or returns unusable text. Exact mock text for patient Anita Rao: `"Hello Anita, this is a gentle reminder from the clinic about your follow-up visit on 2026-11-10. Please reply to confirm a convenient time or to reschedule. Take care!"`. Resulting draft object:
  ```json
  {"id":1,"patientId":1,"patientName":"Anita Rao","followUpDate":"2026-11-10","message":"Hello Anita, this is a gentle reminder from the clinic about your follow-up visit on 2026-11-10. Please reply to confirm a convenient time or to reschedule. Take care!","source":"mock","status":"pending_review"}
  ```
- Limitation: The mock is a fixed template with only first name and date filled in, so every message reads the same and is not personalized by a model. Drafts are labeled `source: "ai"` or `source: "mock"` so staff always know which they are reviewing.

## 6. How to Test

Run the full automated test suite (covers in-memory unit, integration, validation, security, and AI prompt safety tests):
```bash
npm test
```

Manual 8-step curl walkthrough:
1. Seed database: `npm run seed`
2. Generate drafts: `curl -s -X POST http://localhost:3000/drafts/generate -H "Content-Type: application/json" -d "{}"`
3. List drafts: `curl -s "http://localhost:3000/drafts?status=pending_review"`
4. Approve with edited message: `curl -s -X PATCH http://localhost:3000/drafts/1/approve -H "Content-Type: application/json" -d '{"message":"Hello Aarav, your follow-up is on 2026-11-10. Please reply if morning works for you. Take care and stay healthy!"}'`
5. Reject another draft: `curl -s -X PATCH http://localhost:3000/drafts/2/reject`
6. Repeat approve to see 409: `curl -s -X PATCH http://localhost:3000/drafts/1/approve`
7. View daily summary: `curl -s http://localhost:3000/drafts/summary`
8. Complete a patient: `curl -s -X PATCH http://localhost:3000/patients/1/complete`

## 7. Known Limitations

- No user authentication or role-based access control, so not intended for real patient data.
- Mock mode uses fixed template interpolation rather than generative personalization.
- No real WhatsApp or messaging provider integration; approval is simulated only.
- SQLite is local and single-node (not distributed).
- A rejected draft blocks regenerating another draft for that patient and date due to the unique constraint.
