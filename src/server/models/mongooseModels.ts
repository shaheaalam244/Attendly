/**
 * Attendly — MongoDB Atlas Mongoose Schema Definitions & Index Specifications
 *
 * Used when MONGODB_URI is provided in production deployments.
 * Enforces unique compound indexes:
 * - AttendanceRecords: { userId: 1, attendanceDate: 1 } (unique)
 * - LocationEvents: { userId: 1, eventId: 1 } (unique) + TTL index on expiresAt
 */

export const MONGOOSE_SCHEMA_SPECIFICATIONS = {
  UserSchema: {
    collection: 'users',
    fields: {
      name: { type: 'String', required: true, trim: true },
      email: { type: 'String', required: true, unique: true, lowercase: true, index: true },
      studentId: { type: 'String', required: false },
      department: { type: 'String', required: false },
      semester: { type: 'String', required: false },
      passwordHash: { type: 'String', required: true },
      timezone: { type: 'String', default: 'Asia/Kolkata' },
      collegeId: { type: 'String', index: true },
      trackingEnabled: { type: 'Boolean', default: false },
      permissionStatus: {
        type: 'String',
        enum: ['GRANTED_ALWAYS', 'GRANTED_FOREGROUND', 'DENIED', 'NOT_DETERMINED'],
        default: 'NOT_DETERMINED',
      },
      lastSyncedAt: { type: 'Date', default: null },
      privacySettings: {
        retainRawEventsDays: { type: 'Number', default: 30 },
        allowAnalyticsDiagnostics: { type: 'Boolean', default: true },
        backgroundTrackingConsent: { type: 'Boolean', default: false },
        consentUpdatedAt: { type: 'Date' },
      },
    },
    timestamps: true,
  },

  CollegeSettingsSchema: {
    collection: 'college_settings',
    fields: {
      userId: { type: 'ObjectId', ref: 'User', required: true, unique: true, index: true },
      collegeId: { type: 'String', required: true },
      collegeName: { type: 'String', required: true, trim: true },
      campusLabel: { type: 'String', required: false, trim: true },
      address: { type: 'String', required: true },
      latitude: { type: 'Number', required: true, min: -90, max: 90 },
      longitude: { type: 'Number', required: true, min: -180, max: 180 },
      radiusMeters: { type: 'Number', default: 150, min: 50, max: 2000 },
      configVersion: { type: 'Number', default: 1, min: 1 },
      locationSource: {
        type: 'String',
        enum: [
          'MAP_PIN',
          'SEARCH_PLACE',
          'CURRENT_GPS',
          'MANUAL_COORDS',
          'DIRECTORY_PRESET',
          'RESTORED',
        ],
        default: 'MAP_PIN',
      },
      placeId: { type: 'String', required: false },
      locationHistory: {
        type: '[Object]',
        default: [],
      },
      workingDays: { type: '[Number]', default: [1, 2, 3, 4, 5, 6] },
      startTime: { type: 'String', default: '09:00' },
      endTime: { type: 'String', default: '17:00' },
      timezone: { type: 'String', default: 'Asia/Kolkata' },
      minimumVerifiedMinutes: { type: 'Number', default: 30 },
      maximumVerificationWindowMinutes: { type: 'Number', default: 60 },
      maxEvidenceGapMinutes: { type: 'Number', default: 15 },
      maxAccuracyMeters: { type: 'Number', default: 50 },
    },
    timestamps: true,
  },

  AttendanceRecordSchema: {
    collection: 'attendance_records',
    fields: {
      userId: { type: 'ObjectId', ref: 'User', required: true },
      collegeId: { type: 'String', required: true },
      attendanceDate: { type: 'String', required: true }, // YYYY-MM-DD in college timezone
      status: {
        type: 'String',
        enum: [
          'NOT_DETECTED',
          'PENDING',
          'PRESENT',
          'ABSENT',
          'HOLIDAY',
          'UNKNOWN',
          'NEEDS_REVIEW',
        ],
        required: true,
      },
      firstConfirmedAt: { type: 'Date', default: null },
      lastConfirmedAt: { type: 'Date', default: null },
      verifiedDurationSeconds: { type: 'Number', default: 0 },
      detectionMethod: {
        type: 'String',
        enum: ['GEOFENCE_SESSION', 'MANUAL_CORRECTION', 'DAILY_RECONCILIATION'],
        default: 'GEOFENCE_SESSION',
      },
      correctionStatus: {
        type: 'String',
        enum: ['NONE', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'],
        default: 'NONE',
      },
    },
    indexes: [{ fields: { userId: 1, attendanceDate: 1 }, options: { unique: true } }],
    timestamps: true,
  },

  LocationEventSchema: {
    collection: 'location_events',
    fields: {
      userId: { type: 'ObjectId', ref: 'User', required: true },
      eventId: { type: 'String', required: true }, // Client UUID
      eventType: {
        type: 'String',
        enum: ['ENTER', 'DWELL', 'HEARTBEAT', 'EXIT'],
        required: true,
      },
      observedAt: { type: 'Date', required: true },
      accuracyMeters: { type: 'Number', required: true },
      processingStatus: {
        type: 'String',
        enum: ['PROCESSED', 'REJECTED', 'DUPLICATE'],
        default: 'PROCESSED',
      },
      processedAt: { type: 'Date', required: true },
      expiresAt: { type: 'Date', required: true },
    },
    indexes: [
      { fields: { userId: 1, eventId: 1 }, options: { unique: true } },
      { fields: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
    ],
  },

  HolidaySchema: {
    collection: 'holidays',
    fields: {
      userId: { type: 'ObjectId', ref: 'User', required: true },
      date: { type: 'String', required: true }, // YYYY-MM-DD
      name: { type: 'String', required: true },
      holidayType: {
        type: 'String',
        enum: ['NATIONAL', 'ACADEMIC', 'EXAM', 'PERSONAL'],
        default: 'ACADEMIC',
      },
      createdAt: { type: 'Date', default: 'Date.now' },
    },
    indexes: [{ fields: { userId: 1, date: 1 }, options: { unique: true } }],
  },
};
