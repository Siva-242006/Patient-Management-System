# Patient Follow-Up System — Backend REST API

A lightweight REST API built with Node.js, Express, and SQLite (`better-sqlite3`) for managing patient follow-up schedules.

---

## 1. Dependencies

- **Runtime**: Node.js `v20.0.0` or higher (ES Modules)
- **Production Dependencies**:
  - `express`: Fast, minimalist web framework
  - `better-sqlite3`: Fast, synchronous SQLite3 driver
  - `dotenv`: Environment configuration loader
  - `helmet`: Security HTTP headers
  - `express-rate-limit`: Basic rate limiting middleware
- **Development & Testing**:
  - `supertest`: HTTP assertions for integration testing
  - `node:test`: Built-in Node.js test runner

---

## 2. Setup & How to Run

### Installation
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
```

### Environment Variables (`.env`)
```env
PORT=3000
DB_PATH=./data/app.db
APP_TIMEZONE=Asia/Kolkata
RATE_LIMIT_MAX=100
RATE_LIMIT_WRITE_MAX=30
```

### Running the Application
```bash
# Start in development mode (with auto-reload)
npm run dev

# Start in production mode
npm start

# Seed the database with 6 fictional patients
npm run seed
```

---

## 3. API Endpoints

All responses use a consistent JSON envelope format.

| Method | Endpoint | Query Parameters | Description |
|---|---|---|---|
| `GET` | `/health` | None | Service health check |
| `GET` | `/patients` | `status` (`pending` \| `completed`) | List patients (ordered by follow-up date, then ID) |
| `GET` | `/patients/due-today` | `includeOverdue` (`true` \| `false`) | List pending patients due today (or overdue) |
| `POST` | `/patients` | None | Create a new patient follow-up record |
| `PATCH` | `/patients/:id/complete` | None | Atomically mark a follow-up as completed |

---

### Endpoint Details & Examples

#### 1. `GET /health`
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "data": { "status": "ok" },
  "message": "Service is healthy"
}
```

#### 2. `GET /patients`
- **Optional Query**: `?status=pending` or `?status=completed`
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Aarav Sharma",
      "phone": "+919000000001",
      "consultationDate": "2026-11-04",
      "followUpDate": "2026-11-09",
      "followUpStatus": "pending",
      "completedAt": null,
      "createdAt": "2026-11-09 13:43:21"
    }
  ],
  "message": "Patients retrieved",
  "count": 1
}
```

#### 3. `GET /patients/due-today`
- **Optional Query**: `?includeOverdue=true` (defaults to `false`)
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Aarav Sharma",
      "phone": "+919000000001",
      "consultationDate": "2026-11-04",
      "followUpDate": "2026-11-09",
      "followUpStatus": "pending",
      "completedAt": null,
      "createdAt": "2026-11-09 13:43:21"
    }
  ],
  "message": "Due today patients retrieved",
  "count": 1,
  "date": "2026-11-09"
}
```

#### 4. `POST /patients`
- **Headers**: `Content-Type: application/json`
- **Body**:
```json
{
  "name": "Anita Rao",
  "phone": "98765 43210",
  "consultationDate": "2026-11-01",
  "followUpDate": "2026-11-15"
}
```
- **Response (`201 Created`)**:
```json
{
  "success": true,
  "data": {
    "id": 7,
    "name": "Anita Rao",
    "phone": "+919876543210",
    "consultationDate": "2026-11-01",
    "followUpDate": "2026-11-15",
    "followUpStatus": "pending",
    "completedAt": null,
    "createdAt": "2026-11-09 14:00:00"
  },
  "message": "Patient added"
}
```

#### 5. `PATCH /patients/:id/complete`
- **URL Parameter**: `:id` (positive integer)
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Aarav Sharma",
    "phone": "+919000000001",
    "consultationDate": "2026-11-04",
    "followUpDate": "2026-11-09",
    "followUpStatus": "completed",
    "completedAt": "2026-11-09T14:05:00.000Z",
    "createdAt": "2026-11-09 13:43:21"
  },
  "message": "Follow-up marked as completed"
}
```

---

## 4. Validation Rules & Error Handling

### Standard Error Envelope
All error responses return a standardized format:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "phone", "issue": "must be a valid 10-digit Indian mobile number" }
    ]
  }
}
```

### Input Validation
- **`name`**: String, 2–100 characters. Letters, accents, spaces, hyphens, and apostrophes only. Whitespace is automatically trimmed and internal runs collapsed.
- **`phone`**: String, max 20 chars raw. Accepts 10 digits starting with 6–9 (optional `+91` or `91` prefix, spaces/hyphens permitted). Normalized and stored as `+91XXXXXXXXXX`.
- **`consultationDate`**: Real calendar date (`YYYY-MM-DD`). Must be on or before today, within the last 365 days.
- **`followUpDate`**: Real calendar date (`YYYY-MM-DD`). Must be on or after `consultationDate` and within 365 days of consultation.
- **Query Parameters**: Strict allowlist (`status` for `/patients`, `includeOverdue` for `/patients/due-today`). Unknown parameters return `400 VALIDATION_ERROR`.
- **Duplicate Prevention**: Re-adding the same patient name, phone, and follow-up date returns `409 CONFLICT`.

### HTTP Status Codes
- `200 OK`: Successful read or update.
- `201 Created`: Successful creation.
- `400 Bad Request` (`VALIDATION_ERROR`): Missing fields, invalid format, or malformed JSON.
- `404 Not Found` (`NOT_FOUND`): Nonexistent patient ID or unknown route.
- `409 Conflict` (`CONFLICT`): Duplicate follow-up or double-completion of a patient.
- `413 Payload Too Large` (`PAYLOAD_TOO_LARGE`): Request body exceeds 10kb limit.
- `415 Unsupported Media Type` (`UNSUPPORTED_MEDIA_TYPE`): Missing `Content-Type: application/json`.
- `429 Rate Limited` (`RATE_LIMITED`): Exceeded request limit (100 req/min general, 30 req/min writes).
- `500 Internal Error` (`INTERNAL_ERROR`): Server error (stack traces and internal details suppressed).

---

## 5. How to Test

### Automated Test Suite
Run the 70 automated integration and security tests (runs against an isolated in-memory SQLite database):
```bash
npm test
```

### Manual Testing with Postman
Import the included collection [`postman_collection.json`](./postman_collection.json) into Postman to run pre-configured requests for all endpoints, including valid operations and bad-input test cases.

### Manual Testing with PowerShell (`curl.exe`)
Make sure the server is running (`npm run dev`), then execute:

```powershell
# 1. Health check
curl.exe -i http://localhost:3000/health

# 2. Create patient
curl.exe -i -X POST http://localhost:3000/patients -H "Content-Type: application/json" -d "{\`"name\`":\`"Anita Rao\`",\`"phone\`":\`"98765 43210\`",\`"consultationDate\`":\`"2026-11-01\`",\`"followUpDate\`":\`"2026-11-15\`"}"

# 3. List patients
curl.exe -i "http://localhost:3000/patients?status=pending"

# 4. Due today
curl.exe -i "http://localhost:3000/patients/due-today?includeOverdue=true"

# 5. Complete follow-up
curl.exe -i -X PATCH http://localhost:3000/patients/1/complete

# 6. Test bad input (invalid phone -> 400)
curl.exe -i -X POST http://localhost:3000/patients -H "Content-Type: application/json" -d "{\`"name\`":\`"Anita Rao\`",\`"phone\`":\`"5876543210\`",\`"consultationDate\`":\`"2026-11-01\`",\`"followUpDate\`":\`"2026-11-15\`"}"
```
