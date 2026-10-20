# Location Permissions & Android Background Execution (`docs/LOCATION_PERMISSIONS.md`)

## Android Permission Flow

1. **Explicit Onboarding Disclosure**:
   Before requesting system permissions, Attendly displays a dedicated screen explaining that background location is used solely to detect when the student's phone enters and remains inside their configured college geofence for at least 30 minutes during college working hours.
2. **Staged Permission Requests**:
   - Step 1: Request `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` (Foreground).
   - Step 2: Request `ACCESS_BACKGROUND_LOCATION` ("Allow all the time") so geofence entry can be detected without manually opening the app.
   - Step 3: Register Android Foreground Service (`FOREGROUND_SERVICE_LOCATION`) when active verification is collecting 30-minute presence evidence.

## Platform Limitations & Recovery Behavior

- **Permission Revocation / GPS Disabled**: Detected on app launch and background task wakeup; today's unresolved state is marked `UNKNOWN` (never falsely marked `ABSENT`), and the dashboard displays a diagnostic banner with one-tap recovery instructions.
- **OEM Battery Optimization / Force-Stop**: Aggressive battery savers can delay geofence callbacks. Attendly queues any delayed observations locally and reconciles them idempotently on the next sync.
- **Pause / Resume Control**: Students can pause tracking at any time from the Home Dashboard or Settings screen, immediately stopping background location listeners.
