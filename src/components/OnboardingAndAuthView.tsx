import React, { useState } from 'react';
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  MapPin,
  Navigation,
  ShieldCheck,
} from 'lucide-react';
import { AttendlyLogo } from './AttendlyLogo';
import { ATTENDLY_THEME } from '../theme/tokens';

interface OnboardingAndAuthViewProps {
  onboardingStep: number;
  onSetStep: (step: number) => void;
  onSkipToDemo: () => Promise<boolean>;
  onLogin: (email: string, password: string) => Promise<boolean>;
  onRegister: (payload: {
    name: string;
    email: string;
    password: string;
    studentId?: string;
    department?: string;
  }) => Promise<boolean>;
  authError: string | null;
  isLoading: boolean;
}

const ONBOARDING_SCREENS = [
  {
    step: 1,
    title: 'Set Your College Once',
    subtitle: 'Screen 1 of 4 — Campus Boundary Configuration',
    description:
      'Select your college campus location, working days, and geofence radius (150m default). Attendly keeps your campus coordinates private to your account.',
    icon: MapPin,
    highlights: [
      'Configurable campus pin & geofence radius (50m–1000m)',
      'Custom college working hours (9:00 AM – 5:00 PM default)',
      'Updating your campus never alters historical records',
    ],
  },
  {
    step: 2,
    title: 'Enable Automatic Tracking',
    subtitle: 'Screen 2 of 4 — Transparent Background Location Disclosure',
    description:
      'Before requesting location permissions, Attendly explains exactly how location is used: to detect when your phone enters and remains inside your configured college geofence during working hours.',
    icon: Navigation,
    highlights: [
      'Foreground permission requested first, then background geofencing',
      'Pause or resume tracking anytime with a single tap',
      'Truthful diagnostics if permissions or GPS are turned off',
    ],
  },
  {
    step: 3,
    title: 'Automatic 30-Minute Verification',
    subtitle: 'Screen 3 of 4 — Reliable Presence Evidence',
    description:
      'Passing by your college gate will not trigger false attendance. Attendly records PRESENT only after at least 30 minutes of verified presence inside your college geofence.',
    icon: ShieldCheck,
    highlights: [
      'Minimum 30 minutes of qualifying presence evidence required',
      'Excludes unverified 30-minute timestamp gaps & inaccurate GPS drift',
      'Queues events offline in SQLite/local storage and syncs idempotently',
    ],
  },
  {
    step: 4,
    title: 'Review Your Attendance & Reports',
    subtitle: 'Screen 4 of 4 — Calendar, Holidays & Percentage Math',
    description:
      'Track your monthly calendar, chronological history, and semester percentage. Holidays, non-working days, future dates, and unknown dates are never counted as absent.',
    icon: CalendarCheck,
    highlights: [
      'Formula: Present eligible working days ÷ Total eligible working days × 100',
      'One-click CSV and printable PDF attendance reports',
      'Audited manual correction requests for battery or permission issues',
    ],
  },
];

