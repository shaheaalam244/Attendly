import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  AttendanceStatus,
  LocationEventType,
  evaluateAttendanceSession,
  buildMonthlyCalendarAndSummary,
  getLocalDateTimeInTimezone,
  type RawLocationObservation,
  type StoredAttendanceRecord,
} from '../engine/attendanceEngine.ts';
import {
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
  hashRefreshTokenId,
  type TokenPayload,
} from './auth.ts';
import {
  AttendlyDataStore,
  defaultStore,
  KNOWN_COLLEGES_DIRECTORY,
  type UserModel,
  type CollegeSettingsModel,
} from './store.ts';

export interface AuthenticatedRequest extends Request {
  user?: UserModel;
  tokenPayload?: TokenPayload;
}

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Valid college email is required').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
  studentId: z.string().trim().min(2).max(32).optional(),
  department: z.string().trim().max(80).optional(),
  semester: z.string().trim().max(40).optional(),
  timezone: z.string().trim().default('Asia/Kolkata'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Valid email is required').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

const collegeSettingsPatchSchema = z.object({
  collegeId: z.string().trim().min(1).optional(),
  collegeName: z.string().trim().min(2).max(140).optional(),
  address: z.string().trim().min(2).max(240).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().int().min(50).max(1000).optional(),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM').optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM').optional(),
  timezone: z.string().trim().min(2).optional(),
  minimumVerifiedMinutes: z.number().int().min(15).max(120).optional(),
  maximumVerificationWindowMinutes: z.number().int().min(30).max(180).optional(),
  maxEvidenceGapMinutes: z.number().int().min(5).max(25).optional(),
  maxAccuracyMeters: z.number().int().min(15).max(150).optional(),
  outsideHoursPolicy: z.enum(['IGNORE', 'NEEDS_REVIEW', 'ALLOW']).optional(),
});

const trackingPatchSchema = z.object({
  trackingEnabled: z.boolean().optional(),
  permissionStatus: z
    .enum(['GRANTED_ALWAYS', 'GRANTED_FOREGROUND', 'DENIED', 'NOT_DETERMINED'])
    .optional(),
});

const syncEventsSchema = z.object({
  events: z
    .array(
      z.object({
        eventId: z.string().trim().min(3).max(128),
        eventType: z.enum(['ENTER', 'DWELL', 'HEARTBEAT', 'EXIT']),
        observedAt: z.string().min(10),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracyMeters: z.number().positive().max(2000),
      })
    )
    .min(1)
    .max(200),
  referenceNowIso: z.string().optional(),
});

const correctionRequestSchema = z.object({
  requestedStatus: z.enum(['PRESENT', 'ABSENT', 'HOLIDAY', 'UNKNOWN']),
  reason: z.string().trim().min(5, 'Please provide a brief reason (at least 5 characters)').max(400),
});

const holidayCreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  name: z.string().trim().min(2, 'Holiday name is required').max(100),
  holidayType: z.enum(['NATIONAL', 'ACADEMIC', 'EXAM', 'PERSONAL']).default('ACADEMIC'),
});

const privacyPatchSchema = z.object({
  retainRawEventsDays: z.number().int().min(7).max(365).optional(),
  allowAnalyticsDiagnostics: z.boolean().optional(),
  backgroundTrackingConsent: z.boolean().optional(),
});

