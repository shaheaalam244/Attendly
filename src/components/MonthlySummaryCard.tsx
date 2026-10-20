import React from 'react';
import { Calendar, FileSpreadsheet, History, Settings } from 'lucide-react';
import { type MonthlySummaryMetrics } from '../engine/attendanceEngine';
import { type NavTab, type SemesterSummary } from '../store/useAttendlyStore';

interface MonthlySummaryCardProps {
  summary: MonthlySummaryMetrics;
  semesterSummary?: SemesterSummary | null;
  onNavigate: (tab: NavTab) => void;
  onExportCsv: () => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const MonthlySummaryCard: React.FC<MonthlySummaryCardProps> = ({
  summary,
  semesterSummary,
  onNavigate,
  onExportCsv,
}) => {
  const monthLabel = `${MONTH_NAMES[(summary.month - 1) % 12]} ${summary.year}`;
  const isHealthyPercentage =
    summary.attendancePercentage === null || summary.attendancePercentage >= 75;

  return (
    <section
      aria-labelledby="monthly-overview-heading"
      className="rounded-2xl bg-white border border-[#E2E8F0] p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
        <div>
          <span className="text-xs text-[#64748B] font-medium">
            Monthly Attendance Overview · {monthLabel}
          </span>
          <h3
            id="monthly-overview-heading"
            className="text-lg sm:text-xl font-bold text-[#0F172A] mt-0.5"
          >
            Eligible Working-Day Calculation
          </h3>
          <p className="text-xs text-[#64748B] mt-0.5">
            Formula: Present eligible working days ÷ Total eligible working days × 100 (Holidays &amp; Unknown days excluded)
          </p>
        </div>

        <div className="sm:text-right shrink-0">
          <span className="text-xs text-[#64748B] block">Monthly Attendance</span>
          <span
            className={`text-2xl sm:text-3xl font-bold font-mono tabular-nums ${
              isHealthyPercentage ? 'text-[#16A34A]' : 'text-[#D97706]'
            }`}
            data-testid="monthly-percentage-value"
          >
            {summary.formattedPercentage}
          </span>
          <span className="text-xs text-[#64748B] block tabular-nums">
            {summary.presentDays} of {summary.eligibleWorkingDays} eligible days
          </span>
        </div>
      </div>

      {/* 6 Metric Cells */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] block">Present Days</span>
          <span
            className="text-2xl font-bold font-mono tabular-nums text-[#16A34A] mt-1 block"
            data-testid="metric-present-days"
          >
            {summary.presentDays}
          </span>
          <span className="text-[11px] text-[#64748B]">Verified ≥30m</span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] block">Absent Days</span>
          <span
            className="text-2xl font-bold font-mono tabular-nums text-[#DC2626] mt-1 block"
            data-testid="metric-absent-days"
          >
            {summary.absentDays}
          </span>
          <span className="text-[11px] text-[#64748B]">No campus visit</span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] block">Eligible Working</span>
          <span
            className="text-2xl font-bold font-mono tabular-nums text-[#0F172A] mt-1 block"
            data-testid="metric-eligible-days"
          >
            {summary.eligibleWorkingDays}
          </span>
          <span className="text-[11px] text-[#64748B]">Denominator</span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] block">Holidays &amp; Offs</span>
          <span className="text-2xl font-bold font-mono tabular-nums text-[#0F172A] mt-1 block">
            {summary.holidayDays + summary.nonWorkingDays}
          </span>
          <span className="text-[11px] text-[#64748B]">
            {summary.holidayDays} holiday · {summary.nonWorkingDays} weekly off
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] block">Unknown Days</span>
          <span className="text-2xl font-bold font-mono tabular-nums text-[#64748B] mt-1 block">
            {summary.unknownDays}
          </span>
          <span className="text-[11px] text-[#64748B]">Excluded from %</span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] block">Avg Arrival Time</span>
          <span className="text-xl font-bold font-mono tabular-nums text-[#0F172A] mt-1 block">
            {summary.averageArrivalTime || '—'}
          </span>
          <span className="text-[11px] text-[#64748B]">IST (Campus Gate)</span>
        </div>
      </div>

      {/* Semester Cumulative Summary Strip */}
      {semesterSummary && (
        <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-[#0F172A]">
              Semester Cumulative · {semesterSummary.semesterName}
            </span>
            <p className="text-xs text-[#64748B]">
              {semesterSummary.monthsIncluded.join(' + ')} · Present {semesterSummary.presentDays} · Absent {semesterSummary.absentDays} · Holidays {semesterSummary.holidayDays} · Unknown {semesterSummary.unknownDays}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <span className="text-[11px] text-[#64748B] block">Semester Attendance</span>
              <span className="text-lg font-bold font-mono tabular-nums text-[#166534]">
                {semesterSummary.formattedPercentage} ({semesterSummary.presentDays}/{semesterSummary.eligibleWorkingDays})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions Row */}
      <div className="pt-2 border-t border-[#E2E8F0] grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <button
          type="button"
          onClick={() => onNavigate('calendar')}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors min-h-[44px] whitespace-nowrap"
        >
          <Calendar className="w-4 h-4 text-[#16A34A]" />
          <span>View Calendar</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('history')}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors min-h-[44px] whitespace-nowrap"
        >
          <History className="w-4 h-4 text-[#16A34A]" />
          <span>Attendance History</span>
        </button>

        <button
          type="button"
          onClick={onExportCsv}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors min-h-[44px] whitespace-nowrap"
        >
          <FileSpreadsheet className="w-4 h-4 text-[#16A34A]" />
          <span>Monthly Report CSV</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors min-h-[44px] whitespace-nowrap"
        >
          <Settings className="w-4 h-4 text-[#16A34A]" />
          <span>College Settings</span>
        </button>
      </div>
    </section>
  );
};
