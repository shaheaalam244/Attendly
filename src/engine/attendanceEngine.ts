/**
 * Attendly — Deterministic Attendance Verification & Monthly Reporting Engine
 * Shared by both Backend API and Client/Mobile Verification Services.
 */

export const AttendanceStatus = {
  NOT_DETECTED: 'NOT_DETECTED',
  PENDING: 'PENDING',
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  HOLIDAY: 'HOLIDAY',
  UNKNOWN: 'UNKNOWN',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
} as const;

export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const LocationEventType = {
  ENTER: 'ENTER',
  DWELL: 'DWELL',
  HEARTBEAT: 'HEARTBEAT',
  EXIT: 'EXIT',
} as const;

export type LocationEventType = (typeof LocationEventType)[keyof typeof LocationEventType];

export interface CollegeConfig {
  collegeId: string;
  collegeName: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number; // default 150
  workingDays: number[]; // 0=Sun, 1=Mon ... 6=Sat; default [1,2,3,4,5,6]
  startTime: string; // "09:00"
  endTime: string; // "17:00"
  timezone: string; // default "Asia/Kolkata"
  minimumVerifiedMinutes: number; // default 30
  maximumVerificationWindowMinutes: number; // default 60
  maxEvidenceGapMinutes: number; // default 15 (never bridge >= 30m unverified gaps)
  maxAccuracyMeters: number; // default 50 (with fallback up to 100m)
  outsideHoursPolicy: 'IGNORE' | 'NEEDS_REVIEW' | 'ALLOW';
}

export const KNOWN_COLLEGES_DIRECTORY = [
  {
    collegeId: 'col_iitb',
    collegeName: 'Indian Institute of Technology Bombay',
    address: 'Main Gate Rd, IIT Area, Powai, Mumbai, Maharashtra 400076',
    latitude: 19.1334,
    longitude: 72.9133,
    timezone: 'Asia/Kolkata',
  },
  {
    collegeId: 'col_iisc',
    collegeName: 'Indian Institute of Science (IISc) Bengaluru',
    address: 'CV Raman Rd, Bengaluru, Karnataka 560012',
    latitude: 13.0219,
    longitude: 77.5671,
    timezone: 'Asia/Kolkata',
  },
  {
    collegeId: 'col_iitd',
    collegeName: 'Indian Institute of Technology Delhi',
    address: 'Hauz Khas, New Delhi, Delhi 110016',
    latitude: 28.5450,
    longitude: 77.1926,
    timezone: 'Asia/Kolkata',
  },
  {
    collegeId: 'col_vjti',
    collegeName: 'Veermata Jijabai Technological Institute (VJTI)',
    address: 'H R Mahajani Rd, Matunga East, Mumbai, Maharashtra 400019',
    latitude: 19.0222,
    longitude: 72.8561,
    timezone: 'Asia/Kolkata',
  },
  {
    collegeId: 'col_coep',
    collegeName: 'COEP Technological University Pune',
    address: 'Wellesley Rd, Shivajinagar, Pune, Maharashtra 411005',
    latitude: 18.5293,
    longitude: 73.8565,
    timezone: 'Asia/Kolkata',
  },
  {
    collegeId: 'col_bits',
    collegeName: 'BITS Pilani — K K Birla Goa Campus',
    address: 'NH 17B, Bypass Road, Zuarinagar, Sancoale, Goa 403726',
    latitude: 15.3911,
    longitude: 73.8782,
    timezone: 'Asia/Kolkata',
  },
];

