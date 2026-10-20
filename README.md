# Attendly — Automatic College Attendance Tracker

> **"You Go to College. We Track Your Attendance."**  
> *Your Attendance, Automatically.*

**Attendly** is a full-stack mobile-first PWA and Android React Native/Expo application that helps college students automatically track their daily campus attendance when their phone remains within a configured college geofence for at least **30 minutes of verified location evidence**.

> **Important Scope Notice**: Attendly is a personal attendance-tracking assistant for students. GPS geofence presence is best-effort personal evidence and does not constitute official proof of classroom participation or guarantee uninterrupted background tracking under aggressive OEM battery restrictions.

---

## Architecture & Repository Layout

- `src/engine/attendanceEngine.ts` — Pure, deterministic Attendance Verification Engine & Monthly/Semester Reporting Service (Haversine geofence verification, 30-minute minimum presence threshold, 15-minute max evidence gap rule, working-hours validation, and holiday/unknown exclusion math).
- `src/engine/attendanceEngine.test.ts` — Unit tests for the attendance verification engine (`node:test`).
- `src/server/` — Modular Express `/api/v1` backend (`auth.ts`, `store.ts`, `apiRouter.ts`, `models/mongooseModels.ts`).
- `src/server/api.test.ts` — End-to-end API integration tests (`node:test`).
- `src/components/` — Reusable Attendly UI components (`AttendlyLogo`, `AttendanceStatusCard`, `MonthlySummaryCard`, `AttendanceCalendar`, `TrackingStatusIndicator`, `PWAInstallButton`, `StateViews`).
- `src/store/useAttendlyStore.ts` — Zustand state management with persistent offline event queue and `/api/v1` synchronization.
- `mobile/` — Expo / React Native Android configuration (`app.json`, `eas.json`, adaptive icons, and native background location task specifications).
- `docs/` — Architecture, Location Permissions, Attendance Algorithm, API Reference, Database Schema, Deployment, Privacy, and Testing guides.

---

## Quick Start & Commands

```bash
# Install dependencies
npm install

# Run full-stack server (Express API + Vite frontend on port 3000)
npm run dev

# Run deterministic unit & API integration tests
npm test

# Type-check codebase
npm run lint

# Build production bundle
npm run build
```

### Demo Student Account (Pre-Seeded)
- **Email**: `aarav.sharma@iitb.ac.in`
- **Password**: `Attendly@2026`
- **Configured Campus**: Indian Institute of Technology Bombay (150m radius, 09:00–17:00 IST, Mon–Sat)
