# Database Models & Indexes (`docs/DATABASE.md`)

Attendly uses MongoDB Atlas with Mongoose in production (`src/server/models/mongooseModels.ts`) and includes an automatic file-backed store (`data/attendly-db.json`) for zero-config local/container execution.

## Collections & Unique Indexes

1. **`users`**
   - Unique index: `{ email: 1 }`
   - Stores student profile, `passwordHash` (`scrypt` salted hash), `trackingEnabled`, `permissionStatus`, `lastSyncedAt`, and `privacySettings`.

2. **`college_settings`**
   - Unique index: `{ userId: 1 }`
   - Stores private campus coordinates (`latitude`, `longitude`), `radiusMeters` (default `150`), `workingDays`, `startTime`, `endTime`, `timezone`, and `minimumVerifiedMinutes` (`30`).

3. **`attendance_records`**
   - Unique compound index: `{ userId: 1, attendanceDate: 1 }`
   - Prevents duplicate daily attendance records under concurrent retries.

4. **`location_events`**
   - Unique compound index: `{ userId: 1, eventId: 1 }`
   - TTL index: `{ expiresAt: 1 }` (`expireAfterSeconds: 0`) for automatic raw location event expiration after the user's configured retention window (default 30 days).

5. **`holidays`**
   - Unique compound index: `{ userId: 1, date: 1 }`