export interface RawLocationObservation {
  eventId: string;
  eventType: LocationEventType;
  observedAt: string; // ISO timestamp
  receivedAt?: string; // Server receipt ISO timestamp
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

export interface ValidatedObservation extends RawLocationObservation {
  observedMs: number;
  distanceMeters: number;
  insideGeofence: boolean;
  withinWorkingHours: boolean;
  localDate: string; // YYYY-MM-DD in college timezone
  localTimeMinutes: number; // minutes since 00:00 in college timezone
  rejectionReason?: string;
}

export interface VerifiedInterval {
  startAt: string;
  endAt: string;
  durationSeconds: number;
}

export interface SessionEvaluationResult {
  attendanceDate: string;
  status: AttendanceStatus;
  verifiedDurationSeconds: number;
  requiredDurationSeconds: number;
  progressPercent: number;
  firstConfirmedAt: string | null;
  lastConfirmedAt: string | null;
  intervals: VerifiedInterval[];
  validObservationCount: number;
  rejectedObservationCount: number;
  duplicateEventIds: string[];
  warnings: string[];
}

export interface HolidayItem {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  holidayType: 'NATIONAL' | 'ACADEMIC' | 'EXAM' | 'PERSONAL';
}

export interface StoredAttendanceRecord {
  id: string;
  userId: string;
  collegeId: string;
  attendanceDate: string; // YYYY-MM-DD
  status: AttendanceStatus;
  firstConfirmedAt: string | null;
  lastConfirmedAt: string | null;
  verifiedDurationSeconds: number;
  detectionMethod: 'GEOFENCE_SESSION' | 'MANUAL_CORRECTION' | 'DAILY_RECONCILIATION';
  correctionStatus: 'NONE' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  correctionNote?: string;
  trackingHealth?: 'HEALTHY' | 'PAUSED' | 'PERMISSION_REVOKED' | 'OFFLINE_UNSYNCED';
  warnings?: string[];
  updatedAt: string;
}

export interface CalendarDayCell {
  date: string; // YYYY-MM-DD
  dayOfMonth: number;
  dayOfWeek: number; // 0-6
  isWorkingDay: boolean;
  isHoliday: boolean;
  holidayName?: string;
  isFuture: boolean;
  isToday: boolean;
  status: AttendanceStatus;
  firstConfirmedAt: string | null;
  lastConfirmedAt: string | null;
  verifiedDurationSeconds: number;
  correctionStatus: 'NONE' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  warnings: string[];
}

export interface MonthlySummaryMetrics {
  year: number;
  month: number; // 1-12
  presentDays: number;
  absentDays: number;
  pendingDays: number;
  holidayDays: number;
  unknownDays: number;
  nonWorkingDays: number;
  eligibleWorkingDays: number;
  attendancePercentage: number | null;
  formattedPercentage: string;
  averageArrivalTime: string | null;
}

/**
 * Haversine distance in meters between two WGS84 coordinates.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Converts an ISO timestamp or Date into the configured college timezone's
 * YYYY-MM-DD, dayOfWeek (0=Sun..6=Sat), and minutes since midnight.
 */
export function getLocalDateTimeInTimezone(
  isoOrDate: string | Date,
  timezone: string = 'Asia/Kolkata'
): {
  localDate: string;
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  hours: number;
  minutes: number;
  totalMinutes: number;
  formattedTime: string;
} {
  const dateObj = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(dateObj.getTime())) {
    throw new Error(`Invalid timestamp: ${String(isoOrDate)}`);
  }

  let tz = timezone || 'Asia/Kolkata';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    tz = 'Asia/Kolkata';
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(dateObj);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }

  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  let hours = Number(map.hour);
  if (hours === 24) hours = 0;
  const minutes = Number(map.minute);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = weekdayMap[map.weekday] ?? dateObj.getUTCDay();

  const localDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

  return {
    localDate,
    year,
    month,
    day,
    dayOfWeek,
    hours,
    minutes,
    totalMinutes: hours * 60 + minutes,
    formattedTime,
  };
}

export function parseTimeMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return 9 * 60;
  }
  return h * 60 + m;
}

export function isWithinWorkingHours(
  localTimeMinutes: number,
  startTime: string,
  endTime: string
): boolean {
  const startMins = parseTimeMinutes(startTime);
  const endMins = parseTimeMinutes(endTime);
  if (endMins >= startMins) {
    return localTimeMinutes >= startMins && localTimeMinutes <= endMins;
  }
  // Overnight shift crossing midnight
  return localTimeMinutes >= startMins || localTimeMinutes <= endMins;
}

export function isWorkingDay(dayOfWeek: number, workingDays: number[]): boolean {
  return workingDays.includes(dayOfWeek);
}

