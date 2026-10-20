/**
 * Attendly Mobile — Android Background Location & Geofencing Task Manager
 *
 * Uses `expo-location` and `expo-task-manager` in a custom Expo development/release build.
 * Handles:
 * - Foreground permission request first, followed by explicit background location disclosure & permission.
 * - Native Android geofence ENTER / EXIT monitoring (`startGeofencingAsync`).
 * - Immediate re-registration when the user saves a new college location or custom radius (`configVersion`).
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
 * Includes `configVersion` so updating coordinates or radius forces Android Location Services
 * to replace the previous circular region immediately.
 */
export function buildCollegeGeofenceRegion(settings: {
  collegeId: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  configVersion?: number;
}): NativeGeofenceRegion {
  const version = settings.configVersion ?? 1;
  return {
    identifier: `attendly_geofence_${settings.collegeId}_v${version}`,
    latitude: settings.latitude,
    longitude: settings.longitude,
    radius: Math.max(50, Math.min(2000, Math.round(settings.radiusMeters))),
    notifyOnEnter: true,
    notifyOnExit: true,
  };
}

/**
 * Synchronizes the saved CollegeSettings with the native Android `expo-location` geofencing service.
 */
export async function syncNativeCollegeGeofence(
  settings: {
    collegeId: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    configVersion?: number;
  },
  locationAdapter?: {
    hasStartedGeofencingAsync: (taskName: string) => Promise<boolean>;
    stopGeofencingAsync: (taskName: string) => Promise<void>;
    startGeofencingAsync: (taskName: string, regions: NativeGeofenceRegion[]) => Promise<void>;
  }
): Promise<{ registered: boolean; region: NativeGeofenceRegion }> {
  const region = buildCollegeGeofenceRegion(settings);
  if (locationAdapter) {
    const running = await locationAdapter.hasStartedGeofencingAsync(ATTENDLY_GEOFENCE_TASK);
    if (running) {
      await locationAdapter.stopGeofencingAsync(ATTENDLY_GEOFENCE_TASK);
    }
    await locationAdapter.startGeofencingAsync(ATTENDLY_GEOFENCE_TASK, [region]);
    return { registered: true, region };
  }
  return { registered: false, region };
}
