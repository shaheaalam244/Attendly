import React from 'react';
import { MapPin, PauseCircle, PlayCircle, ShieldAlert } from 'lucide-react';
import { formatTimeInTimezone } from '../theme/tokens';

interface TrackingStatusIndicatorProps {
  trackingEnabled: boolean;
  permissionStatus: string;
  collegeName: string;
  radiusMeters: number;
  lastSyncedAt: string | null;
  timezone: string;
  offlineQueueCount: number;
  onToggleTracking: (enabled: boolean) => void;
  onOpenSettings: () => void;
}

export const TrackingStatusIndicator: React.FC<TrackingStatusIndicatorProps> = ({
  trackingEnabled,
  permissionStatus,
  collegeName,
  radiusMeters,
  lastSyncedAt,
  timezone,
  offlineQueueCount,
  onToggleTracking,
  onOpenSettings,
}) => {
  const isPermissionBlocked =
    permissionStatus === 'DENIED' || permissionStatus === 'NOT_DETERMINED';

  return (
    <div className="rounded-2xl bg-white border border-[#E2E8F0] p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
            <span className="font-semibold text-[#0F172A]">
              { isPermissionBlocked
                ? 'Location Permission Required'
                : trackingEnabled
                  ? 'Automatic Geofence Tracking Active'
                  : 'Automatic Tracking Paused' }
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{radiusMeters}m Geofence</span>
            <span aria-hidden="true">·</span>
            <span>
              Last sync: <strong className="font-mono text-[#0F172A]">{formatTimeInTimezone(lastSyncedAt, timezone)}</strong>
            </span>
            {offlineQueueCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#D97706] font-medium tabular-nums">
                  {offlineQueueCount} queued offline
                </span>
              </>
            )}
          </div>

          <p className="text-xs text-[#64748B] flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
            <span className="truncate">{collegeName}</span>
          </p>

          {isPermissionBlocked && (
            <p className="text-xs text-[#DC2626] flex items-center gap-1.5 pt-1">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>
                Background location access is currently disabled ({permissionStatus}). Attendly cannot detect campus arrivals until permissions are restored.
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {isPermissionBlocked ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#D97706] px-4 py-2.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors min-h-[44px] whitespace-nowrap shrink-0"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Fix Permissions</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onToggleTracking(!trackingEnabled)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors min-h-[44px] whitespace-nowrap shrink-0 ${
                trackingEnabled
                  ? 'bg-slate-100 text-[#0F172A] hover:bg-slate-200'
                  : 'bg-[#16A34A] text-white hover:bg-[#166534]'
              }`}
            >
              {trackingEnabled ? (
                <>
                  <PauseCircle className="w-4 h-4 text-[#64748B]" />
                  <span>Pause Tracking</span>
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4" />
                  <span>Resume Tracking</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
