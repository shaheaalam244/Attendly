import { AttendanceStatus } from '../engine/attendanceEngine';

export const ATTENDLY_THEME = {
  brand: {
    name: 'Attendly',
    category: 'Automatic College Attendance Tracker',
    primaryTagline: 'You Go to College. We Track Your Attendance.',
    shortTagline: 'Your Attendance, Automatically.',
    disclaimer:
      'Attendly helps students track their personal college attendance automatically. GPS geofence presence does not prove classroom participation or guarantee uninterrupted background tracking.',
  },
  colors: {
    primaryGreen: '#16A34A',
    darkGreen: '#166534',
    background: '#F8FAFC',
    card: '#FFFFFF',
    primaryText: '#0F172A',
    secondaryText: '#64748B',
    border: '#E2E8F0',
    present: '#16A34A',
    absent: '#DC2626',
    pending: '#D97706',
    unknown: '#64748B',
  },
} as const;

export interface StatusVisualConfig {
  label: string;
  shortLabel: string;
  textColor: string;
  bgTint: string;
  borderColor: string;
  dotColor: string;
  description: string;
}

export const STATUS_VISUALS: Record<AttendanceStatus, StatusVisualConfig> = {
  PRESENT: {
    label: 'Present',
    shortLabel: 'PRE',
    textColor: 'text-[#166534]',
    bgTint: 'bg-[#16A34A]/10',
    borderColor: 'border-[#16A34A]/30',
    dotColor: 'bg-[#16A34A]',
    description: 'Verified 30+ minutes inside college geofence during working hours.',
  },
  ABSENT: {
    label: 'Absent',
    shortLabel: 'ABS',
    textColor: 'text-[#DC2626]',
    bgTint: 'bg-[#DC2626]/10',
    borderColor: 'border-[#DC2626]/30',
    dotColor: 'bg-[#DC2626]',
    description: 'Working day ended without qualifying campus presence.',
  },
  PENDING: {
    label: 'Pending Verification',
    shortLabel: 'PND',
    textColor: 'text-[#D97706]',
    bgTint: 'bg-[#D97706]/10',
    borderColor: 'border-[#D97706]/30',
    dotColor: 'bg-[#D97706]',
    description: 'Collecting presence evidence toward the 30-minute confirmation threshold.',
  },
  HOLIDAY: {
    label: 'Holiday / Off',
    shortLabel: 'HOL',
    textColor: 'text-[#475569]',
    bgTint: 'bg-slate-100',
    borderColor: 'border-slate-200',
    dotColor: 'bg-slate-400',
    description: 'Configured holiday or weekly non-working day (excluded from denominator).',
  },
  UNKNOWN: {
    label: 'Unknown',
    shortLabel: 'UNK',
    textColor: 'text-[#64748B]',
    bgTint: 'bg-slate-100/80',
    borderColor: 'border-slate-300',
    dotColor: 'bg-[#64748B]',
    description: 'Tracking was paused, permissions were missing, or evidence was inconclusive (excluded from denominator).',
  },
  NEEDS_REVIEW: {
    label: 'Needs Review',
    shortLabel: 'REV',
    textColor: 'text-[#D97706]',
    bgTint: 'bg-[#D97706]/10',
    borderColor: 'border-[#D97706]/30',
    dotColor: 'bg-[#D97706]',
    description: 'Observation occurred outside working hours or requires student review.',
  },
  NOT_DETECTED: {
    label: 'Not Detected',
    shortLabel: '—',
    textColor: 'text-[#64748B]',
    bgTint: 'bg-slate-50',
    borderColor: 'border-[#E2E8F0]',
    dotColor: 'bg-slate-300',
    description: 'Future working day or no campus entry detected yet today.',
  },
};

export function formatDurationMinutes(seconds: number): string {
  if (!seconds || seconds <= 0) return '0 min';
  const totalMins = Math.round(seconds / 60);
  if (totalMins < 60) return `${totalMins} min`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export function formatTimeInTimezone(
  isoString: string | null | undefined,
  timezone: string = 'Asia/Kolkata'
): string {
  if (!isoString) return 'Not recorded';
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return 'Not recorded';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: timezone || 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return 'Not recorded';
  }
}
