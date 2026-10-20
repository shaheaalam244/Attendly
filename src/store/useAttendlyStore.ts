import { create } from 'zustand';
import {
  type AttendanceStatus,
  type CalendarDayCell,
  type CollegeConfig,
  type HolidayItem,
  type MonthlySummaryMetrics,
  type RawLocationObservation,
  type StoredAttendanceRecord,
  type VerifiedInterval,
} from '../engine/attendanceEngine';

export type NavTab = 'dashboard' | 'calendar' | 'history' | 'settings';

export interface StudentUser {
  id: string;
  name: string;
  email: string;
  studentId: string;
  department: string;
  semester: string;
  timezone: string;
  collegeId: string;
  trackingEnabled: boolean;
  permissionStatus: 'GRANTED_ALWAYS' | 'GRANTED_FOREGROUND' | 'DENIED' | 'NOT_DETERMINED';
  lastSyncedAt: string | null;
  privacySettings: {
    retainRawEventsDays: number;
    allowAnalyticsDiagnostics: boolean;
    backgroundTrackingConsent: boolean;
    consentUpdatedAt: string;
  };
}

export interface TodayAttendanceState {
  date: string;
  collegeName: string;
  address: string;
  radiusMeters: number;
  workingHours: string;
  trackingEnabled: boolean;
  permissionStatus: string;
  lastSyncedAt: string | null;
  status: AttendanceStatus;
  verifiedDurationSeconds: number;
  requiredDurationSeconds: number;
  progressPercent: number;
  firstConfirmedAt: string | null;
  lastConfirmedAt: string | null;
  intervals: VerifiedInterval[];
  observationCount: number;
  warnings: string[];
}

export interface SemesterSummary {
  semesterName: string;
  monthsIncluded: string[];
  presentDays: number;
  absentDays: number;
  holidayDays: number;
  unknownDays: number;
  eligibleWorkingDays: number;
  attendancePercentage: number | null;
  formattedPercentage: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  targetDate?: string;
  details: string;
  createdAt: string;
}

interface AttendlyStoreState {
  // Navigation & Onboarding
  activeTab: NavTab;
  isMapPickerOpen: boolean;
  onboardingCompleted: boolean;
  onboardingStep: number; // 0 to 3
  setActiveTab: (tab: NavTab) => void;
  openMapPicker: () => void;
  closeMapPicker: () => void;
  setOnboardingStep: (step: number) => void;
  completeOnboarding: () => void;
  reopenOnboarding: () => void;

  // Auth & Session
  user: StudentUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoadingAuth: boolean;
  authError: string | null;

  // Data States
  collegeSettings: CollegeConfig | null;
  todayAttendance: TodayAttendanceState | null;
  calendarYear: number;
  calendarMonth: number; // 1-12
  calendarDays: CalendarDayCell[];
  monthlySummary: MonthlySummaryMetrics | null;
  semesterSummary: SemesterSummary | null;
  historyRecords: StoredAttendanceRecord[];
  historyTotal: number;
  historyFilterStatus: string;
  historyFilterMonth: string;
  holidays: HolidayItem[];
  auditLogs: AuditLogEntry[];
  storedEventsCount: number;

  // Offline Queue & Network Simulation
  offlineQueue: RawLocationObservation[];
  simulateOffline: boolean;
  isLoadingData: boolean;
  isSyncing: boolean;
  errorBanner: string | null;
  toastMessage: string | null;

  // Actions
  clearMessages: () => void;
  showToast: (msg: string) => void;
  setSimulateOffline: (offline: boolean) => void;
  loginWithCredentials: (email: string, password: string) => Promise<boolean>;
  registerAccount: (payload: {
    name: string;
    email: string;
    password: string;
    studentId?: string;
    department?: string;
  }) => Promise<boolean>;
  loginDemoStudent: () => Promise<boolean>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  refreshAllData: () => Promise<void>;
  setCalendarMonthYear: (year: number, month: number) => Promise<void>;
  setHistoryFilters: (status: string, month: string) => Promise<void>;