export function createApiRouter(store: AttendlyDataStore = defaultStore) {
  const router = express.Router();

  // Simple in-memory IP rate limiter for auth & sync protection
  const rateCounts = new Map<string, { count: number; resetAt: number }>();
  router.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    const ip = req.ip || 'local';
    const now = Date.now();
    const entry = rateCounts.get(ip);
    if (!entry || entry.resetAt < now) {
      rateCounts.set(ip, { count: 1, resetAt: now + 60_000 });
    } else {
      entry.count++;
      if (entry.count > 300) {
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please wait a moment and try again.',
          },
        });
        return;
      }
    }
    next();
  });

  const requireAuth = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required. Please sign in to Attendly.',
        },
      });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const payload = verifyJwt(token, 'access');
    if (!payload) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_OR_EXPIRED_TOKEN',
          message: 'Your session has expired. Please refresh or sign in again.',
        },
      });
      return;
    }

    const user = store.getState().users.find((u) => u.id === payload.sub);
    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User account no longer exists.',
        },
      });
      return;
    }

    req.user = user;
    req.tokenPayload = payload;
    next();
  };

  const getOrCreateCollegeSettings = (user: UserModel): CollegeSettingsModel => {
    const db = store.getState();
    let settings = db.collegeSettings.find((c) => c.userId === user.id);
    if (!settings) {
      const now = new Date().toISOString();
      settings = {
        userId: user.id,
        collegeId: user.collegeId || 'col_iitb',
        collegeName: 'Indian Institute of Technology Bombay',
        address: 'Main Gate Rd, IIT Area, Powai, Mumbai, Maharashtra 400076',
        latitude: 19.1334,
        longitude: 72.9133,
        radiusMeters: 150,
        workingDays: [1, 2, 3, 4, 5, 6],
        startTime: '09:00',
        endTime: '17:00',
        timezone: user.timezone || 'Asia/Kolkata',
        minimumVerifiedMinutes: 30,
        maximumVerificationWindowMinutes: 60,
        maxEvidenceGapMinutes: 15,
        maxAccuracyMeters: 50,
        outsideHoursPolicy: 'IGNORE',
        createdAt: now,
        updatedAt: now,
      };
      db.collegeSettings.push(settings);
      store.save();
    }
    return settings;
  };

  const sanitizeUser = (user: UserModel) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    studentId: user.studentId,
    department: user.department,
    semester: user.semester,
    timezone: user.timezone,
    collegeId: user.collegeId,
    trackingEnabled: user.trackingEnabled,
    permissionStatus: user.permissionStatus,
    lastSyncedAt: user.lastSyncedAt,
    privacySettings: user.privacySettings,
    createdAt: user.createdAt,
  });

  // ============================================================================
  // 1. AUTHENTICATION ENDPOINTS
  // ============================================================================

  router.post('/auth/register', (req: Request, res: Response) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Invalid registration data',
          issues: parsed.error.issues,
        },
      });
      return;
    }

    const db = store.getState();
    const existing = db.users.find((u) => u.email === parsed.data.email);
    if (existing) {
      res.status(409).json({
        success: false,
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this college email is already registered.',
        },
      });
      return;
    }

    const now = new Date().toISOString();
    const userId = `usr_${crypto.randomUUID().slice(0, 12)}`;
    const newUser: UserModel = {
      id: userId,
      name: parsed.data.name,
      email: parsed.data.email,
      studentId: parsed.data.studentId || `STU-${Math.floor(10000 + Math.random() * 90000)}`,
      department: parsed.data.department || 'B.Tech Engineering',
      semester: parsed.data.semester || 'Autumn 2026',
      passwordHash: hashPassword(parsed.data.password),
      timezone: parsed.data.timezone,
      collegeId: 'col_iitb',
      trackingEnabled: false, // Requires explicit user consent during onboarding
      permissionStatus: 'NOT_DETERMINED',
      lastSyncedAt: null,
      privacySettings: {
        retainRawEventsDays: 30,
        allowAnalyticsDiagnostics: true,
        backgroundTrackingConsent: false,
        consentUpdatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    };

    db.users.push(newUser);
    getOrCreateCollegeSettings(newUser);
    store.save();

    const access = signJwt(
      { sub: newUser.id, email: newUser.email, name: newUser.name, type: 'access' },
      3600
    );
    const refresh = signJwt(
      { sub: newUser.id, email: newUser.email, name: newUser.name, type: 'refresh' },
      30 * 24 * 3600
    );

    res.status(201).json({
      success: true,
      data: {
        user: sanitizeUser(newUser),
        accessToken: access.token,
        refreshToken: refresh.token,
        expiresAt: access.expiresAt,
      },
    });
  });

  router.post('/auth/login', (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Invalid login payload',
        },
      });
      return;
    }

    const db = store.getState();
    const user = db.users.find((u) => u.email === parsed.data.email);
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Incorrect email or password.',
        },
      });
      return;
    }

    const access = signJwt(
      { sub: user.id, email: user.email, name: user.name, type: 'access' },
      3600
    );
    const refresh = signJwt(
      { sub: user.id, email: user.email, name: user.name, type: 'refresh' },
      30 * 24 * 3600
    );

    res.json({
      success: true,
      data: {
        user: sanitizeUser(user),
        accessToken: access.token,
        refreshToken: refresh.token,
        expiresAt: access.expiresAt,
      },
    });
  });

  router.post('/auth/refresh', (req: Request, res: Response) => {
    const refreshToken = req.body?.refreshToken;
    if (!refreshToken || typeof refreshToken !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_REFRESH_TOKEN', message: 'refreshToken is required.' },
      });
      return;
    }

    const payload = verifyJwt(refreshToken, 'refresh');
    if (!payload) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired.' },
      });
      return;
    }

    const db = store.getState();
    const tokenHash = hashRefreshTokenId(payload.jti);
    if (db.revokedRefreshTokenHashes.includes(tokenHash)) {
      res.status(401).json({
        success: false,
        error: { code: 'TOKEN_REVOKED', message: 'Refresh token has already been rotated or revoked.' },
      });
      return;
    }

    const user = db.users.find((u) => u.id === payload.sub);
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
      });
      return;
    }

    // Rotate refresh token
    db.revokedRefreshTokenHashes.push(tokenHash);
    store.save();

    const access = signJwt(
      { sub: user.id, email: user.email, name: user.name, type: 'access' },
      3600
    );
    const newRefresh = signJwt(
      { sub: user.id, email: user.email, name: user.name, type: 'refresh' },
      30 * 24 * 3600
    );

    res.json({
      success: true,
      data: {
        accessToken: access.token,
        refreshToken: newRefresh.token,
        expiresAt: access.expiresAt,
      },
    });
  });

  router.post('/auth/logout', (req: Request, res: Response) => {
    const refreshToken = req.body?.refreshToken;
    if (refreshToken && typeof refreshToken === 'string') {
      const payload = verifyJwt(refreshToken, 'refresh');
      if (payload) {
        const db = store.getState();
        const tokenHash = hashRefreshTokenId(payload.jti);
        if (!db.revokedRefreshTokenHashes.includes(tokenHash)) {
          db.revokedRefreshTokenHashes.push(tokenHash);
          store.save();
        }
      }
    }
    res.json({
      success: true,
      data: { message: 'Logged out and refresh token revoked.' },
    });
  });

  router.post('/auth/forgot-password', (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_EMAIL', message: 'Please provide a valid college email address.' },
      });
      return;
    }

    // Honest disclosure when SMTP provider is not configured
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      res.status(503).json({
        success: false,
        error: {
          code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
          message:
            'Transactional email provider (SMTP_HOST / SMTP_USER) is not configured in this environment. Configure SMTP credentials in .env to enable automated password reset emails.',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        message: 'If an account matches this email, a password reset link has been dispatched.',
      },
    });
  });

  router.post('/auth/reset-password', (req: Request, res: Response) => {
    if (!process.env.SMTP_HOST) {
      res.status(503).json({
        success: false,
        error: {
          code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
          message: 'Password reset token verification requires a configured SMTP provider.',
        },
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_RESET_TOKEN', message: 'Reset token is invalid or expired.' },
    });
  });

  router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const collegeSettings = getOrCreateCollegeSettings(user);
    res.json({
      success: true,
      data: {
        user: sanitizeUser(user),
        collegeSettings,
      },
    });
  });

  // ============================================================================
  // 2. COLLEGE CONFIGURATION ENDPOINTS
  // ============================================================================

  router.get('/colleges/search', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const results = q
      ? KNOWN_COLLEGES_DIRECTORY.filter(
          (c) =>
            c.collegeName.toLowerCase().includes(q) ||
            c.address.toLowerCase().includes(q) ||
            c.collegeId.toLowerCase().includes(q)
        )
      : KNOWN_COLLEGES_DIRECTORY;

    res.json({
      success: true,
      data: {
        colleges: results,
        mapsApiConfigured: Boolean(process.env.GOOGLE_MAPS_SERVER_API_KEY),
      },
    });
  });

  router.get('/college-settings', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const settings = getOrCreateCollegeSettings(req.user!);
    res.json({
      success: true,
      data: { collegeSettings: settings },
    });
  });

  router.patch('/college-settings', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const parsed = collegeSettingsPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Invalid college configuration parameters',
          issues: parsed.error.issues,
        },
      });
      return;
    }

    const user = req.user!;
    const settings = getOrCreateCollegeSettings(user);
    const now = new Date().toISOString();

    Object.assign(settings, parsed.data, { updatedAt: now });
    if (parsed.data.collegeId) {
      user.collegeId = parsed.data.collegeId;
    }
    if (parsed.data.timezone) {
      user.timezone = parsed.data.timezone;
    }
    user.updatedAt = now;

    store.getState().auditLogs.unshift({
      id: crypto.randomUUID(),
      userId: user.id,
      action: 'COLLEGE_SETTINGS_UPDATED',
      details: `Updated college geofence (${settings.collegeName}, radius ${settings.radiusMeters}m, threshold ${settings.minimumVerifiedMinutes}m). Historical records preserved.`,
      createdAt: now,
    });

    store.save();

    res.json({
      success: true,
      data: {
        collegeSettings: settings,
        message:
          'College configuration saved. Historical attendance records remain unchanged.',
      },
    });
  });

  // ============================================================================
  // 3. TRACKING & SYNCHRONIZATION ENDPOINTS
  // ============================================================================

  router.get('/tracking/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const settings = getOrCreateCollegeSettings(user);
    const db = store.getState();
    const todayDate = getLocalDateTimeInTimezone(
      (req.query.now as string) || '2026-10-19T04:05:00.000Z',
      settings.timezone
    ).localDate;

    const todayEvents = db.locationEvents.filter(
      (e) =>
        e.userId === user.id &&
        getLocalDateTimeInTimezone(e.observedAt, settings.timezone).localDate === todayDate
    );

    res.json({
      success: true,
      data: {
        trackingEnabled: user.trackingEnabled,
        permissionStatus: user.permissionStatus,
        backgroundTrackingConsent: user.privacySettings.backgroundTrackingConsent,
        lastSyncedAt: user.lastSyncedAt,
        todayObservationCount: todayEvents.length,
        geofenceRadiusMeters: settings.radiusMeters,
        minimumVerifiedMinutes: settings.minimumVerifiedMinutes,
      },
    });
  });

  router.patch('/tracking/settings', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const parsed = trackingPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Invalid tracking settings',
        },
      });
      return;
    }

    const user = req.user!;
    const now = new Date().toISOString();

    if (typeof parsed.data.trackingEnabled === 'boolean') {
      user.trackingEnabled = parsed.data.trackingEnabled;
      if (parsed.data.trackingEnabled) {
        user.privacySettings.backgroundTrackingConsent = true;
        user.privacySettings.consentUpdatedAt = now;
      }
    }

    if (parsed.data.permissionStatus) {
      user.permissionStatus = parsed.data.permissionStatus;
      if (
        parsed.data.permissionStatus === 'DENIED' ||
        parsed.data.permissionStatus === 'NOT_DETERMINED'
      ) {
        user.trackingEnabled = false;
      }
    }

    user.updatedAt = now;
    store.getState().auditLogs.unshift({
      id: crypto.randomUUID(),
      userId: user.id,
      action: user.trackingEnabled ? 'TRACKING_RESUMED' : 'TRACKING_PAUSED',
      details: `Automatic tracking ${user.trackingEnabled ? 'enabled' : 'paused'} (Permission: ${user.permissionStatus}).`,
      createdAt: now,
    });
    store.save();

    res.json({
      success: true,
      data: {
        trackingEnabled: user.trackingEnabled,
        permissionStatus: user.permissionStatus,
        updatedAt: user.updatedAt,
      },
    });
  });

  router.post('/attendance/sync', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const parsed = syncEventsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Invalid location events payload',
          issues: parsed.error.issues,
        },
      });
      return;
    }

    const user = req.user!;
    const settings = getOrCreateCollegeSettings(user);
    const db = store.getState();
    const nowIso = parsed.data.referenceNowIso || new Date().toISOString();

    const existingEventIds = new Set(
      db.locationEvents.filter((e) => e.userId === user.id).map((e) => e.eventId)
    );

    const affectedDates = new Set<string>();
    const syncResults: {
      eventId: string;
      status: 'PROCESSED' | 'DUPLICATE' | 'REJECTED';
      reason?: string;
    }[] = [];

    for (const incoming of parsed.data.events) {
      if (existingEventIds.has(incoming.eventId)) {
        syncResults.push({ eventId: incoming.eventId, status: 'DUPLICATE' });
        continue;
      }

      let localDate = '2026-10-19';
      try {
        localDate = getLocalDateTimeInTimezone(incoming.observedAt, settings.timezone).localDate;
      } catch {
        syncResults.push({
          eventId: incoming.eventId,
          status: 'REJECTED',
          reason: 'INVALID_TIMESTAMP',
        });
        continue;
      }

      affectedDates.add(localDate);
      existingEventIds.add(incoming.eventId);

      const retentionDays = user.privacySettings.retainRawEventsDays || 30;
      const expiresAt = new Date(
        Date.now() + retentionDays * 24 * 3600 * 1000
      ).toISOString();

      db.locationEvents.push({
        id: `le_${crypto.randomUUID().slice(0, 12)}`,
        userId: user.id,
        eventId: incoming.eventId,
        eventType: incoming.eventType as LocationEventType,
        observedAt: incoming.observedAt,
        latitude: incoming.latitude,
        longitude: incoming.longitude,
        accuracyMeters: incoming.accuracyMeters,
        processingStatus: 'PROCESSED',
        processedAt: nowIso,
        expiresAt,
      });

      syncResults.push({ eventId: incoming.eventId, status: 'PROCESSED' });
    }

    // Re-evaluate attendance session deterministically for each affected date
    const updatedRecords: StoredAttendanceRecord[] = [];

    for (const dateStr of affectedDates) {
      const userEventsForDate: RawLocationObservation[] = db.locationEvents
        .filter((e) => {
          if (e.userId !== user.id) return false;
          try {
            return (
              getLocalDateTimeInTimezone(e.observedAt, settings.timezone).localDate === dateStr
            );
          } catch {
            return false;
          }
        })
        .map((e) => ({
          eventId: e.eventId,
          eventType: e.eventType,
          observedAt: e.observedAt,
          receivedAt: e.processedAt,
          latitude: e.latitude,
          longitude: e.longitude,
          accuracyMeters: e.accuracyMeters,
        }));

      const existingRecord = db.attendanceRecords.find(
        (r) => r.userId === user.id && r.attendanceDate === dateStr
      );
      const isHoliday = db.holidays.some(
        (h) => h.userId === user.id && h.date === dateStr
      );

      const evalResult = evaluateAttendanceSession(userEventsForDate, settings, {
        targetDate: dateStr,
        existingStatus: existingRecord?.status,
        isHoliday,
        referenceNowIso: nowIso,
      });

      if (existingRecord) {
        existingRecord.status = evalResult.status;
        existingRecord.verifiedDurationSeconds = Math.max(
          existingRecord.verifiedDurationSeconds,
          evalResult.verifiedDurationSeconds
        );
        existingRecord.firstConfirmedAt =
          existingRecord.firstConfirmedAt || evalResult.firstConfirmedAt;
        existingRecord.lastConfirmedAt =
          evalResult.lastConfirmedAt || existingRecord.lastConfirmedAt;
        existingRecord.warnings = evalResult.warnings;
        existingRecord.updatedAt = nowIso;
        updatedRecords.push(existingRecord);
      } else {
        const created: StoredAttendanceRecord = {
          id: `rec_${dateStr}_${user.id.slice(-4)}`,
          userId: user.id,
          collegeId: settings.collegeId,
          attendanceDate: dateStr,
          status: evalResult.status,
          firstConfirmedAt: evalResult.firstConfirmedAt,
          lastConfirmedAt: evalResult.lastConfirmedAt,
          verifiedDurationSeconds: evalResult.verifiedDurationSeconds,
          detectionMethod: 'GEOFENCE_SESSION',
          correctionStatus: 'NONE',
          trackingHealth: 'HEALTHY',
          warnings: evalResult.warnings,
          updatedAt: nowIso,
        };
        db.attendanceRecords.push(created);
        updatedRecords.push(created);
      }
    }

    user.lastSyncedAt = nowIso;
    user.updatedAt = nowIso;
    store.save();

    res.json({
      success: true,
      data: {
        syncedAt: nowIso,
        results: syncResults,
        updatedRecords,
      },
    });
  });

  // ============================================================================
  // 4. ATTENDANCE & REPORTING ENDPOINTS
  // ============================================================================

  router.get('/attendance/today', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const settings = getOrCreateCollegeSettings(user);
    const db = store.getState();

    // Use simulated current date 2026-10-19 unless overridden by query
    const refNow = (req.query.date as string)
      ? `${req.query.date}T06:00:00.000Z`
      : '2026-10-19T04:05:00.000Z';
    const todayDate = getLocalDateTimeInTimezone(refNow, settings.timezone).localDate;

    const existingRecord = db.attendanceRecords.find(
      (r) => r.userId === user.id && r.attendanceDate === todayDate
    );

    const todayEvents = db.locationEvents
      .filter((e) => {
        if (e.userId !== user.id) return false;
        try {
          return (
            getLocalDateTimeInTimezone(e.observedAt, settings.timezone).localDate === todayDate
          );
        } catch {
          return false;
        }
      })
      .map((e) => ({
        eventId: e.eventId,
        eventType: e.eventType,
        observedAt: e.observedAt,
        receivedAt: e.processedAt,
        latitude: e.latitude,
        longitude: e.longitude,
        accuracyMeters: e.accuracyMeters,
      }));

    const isHoliday = db.holidays.some(
      (h) => h.userId === user.id && h.date === todayDate
    );

    const evaluation = evaluateAttendanceSession(todayEvents, settings, {
      targetDate: todayDate,
      existingStatus: existingRecord?.status,
      isHoliday,
      referenceNowIso: '2026-10-19T11:30:00.000Z',
    });

    const verifiedSeconds = Math.max(
      existingRecord?.verifiedDurationSeconds ?? 0,
      evaluation.verifiedDurationSeconds
    );
    const requiredSeconds = settings.minimumVerifiedMinutes * 60;
    const progressPercent = Math.min(
      100,
      Math.round((verifiedSeconds / requiredSeconds) * 100)
    );

    const effectiveStatus =
      existingRecord?.status === AttendanceStatus.PRESENT || verifiedSeconds >= requiredSeconds
        ? AttendanceStatus.PRESENT
        : existingRecord?.status || evaluation.status;

    res.json({
      success: true,
      data: {
        date: todayDate,
        collegeName: settings.collegeName,
        address: settings.address,
        radiusMeters: settings.radiusMeters,
        workingHours: `${settings.startTime} – ${settings.endTime}`,
        trackingEnabled: user.trackingEnabled,
        permissionStatus: user.permissionStatus,
        lastSyncedAt: user.lastSyncedAt,
        status: effectiveStatus,
        verifiedDurationSeconds: verifiedSeconds,
        requiredDurationSeconds: requiredSeconds,
        progressPercent,
        firstConfirmedAt: existingRecord?.firstConfirmedAt || evaluation.firstConfirmedAt,
        lastConfirmedAt: existingRecord?.lastConfirmedAt || evaluation.lastConfirmedAt,
        intervals: evaluation.intervals,
        observationCount: todayEvents.length,
        warnings: existingRecord?.warnings?.length
          ? existingRecord.warnings
          : evaluation.warnings,
      },
    });
  });

  router.get('/attendance/monthly', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const settings = getOrCreateCollegeSettings(user);
    const db = store.getState();

    const year = Number(req.query.year) || 2026;
    const month = Number(req.query.month) || 10;

    if (year < 2020 || year > 2035 || month < 1 || month > 12) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_YEAR_MONTH', message: 'Invalid year or month query parameter.' },
      });
      return;
    }

    const userRecords = db.attendanceRecords.filter((r) => r.userId === user.id);
    const userHolidays = db.holidays.filter((h) => h.userId === user.id);

    const { days, summary } = buildMonthlyCalendarAndSummary({
      year,
      month,
      config: settings,
      records: userRecords,
      holidays: userHolidays,
      referenceNowIso: '2026-10-19T06:00:00.000Z',
      trackingEnabled: user.trackingEnabled,
    });

    // Also compute Semester-wise Summary (Autumn 2026: Sept + Oct 2026)
    const septReport = buildMonthlyCalendarAndSummary({
      year: 2026,
      month: 9,
      config: settings,
      records: userRecords,
      holidays: userHolidays,
      referenceNowIso: '2026-10-19T06:00:00.000Z',
      trackingEnabled: user.trackingEnabled,
    });
    const octReport = buildMonthlyCalendarAndSummary({
      year: 2026,
      month: 10,
      config: settings,
      records: userRecords,
      holidays: userHolidays,
      referenceNowIso: '2026-10-19T06:00:00.000Z',
      trackingEnabled: user.trackingEnabled,
    });

    const semPresent = septReport.summary.presentDays + octReport.summary.presentDays;
    const semAbsent = septReport.summary.absentDays + octReport.summary.absentDays;
    const semHolidays = septReport.summary.holidayDays + octReport.summary.holidayDays;
    const semUnknown = septReport.summary.unknownDays + octReport.summary.unknownDays;
    const semEligible = semPresent + semAbsent;
    const semPercent =
      semEligible > 0 ? Number(((semPresent / semEligible) * 100).toFixed(1)) : null;

    res.json({
      success: true,
      data: {
        summary,
        days,
        semesterSummary: {
          semesterName: user.semester || 'Autumn 2026 (Sem V)',
          monthsIncluded: ['September 2026', 'October 2026'],
          presentDays: semPresent,
          absentDays: semAbsent,
          holidayDays: semHolidays,
          unknownDays: semUnknown,
          eligibleWorkingDays: semEligible,
          attendancePercentage: semPercent,
          formattedPercentage:
            semPercent !== null ? `${semPercent.toFixed(1)}%` : 'No eligible working days',
        },
      },
    });
  });

  router.get('/attendance/history', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const db = store.getState();

    const statusFilter = String(req.query.status || 'ALL').toUpperCase();
    const monthFilter = String(req.query.month || 'ALL'); // e.g., "2026-10" or "2026-09"
    const searchDate = String(req.query.date || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 25));

    let records = db.attendanceRecords
      .filter((r) => r.userId === user.id)
      .sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate));

    if (statusFilter !== 'ALL') {
      records = records.filter((r) => r.status === statusFilter);
    }

    if (monthFilter !== 'ALL') {
      records = records.filter((r) => r.attendanceDate.startsWith(monthFilter));
    }

    if (searchDate) {
      records = records.filter((r) => r.attendanceDate.includes(searchDate));
    }

    const total = records.length;
    const paginated = records.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      data: {
        records: paginated,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    });
  });

  router.get('/attendance/export', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const settings = getOrCreateCollegeSettings(user);
    const db = store.getState();
    const format = String(req.query.format || 'csv').toLowerCase();
    const monthFilter = String(req.query.month || 'ALL');

    let records = db.attendanceRecords
      .filter((r) => r.userId === user.id)
      .sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate));

    if (monthFilter !== 'ALL') {
      records = records.filter((r) => r.attendanceDate.startsWith(monthFilter));
    }

    if (format === 'json') {
      res.json({
        success: true,
        data: {
          exportedAt: new Date().toISOString(),
          student: sanitizeUser(user),
          college: settings,
          records,
        },
      });
      return;
    }

    const csvRows = [
      [
        'Date',
        'Status',
        'College Name',
        'First Confirmed Arrival (ISO)',
        'Last Observation (ISO)',
        'Verified Duration (Minutes)',
        'Detection Method',
        'Correction Status',
      ].join(','),
    ];

    for (const r of records) {
      const mins = Math.round((r.verifiedDurationSeconds || 0) / 60);
      csvRows.push(
        [
          r.attendanceDate,
          r.status,
          `"${settings.collegeName.replace(/"/g, '""')}"`,
          r.firstConfirmedAt || '',
          r.lastConfirmedAt || '',
          String(mins),
          r.detectionMethod,
          r.correctionStatus,
        ].join(',')
      );
    }

    const csvString = csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="attendly-report-${user.studentId || 'student'}.csv"`
    );
    res.send(csvString);
  });

  router.get('/attendance/:date', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const settings = getOrCreateCollegeSettings(user);
    const dateStr = String(req.params.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_DATE_FORMAT', message: 'Date must be YYYY-MM-DD.' },
      });
      return;
    }

    const db = store.getState();
    const record = db.attendanceRecords.find(
      (r) => r.userId === user.id && r.attendanceDate === dateStr
    );
    const holiday = db.holidays.find(
      (h) => h.userId === user.id && h.date === dateStr
    );
    const events = db.locationEvents.filter((e) => {
      if (e.userId !== user.id) return false;
      try {
        return (
          getLocalDateTimeInTimezone(e.observedAt, settings.timezone).localDate === dateStr
        );
      } catch {
        return false;
      }
    });

    res.json({
      success: true,
      data: {
        date: dateStr,
        record: record || null,
        holiday: holiday || null,
        eventsCount: events.length,
        events,
      },
    });
  });

  router.post(
    '/attendance/:date/correction-request',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      const settings = getOrCreateCollegeSettings(user);
      const dateStr = String(req.params.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_DATE', message: 'Date must be YYYY-MM-DD.' },
        });
        return;
      }

      const parsed = correctionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message || 'Invalid correction request',
          },
        });
        return;
      }

      const db = store.getState();
      const now = new Date().toISOString();
      let record = db.attendanceRecords.find(
        (r) => r.userId === user.id && r.attendanceDate === dateStr
      );

      if (!record) {
        record = {
          id: `rec_${dateStr}_${user.id.slice(-4)}`,
          userId: user.id,
          collegeId: settings.collegeId,
          attendanceDate: dateStr,
          status: parsed.data.requestedStatus as AttendanceStatus,
          firstConfirmedAt:
            parsed.data.requestedStatus === 'PRESENT' ? `${dateStr}T03:45:00.000Z` : null,
          lastConfirmedAt:
            parsed.data.requestedStatus === 'PRESENT' ? `${dateStr}T04:30:00.000Z` : null,
          verifiedDurationSeconds:
            parsed.data.requestedStatus === 'PRESENT'
              ? settings.minimumVerifiedMinutes * 60
              : 0,
          detectionMethod: 'MANUAL_CORRECTION',
          correctionStatus: 'APPROVED',
          correctionNote: parsed.data.reason,
          trackingHealth: 'HEALTHY',
          warnings: [`Manually corrected by student: ${parsed.data.reason}`],
          updatedAt: now,
        };
        db.attendanceRecords.push(record);
      } else {
        record.status = parsed.data.requestedStatus as AttendanceStatus;
        record.detectionMethod = 'MANUAL_CORRECTION';
        record.correctionStatus = 'APPROVED';
        record.correctionNote = parsed.data.reason;
        if (
          parsed.data.requestedStatus === 'PRESENT' &&
          record.verifiedDurationSeconds < settings.minimumVerifiedMinutes * 60
        ) {
          record.verifiedDurationSeconds = settings.minimumVerifiedMinutes * 60;
          record.firstConfirmedAt = record.firstConfirmedAt || `${dateStr}T03:45:00.000Z`;
          record.lastConfirmedAt = record.lastConfirmedAt || `${dateStr}T04:30:00.000Z`;
        }
        record.warnings = [
          ...(record.warnings || []),
          `Corrected (${parsed.data.requestedStatus}): ${parsed.data.reason}`,
        ];
        record.updatedAt = now;
      }

      db.auditLogs.unshift({
        id: crypto.randomUUID(),
        userId: user.id,
        action: 'ATTENDANCE_CORRECTION_APPLIED',
        targetDate: dateStr,
        details: `Date ${dateStr} marked ${parsed.data.requestedStatus}. Reason: ${parsed.data.reason}`,
        createdAt: now,
      });

      store.save();

      res.json({
        success: true,
        data: {
          record,
          message: `Attendance record for ${dateStr} updated to ${parsed.data.requestedStatus}.`,
        },
      });
    }
  );

  router.delete(
    '/attendance/:date',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!;
      const dateStr = String(req.params.date || '');
      const db = store.getState();
      const idx = db.attendanceRecords.findIndex(
        (r) => r.userId === user.id && r.attendanceDate === dateStr
      );
      if (idx === -1) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Attendance record not found for that date.' },
        });
        return;
      }
      db.attendanceRecords.splice(idx, 1);
      db.auditLogs.unshift({
        id: crypto.randomUUID(),
        userId: user.id,
        action: 'ATTENDANCE_RECORD_DELETED',
        targetDate: dateStr,
        details: `Deleted personal attendance record for ${dateStr}.`,
        createdAt: new Date().toISOString(),
      });
      store.save();
      res.json({
        success: true,
        data: { deletedDate: dateStr },
      });
    }
  );

  // ============================================================================
  // 5. CALENDAR & HOLIDAY MANAGEMENT ENDPOINTS
  // ============================================================================

  router.get('/calendar/:year/:month', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const settings = getOrCreateCollegeSettings(user);
    const year = Number(req.params.year);
    const month = Number(req.params.month);

    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_CALENDAR_PARAMS', message: 'Valid year and month (1-12) required.' },
      });
      return;
    }

    const db = store.getState();
    const userRecords = db.attendanceRecords.filter((r) => r.userId === user.id);
    const userHolidays = db.holidays.filter((h) => h.userId === user.id);

    const { days, summary } = buildMonthlyCalendarAndSummary({
      year,
      month,
      config: settings,
      records: userRecords,
      holidays: userHolidays,
      referenceNowIso: '2026-10-19T06:00:00.000Z',
      trackingEnabled: user.trackingEnabled,
    });

    res.json({
      success: true,
      data: {
        year,
        month,
        timezone: settings.timezone,
        workingDays: settings.workingDays,
        days,
        summary,
      },
    });
  });

  router.get('/holidays', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const holidays = store
      .getState()
      .holidays.filter((h) => h.userId === user.id)
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      data: { holidays },
    });
  });

  router.post('/holidays', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const parsed = holidayCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Invalid holiday payload',
        },
      });
      return;
    }

    const db = store.getState();
    const existing = db.holidays.find(
      (h) => h.userId === user.id && h.date === parsed.data.date
    );
    if (existing) {
      res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE_HOLIDAY', message: 'A holiday is already configured for this date.' },
      });
      return;
    }

    const newHoliday = {
      id: `hol_${crypto.randomUUID().slice(0, 10)}`,
      userId: user.id,
      date: parsed.data.date,
      name: parsed.data.name,
      holidayType: parsed.data.holidayType,
      createdAt: new Date().toISOString(),
    };

    db.holidays.push(newHoliday);
    store.save();

    res.status(201).json({
      success: true,
      data: { holiday: newHoliday },
    });
  });

  router.delete('/holidays/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const id = String(req.params.id || '');
    const db = store.getState();
    const idx = db.holidays.findIndex((h) => h.id === id && h.userId === user.id);

    if (idx === -1) {
      res.status(404).json({
        success: false,
        error: { code: 'HOLIDAY_NOT_FOUND', message: 'Holiday not found in your calendar.' },
      });
      return;
    }

    const [removed] = db.holidays.splice(idx, 1);
    store.save();

    res.json({
      success: true,
      data: { deletedHoliday: removed },
    });
  });

  // ============================================================================
  // 6. PRIVACY & ACCOUNT DELETION ENDPOINTS
  // ============================================================================

  router.get('/privacy/settings', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const db = store.getState();
    const auditLogs = db.auditLogs
      .filter((a) => a.userId === user.id)
      .slice(0, 25);

    res.json({
      success: true,
      data: {
        privacySettings: user.privacySettings,
        trackingEnabled: user.trackingEnabled,
        permissionStatus: user.permissionStatus,
        storedLocationEventsCount: db.locationEvents.filter((e) => e.userId === user.id).length,
        storedAttendanceRecordsCount: db.attendanceRecords.filter((r) => r.userId === user.id).length,
        auditLogs,
      },
    });
  });

  router.patch('/privacy/settings', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const parsed = privacyPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message || 'Invalid privacy settings',
        },
      });
      return;
    }

    const now = new Date().toISOString();
    Object.assign(user.privacySettings, parsed.data, { consentUpdatedAt: now });
    if (parsed.data.backgroundTrackingConsent === false) {
      user.trackingEnabled = false;
    }
    user.updatedAt = now;
    store.save();

    res.json({
      success: true,
      data: {
        privacySettings: user.privacySettings,
        trackingEnabled: user.trackingEnabled,
      },
    });
  });

  router.delete('/account', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const db = store.getState();

    // Cascade delete all personal data for the authenticated user
    db.attendanceRecords = db.attendanceRecords.filter((r) => r.userId !== user.id);
    db.locationEvents = db.locationEvents.filter((e) => e.userId !== user.id);
    db.collegeSettings = db.collegeSettings.filter((c) => c.userId !== user.id);
    db.holidays = db.holidays.filter((h) => h.userId !== user.id);
    db.auditLogs = db.auditLogs.filter((a) => a.userId !== user.id);
    db.users = db.users.filter((u) => u.id !== user.id);

    // If demo user was deleted, re-seed demo user so subsequent preview sessions still work
    if (db.users.length === 0) {
      store.resetToSeed();
    } else {
      store.save();
    }

    res.json({
      success: true,
      data: {
        message: 'Your Attendly account and all associated attendance & location records have been permanently deleted.',
      },
    });
  });

  return router;
}
