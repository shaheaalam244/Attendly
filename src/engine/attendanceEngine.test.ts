import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AttendanceStatus,
  LocationEventType,
  calculateDistanceMeters,
  evaluateAttendanceSession,
  buildMonthlyCalendarAndSummary,
  type CollegeConfig,
  type RawLocationObservation,
  type StoredAttendanceRecord,
  type HolidayItem,
} from './attendanceEngine.ts';

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
