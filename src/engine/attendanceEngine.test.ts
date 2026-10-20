import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  AttendanceStatus,
  LocationEventType,
  calculateDistanceMeters,
  evaluateAttendanceSession,
  buildMonthlyCalendarAndSummary,
  verifyPointAgainstGeofence,
  resolveReverseGeocodeLocation,
  evaluateGoogleMapsConfigStatus,
  createInitialMapPickerState,
  applyCameraPanOrZoom,
  applyExplicitCenterSelection,
  applyGeofenceRadiusUpdate,
  type CollegeConfig,
  type RawLocationObservation,
  type StoredAttendanceRecord,
  type HolidayItem,
} from './attendanceEngine.ts';
import { createExpressApp } from '../../server.ts';
import { AttendlyDataStore } from '../server/store.ts';

const defaultCollege: CollegeConfig = {
  collegeId: 'col_iitb',
  collegeName: 'Indian Institute of Technology Bombay',
  address: 'Powai, Mumbai, Maharashtra 400076',
  latitude: 19.1334,
  longitude: 72.9133,
  radiusMeters: 150,
  workingDays: [1, 2, 3, 4, 5, 6], // Mon-Sat
  startTime: '09:00',
  endTime: '17:00',
  timezone: 'Asia/Kolkata',
  minimumVerifiedMinutes: 30,
  maximumVerificationWindowMinutes: 60,
  maxEvidenceGapMinutes: 15,
  maxAccuracyMeters: 50,
  outsideHoursPolicy: 'IGNORE',
};

test('calculateDistanceMeters computes accurate Haversine distance', () => {
  const samePoint = calculateDistanceMeters(19.1334, 72.9133, 19.1334, 72.9133);
  assert.equal(samePoint, 0);

  // ~100 meters north
  const nearby = calculateDistanceMeters(19.1334, 72.9133, 19.1343, 72.9133);
  assert.ok(nearby > 95 && nearby < 105, `Expected ~100m, got ${nearby}`);
});

test('30+ minutes of continuous inside-geofence observations marks PRESENT', () => {
  // 2026-10-19 is Monday. 04:00 UTC = 09:30 IST (within 09:00-17:00 IST)
  const observations: RawLocationObservation[] = [
    {
      eventId: 'evt-1',
      eventType: LocationEventType.ENTER,
      observedAt: '2026-10-19T04:00:00.000Z',
      latitude: 19.1334,
      longitude: 72.9133,
      accuracyMeters: 18,
    },
    {
      eventId: 'evt-2',
      eventType: LocationEventType.HEARTBEAT,
      observedAt: '2026-10-19T04:12:00.000Z',
      latitude: 19.1335,
      longitude: 72.9134,
      accuracyMeters: 22,
    },
    {
      eventId: 'evt-3',
      eventType: LocationEventType.HEARTBEAT,
      observedAt: '2026-10-19T04:24:00.000Z',
      latitude: 19.1334,
      longitude: 72.9132,
      accuracyMeters: 15,
    },
    {
      eventId: 'evt-4',
      eventType: LocationEventType.DWELL,
      observedAt: '2026-10-19T04:32:00.000Z',
      latitude: 19.1334,
      longitude: 72.9133,
      accuracyMeters: 19,
    },
  ];

  const result = evaluateAttendanceSession(observations, defaultCollege, {
    targetDate: '2026-10-19',
    referenceNowIso: '2026-10-19T05:00:00.000Z',
  });

  assert.equal(result.status, AttendanceStatus.PRESENT);
  assert.equal(result.verifiedDurationSeconds, 32 * 60);
  assert.equal(result.progressPercent, 100);
  assert.equal(result.firstConfirmedAt, '2026-10-19T04:00:00.000Z');
});

