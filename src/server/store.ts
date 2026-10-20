import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  AttendanceStatus,
  LocationEventType,
  KNOWN_COLLEGES_DIRECTORY,
  type CollegeConfig,
  type HolidayItem,
  type RawLocationObservation,
  type StoredAttendanceRecord,
} from '../engine/attendanceEngine.ts';
export { KNOWN_COLLEGES_DIRECTORY };
import { hashPassword } from './auth.ts';

export interface UserPrivacySettings {
  retainRawEventsDays: number; // default 30
  allowAnalyticsDiagnostics: boolean;
  backgroundTrackingConsent: boolean;
  consentUpdatedAt: string;
}

export interface UserModel {
  id: string;
  name: string;
  email: string;
  studentId: string;
  department: string;
  semester: string;
  passwordHash: string;
  timezone: string;
  collegeId: string;
  trackingEnabled: boolean;
  permissionStatus: 'GRANTED_ALWAYS' | 'GRANTED_FOREGROUND' | 'DENIED' | 'NOT_DETERMINED';
  lastSyncedAt: string | null;
  privacySettings: UserPrivacySettings;
  createdAt: string;
  updatedAt: string;
}

export interface CollegeSettingsModel extends CollegeConfig {
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocationEventModel {
  id: string;
  userId: string;
  eventId: string;
  eventType: LocationEventType;
  observedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  processingStatus: 'PROCESSED' | 'REJECTED' | 'DUPLICATE';
  rejectionReason?: string;
  processedAt: string;
  expiresAt: string;
}

export interface AuditLogItem {
  id: string;
  userId: string;
  action: string;
  targetDate?: string;
  details: string;
  createdAt: string;
}

export interface DatabaseSchema {
  users: UserModel[];
  collegeSettings: CollegeSettingsModel[];
  attendanceRecords: StoredAttendanceRecord[];
  locationEvents: LocationEventModel[];
  holidays: (HolidayItem & { userId: string; createdAt: string })[];
  revokedRefreshTokenHashes: string[];
  auditLogs: AuditLogItem[];
}

function createSeedDatabase(): DatabaseSchema {
  const demoUserId = 'usr_demo_aarav';
  const collegeId = 'col_iitb';
  const nowIso = '2026-10-19T04:05:00.000Z'; // 09:35 AM IST on Oct 19, 2026

  const demoUser: UserModel = {
    id: demoUserId,
    name: 'Aarav Sharma',
    email: 'aarav.sharma@iitb.ac.in',
    studentId: '23B1042',
    department: 'Computer Science & Engineering',
    semester: 'Autumn 2026 (Sem V)',
    passwordHash: hashPassword('Attendly@2026'),
    timezone: 'Asia/Kolkata',
    collegeId,
    trackingEnabled: true,
    permissionStatus: 'GRANTED_ALWAYS',
    lastSyncedAt: '2026-10-19T03:30:00.000Z',
    privacySettings: {
      retainRawEventsDays: 30,
      allowAnalyticsDiagnostics: true,
      backgroundTrackingConsent: true,
      consentUpdatedAt: '2026-08-01T04:00:00.000Z',
    },
    createdAt: '2026-08-01T04:00:00.000Z',
    updatedAt: nowIso,
  };

  const demoCollegeSettings: CollegeSettingsModel = {
    userId: demoUserId,
    collegeId,
    collegeName: 'Indian Institute of Technology Bombay',
    address: 'Main Gate Rd, IIT Area, Powai, Mumbai, Maharashtra 400076',
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
    createdAt: '2026-08-01T04:00:00.000Z',
    updatedAt: nowIso,
  };

  const holidays: (HolidayItem & { userId: string; createdAt: string })[] = [
    {
      id: 'hol_gandhi_jayanti',
      userId: demoUserId,
      date: '2026-10-02',
      name: 'Mahatma Gandhi Jayanti',
      holidayType: 'NATIONAL',
      createdAt: '2026-08-01T04:00:00.000Z',
    },
    {
      id: 'hol_dussehra',
      userId: demoUserId,
      date: '2026-10-20',
      name: 'Vijayadashami / Dussehra',
      holidayType: 'NATIONAL',
      createdAt: '2026-08-01T04:00:00.000Z',
    },
    {
      id: 'hol_midsem_break',
      userId: demoUserId,
      date: '2026-09-17',
      name: 'Institute Mid-Semester Break',
      holidayType: 'ACADEMIC',
      createdAt: '2026-08-01T04:00:00.000Z',
    },
  ];

  // Build authentic historical records for September 2026 and October 1-19, 2026
  const attendanceRecords: StoredAttendanceRecord[] = [];

  // September 2026 working days (Mon-Sat)
  const septOutcomes: Record<string, { status: AttendanceStatus; arr?: string; dur?: number }> = {
    '2026-09-01': { status: AttendanceStatus.PRESENT, arr: '03:38:00', dur: 19800 },
    '2026-09-02': { status: AttendanceStatus.PRESENT, arr: '03:42:00', dur: 21600 },
    '2026-09-03': { status: AttendanceStatus.PRESENT, arr: '03:31:00', dur: 22400 },
    '2026-09-04': { status: AttendanceStatus.PRESENT, arr: '03:50:00', dur: 18900 },
    '2026-09-05': { status: AttendanceStatus.PRESENT, arr: '04:05:00', dur: 14400 },
    '2026-09-07': { status: AttendanceStatus.PRESENT, arr: '03:35:00', dur: 23100 },
    '2026-09-08': { status: AttendanceStatus.ABSENT },
    '2026-09-09': { status: AttendanceStatus.PRESENT, arr: '03:40:00', dur: 20400 },
    '2026-09-10': { status: AttendanceStatus.PRESENT, arr: '03:45:00', dur: 19200 },
    '2026-09-11': { status: AttendanceStatus.PRESENT, arr: '03:36:00', dur: 21000 },
    '2026-09-12': { status: AttendanceStatus.PRESENT, arr: '04:00:00', dur: 15000 },
    '2026-09-14': { status: AttendanceStatus.PRESENT, arr: '03:32:00', dur: 22800 },
    '2026-09-15': { status: AttendanceStatus.PRESENT, arr: '03:48:00', dur: 20100 },
    '2026-09-16': { status: AttendanceStatus.PRESENT, arr: '03:39:00', dur: 21300 },
    '2026-09-18': { status: AttendanceStatus.PRESENT, arr: '03:44:00', dur: 19500 },
    '2026-09-19': { status: AttendanceStatus.ABSENT },
    '2026-09-21': { status: AttendanceStatus.PRESENT, arr: '03:34:00', dur: 22200 },
    '2026-09-22': { status: AttendanceStatus.PRESENT, arr: '03:41:00', dur: 20700 },
    '2026-09-23': { status: AttendanceStatus.PRESENT, arr: '03:37:00', dur: 21900 },
    '2026-09-24': { status: AttendanceStatus.UNKNOWN },
    '2026-09-25': { status: AttendanceStatus.PRESENT, arr: '03:46:00', dur: 19800 },
    '2026-09-26': { status: AttendanceStatus.PRESENT, arr: '03:55:00', dur: 16200 },
    '2026-09-28': { status: AttendanceStatus.PRESENT, arr: '03:33:00', dur: 22500 },
    '2026-09-29': { status: AttendanceStatus.PRESENT, arr: '03:40:00', dur: 21000 },
    '2026-09-30': { status: AttendanceStatus.PRESENT, arr: '03:38:00', dur: 20400 },
  };

  for (const [date, info] of Object.entries(septOutcomes)) {
    attendanceRecords.push({
      id: `rec_${date}`,
      userId: demoUserId,
      collegeId,
      attendanceDate: date,
      status: info.status,
      firstConfirmedAt: info.arr ? `${date}T${info.arr}.000Z` : null,
      lastConfirmedAt: info.arr ? `${date}T09:30:00.000Z` : null,
      verifiedDurationSeconds: info.dur ?? 0,
      detectionMethod:
        info.status === AttendanceStatus.PRESENT
          ? 'GEOFENCE_SESSION'
          : 'DAILY_RECONCILIATION',
      correctionStatus: 'NONE',
      trackingHealth: info.status === AttendanceStatus.UNKNOWN ? 'PERMISSION_REVOKED' : 'HEALTHY',
      warnings:
        info.status === AttendanceStatus.UNKNOWN
          ? ['Location permission or background service was disabled during college working hours.']
          : [],
      updatedAt: `${date}T12:00:00.000Z`,
    });
  }

  // October 2026 records (Oct 1 to Oct 19)
  const octOutcomes: Record<
    string,
    { status: AttendanceStatus; arr?: string; last?: string; dur?: number; warning?: string }
  > = {
    '2026-10-01': { status: AttendanceStatus.PRESENT, arr: '03:36:00', last: '10:45:00', dur: 21400 },
    '2026-10-03': { status: AttendanceStatus.PRESENT, arr: '03:52:00', last: '08:30:00', dur: 16680 },
    '2026-10-05': { status: AttendanceStatus.PRESENT, arr: '03:34:00', last: '11:05:00', dur: 23400 },
    '2026-10-06': { status: AttendanceStatus.PRESENT, arr: '03:41:00', last: '10:20:00', dur: 20800 },
    '2026-10-07': { status: AttendanceStatus.ABSENT, warning: 'Working day ended with 0 min verified campus presence.' },
    '2026-10-08': {
      status: AttendanceStatus.UNKNOWN,
      warning: 'Android Battery Saver restricted background geofence callbacks for 6h+. Excluded from denominator.',
    },
    '2026-10-09': { status: AttendanceStatus.PRESENT, arr: '03:39:00', last: '10:50:00', dur: 22100 },
    '2026-10-10': { status: AttendanceStatus.PRESENT, arr: '04:02:00', last: '09:10:00', dur: 18480 },
    '2026-10-12': { status: AttendanceStatus.PRESENT, arr: '03:31:00', last: '11:15:00', dur: 24200 },
    '2026-10-13': { status: AttendanceStatus.PRESENT, arr: '03:44:00', last: '10:40:00', dur: 21300 },
    '2026-10-14': { status: AttendanceStatus.PRESENT, arr: '03:37:00', last: '10:55:00', dur: 22600 },
    '2026-10-15': { status: AttendanceStatus.ABSENT, warning: 'Working day ended with no campus geofence entry.' },
    '2026-10-16': { status: AttendanceStatus.PRESENT, arr: '03:40:00', last: '10:30:00', dur: 21000 },
    '2026-10-17': { status: AttendanceStatus.PRESENT, arr: '03:58:00', last: '08:45:00', dur: 17220 },
    // Today: Monday, Oct 19, 2026 — Currently on campus collecting evidence (18 mins = 1080s verified so far)
    '2026-10-19': {
      status: AttendanceStatus.PENDING,
      arr: '03:12:00', // 08:42 UTC? Wait: 03:42 UTC = 09:12 AM IST!
      last: '04:00:00',
      dur: 1080, // 18 minutes verified so far (60% of 30m threshold)
    },
  };

  for (const [date, info] of Object.entries(octOutcomes)) {
    const arrTime = date === '2026-10-19' ? '03:42:00' : info.arr;
    attendanceRecords.push({
      id: `rec_${date}`,
      userId: demoUserId,
      collegeId,
      attendanceDate: date,
      status: info.status,
      firstConfirmedAt: arrTime ? `${date}T${arrTime}.000Z` : null,
      lastConfirmedAt: info.last ? `${date}T${info.last}.000Z` : null,
      verifiedDurationSeconds: info.dur ?? 0,
      detectionMethod:
        info.status === AttendanceStatus.PRESENT || info.status === AttendanceStatus.PENDING
          ? 'GEOFENCE_SESSION'
          : 'DAILY_RECONCILIATION',
      correctionStatus: 'NONE',
      trackingHealth: info.status === AttendanceStatus.UNKNOWN ? 'PAUSED' : 'HEALTHY',
      warnings: info.warning ? [info.warning] : [],
      updatedAt: `${date}T04:00:00.000Z`,
    });
  }

  // Seed today's initial location events (09:12 AM IST -> 09:21 AM IST -> 09:30 AM IST = 18 mins)
  const locationEvents: LocationEventModel[] = [
    {
      id: 'le_today_1',
      userId: demoUserId,
      eventId: 'seed-2026-10-19-enter-0912',
      eventType: LocationEventType.ENTER,
      observedAt: '2026-10-19T03:42:00.000Z', // 09:12 AM IST
      latitude: 19.1334,
      longitude: 72.9133,
      accuracyMeters: 14,
      processingStatus: 'PROCESSED',
      processedAt: '2026-10-19T03:42:02.000Z',
      expiresAt: '2026-11-18T03:42:02.000Z',
    },
    {
      id: 'le_today_2',
      userId: demoUserId,
      eventId: 'seed-2026-10-19-hb-0921',
      eventType: LocationEventType.HEARTBEAT,
      observedAt: '2026-10-19T03:51:00.000Z', // 09:21 AM IST (+9m)
      latitude: 19.1335,
      longitude: 72.9132,
      accuracyMeters: 16,
      processingStatus: 'PROCESSED',
      processedAt: '2026-10-19T03:51:02.000Z',
      expiresAt: '2026-11-18T03:51:02.000Z',
    },
    {
      id: 'le_today_3',
      userId: demoUserId,
      eventId: 'seed-2026-10-19-hb-0930',
      eventType: LocationEventType.HEARTBEAT,
      observedAt: '2026-10-19T04:00:00.000Z', // 09:30 AM IST (+18m total)
      latitude: 19.1333,
      longitude: 72.9134,
      accuracyMeters: 12,
      processingStatus: 'PROCESSED',
      processedAt: '2026-10-19T04:00:02.000Z',
      expiresAt: '2026-11-18T04:00:02.000Z',
    },
  ];

  return {
    users: [demoUser],
    collegeSettings: [demoCollegeSettings],
    attendanceRecords,
    locationEvents,
    holidays,
    revokedRefreshTokenHashes: [],
    auditLogs: [
      {
        id: crypto.randomUUID(),
        userId: demoUserId,
        action: 'GEOFENCE_ENTRY_DETECTED',
        targetDate: '2026-10-19',
        details: 'Entered IIT Bombay geofence (radius 150m, accuracy 14m) at 09:12 IST.',
        createdAt: '2026-10-19T03:42:02.000Z',
      },
    ],
  };
}

export class AttendlyDataStore {
  private dbPath: string;
  private data: DatabaseSchema;
  private inMemoryOnly: boolean;

  constructor(options?: { dbPath?: string; inMemoryOnly?: boolean }) {
    this.inMemoryOnly = options?.inMemoryOnly ?? false;
    this.dbPath =
      options?.dbPath || path.resolve(process.cwd(), 'data', 'attendly-db.json');
    this.data = this.loadOrSeed();
  }

  private loadOrSeed(): DatabaseSchema {
    if (this.inMemoryOnly) {
      return createSeedDatabase();
    }
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf8');
        const parsed = JSON.parse(raw) as DatabaseSchema;
        if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback to fresh seed if corrupted
    }
    const seeded = createSeedDatabase();
    this.persist(seeded);
    return seeded;
  }

  private persist(db: DatabaseSchema = this.data): void {
    if (this.inMemoryOnly) return;
    try {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      fs.writeFileSync(this.dbPath, JSON.stringify(db, null, 2), 'utf8');
    } catch {
      // ignore read-only filesystem errors in ephemeral containers
    }
  }

  public getState(): DatabaseSchema {
    return this.data;
  }

  public save(): void {
    this.persist(this.data);
  }

  public resetToSeed(): void {
    this.data = createSeedDatabase();
    this.persist(this.data);
  }
}

export const defaultStore = new AttendlyDataStore();
