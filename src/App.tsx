import React, { useEffect } from 'react';
import {
  Calendar,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Settings,
} from 'lucide-react';
import { AttendlyLogo } from './components/AttendlyLogo';
import { AttendanceStatusCard } from './components/AttendanceStatusCard';
import { MonthlySummaryCard } from './components/MonthlySummaryCard';
import { AttendanceCalendar } from './components/AttendanceCalendar';
import { HistoryAndReportsView } from './components/HistoryAndReportsView';
import { SettingsAndPrivacyView } from './components/SettingsAndPrivacyView';
import { CollegeLocationPickerScreen } from './components/CollegeLocationPickerScreen';
import { TrackingStatusIndicator } from './components/TrackingStatusIndicator';
import { OnboardingAndAuthView } from './components/OnboardingAndAuthView';
import { OfflineQueueBanner, PWAInstallButton } from './components/PWAInstallButton';
import { ErrorState, LoadingState } from './components/StateViews';
import { useAttendlyStore, type NavTab } from './store/useAttendlyStore';
import { ATTENDLY_THEME } from './theme/tokens';

const NAV_ITEMS: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'history', label: 'History & Reports', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const {
    activeTab,
    setActiveTab,
    isMapPickerOpen,
    openMapPicker,
    closeMapPicker,
    onboardingCompleted,
    onboardingStep,
    setOnboardingStep,
    reopenOnboarding,
    user,
    accessToken,
    isLoadingAuth,
    authError,
    collegeSettings,
    todayAttendance,
    calendarYear,
    calendarMonth,
    calendarDays,
    monthlySummary,
    semesterSummary,
    historyRecords,
    historyTotal,
    historyFilterStatus,
    historyFilterMonth,
    holidays,
    auditLogs,
    storedEventsCount,
    offlineQueue,
    simulateOffline,
    isLoadingData,
    isSyncing,
    errorBanner,
    toastMessage,
    restoreSession,
    loginWithCredentials,
    registerAccount,
    loginDemoStudent,
    logout,
    refreshAllData,
    setCalendarMonthYear,
    setHistoryFilters,
    toggleTracking,
    updatePermissionStatus,
    enqueueOrSyncObservation,
    syncOfflineQueue,
    setSimulateOffline,
    updateCollegeSettings,
    restoreCollegeLocationHistory,
    submitAttendanceCorrection,
    deleteAttendanceRecord,
    addHoliday,
    removeHoliday,
    updatePrivacySettings,
    deleteAccountPermanently,
    showToast,
  } = useAttendlyStore();

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const handleExportDownload = async (format: 'csv' | 'json') => {
    if (!accessToken) return;
    try {
      const res = await fetch(
        `/api/v1/attendance/export?format=${format}&month=${historyFilterMonth}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!res.ok) {
        showToast('Could not generate export file.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendly-attendance-report.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Downloaded Attendly ${format.toUpperCase()} attendance report.`);
    } catch {
      showToast('Failed to download report.');
    }
  };

  const handlePrintPdfReport = () => {
    window.print();
  };

  // Show Splash & 4-Step Onboarding / Authentication if not yet onboarded or signed out
  if (!onboardingCompleted || (!user && !isLoadingAuth)) {
    return (
      <OnboardingAndAuthView
        onboardingStep={onboardingStep}
        onSetStep={setOnboardingStep}
        onSkipToDemo={loginDemoStudent}
        onLogin={loginWithCredentials}
        onRegister={registerAccount}
        authError={authError}
        isLoading={isLoadingAuth}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col pb-20 md:pb-8">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-[#E2E8F0] px-4 sm:px-6 py-3.5 no-print">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('dashboard');
            }}
            className="text-lg font-display font-bold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0"
          >
            Attendly
          </a>

          {/* Zone 2: 4 concise single-line text navigation links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-[#64748B]"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    isActive
                      ? 'text-[#0F172A] font-semibold border-[#16A34A]'
                      : 'border-transparent hover:text-[#0F172A]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => void handleExportDownload('csv')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#16A34A] rounded-xl hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </header>

      {/* Offline / Unsynced Queue Status Banner */}
      <OfflineQueueBanner />

      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-3 no-print"
        >
          <div className="rounded-xl bg-[#166534] text-white px-4 py-2.5 text-xs font-medium flex items-center justify-between">
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 space-y-6">
        {/* Student Context & Brand Subheader */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AttendlyLogo size="md" showWordmark={false} />
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-[#0F172A]">
                Welcome back, {user?.name || 'Student'}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
                <span>{ATTENDLY_THEME.brand.primaryTagline}</span>
                {user?.studentId && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{user.studentId}</span>
                  </>
                )}
                {user?.semester && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{user.semester}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 no-print">
            <button
              type="button"
              onClick={reopenOnboarding}
              className="text-xs font-medium text-[#64748B] hover:text-[#0F172A] underline whitespace-nowrap shrink-0 min-h-[36px] px-2"
            >
              How Attendly Works (4-Step Guide)
            </button>
          </div>
        </div>

        {errorBanner && (
          <ErrorState message={errorBanner} onRetry={() => void refreshAllData()} />
        )}

        {isLoadingAuth || (isLoadingData && !todayAttendance) ? (
          <LoadingState label="Synchronizing your college attendance and geofence state..." />
        ) : (
          <>
            {activeTab === 'dashboard' && todayAttendance && collegeSettings && (
              <div className="space-y-6">
                <TrackingStatusIndicator
                  trackingEnabled={todayAttendance.trackingEnabled}
                  permissionStatus={todayAttendance.permissionStatus}
                  collegeName={todayAttendance.collegeName}
                  radiusMeters={todayAttendance.radiusMeters}
                  lastSyncedAt={todayAttendance.lastSyncedAt}
                  timezone={collegeSettings.timezone}
                  offlineQueueCount={offlineQueue.length}
                  onToggleTracking={(enabled) => void toggleTracking(enabled)}
                  onOpenSettings={() => setActiveTab('settings')}
                  onOpenMapPicker={openMapPicker}
                />

                <AttendanceStatusCard
                  today={todayAttendance}
                  college={collegeSettings}
                  offlineQueueCount={offlineQueue.length}
                  simulateOffline={simulateOffline}
                  isSyncing={isSyncing}
                  onRecordObservation={enqueueOrSyncObservation}
                  onSyncQueue={syncOfflineQueue}
                  onToggleSimulateOffline={setSimulateOffline}
                />

                {monthlySummary && (
                  <MonthlySummaryCard
                    summary={monthlySummary}
                    semesterSummary={semesterSummary}
                    onNavigate={setActiveTab}
                    onExportCsv={() => void handleExportDownload('csv')}
                  />
                )}
              </div>
            )}

            {activeTab === 'calendar' && collegeSettings && (
              <AttendanceCalendar
                year={calendarYear}
                month={calendarMonth}
                days={calendarDays}
                summary={monthlySummary}
                holidays={holidays}
                timezone={collegeSettings.timezone}
                onChangeMonthYear={(y, m) => void setCalendarMonthYear(y, m)}
                onSubmitCorrection={submitAttendanceCorrection}
                onAddHoliday={addHoliday}
                onRemoveHoliday={removeHoliday}
              />
            )}

            {activeTab === 'history' && collegeSettings && (
              <HistoryAndReportsView
                records={historyRecords}
                totalCount={historyTotal}
                filterStatus={historyFilterStatus}
                filterMonth={historyFilterMonth}
                monthlySummary={monthlySummary}
                semesterSummary={semesterSummary}
                timezone={collegeSettings.timezone}
                onFilterChange={(st, mo) => void setHistoryFilters(st, mo)}
                onExportCsv={() => void handleExportDownload('csv')}
                onExportJson={() => void handleExportDownload('json')}
                onPrintPdf={handlePrintPdfReport}
                onDeleteRecord={(d) => void deleteAttendanceRecord(d)}
              />
            )}

            {activeTab === 'settings' && user && collegeSettings && (
              <SettingsAndPrivacyView
                user={user}
                college={collegeSettings}
                auditLogs={auditLogs}
                storedEventsCount={storedEventsCount}
                onSaveCollegeSettings={updateCollegeSettings}
                onOpenMapPicker={openMapPicker}
                onRestoreLocationHistory={restoreCollegeLocationHistory}
                onToggleTracking={toggleTracking}
                onUpdatePermissionStatus={updatePermissionStatus}
                onUpdatePrivacy={updatePrivacySettings}
                onExportCsv={() => void handleExportDownload('csv')}
                onExportJson={() => void handleExportDownload('json')}
                onDeleteAccount={deleteAccountPermanently}
                onLogout={logout}
              />
            )}
          </>
        )}
      </main>

      {/* Interactive College Location & Geofence Map Picker Modal Screen */}
      {isMapPickerOpen && collegeSettings && user && (
        <CollegeLocationPickerScreen
          college={collegeSettings}
          trackingEnabled={user.trackingEnabled}
          accessToken={accessToken}
          onSaveConfig={updateCollegeSettings}
          onRestoreHistory={restoreCollegeLocationHistory}
          onToggleTracking={toggleTracking}
          onSendTestObservation={enqueueOrSyncObservation}
          onClose={closeMapPicker}
        />
      )}

      {/* Honest Scope & Privacy Footer */}
      <footer className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 border-t border-[#E2E8F0] text-xs text-[#64748B] flex flex-col sm:flex-row sm:items-center justify-between gap-2 no-print">
        <span>
          <strong>Attendly</strong> — {ATTENDLY_THEME.brand.shortTagline}
        </span>
        <span>{ATTENDLY_THEME.brand.disclaimer}</span>
      </footer>

      {/* Mobile Fixed Bottom Navigation Bar (Visible on smartphone viewports < 768px) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] grid grid-cols-4 items-center h-15 no-print"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center min-h-[48px] transition-colors ${
                isActive ? 'text-[#16A34A] font-semibold' : 'text-[#64748B]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] mt-0.5 whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
