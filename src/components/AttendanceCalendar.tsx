import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  type CalendarDayCell,
  type HolidayItem,
  type MonthlySummaryMetrics,
} from '../engine/attendanceEngine';
import {
  STATUS_VISUALS,
  formatDurationMinutes,
  formatTimeInTimezone,
} from '../theme/tokens';

interface AttendanceCalendarProps {
  year: number;
  month: number;
  days: CalendarDayCell[];
  summary: MonthlySummaryMetrics | null;
  holidays: HolidayItem[];
  timezone: string;
  onChangeMonthYear: (year: number, month: number) => void;
  onSubmitCorrection: (
    date: string,
    status: 'PRESENT' | 'ABSENT' | 'HOLIDAY' | 'UNKNOWN',
    reason: string
  ) => Promise<boolean>;
  onAddHoliday: (
    date: string,
    name: string,
    holidayType: HolidayItem['holidayType']
  ) => Promise<boolean>;
  onRemoveHoliday: (id: string) => Promise<boolean>;
}

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({
  year,
  month,
  days,
  summary,
  holidays,
  timezone,
  onChangeMonthYear,
  onSubmitCorrection,
  onAddHoliday,
  onRemoveHoliday,
}) => {
  const [selectedDateStr, setSelectedDateStr] = useState<string>('2026-10-19');
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [correctionStatus, setCorrectionStatus] = useState<'PRESENT' | 'ABSENT' | 'UNKNOWN'>('PRESENT');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  const [newHolidayDate, setNewHolidayDate] = useState('2026-10-29');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayType, setNewHolidayType] = useState<HolidayItem['holidayType']>('ACADEMIC');
  const [holidayError, setHolidayError] = useState<string | null>(null);

  const selectedDay =
    days.find((d) => d.date === selectedDateStr) ||
    days.find((d) => d.isToday) ||
    days[0] ||
    null;

  const firstDayOffset = days[0]?.dayOfWeek ?? 0;

  const handlePrevMonth = () => {
    if (month === 1) {
      onChangeMonthYear(year - 1, 12);
    } else {
      onChangeMonthYear(year, month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      onChangeMonthYear(year + 1, 1);
    } else {
      onChangeMonthYear(year, month + 1);
    }
  };

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDay) return;
    if (correctionReason.trim().length < 5) {
      setCorrectionError('Please enter a brief explanation (at least 5 characters).');
      return;
    }
    setCorrectionError(null);
    const ok = await onSubmitCorrection(
      selectedDay.date,
      correctionStatus,
      correctionReason.trim()
    );
    if (ok) {
      setShowCorrectionForm(false);
      setCorrectionReason('');
    }
  };

  const handleAddHolidaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newHolidayName.trim().length < 2) {
      setHolidayError('Please enter a holiday name.');
      return;
    }
    setHolidayError(null);
    const ok = await onAddHoliday(newHolidayDate, newHolidayName.trim(), newHolidayType);
    if (ok) {
      setNewHolidayName('');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 8 Columns: Monthly Calendar Grid */}
      <div className="lg:col-span-8 rounded-2xl bg-white border border-[#E2E8F0] p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
          <div>
            <span className="text-xs text-[#64748B]">
              Timezone: {timezone} · Future &amp; Unknown dates never count as Absent
            </span>
            <h2 className="text-xl font-bold text-[#0F172A] mt-0.5">
              Attendly Monthly Calendar
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous Month"
              className="w-10 h-10 rounded-xl border border-[#E2E8F0] flex items-center justify-center text-[#0F172A] hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <label className="sr-only" htmlFor="calendar-month-select">
              Select Month
            </label>
            <select
              id="calendar-month-select"
              value={month}
              onChange={(e) => onChangeMonthYear(year, Number(e.target.value))}
              className="h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="calendar-year-select">
              Select Year
            </label>
            <select
              id="calendar-year-select"
              value={year}
              onChange={(e) => onChangeMonthYear(Number(e.target.value), month)}
              className="h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs font-semibold font-mono text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next Month"
              className="w-10 h-10 rounded-xl border border-[#E2E8F0] flex items-center justify-center text-[#0F172A] hover:bg-slate-50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#64748B]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#16A34A]" aria-hidden="true" />
            <span>Present (PRE)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#DC2626]" aria-hidden="true" />
            <span>Absent (ABS)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#D97706]" aria-hidden="true" />
            <span>Pending (PND)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#64748B]" aria-hidden="true" />
            <span>Unknown (UNK)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-slate-300" aria-hidden="true" />
            <span>Holiday / Off (HOL)</span>
          </span>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-[#64748B]">
          {WEEKDAYS.map((day) => (
            <div key={day} className="py-1.5">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Cells Grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: firstDayOffset }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="h-16 sm:h-20 rounded-xl bg-slate-50/40 border border-transparent"
              aria-hidden="true"
            />
          ))}

          {days.map((dayCell) => {
            const visual = STATUS_VISUALS[dayCell.status] || STATUS_VISUALS.NOT_DETECTED;
            const isSelected = selectedDay?.date === dayCell.date;

            return (
              <button
                key={dayCell.date}
                type="button"
                onClick={() => {
                  setSelectedDateStr(dayCell.date);
                  setShowCorrectionForm(false);
                }}
                aria-label={`Date ${dayCell.date}, status ${visual.label}`}
                className={`h-16 sm:h-20 rounded-xl border p-1.5 sm:p-2 flex flex-col justify-between text-left transition-colors ${
                  isSelected
                    ? 'ring-2 ring-[#16A34A] border-[#16A34A] bg-white'
                    : `${visual.bgTint} ${visual.borderColor} hover:border-slate-400`
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-xs sm:text-sm font-bold font-mono tabular-nums ${
                      dayCell.isToday ? 'text-[#16A34A] underline' : 'text-[#0F172A]'
                    }`}
                  >
                    {dayCell.dayOfMonth}
                  </span>
                  {dayCell.isToday && (
                    <span className="text-[10px] font-semibold text-[#166534] hidden sm:inline">
                      Today
                    </span>
                  )}
                </div>

                <div className="w-full">
                  <span
                    className={`block text-[10px] sm:text-xs font-bold tracking-tight truncate ${visual.textColor}`}
                  >
                    {visual.shortLabel}
                  </span>
                  {dayCell.verifiedDurationSeconds > 0 && (
                    <span className="hidden sm:block text-[10px] text-[#64748B] font-mono tabular-nums truncate">
                      {Math.round(dayCell.verifiedDurationSeconds / 60)}m
                    </span>
                  )}
                  {dayCell.holidayName && dayCell.verifiedDurationSeconds === 0 && (
                    <span className="hidden sm:block text-[10px] text-[#64748B] truncate">
                      {dayCell.holidayName}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Monthly Summary Footer inside Calendar Card */}
        {summary && (
          <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Present: <strong className="font-mono text-[#16A34A]">{summary.presentDays}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Absent: <strong className="font-mono text-[#DC2626]">{summary.absentDays}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Holidays: <strong className="font-mono text-[#0F172A]">{summary.holidayDays}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Unknown: <strong className="font-mono text-[#64748B]">{summary.unknownDays}</strong>
              </span>
            </div>
            <div className="font-mono font-bold text-[#0F172A]">
              Monthly Score: {summary.formattedPercentage}
            </div>
          </div>
        )}
      </div>

      {/* Right 4 Columns: Selected Date Details + Holiday Manager */}
      <div className="lg:col-span-4 space-y-6">
        {selectedDay && (
          <div className="rounded-2xl bg-white border border-[#E2E8F0] p-5 space-y-4">
            <div className="border-b border-[#E2E8F0] pb-3">
              <span className="text-xs font-mono text-[#64748B]">{selectedDay.date}</span>
              <h3 className="text-lg font-bold text-[#0F172A] mt-0.5">
                {STATUS_VISUALS[selectedDay.status]?.label}
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                {STATUS_VISUALS[selectedDay.status]?.description}
              </p>
            </div>

            <dl className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <dt className="text-[#64748B]">Schedule Classification</dt>
                <dd className="font-semibold text-[#0F172A]">
                  {selectedDay.isHoliday
                    ? `Holiday (${selectedDay.holidayName || 'Configured'})`
                    : selectedDay.isWorkingDay
                      ? 'Working Day'
                      : 'Weekly Non-Working Day'}
                </dd>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <dt className="text-[#64748B]">First Confirmed Arrival</dt>
                <dd className="font-mono font-semibold text-[#0F172A]">
                  {formatTimeInTimezone(selectedDay.firstConfirmedAt, timezone)}
                </dd>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <dt className="text-[#64748B]">Last Observation</dt>
                <dd className="font-mono font-semibold text-[#0F172A]">
                  {formatTimeInTimezone(selectedDay.lastConfirmedAt, timezone)}
                </dd>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <dt className="text-[#64748B]">Verified Presence Duration</dt>
                <dd className="font-mono font-semibold text-[#16A34A] tabular-nums">
                  {formatDurationMinutes(selectedDay.verifiedDurationSeconds)}
                </dd>
              </div>

              <div className="flex items-center justify-between py-1">
                <dt className="text-[#64748B]">Manual Correction Status</dt>
                <dd className="font-mono font-semibold text-[#0F172A]">
                  {selectedDay.correctionStatus}
                </dd>
              </div>
            </dl>

            {selectedDay.warnings && selectedDay.warnings.length > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-950 space-y-1">
                <span className="font-semibold block">Tracking &amp; Verification Notes:</span>
                {selectedDay.warnings.map((w, idx) => (
                  <p key={idx} className="text-[11px] leading-relaxed">
                    • {w}
                  </p>
                ))}
              </div>
            )}

            {!selectedDay.isFuture && (
              <div className="pt-2 border-t border-[#E2E8F0]">
                {!showCorrectionForm ? (
                  <button
                    type="button"
                    onClick={() => setShowCorrectionForm(true)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-100 transition-colors min-h-[44px]"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#16A34A]" />
                    <span>Review or Correct This Date</span>
                  </button>
                ) : (
                  <form onSubmit={handleCorrectionSubmit} className="space-y-3 pt-1">
                    <div>
                      <label
                        htmlFor="correction-status-select"
                        className="block text-xs font-semibold text-[#0F172A] mb-1"
                      >
                        Corrected Status for {selectedDay.date}
                      </label>
                      <select
                        id="correction-status-select"
                        value={correctionStatus}
                        onChange={(e) =>
                          setCorrectionStatus(
                            e.target.value as 'PRESENT' | 'ABSENT' | 'UNKNOWN'
                          )
                        }
                        className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#0F172A]"
                      >
                        <option value="PRESENT">Present (Verified Attendance)</option>
                        <option value="ABSENT">Absent</option>
                        <option value="UNKNOWN">Unknown (Exclude from %)</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="correction-reason-input"
                        className="block text-xs font-semibold text-[#0F172A] mb-1"
                      >
                        Reason for Correction (Audited)
                      </label>
                      <input
                        id="correction-reason-input"
                        type="text"
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                        placeholder="e.g., Phone battery died during morning lab session"
                        className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs text-[#0F172A]"
                      />
                    </div>

                    {correctionError && (
                      <p className="text-xs text-[#DC2626]">{correctionError}</p>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        className="flex-1 rounded-xl bg-[#16A34A] py-2.5 text-xs font-semibold text-white hover:bg-[#166534] transition-colors min-h-[40px]"
                      >
                        Save Correction
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCorrectionForm(false)}
                        className="px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#64748B] hover:text-[#0F172A] min-h-[40px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {/* Academic Holiday Manager */}
        <div className="rounded-2xl bg-white border border-[#E2E8F0] p-5 space-y-4">
          <div>
            <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-[#16A34A]" />
              <span>College Holidays</span>
            </h3>
            <p className="text-xs text-[#64748B] mt-0.5">
              Configured holidays are automatically excluded from the working-day denominator.
            </p>
          </div>

          <ul className="divide-y divide-slate-100 text-xs">
            {holidays.map((h) => (
              <li key={h.id} className="py-2.5 flex items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-[#0F172A] block">{h.name}</span>
                  <span className="text-[#64748B] font-mono">
                    {h.date} · {h.holidayType}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void onRemoveHoliday(h.id)}
                  aria-label={`Remove holiday ${h.name}`}
                  className="w-9 h-9 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 flex items-center justify-center transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={handleAddHolidaySubmit} className="space-y-2.5 pt-2 border-t border-[#E2E8F0]">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="holiday-date" className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Holiday Date
                </label>
                <input
                  id="holiday-date"
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  className="w-full h-10 rounded-xl border border-[#E2E8F0] px-2.5 text-xs font-mono text-[#0F172A]"
                />
              </div>
              <div>
                <label htmlFor="holiday-type" className="block text-[11px] font-medium text-[#64748B] mb-1">
                  Category
                </label>
                <select
                  id="holiday-type"
                  value={newHolidayType}
                  onChange={(e) => setNewHolidayType(e.target.value as HolidayItem['holidayType'])}
                  className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-2.5 text-xs text-[#0F172A]"
                >
                  <option value="ACADEMIC">Academic</option>
                  <option value="NATIONAL">National</option>
                  <option value="EXAM">Exam Prep</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="holiday-name" className="block text-[11px] font-medium text-[#64748B] mb-1">
                Holiday Name
              </label>
              <div className="flex gap-2">
                <input
                  id="holiday-name"
                  type="text"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  placeholder="e.g., Diwali Break"
                  className="flex-1 h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs text-[#0F172A]"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-xl bg-[#0F172A] px-3.5 h-10 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>
            </div>
            {holidayError && (
              <p className="text-xs text-[#DC2626] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>{holidayError}</span>
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
