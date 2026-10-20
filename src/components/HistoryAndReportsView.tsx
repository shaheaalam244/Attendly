import React from 'react';
import { Download, FileText, Printer, Trash2 } from 'lucide-react';
import {
  type MonthlySummaryMetrics,
  type StoredAttendanceRecord,
} from '../engine/attendanceEngine';
import {
  STATUS_VISUALS,
  formatDurationMinutes,
  formatTimeInTimezone,
} from '../theme/tokens';
import { type SemesterSummary } from '../store/useAttendlyStore';
import { EmptyState } from './StateViews';

interface HistoryAndReportsViewProps {
  records: StoredAttendanceRecord[];
  totalCount: number;
  filterStatus: string;
  filterMonth: string;
  monthlySummary: MonthlySummaryMetrics | null;
  semesterSummary: SemesterSummary | null;
  timezone: string;
  onFilterChange: (status: string, month: string) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onPrintPdf: () => void;
  onDeleteRecord: (date: string) => void;
}

const STATUS_FILTERS = [
  { id: 'ALL', label: 'All Records' },
  { id: 'PRESENT', label: 'Present' },
  { id: 'ABSENT', label: 'Absent' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'UNKNOWN', label: 'Unknown' },
];

const MONTH_FILTERS = [
  { id: 'ALL', label: 'All Months (Autumn 2026)' },
  { id: '2026-10', label: 'October 2026' },
  { id: '2026-09', label: 'September 2026' },
];

export const HistoryAndReportsView: React.FC<HistoryAndReportsViewProps> = ({
  records,
  totalCount,
  filterStatus,
  filterMonth,
  monthlySummary,
  semesterSummary,
  timezone,
  onFilterChange,
  onExportCsv,
  onExportJson,
  onPrintPdf,
  onDeleteRecord,
}) => {
  return (
    <div className="space-y-6">
      {/* Top Summary & Export Controls */}
      <div className="rounded-2xl bg-white border border-[#E2E8F0] p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
          <div>
            <span className="text-xs text-[#64748B]">
              Persisted Attendance Records &amp; Semester Analytics
            </span>
            <h2 className="text-xl font-bold text-[#0F172A] mt-0.5">
              Attendance History &amp; Official Reports
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Attendance % = Present eligible working days ÷ Total eligible working days × 100
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#166534] transition-colors min-h-[44px] whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV</span>
            </button>

            <button
              type="button"
              onClick={onPrintPdf}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors min-h-[44px] whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5 text-[#16A34A]" />
              <span>Export / Print PDF</span>
            </button>

            <button
              type="button"
              onClick={onExportJson}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#64748B] hover:text-[#0F172A] transition-colors min-h-[44px] whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>JSON Archive</span>
            </button>
          </div>
        </div>

        {/* Side-by-Side Monthly & Semester Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {monthlySummary && (
            <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#0F172A]">
                  Current Selected Month ({monthlySummary. year}-{String(monthlySummary.month).padStart(2, '0')})
                </span>
                <span className="text-xl font-bold font-mono tabular-nums text-[#16A34A]">
                  {monthlySummary.formattedPercentage}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B] tabular-nums">
                <span>Present: <strong className="text-[#0F172A]">{monthlySummary.presentDays}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Absent: <strong className="text-[#0F172A]">{monthlySummary.absentDays}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Eligible Working: <strong className="text-[#0F172A]">{monthlySummary.eligibleWorkingDays}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Holidays: <strong className="text-[#0F172A]">{monthlySummary.holidayDays}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Unknown: <strong className="text-[#0F172A]">{monthlySummary.unknownDays}</strong></span>
              </div>
            </div>
          )}

          {semesterSummary && (
            <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#0F172A]">
                  Semester Summary ({semesterSummary.semesterName})
                </span>
                <span className="text-xl font-bold font-mono tabular-nums text-[#166534]">
                  {semesterSummary.formattedPercentage}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B] tabular-nums">
                <span>Present: <strong className="text-[#0F172A]">{semesterSummary.presentDays}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Absent: <strong className="text-[#0F172A]">{semesterSummary.absentDays}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Eligible Working: <strong className="text-[#0F172A]">{semesterSummary.eligibleWorkingDays}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Holidays: <strong className="text-[#0F172A]">{semesterSummary.holidayDays}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Unknown: <strong className="text-[#0F172A]">{semesterSummary.unknownDays}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* Interactive Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 no-print">
          <div
            role="group"
            aria-label="Filter attendance by status"
            className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl"
          >
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onFilterChange(f.id, filterMonth)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[36px] ${
                  filterStatus === f.id
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="history-month-select" className="text-xs font-medium text-[#64748B]">
              Month:
            </label>
            <select
              id="history-month-select"
              value={filterMonth}
              onChange={(e) => onFilterChange(filterStatus, e.target.value)}
              className="h-10 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#0F172A]"
            >
              {MONTH_FILTERS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Chronological Attendance Table */}
      {records.length === 0 ? (
        <EmptyState
          title="No matching attendance records"
          description="No persisted attendance records match your active status or month filter."
          actionLabel="Reset Filters"
          onAction={() => onFilterChange('ALL', 'ALL')}
        />
      ) : (
        <div className="rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
            <span>Showing {records.length} of {totalCount} persisted records</span>
            <span className="font-mono">Sorted newest first</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-semibold text-[#64748B]">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">First Arrival</th>
                  <th className="py-3 px-4">Last Observation</th>
                  <th className="py-3 px-4 text-right">Verified Duration</th>
                  <th className="py-3 px-4">Verification Source</th>
                  <th className="py-3 px-4 text-right no-print">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-xs">
                {records.map((rec) => {
                  const visual = STATUS_VISUALS[rec.status] || STATUS_VISUALS.NOT_DETECTED;
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-[#0F172A] whitespace-nowrap">
                        {rec.attendanceDate}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`font-bold ${visual.textColor}`}>
                          {visual.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[#0F172A] whitespace-nowrap">
                        {formatTimeInTimezone(rec.firstConfirmedAt, timezone)}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[#64748B] whitespace-nowrap">
                        {formatTimeInTimezone(rec.lastConfirmedAt, timezone)}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold tabular-nums text-right text-[#0F172A] whitespace-nowrap">
                        {formatDurationMinutes(rec.verifiedDurationSeconds)}
                      </td>
                      <td className="py-3 px-4 text-[#64748B]">
                        <span>{rec.detectionMethod.replace(/_/g, ' ')}</span>
                        {rec.correctionStatus !== 'NONE' && (
                          <span> · Corrected</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right no-print">
                        <button
                          type="button"
                          onClick={() => onDeleteRecord(rec.attendanceDate)}
                          aria-label={`Delete attendance record for ${rec.attendanceDate}`}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
