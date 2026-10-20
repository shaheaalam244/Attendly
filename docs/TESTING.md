# Testing Guide (`docs/TESTING.md`)

## Automated Test Suites

Run the complete unit and API integration test suite using Node 22's built-in test runner:

```bash
npm test
# or directly:
node --test src/engine/attendanceEngine.test.ts src/server/api.test.ts
```

### What Is Tested Automatically
1. **Attendance Verification Engine (`src/engine/attendanceEngine.test.ts`)**:
   - Haversine distance calculation accuracy.
   - 30-minute continuous inside-geofence observations transitioning `PENDING` -> `PRESENT`.
   - Rejection of unverified 30+ minute gaps between observations.
   - Geofence exit and same-day re-entry interval accumulation without bridging outside time.
   - Event UUID deduplication, excessive GPS inaccuracy rejection (`>100m`), and future timestamp rejection.
   - Monthly attendance percentage calculation excluding holidays, weekly offs, future dates, and `UNKNOWN` dates.
   - Zero-denominator handling (`"No eligible working days"`).

2. **Backend API Integration (`src/server/api.test.ts`)**:
   - `/health` endpoint verification.
   - Unauthorized request rejection (`401`).
   - Authentication (`login`, `register`) and JWT Bearer validation.
   - Live location event batch synchronization (`POST /api/v1/attendance/sync`) with duplicate filtering and status transition to `PRESENT`.
   - Cross-user data isolation (`Priya` cannot access `Aarav`'s records).
   - Holiday creation/deletion, CSV export, and permanent account deletion (`DELETE /api/v1/account`).

## Physical Android Device Test Scenarios (Manual QA Checklist)
Physical device behavior under OEM battery savers, screen lock, device reboot (`RECEIVE_BOOT_COMPLETED`), and real cellular/GPS transitions must be verified on a physical Android handset using the EAS development build (`eas build --profile development --platform android`).