test('unverified 30-minute gap between two timestamps is NOT counted as confirmed presence', () => {
  // Two pings 35 minutes apart with no intermediate observations (>15m maxEvidenceGapMinutes)
  const observations: RawLocationObservation[] = [
    {
      eventId: 'gap-1',
      eventType: LocationEventType.ENTER,
      observedAt: '2026-10-19T04:00:00.000Z',
      latitude: 19.1334,
      longitude: 72.9133,
      accuracyMeters: 15,
    },
    {
      eventId: 'gap-2',
      eventType: LocationEventType.HEARTBEAT,
      observedAt: '2026-10-19T04:35:00.000Z',
      latitude: 19.1334,
      longitude: 72.9133,
      accuracyMeters: 15,
    },
  ];

  const result = evaluateAttendanceSession(observations, defaultCollege, {
    targetDate: '2026-10-19',
    referenceNowIso: '2026-10-19T05:00:00.000Z',
  });

  assert.equal(result.status, AttendanceStatus.PENDING);
  assert.equal(result.verifiedDurationSeconds, 0);
  assert.ok(result.warnings.some((w) => w.includes('Unverified gap')));
});

test('exit and re-entry accumulates separate valid intervals without bridging outside time', () => {
  // Session 1: 04:00 to 04:18 (18 mins) -> EXIT at 04:20
  // Session 2: Re-enter at 05:00 -> 05:14 (14 mins) -> Total = 32 mins -> PRESENT
  const observations: RawLocationObservation[] = [
    {
      eventId: 's1-1',
      eventType: LocationEventType.ENTER,
      observedAt: '2026-10-19T04:00:00.000Z',
      latitude: 19.1334,
      longitude: 72.9133,
      accuracyMeters: 14,
    },
    {
      eventId: 's1-2',
      eventType: LocationEventType.HEARTBEAT,
      observedAt: '2026-10-19T04:10:00.000Z',
      latitude: 19.1334,
      longitude: 72.9133,
      accuracyMeters: 14,
    },
    {
      eventId: 's1-3',
      eventType: LocationEventType.HEARTBEAT,
      observedAt: '2026-10-19T04:18:00.000Z',
      latitude: 19.1334,
      longitude: 72.9133,
      accuracyMeters: 14,
    },
    {
      eventId: 's1-exit',
      eventType: LocationEventType.EXIT,
      observedAt: '2026-10-19T04:20:00.000Z',
      latitude: 19.1380,
      longitude: 72.9190,
      accuracyMeters: 20,
    },
    {
      eventId: 's2-1',
      eventType: LocationEventType.ENTER,
      observedAt: '2026-10-19T05:00:00.000Z',
      latitude: 19.1334,
      longitude: 72.9133,
      accuracyMeters: 16,
    },
    {
      eventId: 's2-2',
      eventType: LocationEventType.HEARTBEAT,
      observedAt: '2026-10-19T05:14:00.000Z',
      latitude: 19.1334,
      longitude: 72.9133,
      accuracyMeters: 16,
    },
  ];

  const result = evaluateAttendanceSession(observations, defaultCollege, {
    targetDate: '2026-10-19',
    referenceNowIso: '2026-10-19T05:30:00.000Z',
  });

  assert.equal(result.intervals.length, 2);
  assert.equal(result.verifiedDurationSeconds, (18 + 14) * 60);
  assert.equal(result.status, AttendanceStatus.PRESENT);
});

