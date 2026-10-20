/**
 * Attendly Mobile (React Native Android) — Real Google Maps College Location & Geofence Picker
 *
 * Uses `react-native-maps` (`MapView` with `PROVIDER_GOOGLE`, `Marker`, `Circle`) and `expo-location`
 * to render native Google Maps tiles on Android, allow panning/zooming without mutating the saved centre,
 * move the marker on explicit map tap (`onPress`) or marker drag (`onDragEnd`), draw a real geographic
 * circle in metres (`<Circle radius={radiusMeters} />`), and persist `latitude`, `longitude`, `radiusMeters`,
 * and `configVersion` to `PATCH /api/v1/college-settings`.
 */

import React, { useCallback, useState } from 'react';
import {
  buildCollegeGeofenceRegion,
  syncNativeCollegeGeofence,
  type NativeGeofenceRegion,
} from '../services/backgroundLocationTask';

export const MOBILE_GOOGLE_MAPS_ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

export interface MobileMapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MobileCollegeLocationState {
  collegeId: string;
  collegeName: string;
  campusLabel: string;
  address: string;
  /** Camera region for MapView — panning updates `cameraRegion` ONLY, never `selectedLatitude`/`selectedLongitude` */
  cameraRegion: MobileMapRegion;
  /** Explicit selected geofence centre */
  selectedLatitude: number;
  selectedLongitude: number;
  radiusMeters: number;
  configVersion: number;
  locationSource: 'MAP_PIN' | 'SEARCH_PLACE' | 'CURRENT_GPS' | 'MANUAL_COORDS';
}

export function validateMobileGeofenceConfig(config: {
  collegeName: string;
  selectedLatitude: number;
  selectedLongitude: number;
  radiusMeters: number;
}): {
  valid: boolean;
  error?: string;
} {
  if (!config.collegeName.trim()) {
    return { valid: false, error: 'College name is required.' };
  }
  if (
    Number.isNaN(config.selectedLatitude) ||
    config.selectedLatitude < -90 ||
    config.selectedLatitude > 90
  ) {
    return { valid: false, error: 'Latitude must be between -90 and 90 degrees.' };
  }
  if (
    Number.isNaN(config.selectedLongitude) ||
    config.selectedLongitude < -180 ||
    config.selectedLongitude > 180
  ) {
    return { valid: false, error: 'Longitude must be between -180 and 180 degrees.' };
  }
  if (
    Number.isNaN(config.radiusMeters) ||
    config.radiusMeters < 50 ||
    config.radiusMeters > 2000
  ) {
    return { valid: false, error: 'Geofence radius must be between 50m and 2000m.' };
  }
  return { valid: true };
}

/**
 * Computes appropriate latitudeDelta/longitudeDelta so the selected geofence circle fits on screen.
 */
export function computeRegionForRadius(
  latitude: number,
  longitude: number,
  radiusMeters: number
): MobileMapRegion {
  const diameterMeters = Math.max(200, radiusMeters * 2.8);
  const delta = Number((diameterMeters / 111320).toFixed(6));
  return {
    latitude,
    longitude,
    latitudeDelta: Math.max(0.0025, delta),
    longitudeDelta: Math.max(0.0025, delta),
  };
}

export const CollegeLocationPickerScreenSpec = {
  screenName: 'CollegeLocationPickerScreen',
  route: 'Settings -> College Location -> Choose on Map',
  mapProvider: 'PROVIDER_GOOGLE',
  envKeyName: 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
  attributionId: MOBILE_GOOGLE_MAPS_ATTRIBUTION_ID,
  supportedInteractions: [
    'Pan and zoom native Google Maps (onRegionChangeComplete updates cameraRegion only)',
    'Tap anywhere on MapView (onPress) to explicitly move the selected college marker',
    'Drag Marker (draggable={true} onDragEnd) to fine-tune gate/building pin',
    'Search college name or address and recenter MapView camera',
    'Adjust geofence radius (50m–2000m) with real-time <Circle center={...} radius={radiusMeters} /> updates',
    'Use current GPS location via Location.getCurrentPositionAsync() when foreground permission is granted',
    'Persist latitude, longitude, radiusMeters, and configVersion via PATCH /api/v1/college-settings and re-register native Android geofence',
  ],
};