export const OnboardingAndAuthView: React.FC<OnboardingAndAuthViewProps> = ({
  onboardingStep,
  onSetStep,
  onSkipToDemo,
  onLogin,
  onRegister,
  authError,
  isLoading,
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('aarav.sharma@iitb.ac.in');
  const [password, setPassword] = useState('Attendly@2026');
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [department, setDepartment] = useState('');
  const [forgotStatus, setForgotStatus] = useState<string | null>(null);

  const currentSlide = ONBOARDING_SCREENS[onboardingStep] || ONBOARDING_SCREENS[0];
  const SlideIcon = currentSlide.icon;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotStatus(null);

    if (authMode === 'login') {
      await onLogin(email, password);
    } else if (authMode === 'register') {
      await onRegister({ name, email, password, studentId, department });
    } else {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      setForgotStatus(
        json.data?.message ||
          json.error?.message ||
          'Password reset status returned from server.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between p-4 sm:p-8">
      {/* Top Splash & Brand Bar */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-2">
        <AttendlyLogo size="md" />
        <button
          type="button"
          onClick={() => void onSkipToDemo()}
          className="text-xs font-semibold text-[#166534] hover:underline whitespace-nowrap shrink-0 min-h-[40px] px-2"
        >
          Skip Onboarding → Open Student Dashboard
        </button>
      </header>

      {/* Main Split Container */}
      <main className="max-w-6xl w-full mx-auto my-auto py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left 7 Columns: 4-Step Interactive Onboarding */}
        <section
          aria-labelledby="onboarding-slide-title"
          className="lg:col-span-7 rounded-2xl bg-white border border-[#E2E8F0] p-6 sm:p-8 flex flex-col justify-between space-y-6"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-[#64748B]">
              <span className="font-semibold text-[#166534]">
                {ATTENDLY_THEME.brand.shortTagline}
              </span>
              <span className="font-mono">Step {onboardingStep + 1} / 4</span>
            </div>

            <div className="w-12 h-12 rounded-2xl bg-[#16A34A]/10 text-[#16A34A] flex items-center justify-center">
              <SlideIcon className="w-6 h-6" />
            </div>

            <div>
              <p className="text-xs font-medium text-[#64748B]">
                {currentSlide.subtitle}
              </p>
              <h1
                id="onboarding-slide-title"
                className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight mt-1"
              >
                {currentSlide.title}
              </h1>
              <p className="text-sm text-[#64748B] mt-2 leading-relaxed">
                {currentSlide.description}
              </p>
            </div>

            <ul className="space-y-2.5 pt-2">
              {currentSlide.highlights.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 text-xs sm:text-sm text-[#0F172A]"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Step Indicators & Navigation */}
          <div className="pt-6 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {[0, 1, 2, 3].map((idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSetStep(idx)}
                  aria-label={`Go to onboarding step ${idx + 1}`}
                  className={`h-2.5 rounded-full transition-all ${
                    onboardingStep === idx
                      ? 'w-8 bg-[#16A34A]'
                      : 'w-2.5 bg-slate-200 hover:bg-slate-300'
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2.5">
              {onboardingStep > 0 && (
                <button
                  type="button"
                  onClick={() => onSetStep(onboardingStep - 1)}
                  className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors min-h-[44px]"
                >
                  Previous
                </button>
              )}

              {onboardingStep < 3 ? (
                <button
                  type="button"
                  onClick={() => onSetStep(onboardingStep + 1)}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#0F172A] text-xs font-semibold text-white hover:bg-slate-800 transition-colors min-h-[44px]"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void onSkipToDemo()}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#16A34A] text-xs font-semibold text-white hover:bg-[#166534] transition-colors min-h-[44px]"
                >
                  <span>Launch Attendly Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Right 5 Columns: Student Sign-In / Registration Card */}
        <section
          aria-labelledby="auth-card-heading"
          className="lg:col-span-5 rounded-2xl bg-white border border-[#E2E8F0] p-6 sm:p-8 flex flex-col justify-between space-y-5"
        >
          <div className="space-y-4">
            <div>
              <span className="text-xs font-semibold text-[#16A34A]">
                {ATTENDLY_THEME.brand.primaryTagline}
              </span>
              <h2
                id="auth-card-heading"
                className="text-xl font-bold text-[#0F172A] mt-0.5"
              >
                {authMode === 'login'
                  ? 'Sign In to Attendly'
                  : authMode === 'register'
                    ? 'Create Student Account'
                    : 'Reset Password'}
              </h2>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setForgotStatus(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-colors min-h-[38px] ${
                  authMode === 'login'
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setForgotStatus(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-colors min-h-[38px] ${
                  authMode === 'register'
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                New Student
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-3.5">
              {authMode === 'register' && (
                <>
                  <div>
                    <label
                      htmlFor="auth-name"
                      className="block text-xs font-semibold text-[#0F172A] mb-1"
                    >
                      Full Name
                    </label>
                    <input
                      id="auth-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Priya Nair"
                      className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs text-[#0F172A]"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label
                        htmlFor="auth-roll"
                        className="block text-xs font-semibold text-[#0F172A] mb-1"
                      >
                        Roll / Student ID
                      </label>
                      <input
                        id="auth-roll"
                        type="text"
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                        placeholder="23B1042"
                        className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs font-mono text-[#0F172A]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="auth-dept"
                        className="block text-xs font-semibold text-[#0F172A] mb-1"
                      >
                        Department
                      </label>
                      <input
                        id="auth-dept"
                        type="text"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        placeholder="CSE"
                        className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs text-[#0F172A]"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-semibold text-[#0F172A] mb-1"
                >
                  College Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs text-[#0F172A]"
                  required
                />
              </div>

              {authMode !== 'forgot' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="auth-password"
                      className="text-xs font-semibold text-[#0F172A]"
                    >
                      Password
                    </label>
                    {authMode === 'login' && (
                      <button
                        type="button"
                        onClick={() => setAuthMode('forgot')}
                        className="text-[11px] font-medium text-[#166534] hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-10 rounded-xl border border-[#E2E8F0] px-3 text-xs text-[#0F172A]"
                    required
                  />
                </div>
              )}

              {authError && (
                <p role="alert" className="text-xs text-[#DC2626] font-medium">
                  {authError}
                </p>
              )}

              {forgotStatus && (
                <p role="status" className="text-xs text-[#D97706] bg-amber-50 border border-amber-200 rounded-xl p-3">
                  {forgotStatus}
                </p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-[#16A34A] py-3 text-xs font-semibold text-white hover:bg-[#166534] transition-colors min-h-[44px]"
              >
                {isLoading
                  ? 'Authenticating...'
                  : authMode === 'login'
                    ? 'Sign In to Attendly'
                    : authMode === 'register'
                      ? 'Create Account & Continue'
                      : 'Request Password Reset'}
              </button>
            </form>
          </div>

          <div className="pt-4 border-t border-[#E2E8F0] space-y-2">
            <button
              type="button"
              onClick={() => void onSkipToDemo()}
              className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] py-2.5 px-4 text-xs font-semibold text-[#0F172A] hover:bg-slate-100 transition-colors min-h-[44px]"
            >
              Continue as Demo Student (Aarav Sharma · IIT Bombay)
            </button>
            <p className="text-[11px] text-[#64748B] text-center">
              {ATTENDLY_THEME.brand.disclaimer}
            </p>
          </div>
        </section>
      </main>

      <footer className="max-w-6xl w-full mx-auto text-center text-xs text-[#64748B] py-2">
        Attendly — Automatic College Attendance Tracker · Personal Student Attendance Assistant
      </footer>
    </div>
  );
};
