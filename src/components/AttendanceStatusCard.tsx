import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Compass,
  MapPin,
  Navigation,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import {
  AttendanceStatus,
  LocationEventType,
  calculateDistanceMeters,
  type CollegeConfig,
} from '../engine/attendanceEngine';
import {
  STATUS_VISUALS,
  formatDurationMinutes,
  formatTimeInTimezone,
} from '../theme/tokens';
import { type TodayAttendanceState } from '../store/useAttendlyStore';

interface AttendanceStatusCardProps {
  today: TodayAttendanceState;
  college: CollegeConfig;
  offlineQueueCount: number;
  simulateOffline: boolean;
  isSyncing: boolean;
  onRecordObservation: (obs: {
    eventType: LocationEventType;
    observedAt: string;
    latitude: number;
    longitude: number;
    accuracyMeters: number;
  }) => Promise<void>;
  onSyncQueue: () => Promise<void>;
  onToggleSimulateOffline: (offline: boolean) => void;
}

export const AttendanceStatusCard: React.FC<AttendanceStatusCardProps> = ({
  today,
  college,
  offlineQueueCount,
  simulateOffline,
  isSyncing,
  onRecordObservation,
  onSyncQueue,
  onToggleSimulateOffline,
}) => {
  const [gpsFeedback, setGpsFeedback] = useState<string | null>(null);
  const [isCheckingGps, setIsCheckingGps] = useState(false);

  const visual = STATUS_VISUALS[today.status] || STATUS_VISUALS.NOT_DETECTED;
  const verifiedMins = Math.round(today.verifiedDurationSeconds / 60);
  const requiredMins = Math.round(today.requiredDurationSeconds / 60);
  const remainingMins = Math.max(0, requiredMins - verifiedMins);

  const handleCompleteCampusSession = async () => {
    // Records the next sequential campus heartbeat inside the college geofence
    // Base seeded observations end at 2026-10-19T04:00:00.000Z (18 mins).
    // Adding an observation at 04:14:00.000Z (+14m within 15m max gap) reaches 32 mins -> PRESENT.
    const nextIso =
      verifiedMins < 30
        ? '2026-10-19T04:14:00.000Z'
        : new Date(Date.parse('2026-10-19T04:14:00.000Z') + (verifiedMins - 18) * 60000).toISOString();

    await onRecordObservation({
      eventType: LocationEventType.DWELL,
      observedAt: nextIso,
      latitude: college.latitude + 0.00008,
      longitude: college.longitude - 0.00006,
      accuracyMeters: 14,
    });
  };

  const handleBrowserGpsCheck = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsFeedback('Browser Geolocation API is not supported in this environment.');
      return;
    }
    setIsCheckingGps(true);
    setGpsFeedback(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setIsCheckingGps(false);
        const dist = Math.round(
          calculateDistanceMeters(
            pos.coords.latitude,
            pos.coords.longitude,
            college.latitude,
            college.longitude
          )
        );
        const inside = dist <= college.radiusMeters;
        setGpsFeedback(
          `Device GPS reading: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (±${Math.round(pos.coords.accuracy)}m) — ${dist.toLocaleString()}m from ${college.collegeName} (${inside ? 'Inside Geofence' : 'Outside Geofence'}).`
        );
      },
      (err) => {
        setIsCheckingGps(false);
        setGpsFeedback(
          `Device GPS check notice: ${err.message || 'Location permission not granted in browser frame.'}`
        );
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  return (
    <section
      aria-labelledby="today-attendance-heading"
      className="rounded-2xl bg-white border border-[#E2E8F0] p-5 sm:p-6 space-y-5"
    >
      {/* Top Row: Date, College & Semantic Status */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#E2E8F0] pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
            <span className="font-mono font-medium text-[#0F172A]">{today.date}</span>
            <span aria-hidden="true">·</span>
            <span>Working Hours: {today.workingHours}</span>
            <span aria-hidden="true">·</span>
            <span>{college.timezone}</span>
          </div>
          <h2
            id="today-attendance-heading"
            className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight"
          >
            Today&apos;s Campus Attendance
          </h2>
          <p className="text-xs text-[#64748B] flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
            <span>{today.collegeName}</span>
          </p>
        </div>

        <div className="flex flex-col sm:items-end justify-center shrink-0">
          <span className="text-xs text-[#64748B]">Current Status</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className={`text-base sm:text-lg font-bold tracking-tight ${visual.textColor}`}
              data-testid="today-status-label"
            >
              {visual.label}
            </span>
          </div>
          <span className="text-xs text-[#64748B] mt-0.5">
            {today.trackingEnabled ? 'Geofence Active' : 'Tracking Paused'}
          </span>
        </div>
      </div>

      {/* Middle Row: 4 Key Telemetry Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] block">Verified Presence</span>
          <span
            className="text-xl font-bold font-mono tabular-nums text-[#0F172A] mt-1 block"
            data-testid="today-verified-duration"
          >
            {formatDurationMinutes(today.verifiedDurationSeconds)}
          </span>
          <span className="text-[11px] text-[#64748B] tabular-nums">
            Target: {requiredMins} min minimum
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] block">First Confirmed Arrival</span>
          <span className="text-xl font-bold font-mono tabular-nums text-[#0F172A] mt-1 block">
            {formatTimeInTimezone(today.firstConfirmedAt, college.timezone)}
          </span>
          <span className="text-[11px] text-[#64748B]">
            {today.firstConfirmedAt ? 'Geofence entry verified' : 'Awaiting entry'}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] block">Confirmation Progress</span>
          <span className="text-xl font-bold font-mono tabular-nums text-[#16A34A] mt-1 block">
            {today.progressPercent}%
          </span>
          <span className="text-[11px] text-[#64748B] tabular-nums">
            {today.status === AttendanceStatus.PRESENT
              ? 'Threshold satisfied'
              : `${remainingMins} min remaining`}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] block">Valid Observations</span>
          <span className="text-xl font-bold font-mono tabular-nums text-[#0F172A] mt-1 block">
            {today.observationCount}
          </span>
          <span className="text-[11px] text-[#64748B] tabular-nums">
            Max gap policy: ≤{college.maxEvidenceGapMinutes}m
          </span>
        </div>
      </div>

      {/* Confirmation Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-[#0F172A] flex items-center gap-1.5">
            {today.status === AttendanceStatus.PRESENT ? (
              <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
            ) : (
              <Clock className="w-4 h-4 text-[#D97706]" />
            )}
            <span>
              {today.status === AttendanceStatus.PRESENT
                ? `Attendance confirmed for ${today.date} (${verifiedMins} minutes verified inside geofence).`
                : `Collecting continuous geofence evidence (${verifiedMins} of ${requiredMins} minutes verified).`}
            </span>
          </span>
          <span className="font-mono font-semibold tabular-nums text-[#0F172A]">
            {verifiedMins} / {requiredMins} min
          </span>
        </div>

        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden border border-[#E2E8F0]">
          <div
            className={`h-full transition-transform duration-200 origin-left ${
              today.status === AttendanceStatus.PRESENT ? 'bg-[#16A34A]' : 'bg-[#D97706]'
            }`}
            style={{
              width: '100%',
              transform: `scaleX(${Math.min(1, today.progressPercent / 100)})`,
            }}
          />
        </div>
      </div>

      {/* Interactive Geofence Evidence & Offline Sync Controls */}
      <div className="pt-2 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-[#64748B]">
          <span>
            Geofence center: <strong className="font-mono text-[#0F172A]">{college.latitude.toFixed(4)}°N, {college.longitude.toFixed(4)}°E</strong> · Radius <strong className="font-mono text-[#0F172A]">{college.radiusMeters}m</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCompleteCampusSession()}
            disabled={isSyncing || !today.trackingEnabled}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#166534] disabled:opacity-50 transition-colors min-h-[44px] whitespace-nowrap shrink-0"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>
              {today.status === AttendanceStatus.PRESENT
                ? 'Log Additional Campus Ping'
                : 'Record Campus Observation (+14m)'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleBrowserGpsCheck}
            disabled={isCheckingGps}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors min-h-[44px] whitespace-nowrap shrink-0"
          >
            <Compass className="w-3.5 h-3.5 text-[#16A34A]" />
            <span>{isCheckingGps ? 'Reading GPS...' : 'Verify Live GPS'}</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleSimulateOffline(!simulateOffline)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors min-h-[44px] whitespace-nowrap shrink-0 ${
              simulateOffline
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-[#E2E8F0] bg-white text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <WifiOff className="w-3.5 h-3.5" />
            <span>{simulateOffline ? 'Offline Queue: ON' : 'Test Offline Queue'}</span>
          </button>

          {offlineQueueCount > 0 && !simulateOffline && (
            <button
              type="button"
              onClick={() => void onSyncQueue()}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F172A] px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors min-h-[44px] whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync ({offlineQueueCount})</span>
            </button>
          )}
        </div>
      </div>

      {gpsFeedback && (
        <p className="text-xs text-[#64748B] bg-slate-50 border border-[#E2E8F0] rounded-xl px-3.5 py-2.5 font-mono">
          {gpsFeedback}
        </p>
      )}
    </section>
  );
};
