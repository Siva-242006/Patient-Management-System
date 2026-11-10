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

## 4. API Endpoints

Common response envelopes:
- Success: `{"success": true, "data": <payload>, "message": "<info>"}`
- Error: `{"success": false, "error": {"code": "<CODE>", "message": "<info>", "details": [...]}}`
- Error codes and HTTP statuses: `400 VALIDATION_ERROR`, `404 NOT_FOUND`, `409 CONFLICT`, `413 PAYLOAD_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

Key validation rules:
- Required body fields cannot be omitted or null.
- Phone must be a 10-digit Indian number starting 6-9, stored as `+91XXXXXXXXXX`.
- Dates must be real calendar dates in `YYYY-MM-DD` format.
- `followUpDate` must be on or after `consultationDate` and within 365 days.
- Draft approve `message` must be 100-500 characters and contain letters.

Security: Protected with Helmet headers, no CORS headers, strict rate limits, and zero logging of patient identifiers.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/patients` | Create patient follow-up record |
| `GET` | `/patients` | List patients (`?status=pending\|completed`) |
| `GET` | `/patients/due-today` | List patients due today (`?includeOverdue=true`) |
| `PATCH` | `/patients/:id/complete` | Complete follow-up and cancel pending drafts |
| `POST` | `/drafts/generate` | Generate drafts for due patients |
| `GET` | `/drafts` | List drafts (`?status=pending_review\|approved\|rejected\|cancelled`) |
| `PATCH` | `/drafts/:id/approve` | Approve draft (optional edited message) |
| `PATCH` | `/drafts/:id/reject` | Reject draft |
| `GET` | `/drafts/summary` | Summary review list (`GET /drafts` with count and filters) |
| `GET` | `/health` | Service health check |

### Endpoint Details

#### POST /patients
- Body: `name` (string, 2-100 chars), `phone` (string, 10-digit Indian), `consultationDate` (`YYYY-MM-DD`), `followUpDate` (`YYYY-MM-DD`).
- Curl: `curl -s -X POST http://localhost:3000/patients -H "Content-Type: application/json" -d '{"name":"Anita Rao","phone":"9876543210","consultationDate":"2026-11-01","followUpDate":"2026-11-10"}'`
- Success (`201`): `{"success":true,"data":{"id":1,"name":"Anita Rao","phone":"+919876543210","followUpStatus":"pending"},"message":"Patient follow-up created"}`
- Error statuses: `400 VALIDATION_ERROR`, `409 CONFLICT`, `413 PAYLOAD_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`.

#### GET /patients
- Query: `status` (optional string, `pending` or `completed`).
- Curl: `curl -s "http://localhost:3000/patients?status=pending"`
- Success (`200`): `{"success":true,"data":[{"id":1,"name":"Anita Rao","followUpStatus":"pending"}],"count":1,"message":"Patients retrieved"}`
- Error statuses: `400 VALIDATION_ERROR`.

#### GET /patients/due-today
- Query: `includeOverdue` (optional boolean string, `true` or `false`, default `false`).
- Curl: `curl -s "http://localhost:3000/patients/due-today?includeOverdue=true"`
- Success (`200`): `{"success":true,"data":[{"id":1,"name":"Anita Rao","followUpDate":"2026-11-10"}],"count":1,"message":"Patients retrieved","date":"2026-11-10"}`
- Error statuses: `400 VALIDATION_ERROR`.

#### PATCH /patients/:id/complete
- Path: `:id` (integer string, 1-2147483647). Body: ignored.
- Curl: `curl -s -X PATCH http://localhost:3000/patients/1/complete`
- Success (`200`): `{"success":true,"data":{"id":1,"followUpStatus":"completed","completedAt":"2026-11-10T04:00:00.000Z"},"message":"Follow-up marked as completed"}`
- Error statuses: `400 VALIDATION_ERROR`, `404 NOT_FOUND`, `409 CONFLICT`.

#### POST /drafts/generate
- Body: optional JSON object with only `includeOverdue` (strict boolean, default `false`).
- Curl: `curl -s -X POST http://localhost:3000/drafts/generate -H "Content-Type: application/json" -d '{"includeOverdue":false}'`
- Success (`201` or `200`): `{"success":true,"data":{"created":[{"id":1,"patientId":1,"source":"mock","status":"pending_review"}],"skipped":[],"remaining":0},"message":"1 draft created (1 mock)"}`
- Error statuses: `400 VALIDATION_ERROR`, `413 PAYLOAD_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`.

#### GET /drafts
- Query: `status` (optional string: `pending_review`, `approved`, `rejected`, `cancelled`).
- Curl: `curl -s "http://localhost:3000/drafts?status=pending_review"`
- Success (`200`): `{"success":true,"data":[{"id":1,"patientName":"Anita Rao","status":"pending_review"}],"count":1,"message":"Drafts retrieved"}`
- Error statuses: `400 VALIDATION_ERROR`.

#### PATCH /drafts/:id/approve
- Path: `:id` (integer string, 1-2147483647). Body: optional `message` (string, 100-500 chars with letters).
- Curl: `curl -s -X PATCH http://localhost:3000/drafts/1/approve -H "Content-Type: application/json" -d '{"message":"Hello Anita, this is a reminder about your follow-up on 2026-11-10. Please reply to let us know if morning works for you. Take care!"}'`
- Success (`200`): `{"success":true,"data":{"id":1,"status":"approved","reviewedAt":"2026-11-10T04:05:00.000Z"},"message":"Approved, ready to send (simulated). No message was sent."}`
- Error statuses: `400 VALIDATION_ERROR`, `404 NOT_FOUND`, `409 CONFLICT`.

#### PATCH /drafts/:id/reject
- Path: `:id` (integer string, 1-2147483647). Body: ignored.
- Curl: `curl -s -X PATCH http://localhost:3000/drafts/1/reject`
- Success (`200`): `{"success":true,"data":{"id":1,"status":"rejected","reviewedAt":"2026-11-10T04:06:00.000Z"},"message":"Draft rejected. No message was sent."}`
- Error statuses: `400 VALIDATION_ERROR`, `404 NOT_FOUND`, `409 CONFLICT`.

#### GET /drafts/summary
- Request: served via `GET /drafts` with status filtering and total count metadata.
- Curl: `curl -s "http://localhost:3000/drafts?status=approved"`
- Success (`200`): `{"success":true,"data":[{"id":1,"status":"approved"}],"count":1,"message":"Drafts retrieved"}`
- Error statuses: `400 VALIDATION_ERROR`.

#### GET /health
- Request: none.
- Curl: `curl -s http://localhost:3000/health`
- Success (`200`): `{"success":true,"data":{"status":"ok"},"message":"Service is healthy"}`
- Error statuses: `500 INTERNAL_ERROR`.

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

Run the full automated test suite (covers 127 in-memory unit, integration, validation, security, and AI prompt safety tests):
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
7. View summary of approved drafts: `curl -s "http://localhost:3000/drafts?status=approved"`
8. Complete a patient: `curl -s -X PATCH http://localhost:3000/patients/1/complete`

## 7. Known Limitations

- No user authentication or role-based access control, so not intended for real patient data.
- Mock mode uses fixed template interpolation rather than generative personalization.
- No real WhatsApp or messaging provider integration; approval is simulated only.
- SQLite is local and single-node (not distributed).
- A rejected draft blocks regenerating another draft for that patient and date due to the unique constraint.