  // Geofence & Tracking Actions
  toggleTracking: (enabled: boolean) => Promise<void>;
  updatePermissionStatus: (
    status: 'GRANTED_ALWAYS' | 'GRANTED_FOREGROUND' | 'DENIED' | 'NOT_DETERMINED'
  ) => Promise<void>;
  enqueueOrSyncObservation: (obs: Omit<RawLocationObservation, 'eventId'>) => Promise<void>;
  syncOfflineQueue: () => Promise<void>;
  updateCollegeSettings: (patch: Partial<CollegeConfig>) => Promise<boolean>;
  restoreCollegeLocationHistory: (historyId: string) => Promise<boolean>;
  submitAttendanceCorrection: (
    date: string,
    requestedStatus: 'PRESENT' | 'ABSENT' | 'HOLIDAY' | 'UNKNOWN',
    reason: string
  ) => Promise<boolean>;
  deleteAttendanceRecord: (date: string) => Promise<boolean>;
  addHoliday: (date: string, name: string, holidayType: HolidayItem['holidayType']) => Promise<boolean>;
  removeHoliday: (id: string) => Promise<boolean>;
  updatePrivacySettings: (patch: {
    retainRawEventsDays?: number;
    allowAnalyticsDiagnostics?: boolean;
    backgroundTrackingConsent?: boolean;
  }) => Promise<void>;
  deleteAccountPermanently: () => Promise<boolean>;
}

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'attendly_access_token',
  REFRESH_TOKEN: 'attendly_refresh_token',
  ONBOARDING_DONE: 'attendly_onboarding_done',
  OFFLINE_QUEUE: 'attendly_offline_queue',
};

function loadOfflineQueue(): RawLocationObservation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: RawLocationObservation[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
  } catch {
    // ignore storage quota errors
  }
}