/**
 * Validates a single raw observation against coordinates, accuracy, and clock drift rules.
 */
export function validateObservation(
  obs: RawLocationObservation,
  config: CollegeConfig,
  referenceNowIso?: string
): ValidatedObservation {
  const observedDate = new Date(obs.observedAt);
  const observedMs = observedDate.getTime();

  if (!obs.eventId || typeof obs.eventId !== 'string' || obs.eventId.trim().length < 3) {
    return {
      ...obs,
      observedMs: 0,
      distanceMeters: Infinity,
      insideGeofence: false,
      withinWorkingHours: false,
      localDate: '1970-01-01',
      localTimeMinutes: 0,
      rejectionReason: 'INVALID_EVENT_ID',
    };
  }

  if (Number.isNaN(observedMs)) {
    return {
      ...obs,
      observedMs: 0,
      distanceMeters: Infinity,
      insideGeofence: false,
      withinWorkingHours: false,
      localDate: '1970-01-01',
      localTimeMinutes: 0,
      rejectionReason: 'INVALID_TIMESTAMP',
    };
  }

  // Reject future-dated timestamps (> 5 minutes ahead of server receipt / reference clock)
  const refMs = referenceNowIso
    ? new Date(referenceNowIso).getTime()
    : obs.receivedAt
      ? new Date(obs.receivedAt).getTime()
      : Date.now();

  if (!Number.isNaN(refMs) && observedMs - refMs > 5 * 60 * 1000) {
    return {
      ...obs,
      observedMs,
      distanceMeters: Infinity,
      insideGeofence: false,
      withinWorkingHours: false,
      localDate: '1970-01-01',
      localTimeMinutes: 0,
      rejectionReason: 'FUTURE_TIMESTAMP_REJECTED',
    };
  }

  if (
    typeof obs.latitude !== 'number' ||
    typeof obs.longitude !== 'number' ||
    Number.isNaN(obs.latitude) ||
    Number.isNaN(obs.longitude) ||
    obs.latitude < -90 ||
    obs.latitude > 90 ||
    obs.longitude < -180 ||
    obs.longitude > 180
  ) {
    return {
      ...obs,
      observedMs,
      distanceMeters: Infinity,
      insideGeofence: false,
      withinWorkingHours: false,
      localDate: '1970-01-01',
      localTimeMinutes: 0,
      rejectionReason: 'INVALID_COORDINATES',
    };
  }

  const fallbackAccuracyLimit = Math.max(config.maxAccuracyMeters * 2, 100);
  if (
    typeof obs.accuracyMeters !== 'number' ||
    Number.isNaN(obs.accuracyMeters) ||
    obs.accuracyMeters <= 0 ||
    obs.accuracyMeters > fallbackAccuracyLimit
  ) {
    const dt = getLocalDateTimeInTimezone(observedDate, config.timezone);
    return {
      ...obs,
      observedMs,
      distanceMeters: calculateDistanceMeters(
        obs.latitude,
        obs.longitude,
        config.latitude,
        config.longitude
      ),
      insideGeofence: false,
      withinWorkingHours: false,
      localDate: dt.localDate,
      localTimeMinutes: dt.totalMinutes,
      rejectionReason: 'EXCESSIVE_GPS_INACCURACY',
    };
  }

  const dt = getLocalDateTimeInTimezone(observedDate, config.timezone);
  const distanceMeters = calculateDistanceMeters(
    obs.latitude,
    obs.longitude,
    config.latitude,
    config.longitude
  );

  // Allow small GPS accuracy tolerance up to 20m only when accuracy <= config.maxAccuracyMeters
  const effectiveTolerance =
    obs.accuracyMeters <= config.maxAccuracyMeters
      ? Math.min(obs.accuracyMeters * 0.2, 20)
      : 0;

  const insideGeofence =
    obs.eventType !== LocationEventType.EXIT &&
    distanceMeters <= config.radiusMeters + effectiveTolerance;

  const withinWorkingHours = isWithinWorkingHours(
    dt.totalMinutes,
    config.startTime,
    config.endTime
  );

  return {
    ...obs,
    observedMs,
    distanceMeters,
    insideGeofence,
    withinWorkingHours,
    localDate: dt.localDate,
    localTimeMinutes: dt.totalMinutes,
  };
}

