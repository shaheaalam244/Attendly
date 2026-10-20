import React from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';

export const LoadingState: React.FC<{ label?: string }> = ({
  label = 'Loading attendance records...',
}) => (
  <div
    role="status"
    aria-live="polite"
    className="rounded-2xl bg-white border border-[#E2E8F0] p-6 space-y-4"
  >
    <div className="flex items-center justify-between">
      <div className="h-5 w-44 rounded bg-slate-100 animate-pulse" />
      <div className="h-4 w-24 rounded bg-slate-100 animate-pulse" />
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
      <div className="h-20 rounded-xl bg-slate-50 animate-pulse" />
      <div className="h-20 rounded-xl bg-slate-50 animate-pulse" />
      <div className="h-20 rounded-xl bg-slate-50 animate-pulse" />
      <div className="h-20 rounded-xl bg-slate-50 animate-pulse" />
    </div>
    <p className="text-xs text-[#64748B]">{label}</p>
  </div>
);

export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, description, actionLabel, onAction }) => (
  <div className="rounded-2xl bg-white border border-[#E2E8F0] p-8 text-center">
    <div className="w-10 h-10 rounded-xl bg-slate-100 text-[#64748B] flex items-center justify-center mx-auto mb-3">
      <Inbox className="w-5 h-5" />
    </div>
    <h3 className="text-base font-bold text-[#0F172A]">{title}</h3>
    <p className="mt-1 text-sm text-[#64748B] max-w-md mx-auto leading-relaxed">
      {description}
    </p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-4 inline-flex items-center justify-center rounded-xl bg-[#16A34A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#166534] transition-colors min-h-[44px]"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export const ErrorState: React.FC<{
  message: string;
  onRetry?: () => void;
}> = ({ message, onRetry }) => (
  <div
    role="alert"
    className="rounded-2xl bg-red-50/70 border border-red-200 p-4 flex flex-wrap items-center justify-between gap-4"
  >
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
      <div>
        <h4 className="text-sm font-semibold text-[#0F172A]">Synchronization Notice</h4>
        <p className="text-xs text-[#64748B] mt-0.5">{message}</p>
      </div>
    </div>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-red-200 px-3.5 py-2 text-xs font-semibold text-[#0F172A] hover:bg-red-50 transition-colors min-h-[40px]"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Retry</span>
      </button>
    )}
  </div>
);
