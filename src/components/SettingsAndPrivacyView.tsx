import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Compass,
  Download,
  History,
  Lock,
  MapPin,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  KNOWN_COLLEGES_DIRECTORY,
  evaluateGoogleMapsConfigStatus,
  type CollegeConfig,
} from '../engine/attendanceEngine';
import { type AuditLogEntry, type StudentUser } from '../store/useAttendlyStore';
import { formatTimeInTimezone } from '../theme/tokens';

interface SettingsAndPrivacyViewProps {
  user: StudentUser;
  college: CollegeConfig;
  auditLogs: AuditLogEntry[];
  storedEventsCount: number;
  onSaveCollegeSettings: (patch: Partial<CollegeConfig>) => Promise<boolean>;
  onOpenMapPicker: () => void;
  onRestoreLocationHistory: (historyId: string) => Promise<boolean>;
  onToggleTracking: (enabled: boolean) => Promise<void>;
  onUpdatePermissionStatus: (
    status: 'GRANTED_ALWAYS' | 'GRANTED_FOREGROUND' | 'DENIED' | 'NOT_DETERMINED'
  ) => Promise<void>;
  onUpdatePrivacy: (patch: {
    retainRawEventsDays?: number;
    allowAnalyticsDiagnostics?: boolean;
    backgroundTrackingConsent?: boolean;
  }) => Promise<void>;
  onExportCsv: () => void;
  onExportJson: () => void;
  onDeleteAccount: () => Promise<boolean>;
  onLogout: () => Promise<void>;
}

const WEEKDAY_CHECKBOXES = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