/**
 * Evaluates a list of observations for a specific attendance date and returns
 * the deterministic attendance verification outcome.
 *
 * Key guarantees:
 * 1. Duplicate eventIds are ignored and reported.
 * 2. Observations outside geofence or EXIT events close the current presence interval.
 * 3. Gaps between consecutive inside-geofence observations larger than `maxEvidenceGapMinutes`
 *    (default 15 minutes) are NOT bridged or counted as verified presence.
 * 4. Requires at least `minimumVerifiedMinutes * 60` seconds (default 1800s = 30 mins)
 *    of verified presence during eligible working hours to reach PRESENT.
 * 5. Preserves previously confirmed PRESENT status on the same date (idempotent).
 */
export function evaluateAttendanceSession(
  observations: RawLocationObservation[],
  config: CollegeConfig,
  options: {
    targetDate?: string;
    existingStatus?: AttendanceStatus;
    isHoliday?: boolean;
    referenceNowIso?: string;
  } = {}
): SessionEvaluationResult {
  const requiredDurationSeconds = Math.max(1, config.minimumVerifiedMinutes) * 60;
  const maxGapSeconds = Math.max(1, config.maxEvidenceGapMinutes) * 60;
  const seenEventIds = new Set<string>();
  const duplicateEventIds: string[] = [];
  const warnings: string[] = [];
  const validatedList: ValidatedObservation[] = [];
  let rejectedObservationCount = 0;

  for (const raw of observations) {
    if (seenEventIds.has(raw.eventId)) {
      duplicateEventIds.push(raw.eventId);
      continue;
    }
    seenEventIds.add(raw.eventId);

    const validated = validateObservation(raw, config, options.referenceNowIso);
    if (validated.rejectionReason) {
      rejectedObservationCount++;
      warnings.push(`Event ${raw.eventId} rejected: ${validated.rejectionReason}`);
      continue;
    }

    if (options.targetDate && validated.localDate !== options.targetDate) {
      continue;
    }

    validatedList.push(validated);
  }

  // Sort chronologically
  validatedList.sort((a, b) => a.observedMs - b.observedMs);

  const attendanceDate =
    options.targetDate ||
    validatedList[0]?.localDate ||
    getLocalDateTimeInTimezone(options.referenceNowIso || new Date(), config.timezone).localDate;

  if (options.isHoliday) {
    return {
      attendanceDate,
      status: AttendanceStatus.HOLIDAY,
      verifiedDurationSeconds: 0,
      requiredDurationSeconds,
      progressPercent: 100,
      firstConfirmedAt: null,
      lastConfirmedAt: null,
      intervals: [],
      validObservationCount: validatedList.length,
      rejectedObservationCount,
      duplicateEventIds,
      warnings,
    };
  }

  const intervals: VerifiedInterval[] = [];
  let activeAnchor: ValidatedObservation | null = null;
  let lastInsideObs: ValidatedObservation | null = null;
  let firstConfirmedAt: string | null = null;
  let lastConfirmedAt: string | null = null;
  let outsideHoursInsideCount = 0;

  const flushInterval = (startObs: ValidatedObservation | null, endObs: ValidatedObservation | null) => {
    if (!startObs || !endObs) return;
    const deltaSeconds = Math.round((endObs.observedMs - startObs.observedMs) / 1000);
    if (deltaSeconds > 0) {
      intervals.push({
        startAt: startObs.observedAt,
        endAt: endObs.observedAt,
        durationSeconds: deltaSeconds,
      });
    }
  };

  for (const obs of validatedList) {
    if (!obs.insideGeofence || obs.eventType === LocationEventType.EXIT) {
      // Student exited geofence: close current verified interval up to lastInsideObs
      flushInterval(activeAnchor, lastInsideObs);
      activeAnchor = null;
      lastInsideObs = null;
      continue;
    }

    // Inside geofence
    if (!obs.withinWorkingHours && config.outsideHoursPolicy !== 'ALLOW') {
      outsideHoursInsideCount++;
      if (config.outsideHoursPolicy === 'IGNORE') {
        warnings.push('Observation inside geofence occurred outside configured college working hours.');
      }
      flushInterval(activeAnchor, lastInsideObs);
      activeAnchor = null;
      lastInsideObs = null;
      continue;
    }

    if (!firstConfirmedAt) {
      firstConfirmedAt = obs.observedAt;
    }
    lastConfirmedAt = obs.observedAt;

    if (!activeAnchor || !lastInsideObs) {
      activeAnchor = obs;
      lastInsideObs = obs;
      continue;
    }

    const gapSeconds = Math.round((obs.observedMs - lastInsideObs.observedMs) / 1000);

    if (gapSeconds <= maxGapSeconds) {
      // Valid continuous evidence within allowed gap
      lastInsideObs = obs;
    } else {
      // Unexplained gap exceeds maxEvidenceGapMinutes!
      // Do NOT count the unverified gap. Close previous interval and start a fresh anchor.
      warnings.push(
        `Unverified gap of ${Math.round(gapSeconds / 60)} min exceeded ${config.maxEvidenceGapMinutes} min threshold and was excluded.`
      );
      flushInterval(activeAnchor, lastInsideObs);
      activeAnchor = obs;
      lastInsideObs = obs;
    }
  }

  flushInterval(activeAnchor, lastInsideObs);

  const verifiedDurationSeconds = intervals.reduce(
    (sum, item) => sum + item.durationSeconds,
    0
  );

  const progressPercent = Math.min(
    100,
    Math.round((verifiedDurationSeconds / requiredDurationSeconds) * 100)
  );

  let status: AttendanceStatus = AttendanceStatus.NOT_DETECTED;

  if (
    verifiedDurationSeconds >= requiredDurationSeconds ||
    options.existingStatus === AttendanceStatus.PRESENT
  ) {
    status = AttendanceStatus.PRESENT;
  } else if (firstConfirmedAt !== null) {
    status = AttendanceStatus.PENDING;
  } else if (
    outsideHoursInsideCount > 0 &&
    config.outsideHoursPolicy === 'NEEDS_REVIEW'
  ) {
    status = AttendanceStatus.NEEDS_REVIEW;
  }

  return {
    attendanceDate,
    status,
    verifiedDurationSeconds,
    requiredDurationSeconds,
    progressPercent,
    firstConfirmedAt,
    lastConfirmedAt,
    intervals,
    validObservationCount: validatedList.length,
    rejectedObservationCount,
    duplicateEventIds,
    warnings,
  };
}

