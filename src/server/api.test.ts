import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createExpressApp } from '../../server.ts';
import { AttendlyDataStore } from './store.ts';

async function startTestServer() {
  const store = new AttendlyDataStore({ inMemoryOnly: true });
  const app = createExpressApp(store);
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    store,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

test('API Integration: health, demo login, today status, sync 30m presence -> PRESENT, calendar & CSV export', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.status, 'ok');

    // 2. Unauthorized access is rejected
    const unauthRes = await fetch(`${baseUrl}/api/v1/attendance/today`);
    assert.equal(unauthRes.status, 401);

    // 3. Login with seeded demo student (aarav.sharma@iitb.ac.in)
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'aarav.sharma@iitb.ac.in',
        password: 'Attendly@2026',
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginJson = await loginRes.json();
    assert.equal(loginJson.success, true);
    const token = loginJson.data.accessToken as string;
    assert.ok(token.length > 20);

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    // 4. Today's attendance starts as PENDING (18 mins verified)
    const todayRes1 = await fetch(`${baseUrl}/api/v1/attendance/today`, {
      headers: authHeaders,
    });
    assert.equal(todayRes1.status, 200);
    const todayJson1 = await todayRes1.json();
    assert.equal(todayJson1.data.status, 'PENDING');
    assert.equal(todayJson1.data.verifiedDurationSeconds, 1080);

    // 5. Sync additional location events (+14 mins at 09:44 AM IST = 04:14 UTC -> 32 mins total)
    const syncRes = await fetch(`${baseUrl}/api/v1/attendance/sync`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        referenceNowIso: '2026-10-19T04:15:00.000Z',
        events: [
          {
            eventId: 'seed-2026-10-19-hb-0930', // Duplicate of existing event!
            eventType: 'HEARTBEAT',
            observedAt: '2026-10-19T04:00:00.000Z',
            latitude: 19.1333,
            longitude: 72.9134,
            accuracyMeters: 12,
          },
          {
            eventId: 'live-2026-10-19-dwell-0944',
            eventType: 'DWELL',
            observedAt: '2026-10-19T04:14:00.000Z',
            latitude: 19.1334,
            longitude: 72.9133,
            accuracyMeters: 15,
          },
        ],
      }),
    });
    assert.equal(syncRes.status, 200);
    const syncJson = await syncRes.json();
    assert.equal(syncJson.data.results[0].status, 'DUPLICATE');
    assert.equal(syncJson.data.results[1].status, 'PROCESSED');
    assert.equal(syncJson.data.updatedRecords[0].status, 'PRESENT');
    assert.equal(syncJson.data.updatedRecords[0].verifiedDurationSeconds, 1920); // 32 mins

    // 6. Verify monthly summary & calendar
    const calRes = await fetch(`${baseUrl}/api/v1/calendar/2026/10`, {
      headers: authHeaders,
    });
    assert.equal(calRes.status, 200);
    const calJson = await calRes.json();
    assert.equal(calJson.data.days.length, 31);
    assert.ok(calJson.data.summary.presentDays >= 12);

    // 7. Export CSV
    const csvRes = await fetch(`${baseUrl}/api/v1/attendance/export?format=csv`, {
      headers: authHeaders,
    });
    assert.equal(csvRes.status, 200);
    const csvText = await csvRes.text();
    assert.ok(csvText.includes('Date,Status,College Name'));
    assert.ok(csvText.includes('2026-10-19,PRESENT'));
  } finally {
    await close();
  }
});

