import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  Circle,
  Map,
  Pin,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
  type MapCameraChangedEvent,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Compass,
  Crosshair,
  History,
  KeyRound,
  LocateFixed,
  MapPin,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  KNOWN_COLLEGES_DIRECTORY,
  LocationEventType,
  applyCameraPanOrZoom,
  applyExplicitCenterSelection,
  applyGeofenceRadiusUpdate,
  createInitialMapPickerState,
  evaluateGoogleMapsConfigStatus,
  resolveReverseGeocodeLocation,
  verifyPointAgainstGeofence,
  type CollegeConfig,
  type InteractiveMapPickerState,
  type LocationSourceType,
  type RawLocationObservation,
  type SavedCollegeLocationEntry,
} from '../engine/attendanceEngine';

interface CollegeLocationPickerScreenProps {
  college: CollegeConfig;
  trackingEnabled: boolean;
  accessToken?: string | null;
  onSaveConfig: (patch: Partial<CollegeConfig>) => Promise<boolean>;
  onRestoreHistory: (historyId: string) => Promise<boolean>;
  onToggleTracking: (enabled: boolean) => Promise<void>;
  onSendTestObservation: (obs: Omit<RawLocationObservation, 'eventId'>) => Promise<void>;
  onClose: () => void;
}

interface SearchSuggestionItem {
  id: string;
  title: string;
  subtitle: string;
  campusLabel?: string;
  latitude?: number;
  longitude?: number;
  defaultRadiusMeters?: number;
  timezone?: string;
  source: 'DIRECTORY' | 'COORDINATES' | 'GOOGLE_PLACES';
  placePrediction?: google.maps.places.PlacePrediction;
}

const RADIUS_PRESETS = [
  { radius: 100, label: '100m', desc: 'Single Building' },
  { radius: 150, label: '150m', desc: 'Recommended' },
  { radius: 250, label: '250m', desc: 'Standard Campus' },
  { radius: 400, label: '400m', desc: 'Large Campus' },
  { radius: 750, label: '750m', desc: 'University Zone' },
];

/**
 * Registers the required Google Maps Platform attribution ID (`gmp_mcp_codeassist_v1_aistudio`)
 * and exposes live `google.maps.Geocoder` reverse geocoding when the user taps the map or drags the marker.
 */
const GoogleMapsAttributionAndGeocoderBridge: React.FC<{
  reverseGeocodeRequest: { lat: number; lng: number; seq: number } | null;
  onReverseGeocodeResult: (res: {
    formattedAddress: string;
    placeName?: string;
    placeId?: string;
  }) => void;
}> = ({ reverseGeocodeRequest, onReverseGeocodeResult }) => {
  const map = useMap();
  const geocodingLib = useMapsLibrary('geocoding');
  const lastHandledSeq = useRef<number>(0);

  useEffect(() => {
    if (!map) return;
    try {
      const mapWithAttribution = map as unknown as {
        attribution?: { registerAttributionId?: (id: string) => void };
      };
      mapWithAttribution.attribution?.registerAttributionId?.('gmp_mcp_codeassist_v1_aistudio');
    } catch {
      // Ignore if attribution helper is not exposed on current map version
    }
  }, [map]);

  useEffect(() => {
    if (
      !geocodingLib ||
      !reverseGeocodeRequest ||
      reverseGeocodeRequest.seq === lastHandledSeq.current
    ) {
      return;
    }
    lastHandledSeq.current = reverseGeocodeRequest.seq;

    const geocoder = new geocodingLib.Geocoder();
    void geocoder
      .geocode({
        location: { lat: reverseGeocodeRequest.lat, lng: reverseGeocodeRequest.lng },
      })
      .then((response) => {
        const first = response.results?.[0];
        if (!first?.formatted_address) return;
        const poiComp = first.address_components?.find(
          (c) =>
            c.types.includes('university') ||
            c.types.includes('establishment') ||
            c.types.includes('point_of_interest') ||
            c.types.includes('premise')
        );
        onReverseGeocodeResult({
          formattedAddress: first.formatted_address,
          placeName: poiComp?.long_name,
          placeId: first.place_id,
        });
      })
      .catch(() => {
        // Fallback handled by backend /colleges/reverse-geocode
      });
  }, [geocodingLib, reverseGeocodeRequest, onReverseGeocodeResult]);

  return null;
};

/**
 * Queries modern Google Places API (New) AutocompleteSuggestion with session tokens
 * when a live Google Maps API key is active.
 */
const GooglePlacesAutocompleteBridge: React.FC<{
  query: string;
  onSuggestions: (items: SearchSuggestionItem[]) => void;
}> = ({ query, onSuggestions }) => {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (!placesLib || query.trim().length < 2) {
      onSuggestions([]);
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    let cancelled = false;
    AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query.trim(),
      sessionToken: sessionTokenRef.current,
    })
      .then((res) => {
        if (cancelled) return;
        const mapped: SearchSuggestionItem[] = (res.suggestions || [])
          .filter((s) => Boolean(s.placePrediction))
          .slice(0, 5)
          .map((s, idx) => {
            const pred = s.placePrediction!;
            return {
              id: `gmp_pred_${pred.placeId || idx}`,
              title: pred.mainText?.text || pred.text?.text || 'Campus Location',
              subtitle: pred.secondaryText?.text || pred.text?.text || '',
              source: 'GOOGLE_PLACES',
              placePrediction: pred,
            };
          });
        onSuggestions(mapped);
      })
      .catch(() => {
        if (!cancelled) onSuggestions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [placesLib, query, onSuggestions]);

  return null;
};

/**
 * Renders the real Google Maps JavaScript API <Map>, <AdvancedMarker>, and <Circle>.
 * Reports SDK loading status (`LOADED`, `LOADING`, `AUTH_FAILURE`, `FAILED`) back to parent
 * so missing or invalid credentials display a clear configuration error instead of fake map graphics.
 */