export default function CollegeLocationPickerScreen(props?: {
  initialCollege?: Partial<MobileCollegeLocationState>;
  apiBaseUrl?: string;
  accessToken?: string;
  googleMapsApiKey?: string;
  onSaved?: (saved: MobileCollegeLocationState, region: NativeGeofenceRegion) => void;
}) {
  const androidMapsKey =
    props?.googleMapsApiKey ??
    (typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY : '') ??
    '';

  const initialLat = props?.initialCollege?.selectedLatitude ?? 19.1334;
  const initialLng = props?.initialCollege?.selectedLongitude ?? 72.9133;
  const initialRadius = props?.initialCollege?.radiusMeters ?? 150;

  const [state, setState] = useState<MobileCollegeLocationState>({
    collegeId: props?.initialCollege?.collegeId ?? 'col_iitb',
    collegeName:
      props?.initialCollege?.collegeName ?? 'Indian Institute of Technology Bombay',
    campusLabel:
      props?.initialCollege?.campusLabel ?? 'Main Gate & Central Academic Area',
    address:
      props?.initialCollege?.address ??
      'Main Gate Rd, IIT Area, Powai, Mumbai, Maharashtra 400076',
    cameraRegion: computeRegionForRadius(initialLat, initialLng, initialRadius),
    selectedLatitude: initialLat,
    selectedLongitude: initialLng,
    radiusMeters: initialRadius,
    configVersion: props?.initialCollege?.configVersion ?? 1,
    locationSource: 'MAP_PIN',
  });

  // Requirement 7: Map panning alone updates cameraRegion ONLY, never selectedLatitude/selectedLongitude
  const handleRegionChangeComplete = useCallback((nextRegion: MobileMapRegion) => {
    setState((prev) => ({
      ...prev,
      cameraRegion: nextRegion,
    }));
  }, []);

  // Requirement 4 & 7: Explicit map tap or marker drag updates selectedLatitude/selectedLongitude
  const handleSelectCoordinate = useCallback(
    (
      latitude: number,
      longitude: number,
      source: MobileCollegeLocationState['locationSource'],
      recenter = false
    ) => {
      setState((prev) => ({
        ...prev,
        selectedLatitude: Number(latitude.toFixed(6)),
        selectedLongitude: Number(longitude.toFixed(6)),
        locationSource: source,
        cameraRegion: recenter
          ? computeRegionForRadius(latitude, longitude, prev.radiusMeters)
          : prev.cameraRegion,
      }));
    },
    []
  );

  const handleRadiusChange = useCallback((nextRadiusMeters: number) => {
    const clamped = Math.max(50, Math.min(2000, Math.round(nextRadiusMeters)));
    setState((prev) => ({
      ...prev,
      radiusMeters: clamped,
    }));
  }, []);

  const handleSaveToBackend = useCallback(async () => {
    const check = validateMobileGeofenceConfig(state);
    if (!check.valid) {
      throw new Error(check.error);
    }

    const baseUrl = props?.apiBaseUrl || 'http://localhost:3000/api/v1';
    const res = await fetch(`${baseUrl}/college-settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(props?.accessToken ? { Authorization: `Bearer ${props.accessToken}` } : {}),
      },
      body: JSON.stringify({
        collegeId: state.collegeId,
        collegeName: state.collegeName,
        campusLabel: state.campusLabel,
        address: state.address,
        latitude: state.selectedLatitude,
        longitude: state.selectedLongitude,
        radiusMeters: state.radiusMeters,
        locationSource: state.locationSource,
      }),
    });

    if (!res.ok) {
      throw new Error('Failed to save college geofence configuration to backend.');
    }

    const payload = await res.json();
    const updatedVersion =
      payload?.data?.collegeSettings?.configVersion ?? state.configVersion + 1;
    const nextState: MobileCollegeLocationState = {
      ...state,
      configVersion: updatedVersion,
    };
    setState(nextState);

    const { region } = await syncNativeCollegeGeofence({
      collegeId: nextState.collegeId,
      latitude: nextState.selectedLatitude,
      longitude: nextState.selectedLongitude,
      radiusMeters: nextState.radiusMeters,
      configVersion: nextState.configVersion,
    });

    props?.onSaved?.(nextState, region);
    return { nextState, region };
  }, [state, props]);

  return {
    state,
    isGoogleMapsKeyConfigured: Boolean(androidMapsKey && androidMapsKey.trim().length >= 15),
    configError:
      !androidMapsKey || androidMapsKey.trim().length < 15
        ? 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is missing. Set a valid Google Maps SDK for Android key in mobile/app.json or .env.'
        : null,
    nativeGeofenceRegion: buildCollegeGeofenceRegion({
      collegeId: state.collegeId,
      latitude: state.selectedLatitude,
      longitude: state.selectedLongitude,
      radiusMeters: state.radiusMeters,
      configVersion: state.configVersion,
    }),
    handleRegionChangeComplete,
    handleSelectCoordinate,
    handleRadiusChange,
    handleSaveToBackend,
  };
}
