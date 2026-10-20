import React, { useState } from 'react';
import { Download, WifiOff, RefreshCw } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';
import { useAttendlyStore } from '../store/useAttendlyStore';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
      >
        <Download className="w-3.5 h-3.5 text-[#16A34A]" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
        >
          <Download className="w-3.5 h-3.5 text-[#16A34A]" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 border border-[#E2E8F0]">
              <h3 id="ios-install-title" className="text-base font-bold text-[#0F172A]">
                Install Attendly on iPhone
              </h3>
              <p className="mt-2 text-sm text-[#64748B] leading-relaxed">
                1. Tap the <strong>Share</strong> icon in Safari.<br />
                2. Select <strong>Add to Home Screen</strong> to launch Attendly in full-screen standalone mode.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-[#0F172A] py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors min-h-[44px]"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineQueueBanner: React.FC = () => {
  const browserOnline = useOnlineStatus();
  const { simulateOffline, setSimulateOffline, offlineQueue, syncOfflineQueue, isSyncing } =
    useAttendlyStore();

  const isOffline = !browserOnline || simulateOffline;

  if (!isOffline && offlineQueue.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-950"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 text-[#D97706] shrink-0" />
          <span>
            {isOffline
              ? 'Offline Mode Active — Location observations are stored safely in your local SQLite/browser queue and will not fabricate server confirmation until synced.'
              : `${offlineQueue.length} local campus observation(s) ready to synchronize with the Attendly backend.`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {simulateOffline && (
            <button
              type="button"
              onClick={() => setSimulateOffline(false)}
              className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 font-semibold text-amber-900 hover:bg-amber-100/50 transition-colors whitespace-nowrap shrink-0"
            >
              Reconnect Network
            </button>
          )}
          {!isOffline && offlineQueue.length > 0 && (
            <button
              type="button"
              onClick={() => void syncOfflineQueue()}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#16A34A] text-white font-semibold hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : `Sync Now (${offlineQueue.length})`}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