test('deduplicates identical eventIds and rejects inaccurate or future observations', () => {
  const observations: RawLocationObservation[] = [
    {
      eventId: 'dup-1',
      eventType: LocationEventType.ENTER,
      observedAt: '2026-10-19T04:00:00.000Z',
      latitude: 19.1334,
      longitude: 72.9133,
      accuracyMeters: 15,
    },
    {
      eventId: 'dup-1', // duplicate
      eventType: LocationEventType.ENTER,
      observedAt: '2026-10-19T04:00:00.000Z',
      latitude: 19.1334,
      longitude: 72.9133,
      accuracyMeters: 15,
    },
    {
      eventId: 'bad-acc',
      eventType: LocationEventType.HEARTBEAT,
      observedAt: '2026-10-19T04:10:00.000Z',
      latitude: 19.1334,
      longitude: 72.9133,
      accuracyMeters: 450, // > 100m fallback limit
    },
    {
      eventId: 'future-ts',
      eventType: LocationEventType.HEARTBEAT,
      observedAt: '2026-10-19T08:00:00.000Z', // 3 hours ahead of referenceNowIso
      latitude: 19.1334,
      longitude: 72.9133,
      accuracyMeters: 15,
    },
  ];

  const result = evaluateAttendanceSession(observations, defaultCollege, {
    targetDate: '2026-10-19',
    referenceNowIso: '2026-10-19T05:00:00.000Z',
  });

  assert.deepEqual(result.duplicateEventIds, ['dup-1']);
  assert.equal(result.rejectedObservationCount, 2);
  assert.equal(result.validObservationCount, 1);
  assert.equal(result.status, AttendanceStatus.PENDING);
});

test('monthly percentage excludes holidays, non-working days, future dates, and UNKNOWN dates', () => {
  const records: StoredAttendanceRecord[] = [
    {
      id: 'r1',
      userId: 'u1',
      collegeId: 'col_iitb',
      attendanceDate: '2026-10-01', // Thu - PRESENT
      status: AttendanceStatus.PRESENT,
      firstConfirmedAt: '2026-10-01T03:45:00.000Z',
      lastConfirmedAt: '2026-10-01T04:20:00.000Z',
      verifiedDurationSeconds: 2100,
      detectionMethod: 'GEOFENCE_SESSION',
      correctionStatus: 'NONE',
      updatedAt: '2026-10-01T04:20:00.000Z',
    },
    {
      id: 'r2',
      userId: 'u1',
      collegeId: 'col_iitb',
      attendanceDate: '2026-10-03', // Sat - PRESENT
      status: AttendanceStatus.PRESENT,
      firstConfirmedAt: '2026-10-03T03:50:00.000Z',
      lastConfirmedAt: '2026-10-03T04:30:00.000Z',
      verifiedDurationSeconds: 2400,
      detectionMethod: 'GEOFENCE_SESSION',
      correctionStatus: 'NONE',
      updatedAt: '2026-10-03T04:30:00.000Z',
    },
    {
      id: 'r3',
      userId: 'u1',
      collegeId: 'col_iitb',
      attendanceDate: '2026-10-05', // Mon - ABSENT
      status: AttendanceStatus.ABSENT,
      firstConfirmedAt: null,
      lastConfirmedAt: null,
      verifiedDurationSeconds: 0,
      detectionMethod: 'DAILY_RECONCILIATION',
      correctionStatus: 'NONE',
      updatedAt: '2026-10-05T13:00:00.000Z',
    },
    {
      id: 'r4',
      userId: 'u1',
      collegeId: 'col_iitb',
      attendanceDate: '2026-10-06', // Tue - UNKNOWN (excluded from denominator)
      status: AttendanceStatus.UNKNOWN,
      firstConfirmedAt: null,
      lastConfirmedAt: null,
      verifiedDurationSeconds: 0,
      detectionMethod: 'DAILY_RECONCILIATION',
      correctionStatus: 'NONE',
      updatedAt: '2026-10-06T13:00:00.000Z',
    },
  ];

  const holidays: HolidayItem[] = [
    {
      id: 'h1',
      date: '2026-10-02', // Gandhi Jayanti
      name: 'Mahatma Gandhi Jayanti',
      holidayType: 'NATIONAL',
    },
  ];

  const { days, summary } = buildMonthlyCalendarAndSummary({
    year: 2026,
    month: 10,
    config: defaultCollege,
    records,
    holidays,
    referenceNowIso: '2026-10-19T07:00:00.000Z',
  });

  assert.equal(days.length, 31);
  assert.equal(summary.presentDays, 2);
  assert.equal(summary.absentDays, 1);
  assert.equal(summary.eligibleWorkingDays, 3); // 2 PRESENT + 1 ABSENT (holidays & UNKNOWN excluded)
  assert.equal(summary.attendancePercentage, 66.7);
  assert.equal(summary.formattedPercentage, '66.7%');

  // Verify future date is NOT_DETECTED and never ABSENT
  const oct25 = days.find((d) => d.date === '2026-10-25'); // Sunday -> HOLIDAY (Weekly Off)
  assert.equal(oct25?.status, AttendanceStatus.HOLIDAY);

  const oct26 = days.find((d) => d.date === '2026-10-26'); // Future Monday -> NOT_DETECTED
  assert.equal(oct26?.status, AttendanceStatus.NOT_DETECTED);
});