export const useAttendlyStore = create<AttendlyStoreState>((set, get) => ({
  activeTab: 'dashboard',
  isMapPickerOpen: false,
  onboardingCompleted:
    typeof window !== 'undefined' &&
    (localStorage.getItem(STORAGE_KEYS.ONBOARDING_DONE) === 'true' ||
      new URLSearchParams(window.location.search).get('autostart') === '1'),
  onboardingStep: 0,

  setActiveTab: (tab) => set({ activeTab: tab, errorBanner: null }),
  openMapPicker: () => set({ isMapPickerOpen: true, errorBanner: null }),
  closeMapPicker: () => set({ isMapPickerOpen: false }),
  setOnboardingStep: (step) => set({ onboardingStep: Math.max(0, Math.min(3, step)) }),
  completeOnboarding: () => {
    try {
      localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');
    } catch {
      // ignore
    }
    set({ onboardingCompleted: true });
  },
  reopenOnboarding: () => {
    set({ onboardingCompleted: false, onboardingStep: 0 });
  },

  user: null,
  accessToken:
    typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN) : null,
  refreshToken:
    typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN) : null,
  isLoadingAuth: true,
  authError: null,

  collegeSettings: null,
  todayAttendance: null,
  calendarYear: 2026,
  calendarMonth: 10,
  calendarDays: [],
  monthlySummary: null,
  semesterSummary: null,
  historyRecords: [],
  historyTotal: 0,
  historyFilterStatus: 'ALL',
  historyFilterMonth: 'ALL',
  holidays: [],
  auditLogs: [],
  storedEventsCount: 0,

  offlineQueue: typeof window !== 'undefined' ? loadOfflineQueue() : [],
  simulateOffline: false,
  isLoadingData: false,
  isSyncing: false,
  errorBanner: null,
  toastMessage: null,

  clearMessages: () => set({ errorBanner: null, authError: null, toastMessage: null }),
  showToast: (msg: string) => {
    set({ toastMessage: msg });
    setTimeout(() => {
      if (get().toastMessage === msg) {
        set({ toastMessage: null });
      }
    }, 4000);
  },

  setSimulateOffline: (offline: boolean) => {
    set({ simulateOffline: offline });
    if (!offline && get().offlineQueue.length > 0) {
      void get().syncOfflineQueue();
    }
  },

  loginWithCredentials: async (email, password) => {
    set({ isLoadingAuth: true, authError: null });
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        set({
          isLoadingAuth: false,
          authError: json.error?.message || 'Unable to sign in with those credentials.',
        });
        return false;
      }

      const { user, accessToken, refreshToken } = json.data;
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
      localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');

      set({
        user,
        accessToken,
        refreshToken,
        onboardingCompleted: true,
        isLoadingAuth: false,
        authError: null,
      });

      await get().refreshAllData();
      return true;
    } catch {
      set({
        isLoadingAuth: false,
        authError: 'Network error while connecting to Attendly server.',
      });
      return false;
    }
  },

  registerAccount: async (payload) => {
    set({ isLoadingAuth: true, authError: null });
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        set({
          isLoadingAuth: false,
          authError: json.error?.message || 'Registration failed.',
        });
        return false;
      }

      const { user, accessToken, refreshToken } = json.data;
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
      localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');

      set({
        user,
        accessToken,
        refreshToken,
        onboardingCompleted: true,
        isLoadingAuth: false,
        authError: null,
      });

      await get().refreshAllData();
      get().showToast('Welcome to Attendly! Configure your college location to begin.');
      return true;
    } catch {
      set({
        isLoadingAuth: false,
        authError: 'Network error during registration.',
      });
      return false;
    }
  },

  loginDemoStudent: async () => {
    return get().loginWithCredentials('aarav.sharma@iitb.ac.in', 'Attendly@2026');
  },

  logout: async () => {
    const { refreshToken } = get();
    try {
      if (refreshToken) {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      // ignore network error on logout
    }
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      todayAttendance: null,
      offlineQueue: [],
      activeTab: 'dashboard',
    });
  },

  restoreSession: async () => {
    const token = get().accessToken;
    const isAutostart =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('autostart') === '1';

    if (!token) {
      // Automatically sign in the pre-seeded student account so the full dashboard works immediately,
      // while allowing logout or account switch at any time.
      if (isAutostart || get().onboardingCompleted) {
        await get().loginDemoStudent();
        return;
      }
      set({ isLoadingAuth: false });
      return;
    }

    try {
      const res = await fetch('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        set({
          user: json.data.user,
          collegeSettings: json.data.collegeSettings,
          isLoadingAuth: false,
        });
        await get().refreshAllData();
        return;
      }
    } catch {
      // ignore
    }

    // Fallback to demo student login if stored token expired
    await get().loginDemoStudent();
  },

  refreshAllData: async () => {
    const token = get().accessToken;
    if (!token) return;

    set({ isLoadingData: true, errorBanner: null });
    const headers = { Authorization: `Bearer ${token}` };
    const { calendarYear, calendarMonth, historyFilterStatus, historyFilterMonth } = get();

    try {
      const [meRes, todayRes, monthlyRes, histRes, holRes, privRes] = await Promise.all([
        fetch('/api/v1/auth/me', { headers }),
        fetch('/api/v1/attendance/today', { headers }),
        fetch(`/api/v1/attendance/monthly?year=${calendarYear}&month=${calendarMonth}`, {
          headers,
        }),
        fetch(
          `/api/v1/attendance/history?status=${historyFilterStatus}&month=${historyFilterMonth}&limit=50`,
          { headers }
        ),
        fetch('/api/v1/holidays', { headers }),
        fetch('/api/v1/privacy/settings', { headers }),
      ]);

      if (meRes.ok) {
        const meJson = await meRes.json();
        set({
          user: meJson.data.user,
          collegeSettings: meJson.data.collegeSettings,
        });
      }

      if (todayRes.ok) {
        const todayJson = await todayRes.json();
        set({ todayAttendance: todayJson.data });
      }

      if (monthlyRes.ok) {
        const monthlyJson = await monthlyRes.json();
        set({
          calendarDays: monthlyJson.data.days,
          monthlySummary: monthlyJson.data.summary,
          semesterSummary: monthlyJson.data.semesterSummary,
        });
      }

      if (histRes.ok) {
        const histJson = await histRes.json();
        set({
          historyRecords: histJson.data.records,
          historyTotal: histJson.data.pagination.total,
        });
      }

      if (holRes.ok) {
        const holJson = await holRes.json();
        set({ holidays: holJson.data.holidays });
      }

      if (privRes.ok) {
        const privJson = await privRes.json();
        set({
          auditLogs: privJson.data.auditLogs || [],
          storedEventsCount: privJson.data.storedLocationEventsCount || 0,
        });
      }

      set({ isLoadingData: false });
    } catch {
      set({
        isLoadingData: false,
        errorBanner: 'Unable to reach Attendly backend. Displaying cached state.',
      });
    }
  },

  setCalendarMonthYear: async (year, month) => {
    set({ calendarYear: year, calendarMonth: month });
    const token = get().accessToken;
    if (!token) return;
    try {
      const res = await fetch(`/api/v1/attendance/monthly?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        set({
          calendarDays: json.data.days,
          monthlySummary: json.data.summary,
          semesterSummary: json.data.semesterSummary,
        });
      }
    } catch {
      set({ errorBanner: 'Could not load calendar for selected month.' });
    }
  },

  setHistoryFilters: async (status, month) => {
    set({ historyFilterStatus: status, historyFilterMonth: month });
    const token = get().accessToken;
    if (!token) return;
    try {
      const res = await fetch(
        `/api/v1/attendance/history?status=${status}&month=${month}&limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const json = await res.json();
        set({
          historyRecords: json.data.records,
          historyTotal: json.data.pagination.total,
        });
      }
    } catch {
      set({ errorBanner: 'Failed to filter attendance history.' });
    }
  },

  toggleTracking: async (enabled) => {
    const token = get().accessToken;
    if (!token) return;
    try {
      const res = await fetch('/api/v1/tracking/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          trackingEnabled: enabled,
          permissionStatus: enabled ? 'GRANTED_ALWAYS' : get().user?.permissionStatus,
        }),
      });
      if (res.ok) {
        await get().refreshAllData();
        get().showToast(
          enabled
            ? 'Automatic campus geofence tracking resumed.'
            : 'Automatic location tracking paused.'
        );
      }
    } catch {
      set({ errorBanner: 'Could not update tracking state.' });
    }
  },

  updatePermissionStatus: async (permissionStatus) => {
    const token = get().accessToken;
    if (!token) return;
    try {
      const res = await fetch('/api/v1/tracking/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ permissionStatus }),
      });
      if (res.ok) {
        await get().refreshAllData();
        get().showToast(`Location permission status updated to ${permissionStatus}.`);
      }
    } catch {
      set({ errorBanner: 'Could not update permission status.' });
    }
  },

  enqueueOrSyncObservation: async (obsInput) => {
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newObs: RawLocationObservation = {
      ...obsInput,
      eventId,
    };

    const currentQueue = [...get().offlineQueue, newObs];
    saveOfflineQueue(currentQueue);
    set({ offlineQueue: currentQueue });

    if (get().simulateOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      get().showToast(
        `Saved observation (${obsInput.eventType}) to persistent offline queue (${currentQueue.length} pending).`
      );
      return;
    }

    await get().syncOfflineQueue();
  },

  syncOfflineQueue: async () => {
    const token = get().accessToken;
    const queue = get().offlineQueue;
    if (!token || queue.length === 0) return;

    if (get().simulateOffline) {
      get().showToast('Offline simulation is active. Disable Offline Mode to sync with backend.');
      return;
    }

    set({ isSyncing: true, errorBanner: null });
    try {
      const res = await fetch('/api/v1/attendance/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          events: queue,
          referenceNowIso: '2026-10-19T05:30:00.000Z',
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        set({
          isSyncing: false,
          errorBanner: json.error?.message || 'Failed to synchronize location events.',
        });
        return;
      }

      saveOfflineQueue([]);
      set({ offlineQueue: [], isSyncing: false });
      await get().refreshAllData();

      const updatedStatus = json.data.updatedRecords?.[0]?.status;
      if (updatedStatus === 'PRESENT') {
        get().showToast(
          '30+ minutes of campus presence verified! Today is now marked PRESENT.'
        );
      } else {
        get().showToast(`Synchronized ${queue.length} campus location event(s) with backend.`);
      }
    } catch {
      set({
        isSyncing: false,
        errorBanner: 'Network unavailable during sync. Events remain safely in local queue.',
      });
    }
  },

  updateCollegeSettings: async (patch) => {
    const token = get().accessToken;
    if (!token) return false;
    try {
      const res = await fetch('/api/v1/college-settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        set({ errorBanner: json.error?.message || 'Could not update college settings.' });
        return false;
      }
      await get().refreshAllData();
      get().showToast(
        json.data?.message || 'College geofence location and radius saved.'
      );
      return true;
    } catch {
      set({ errorBanner: 'Network error while saving college settings.' });
      return false;
    }
  },

  restoreCollegeLocationHistory: async (historyId) => {
    const token = get().accessToken;
    if (!token) return false;
    try {
      const res = await fetch('/api/v1/college-settings/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ historyId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        set({ errorBanner: json.error?.message || 'Could not restore saved location.' });
        return false;
      }
      await get().refreshAllData();
      get().showToast(json.data?.message || 'Restored previous college location and radius.');
      return true;
    } catch {
      set({ errorBanner: 'Network error while restoring saved location.' });
      return false;
    }
  },

  submitAttendanceCorrection: async (date, requestedStatus, reason) => {
    const token = get().accessToken;
    if (!token) return false;
    try {
      const res = await fetch(`/api/v1/attendance/${date}/correction-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requestedStatus, reason }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        set({ errorBanner: json.error?.message || 'Correction request failed.' });
        return false;
      }
      await get().refreshAllData();
      get().showToast(`Updated ${date} to ${requestedStatus}.`);
      return true;
    } catch {
      set({ errorBanner: 'Network error while submitting correction.' });
      return false;
    }
  },

  deleteAttendanceRecord: async (date) => {
    const token = get().accessToken;
    if (!token) return false;
    try {
      const res = await fetch(`/api/v1/attendance/${date}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      await get().refreshAllData();
      get().showToast(`Deleted attendance record for ${date}.`);
      return true;
    } catch {
      return false;
    }
  },

  addHoliday: async (date, name, holidayType) => {
    const token = get().accessToken;
    if (!token) return false;
    try {
      const res = await fetch('/api/v1/holidays', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ date, name, holidayType }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        set({ errorBanner: json.error?.message || 'Could not add holiday.' });
        return false;
      }
      await get().refreshAllData();
      get().showToast(`Added holiday: ${name} (${date}).`);
      return true;
    } catch {
      set({ errorBanner: 'Network error while adding holiday.' });
      return false;
    }
  },

  removeHoliday: async (id) => {
    const token = get().accessToken;
    if (!token) return false;
    try {
      const res = await fetch(`/api/v1/holidays/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      await get().refreshAllData();
      get().showToast('Holiday removed from calendar.');
      return true;
    } catch {
      return false;
    }
  },

  updatePrivacySettings: async (patch) => {
    const token = get().accessToken;
    if (!token) return;
    try {
      const res = await fetch('/api/v1/privacy/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        await get().refreshAllData();
        get().showToast('Privacy and data retention settings updated.');
      }
    } catch {
      set({ errorBanner: 'Could not update privacy settings.' });
    }
  },

  deleteAccountPermanently: async () => {
    const token = get().accessToken;
    if (!token) return false;
    try {
      const res = await fetch('/api/v1/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      await get().logout();
      return true;
    } catch {
      return false;
    }
  },
}));