const RealGoogleMapsViewport: React.FC<{
  cameraCenter: { lat: number; lng: number };
  zoom: number;
  mapType: 'roadmap' | 'satellite' | 'hybrid';
  selectedMarkerPos: { lat: number; lng: number };
  testPos: { lat: number; lng: number };
  radiusMeters: number;
  reverseGeocodeRequest: { lat: number; lng: number; seq: number } | null;
  onCameraPanOrZoom: (center: { lat: number; lng: number }, zoom: number) => void;
  onExplicitPointSelect: (lat: number, lng: number, source: LocationSourceType) => void;
  onReverseGeocodeResult: (res: {
    formattedAddress: string;
    placeName?: string;
    placeId?: string;
  }) => void;
  onSdkStatusChange: (status: APILoadingStatus) => void;
}> = ({
  cameraCenter,
  zoom,
  mapType,
  selectedMarkerPos,
  testPos,
  radiusMeters,
  reverseGeocodeRequest,
  onCameraPanOrZoom,
  onExplicitPointSelect,
  onReverseGeocodeResult,
  onSdkStatusChange,
}) => {
  const status = useApiLoadingStatus();

  useEffect(() => {
    onSdkStatusChange(status);
  }, [status, onSdkStatusChange]);

  if (status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED) {
    return null;
  }

  return (
    <Map
      style={{ width: '100%', height: '100%' }}
      center={cameraCenter}
      zoom={zoom}
      mapTypeId={mapType}
      mapId="DEMO_MAP_ID"
      gestureHandling="greedy"
      disableDefaultUI={false}
      clickableIcons={false}
      onCameraChanged={(ev: MapCameraChangedEvent) => {
        // Requirement 7: Map panning/zooming alone only updates cameraCenter & zoom, NEVER the saved/selected centre
        onCameraPanOrZoom(ev.detail.center, ev.detail.zoom);
      }}
      onClick={(ev: MapMouseEvent) => {
        // Requirement 4 & 7: Explicit map tap moves the selected college marker
        if (ev.detail.latLng) {
          onExplicitPointSelect(ev.detail.latLng.lat, ev.detail.latLng.lng, 'MAP_PIN');
        }
      }}
    >
      <GoogleMapsAttributionAndGeocoderBridge
        reverseGeocodeRequest={reverseGeocodeRequest}
        onReverseGeocodeResult={onReverseGeocodeResult}
      />

      {/* Requirement 5: Real geographic circle in metres around the selected marker */}
      <Circle
        center={selectedMarkerPos}
        radius={radiusMeters}
        strokeColor="#16A34A"
        strokeOpacity={0.95}
        strokeWeight={2}
        fillColor="#16A34A"
        fillOpacity={0.18}
        clickable={false}
        editable={false}
        draggable={false}
      />

      {/* Requirement 4: Draggable selected college location marker */}
      <AdvancedMarker
        position={selectedMarkerPos}
        draggable={true}
        title="Drag to position exact college geofence center"
        onDragEnd={(e) => {
          if (e.latLng) {
            onExplicitPointSelect(e.latLng.lat(), e.latLng.lng(), 'MAP_PIN');
          }
        }}
      >
        <Pin background="#16A34A" borderColor="#166534" glyphColor="#FFFFFF" scale={1.25} />
      </AdvancedMarker>

      {/* Student GPS test observation marker */}
      <AdvancedMarker position={testPos} title="Student GPS Verification Point">
        <div className="w-4 h-4 rounded-full bg-sky-600 border-2 border-white shadow-md" />
      </AdvancedMarker>
    </Map>
  );
};