test('returns "No eligible working days" when denominator is zero', () => {
  const { summary } = buildMonthlyCalendarAndSummary({
    year: 2026,
    month: 10,
    config: defaultCollege,
    records: [],
    holidays: [],
    referenceNowIso: '2026-10-01T04:00:00.000Z',
  });

  assert.equal(summary.eligibleWorkingDays, 0);
  assert.equal(summary.attendancePercentage, null);
  assert.equal(summary.formattedPercentage, 'No eligible working days');
});

test('custom user-picked college coordinates and custom radius (350m) evaluate presence accurately', () => {
  const customCollege: CollegeConfig = {
    ...defaultCollege,
    collegeId: 'col_custom_pune',
    collegeName: 'COEP Technological University Pune',
    latitude: 18.5293,
    longitude: 73.8565,
    radiusMeters: 350,
  };

  // Point ~220m north of custom pin (outside default 150m, but INSIDE custom 350m radius)
  const testLat = 18.5312;
  const testLng = 73.8565;

  const check = verifyPointAgainstGeofence({
    pointLatitude: testLat,
    pointLongitude: testLng,
    targetLatitude: customCollege.latitude,
    targetLongitude: customCollege.longitude,
    radiusMeters: customCollege.radiusMeters,
  });

  assert.equal(check.insideGeofence, true);
  assert.ok(check.distanceMeters > 150 && check.distanceMeters < 350);

  const observations: RawLocationObservation[] = [
    {
      eventId: 'cust-1',
      eventType: LocationEventType.ENTER,
      observedAt: '2026-10-19T04:00:00.000Z',
      latitude: testLat,
      longitude: testLng,
      accuracyMeters: 15,
    },
    {
      eventId: 'cust-2',
      eventType: LocationEventType.HEARTBEAT,
      observedAt: '2026-10-19T04:15:00.000Z',
      latitude: testLat,
      longitude: testLng,
      accuracyMeters: 15,
    },
    {
      eventId: 'cust-3',
      eventType: LocationEventType.DWELL,
      observedAt: '2026-10-19T04:30:00.000Z',
      latitude: testLat,
      longitude: testLng,
      accuracyMeters: 15,
    },
  ];

  const evalRes = evaluateAttendanceSession(observations, customCollege, {
    targetDate: '2026-10-19',
    referenceNowIso: '2026-10-19T04:35:00.000Z',
  });

  assert.equal(evalRes.status, AttendanceStatus.PRESENT);
  assert.equal(evalRes.verifiedDurationSeconds, 1800);

  const rev = resolveReverseGeocodeLocation(18.5293, 73.8565);
  assert.equal(rev.nearestPresetId, 'col_coep');
});

