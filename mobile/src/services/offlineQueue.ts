/**
 * Attendly Mobile — SQLite Offline Event Queue Schema & Sync Policy
 *
 * Stores pending location observations with stable UUIDs when device is offline,
 * and synchronizes idempotently with POST /api/v1/attendance/sync.
 */

export const SQLITE_OFFLINE_QUEUE_DDL = `
CREATE TABLE IF NOT EXISTS pending_location_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('ENTER', 'DWELL', 'HEARTBEAT', 'EXIT')),
  observed_at TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy_meters REAL NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(sync_status IN ('PENDING', 'SYNCED', 'FAILED')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_events_status ON pending_location_events (user_id, sync_status, observed_at);
`;
