# API Reference (`docs/API.md`)

All endpoints are versioned under `/api/v1` and return JSON `{ success: boolean, data?: ..., error?: { code, message } }`.

## Authentication
- `POST /api/v1/auth/register` — Create student account.
- `POST /api/v1/auth/login` — Authenticate and receive `accessToken` + `refreshToken`.
- `POST /api/v1/auth/refresh` — Rotate refresh token and issue new access token.
- `POST /api/v1/auth/logout` — Revoke refresh token.
- `POST /api/v1/auth/forgot-password` — Request password reset (returns `503 EMAIL_PROVIDER_NOT_CONFIGURED` if SMTP is not configured).
- `POST /api/v1/auth/reset-password` — Complete password reset.
- `GET /api/v1/auth/me` — Retrieve current student profile and college configuration.

## College & Tracking
- `GET /api/v1/colleges/search?q=<query>` — Search college campus directory.
- `GET /api/v1/college-settings` — Retrieve user's college geofence & working hours.
- `PATCH /api/v1/college-settings` — Update geofence coordinates, radius, working hours/days, and threshold without altering historical records.
- `GET /api/v1/tracking/status` — Retrieve tracking state, permission status, and last sync time.
- `PATCH /api/v1/tracking/settings` — Pause or resume automatic tracking and update permission status.
- `POST /api/v1/attendance/sync` — Batch upload client-UUID location observations for authoritative server verification.

## Attendance, Calendar & Privacy
- `GET /api/v1/attendance/today` — Retrieve today's live verification progress and arrival time.
- `GET /api/v1/attendance/monthly?year=2026&month=10` — Retrieve monthly and semester summaries.
- `GET /api/v1/attendance/history?status=ALL&month=ALL&page=1` — Paginated chronological history.
- `GET /api/v1/attendance/export?format=csv` — Download CSV or JSON attendance report.
- `GET /api/v1/attendance/:date` — Inspect observations and status for `YYYY-MM-DD`.
- `POST /api/v1/attendance/:date/correction-request` — Submit and record an audited manual correction.
- `DELETE /api/v1/attendance/:date` — Delete an individual attendance record.
- `GET /api/v1/calendar/:year/:month` — Retrieve full calendar grid and monthly metrics.
- `GET /api/v1/holidays`, `POST /api/v1/holidays`, `DELETE /api/v1/holidays/:id` — Manage personal/academic holidays.
- `GET /api/v1/privacy/settings`, `PATCH /api/v1/privacy/settings`, `DELETE /api/v1/account` — Manage retention policy, audit logs, and permanent account deletion.