export const SettingsAndPrivacyView: React.FC<SettingsAndPrivacyViewProps> = ({
  user,
  college,
  auditLogs,
  storedEventsCount,
  onSaveCollegeSettings,
  onOpenMapPicker,
  onRestoreLocationHistory,
  onToggleTracking,
  onUpdatePermissionStatus,
  onUpdatePrivacy,
  onExportCsv,
  onExportJson,
  onDeleteAccount,
  onLogout,
}) => {
  const [collegeName, setCollegeName] = useState(college.collegeName);
  const [address, setAddress] = useState(college.address);
  const [latitude, setLatitude] = useState(String(college.latitude));
  const [longitude, setLongitude] = useState(String(college.longitude));
  const [radiusMeters, setRadiusMeters] = useState(college.radiusMeters);
  const [startTime, setStartTime] = useState(college.startTime);
  const [endTime, setEndTime] = useState(college.endTime);
  const [workingDays, setWorkingDays] = useState<number[]>(college.workingDays);
  const [minimumVerifiedMinutes, setMinimumVerifiedMinutes] = useState(
    college.minimumVerifiedMinutes
  );
  const [timezone, setTimezone] = useState(college.timezone);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Sync local form fields whenever college prop updates from Interactive Map Picker or Restore
  useEffect(() => {
    setCollegeName(college.collegeName);
    setAddress(college.address);
    setLatitude(String(college.latitude));
    setLongitude(String(college.longitude));
    setRadiusMeters(college.radiusMeters);
    setStartTime(college.startTime);
    setEndTime(college.endTime);
    setWorkingDays(college.workingDays);
    setMinimumVerifiedMinutes(college.minimumVerifiedMinutes);
    setTimezone(college.timezone);
  }, [college]);

  const handleSelectDirectoryCollege = (presetId: string) => {
    const preset = KNOWN_COLLEGES_DIRECTORY.find((c) => c.collegeId === presetId);
    if (!preset) return;
    setCollegeName(preset.collegeName);
    setAddress(preset.address);
    setLatitude(String(preset.latitude));
    setLongitude(String(preset.longitude));
    if (preset.defaultRadiusMeters) {
      setRadiusMeters(preset.defaultRadiusMeters);
    }
    setTimezone(preset.timezone);
  };

  const handleToggleDay = (day: number) => {
    setWorkingDays((prev) => {
      if (prev.includes(day)) {
        return prev.length > 1 ? prev.filter((d) => d !== day) : prev;
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const latNum = Number(latitude);
    const lonNum = Number(longitude);
    if (Number.isNaN(latNum) || Number.isNaN(lonNum)) return;

    await onSaveCollegeSettings({
      collegeName: collegeName.trim(),
      address: address.trim(),
      latitude: latNum,
      longitude: lonNum,
      radiusMeters,
      startTime,
      endTime,
      workingDays,
      minimumVerifiedMinutes,
      timezone,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 7 Columns: College Geofence & Schedule Configuration */}
      <form
        onSubmit={handleSaveForm}
        className="lg:col-span-7 rounded-2xl bg-white border border-[#E2E8F0] p-5 sm:p-6 space-y-5"
      >
        <div className="border-b border-[#E2E8F0] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs text-[#64748B]">
              Campus Geofence &amp; Verification Policy
            </span>
            <h2 className="text-xl font-bold text-[#0F172A] mt-0.5">
              College Location &amp; Attendance Rules
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Select any campus point and custom radius on the interactive map, or configure coordinates manually.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenMapPicker}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#166534] transition-colors shrink-0 min-h-[42px]"
          >
            <Compass className="w-4 h-4" />
            <span>Choose on Map</span>
          </button>
        </div>

        {/* Preset Directory Selector */}
        <div>
          <label
            htmlFor="college-preset-select"
            className="block text-xs font-semibold text-[#0F172A] mb-1.5"
          >
            Quick Search / Select Verified Campus Directory
          </label>
          <select
            id="college-preset-select"
            value={
              KNOWN_COLLEGES_DIRECTORY.some((c) => c.collegeId === college.collegeId)
                ? college.collegeId
                : KNOWN_COLLEGES_DIRECTORY[0].collegeId
            }
            onChange={(e) => handleSelectDirectoryCollege(e.target.value)}
            className="w-full h-11 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-xs font-semibold text-[#0F172A]"
          >
            {KNOWN_COLLEGES_DIRECTORY.map((c) => (
              <option key={c.collegeId} value={c.collegeId}>
                {c.collegeName} ({c.address.split(',').slice(-2).join(',').trim()})
              </option>
            ))}
          </select>
        </div>

        {/* Saved College Geofence Summary & Google Maps Platform Status */}
        {(() => {
          const buildKey =
            (typeof import.meta !== 'undefined' &&
              (import.meta.env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined)) ||
            '';
          const mapsDiag = evaluateGoogleMapsConfigStatus({
            apiKey: buildKey,
            platform: 'web',
          });

          return (
            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-[#0F172A] flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[#16A34A]" />
                  <span>
                    Active Geofence Boundary (v{college.configVersion ?? 1})
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[#64748B] tabular-nums">
                    {Number(latitude).toFixed(4)}°N, {Number(longitude).toFixed(4)}°E · R=
                    {radiusMeters}m
                  </span>
                  <button
                    type="button"
                    onClick={onOpenMapPicker}
                    className="rounded-lg bg-white border border-[#E2E8F0] px-2.5 py-1 text-[11px] font-semibold text-[#166534] hover:bg-slate-100"
                  >
                    Open Google Maps Picker
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-white border border-[#E2E8F0] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-[#0F172A]">
                    {collegeName} {college.campusLabel ? `— ${college.campusLabel}` : ''}
                  </div>
                  <div className="text-[11px] text-[#64748B]">{address}</div>
                  <div className="text-[11px] font-mono text-[#166534]">
                    Google Maps SDK:{' '}
                    {mapsDiag.status === 'MISSING_API_KEY'
                      ? 'VITE_GOOGLE_MAPS_API_KEY not configured (Diagnostic alert active)'
                      : 'Configured'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenMapPicker}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#16A34A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#166534] transition-colors shrink-0 min-h-[38px]"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Open Interactive Map</span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* College Name & Address */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="college-name-input" className="block text-xs font-semibold text-[#0F172A] mb-1">
              College Name
            </label>
            <input
              id="college-name-input"
              type="text"
              value={collegeName}
              onChange={(e) => setCollegeName(e.target.value)}
              className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs text-[#0F172A]"
              required
            />
          </div>

          <div>
            <label htmlFor="college-timezone-select" className="block text-xs font-semibold text-[#0F172A] mb-1">
              College Timezone
            </label>
            <select
              id="college-timezone-select"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs text-[#0F172A]"
            >
              <option value="Asia/Kolkata">Asia/Kolkata (IST, UTC+5:30)</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York (ET)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="college-address-input" className="block text-xs font-semibold text-[#0F172A] mb-1">
            Campus Address
          </label>
          <input
            id="college-address-input"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs text-[#0F172A]"
          />
        </div>

        {/* Coordinates, Radius & Confirmation Threshold */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label htmlFor="college-lat-input" className="block text-xs font-semibold text-[#0F172A] mb-1">
              Latitude
            </label>
            <input
              id="college-lat-input"
              type="number"
              step="0.0001"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs font-mono text-[#0F172A]"
            />
          </div>

          <div>
            <label htmlFor="college-lon-input" className="block text-xs font-semibold text-[#0F172A] mb-1">
              Longitude
            </label>
            <input
              id="college-lon-input"
              type="number"
              step="0.0001"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs font-mono text-[#0F172A]"
            />
          </div>

          <div>
            <label htmlFor="college-radius-input" className="block text-xs font-semibold text-[#0F172A] mb-1">
              Radius (Meters)
            </label>
            <input
              id="college-radius-input"
              type="number"
              min={50}
              max={2000}
              step={5}
              value={radiusMeters}
              onChange={(e) => setRadiusMeters(Number(e.target.value))}
              className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs font-mono text-[#0F172A]"
            />
          </div>

          <div>
            <label htmlFor="college-threshold-input" className="block text-xs font-semibold text-[#0F172A] mb-1">
              Min Presence (Min)
            </label>
            <input
              id="college-threshold-input"
              type="number"
              min={15}
              max={120}
              step={5}
              value={minimumVerifiedMinutes}
              onChange={(e) => setMinimumVerifiedMinutes(Number(e.target.value))}
              className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs font-mono text-[#0F172A]"
            />
          </div>
        </div>

        {/* Interactive Geofence Radius Slider */}
        <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-3.5 py-2.5 flex items-center justify-between gap-4">
          <label
            htmlFor="settings-radius-slider"
            className="text-xs font-semibold text-[#0F172A] whitespace-nowrap"
          >
            Adjust Geofence Radius: <span className="font-mono text-[#166534]">{radiusMeters}m</span>
          </label>
          <input
            id="settings-radius-slider"
            type="range"
            min={50}
            max={1000}
            step={5}
            value={Math.min(1000, radiusMeters)}
            onChange={(e) => setRadiusMeters(Number(e.target.value))}
            className="flex-1 accent-[#16A34A] cursor-pointer"
          />
        </div>

        {/* Working Hours & Working Days */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="college-start-time" className="block text-xs font-semibold text-[#0F172A] mb-1">
              College Opening Time
            </label>
            <input
              id="college-start-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs font-mono text-[#0F172A]"
            />
          </div>

          <div>
            <label htmlFor="college-end-time" className="block text-xs font-semibold text-[#0F172A] mb-1">
              College Closing Time
            </label>
            <input
              id="college-end-time"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs font-mono text-[#0F172A]"
            />
          </div>
        </div>

        <div>
          <span className="block text-xs font-semibold text-[#0F172A] mb-2">
            Configured Working Days
          </span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_CHECKBOXES.map((item) => {
              const active = workingDays.includes(item.day);
              return (
                <button
                  key={item.day}
                  type="button"
                  onClick={() => handleToggleDay(item.day)}
                  aria-pressed={active}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors min-h-[40px] ${
                    active
                      ? 'bg-[#16A34A] border-[#16A34A] text-white'
                      : 'bg-white border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-2 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onOpenMapPicker}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-100 transition-colors min-h-[44px]"
          >
            <Compass className="w-4 h-4 text-[#16A34A]" />
            <span>Choose Location &amp; Radius on Map</span>
          </button>

          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-[#16A34A] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#166534] transition-colors min-h-[44px]"
          >
            <Save className="w-4 h-4" />
            <span>Save College Configuration</span>
          </button>
        </div>

        {/* Saved Location Configurations (Restore Previous) */}
        {college.locationHistory && college.locationHistory.length > 0 && (
          <div className="pt-4 border-t border-[#E2E8F0] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-[#16A34A]" />
                <span>Saved College Locations &amp; Radii</span>
              </span>
              <span className="text-[11px] text-[#64748B]">Restore previous boundary</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {college.locationHistory.slice(0, 4).map((hist) => (
                <div
                  key={hist.id}
                  className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[#0F172A] truncate">
                      {hist.collegeName}
                    </div>
                    <div className="text-[11px] font-mono text-[#64748B] truncate">
                      {hist.latitude.toFixed(4)}°N, {hist.longitude.toFixed(4)}°E · R=
                      {hist.radiusMeters}m
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onRestoreLocationHistory(hist.id)}
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
      </form>

      {/* Right 5 Columns: Tracking Control, Android Permission Status, Privacy & Account Deletion */}
      <div className="lg:col-span-5 space-y-6">
        {/* Obvious Pause / Resume Tracking & Permission Diagnostics Card */}
        <div className="rounded-2xl bg-white border border-[#E2E8F0] p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#0F172A]">
                Automatic Tracking &amp; Permissions
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                Control when Attendly monitors your configured college geofence.
              </p>
            </div>
            <span
              className={`text-xs font-bold ${
                user.trackingEnabled ? 'text-[#16A34A]' : 'text-[#D97706]'
              }`}
            >
              {user.trackingEnabled ? 'Active' : 'Paused'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void onToggleTracking(!user.trackingEnabled)}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs font-semibold transition-colors min-h-[48px] ${
              user.trackingEnabled
                ? 'bg-slate-900 text-white hover:bg-slate-800'
                : 'bg-[#16A34A] text-white hover:bg-[#166534]'
            }`}
          >
            {user.trackingEnabled ? (
              <>
                <PauseCircle className="w-4 h-4" />
                <span>Pause Automatic Tracking</span>
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4" />
                <span>Resume Automatic Tracking</span>
              </>
            )}
          </button>

          <dl className="space-y-2 text-xs pt-2 border-t border-[#E2E8F0]">
            <div className="flex items-center justify-between py-1">
              <dt className="text-[#64748B]">Android Location Permission</dt>
              <dd className="font-mono font-semibold text-[#0F172A]">
                {user.permissionStatus}
              </dd>
            </div>
            <div className="flex items-center justify-between py-1">
              <dt className="text-[#64748B]">Last Successful Sync</dt>
              <dd className="font-mono font-semibold text-[#0F172A]">
                {formatTimeInTimezone(user.lastSyncedAt, college.timezone)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-1">
              <dt className="text-[#64748B]">Stored Raw Observations</dt>
              <dd className="font-mono font-semibold text-[#0F172A] tabular-nums">
                {storedEventsCount} events (TTL: {user.privacySettings.retainRawEventsDays}d)
              </dd>
            </div>
          </dl>

          {/* Simulate Android Permission States for Diagnostics Verification */}
          <div className="pt-2 border-t border-[#E2E8F0]">
            <label
              htmlFor="permission-diagnostic-select"
              className="block text-[11px] font-medium text-[#64748B] mb-1"
            >
              Android Permission State Diagnostic Control:
            </label>
            <select
              id="permission-diagnostic-select"
              value={user.permissionStatus}
              onChange={(e) =>
                void onUpdatePermissionStatus(
                  e.target.value as
                    | 'GRANTED_ALWAYS'
                    | 'GRANTED_FOREGROUND'
                    | 'DENIED'
                    | 'NOT_DETERMINED'
                )
              }
              className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-xs font-mono text-[#0F172A]"
            >
              <option value="GRANTED_ALWAYS">GRANTED_ALWAYS (Allow all the time)</option>
              <option value="GRANTED_FOREGROUND">GRANTED_FOREGROUND (While using app)</option>
              <option value="DENIED">DENIED (Permission revoked — pauses tracking)</option>
            </select>
          </div>
        </div>

        {/* Privacy Policy, Retention & Data Portability Card */}
        <div className="rounded-2xl bg-white border border-[#E2E8F0] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#16A34A]" />
            <h3 className="text-base font-bold text-[#0F172A]">
              Privacy &amp; Data Controls
            </h3>
          </div>

          <p className="text-xs text-[#64748B] leading-relaxed">
            Attendly only evaluates coordinates against your private college geofence boundary and never shares or sells location history. Raw location events automatically expire after your selected retention window.
          </p>

          <div>
            <label
              htmlFor="retention-days-select"
              className="block text-xs font-semibold text-[#0F172A] mb-1"
            >
              Raw Location Event Retention Window
            </label>
            <select
              id="retention-days-select"
              value={user.privacySettings.retainRawEventsDays}
              onChange={(e) =>
                void onUpdatePrivacy({ retainRawEventsDays: Number(e.target.value) })
              }
              className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs text-[#0F172A]"
            >
              <option value={7}>7 Days (Minimal Retention)</option>
              <option value={30}>30 Days (Recommended Monthly Audit)</option>
              <option value={90}>90 Days (Full Semester Audit)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] py-2.5 px-3 text-xs font-semibold text-[#0F172A] hover:bg-slate-100 transition-colors min-h-[42px]"
            >
              <Download className="w-3.5 h-3.5 text-[#16A34A]" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={onExportJson}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] py-2.5 px-3 text-xs font-semibold text-[#0F172A] hover:bg-slate-100 transition-colors min-h-[42px]"
            >
              <Lock className="w-3.5 h-3.5 text-[#16A34A]" />
              <span>Export JSON</span>
            </button>
          </div>

          {/* Recent Security & Audit Log */}
          {auditLogs.length > 0 && (
            <div className="pt-3 border-t border-[#E2E8F0] space-y-2">
              <span className="text-xs font-semibold text-[#0F172A] block">
                Recent Verification &amp; Privacy Audit Log
              </span>
              <ul className="space-y-1.5 max-h-36 overflow-y-auto text-[11px] text-[#64748B]">
                {auditLogs.slice(0, 5).map((log) => (
                  <li key={log.id} className="py-1 border-b border-slate-100 last:border-0">
                    <span className="font-mono font-semibold text-[#0F172A]">
                      {log.action}
                    </span>{' '}
                    — {log.details}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Account Actions: Sign Out & Permanent Account Deletion */}
          <div className="pt-3 border-t border-[#E2E8F0] space-y-2.5">
            <button
              type="button"
              onClick={() => void onLogout()}
              className="w-full rounded-xl border border-[#E2E8F0] bg-white py-2.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors min-h-[42px]"
            >
              Sign Out ({user.email})
            </button>

            {!confirmDeleteOpen ? (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50/50 py-2.5 text-xs font-semibold text-[#DC2626] hover:bg-red-50 transition-colors min-h-[42px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Account &amp; All Attendance Data</span>
              </button>
            ) : (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 space-y-2.5">
                <p className="text-xs text-[#DC2626] font-medium flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Permanently delete your Attendly account, college settings, and all attendance records? This cannot be undone.
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onDeleteAccount()}
                    className="flex-1 rounded-lg bg-[#DC2626] py-2 text-xs font-semibold text-white hover:bg-red-700 min-h-[38px]"
                  >
                    Confirm Permanent Deletion
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(false)}
                    className="px-3 py-2 rounded-lg bg-white border border-red-200 text-xs font-semibold text-[#0F172A] min-h-[38px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
