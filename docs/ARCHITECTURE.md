# Attendly Architecture (`docs/ARCHITECTURE.md`)

## System Overview

Attendly separates location evidence collection, deterministic attendance verification, and user interface presentation into distinct layers:

1. **Client & Background Location Layer (Mobile / PWA)**:
   - Requests foreground location permission first, then presents an explicit disclosure before requesting background location access (`ACCESS_BACKGROUND_LOCATION` on Android).
   - Monitors geofence entry/exit (`ATTENDLY_COLLEGE_GEOFENCE_TASK`) and records periodic presence observations with client-generated UUIDs (`eventId`).
   - Persists unsynced observations in a local offline queue (`SQLite` on Android / `localStorage` queue on Web) when connectivity is unavailable.

2. **Deterministic Attendance Verification Engine (`src/engine/attendanceEngine.ts`)**:
   - Validates coordinates, GPS accuracy (`<= 50m` primary target, `100m` fallback), and timestamp integrity.
   - Computes continuous verified intervals inside the college geofence (`distance <= radiusMeters`).
   - Never bridges unverified gaps larger than `maxEvidenceGapMinutes` (default `15` minutes).
   - Marks `PRESENT` only when accumulated verified presence reaches `minimumVerifiedMinutes` (default `30` minutes = `1800` seconds) within configured working hours.

3. **Authoritative Backend API (`server.ts`, `src/server/apiRouter.ts`)**:
   - Exposes `/api/v1/*` endpoints protected by HMAC-SHA256 JWT access tokens and rotating refresh tokens.
   - Deduplicates incoming location events by `{ userId, eventId }` and guarantees at most one attendance record per `{ userId, attendanceDate }`.
   - Computes monthly calendars and semester summaries while excluding holidays, non-working days, future dates, and `UNKNOWN` dates from the attendance percentage denominator.
