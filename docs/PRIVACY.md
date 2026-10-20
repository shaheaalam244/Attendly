# Privacy & Data Governance (`docs/PRIVACY.md`)

## Privacy Principles

1. **Explicit Consent Before Tracking**:
   Automatic tracking is disabled by default for new accounts until the student explicitly reviews the background location disclosure and enables tracking.
2. **Visible & Immediate Pause Control**:
   Students can pause or resume tracking with a single tap on the Home Dashboard or in Settings & Privacy.
3. **Minimized Retention of Raw Location Events**:
   Raw geofence observations expire automatically according to the user's `retainRawEventsDays` preference (default 30 days, configurable down to 7 days).
4. **Full Data Portability & Permanent Account Deletion**:
   - Students can export all attendance records as CSV or JSON at any time (`GET /api/v1/attendance/export`).
   - Students can delete individual attendance records or permanently delete their entire account and all associated records (`DELETE /api/v1/account`).