test('API Integration: user registration, cross-user isolation, holidays, and account deletion', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    // Register a new user
    const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Priya Nair',
        email: 'priya.nair@iisc.ac.in',
        password: 'SecurePassword123!',
        studentId: 'IISC-2026-09',
      }),
    });
    assert.equal(regRes.status, 201);
    const regJson = await regRes.json();
    const priyaToken = regJson.data.accessToken as string;

    const priyaHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${priyaToken}`,
    };

    // Verify Priya cannot see Aarav's attendance records
    const histRes = await fetch(`${baseUrl}/api/v1/attendance/history`, {
      headers: priyaHeaders,
    });
    const histJson = await histRes.json();
    assert.equal(histJson.data.records.length, 0);

    // Create and delete a holiday for Priya
    const holRes = await fetch(`${baseUrl}/api/v1/holidays`, {
      method: 'POST',
      headers: priyaHeaders,
      body: JSON.stringify({
        date: '2026-11-01',
        name: 'Karnataka Rajyotsava',
        holidayType: 'NATIONAL',
      }),
    });
    assert.equal(holRes.status, 201);
    const holJson = await holRes.json();
    const holId = holJson.data.holiday.id;

    const delHolRes = await fetch(`${baseUrl}/api/v1/holidays/${holId}`, {
      method: 'DELETE',
      headers: priyaHeaders,
    });
    assert.equal(delHolRes.status, 200);

    // Delete Priya's account
    const delAccRes = await fetch(`${baseUrl}/api/v1/account`, {
      method: 'DELETE',
      headers: priyaHeaders,
    });
    assert.equal(delAccRes.status, 200);

    // Subsequent request with Priya's token must return 401
    const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: priyaHeaders,
    });
    assert.equal(meRes.status, 401);
  } finally {
    await close();
  }
});

test('API Integration: Custom map location picker, radius update, point verification, and history restore', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'aarav.sharma@iitb.ac.in',
        password: 'Attendly@2026',
      }),
    });
    const loginJson = await loginRes.json();
    const token = loginJson.data.accessToken as string;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    // 1. Reverse geocode a coordinate near IISc Bengaluru
    const revRes = await fetch(
      `${baseUrl}/api/v1/colleges/reverse-geocode?lat=13.0219&lng=77.5671`,
      { headers }
    );
    assert.equal(revRes.status, 200);
    const revJson = await revRes.json();
    assert.equal(revJson.data.nearestPresetId, 'col_iisc');

    // 2. Save a custom college location and custom radius (320m) selected on the map
    const patchRes = await fetch(`${baseUrl}/api/v1/college-settings`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        collegeName: 'IISc Bengaluru — Main Faculty Hall',
        campusLabel: 'Faculty Hall & Central Quad',
        address: 'CV Raman Rd, Malleshwaram, Bengaluru 560012',
        latitude: 13.0219,
        longitude: 77.5671,
        radiusMeters: 320,
        locationSource: 'MAP_PIN',
      }),
    });
    assert.equal(patchRes.status, 200);
    const patchJson = await patchRes.json();
    assert.equal(patchJson.data.collegeSettings.radiusMeters, 320);
    assert.equal(patchJson.data.collegeSettings.latitude, 13.0219);
    assert.ok(patchJson.data.collegeSettings.locationHistory.length >= 2);

    // 3. Verify a GPS point ~180m from the new IISc pin against the 320m radius
    const verifyRes = await fetch(`${baseUrl}/api/v1/college-settings/verify-point`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        latitude: 13.0234,
        longitude: 77.5671,
      }),
    });
    assert.equal(verifyRes.status, 200);
    const verifyJson = await verifyRes.json();
    assert.equal(verifyJson.data.verification.insideGeofence, true);
    assert.equal(verifyJson.data.verification.radiusMeters, 320);

    // 4. Restore previous IIT Bombay Main Gate configuration from locationHistory
    const restoreRes = await fetch(`${baseUrl}/api/v1/college-settings/restore`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        historyId: 'loc_hist_iitb_main',
      }),
    });
    assert.equal(restoreRes.status, 200);
    const restoreJson = await restoreRes.json();
    assert.equal(restoreJson.data.collegeSettings.collegeId, 'col_iitb');
    assert.equal(restoreJson.data.collegeSettings.radiusMeters, 150);
  } finally {
    await close();
  }
});