/**
 * Deterministically builds a monthly calendar grid and computes attendance metrics.
 *
 * Formula:
 * Attendance percentage = Present eligible working days / Total eligible working days × 100
 *
 * Excludes:
 * - Holidays
 * - Non-working days (e.g. Sundays)
 * - Future dates
 * - Unknown dates
 * - Today if still PENDING or NOT_DETECTED (not yet finalized)
 */
export function buildMonthlyCalendarAndSummary(params: {
  year: number;
  month: number; // 1-12
  config: CollegeConfig;
  records: StoredAttendanceRecord[];
  holidays: HolidayItem[];
  referenceNowIso?: string;
  trackingEnabled?: boolean;
}): {
  days: CalendarDayCell[];
  summary: MonthlySummaryMetrics;
} {
  const { year, month, config, records, holidays } = params;
  const nowDt = getLocalDateTimeInTimezone(
    params.referenceNowIso || new Date(),
    config.timezone
  );

  const recordByDate = new Map<string, StoredAttendanceRecord>();
  for (const r of records) {
    recordByDate.set(r.attendanceDate, r);
  }

  const holidayByDate = new Map<string, HolidayItem>();
  for (const h of holidays) {
    holidayByDate.set(h.date, h);
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days: CalendarDayCell[] = [];

  let presentDays = 0;
  let absentDays = 0;
  let pendingDays = 0;
  let holidayDays = 0;
  let unknownDays = 0;
  let nonWorkingDays = 0;
  const arrivalMinutesList: number[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const utcNoon = new Date(Date.UTC(year, month - 1, d, 12, 0, 0));
    const dayOfWeek = utcNoon.getUTCDay();

    const workingDay = isWorkingDay(dayOfWeek, config.workingDays);
    const holiday = holidayByDate.get(dateStr);
    const isHoliday = Boolean(holiday);
    const isToday = dateStr === nowDt.localDate;
    const isFuture = dateStr > nowDt.localDate;
    const rec = recordByDate.get(dateStr);

    let status: AttendanceStatus;

    if (isHoliday) {
      status = AttendanceStatus.HOLIDAY;
      holidayDays++;
    } else if (!workingDay) {
      status = AttendanceStatus.HOLIDAY;
      nonWorkingDays++;
    } else if (isFuture) {
      status = rec?.status === AttendanceStatus.HOLIDAY ? AttendanceStatus.HOLIDAY : AttendanceStatus.NOT_DETECTED;
    } else if (rec) {
      status = rec.status;
      if (status === AttendanceStatus.PRESENT) {
        presentDays++;
        if (rec.firstConfirmedAt) {
          try {
            const arrDt = getLocalDateTimeInTimezone(rec.firstConfirmedAt, config.timezone);
            arrivalMinutesList.push(arrDt.totalMinutes);
          } catch {
            // ignore malformed arrival timestamp
          }
        }
      } else if (status === AttendanceStatus.ABSENT) {
        absentDays++;
      } else if (status === AttendanceStatus.PENDING || status === AttendanceStatus.NEEDS_REVIEW) {
        pendingDays++;
      } else if (status === AttendanceStatus.UNKNOWN) {
        unknownDays++;
      } else if (status === AttendanceStatus.HOLIDAY) {
        holidayDays++;
      }
    } else if (isToday) {
      status =
        params.trackingEnabled === false
          ? AttendanceStatus.UNKNOWN
          : AttendanceStatus.NOT_DETECTED;
      if (status === AttendanceStatus.UNKNOWN) {
        unknownDays++;
      }
    } else {
      // Past working day without any record -> UNKNOWN (never silently convert unverified/untracked past dates to ABSENT)
      status = AttendanceStatus.UNKNOWN;
      unknownDays++;
    }

    days.push({
      date: dateStr,
      dayOfMonth: d,
      dayOfWeek,
      isWorkingDay: workingDay,
      isHoliday,
      holidayName: holiday?.name ?? (!workingDay ? 'Weekly Off' : undefined),
      isFuture,
      isToday,
      status,
      firstConfirmedAt: rec?.firstConfirmedAt ?? null,
      lastConfirmedAt: rec?.lastConfirmedAt ?? null,
      verifiedDurationSeconds: rec?.verifiedDurationSeconds ?? 0,
      correctionStatus: rec?.correctionStatus ?? 'NONE',
      warnings: rec?.warnings ?? [],
    });
  }

  // Eligible working days denominator:
  // Past/current working days that have a conclusive outcome (PRESENT + ABSENT)
  // Excludes holidays, non-working days, future dates, UNKNOWN dates, and unresolved PENDING dates.
  const eligibleWorkingDays = presentDays + absentDays;

  const attendancePercentage =
    eligibleWorkingDays > 0
      ? Number(((presentDays / eligibleWorkingDays) * 100).toFixed(1))
      : null;

  const formattedPercentage =
    attendancePercentage !== null
      ? `${attendancePercentage.toFixed(1)}%`
      : 'No eligible working days';

  let averageArrivalTime: string | null = null;
  if (arrivalMinutesList.length > 0) {
    const avgMins = Math.round(
      arrivalMinutesList.reduce((a, b) => a + b, 0) / arrivalMinutesList.length
    );
    const h = Math.floor(avgMins / 60);
    const m = avgMins % 60;
    averageArrivalTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return {
    days,
    summary: {
      year,
      month,
      presentDays,
      absentDays,
      pendingDays,
      holidayDays,
      unknownDays,
      nonWorkingDays,
      eligibleWorkingDays,
      attendancePercentage,
      formattedPercentage,
      averageArrivalTime,
    },
  };
}