export const CollegeLocationPickerScreen: React.FC<CollegeLocationPickerScreenProps> = ({
  college,
  trackingEnabled,
  accessToken,
  onSaveConfig,
  onRestoreHistory,
  onToggleTracking,
  onSendTestObservation,
  onClose,
}) => {
  const buildTimeApiKey =
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined)) ||
    '';

  const [runtimeApiKey, setRuntimeApiKey] = useState<string>(buildTimeApiKey.trim());
  const [sdkLoadingStatus, setSdkLoadingStatus] = useState<string>(
    buildTimeApiKey.trim() ? 'LOADING' : 'NOT_LOADED'
  );
  const [authFailureDetected, setAuthFailureDetected] = useState<boolean>(false);
  const [authErrorDetail, setAuthErrorDetail] = useState<string | null>(null);

  // Core map & geofence state (separating cameraCenter from selectedLat/selectedLng per Requirement 7)
  const [mapState, setMapState] = useState<InteractiveMapPickerState>(() =>
    createInitialMapPickerState(college)
  );
  const [collegeId, setCollegeId] = useState<string>(college.collegeId);
  const [collegeName, setCollegeName] = useState<string>(college.collegeName);
  const [campusLabel, setCampusLabel] = useState<string>(
    college.campusLabel || 'Main Gate & Central Academic Area'
  );
  const [address, setAddress] = useState<string>(college.address);
  const [manualLatInput, setManualLatInput] = useState<string>(college.latitude.toFixed(6));
  const [manualLngInput, setManualLngInput] = useState<string>(college.longitude.toFixed(6));
  const [timezone, setTimezone] = useState<string>(college.timezone);
  const [placeId, setPlaceId] = useState<string | undefined>(college.placeId);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'hybrid'>('roadmap');

  // Sequence counter for live Google Geocoder reverse-geocoding on map tap / pin drag
  const [reverseGeocodeReq, setReverseGeocodeReq] = useState<{
    lat: number;
    lng: number;
    seq: number;
  } | null>(null);

  // Student GPS test coordinate for live attendance engine geofence verification
  const [testPointLat, setTestPointLat] = useState<number>(
    Number((college.latitude + 0.00035).toFixed(6))
  );
  const [testPointLng, setTestPointLng] = useState<number>(
    Number((college.longitude + 0.00025).toFixed(6))
  );

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [googleSuggestions, setGoogleSuggestions] = useState<SearchSuggestionItem[]>([]);
  const [backendSuggestions, setBackendSuggestions] = useState<SearchSuggestionItem[]>([]);

  // Feedback & saving states
  const [coordError, setCoordError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);

  // Query backend /api/v1/maps/config on mount in case VITE_GOOGLE_MAPS_API_KEY was set at server runtime
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    fetch('/api/v1/maps/config', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (!active || !payload?.data) return;
        const serverProvidedClientKey = String(payload.data.clientApiKey || '').trim();
        if (serverProvidedClientKey && !runtimeApiKey) {
          setRuntimeApiKey(serverProvidedClientKey);
          setSdkLoadingStatus('LOADING');
        }
      })
      .catch(() => {
        // Ignore network errors on config check
      });
    return () => {
      active = false;
    };
  }, [accessToken, runtimeApiKey]);

  // Listen for Google Maps JavaScript API global authentication failures (gm_authFailure)
  useEffect(() => {
    const win = window as unknown as { gm_authFailure?: () => void };
    const prevHandler = win.gm_authFailure;
    win.gm_authFailure = () => {
      setAuthFailureDetected(true);
      setAuthErrorDetail(
        'Google Maps JavaScript API reported gm_authFailure (InvalidKeyMapError, ApiNotActivatedMapError, BillingNotEnabledMapError, or RefererNotAllowedMapError).'
      );
      if (typeof prevHandler === 'function') {
        prevHandler();
      }
    };
    return () => {
      win.gm_authFailure = prevHandler;
    };
  }, []);

  // Evaluate Google Maps Platform configuration status (Requirement 10 & 11)
  const mapsConfigDiagnostic = useMemo(
    () =>
      evaluateGoogleMapsConfigStatus({
        apiKey: runtimeApiKey,
        sdkLoadingStatus,
        authFailureDetected,
        authErrorDetail,
        platform: 'web',
      }),
    [runtimeApiKey, sdkLoadingStatus, authFailureDetected, authErrorDetail]
  );

  // Live geofence verification between selected college pin + radius and the student test GPS point
  const liveVerification = useMemo(
    () =>
      verifyPointAgainstGeofence({
        pointLatitude: testPointLat,
        pointLongitude: testPointLng,
        targetLatitude: mapState.selectedLat,
        targetLongitude: mapState.selectedLng,
        radiusMeters: mapState.radiusMeters,
        accuracyMeters: 12,
        maxAccuracyMeters: college.maxAccuracyMeters,
      }),
    [
      testPointLat,
      testPointLng,
      mapState.selectedLat,
      mapState.selectedLng,
      mapState.radiusMeters,
      college.maxAccuracyMeters,
    ]
  );

  // Query backend /api/v1/colleges/search when searchQuery changes
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!accessToken || trimmed.length < 2) {
      setBackendSuggestions([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/v1/colleges/search?q=${encodeURIComponent(trimmed)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.data?.colleges) return;
        const items: SearchSuggestionItem[] = payload.data.colleges
          .slice(0, 8)
          .map((c: (typeof KNOWN_COLLEGES_DIRECTORY)[number] & { placeId?: string }) => ({
            id: c.collegeId,
            title: c.collegeName,
            subtitle: c.address,
            campusLabel: c.campusLabel,
            latitude: c.latitude,
            longitude: c.longitude,
            defaultRadiusMeters: c.defaultRadiusMeters,
            timezone: c.timezone,
            source: 'DIRECTORY' as const,
          }));
        setBackendSuggestions(items);
      })
      .catch(() => {
        if (!cancelled) setBackendSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, searchQuery]);

  // Explicit point selection handler (Map tap, Marker drag, Search selection, Current GPS, Manual Coords)
  const handleExplicitPointSelection = useCallback(
    (
      lat: number,
      lng: number,
      source: LocationSourceType,
      options?: {
        recenterCamera?: boolean;
        zoom?: number;
        overrideName?: string;
        overrideCampusLabel?: string;
        overrideAddress?: string;
        overrideCollegeId?: string;
        overrideRadius?: number;
        overrideTimezone?: string;
        overridePlaceId?: string;
      }
    ) => {
      const updateResult = applyExplicitCenterSelection(mapState, {
        latitude: lat,
        longitude: lng,
        source,
        recenterCamera: options?.recenterCamera ?? false,
        zoom: options?.zoom,
      });

      if (!updateResult.valid) {
        setCoordError(updateResult.error || 'Invalid coordinates.');
        return;
      }

      let nextState = updateResult.state;
      if (options?.overrideRadius !== undefined) {
        const rUp = applyGeofenceRadiusUpdate(nextState, options.overrideRadius);
        nextState = rUp.state;
      }

      setMapState(nextState);
      setManualLatInput(nextState.selectedLat.toFixed(6));
      setManualLngInput(nextState.selectedLng.toFixed(6));
      setCoordError(null);

      if (options?.overrideTimezone) {
        setTimezone(options.overrideTimezone);
      }
      if (options?.overridePlaceId !== undefined) {
        setPlaceId(options.overridePlaceId);
      }

      if (options?.overrideName && options?.overrideAddress) {
        setCollegeName(options.overrideName);
        if (options.overrideCampusLabel !== undefined) {
          setCampusLabel(options.overrideCampusLabel);
        }
        setAddress(options.overrideAddress);
        if (options.overrideCollegeId) {
          setCollegeId(options.overrideCollegeId);
        }
      } else {
        // Immediate local reverse-geocode + trigger Google Maps Geocoder & backend reverse-geocode
        const resolved = resolveReverseGeocodeLocation(
          nextState.selectedLat,
          nextState.selectedLng
        );
        if (resolved.nearestPresetId && (resolved.distanceToPresetMeters ?? 9999) <= 1200) {
          setCollegeName(resolved.suggestedName);
          setCampusLabel(resolved.suggestedCampusLabel);
          setAddress(resolved.formattedAddress);
          setCollegeId(resolved.nearestPresetId);
          setTimezone(resolved.timezone);
        } else {
          setAddress(resolved.formattedAddress);
          setCampusLabel(resolved.suggestedCampusLabel);
          setCollegeId(`col_custom_${Math.abs(Math.round(nextState.selectedLat * 1000))}`);
        }
        setReverseGeocodeReq((prev) => ({
          lat: nextState.selectedLat,
          lng: nextState.selectedLng,
          seq: (prev?.seq ?? 0) + 1,
        }));

        if (accessToken) {
          fetch(
            `/api/v1/colleges/reverse-geocode?lat=${nextState.selectedLat}&lng=${nextState.selectedLng}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
            .then((r) => (r.ok ? r.json() : null))
            .then((payload) => {
              if (payload?.data?.formattedAddress) {
                setAddress(payload.data.formattedAddress);
                if (payload.data.suggestedName) {
                  setCollegeName(payload.data.suggestedName);
                }
                if (payload.data.placeId) {
                  setPlaceId(payload.data.placeId);
                }
              }
            })
            .catch(() => {
              // Keep local resolved description
            });
        }
      }
    },
    [mapState, accessToken]
  );

  // Build combined search suggestions from Google Places, Backend Search, Coordinate Parser, and Verified Directory
  const combinedSuggestions = useMemo<SearchSuggestionItem[]>(() => {
    const q = searchQuery.trim();
    const qLower = q.toLowerCase();

    const coordMatch = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    const coordItems: SearchSuggestionItem[] = [];
    if (coordMatch) {
      const parsedLat = Number(coordMatch[1]);
      const parsedLng = Number(coordMatch[2]);
      if (
        !Number.isNaN(parsedLat) &&
        !Number.isNaN(parsedLng) &&
        parsedLat >= -90 &&
        parsedLat <= 90 &&
        parsedLng >= -180 &&
        parsedLng <= 180
      ) {
        coordItems.push({
          id: `coord_${parsedLat}_${parsedLng}`,
          title: `Move Pin to Coordinates (${parsedLat.toFixed(5)}°, ${parsedLng.toFixed(5)}°)`,
          subtitle: 'Direct latitude & longitude selection',
          latitude: parsedLat,
          longitude: parsedLng,
          source: 'COORDINATES',
        });
      }
    }

    const localDirectoryItems: SearchSuggestionItem[] = KNOWN_COLLEGES_DIRECTORY.filter((c) => {
      if (!qLower) return true;
      return (
        c.collegeName.toLowerCase().includes(qLower) ||
        c.campusLabel.toLowerCase().includes(qLower) ||
        c.address.toLowerCase().includes(qLower)
      );
    }).map((c) => ({
      id: c.collegeId,
      title: c.collegeName,
      subtitle: c.address,
      campusLabel: c.campusLabel,
      latitude: c.latitude,
      longitude: c.longitude,
      defaultRadiusMeters: c.defaultRadiusMeters,
      timezone: c.timezone,
      source: 'DIRECTORY',
    }));

    const seenIds = new Set<string>();
    const merged: SearchSuggestionItem[] = [];
    for (const item of [
      ...coordItems,
      ...googleSuggestions,
      ...backendSuggestions,
      ...localDirectoryItems,
    ]) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      merged.push(item);
    }
    return merged.slice(0, 8);
  }, [searchQuery, googleSuggestions, backendSuggestions]);

  const handleSelectSuggestion = async (item: SearchSuggestionItem) => {
    setSearchOpen(false);
    setSearchQuery(item.title);

    if (item.source === 'GOOGLE_PLACES' && item.placePrediction) {
      try {
        const place = item.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location'],
        });
        if (place.location) {
          const lat = place.location.lat();
          const lng = place.location.lng();
          handleExplicitPointSelection(lat, lng, 'SEARCH_PLACE', {
            recenterCamera: true,
            zoom: 17,
            overrideName: place.displayName || item.title,
            overrideCampusLabel: 'Selected Google Maps Campus Location',
            overrideAddress: place.formattedAddress || item.subtitle,
            overrideCollegeId: `col_gmp_${(item.placePrediction.placeId || 'custom').slice(0, 8)}`,
            overridePlaceId: item.placePrediction.placeId,
          });
          setTestPointLat(Number((lat + 0.00025).toFixed(6)));
          setTestPointLng(Number((lng + 0.0002).toFixed(6)));
          setStatusMessage(
            `Selected "${place.displayName || item.title}" on Google Maps. Adjust the geofence radius or drag the marker if needed.`
          );
          return;
        }
      } catch {
        // Fallback if Place details call fails
      }
    }

    if (item.latitude !== undefined && item.longitude !== undefined) {
      handleExplicitPointSelection(
        item.latitude,
        item.longitude,
        item.source === 'COORDINATES' ? 'MANUAL_COORDS' : 'SEARCH_PLACE',
        {
          recenterCamera: true,
          zoom: 16,
          overrideName: item.source === 'COORDINATES' ? collegeName : item.title,
          overrideCampusLabel: item.campusLabel || 'Main Campus Boundary',
          overrideAddress:
            item.source === 'COORDINATES'
              ? `Pinned Coordinate (${item.latitude.toFixed(5)}°N, ${item.longitude.toFixed(5)}°E)`
              : item.subtitle,
          overrideCollegeId: item.source === 'DIRECTORY' ? item.id : undefined,
          overrideRadius: item.defaultRadiusMeters,
          overrideTimezone: item.timezone,
        }
      );
      setTestPointLat(Number((item.latitude + 0.00025).toFixed(6)));
      setTestPointLng(Number((item.longitude + 0.0002).toFixed(6)));
      setStatusMessage(`Centered on ${item.title}. Drag the marker or adjust the radius below.`);
    }
  };

  // Manual Latitude / Longitude Apply
  const handleApplyManualCoordinates = () => {
    const latNum = Number(manualLatInput.trim());
    const lngNum = Number(manualLngInput.trim());
    const check = applyExplicitCenterSelection(mapState, {
      latitude: latNum,
      longitude: lngNum,
      source: 'MANUAL_COORDS',
      recenterCamera: true,
    });
    if (!check.valid) {
      setCoordError(
        check.error ||
          'Please enter valid numeric coordinates: Latitude (-90 to 90) and Longitude (-180 to 180).'
      );
      return;
    }
    handleExplicitPointSelection(latNum, lngNum, 'MANUAL_COORDS', { recenterCamera: true });
    setTestPointLat(Number((latNum + 0.0002).toFixed(6)));
    setTestPointLng(Number((lngNum + 0.0002).toFixed(6)));
    setStatusMessage(
      `Applied manual coordinates (${latNum.toFixed(5)}°N, ${lngNum.toFixed(5)}°E) and updated geofence centre.`
    );
  };

  // Use Current Device Location (with browser geolocation permission handling)
  const handleUseCurrentGpsLocation = () => {
    setIsLocatingGps(true);
    setCoordError(null);

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsLocatingGps(false);
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          handleExplicitPointSelection(lat, lng, 'CURRENT_GPS', {
            recenterCamera: true,
            zoom: 17,
          });
          setTestPointLat(lat);
          setTestPointLng(lng);
          setStatusMessage(
            `Centered college pin on your live device GPS location (${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E).`
          );
        },
        (err) => {
          setIsLocatingGps(false);
          setCoordError(
            `Location permission or GPS fix unavailable (${err.message || 'Geolocation denied'}). Grant browser location permission or search/enter coordinates manually.`
          );
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      setIsLocatingGps(false);
      setCoordError('Geolocation API is not supported in this browser environment.');
    }
  };

  // Fit zoom level appropriately for the selected radius around the selected pin
  const handleFitGeofenceBounds = () => {
    const r = mapState.radiusMeters;
    const idealZoom = r <= 120 ? 17 : r <= 280 ? 16 : r <= 600 ? 15 : r <= 1200 ? 14 : 13;
    setMapState((prev) =>
      applyCameraPanOrZoom(prev, { lat: prev.selectedLat, lng: prev.selectedLng }, idealZoom)
    );
  };

  const handleRadiusChange = (nextRadius: number) => {
    const res = applyGeofenceRadiusUpdate(mapState, nextRadius);
    if (!res.valid && res.error) {
      setCoordError(res.error);
    } else {
      setCoordError(null);
    }
    setMapState(res.state);
  };

  const radiusAdvisory = useMemo(() => {
    const r = mapState.radiusMeters;
    if (r < 90) {
      return {
        tone: 'amber' as const,
        text: 'Tight radius (<90m): Best for a single department building. Indoor GPS drift may occasionally step outside this boundary.',
      };
    }
    if (r <= 350) {
      return {
        tone: 'green' as const,
        text: 'Optimal campus radius (90m–350m): Balances accurate gate/building entry verification with indoor GPS resilience.',
      };
    }
    return {
      tone: 'amber' as const,
      text: 'Wide university zone (>350m): Covers multiple academic blocks and hostels. Ensure adjacent transit roads outside campus are not unintentionally included.',
    };
  }, [mapState.radiusMeters]);

  const handleSaveConfiguration = async (alsoEnableTracking = false) => {
    if (!collegeName.trim()) {
      setCoordError('College name is required before saving.');
      return;
    }
    if (
      Number.isNaN(mapState.selectedLat) ||
      mapState.selectedLat < -90 ||
      mapState.selectedLat > 90 ||
      Number.isNaN(mapState.selectedLng) ||
      mapState.selectedLng < -180 ||
      mapState.selectedLng > 180
    ) {
      setCoordError('Coordinates are out of valid bounds.');
      return;
    }
    if (mapState.radiusMeters < 50 || mapState.radiusMeters > 2000) {
      setCoordError('Geofence radius must be between 50m and 2000m.');
      return;
    }

    setIsSaving(true);
    setCoordError(null);

    const ok = await onSaveConfig({
      collegeId,
      collegeName: collegeName.trim(),
      campusLabel: campusLabel.trim(),
      address: address.trim(),
      latitude: mapState.selectedLat,
      longitude: mapState.selectedLng,
      radiusMeters: Math.round(mapState.radiusMeters),
      timezone,
      locationSource: mapState.locationSource,
      placeId,
    });

    if (ok && alsoEnableTracking && !trackingEnabled) {
      await onToggleTracking(true);
    }

    setIsSaving(false);
    if (ok) {
      setMapState((prev) => ({
        ...prev,
        configVersion: prev.configVersion + 1,
      }));
      setStatusMessage(
        `Saved ${collegeName.trim()} (${Math.round(mapState.radiusMeters)}m radius, config v${
          (college.configVersion ?? 1) + 1
        }) to backend attendance engine.`
      );
    }
  };

  const handleSendTestPointToEngine = async () => {
    await handleSaveConfiguration(false);
    await onSendTestObservation({
      eventType: LocationEventType.HEARTBEAT,
      observedAt: '2026-10-19T04:12:00.000Z',
      latitude: testPointLat,
      longitude: testPointLng,
      accuracyMeters: 12,
    });
    setStatusMessage(
      `Sent GPS observation (${testPointLat.toFixed(5)}°N, ${testPointLng.toFixed(5)}°E) — ${
        liveVerification.insideGeofence
          ? `Verified INSIDE ${mapState.radiusMeters}m geofence (${liveVerification.distanceMeters}m from pin).`
          : `OUTSIDE ${mapState.radiusMeters}m geofence (${liveVerification.distanceMeters}m from pin).`
      }`
    );
  };

  const savedHistory: SavedCollegeLocationEntry[] = college.locationHistory || [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Interactive College Location & Geofence Map Picker"
      className="fixed inset-0 z-50 bg-[#0F172A]/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-7xl w-full max-h-[95vh] flex flex-col shadow-xl overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs font-semibold text-[#0F172A] hover:bg-slate-100 transition-colors min-h-[38px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Settings</span>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-[#0F172A]">
                  Interactive College Location &amp; Geofence Picker
                </h2>
                <span className="hidden sm:inline font-mono text-xs font-semibold text-[#166534]">
                  · R = {mapState.radiusMeters}m · v{college.configVersion ?? 1}
                </span>
              </div>
              <p className="text-xs text-[#64748B]">
                Pan or zoom Google Maps freely; tap the map, drag the marker, or search a college to set your attendance boundary.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSaveConfiguration(false)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#166534] transition-colors min-h-[38px] disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Location & Geofence'}</span>
            </button>
          </div>
        </div>

        {/* Status / Validation Banners */}
        {coordError && (
          <div
            role="alert"
            className="px-4 sm:px-6 py-2.5 bg-red-50 border-b border-red-200 text-xs font-medium text-[#DC2626] flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{coordError}</span>
            </span>
            <button
              type="button"
              onClick={() => setCoordError(null)}
              className="text-[11px] font-semibold underline ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {statusMessage && (
          <div
            role="status"
            className="px-4 sm:px-6 py-2 bg-[#16A34A]/10 border-b border-[#16A34A]/20 text-xs font-medium text-[#166534] flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#16A34A]" />
              <span>{statusMessage}</span>
            </span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-[11px] font-semibold underline ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main 12-Column Split Workspace */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0]">
          {/* Left 7 Columns: Search Bar + Real Google Maps Viewport + Live Geofence Verification Bar */}
          <div className="lg:col-span-7 flex flex-col bg-[#F8FAFC] p-4 sm:p-5 space-y-4">
            {/* A. Search Bar at the top of the map */}
            <div className="relative z-30">
              <label htmlFor="map-picker-search-input" className="sr-only">
                Search college name, address, city, or coordinates
              </label>
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 pointer-events-none" />
                <input
                  id="map-picker-search-input"
                  type="text"
                  value={searchQuery}
                  onFocus={() => setSearchOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  placeholder="Search college name, campus gate, city, or enter '19.1334, 72.9133'..."
                  className="w-full h-11 pl-10 pr-28 rounded-xl border border-[#E2E8F0] bg-white text-xs text-[#0F172A] shadow-2xs focus:outline-none focus:border-[#16A34A]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSearchOpen(true);
                    }}
                    className="absolute right-20 text-[11px] font-semibold text-[#64748B] hover:text-[#0F172A] px-2 py-1"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSearchOpen((o) => !o)}
                  className="absolute right-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-2.5 py-1.5 text-[11px] font-semibold text-[#0F172A] hover:bg-slate-100"
                >
                  {searchOpen ? 'Hide' : 'Browse'}
                </button>
              </div>

              {/* Search Suggestions Dropdown */}
              {searchOpen && combinedSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-1.5 rounded-xl bg-white border border-[#E2E8F0] shadow-lg max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {combinedSuggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void handleSelectSuggestion(item)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-[#F8FAFC] transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#0F172A] truncate flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                          <span className="truncate">{item.title}</span>
                        </div>
                        {item.campusLabel && (
                          <div className="text-[11px] font-medium text-[#166534] pl-5 truncate">
                            {item.campusLabel}
                          </div>
                        )}
                        <div className="text-[11px] text-[#64748B] pl-5 truncate">
                          {item.subtitle}
                        </div>
                      </div>
                      {item.latitude !== undefined && item.longitude !== undefined && (
                        <span className="text-[10px] font-mono text-[#64748B] shrink-0 bg-slate-100 px-2 py-0.5 rounded-md">
                          {item.latitude.toFixed(4)}°, {item.longitude.toFixed(4)}°
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Map Controls Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                {(['roadmap', 'satellite', 'hybrid'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setMapType(mode)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold capitalize transition-colors ${
                      mapType === mode
                        ? 'bg-[#0F172A] border-[#0F172A] text-white'
                        : 'bg-white border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleUseCurrentGpsLocation}
                  disabled={isLocatingGps}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-100 transition-colors min-h-[34px]"
                >
                  <LocateFixed className="w-3.5 h-3.5 text-[#16A34A]" />
                  <span>{isLocatingGps ? 'Locating...' : 'Use Current Location'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleFitGeofenceBounds}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-100 transition-colors min-h-[34px]"
                >
                  <Crosshair className="w-3.5 h-3.5 text-[#16A34A]" />
                  <span>Fit Circle</span>
                </button>
                <button
                  type="button"
                  aria-label="Zoom in map"
                  onClick={() =>
                    setMapState((prev) =>
                      applyCameraPanOrZoom(prev, prev.cameraCenter, prev.zoom + 1)
                    )
                  }
                  className="w-8 h-8 rounded-xl border border-[#E2E8F0] bg-white flex items-center justify-center text-[#0F172A] hover:bg-slate-100"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Zoom out map"
                  onClick={() =>
                    setMapState((prev) =>
                      applyCameraPanOrZoom(prev, prev.cameraCenter, prev.zoom - 1)
                    )
                  }
                  className="w-8 h-8 rounded-xl border border-[#E2E8F0] bg-white flex items-center justify-center text-[#0F172A] hover:bg-slate-100"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* B. Real Google Maps JavaScript API Viewport OR Honest Configuration Error State (Requirement 3, 10, 11) */}
            <div className="relative w-full h-[380px] sm:h-[430px] rounded-2xl border border-[#E2E8F0] bg-slate-100 overflow-hidden shadow-inner">
              {runtimeApiKey &&
              mapsConfigDiagnostic.status !== 'MISSING_API_KEY' &&
              mapsConfigDiagnostic.status !== 'AUTH_OR_BILLING_ERROR' &&
              mapsConfigDiagnostic.status !== 'SCRIPT_LOAD_ERROR' ? (
                <APIProvider
                  apiKey={runtimeApiKey}
                  solutionChannel="GMP_visgl_rgm_v1_aistudio"
                >
                  <GooglePlacesAutocompleteBridge
                    query={searchQuery}
                    onSuggestions={setGoogleSuggestions}
                  />
                  <RealGoogleMapsViewport
                    cameraCenter={mapState.cameraCenter}
                    zoom={mapState.zoom}
                    mapType={mapType}
                    selectedMarkerPos={{
                      lat: mapState.selectedLat,
                      lng: mapState.selectedLng,
                    }}
                    testPos={{ lat: testPointLat, lng: testPointLng }}
                    radiusMeters={mapState.radiusMeters}
                    reverseGeocodeRequest={reverseGeocodeReq}
                    onCameraPanOrZoom={(center, nextZoom) => {
                      setMapState((prev) => applyCameraPanOrZoom(prev, center, nextZoom));
                    }}
                    onExplicitPointSelect={(lat, lng, src) => {
                      handleExplicitPointSelection(lat, lng, src, { recenterCamera: false });
                    }}
                    onReverseGeocodeResult={(res) => {
                      setAddress(res.formattedAddress);
                      if (res.placeName) {
                        setCollegeName(res.placeName);
                      }
                      if (res.placeId) {
                        setPlaceId(res.placeId);
                      }
                    }}
                    onSdkStatusChange={(st) => {
                      setSdkLoadingStatus(String(st));
                    }}
                  />
                </APIProvider>
              ) : (
                /* Requirement 11: Clear Google Maps Configuration Error (NEVER render fake roads or placeholder map shapes) */
                <div
                  role="alert"
                  data-testid="google-maps-config-error"
                  className="w-full h-full bg-white p-5 sm:p-6 flex flex-col justify-between overflow-y-auto"
                >
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 text-[#D97706]">
                        <KeyRound className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-[#0F172A]">
                            {mapsConfigDiagnostic.title}
                          </h3>
                          <span className="font-mono text-[11px] font-semibold text-[#D97706]">
                            [{mapsConfigDiagnostic.errorCode}]
                          </span>
                        </div>
                        <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                          {mapsConfigDiagnostic.message}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3.5 space-y-2 text-xs">
                      <div className="font-semibold text-[#0F172A]">
                        Required Google Cloud &amp; Environment Configuration:
                      </div>
                      <ul className="list-disc pl-4 space-y-1 text-[#64748B]">
                        {mapsConfigDiagnostic.remediationSteps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                        <li>
                          <strong>Android Production App:</strong> Set{' '}
                          <code className="font-mono text-[#0F172A]">
                            EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
                          </code>{' '}
                          in <code className="font-mono text-[#0F172A]">mobile/app.json</code> with{' '}
                          <strong>Maps SDK for Android</strong> enabled.
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Honest Telemetry Readout of Active Selected Coordinates & Radius */}
                  <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="text-[#64748B] block text-[11px]">
                        Selected Geofence Centre &amp; Radius (Connected to Attendance Engine)
                      </span>
                      <span className="font-mono font-bold text-[#0F172A]">
                        {mapState.selectedLat.toFixed(6)}°N, {mapState.selectedLng.toFixed(6)}°E ·
                        Radius {mapState.radiusMeters}m · Source: {mapState.locationSource}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-[#166534]">
                      Search, GPS &amp; Manual Coordinates Active
                    </span>
                  </div>
                </div>
              )}

              {/* Bottom Telemetry Strip when Live Google Maps SDK is Ready */}
              {mapsConfigDiagnostic.isInteractiveMapAvailable && (
                <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-white/95 backdrop-blur-xs border border-[#E2E8F0] px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] shadow-xs pointer-events-none">
                  <div className="flex items-center gap-2">
                    <Compass className="w-3.5 h-3.5 text-[#16A34A]" />
                    <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
                      Selected Pin: {mapState.selectedLat.toFixed(5)}°N,{' '}
                      {mapState.selectedLng.toFixed(5)}°E
                    </span>
                    <span className="text-[#64748B] hidden sm:inline">
                      · Camera: {mapState.cameraCenter.lat.toFixed(4)}°,{' '}
                      {mapState.cameraCenter.lng.toFixed(4)}° ({mapState.zoom}z)
                    </span>
                  </div>
                  <div className="font-mono text-[#166534] font-semibold">
                    Tap map or drag pin to move centre
                  </div>
                </div>
              )}
            </div>

            {/* Live Geofence Verification & Attendance Engine Test Card */}
            <div className="rounded-xl bg-white border border-[#E2E8F0] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-xs font-bold text-[#0F172A]">
                  <ShieldCheck className="w-4 h-4 text-[#16A34A]" />
                  <span>Live Attendance Engine Geofence Check:</span>
                  <span
                    className={`font-mono ${
                      liveVerification.insideGeofence ? 'text-[#16A34A]' : 'text-[#DC2626]'
                    }`}
                  >
                    {liveVerification.insideGeofence
                      ? `INSIDE GEOFENCE (${liveVerification.distanceMeters}m <= ${mapState.radiusMeters}m)`
                      : `OUTSIDE GEOFENCE (${liveVerification.distanceMeters}m > ${mapState.radiusMeters}m)`}
                  </span>
                </div>
                <p className="text-[11px] text-[#64748B]">
                  Test point ({testPointLat.toFixed(4)}°N, {testPointLng.toFixed(4)}°E) is{' '}
                  <strong className="font-mono text-[#0F172A]">
                    {Math.abs(liveVerification.marginMeters)}m
                  </strong>{' '}
                  {liveVerification.insideGeofence ? 'inside' : 'outside'} your configured{' '}
                  {mapState.radiusMeters}m boundary.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleSendTestPointToEngine()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0F172A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shrink-0 min-h-[38px]"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#16A34A]" />
                <span>Verify Point in Attendance Engine</span>
              </button>
            </div>
          </div>

          {/* Right 5 Columns: Geofence Radius Controls, Manual Coordinates, Location Details & Saved History */}
          <div className="lg:col-span-5 p-4 sm:p-5 space-y-5 bg-white">
            {/* D. Geofence Radius Control */}
            <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="picker-radius-slider"
                  className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5"
                >
                  <Sliders className="w-3.5 h-3.5 text-[#16A34A]" />
                  <span>Geofence Boundary Radius</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="picker-radius-number"
                    type="number"
                    min={50}
                    max={2000}
                    step={5}
                    value={mapState.radiusMeters}
                    onChange={(e) => handleRadiusChange(Number(e.target.value))}
                    aria-label="Geofence radius in meters"
                    className="w-20 h-8 rounded-lg border border-[#E2E8F0] bg-white px-2 text-right font-mono text-xs font-bold text-[#166534]"
                  />
                  <span className="text-xs font-mono text-[#64748B]">m</span>
                </div>
              </div>

              <input
                id="picker-radius-slider"
                type="range"
                min={50}
                max={1000}
                step={5}
                value={Math.min(1000, mapState.radiusMeters)}
                onChange={(e) => handleRadiusChange(Number(e.target.value))}
                className="w-full accent-[#16A34A] cursor-pointer"
              />

              {/* Radius Quick Presets */}
              <div className="grid grid-cols-5 gap-1.5">
                {RADIUS_PRESETS.map((preset) => {
                  const active = mapState.radiusMeters === preset.radius;
                  return (
                    <button
                      key={preset.radius}
                      type="button"
                      onClick={() => handleRadiusChange(preset.radius)}
                      className={`py-1.5 px-1 rounded-lg border text-center transition-colors ${
                        active
                          ? 'bg-[#16A34A] border-[#16A34A] text-white font-semibold'
                          : 'bg-white border-[#E2E8F0] text-[#0F172A] hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-[11px] font-mono font-bold">{preset.label}</div>
                      <div
                        className={`text-[9px] truncate ${
                          active ? 'text-white/90' : 'text-[#64748B]'
                        }`}
                      >
                        {preset.desc}
                      </div>
                    </button>
                  );
                })}
              </div>

              <p
                className={`text-[11px] leading-relaxed ${
                  radiusAdvisory.tone === 'green' ? 'text-[#166534]' : 'text-[#D97706]'
                }`}
              >
                {radiusAdvisory.text}
              </p>
            </div>

            {/* E. Manual Coordinate Entry */}
            <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#0F172A]">
                  Exact Coordinates (Manual Entry or Pin Sync)
                </span>
                <button
                  type="button"
                  onClick={handleApplyManualCoordinates}
                  className="rounded-lg bg-[#0F172A] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 transition-colors"
                >
                  Apply Coordinates
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="manual-lat-input"
                    className="block text-[11px] font-medium text-[#64748B] mb-1"
                  >
                    Latitude (-90 to 90)
                  </label>
                  <input
                    id="manual-lat-input"
                    type="text"
                    value={manualLatInput}
                    onChange={(e) => setManualLatInput(e.target.value)}
                    onBlur={handleApplyManualCoordinates}
                    className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 font-mono text-xs text-[#0F172A]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="manual-lng-input"
                    className="block text-[11px] font-medium text-[#64748B] mb-1"
                  >
                    Longitude (-180 to 180)
                  </label>
                  <input
                    id="manual-lng-input"
                    type="text"
                    value={manualLngInput}
                    onChange={(e) => setManualLngInput(e.target.value)}
                    onBlur={handleApplyManualCoordinates}
                    className="w-full h-9 rounded-lg border border-[#E2E8F0] bg-white px-2.5 font-mono text-xs text-[#0F172A]"
                  />
                </div>
              </div>
            </div>

            {/* F. Location Details Card */}
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="picker-college-name"
                  className="block text-xs font-semibold text-[#0F172A] mb-1"
                >
                  College / Institution Name
                </label>
                <input
                  id="picker-college-name"
                  type="text"
                  value={collegeName}
                  onChange={(e) => setCollegeName(e.target.value)}
                  className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#0F172A]"
                />
              </div>

              <div>
                <label
                  htmlFor="picker-campus-label"
                  className="block text-xs font-semibold text-[#0F172A] mb-1"
                >
                  Pinned Building / Gate Label
                </label>
                <input
                  id="picker-campus-label"
                  type="text"
                  value={campusLabel}
                  onChange={(e) => setCampusLabel(e.target.value)}
                  placeholder="e.g., Main Gate, Central Academic Block, CSE Department"
                  className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs text-[#0F172A]"
                />
              </div>

              <div>
                <label
                  htmlFor="picker-campus-address"
                  className="block text-xs font-semibold text-[#0F172A] mb-1"
                >
                  Resolved Campus Address
                </label>
                <input
                  id="picker-campus-address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs text-[#64748B]"
                />
              </div>
            </div>

            {/* Primary Save CTA & Save + Enable Tracking */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveConfiguration(false)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#16A34A] py-3 px-4 text-xs font-semibold text-white hover:bg-[#166534] transition-colors min-h-[46px] disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>
                  {isSaving ? 'Saving Configuration...' : 'Save Geofence Configuration'}
                </span>
              </button>

              {!trackingEnabled && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void handleSaveConfiguration(true)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#16A34A] bg-[#16A34A]/10 py-2.5 px-4 text-xs font-semibold text-[#166534] hover:bg-[#16A34A]/15 transition-colors min-h-[42px]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save &amp; Enable Automatic Attendance Tracking</span>
                </button>
              )}
            </div>

            {/* Saved Location History (Restore Previous Configuration) */}
            {savedHistory.length > 0 && (
              <div className="pt-3 border-t border-[#E2E8F0] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-[#16A34A]" />
                    <span>Saved College Configurations</span>
                  </span>
                  <span className="text-[11px] text-[#64748B]">One-click restore</span>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {savedHistory.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-[#0F172A] truncate">
                          {item.collegeName}
                        </div>
                        <div className="text-[11px] text-[#64748B] font-mono truncate">
                          {item.latitude.toFixed(4)}°N, {item.longitude.toFixed(4)}°E · R=
                          {item.radiusMeters}m
                          {item.configVersion ? ` · v${item.configVersion}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await onRestoreHistory(item.id);
                          if (ok) {
                            handleExplicitPointSelection(
                              item.latitude,
                              item.longitude,
                              'RESTORED',
                              {
                                recenterCamera: true,
                                overrideName: item.collegeName,
                                overrideCampusLabel: item.campusLabel,
                                overrideAddress: item.address,
                                overrideCollegeId: item.collegeId,
                                overrideRadius: item.radiusMeters,
                              }
                            );
                            setStatusMessage(
                              `Restored saved configuration: ${item.collegeName} (${item.radiusMeters}m).`
                            );
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#0F172A] hover:bg-slate-100 shrink-0"
                      >
                        <RotateCcw className="w-3 h-3 text-[#16A34A]" />
                        <span>Restore</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