test('evaluateGoogleMapsConfigStatus detects missing key, auth/billing error, and ready states accurately', () => {
  const missingWeb = evaluateGoogleMapsConfigStatus({
    apiKey: '',
    platform: 'web',
  });
  assert.equal(missingWeb.status, 'MISSING_API_KEY');
  assert.equal(missingWeb.isInteractiveMapAvailable, false);
  assert.equal(missingWeb.envVarName, 'VITE_GOOGLE_MAPS_API_KEY');

  const missingAndroid = evaluateGoogleMapsConfigStatus({
    apiKey: 'YOUR_API_KEY',
    platform: 'android',
  });
  assert.equal(missingAndroid.status, 'MISSING_API_KEY');
  assert.equal(missingAndroid.envVarName, 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');

  const authFail = evaluateGoogleMapsConfigStatus({
    apiKey: 'AIzaSyTestInvalidKey1234567890',
    sdkLoadingStatus: 'AUTH_FAILURE',
    authFailureDetected: true,
    platform: 'web',
  });
  assert.equal(authFail.status, 'AUTH_OR_BILLING_ERROR');
  assert.equal(authFail.isInteractiveMapAvailable, false);

  const ready = evaluateGoogleMapsConfigStatus({
    apiKey: 'AIzaSyValidFormatKey1234567890abc',
    sdkLoadingStatus: 'LOADED',
    platform: 'web',
  });
  assert.equal(ready.status, 'READY');
  assert.equal(ready.isInteractiveMapAvailable, true);
});

test('camera panning alone NEVER changes selected centre, while explicit actions and radius updates do', () => {
  const initial = createInitialMapPickerState(defaultCollege);
  assert.equal(initial.selectedLat, 19.1334);
  assert.equal(initial.selectedLng, 72.9133);
  assert.equal(initial.radiusMeters, 150);

  // Panning the map camera 5km away must NOT alter selectedLat or selectedLng
  const afterPan = applyCameraPanOrZoom(initial, { lat: 19.18, lng: 72.95 }, 14);
  assert.equal(afterPan.cameraCenter.lat, 19.18);
  assert.equal(afterPan.cameraCenter.lng, 72.95);
  assert.equal(afterPan.zoom, 14);
  assert.equal(afterPan.selectedLat, 19.1334);
  assert.equal(afterPan.selectedLng, 72.9133);

  // Explicit map tap updates selectedLat and selectedLng
  const afterTap = applyExplicitCenterSelection(afterPan, {
    latitude: 18.5293,
    longitude: 73.8565,
    source: 'MAP_PIN',
    recenterCamera: false,
  });
  assert.equal(afterTap.valid, true);
  assert.equal(afterTap.state.selectedLat, 18.5293);
  assert.equal(afterTap.state.selectedLng, 73.8565);
  assert.equal(afterTap.state.locationSource, 'MAP_PIN');
  // Camera stayed where it was panned when recenterCamera is false
  assert.equal(afterTap.state.cameraCenter.lat, 19.18);

  // Invalid coordinates are rejected without mutating selectedLat/selectedLng
  const invalidCoord = applyExplicitCenterSelection(afterTap.state, {
    latitude: 105,
    longitude: 73.8565,
    source: 'MANUAL_COORDS',
  });
  assert.equal(invalidCoord.valid, false);
  assert.equal(invalidCoord.state.selectedLat, 18.5293);

  // Radius updates validate bounds and update radiusMeters immediately
  const radiusUp = applyGeofenceRadiusUpdate(afterTap.state, 425);
  assert.equal(radiusUp.valid, true);
  assert.equal(radiusUp.state.radiusMeters, 425);

  const radiusTooSmall = applyGeofenceRadiusUpdate(radiusUp.state, 20);
  assert.equal(radiusTooSmall.valid, false);
  assert.equal(radiusTooSmall.state.radiusMeters, 50); // clamped to minimum 50m
});

test('end-to-end API: save/reload geofence with configVersion, API validation errors, and real attendance engine control', async () => {
  const tmpFile = path.join(os.tmpdir(), `attendly-test-${Date.now()}.json`);
  const testStore = new AttendlyDataStore({ dbPath: tmpFile, inMemoryOnly: true });
  const app = createExpressApp(testStore);
  const server = app.listen(0);

  try {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}/api/v1`;

    // 1. Authenticate as Demo Student
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'aarav.sharma@iitb.ac.in',
        password: 'Attendly@2026',
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginJson = await loginRes.json();
    const token = loginJson.data.accessToken as string;
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // 2. Check /maps/config diagnostic endpoint
    const mapsConfigRes = await fetch(`${baseUrl}/maps/config`, { headers: authHeaders });
    assert.equal(mapsConfigRes.status, 200);
    const mapsConfigJson = await mapsConfigRes.json();
    assert.equal(mapsConfigJson.success, true);
    assert.equal(mapsConfigJson.data.attributionId, 'gmp_mcp_codeassist_v1_aistudio');

    // 3. Verify API rejects invalid coordinates and invalid radius (Requirement 13: API errors)
    const badPatchRes = await fetch(`${baseUrl}/college-settings`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ latitude: 99.5, radiusMeters: 10 }),
    });
    assert.equal(badPatchRes.status, 400);
    const badPatchJson = await badPatchRes.json();
    assert.equal(badPatchJson.error.code, 'VALIDATION_ERROR');

    // 4. Save new college location & custom 400m radius and verify configVersion increments (1 -> 2)
    const saveRes = await fetch(`${baseUrl}/college-settings`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        collegeName: 'IISc Bengaluru Custom Campus',
        campusLabel: 'Main Faculty Hall Gate',
        address: 'CV Raman Rd, Bengaluru, Karnataka 560012',
        latitude: 13.0219,
        longitude: 77.5671,
        radiusMeters: 400,
        locationSource: 'MAP_PIN',
      }),
    });
    assert.equal(saveRes.status, 200);
    const saveJson = await saveRes.json();
    assert.equal(saveJson.data.collegeSettings.latitude, 13.0219);
    assert.equal(saveJson.data.collegeSettings.longitude, 77.5671);
    assert.equal(saveJson.data.collegeSettings.radiusMeters, 400);
    assert.equal(saveJson.data.collegeSettings.configVersion, 2);

    // 5. Reload via GET /college-settings and confirm persistence
    const reloadRes = await fetch(`${baseUrl}/college-settings`, { headers: authHeaders });
    const reloadJson = await reloadRes.json();
    assert.equal(reloadJson.data.collegeSettings.collegeName, 'IISc Bengaluru Custom Campus');
    assert.equal(reloadJson.data.collegeSettings.radiusMeters, 400);
    assert.equal(reloadJson.data.collegeSettings.configVersion, 2);

    // 6. Verify saved 400m geofence controls real attendance engine (point ~255m north of 13.0219, 77.5671)
    const syncRes = await fetch(`${baseUrl}/attendance/sync`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        referenceNowIso: '2026-10-19T06:00:00.000Z',
        events: [
          {
            eventId: 'iisc-evt-1',
            eventType: 'ENTER',
            observedAt: '2026-10-19T05:00:00.000Z',
            latitude: 13.0242,
            longitude: 77.5671,
            accuracyMeters: 12,
          },
          {
            eventId: 'iisc-evt-2',
            eventType: 'HEARTBEAT',
            observedAt: '2026-10-19T05:12:00.000Z',
            latitude: 13.0242,
            longitude: 77.5671,
            accuracyMeters: 12,
          },
          {
            eventId: 'iisc-evt-3',
            eventType: 'HEARTBEAT',
            observedAt: '2026-10-19T05:24:00.000Z',
            latitude: 13.0242,
            longitude: 77.5671,
            accuracyMeters: 12,
          },
          {
            eventId: 'iisc-evt-4',
            eventType: 'DWELL',
            observedAt: '2026-10-19T05:35:00.000Z',
            latitude: 13.0242,
            longitude: 77.5671,
            accuracyMeters: 12,
          },
        ],
      }),
    });
    assert.equal(syncRes.status, 200);

    const todayRes = await fetch(
      `${baseUrl}/attendance/today?now=${encodeURIComponent('2026-10-19T06:00:00.000Z')}`,
      { headers: authHeaders }
    );
    assert.equal(todayRes.status, 200);
    const todayJson = await todayRes.json();
    assert.equal(todayJson.data.status, 'PRESENT');
    assert.equal(todayJson.data.radiusMeters, 400);
  } finally {
    server.close();
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
});

