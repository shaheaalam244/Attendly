/**
 * Attendly Mobile — Android Background Location & Geofencing Task Manager
 *
 * Uses `expo-location` and `expo-task-manager` in a custom Expo development/release build.
 * Handles:
 * - Foreground permission request first, followed by explicit background location disclosure & permission.
 * - Native Android geofence ENTER / EXIT monitoring (`startGeofencingAsync`).
 * - Periodic low-power verification heartbeats while inside the college geofence (`startLocationUpdatesAsync` with foreground service notification).
 * - Offline persistence into SQLite queue when network is unavailable.
 */

export const ATTENDLY_GEOFENCE_TASK = 'ATTENDLY_COLLEGE_GEOFENCE_TASK';
export const ATTENDLY_PRESENCE_HEARTBEAT_TASK = 'ATTENDLY_PRESENCE_HEARTBEAT_TASK';

export interface NativeGeofenceRegion {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
}

export interface ForegroundServiceConfig {
  notificationTitle: string;
  notificationBody: string;
  notificationColor: string;
}

export const ATTENDLY_FOREGROUND_SERVICE_NOTIFICATION: ForegroundServiceConfig = {
  notificationTitle: 'Attendly — Verifying Campus Presence',
  notificationBody:
    'Collecting 30-minute presence evidence inside your configured college geofence.',
  notificationColor: '#16A34A',
};

/**
 * Generates a deterministic native geofence region descriptor from the user's CollegeSettings.
 */
export function buildCollegeGeofenceRegion(settings: {
  collegeId: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}): NativeGeofenceRegion {
  return {
    identifier: `attendly_geofence_${settings.collegeId}`,
    latitude: settings.latitude,
    longitude: settings.longitude,
    radius: Math.max(50, Math.min(1000, settings.radiusMeters)),
    notifyOnEnter: true,
    notifyOnExit: true,
  };
}
